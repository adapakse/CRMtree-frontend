import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CrmSeoService } from '../../../core/services/crm-seo.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'wt-seo-tenant-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="settings-box">
      <h3>Ustawienia SEO tenanta</h3>
      <p class="hint">Zasila generowanie filarów tematycznych i słów kluczowych — im dokładniejszy opis, tym trafniejsza strategia.</p>
      <label class="field-label">Opis biznesu</label>
      <textarea class="field-input" [(ngModel)]="businessDescription" rows="4" placeholder="Czym zajmuje się firma, kim są odbiorcy, jaka branża…"></textarea>
      <label class="field-label">Branża (industry_vertical)</label>
      <input class="field-input" [(ngModel)]="industryVertical" placeholder="np. yachting, saas_crm, personal_brand">

      <label class="field-label">Adres property w Google Search Console</label>
      <input class="field-input" [(ngModel)]="gscSiteUrl" placeholder="https://twoja-domena.pl/ lub sc-domain:twoja-domena.pl">
      <p class="hint gsc-hint">
        Używany przy łączeniu Search Console — musi dokładnie odpowiadać zweryfikowanej property w GSC.
        @if (wordpressSiteUrl()) {
          Podpowiedź z połączonego WordPressa: <strong>{{ wordpressSiteUrl() }}</strong> — możesz ją nadpisać, jeśli property w GSC ma inny format (np. domain property).
        } @else {
          Jeśli nic nie ustawisz, użyjemy domyślnego adresu crmtree.pl.
        }
      </p>

      <button type="button" class="btn-ghost btn-sm" (click)="save()" [disabled]="saving()">
        @if (saving()) { Zapisuję… } @else { Zapisz ustawienia }
      </button>

      @if (auth.isSuperAdmin()) {
        <div class="superadmin-box">
          <h4>Tryb publikacji WordPress <span class="sa-badge">SuperAdmin</span></h4>
          <p class="hint">Decyzja podejmowana po rozmowie z klientem — czy artykuły mają iść od razu live na jego WordPressie, czy lądować jako szkic do ręcznej publikacji tam.</p>
          <div class="mode-row">
            <label class="radio-label">
              <input type="radio" name="wpMode" value="draft" [(ngModel)]="wpPublishMode" (ngModelChange)="saveWpMode($event)">
              Szkic (bezpieczne, wymaga ręcznej publikacji w WP)
            </label>
            <label class="radio-label">
              <input type="radio" name="wpMode" value="publish" [(ngModel)]="wpPublishMode" (ngModelChange)="saveWpMode($event)">
              Publikuj od razu (live, bez przystanku)
            </label>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .settings-box { border: 1px solid var(--gray-200); border-radius: var(--radius); padding: 1rem 1.1rem; background: #fff; }
    .settings-box h3 { font-size: 0.95rem; margin: 0 0 0.25rem; }
    .hint { font-size: 0.78rem; color: var(--gray-500); margin: 0 0 0.75rem; }
    .field-label { display: block; font-size: 0.78rem; font-weight: 600; color: var(--gray-700); margin: 0.7rem 0 0.3rem; }
    .field-input { width: 100%; border: 1px solid var(--gray-200); border-radius: 8px; padding: 0.55rem 0.7rem; font-family: inherit; font-size: 0.85rem; }
    .gsc-hint { margin: 0.4rem 0 0; }
    .btn-ghost { border: none; border-radius: 8px; font-weight: 600; cursor: pointer; background: var(--gray-100); color: var(--gray-800); }
    .btn-sm { padding: 0.5rem 0.9rem; font-size: 0.82rem; margin-top: 0.9rem; }
    .superadmin-box { border-top: 1px solid var(--gray-200); margin-top: 0.75rem; padding-top: 1rem; }
    .superadmin-box h4 { font-size: 0.88rem; margin: 0 0 0.25rem; display: flex; align-items: center; gap: 0.5rem; }
    .sa-badge { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; background: var(--orange-pale); color: var(--orange-dark); border-radius: 999px; padding: 0.15em 0.55em; }
    .mode-row { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.6rem; }
    .radio-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--gray-700); cursor: pointer; }
  `],
})
export class SeoTenantSettingsComponent implements OnInit {
  private seoService = inject(CrmSeoService);
  private toast = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);
  readonly auth = inject(AuthService);

  readonly saving = signal(false);
  readonly wordpressSiteUrl = signal<string | null>(null);

  businessDescription = '';
  industryVertical = '';
  gscSiteUrl = '';
  wpPublishMode: 'draft' | 'publish' = 'draft';

  ngOnInit(): void {
    this.seoService.tenantSettings().subscribe((s) => {
      this.businessDescription = s.business_description ?? '';
      this.industryVertical = s.industry_vertical ?? '';
      this.wordpressSiteUrl.set(s.wordpress_site_url);
      // A tenant's own explicit choice always wins; only prefill from the connected
      // WordPress site when nobody has set (or cleared) a GSC property yet.
      this.gscSiteUrl = s.seo_gsc_site_url ?? s.wordpress_site_url ?? '';
      // OnPush doesn't repaint on a plain-property write from an async callback —
      // without this the loaded values sit correctly in memory but stay invisible
      // until some unrelated template event (e.g. clicking Save) forces a check.
      this.cdr.markForCheck();
    });
    if (this.auth.isSuperAdmin()) {
      this.seoService.wordpressPublishMode().subscribe((r) => {
        this.wpPublishMode = r.wordpress_publish_mode;
        this.cdr.markForCheck();
      });
    }
  }

  save(): void {
    this.saving.set(true);
    this.seoService.updateTenantSettings({
      business_description: this.businessDescription || null,
      industry_vertical: this.industryVertical || null,
      seo_gsc_site_url: this.gscSiteUrl.trim() || null,
    }).subscribe({
      next: () => { this.toast.success('Zapisano ustawienia.'); this.saving.set(false); },
      error: (err) => {
        this.toast.error(err?.error?.details?.[0]?.message ?? err?.error?.error ?? 'Nie udało się zapisać ustawień.');
        this.saving.set(false);
      },
    });
  }

  saveWpMode(mode: 'draft' | 'publish'): void {
    this.seoService.setWordpressPublishMode(mode).subscribe({
      next: () => this.toast.success(mode === 'publish' ? 'WordPress: publikacja od razu live.' : 'WordPress: publikacja jako szkic.'),
      error: () => this.toast.error('Nie udało się zapisać trybu.'),
    });
  }
}
