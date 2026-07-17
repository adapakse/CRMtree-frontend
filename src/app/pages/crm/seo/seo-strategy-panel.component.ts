import { ChangeDetectionStrategy, Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CrmSeoService, SeoPillar, SeoCompetitor } from '../../../core/services/crm-seo.service';
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
  `],
})
export class SeoStrategyPanelComponent implements OnInit {
  @Input() pillars: SeoPillar[] = [];

  private seoService = inject(CrmSeoService);
  private toast = inject(ToastService);

  readonly competitors = signal<SeoCompetitor[]>([]);
  newUrl = '';
  newNotes = '';

  ngOnInit(): void {
    this.loadCompetitors();
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
}
