import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, HostListener, computed, forwardRef,
  inject, input, signal, viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { LocaleService } from '../../../core/i18n/locale.service';
import {
  FREQUENT_COUNTRY_CODES, PHONE_COUNTRIES, PhoneCountry, countryForLocale, findCountry, splitPhoneNumber,
} from './phone-countries';

interface CountryOption { country: PhoneCountry; name: string; }

const PANEL_HEIGHT = 280;
const PANEL_WIDTH = 260;
const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Phone field: the country (flag + calling code, picked from a searchable
 * list; default = the organisation's country) and the number. The value stays
 * one string, "+48 600 000 000", so the API and the mobile app read it as
 * before. Typing or pasting a full "+49 …" number switches the country by
 * itself. A number loaded without a prefix is not rewritten unless edited.
 */
@Component({
  selector: 'wt-phone-input',
  standalone: true,
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PhoneInputComponent), multi: true }],
  template: `
    <button #trigger type="button" class="cc" [class.fi-err]="invalid()" [class.open]="isOpen()" [disabled]="isDisabled()"
            aria-haspopup="listbox" [attr.aria-expanded]="isOpen()" [attr.aria-label]="'phoneInput.countryCode' | transloco"
            [title]="countryName(country())" (click)="toggle()">
      <img class="flag" [src]="flagUrl(country())" alt="" width="20" height="15">
      <span class="dial">+{{ country().dial }}</span>
      <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <input class="num" type="tel" inputmode="tel" autocomplete="tel-national" [class.fi-err]="invalid()"
           [value]="number()" [placeholder]="country().example" [disabled]="isDisabled()"
           (input)="typeNumber($any($event.target).value)" (blur)="onTouched()">
    @if (isOpen()) {
      <div class="panel" [style.top.px]="panelTop()" [style.left.px]="panelLeft()">
        <input #search class="search" type="search" [value]="query()" [placeholder]="'phoneInput.search' | transloco"
               [attr.aria-label]="'phoneInput.search' | transloco"
               (input)="query.set($any($event.target).value); activeIndex.set(0)" (keydown)="onSearchKey($event)">
        <ul #list class="list" role="listbox">
          @for (option of options(); track option.country.iso; let i = $index) {
            @if (i === dividerIndex()) { <li class="divider" role="separator"></li> }
            <li role="option" class="option" [class.active]="i === activeIndex()" [class.selected]="option.country.iso === country().iso"
                [attr.aria-selected]="option.country.iso === country().iso"
                (mousedown)="$event.preventDefault()" (mouseenter)="activeIndex.set(i)" (click)="pick(option.country)">
              <img class="flag" [src]="flagUrl(option.country)" alt="" width="20" height="15" loading="lazy">
              <span class="name">{{ option.name }}</span>
              <span class="code">+{{ option.country.dial }}</span>
            </li>
          } @empty {
            <li class="empty">{{ 'phoneInput.noResults' | transloco }}</li>
          }
        </ul>
      </div>
    }
  `,
  styles: [`
    :host { display:flex; gap:8px; width:100%; min-width:0; position:relative; }
    .cc { flex:0 0 auto; display:inline-flex; align-items:center; gap:6px; height:38px; box-sizing:border-box; padding:0 10px;
          border:1.5px solid var(--gray-200); border-radius:10px; background:var(--surface); cursor:pointer; font:inherit; font-size:14px;
          font-weight:500; color:var(--gray-800); box-shadow:var(--shadow-field); transition:border-color .15s, box-shadow .15s; }
    .cc:hover:not(:disabled), .cc.open { border-color:var(--orange); }
    .cc.open { box-shadow:var(--shadow-field), var(--ring-field); }
    .cc:disabled { background:var(--gray-50); cursor:default; opacity:.7; }
    .cc.fi-err { border-color:#DC2626; }
    .flag { width:20px; height:15px; border-radius:3px; object-fit:cover; box-shadow:0 0 0 1px rgba(0,0,0,.08); flex-shrink:0; }
    .dial { font-variant-numeric:tabular-nums; }
    .chev { width:14px; height:14px; fill:none; stroke:var(--gray-500); stroke-width:2.4; stroke-linecap:round; stroke-linejoin:round; }
    .num { flex:1; min-width:0; height:38px; box-sizing:border-box; padding:8px 12px; border:1.5px solid var(--gray-200); border-radius:10px;
           font-size:14px; font-family:inherit; color:var(--gray-800); background:var(--surface); outline:none; transition:border-color .15s, box-shadow .15s; }
    .num:focus { border-color:var(--orange); }
    .num:disabled { background:var(--gray-50); color:var(--gray-400); }
    .panel { position:fixed; z-index:3000; width:${PANEL_WIDTH}px; max-height:${PANEL_HEIGHT}px; display:flex; flex-direction:column;
             background:var(--surface); border:1px solid var(--gray-200); border-radius:12px; box-shadow:var(--shadow-lg); overflow:hidden; }
    .search { margin:8px; width:auto !important; flex-shrink:0; }
    .list { list-style:none; margin:0; padding:0 4px 4px; overflow-y:auto; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:var(--gray-300) transparent; }
    .option { display:flex; align-items:center; gap:10px; padding:8px; border-radius:8px; cursor:pointer; font-size:14px; color:var(--gray-800); }
    .option.active { background:var(--gray-100); }
    .option.selected { background:var(--orange-pale); color:var(--orange-dark); font-weight:500; }
    .name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .code { color:var(--gray-500); font-size:12px; font-variant-numeric:tabular-nums; }
    .divider { height:1px; background:var(--gray-200); margin:4px 8px; }
    .empty { padding:12px; text-align:center; font-size:12px; color:var(--gray-500); }
  `],
})
export class PhoneInputComponent implements ControlValueAccessor {
  readonly invalid = input(false);

  private readonly transloco = inject(TranslocoService);
  private readonly locale = inject(LocaleService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly defaultCountry = countryForLocale(inject(AuthService).user()?.tenant_default_locale);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly searchField = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly listElement = viewChild<ElementRef<HTMLUListElement>>('list');

  readonly country = signal<PhoneCountry>(this.defaultCountry);
  readonly number = signal('');
  readonly isDisabled = signal(false);
  readonly isOpen = signal(false);
  readonly query = signal('');
  readonly activeIndex = signal(0);
  readonly panelTop = signal(0);
  readonly panelLeft = signal(0);

  private readonly sortedOptions = computed<CountryOption[]>(() => {
    const locale = this.locale.activeLocale();
    return PHONE_COUNTRIES
      .map(country => ({ country, name: this.countryName(country) }))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  });

  // Without a search: the organisation's country and the frequent ones on top, then everything A–Z.
  private readonly preferredOptions = computed<CountryOption[]>(() => {
    const codes = [this.defaultCountry.iso, ...FREQUENT_COUNTRY_CODES.filter(code => code !== this.defaultCountry.iso)];
    return codes.map(code => findCountry(code)).filter((c): c is PhoneCountry => !!c)
      .map(country => ({ country, name: this.countryName(country) }));
  });

  readonly options = computed<CountryOption[]>(() => {
    const query = normalize(this.query().trim());
    if (!query) return [...this.preferredOptions(), ...this.sortedOptions()];
    const digits = query.replace(/^\+/, '');
    const isCodeSearch = /^\d+$/.test(digits);
    return this.sortedOptions().filter(({ country, name }) => isCodeSearch
      ? country.dial.startsWith(digits)
      : normalize(name).includes(query) || country.iso.toLowerCase() === query);
  });

  readonly dividerIndex = computed(() => this.query().trim() ? -1 : this.preferredOptions().length);

  private onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  constructor() {
    const doc = inject(DOCUMENT);
    const reposition = () => this.isOpen() && this.positionPanel();
    doc.addEventListener('scroll', reposition, true);
    inject(DestroyRef).onDestroy(() => doc.removeEventListener('scroll', reposition, true));
  }

  countryName(country: PhoneCountry): string {
    return this.transloco.translate(`phoneInput.countries.${country.iso}`);
  }

  flagUrl(country: PhoneCountry): string {
    return `/assets/flags/${country.iso.toLowerCase()}.svg`;
  }

  writeValue(value: string | null): void {
    const { country, number } = splitPhoneNumber(value, this.defaultCountry);
    this.country.set(country);
    this.number.set(number);
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.isDisabled.set(isDisabled); this.cdr.markForCheck(); }

  toggle(): void {
    if (this.isOpen()) { this.close(); return; }
    this.query.set('');
    this.positionPanel();
    this.isOpen.set(true);
    const selected = this.options().findIndex(o => o.country.iso === this.country().iso);
    this.activeIndex.set(Math.max(0, selected));
    requestAnimationFrame(() => { this.searchField()?.nativeElement.focus(); this.scrollActiveIntoView(); });
  }

  pick(country: PhoneCountry): void {
    this.country.set(country);
    this.close();
    this.trigger()?.nativeElement.focus();
    this.emit();
  }

  onSearchKey(event: KeyboardEvent): void {
    const count = this.options().length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!count) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.activeIndex.set((this.activeIndex() + step + count) % count);
      requestAnimationFrame(() => this.scrollActiveIntoView());
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = this.options()[this.activeIndex()];
      if (option) this.pick(option.country);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      this.trigger()?.nativeElement.focus();
    }
  }

  typeNumber(text: string): void {
    if (text.trim().startsWith('+')) {
      const { country, number } = splitPhoneNumber(text, this.country(), this.country());
      this.country.set(country);
      this.number.set(number);
    } else {
      this.number.set(text);
    }
    this.emit();
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    if (this.isOpen() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  @HostListener('window:resize')
  onResize(): void { if (this.isOpen()) this.close(); }

  private close(): void {
    this.isOpen.set(false);
    this.cdr.markForCheck();
  }

  // The list hangs under the button (or above it near the bottom of the window); fixed, so a modal's scroll area cannot clip it.
  private positionPanel(): void {
    const rect = this.trigger()?.nativeElement.getBoundingClientRect();
    if (!rect) return;
    const fitsBelow = window.innerHeight - rect.bottom >= PANEL_HEIGHT + 8;
    this.panelTop.set(fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - PANEL_HEIGHT - 4));
    this.panelLeft.set(Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8));
    this.cdr.markForCheck();
  }

  private scrollActiveIntoView(): void {
    this.listElement()?.nativeElement.querySelector('.option.active')?.scrollIntoView({ block: 'nearest' });
  }

  private emit(): void {
    const number = this.number().trim();
    this.onChange(number ? `+${this.country().dial} ${number}` : '');
  }
}
