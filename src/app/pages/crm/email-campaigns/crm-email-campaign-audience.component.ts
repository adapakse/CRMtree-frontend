import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { CampaignPreview, PreviewRecipient, SendgridStatus } from '../../../core/services/email-campaigns.service';
import { LeadStagesService } from '../../../core/services/lead-stages.service';
import { EMAIL_CAMPAIGNS_SHARED_STYLES } from './email-campaigns.styles';

/** Exclusion reasons the UI translates; any other reason shows the API's label. */
export const KNOWN_EXCLUSIONS = ['no_email', 'invalid_email', 'no_consent', 'suppressed', 'cooldown', 'recent_contact', 'duplicate', 'not_in_crm'];
const KNOWN_PARTNER_STATUSES = ['onboarding', 'active', 'inactive', 'churned'];

export interface ExclusionRow { key: string; label: string; count: number; }

/** Right column of the campaign editor: how many people get the mail, who is left out and why, the list itself. */
@Component({
  selector: 'wt-crm-email-campaign-audience',
  standalone: true,
  imports: [DecimalPipe, RouterModule, TranslocoDirective],
  providers: [provideTranslocoScope('campaigns')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<ng-container *transloco="let t; prefix: 'campaigns'">
  <div class="card ece-sum">
    <div class="ece-sum-top">
      <div><div class="ece-big">{{ preview()?.to_send ?? '—' }}</div><div class="ec-muted">{{ t('audience.willGet', { count: preview()?.to_send ?? 0 }) }}</div></div>
      <div class="ece-sum-r"><div class="ece-mid">{{ preview()?.excluded_total ?? '—' }}</div>
        <div class="ec-muted">{{ t('audience.excludedOf', { total: preview()?.total_candidates ?? 0 }) }}</div></div>
    </div>
    @if (isLoading()) { <div class="ec-muted">{{ t('audience.counting') }}</div> }
    @if (preview(); as p) {
      @if (reasons().length) {
        <div class="ece-sub-h">{{ t('audience.whyExcluded') }}</div>
        <div class="ece-bars">
          @for (reason of reasons(); track reason.key) {
            <div class="ece-bar-row" [class.zero]="!reason.count" [style.background]="barBackground(reason.count, p.total_candidates)"
                 [title]="reason.count ? '' : t('audience.ruleIdle')">
              <span>{{ reason.label }}</span><b>{{ reason.count }}</b>
            </div>
          }
        </div>
      } @else if (p.total_candidates) {
        <div class="ec-muted">{{ t('audience.noneExcluded') }}</div>
      }
    }
    <div class="ece-foot">
      @if (status()?.configured) { {{ t('audience.footConfigured', { email: status()!.from_email || '' }) }} }
      @else { {{ t('audience.footNotConfigured') }} }
    </div>
  </div>

  @if (preview(); as p) {
    <div class="card ece-list">
      <div class="ece-list-head">
        <div class="seg" role="group" [attr.aria-label]="t('audience.listLabel')">
          <button type="button" class="seg-opt" [class.on]="listTab() === 'in'" [attr.aria-pressed]="listTab() === 'in'" (click)="listTab.set('in')">
            {{ t('audience.tabIn', { count: p.to_send }) }}</button>
          <button type="button" class="seg-opt" [class.on]="listTab() === 'out'" [attr.aria-pressed]="listTab() === 'out'" (click)="listTab.set('out')">
            {{ t('audience.tabOut', { count: p.excluded_total }) }}</button>
        </div>
        <button type="button" class="btn-quiet ece-export" [disabled]="isExporting()" (click)="exportRequested.emit()" [title]="t('audience.exportHint')">
          <i class="ei ei-download"></i> {{ t(isExporting() ? 'common.preparing' : 'common.downloadExcel') }}</button>
      </div>
      <div class="ece-table-wrap">
        <table class="ece-table">
          <thead><tr><th>{{ t('audience.company') }}</th><th>{{ t('audience.email') }}</th><th>{{ t(listTab() === 'in' ? 'audience.owner' : 'audience.reason') }}</th></tr></thead>
          <tbody>
            @for (recipient of shown(); track (recipient.entity_type || '') + (recipient.entity_id || recipient.email)) {
              <tr>
                <td>@if (recipient.entity_type) {
                    <a [routerLink]="recipient.entity_type === 'partner' ? ['/crm/partners', recipient.entity_id] : ['/crm/leads', recipient.entity_id]">{{ recipient.company }}</a>
                    <div class="ec-muted">{{ t(recipient.entity_type === 'partner' ? 'common.partner' : 'common.lead') }} · {{ statusLabel(recipient) }}{{ recipient.turnover ? ' · ' + (recipient.turnover | number:'1.0-0') : '' }}</div>
                  } @else { <span class="ec-muted">{{ t('audience.outsideCrm') }}</span> }</td>
                <td class="ece-mail-cell">{{ recipient.email || '—' }}</td>
                <td>@if (listTab() === 'in') { {{ recipient.owner_name || '—' }} } @else { <span class="ece-reason">{{ reasonLabel(recipient) }}</span> }</td>
              </tr>
            } @empty {
              <tr><td colspan="3" class="ece-empty">{{ t(listTab() === 'out' ? 'audience.nobodyExcluded' : (p.total_candidates ? 'audience.allExcluded' : 'audience.noMatch')) }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (p.truncated) { <div class="ec-muted">{{ t('audience.truncated') }}</div> }
    </div>
  }
</ng-container>
  `,
  styles: [EMAIL_CAMPAIGNS_SHARED_STYLES, `
    :host { position: sticky; top: 12px; display: grid; gap: 14px; min-width: 0; }
    .ece-sum { padding: 16px; display: grid; gap: 12px; }
    .ece-sum-top { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; }
    .ece-sum-r { text-align: right; }
    .ece-big { font: 700 40px/1 'Sora', sans-serif; color: var(--ink-strong); font-variant-numeric: tabular-nums; }
    .ece-mid { font: 600 22px/1 'Sora', sans-serif; color: var(--gray-500); font-variant-numeric: tabular-nums; }
    .ece-sub-h { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--gray-500); }
    .ece-bars { display: grid; gap: 6px; }
    .ece-bar-row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; padding: 6px 10px; border-radius: 6px; overflow: hidden; color: var(--gray-700); }
    .ece-bar-row b { font-variant-numeric: tabular-nums; }
    .ece-bar-row.zero { color: var(--gray-400); }
    .ece-foot { font-size: 12px; color: var(--gray-500); border-top: 1px solid var(--gray-100); padding-top: 10px; }
    .ece-list { padding: 12px 14px; display: grid; gap: 10px; }
    .ece-list-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .ece-export { margin-left: auto; }
    .ece-table-wrap { max-height: 460px; overflow: auto; }
    .ece-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .ece-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: var(--gray-500); font-weight: 600;
                    padding: 6px 8px; position: sticky; top: 0; background: var(--surface); }
    .ece-table td { padding: 8px; border-top: 1px solid var(--gray-100); vertical-align: top; }
    .ece-table a { color: var(--gray-900); font-weight: 500; text-decoration: none; }
    .ece-table a:hover { color: var(--orange); }
    .ece-mail-cell { word-break: break-all; color: var(--gray-600); }
    .ece-reason { display: inline-block; border-radius: 6px; padding: 2px 8px; font-size: 12px;
                  background: color-mix(in srgb, #FEFCE8 var(--tint-mix), var(--surface)); color: oklch(from #854D0E max(l, var(--text-min-l)) c h); }
    .ece-empty { text-align: center; color: var(--gray-500); padding: 20px 8px !important; }
    @container ece (max-width: 1000px) { :host { position: static; } .ece-table-wrap { max-height: 320px; } }
    @container ece (max-width: 640px) {
      .ece-big { font-size: 32px; }
      .ece-table th:nth-child(2), .ece-table td:nth-child(2) { display: none; }
    }
  `],
})
export class CrmEmailCampaignAudienceComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly stages = inject(LeadStagesService);

  readonly preview = input<CampaignPreview | null>(null);
  readonly reasons = input<ExclusionRow[]>([]);
  readonly status = input<SendgridStatus | null>(null);
  readonly isLoading = input(false);
  readonly isExporting = input(false);
  /** Name of the consent type the campaign requires (part of the "no consent" reason). */
  readonly consentLabel = input('');
  readonly exportRequested = output<void>();

  readonly listTab = signal<'in' | 'out'>('in');
  readonly shown = computed(() => (this.preview()?.recipients ?? []).filter(recipient => this.listTab() === 'in' ? !recipient.reason : !!recipient.reason));

  /** Share of the row in its background (a gradient, so the text always stays above the bar). */
  barBackground(count: number, total: number): string {
    const share = total ? Math.round((count / total) * 100) : 0;
    return `linear-gradient(90deg, color-mix(in srgb, #FEF9C3 var(--tint-mix), var(--surface)) ${share}%, transparent ${share}%)`;
  }

  statusLabel(recipient: PreviewRecipient): string {
    const status = recipient.status;
    if (!status) return '—';
    if (recipient.entity_type === 'lead') return this.stages.label(status);
    return KNOWN_PARTNER_STATUSES.includes(status) ? this.transloco.translate('crm.labels.partnerStatuses.' + status) : status;
  }

  reasonLabel(recipient: PreviewRecipient): string {
    const reason = recipient.reason;
    if (reason && KNOWN_EXCLUSIONS.includes(reason)) return this.transloco.translate('campaigns.exclusions.' + reason, { consent: this.consentLabel() });
    return recipient.reason_label || reason || '';
  }
}
