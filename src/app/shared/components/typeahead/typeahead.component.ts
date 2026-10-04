import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, inject, input, output, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, Subject, of } from 'rxjs';
import { catchError, debounceTime, switchMap, tap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export interface TypeaheadOption<T = unknown> {
  id: string;
  label: string;
  /** Secondary text shown next to the label, e.g. an email or the record kind. */
  hint?: string;
  value: T;
}

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Single text field that suggests matches once enough characters are typed;
 * every further character narrows the list. The parent supplies the search
 * and receives the picked option.
 */
@Component({
  selector: 'wt-typeahead',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input class="fi" type="text" autocomplete="off" [placeholder]="placeholder()" [ngModel]="text()"
           (ngModelChange)="onTextChange($event)" (focus)="isOpen.set(true)" (keydown.escape)="isOpen.set(false)">
    @if (isOpen() && text().trim().length > 0) {
      <div class="menu">
        @if (text().trim().length < minChars()) {
          <div class="note">Wpisz co najmniej {{ minChars() }} znaki…</div>
        } @else if (isSearching()) {
          <div class="note">Szukam…</div>
        } @else {
          @for (option of options(); track option.id) {
            <button type="button" class="option" (click)="pick(option)">
              <span class="label">{{ option.label }}</span>
              @if (option.hint) { <span class="hint">{{ option.hint }}</span> }
            </button>
          } @empty {
            <div class="note">Brak wyników.</div>
          }
        }
      </div>
    }
  `,
  styles: [`
    :host { position:relative; display:block; }
    .menu { position:absolute; top:calc(100% + 4px); left:0; right:0; z-index:300; max-height:260px; overflow-y:auto; background:white; border:1px solid #e5e7eb; border-radius:9px; box-shadow:0 8px 24px rgba(0,0,0,.12); padding:4px; }
    .option { width:100%; display:flex; align-items:baseline; gap:10px; text-align:left; padding:7px 10px; border:none; background:none; border-radius:6px; cursor:pointer; font-family:inherit; }
    .option:hover { background:#f3f4f6; }
    .label { font-size:13px; color:#111827; font-weight:600; }
    .hint { font-size:11.5px; color:#6b7280; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .note { padding:8px 10px; font-size:12.5px; color:#9ca3af; }
  `],
})
export class TypeaheadComponent<T = unknown> {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly search = input.required<(term: string) => Observable<TypeaheadOption<T>[]>>();
  readonly placeholder = input('');
  readonly minChars = input(3);
  readonly picked = output<TypeaheadOption<T>>();

  readonly text = signal('');
  readonly options = signal<TypeaheadOption<T>[]>([]);
  readonly isOpen = signal(false);
  readonly isSearching = signal(false);

  private readonly terms = new Subject<string>();

  constructor() {
    this.terms.pipe(
      tap(() => this.isSearching.set(true)),
      debounceTime(SEARCH_DEBOUNCE_MS),
      // switchMap drops the answer to an outdated term when the user keeps typing.
      switchMap(term => this.search()(term).pipe(catchError(() => of([])))),
      takeUntilDestroyed(inject(DestroyRef)),
    ).subscribe(options => {
      this.options.set(options);
      this.isSearching.set(false);
    });
  }

  onTextChange(text: string): void {
    this.text.set(text);
    this.isOpen.set(true);
    const term = text.trim();
    if (term.length >= this.minChars()) this.terms.next(term);
    else this.options.set([]);
  }

  pick(option: TypeaheadOption<T>): void {
    this.text.set(option.label);
    this.isOpen.set(false);
    this.picked.emit(option);
  }

  /** Empties the field, e.g. after the picked option was consumed. */
  clear(): void {
    this.text.set('');
    this.options.set([]);
    this.isOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.isOpen.set(false);
  }
}
