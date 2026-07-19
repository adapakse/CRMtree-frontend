import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { CrmSeoService, SeoContentSummary, SeoContent, SeoContentStatus, GscStatus, SeoPillar, SeoInternalLink, SocialPost, SocialPlatform } from '../../../core/services/crm-seo.service';
import { ToastService } from '../../../core/services/toast.service';
import { SeoStrategyPanelComponent } from './seo-strategy-panel.component';
import { SeoSocialChannelsComponent } from './seo-social-channels.component';
import { SeoTenantSettingsComponent } from './seo-tenant-settings.component';

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
  imports: [FormsModule, DatePipe, SeoStrategyPanelComponent, SeoSocialChannelsComponent, SeoTenantSettingsComponent],
  template: `
    <div class="seo-page">
      <header class="seo-header">
        <h1>SEObot — redakcja treści</h1>
        <div class="header-actions">
          <button type="button" class="btn-ghost" (click)="showStrategy.set(!showStrategy())">
            Strategia treści ({{ pillars().length }} filarów)
          </button>
          <button type="button" class="btn-ghost" (click)="showChannels.set(!showChannels())">Kanały social</button>
          <button type="button" class="btn-ghost" (click)="showSettings.set(!showSettings())">Ustawienia</button>
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
        <wt-seo-strategy-panel [pillars]="pillars()" (pillarsChanged)="loadPillars()" />
      }
      @if (showChannels()) {
        <wt-seo-social-channels />
      }
      @if (showSettings()) {
        <wt-seo-tenant-settings />
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

            @if (internalLinks().length > 0) {
              <div class="internal-links-row">
                <span class="internal-links-label">Linki wewnętrzne:</span>
                @for (link of internalLinks(); track link.id) {
                  <span class="internal-link-chip">{{ link.to_title }}</span>
                }
              </div>
            }

            @if (isEditable(d.status)) {
              <div class="schedule-row">
                <label for="scheduleInput">Zaplanuj publikację na:</label>
                <input id="scheduleInput" type="datetime-local" [(ngModel)]="editScheduledAt" (change)="saveScheduledAt(d.id)">
                @if (editScheduledAt) {
                  <button type="button" class="btn-ghost btn-sm" (click)="clearSchedule(d.id)">Usuń termin</button>
                }
              </div>
            } @else if (d.status === 'scheduled' && d.scheduled_at) {
              <p class="schedule-note">Zaplanowano publikację: {{ d.scheduled_at | date:'d MMMM y, HH:mm':'':'pl' }}</p>
            }

            <div class="detail-actions">
              @if (isEditable(d.status)) {
                <button type="button" class="btn-ghost" (click)="saveEdits(d.id)">Zapisz zmiany</button>
              }
              @if (d.status === 'in_review' || d.status === 'needs_update') {
                <button type="button" class="btn-reject" (click)="reject(d.id)">Odrzuć</button>
              }
              @if (d.status === 'scheduled') {
                <button type="button" class="btn-reject" (click)="unpublish(d.id)">Anuluj harmonogram</button>
              }
              @if (d.status === 'draft' || d.status === 'in_review' || d.status === 'needs_update') {
                <button type="button" class="btn-accent" (click)="approve(d.id)">
                  @if (editScheduledAt) { Zatwierdź i zaplanuj } @else { Zatwierdź i opublikuj }
                </button>
              }
              @if (d.status === 'published') {
                <button type="button" class="btn-reject" (click)="unpublish(d.id)">Wycofaj do szkicu</button>
              }
            </div>

            @if (d.status === 'published' || d.status === 'scheduled' || socialPosts().length > 0) {
              <div class="social-box">
                <h3>Publikacja social</h3>
                @if (socialPosts().length === 0) {
                  <p class="empty">Brak podłączonych kanałów — połącz je w "Kanały social" u góry.</p>
                }
                @for (post of socialPosts(); track post.platform) {
                  <div class="social-platform">
                    <div class="social-platform-head">
                      <span class="social-platform-name">{{ platformLabel(post.platform) }}</span>
                      <span class="social-status" [attr.data-status]="post.status">{{ socialStatusLabel(post.status) }}</span>
                      @if (post.remote_url) {
                        <a [href]="post.remote_url" target="_blank" rel="noopener" class="social-view-link">Zobacz post</a>
                      }
                    </div>
                    @if (post.status === 'failed' && post.error_message) {
                      <p class="social-error">{{ post.error_message }}</p>
                    }
                    <textarea class="social-textarea" [ngModel]="post.body" (ngModelChange)="setSocialBody(post.platform, $event)" rows="4"></textarea>
                    <div class="social-actions">
                      <button type="button" class="btn-ghost btn-sm" (click)="saveSocialPost(d.id, post.platform)">Zapisz</button>
                      <button type="button" class="btn-ghost btn-sm" (click)="copySocialBody(post.body)">Kopiuj</button>
                      @if (post.status === 'failed' || post.status === 'draft') {
                        <button type="button" class="btn-ghost btn-sm" (click)="retrySocialPost(d.id, post.platform)" [disabled]="retryingSocial().has(post.platform)">
                          @if (retryingSocial().has(post.platform)) { Publikuję… } @else { Publikuj / spróbuj ponownie }
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            }
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
    .internal-links-row { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.75rem; }
    .internal-links-label { font-size: 0.78rem; color: var(--gray-500); }
    .internal-link-chip { font-size: 0.75rem; background: var(--gray-100); color: var(--gray-700); border-radius: 999px; padding: 0.15rem 0.6rem; }
    .schedule-row { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.9rem; font-size: 0.85rem; color: var(--gray-700); }
    .schedule-row input { border: 1px solid var(--gray-200); border-radius: 8px; padding: 0.4rem 0.6rem; font-family: inherit; font-size: 0.85rem; }
    .schedule-note { font-size: 0.82rem; color: var(--orange-dark); background: var(--orange-pale); border-radius: 8px; padding: 0.5rem 0.75rem; margin-top: 0.9rem; }
    .social-box { border-top: 1px solid var(--gray-200); margin-top: 1.25rem; padding-top: 1rem; }
    .social-box h3 { font-size: 0.9rem; margin: 0 0 0.9rem; color: var(--gray-800); }
    .social-platform { border: 1px solid var(--gray-200); border-radius: var(--radius); padding: 0.85rem 0.95rem; margin-bottom: 0.75rem; background: var(--gray-50); }
    .social-platform:last-child { margin-bottom: 0; }
    .social-platform-head { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem; }
    .social-platform-name { font-size: 0.85rem; font-weight: 700; color: var(--gray-900); }
    .social-status {
      font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .03em;
      padding: 0.15em 0.55em; border-radius: 4px; background: var(--gray-100); color: var(--gray-600);
    }
    .social-status[data-status="published"] { background: var(--orange-pale); color: var(--orange-dark); }
    .social-status[data-status="failed"] { background: #FEE2E2; color: #991B1B; }
    .social-status[data-status="queued"] { background: #FEF3C7; color: #92400E; }
    .social-view-link { font-size: 0.78rem; color: var(--orange-dark); margin-left: auto; }
    .social-error { font-size: 0.78rem; color: #991B1B; margin: 0 0 0.5rem; }
    .social-textarea { width: 100%; border: 1px solid var(--gray-200); border-radius: 8px; padding: 0.6rem; font-family: inherit; font-size: 0.85rem; background: #fff; }
    .social-actions { display: flex; gap: 0.5rem; margin-top: 0.6rem; }
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
    { value: 'scheduled', label: 'Zaplanowane' },
    { value: 'published', label: 'Opublikowane' },
    { value: 'draft', label: 'Szkice' },
  ];

  readonly items = signal<SeoContentSummary[]>([]);
  readonly detail = signal<SeoContent | null>(null);
  readonly gsc = signal<GscStatus | null>(null);
  readonly pillars = signal<SeoPillar[]>([]);
  readonly showStrategy = signal(false);
  readonly showChannels = signal(false);
  readonly showSettings = signal(false);
  readonly statusFilter = signal<SeoContentStatus | ''>('');
  readonly generating = signal(false);
  readonly rerolling = signal(false);
  readonly syncingGsc = signal(false);
  readonly internalLinks = signal<SeoInternalLink[]>([]);
  readonly socialPosts = signal<SocialPost[]>([]);
  readonly retryingSocial = signal<Set<SocialPlatform>>(new Set());

  readonly selected = computed(() => this.detail());

  editTitle = '';
  editMeta = '';
  editBody = '';
  editImageUrl = '';
  editScheduledAt = '';

  ngOnInit(): void {
    this.loadList();
    this.seoService.gscStatus().subscribe((s) => this.gsc.set(s));
    this.loadPillars();
  }

  loadPillars(): void {
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
      // datetime-local expects "YYYY-MM-DDTHH:mm" in local time, not an ISO string with seconds/zone.
      this.editScheduledAt = d.scheduled_at ? this.toDatetimeLocal(d.scheduled_at) : '';
    });
    this.seoService.internalLinks(id).subscribe((links) => this.internalLinks.set(links));
    this.seoService.articleSocialPosts(id).subscribe((posts) => this.socialPosts.set(posts));
  }

  private toDatetimeLocal(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

  saveScheduledAt(id: number): void {
    const iso = this.editScheduledAt ? new Date(this.editScheduledAt).toISOString() : null;
    this.seoService.update(id, { scheduled_at: iso }).subscribe({
      next: (d) => { this.toast.success('Zapisano termin publikacji.'); this.detail.set(d); this.loadList(); },
      error: () => this.toast.error('Nie udało się zapisać terminu.'),
    });
  }

  clearSchedule(id: number): void {
    this.editScheduledAt = '';
    this.saveScheduledAt(id);
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
      next: (d) => {
        this.toast.success(d.status === 'scheduled' ? 'Zaplanowano publikację.' : 'Wpis opublikowany.');
        this.detail.set(null);
        this.loadList();
      },
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
        this.loadPillars();
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

  platformLabel(platform: SocialPlatform): string {
    return { linkedin: 'LinkedIn', facebook: 'Facebook', instagram: 'Instagram', wordpress: 'WordPress' }[platform];
  }

  socialStatusLabel(status: SocialPost['status']): string {
    return { draft: 'Szkic', queued: 'Publikuję…', published: 'Opublikowany', failed: 'Błąd' }[status];
  }

  setSocialBody(platform: SocialPlatform, body: string): void {
    this.socialPosts.update((posts) => posts.map((p) => (p.platform === platform ? { ...p, body } : p)));
  }

  saveSocialPost(id: number, platform: SocialPlatform): void {
    const post = this.socialPosts().find((p) => p.platform === platform);
    if (!post?.body) return;
    this.seoService.updateSocialPost(id, platform, post.body).subscribe({
      next: () => this.toast.success('Zapisano post.'),
      error: () => this.toast.error('Nie udało się zapisać posta.'),
    });
  }

  copySocialBody(body: string | null): void {
    if (!body) return;
    navigator.clipboard.writeText(body).then(
      () => this.toast.success('Skopiowano do schowka.'),
      () => this.toast.error('Nie udało się skopiować.'),
    );
  }

  retrySocialPost(id: number, platform: SocialPlatform): void {
    if (this.retryingSocial().has(platform)) return;
    this.retryingSocial.update((s) => new Set(s).add(platform));
    this.seoService.retrySocialPost(id, platform).subscribe({
      next: (post) => {
        this.toast.success(post.status === 'published' ? 'Opublikowano.' : 'Nie udało się opublikować — sprawdź błąd.');
        this.socialPosts.update((posts) => posts.map((p) => (p.platform === platform ? post : p)));
        this.retryingSocial.update((s) => { const n = new Set(s); n.delete(platform); return n; });
      },
      error: () => {
        this.toast.error('Nie udało się opublikować.');
        this.retryingSocial.update((s) => { const n = new Set(s); n.delete(platform); return n; });
      },
    });
  }
}
