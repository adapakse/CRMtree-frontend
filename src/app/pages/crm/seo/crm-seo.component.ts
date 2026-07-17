import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CrmSeoService, SeoContentSummary, SeoContent, SeoContentStatus, GscStatus, SeoPillar } from '../../../core/services/crm-seo.service';
import { ToastService } from '../../../core/services/toast.service';
import { SeoStrategyPanelComponent } from './seo-strategy-panel.component';

const STATUS_LABELS: Record<SeoContentStatus, string> = {
  draft: 'Szkic',
  in_review: 'Do akceptacji',
  approved: 'Zaakceptowane',
  scheduled: 'Zaplanowane',
  published: 'Opublikowane',
  needs_update: 'Do odświeżenia',
  archived: 'Zarchiwizowane',
};

@Component({
  selector: 'wt-crm-seo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, SeoStrategyPanelComponent],
  template: `
    <div class="seo-page">
      <header class="seo-header">
        <h1>SEObot — redakcja treści</h1>
        <div class="header-actions">
          <button type="button" class="btn-ghost" (click)="showStrategy.set(!showStrategy())">
            Strategia treści ({{ pillars().length }} filarów)
          </button>
          <button type="button" class="btn-accent" (click)="generate()" [disabled]="generating()">
            @if (generating()) { Generuję… (może potrwać kilka minut) } @else { Generuj nowy artykuł }
          </button>
          <div class="gsc-status">
            @if (gsc()?.connected) {
              <span class="gsc-badge gsc-connected">Search Console: połączony ({{ gsc()?.site_url }})</span>
              <button type="button" class="btn-ghost btn-sm" (click)="syncGsc()" [disabled]="syncingGsc()">
                @if (syncingGsc()) { Synchronizuję… } @else { Synchronizuj teraz }
              </button>
            } @else {
              <button type="button" class="btn-ghost" (click)="connectGsc()">Połącz Search Console</button>
            }
          </div>
        </div>
      </header>

      @if (showStrategy()) {
        <wt-seo-strategy-panel [pillars]="pillars()" />
      }

      <div class="status-tabs">
        @for (s of statusFilters; track s.value) {
          <button
            type="button"
            class="tab"
            [class.active]="statusFilter() === s.value"
            (click)="setStatusFilter(s.value)"
          >{{ s.label }}</button>
        }
      </div>

      <div class="seo-layout">
        <div class="seo-list">
          @if (items().length === 0) {
            <p class="empty">Brak wpisów w tym stanie.</p>
          }
          @for (item of items(); track item.id) {
            <button type="button" class="content-row" [class.selected]="selected()?.id === item.id" (click)="select(item.id)">
              <span class="status-pill" [attr.data-status]="item.status">{{ statusLabel(item.status) }}</span>
              <span class="row-title">{{ item.title }}</span>
              <span class="row-locale">{{ item.locale }}</span>
              @if (item.impressions_28d > 0 || item.clicks_28d > 0) {
                <span class="row-metrics">{{ item.impressions_28d }} wyśw. · {{ item.clicks_28d }} kliknięć (28 dni)</span>
              }
            </button>
          }
        </div>

        <div class="seo-detail">
          @if (detail(); as d) {
            @if (d.header_image_url) {
              <img class="header-image" [src]="d.header_image_url" alt="">
            }
            @if (d.impressions_28d > 0 || d.clicks_28d > 0) {
              <div class="metrics-row">
                <span>{{ d.impressions_28d }} wyświetleń</span>
                <span>{{ d.clicks_28d }} kliknięć</span>
                @if (d.avg_position_28d) { <span>śr. pozycja {{ d.avg_position_28d }}</span> }
                <span class="metrics-note">(ostatnie 28 dni, dane Search Console)</span>
              </div>
            }
            <div class="image-controls">
              <input class="image-url-input" [(ngModel)]="editImageUrl" placeholder="URL zdjęcia nagłówkowego">
              <button type="button" class="btn-ghost btn-sm" (click)="saveImageUrl(d.id)">Zapisz zdjęcie</button>
              <button type="button" class="btn-ghost btn-sm" (click)="rerollImage(d.id)" [disabled]="rerolling()">
                @if (rerolling()) { Losuję… } @else { Losuj inne z Pexels }
              </button>
            </div>
            <h2>
              <input class="title-input" [(ngModel)]="editTitle" [disabled]="!isEditable(d.status)">
            </h2>
            <textarea class="meta-input" [(ngModel)]="editMeta" [disabled]="!isEditable(d.status)" rows="2" placeholder="Meta description"></textarea>
            <textarea class="body-input" [(ngModel)]="editBody" [disabled]="!isEditable(d.status)" rows="14"></textarea>

            <div class="detail-actions">
              @if (isEditable(d.status)) {
                <button type="button" class="btn-ghost" (click)="saveEdits(d.id)">Zapisz zmiany</button>
              }
              @if (d.status === 'in_review' || d.status === 'needs_update') {
                <button type="button" class="btn-reject" (click)="reject(d.id)">Odrzuć</button>
              }
              @if (d.status === 'draft' || d.status === 'in_review' || d.status === 'needs_update') {
                <button type="button" class="btn-accent" (click)="approve(d.id)">Zatwierdź i opublikuj</button>
              }
              @if (d.status === 'published') {
                <button type="button" class="btn-reject" (click)="unpublish(d.id)">Wycofaj do szkicu</button>
              }
            </div>
          } @else {
            <p class="empty">Wybierz wpis z listy.</p>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .seo-page { padding: 1.5rem; max-width: 1200px; }
    .seo-header { display:flex; align-items:center; justify-content:space-between; margin-bottom: 1rem; }
    .seo-header h1 { font-size: 1.4rem; margin: 0; }
    .header-actions { display:flex; align-items:center; gap: 0.75rem; }
    .gsc-badge { font-size: 0.82rem; padding: 0.4rem 0.8rem; border-radius: var(--radius); }
    .gsc-connected { background: var(--orange-pale); color: var(--orange-dark); }
    .status-tabs { display:flex; gap: 0.4rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .tab { border: 1px solid var(--gray-200); background: #fff; border-radius: 999px; padding: 0.35rem 0.9rem; font-size: 0.82rem; cursor: pointer; }
    .tab.active { background: var(--orange); color: #fff; border-color: var(--orange); }
    .seo-layout { display: grid; grid-template-columns: 340px 1fr; gap: 1.25rem; align-items: start; }
    .seo-list { display: flex; flex-direction: column; gap: 0.4rem; }
    .content-row {
      display: flex; flex-direction: column; align-items: flex-start; gap: 0.25rem;
      text-align: left; padding: 0.7rem 0.9rem; border: 1px solid var(--gray-200); border-radius: var(--radius);
      background: #fff; cursor: pointer;
    }
    .content-row.selected { border-color: var(--orange); background: var(--orange-pale); }
    .row-title { font-size: 0.9rem; font-weight: 600; color: var(--gray-900); }
    .row-locale { font-size: 0.72rem; color: var(--gray-500); text-transform: uppercase; }
    .row-metrics { font-size: 0.72rem; color: var(--gray-500); }
    .status-pill {
      font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .03em;
      padding: 0.15em 0.55em; border-radius: 4px; background: var(--gray-100); color: var(--gray-600);
    }
    .status-pill[data-status="published"] { background: var(--orange-pale); color: var(--orange-dark); }
    .status-pill[data-status="in_review"], .status-pill[data-status="needs_update"] { background: #FEF3C7; color: #92400E; }
    .status-pill[data-status="draft"] { background: var(--gray-100); color: var(--gray-600); }
    .seo-detail { background: #fff; border: 1px solid var(--gray-200); border-radius: var(--radius); padding: 1.25rem; }
    .header-image { width: 100%; max-height: 240px; object-fit: cover; border-radius: var(--radius); margin-bottom: 0.9rem; }
    .metrics-row {
      display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
      font-size: 0.82rem; color: var(--gray-700); font-weight: 600;
      background: var(--gray-50); border-radius: 8px; padding: 0.5rem 0.75rem; margin-bottom: 0.9rem;
    }
    .metrics-note { font-weight: 400; color: var(--gray-500); font-size: 0.72rem; }
    .image-controls { display: flex; gap: 0.5rem; margin-bottom: 0.9rem; }
    .image-url-input { flex: 1; border: 1px solid var(--gray-200); border-radius: 8px; padding: 0.5rem 0.6rem; font-family: inherit; font-size: 0.85rem; }
    .btn-sm { padding: 0.5rem 0.8rem; font-size: 0.82rem; white-space: nowrap; }
    .title-input { width: 100%; font-size: 1.1rem; font-weight: 700; border: none; padding: 0; }
    .meta-input, .body-input { width: 100%; border: 1px solid var(--gray-200); border-radius: 8px; padding: 0.6rem; margin-top: 0.6rem; font-family: inherit; }
    .detail-actions { display: flex; gap: 0.6rem; margin-top: 1rem; }
    .btn-ghost, .btn-accent, .btn-reject { border: none; border-radius: 8px; padding: 0.55rem 1.1rem; font-weight: 600; cursor: pointer; font-size: 0.88rem; }
    .btn-ghost { background: var(--gray-100); color: var(--gray-800); }
    .btn-accent { background: var(--orange); color: #fff; }
    .btn-reject { background: #FEE2E2; color: #991B1B; }
    .empty { color: var(--gray-500); padding: 1rem 0; }
  `],
})
export class CrmSeoComponent implements OnInit {
  private seoService = inject(CrmSeoService);
  private toast = inject(ToastService);

  readonly statusFilters: { value: SeoContentStatus | ''; label: string }[] = [
    { value: '', label: 'Wszystkie' },
    { value: 'in_review', label: 'Do akceptacji' },
    { value: 'needs_update', label: 'Do odświeżenia' },
    { value: 'published', label: 'Opublikowane' },
    { value: 'draft', label: 'Szkice' },
  ];

  readonly items = signal<SeoContentSummary[]>([]);
  readonly detail = signal<SeoContent | null>(null);
  readonly gsc = signal<GscStatus | null>(null);
  readonly pillars = signal<SeoPillar[]>([]);
  readonly showStrategy = signal(false);
  readonly statusFilter = signal<SeoContentStatus | ''>('');
  readonly generating = signal(false);
  readonly rerolling = signal(false);
  readonly syncingGsc = signal(false);

  readonly selected = computed(() => this.detail());

  editTitle = '';
  editMeta = '';
  editBody = '';
  editImageUrl = '';

  ngOnInit(): void {
    this.loadList();
    this.seoService.gscStatus().subscribe((s) => this.gsc.set(s));
    this.seoService.pillars().subscribe((p) => this.pillars.set(p));
  }

  statusLabel(status: SeoContentStatus): string {
    return STATUS_LABELS[status] ?? status;
  }

  isEditable(status: SeoContentStatus): boolean {
    return status === 'in_review' || status === 'needs_update' || status === 'draft';
  }

  setStatusFilter(value: SeoContentStatus | ''): void {
    this.statusFilter.set(value);
    this.loadList();
  }

  private loadList(): void {
    this.seoService.list(this.statusFilter() || undefined).subscribe((items) => this.items.set(items));
  }

  select(id: number): void {
    this.seoService.get(id).subscribe((d) => {
      this.detail.set(d);
      this.editTitle = d.title;
      this.editMeta = d.meta_description ?? '';
      this.editBody = d.body;
      this.editImageUrl = d.header_image_url ?? '';
    });
  }

  saveEdits(id: number): void {
    this.seoService.update(id, {
      title: this.editTitle,
      meta_description: this.editMeta,
      body: this.editBody,
      header_image_url: this.editImageUrl || null,
    }).subscribe({
      next: (d) => { this.toast.success('Zapisano zmiany.'); this.detail.set(d); this.loadList(); },
      error: () => this.toast.error('Nie udało się zapisać zmian.'),
    });
  }

  saveImageUrl(id: number): void {
    this.seoService.update(id, { header_image_url: this.editImageUrl || null }).subscribe({
      next: (d) => { this.toast.success('Zapisano zdjęcie.'); this.detail.set(d); this.loadList(); },
      error: () => this.toast.error('Nie udało się zapisać zdjęcia.'),
    });
  }

  rerollImage(id: number): void {
    if (this.rerolling()) return;
    this.rerolling.set(true);
    this.seoService.rerollImage(id).subscribe({
      next: (d) => {
        this.toast.success('Wylosowano nowe zdjęcie.');
        this.detail.set(d);
        this.editImageUrl = d.header_image_url ?? '';
        this.rerolling.set(false);
      },
      error: (err) => { this.toast.error(err?.error?.error ?? 'Nie udało się wylosować zdjęcia.'); this.rerolling.set(false); },
    });
  }

  approve(id: number): void {
    this.seoService.approve(id).subscribe({
      next: () => { this.toast.success('Wpis opublikowany.'); this.detail.set(null); this.loadList(); },
      error: () => this.toast.error('Nie udało się zatwierdzić wpisu.'),
    });
  }

  reject(id: number): void {
    this.seoService.reject(id).subscribe({
      next: () => { this.toast.info('Wpis odrzucony, wrócił do szkiców.'); this.detail.set(null); this.loadList(); },
      error: () => this.toast.error('Nie udało się odrzucić wpisu.'),
    });
  }

  unpublish(id: number): void {
    this.seoService.unpublish(id).subscribe({
      next: () => { this.toast.info('Wpis wycofany do szkiców.'); this.detail.set(null); this.loadList(); },
      error: () => this.toast.error('Nie udało się wycofać wpisu.'),
    });
  }

  generate(): void {
    if (this.generating()) return;
    this.generating.set(true);
    this.seoService.generate().subscribe({
      next: () => {
        this.toast.success('Nowy artykuł wygenerowany i czeka na akceptację.');
        this.generating.set(false);
        this.loadList();
        this.seoService.pillars().subscribe((p) => this.pillars.set(p));
      },
      error: (err) => { this.toast.error(err?.error?.error ?? 'Nie udało się wygenerować artykułu.'); this.generating.set(false); },
    });
  }

  connectGsc(): void {
    this.seoService.gscAuthUrl().subscribe((res) => window.location.assign(res.url));
  }

  syncGsc(): void {
    if (this.syncingGsc()) return;
    this.syncingGsc.set(true);
    this.seoService.gscSync().subscribe({
      next: () => {
        this.toast.success('Metryki Search Console zsynchronizowane.');
        this.syncingGsc.set(false);
        this.loadList();
        if (this.detail()) this.select(this.detail()!.id);
      },
      error: (err) => { this.toast.error(err?.error?.error ?? 'Nie udało się zsynchronizować metryk.'); this.syncingGsc.set(false); },
    });
  }
}
