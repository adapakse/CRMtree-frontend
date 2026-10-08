import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { CrmSeoService } from '../../../core/services/crm-seo.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'wt-seo-tenant-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideTranslocoScope('crm')],
  imports: [FormsModule, TranslocoDirective],
  template: `
    <ng-container *transloco="let t; prefix: 'crm'">
    <div class="settings-box">
      <h3>{{ t('seo.tenantSettings.title') }}</h3>
      <p class="hint">
        {{ t('seo.tenantSettings.hint') }}
      </p>
      <label class="field-label" for="productName">{{ t('seo.tenantSettings.fields.productName') }}</label>
      <input id="productName" class="field-input" [(ngModel)]="productName" [placeholder]="t('seo.tenantSettings.fields.productNamePlaceholder')">
      <label class="field-label" for="businessDescription">{{ t('seo.tenantSettings.fields.businessDescription') }}</label>
      <textarea id="businessDescription" class="field-input" [(ngModel)]="businessDescription" rows="8" [placeholder]="t('seo.tenantSettings.fields.businessDescriptionPlaceholder')"></textarea>
      <label class="field-label">{{ t('seo.tenantSettings.fields.industry') }}</label>
      <input class="field-input" [(ngModel)]="industryVertical" [placeholder]="t('seo.tenantSettings.fields.industryPlaceholder')">

      <button type="button" class="btn-ghost btn-sm" (click)="save()" [disabled]="saving()">
        @if (saving()) { {{ t('seo.tenantSettings.saving') }} } @else { {{ t('seo.tenantSettings.save') }} }
      </button>

      @if (auth.isSuperAdmin()) {
        <div class="superadmin-box">
          <h4>{{ t('seo.tenantSettings.wordpressMode.title') }} <span class="sa-badge">SuperAdmin</span></h4>
          <p class="hint">{{ t('seo.tenantSettings.wordpressMode.hint') }}</p>
          <div class="mode-row">
            <label class="radio-label">
              <input type="radio" name="wpMode" value="draft" [(ngModel)]="wpPublishMode" (ngModelChange)="saveWpMode($event)">
              {{ t('seo.tenantSettings.wordpressMode.draft') }}
            </label>
            <label class="radio-label">
              <input type="radio" name="wpMode" value="publish" [(ngModel)]="wpPublishMode" (ngModelChange)="saveWpMode($event)">
              {{ t('seo.tenantSettings.wordpressMode.publish') }}
            </label>
          </div>
        </div>

        <div class="superadmin-box">
          <h4>{{ t('seo.tenantSettings.gscProperty.title') }} <span class="sa-badge">SuperAdmin</span></h4>
          <p class="hint">
            {{ t('seo.tenantSettings.gscProperty.hint') }}
          </p>
          <input class="field-input" [(ngModel)]="gscSiteUrl" [placeholder]="t('seo.tenantSettings.gscProperty.placeholder')">
          <button type="button" class="btn-ghost btn-sm" (click)="saveGscSiteUrl()">{{ t('seo.tenantSettings.gscProperty.save') }}</button>
        </div>
      }
    </div>
    </ng-container>
  `,
  styles: [`
    .settings-box { border: 1px solid var(--gray-200); border-radius: var(--radius); padding: 1rem 1.1rem; background: #fff; }
    .settings-box h3 { font-size: 0.95rem; margin: 0 0 0.25rem; }
    .hint { font-size: 0.78rem; color: var(--gray-500); margin: 0 0 0.75rem; }
    .field-label { display: block; font-size: 0.78rem; font-weight: 600; color: var(--gray-700); margin: 0.7rem 0 0.3rem; }
    .field-input { width: 100%; border: 1px solid var(--gray-200); border-radius: 8px; padding: 0.55rem 0.7rem; font-family: inherit; font-size: 0.85rem; }
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
  private transloco = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);
  readonly auth = inject(AuthService);

  readonly saving = signal(false);

  businessDescription = '';
  industryVertical = '';
  productName = '';
  wpPublishMode: 'draft' | 'publish' = 'draft';
  gscSiteUrl = '';

  ngOnInit(): void {
    this.seoService.tenantSettings().subscribe((s) => {
      this.businessDescription = s.business_description ?? '';
      this.industryVertical = s.industry_vertical ?? '';
      this.productName = s.product_name ?? '';
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
      this.seoService.gscSiteUrl().subscribe((r) => {
        this.gscSiteUrl = r.seo_gsc_site_url ?? '';
        this.cdr.markForCheck();
      });
    }
  }

  save(): void {
    this.saving.set(true);
    this.seoService.updateTenantSettings({
      business_description: this.businessDescription || null,
      industry_vertical: this.industryVertical || null,
      product_name: this.productName || null,
    }).subscribe({
      next: () => { this.toast.success(this.transloco.translate('crm.seo.tenantSettings.toasts.saved')); this.saving.set(false); },
      error: (err) => {
        this.toast.error(err?.error?.details?.[0]?.message ?? err?.error?.error ?? this.transloco.translate('crm.seo.tenantSettings.toasts.saveFailed'));
        this.saving.set(false);
      },
    });
  }

  saveWpMode(mode: 'draft' | 'publish'): void {
    this.seoService.setWordpressPublishMode(mode).subscribe({
      next: () => this.toast.success(mode === 'publish' ? this.transloco.translate('crm.seo.tenantSettings.toasts.wordpressLive') : this.transloco.translate('crm.seo.tenantSettings.toasts.wordpressDraft')),
      error: () => this.toast.error(this.transloco.translate('crm.seo.tenantSettings.toasts.modeSaveFailed')),
    });
  }

  saveGscSiteUrl(): void {
    this.seoService.setGscSiteUrl(this.gscSiteUrl || null).subscribe({
      next: () => this.toast.success(this.transloco.translate('crm.seo.tenantSettings.toasts.gscPropertySaved')),
      error: () => this.toast.error(this.transloco.translate('crm.seo.tenantSettings.toasts.gscPropertySaveFailed')),
    });
  }
}
