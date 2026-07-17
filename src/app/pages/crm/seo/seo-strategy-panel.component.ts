import { ChangeDetectionStrategy, Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CrmSeoService, SeoPillar, SeoCompetitor, SeoBacklink } from '../../../core/services/crm-seo.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'wt-seo-strategy-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="pillar-grid">
      @for (p of pillars; track p.id) {
        <div class="pillar-card">
          <div class="pillar-card-top">
            <span class="pillar-name">{{ p.name }}</span>
            <span class="pillar-count">{{ p.article_count }} art.</span>
          </div>
          <p class="pillar-desc">{{ p.description }}</p>
          <span class="pillar-theme">{{ p.target_keyword_theme }}</span>
        </div>
      }
    </div>

    <div class="competitors-box">
      <h3>Konkurenci ({{ competitors().length }})</h3>
      <p class="hint">Lista wpływa na generowanie filarów tematycznych — im lepiej opisana, tym trafniejsza strategia.</p>
      <div class="competitors-list">
        @for (c of competitors(); track c.id) {
          <div class="competitor-row">
            <div class="competitor-info">
              <a [href]="c.url" target="_blank" rel="noopener">{{ c.url }}</a>
              @if (c.notes) { <span class="competitor-notes">{{ c.notes }}</span> }
            </div>
            <button type="button" class="btn-remove" (click)="remove(c.id)" aria-label="Usuń">&times;</button>
          </div>
        }
        @if (competitors().length === 0) {
          <p class="empty">Brak konkurentów na liście.</p>
        }
      </div>
      <div class="competitor-form">
        <input class="competitor-input" [(ngModel)]="newUrl" placeholder="https://konkurent.pl">
        <input class="competitor-input" [(ngModel)]="newNotes" placeholder="Notatka (opcjonalnie)">
        <button type="button" class="btn-ghost btn-sm" (click)="add()" [disabled]="!newUrl.trim()">Dodaj</button>
      </div>
    </div>

    <div class="backlinks-box">
      <h3>Backlinki między tenantami ({{ backlinks().length }})</h3>
      <p class="hint">
        Opt-in wymiana linków z innymi tenantami z tej samej branży (industry_vertical), wyłącznie tematycznie trafna,
        bez wymuszonej wzajemności. Dopasowanie działa dopiero gdy inny tenant też się zgłosi — dziś jesteś jedynym.
      </p>
      <label class="opt-in-row">
        <input type="checkbox" [ngModel]="optIn()" (ngModelChange)="toggleOptIn($event)">
        Zgoda na wymianę backlinków z innymi tenantami
      </label>
      @if (optIn()) {
        <button type="button" class="btn-ghost btn-sm" (click)="findCandidates()" [disabled]="findingCandidates()">
          @if (findingCandidates()) { Szukam… } @else { Szukaj kandydatów }
        </button>
      }
      <div class="backlinks-list">
        @for (b of backlinks(); track b.id) {
          <div class="backlink-row">
            <span class="backlink-desc">{{ b.from_title }} &rarr; {{ b.to_title }}</span>
            <span class="backlink-status" [attr.data-status]="b.status">{{ statusLabel(b.status) }}</span>
            @if (b.status === 'suggested') {
              <button type="button" class="btn-ghost btn-sm" (click)="accept(b.id)">Akceptuj</button>
              <button type="button" class="btn-ghost btn-sm" (click)="reject(b.id)">Odrzuć</button>
            }
          </div>
        }
        @if (backlinks().length === 0) {
          <p class="empty">Brak backlinków.</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .pillar-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.6rem; margin-bottom: 1.25rem; }
    .pillar-card { border: 1px solid var(--gray-200); border-radius: var(--radius); padding: 0.7rem 0.85rem; background: #fff; }
    .pillar-card-top { display:flex; align-items:center; justify-content:space-between; gap: 0.5rem; }
    .pillar-name { font-size: 0.85rem; font-weight: 700; color: var(--gray-900); }
    .pillar-count { font-size: 0.72rem; color: var(--gray-500); white-space: nowrap; }
    .pillar-desc { font-size: 0.78rem; color: var(--gray-600); margin: 0.35rem 0 0; line-height: 1.4; }
    .pillar-theme { display:inline-block; margin-top: 0.5rem; font-size: 0.7rem; color: var(--orange-dark); background: var(--orange-pale); border-radius: 999px; padding: 0.15rem 0.55rem; }

    .competitors-box { border: 1px solid var(--gray-200); border-radius: var(--radius); padding: 1rem 1.1rem; background: #fff; margin-bottom: 1.25rem; }
    .competitors-box h3 { font-size: 0.95rem; margin: 0 0 0.25rem; }
    .hint { font-size: 0.78rem; color: var(--gray-500); margin: 0 0 0.75rem; }
    .competitors-list { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.75rem; }
    .competitor-row {
      display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
      padding: 0.45rem 0.6rem; border: 1px solid var(--gray-200); border-radius: 8px; background: var(--gray-50);
    }
    .competitor-info { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
    .competitor-info a { font-size: 0.85rem; color: var(--gray-800); text-decoration: none; word-break: break-all; }
    .competitor-info a:hover { color: var(--orange-dark); }
    .competitor-notes { font-size: 0.75rem; color: var(--gray-500); }
    .btn-remove {
      border: none; background: transparent; color: var(--gray-400); font-size: 1.1rem;
      cursor: pointer; line-height: 1; padding: 0 0.3rem; flex-shrink: 0;
    }
    .btn-remove:hover { color: #991B1B; }
    .competitor-form { display: flex; gap: 0.5rem; }
    .competitor-input { flex: 1; border: 1px solid var(--gray-200); border-radius: 8px; padding: 0.5rem 0.6rem; font-family: inherit; font-size: 0.85rem; }
    .btn-ghost { border: none; border-radius: 8px; font-weight: 600; cursor: pointer; background: var(--gray-100); color: var(--gray-800); }
    .btn-sm { padding: 0.5rem 0.8rem; font-size: 0.82rem; white-space: nowrap; }
    .empty { color: var(--gray-500); font-size: 0.82rem; margin: 0; }

    .backlinks-box { border: 1px solid var(--gray-200); border-radius: var(--radius); padding: 1rem 1.1rem; background: #fff; }
    .backlinks-box h3 { font-size: 0.95rem; margin: 0 0 0.25rem; }
    .opt-in-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--gray-700); margin: 0.5rem 0 0.75rem; cursor: pointer; }
    .backlinks-list { display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.75rem; }
    .backlink-row {
      display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
      padding: 0.45rem 0.6rem; border: 1px solid var(--gray-200); border-radius: 8px; background: var(--gray-50);
    }
    .backlink-desc { font-size: 0.82rem; color: var(--gray-800); flex: 1; min-width: 0; }
    .backlink-status {
      font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .03em;
      padding: 0.15em 0.55em; border-radius: 4px; background: var(--gray-100); color: var(--gray-600);
    }
    .backlink-status[data-status="accepted"] { background: var(--orange-pale); color: var(--orange-dark); }
    .backlink-status[data-status="rejected"] { background: #FEE2E2; color: #991B1B; }
  `],
})
export class SeoStrategyPanelComponent implements OnInit {
  @Input() pillars: SeoPillar[] = [];

  private seoService = inject(CrmSeoService);
  private toast = inject(ToastService);

  readonly competitors = signal<SeoCompetitor[]>([]);
  readonly backlinks = signal<SeoBacklink[]>([]);
  readonly optIn = signal(false);
  readonly findingCandidates = signal(false);
  newUrl = '';
  newNotes = '';

  private readonly statusLabels: Record<string, string> = { suggested: 'Sugerowany', accepted: 'Zaakceptowany', rejected: 'Odrzucony' };

  ngOnInit(): void {
    this.loadCompetitors();
    this.loadBacklinks();
    this.seoService.backlinksOptIn().subscribe((r) => this.optIn.set(r.opt_in));
  }

  statusLabel(status: string): string {
    return this.statusLabels[status] ?? status;
  }

  private loadCompetitors(): void {
    this.seoService.competitors().subscribe((c) => this.competitors.set(c));
  }

  add(): void {
    const url = this.newUrl.trim();
    if (!url) return;
    this.seoService.addCompetitor(url, this.newNotes.trim() || undefined).subscribe({
      next: () => {
        this.toast.success('Dodano konkurenta.');
        this.newUrl = '';
        this.newNotes = '';
        this.loadCompetitors();
      },
      error: () => this.toast.error('Nie udało się dodać konkurenta.'),
    });
  }

  remove(id: number): void {
    this.seoService.deleteCompetitor(id).subscribe({
      next: () => { this.toast.info('Usunięto konkurenta.'); this.loadCompetitors(); },
      error: () => this.toast.error('Nie udało się usunąć konkurenta.'),
    });
  }

  private loadBacklinks(): void {
    this.seoService.backlinks().subscribe((b) => this.backlinks.set(b));
  }

  toggleOptIn(value: boolean): void {
    this.optIn.set(value);
    this.seoService.setBacklinksOptIn(value).subscribe({
      next: () => this.toast.success(value ? 'Zgoda na backlinki włączona.' : 'Zgoda na backlinki wyłączona.'),
      error: () => { this.toast.error('Nie udało się zapisać zgody.'); this.optIn.set(!value); },
    });
  }

  findCandidates(): void {
    if (this.findingCandidates()) return;
    this.findingCandidates.set(true);
    this.seoService.findBacklinkCandidates().subscribe({
      next: (found) => {
        this.findingCandidates.set(false);
        this.toast.info(found.length ? `Znaleziono ${found.length} kandydatów.` : 'Brak kandydatów — żaden inny tenant nie pasuje jeszcze branżą i zgodą.');
        this.loadBacklinks();
      },
      error: (err) => { this.toast.error(err?.error?.error ?? 'Nie udało się wyszukać kandydatów.'); this.findingCandidates.set(false); },
    });
  }

  accept(id: number): void {
    this.seoService.acceptBacklink(id).subscribe({
      next: () => { this.toast.success('Backlink zaakceptowany.'); this.loadBacklinks(); },
      error: () => this.toast.error('Nie udało się zaakceptować.'),
    });
  }

  reject(id: number): void {
    this.seoService.rejectBacklink(id).subscribe({
      next: () => { this.toast.info('Backlink odrzucony.'); this.loadBacklinks(); },
      error: () => this.toast.error('Nie udało się odrzucić.'),
    });
  }
}
