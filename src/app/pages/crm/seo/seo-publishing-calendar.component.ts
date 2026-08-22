import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, transferArrayItem } from '@angular/cdk/drag-drop';
import { CrmSeoService, SeoCalendarConfig, SeoCalendarArticle, SeoCalendarWeek, SeoAuthor } from '../../../core/services/crm-seo.service';
import { ToastService } from '../../../core/services/toast.service';
import { mondayOf, addDays, toDateStr } from '../../../shared/utils/iso-week.util';

const WEEKDAY_FIELDS = ['monday_count', 'tuesday_count', 'wednesday_count', 'thursday_count', 'friday_count', 'saturday_count', 'sunday_count'] as const;
const WEEKDAY_LABELS = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];

const EMPTY_CONFIG: SeoCalendarConfig = {
  is_enabled: false, monday_count: 0, tuesday_count: 0, wednesday_count: 0,
  thursday_count: 0, friday_count: 0, saturday_count: 0, sunday_count: 0, end_date: null,
};

@Component({
  selector: 'wt-seo-publishing-calendar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DragDropModule],
  template: `
    <div class="calendar-box">
      <div class="config-panel">
        <div class="config-header">
          <h3>Harmonogram automatyczny</h3>
          <label class="enable-toggle">
            <input type="checkbox" [checked]="config().is_enabled" (change)="toggleEnabled()" [disabled]="savingConfig()">
            Tryb automatyczny (bez ręcznego review)
          </label>
        </div>
        @if (config().is_enabled) {
          <p class="warning-note">Artykuły w tym trybie publikują się automatycznie o wyznaczonej dacie — bez ręcznej akceptacji redaktora.</p>
        }
        <div class="weekday-grid">
          @for (field of weekdayFields; track field; let i = $index) {
            <div class="weekday-cell">
              <label class="field-label">{{ weekdayLabels[i] }}</label>
              <input type="number" min="0" class="field-input count-input" [ngModel]="config()[field]" (ngModelChange)="setCount(field, $event)">
            </div>
          }
        </div>
        <div class="end-date-row">
          <label class="end-date-checkbox">
            <input type="checkbox" [(ngModel)]="noEndDate">
            Bez limitu czasu (harmonogram rolluje się w nieskończoność)
          </label>
          @if (!noEndDate) {
            <input type="date" class="field-input end-date-input" [(ngModel)]="endDateInput">
          }
        </div>
        <button type="button" class="btn-ghost btn-sm" (click)="saveConfig()" [disabled]="savingConfig()">
          @if (savingConfig()) { Zapisuję… } @else { Zapisz harmonogram }
        </button>
      </div>

      <div class="calendar-grid">
        <div class="week-column">
          <h4 class="week-title">Ten tydzień (w toku, zablokowany) @if (currentWeek()) { — {{ currentWeek()!.week_start }} }</h4>
          <div class="days-row">
            @for (day of currentWeek()?.days ?? []; track day.date) {
              <div class="day-card locked">
                <div class="day-label">{{ day.date }}</div>
                @for (a of day.articles; track a.id) {
                  <div class="article-chip">
                    <span class="article-title">{{ a.title }}</span>
                    <span class="article-author">{{ authorName(a.author_id) }}</span>
                  </div>
                }
              </div>
            }
          </div>
        </div>

        <div class="week-column">
          <h4 class="week-title">Następny tydzień (edytowalny) @if (nextWeek()) { — {{ nextWeek()!.week_start }} }</h4>
          <div class="days-row">
            @for (day of nextWeek()?.days ?? []; track day.date) {
              <div class="day-card"
                   cdkDropList
                   [cdkDropListData]="day.articles"
                   [cdkDropListConnectedTo]="dropListIds"
                   [id]="'day-' + day.date"
                   (cdkDropListDropped)="drop($event, day.date)">
                <div class="day-label">{{ day.date }}</div>
                @for (a of day.articles; track a.id) {
                  <div class="article-chip" cdkDrag>
                    <span class="article-title">{{ a.title }}</span>
                    <span class="article-author">{{ authorName(a.author_id) }}</span>
                  </div>
                }
              </div>
            }
          </div>
        </div>

        <div class="unassigned-column">
          <h4 class="week-title">Nieprzypisane ({{ unassigned().length }})</h4>
          <div class="day-card unassigned-card"
               cdkDropList
               [cdkDropListData]="unassigned()"
               [cdkDropListConnectedTo]="dropListIds"
               id="unassigned"
               (cdkDropListDropped)="drop($event, null)">
            @for (a of unassigned(); track a.id) {
              <div class="article-chip" cdkDrag>
                <span class="article-title">{{ a.title }}</span>
                <span class="article-author">{{ authorName(a.author_id) }}</span>
              </div>
            }
            @if (unassigned().length === 0) { <p class="empty">Brak nieprzypisanych artykułów.</p> }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .calendar-box { display: flex; flex-direction: column; gap: 1rem; }
    .config-panel { border: 1px solid var(--gray-200); border-radius: var(--radius); padding: 1rem 1.1rem; background: #fff; }
    .config-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
    .config-header h3 { font-size: 0.95rem; margin: 0; }
    .enable-toggle { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; font-weight: 600; color: var(--gray-700); cursor: pointer; }
    .warning-note { font-size: 0.78rem; color: #92400E; background: #FEF3C7; border-radius: 8px; padding: 0.5rem 0.7rem; margin: 0.6rem 0 0; }
    .weekday-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.5rem; margin-top: 0.9rem; }
    .weekday-cell .field-label { display: block; font-size: 0.72rem; font-weight: 600; color: var(--gray-700); margin-bottom: 0.25rem; text-align: center; }
    .count-input { width: 100%; text-align: center; }
    .field-input { border: 1px solid var(--gray-200); border-radius: 8px; padding: 0.45rem 0.5rem; font-family: inherit; font-size: 0.85rem; }
    .end-date-row { display: flex; align-items: center; gap: 0.7rem; margin-top: 0.85rem; flex-wrap: wrap; }
    .end-date-checkbox { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--gray-700); cursor: pointer; }
    .btn-ghost { border: none; border-radius: 8px; font-weight: 600; cursor: pointer; background: var(--gray-100); color: var(--gray-800); }
    .btn-sm { padding: 0.5rem 0.9rem; font-size: 0.82rem; margin-top: 0.9rem; }

    .calendar-grid { display: grid; grid-template-columns: 2fr 2fr 1fr; gap: 1rem; align-items: start; }
    .week-title { font-size: 0.82rem; font-weight: 700; color: var(--gray-700); margin: 0 0 0.5rem; }
    .days-row { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.4rem; }
    .day-card {
      border: 1px dashed var(--gray-200); border-radius: 8px; padding: 0.4rem; min-height: 140px;
      background: var(--gray-50); display: flex; flex-direction: column; gap: 0.35rem;
    }
    .day-card.locked { background: var(--gray-100); opacity: 0.75; }
    .day-label { font-size: 0.68rem; font-weight: 700; color: var(--gray-500); text-align: center; }
    .article-chip {
      border: 1px solid var(--gray-200); border-radius: 6px; background: #fff; padding: 0.35rem 0.45rem;
      display: flex; flex-direction: column; gap: 0.15rem; cursor: grab; font-size: 0.72rem;
    }
    .day-card.locked .article-chip { cursor: default; }
    .article-title { font-weight: 600; color: var(--gray-900); }
    .article-author { color: var(--gray-500); font-size: 0.68rem; }
    .unassigned-column .day-card { min-height: 280px; }
    .unassigned-card { grid-column: unset; }
    .empty { color: var(--gray-500); font-size: 0.76rem; text-align: center; margin: 1rem 0 0; }
    .cdk-drag-preview { box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,.15)); }
    .cdk-drop-list-dragging .article-chip:not(.cdk-drag-placeholder) { transition: transform 200ms ease; }
  `],
})
export class SeoPublishingCalendarComponent implements OnInit {
  private seoService = inject(CrmSeoService);
  private toast = inject(ToastService);

  readonly weekdayFields = WEEKDAY_FIELDS;
  readonly weekdayLabels = WEEKDAY_LABELS;

  readonly config = signal<SeoCalendarConfig>(EMPTY_CONFIG);
  readonly savingConfig = signal(false);
  noEndDate = true;
  endDateInput = '';

  readonly currentWeek = signal<SeoCalendarWeek | null>(null);
  readonly nextWeek = signal<SeoCalendarWeek | null>(null);
  readonly unassigned = signal<SeoCalendarArticle[]>([]);
  readonly authors = signal<SeoAuthor[]>([]);

  // Connects every editable drop zone (7 next-week days + the unassigned
  // queue) to every other one — this week's days are deliberately excluded,
  // that's the actual lock mechanism for the UI side (the backend enforces
  // it independently in PATCH /calendar/content/:id/assign).
  dropListIds: string[] = [];

  ngOnInit(): void {
    this.loadConfig();
    this.loadWeeks();
    this.seoService.authors().subscribe((a) => this.authors.set(a));
  }

  private loadConfig(): void {
    this.seoService.calendarConfig().subscribe((c) => {
      this.config.set(c);
      this.noEndDate = !c.end_date;
      this.endDateInput = c.end_date ?? '';
    });
  }

  private loadWeeks(): void {
    const monday = mondayOf(new Date());
    const nextMonday = addDays(monday, 7);
    this.seoService.calendarWeek(toDateStr(monday)).subscribe((w) => this.currentWeek.set(w));
    this.seoService.calendarWeek(toDateStr(nextMonday)).subscribe((w) => {
      this.nextWeek.set(w);
      this.dropListIds = ['unassigned', ...w.days.map((d) => 'day-' + d.date)];
    });
    this.seoService.calendarUnassigned().subscribe((u) => this.unassigned.set(u));
  }

  authorName(id: number | null): string {
    if (!id) return '—';
    return this.authors().find((a) => a.id === id)?.full_name ?? '—';
  }

  toggleEnabled(): void {
    const next = !this.config().is_enabled;
    if (next && !confirm('Tryb automatyczny publikuje artykuły bez ręcznej akceptacji redaktora — kontynuować?')) return;
    this.savingConfig.set(true);
    this.seoService.updateCalendarConfig({ is_enabled: next }).subscribe({
      next: (c) => {
        this.config.set(c);
        this.savingConfig.set(false);
        this.toast.success(next ? 'Tryb automatyczny włączony.' : 'Tryb automatyczny wyłączony.');
      },
      error: (err) => {
        this.savingConfig.set(false);
        this.toast.error(err?.error?.error ?? 'Nie udało się zapisać.');
      },
    });
  }

  setCount(field: (typeof WEEKDAY_FIELDS)[number], value: number): void {
    this.config.update((c) => ({ ...c, [field]: Math.max(0, value | 0) }));
  }

  saveConfig(): void {
    this.savingConfig.set(true);
    const patch: Partial<SeoCalendarConfig> = { end_date: this.noEndDate ? null : (this.endDateInput || null) };
    for (const f of WEEKDAY_FIELDS) patch[f] = this.config()[f];
    this.seoService.updateCalendarConfig(patch).subscribe({
      next: (c) => {
        this.config.set(c);
        this.savingConfig.set(false);
        this.toast.success('Harmonogram zapisany.');
      },
      error: (err) => {
        this.savingConfig.set(false);
        this.toast.error(err?.error?.error ?? 'Nie udało się zapisać harmonogramu.');
      },
    });
  }

  drop(event: CdkDragDrop<SeoCalendarArticle[]>, targetDate: string | null): void {
    if (event.previousContainer === event.container) return;
    const previousContainer = event.previousContainer;
    const previousIndex = event.previousIndex;
    const currentIndex = event.currentIndex;
    const article = previousContainer.data[previousIndex];
    transferArrayItem(previousContainer.data, event.container.data, previousIndex, currentIndex);
    this.seoService.assignToCalendarDay(article.id, targetDate).subscribe({
      next: (updated) => {
        // The backend may have just round-robin-assigned an author — reflect
        // that on the moved chip immediately instead of waiting for a reload.
        article.author_id = updated.author_id;
        this.toast.success(targetDate ? `Przeniesiono na ${targetDate}.` : 'Cofnięto do kolejki nieprzypisanych.');
      },
      error: (err) => {
        this.toast.error(err?.error?.error ?? 'Nie udało się przenieść artykułu.');
        transferArrayItem(event.container.data, previousContainer.data, currentIndex, previousIndex);
      },
    });
  }
}
