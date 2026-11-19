import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { EmailCampaignsService, SendgridStatus, SendgridTemplate } from '../../../core/services/email-campaigns.service';
import { apiErrorMessage, localizedApiErrorMessage } from '../../../core/services/api-error.util';
import { CrmEmailCampaignListComponent } from './crm-email-campaign-list.component';
import { CrmEmailCampaignTemplatesComponent } from './crm-email-campaign-templates.component';
import { CrmEmailCampaignResultsComponent } from './crm-email-campaign-results.component';
import { CrmEmailCampaignSettingsComponent } from './crm-email-campaign-settings.component';
import { SENDGRID_TEMPLATES_URL } from './campaign-period';
import { EMAIL_CAMPAIGNS_SHARED_STYLES } from './email-campaigns.styles';

type Tab = 'campaigns' | 'templates' | 'results' | 'settings';

/** E-mail campaigns: campaigns, SendGrid templates, results and — for tenant admins — the SendGrid settings. */
@Component({
  selector: 'wt-crm-email-campaigns',
  standalone: true,
  imports: [TranslocoDirective, CrmEmailCampaignListComponent, CrmEmailCampaignTemplatesComponent, CrmEmailCampaignResultsComponent,
            CrmEmailCampaignSettingsComponent],
  providers: [provideTranslocoScope('campaigns')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="ec-page" *transloco="let t; prefix: 'campaigns'">
  <div class="ec-top">
    <div>
      <h1>{{ t('page.title') }}</h1>
      <p class="ec-sub">{{ t('page.subtitle') }}</p>
    </div>
    @if (tab() === 'campaigns') {
      <button class="btn btn-p" (click)="router.navigate(['/crm/email-campaigns/new'])"><i class="ei ei-plus"></i> {{ t('page.newCampaign') }}</button>
    } @else if (tab() === 'templates') {
      <a class="btn btn-p" [href]="templatesUrl" target="_blank" rel="noopener"><i class="ei ei-plus"></i> {{ t('templates.newInSendgrid') }} <i class="ei ei-link"></i></a>
    }
  </div>

  @if (status() && !status()!.configured && tab() !== 'settings') {
    <div class="ec-warn ec-banner" role="status">
      <span class="ico-tile ico-tile--warn"><i class="ei ei-warn"></i></span>
      <div>
        <b>{{ t('page.notConfigured.title') }}</b>
        <div>{{ t('page.notConfigured.body') }}</div>
        @if (isAdmin()) {
          <button class="btn btn-g btn-sm ec-banner-btn" (click)="setTab('settings')"><i class="ei ei-settings"></i> {{ t('page.notConfigured.openSettings') }}</button>
        } @else {
          <div class="ec-banner-hint">{{ t('page.notConfigured.askAdmin') }}</div>
        }
      </div>
    </div>
  }

  <div class="tabs seg ec-tabs" role="group" [attr.aria-label]="t('page.views')">
    <button class="tab-btn" [class.active]="tab() === 'campaigns'" (click)="setTab('campaigns')">
      {{ t('page.tabs.campaigns') }} @if (campaignTotal() !== null) { <span class="ec-cnt">{{ campaignTotal() }}</span> }</button>
    <button class="tab-btn" [class.active]="tab() === 'templates'" (click)="setTab('templates')">
      {{ t('page.tabs.templates') }} <span class="ec-cnt">{{ templates().length }}</span></button>
    <button class="tab-btn" [class.active]="tab() === 'results'" (click)="setTab('results')">{{ t('page.tabs.results') }}</button>
    @if (isAdmin()) {
      <button class="tab-btn" [class.active]="tab() === 'settings'" (click)="setTab('settings')">{{ t('page.tabs.settings') }}</button>
    }
  </div>

  @switch (tab()) {
    @case ('campaigns') { <wt-crm-email-campaign-list (totalChange)="campaignTotal.set($event)" (openResults)="openResults($event)" /> }
    @case ('templates') {
      <wt-crm-email-campaign-templates [templates]="templates()" [isLoading]="templatesLoading()" [error]="templatesError()"
                                       [isAdmin]="isAdmin()" (refresh)="loadTemplates(true)" (openSettings)="setTab('settings')" />
    }
    @case ('results') { <wt-crm-email-campaign-results [initialCampaignId]="resultsCampaignId()" /> }
    @case ('settings') { <wt-crm-email-campaign-settings (saved)="onSettingsSaved()" /> }
  }
</div>
  `,
  styles: [EMAIL_CAMPAIGNS_SHARED_STYLES, `
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0; }
    .ec-page { flex: 1; min-height: 0; overflow-y: auto; padding: 24px 28px 40px; display: grid; gap: 16px; align-content: start; }
    .ec-page > * { max-width: 1200px; min-width: 0; }
    .ec-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
    h1 { font-family: 'Sora', sans-serif; font-size: 22px; font-weight: 600; margin: 0; color: var(--gray-900); }
    .ec-sub { margin: 4px 0 0; color: var(--gray-500); font-size: 14px; }
    .ec-banner { display: flex; gap: 12px; align-items: flex-start; }
    .ec-banner-btn { margin-top: 8px; }
    .ec-banner-hint { margin-top: 4px; font-size: 12px; }
    .ec-tabs .tab-btn { white-space: nowrap; }
    .ec-cnt { display: inline-block; margin-left: 6px; padding: 0 8px; min-width: 20px; box-sizing: border-box; border-radius: 10px;
              background: color-mix(in srgb, var(--gray-500) 16%, transparent); color: var(--gray-700); font-size: 12px; line-height: 18px;
              font-weight: 500; text-align: center; font-variant-numeric: tabular-nums; }
    @media (max-width: 700px) { .ec-page { padding: 16px; } }
  `],
})
export class CrmEmailCampaignsComponent implements OnInit {
  readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(EmailCampaignsService);
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);

  readonly templatesUrl = SENDGRID_TEMPLATES_URL;
  readonly isAdmin = computed(() => this.auth.isAdmin());
  readonly tab = signal<Tab>('campaigns');
  readonly status = signal<SendgridStatus | null>(null);
  readonly campaignTotal = signal<number | null>(null);
  readonly resultsCampaignId = signal<number | null>(null);
  readonly templates = signal<SendgridTemplate[]>([]);
  readonly templatesLoading = signal(false);
  /** A missing key or permission shows on the templates tab, not as an error of the whole page. */
  readonly templatesError = signal<string | null>(null);

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const requestedTab = params.get('tab');
    if (requestedTab === 'templates' || requestedTab === 'results' || (requestedTab === 'settings' && this.isAdmin())) this.tab.set(requestedTab);
    const campaignId = Number(params.get('campaign'));
    if (this.tab() === 'results' && campaignId > 0) this.resultsCampaignId.set(campaignId);
    this.loadStatus();
    this.loadTemplates();
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    if (tab !== 'results') this.resultsCampaignId.set(null);
    // Other tabs drop the list's filters from the address; the list restores them only on its own tab.
    this.router.navigate([], {
      relativeTo: this.route, replaceUrl: true,
      queryParams: tab === 'campaigns' ? {} : { tab, campaign: tab === 'results' ? this.resultsCampaignId() : null },
    });
  }

  openResults(campaignId: number): void {
    this.resultsCampaignId.set(campaignId);
    this.tab.set('results');
    this.router.navigate([], { relativeTo: this.route, replaceUrl: true, queryParams: { tab: 'results', campaign: campaignId } });
  }

  loadTemplates(refresh = false): void {
    this.templatesLoading.set(true);
    this.api.listTemplates(refresh).subscribe({
      next: templates => { this.templates.set(templates); this.templatesError.set(null); this.templatesLoading.set(false); },
      error: err => {
        this.templates.set([]);
        this.templatesError.set(localizedApiErrorMessage(apiErrorMessage(err), this.transloco)
          ?? this.transloco.translate('campaigns.templates.loadFailed'));
        this.templatesLoading.set(false);
      },
    });
  }

  onSettingsSaved(): void {
    this.api.forgetCachedStatus();
    this.loadStatus();
    this.loadTemplates(true);
  }

  private loadStatus(): void {
    this.api.sendgridStatus().subscribe({ next: status => this.status.set(status), error: () => this.status.set(null) });
  }
}
