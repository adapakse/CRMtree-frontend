import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import {
  CampaignAudience, CampaignCriteria, CampaignPreview, CsvImportResult, EmailCampaign, EmailCampaignsService, FilterOptions,
  PreviewRules, SendgridStatus, SendgridTemplate, campaignSlug, saveBlob,
} from '../../../core/services/email-campaigns.service';
import { describeHttpError } from '../../../core/services/http-error-message';
import { LeadStagesService } from '../../../core/services/lead-stages.service';
import { CrmEmailCampaignAudienceComponent, ExclusionRow, KNOWN_EXCLUSIONS } from './crm-email-campaign-audience.component';
import { SENDGRID_TEMPLATES_URL } from './campaign-period';
import { EMAIL_CAMPAIGNS_SHARED_STYLES } from './email-campaigns.styles';
import { TenantDefaultLabels } from '../../../core/i18n/tenant-default-label.pipe';

type PickListKey = 'industries' | 'tags' | 'owners';
type ChipKey = 'statuses' | 'stages' | 'sizes' | 'segments';
const KNOWN_PARTNER_STATUSES = ['onboarding', 'active', 'inactive', 'churned'];
/** Segments the UI translates; other segments the API offers keep its own name and description. */
const KNOWN_SEGMENTS = ['churn', 'dormant', 'no_contact_90', 'inbound_no_contact'];
// Its API description names the tenant's own stages, so Polish keeps it; other languages get a general text.
const SEGMENTS_WITH_TENANT_DESCRIPTION = ['inbound_no_contact'];
const KNOWN_MISSING_SETTINGS = ['api_key', 'from_email', 'asm_group_id'];
const MAX_CSV_BYTES = 5 * 1024 * 1024;

/**
 * Campaign editor: 1. which mail → 2. who gets it (groups, optional narrowing,
 * folded sending rules) → on the right, live: how many get it, who is left out and why.
 */
@Component({
  selector: 'wt-crm-email-campaign-editor',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterModule, TranslocoDirective, CrmEmailCampaignAudienceComponent],
  providers: [provideTranslocoScope('campaigns')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="ece" *transloco="let t; prefix: 'campaigns'">
  <div class="ece-bar">
    <a class="ece-back" routerLink="/crm/email-campaigns" [title]="t('editor.back')" [attr.aria-label]="t('editor.back')"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg></a>
    <input class="ece-name" [(ngModel)]="name" (ngModelChange)="isDirty.set(true)" [disabled]="isLocked()" [placeholder]="t('editor.namePlaceholder')" [attr.aria-label]="t('editor.nameLabel')"
           [class.fi-err]="highlight() === 'name' && !name.trim()">
    <span [class]="'ec-badge st-' + status()">{{ t('status.' + status()) }}</span>
    @if (!isLocked()) {
      <button class="btn btn-g" [disabled]="isSaving() || !isDirty()" [title]="isDirty() ? '' : t('editor.noChanges')" (click)="save()">{{ t(isSaving() ? 'editor.saving' : (isDirty() ? 'editor.saveDraft' : 'editor.saved')) }}</button>
      <button class="btn btn-g" [disabled]="isTesting()" (click)="sendTest()" [title]="t('editor.testHint')">
        {{ t(isTesting() ? 'editor.sendingTest' : 'editor.sendTest') }}</button>
      <button class="btn btn-p" [title]="t('editor.sendHint')" (click)="openSendConfirm()">
        <i class="ei ei-send"></i> {{ t('editor.send') }}</button>
    }
  </div>
  @if (message(); as note) { <div [class]="note.isError ? 'ec-error' : 'ec-ok'" role="status">{{ note.text }}</div> }
  @if (isConfirmOpen()) {
    <div class="ec-warn ece-confirm">
      <div><b>{{ t('editor.confirm.title', { name: name }) }}</b>
        <p>{{ t('editor.confirm.body', { count: preview()?.to_send ?? 0, email: sendgridStatus()?.from_email || '' }) }}</p>
        @if (isOverLimit()) {
          <label class="ece-large" [class.is-err]="highlight() === 'large' && !isLargeConfirmed()"><input type="checkbox" [ngModel]="isLargeConfirmed()" (ngModelChange)="isLargeConfirmed.set($event)">
            {{ t('editor.confirm.large', { limit: sendgridStatus()?.max_recipients ?? 0 }) }}</label>
          @if (highlight() === 'large' && !isLargeConfirmed()) { <span class="ferr" role="alert">{{ t('editor.block.confirmLarge') }}</span> }
        }
      </div>
      <div class="ece-confirm-acts">
        <button class="btn btn-g" (click)="isConfirmOpen.set(false); isLargeConfirmed.set(false)">{{ t('common.cancel') }}</button>
        <button class="btn btn-p" [disabled]="isSending()" (click)="send()">
          {{ t(isSending() ? 'editor.confirm.starting' : 'editor.confirm.sendNow') }}</button>
      </div>
    </div>
  }
  @if (isLocked()) {
    <div class="ec-info ece-locked">
      @switch (status()) {
        @case ('sending') { <span><b>{{ t('editor.locked.sendingTitle') }}</b> {{ t('editor.locked.sendingBody') }}</span> }
        @case ('failed') { <span><b>{{ t('editor.locked.failedTitle') }}</b> {{ sendError() || '' }}</span> }
        @default { <span><b>{{ t('editor.locked.sentTitle', { date: (sentAt() | date:'d.MM.yyyy, HH:mm') }) }}</b> {{ t('editor.locked.sentBody') }}</span> }
      }
      <a routerLink="/crm/email-campaigns" [queryParams]="{ tab: 'results', campaign: id }">{{ t('editor.locked.results') }}</a>
    </div>
  }

  <div class="ece-grid">
    <fieldset class="ece-form" [disabled]="isLocked()">
      <section class="card ece-sec">
        <div class="ece-h"><span class="ece-n">1</span><h2>{{ t('editor.step1') }}</h2></div>
        @if (templatesError()) { <p class="ec-warn ece-note">{{ templatesError() }}</p> }
        @if (isTemplateMissing()) { <p class="ec-warn ece-note">{{ t('editor.templateMissing') }}</p> }
        @if (highlight() === 'template' && !templateId()) { <p class="ferr" role="alert">{{ t('editor.block.pickTemplate') }}</p> }
        <div class="ece-tpls" role="radiogroup" [attr.aria-label]="t('editor.templateLabel')" [class.is-err]="highlight() === 'template' && !templateId()">
          @for (template of templates(); track template.id) {
            <button type="button" class="ece-tpl" role="radio" [attr.aria-checked]="templateId() === template.id" (click)="pickTemplate(template)">
              @if (template.thumbnail_url) { <img class="ece-tpl-img" [src]="template.thumbnail_url" alt="" loading="lazy"> } @else { <span class="ece-tpl-dot"></span> }
              <span class="ece-tpl-txt"><b>{{ template.name }}</b><small>{{ template.subject || t('templates.noSubject') }}</small></span>
            </button>
          }
          <a class="ece-tpl ece-tpl-new" [href]="templatesUrl" target="_blank" rel="noopener"><i class="ei ei-plus"></i> {{ t('templates.newInSendgrid') }} <i class="ei ei-link"></i></a>
        </div>
        <div class="ece-row">
          @if (templateId()) {
            <button type="button" class="ec-link" (click)="toggleMailPreview()">{{ t(isMailPreviewOpen() ? 'editor.hideMail' : 'editor.showMail') }}</button>
            <a class="ec-link" [href]="templatesUrl + '/' + templateId()" target="_blank" rel="noopener">{{ t('templates.editInSendgrid') }} <i class="ei ei-link"></i></a>
          }
          <button type="button" class="ec-link" [disabled]="isLoadingTemplates()" (click)="loadTemplates(true)">{{ t(isLoadingTemplates() ? 'common.refreshing' : 'editor.refreshList') }}</button>
        </div>
        @if (isMailPreviewOpen()) {
          @if (templateHtml()) {
            <p class="ece-hint">{{ t('editor.mergeFieldsHint', { firstName: firstNameTag, company: companyTag }) }}</p>
            <iframe class="ece-mail" [srcdoc]="templateHtml()!" [title]="t('editor.mailPreview')" sandbox=""></iframe>
          } @else { <div class="ec-muted">{{ t('editor.loadingMail') }}</div> }
        }
      </section>

      <section class="card ece-sec">
        <div class="ece-h"><span class="ece-n">2</span><h2>{{ t('editor.step2') }}</h2></div>
        <div class="seg ece-src" role="group" [attr.aria-label]="t('editor.sourceLabel')">
          <button type="button" class="seg-opt" [class.on]="criteria.source !== 'csv'" [attr.aria-pressed]="criteria.source !== 'csv'" (click)="setSource('filters')">{{ t('editor.sourceFilters') }}</button>
          <button type="button" class="seg-opt" [class.on]="criteria.source === 'csv'" [attr.aria-pressed]="criteria.source === 'csv'" (click)="setSource('csv')">{{ t('editor.sourceCsv') }}</button>
        </div>
        @if (criteria.source === 'csv') {
          <p class="ece-hint">{{ t('editor.csv.hint') }}</p>
          <div class="ece-upload">
            <button type="button" class="btn btn-g" (click)="csvFile.click()" [disabled]="isImporting()"><span aria-hidden="true">📄</span>
              {{ t(isImporting() ? 'editor.csv.checking' : (criteria.csv_emails?.length ? 'editor.csv.uploadOther' : 'editor.csv.pick')) }}</button>
            <input #csvFile type="file" accept=".csv,text/csv,.txt" hidden (change)="onCsv($event)">
            @if (criteria.csv_emails?.length) { <span class="ec-muted">{{ t('editor.csv.onList', { count: criteria.csv_emails!.length }) }}</span> }
          </div>
          @if (csvReport(); as report) {
            <div class="ece-report">
              <div>{{ t('editor.csv.report', { rows: report.rows_total, column: report.email_column, accepted: report.accepted, inCrm: report.in_crm, rejected: report.rejected_total }) }}</div>
              @if (report.rejected_total) {
                <details><summary>{{ t('editor.csv.showRejected') }}</summary>
                  <table class="ece-table"><thead><tr><th>{{ t('editor.csv.row') }}</th><th>{{ t('editor.csv.value') }}</th><th>{{ t('editor.csv.reason') }}</th></tr></thead><tbody>
                    @for (rejected of report.rejected; track rejected.row) {
                      <tr><td>{{ rejected.row }}</td><td class="ece-break">{{ rejected.value || '—' }}</td><td>{{ rejected.reason }}</td></tr>
                    }
                  </tbody></table>
                  @if (report.rejected_total > report.rejected.length) { <div class="ec-muted">{{ t('editor.csv.firstShown', { count: report.rejected.length }) }}</div> }
                </details>
              }
            </div>
          }
        } @else {
          <p class="ece-hint">{{ t('editor.groupsHint', { consent: consentLabel() }) }}</p>
          <div class="ece-segs">
            <button type="button" class="ece-seg-card" [class.on]="!criteria.segments.length" (click)="pickEveryone()">
              <b>{{ t('editor.everyone') }}</b><span>{{ t('editor.everyoneHint', { consent: consentLabel() }) }}</span><i>{{ t('audienceTypes.both') }}</i>
            </button>
            @for (segment of segments(); track segment.key) {
              <button type="button" class="ece-seg-card" [class.on]="has('segments', segment.key)" (click)="toggle('segments', segment.key)">
                <b>{{ segmentText(segment.key, 'label', segment.label) }}</b><span>{{ segmentText(segment.key, 'description', segment.description) }}</span>
                <i>{{ t('audienceTypes.' + segment.audience) }}</i>
              </button>
            }
          </div>
          @if (segmentAudience() === 'both') {
            <div class="ece-who">
              <span class="ece-lbl">{{ t('editor.sendTo') }}</span>
              <div class="seg" role="radiogroup" [attr.aria-label]="t('editor.sendTo')">
                @for (option of audienceOptions; track option) {
                  <button type="button" class="seg-opt" role="radio" [class.on]="typeFilter() === option" [attr.aria-checked]="typeFilter() === option"
                          (click)="setType(option)">{{ t('editor.typeFilter.' + option) }}</button>
                }
              </div>
            </div>
          }

          <details class="ece-more" [open]="isNarrowOpen()" (toggle)="isNarrowOpen.set($any($event.target).open)">
            <summary>{{ t('editor.narrow') }} <span class="ec-muted">{{ t('common.optional') }}</span>
              @if (activeFilterCount()) { <span class="ece-count">{{ activeFilterCount() }}</span>
                <button type="button" class="ec-link ece-clear" (click)="clearFilters(); $event.preventDefault()">{{ t('editor.clear') }}</button> }
            </summary>
            <div class="ece-more-body">
              @if (criteria.audience !== 'leads' && options()?.turnover_available) {
                <div class="ece-fld"><span class="ece-lbl">{{ t('editor.turnover') }} <span class="ec-muted">— {{ t('editor.turnoverHint') }}</span></span>
                  <div class="ece-range">
                    <input type="number" class="ec-input" min="0" step="1000" [placeholder]="t('results.from')" [ngModel]="criteria.turnover_min ?? null" (ngModelChange)="setTurnover('turnover_min', $event)" [attr.aria-label]="t('editor.turnoverFrom')">
                    <span>–</span>
                    <input type="number" class="ec-input" min="0" step="1000" [placeholder]="t('results.to')" [ngModel]="criteria.turnover_max ?? null" (ngModelChange)="setTurnover('turnover_max', $event)" [attr.aria-label]="t('editor.turnoverTo')">
                  </div></div>
              }
              <div class="ece-fld"><span class="ece-lbl">{{ t('editor.lastContact') }} <span class="ec-muted">— {{ t('editor.lastContactHint') }}</span></span>
                <div class="ece-range">
                  <input type="date" class="ec-input" [ngModel]="criteria.last_contact_from ?? ''" (ngModelChange)="setDate('last_contact_from', $event)" [attr.aria-label]="t('editor.lastContactFrom')">
                  <span>–</span>
                  <input type="date" class="ec-input" [ngModel]="criteria.last_contact_to ?? ''" (ngModelChange)="setDate('last_contact_to', $event)" [attr.aria-label]="t('editor.lastContactTo')">
                </div></div>
              @if (criteria.audience !== 'leads' && options()?.partner_statuses?.length) {
                <div class="ece-fld"><span class="ece-lbl">{{ t('editor.partnerStatus') }}</span><div class="ece-chips">
                  @for (item of options()!.partner_statuses; track item.status) {
                    <button type="button" class="ece-chip" [attr.aria-pressed]="has('statuses', item.status)" (click)="toggle('statuses', item.status)">{{ partnerStatusLabel(item.status) }} <i>{{ item.n }}</i></button>
                  }</div></div>
              }
              @if (criteria.audience !== 'partners' && options()?.lead_stages?.length) {
                <div class="ece-fld"><span class="ece-lbl">{{ t('editor.leadStage') }}</span><div class="ece-chips">
                  @for (item of options()!.lead_stages; track item.stage) {
                    <button type="button" class="ece-chip" [attr.aria-pressed]="has('stages', item.stage)" (click)="toggle('stages', item.stage)">{{ item.label || stageLabel(item.stage) }} <i>{{ item.n }}</i></button>
                  }</div></div>
              }
              @for (list of pickLists; track list) {
                @if (pickOptions(list).length || criteria[list].length) {
                  <div class="ece-fld"><label class="ece-lbl" [for]="'ecePick' + list">{{ t('editor.pick.' + list) }}</label>
                    <div class="ece-chips">
                      @for (value of criteria[list]; track value) {
                        <span class="ece-tag">{{ pickLabel(list, value) }}<button type="button" (click)="toggle(list, value)" [attr.aria-label]="t('editor.removeValue', { value: pickLabel(list, value) })"><i class="ei ei-x-circle"></i></button></span>
                      }
                      @if (pickOptions(list).length) {
                        <select class="sel ece-pick" [id]="'ecePick' + list" (change)="pick(list, $event)">
                          <option value="">{{ t('editor.pick.add.' + list) }}</option>
                          @for (option of pickOptions(list); track option.value) { <option [value]="option.value">{{ option.label }}</option> }
                        </select>
                      }
                    </div></div>
                }
              }
              @if (criteria.audience !== 'partners' && options()?.company_sizes?.length) {
                <div class="ece-fld"><span class="ece-lbl">{{ t('editor.companySize') }} <span class="ec-muted">— {{ t('audienceTypes.leads') }}</span></span><div class="ece-chips">
                  @for (size of options()!.company_sizes; track size) {
                    <button type="button" class="ece-chip" [attr.aria-pressed]="has('sizes', size)" (click)="toggle('sizes', size)">{{ size }}</button>
                  }</div></div>
              }
            </div>
          </details>
        }

        <details class="ece-more" [open]="isRulesOpen()" (toggle)="isRulesOpen.set($any($event.target).open)">
          <summary>{{ t('editor.rules.title') }} <span class="ec-muted">— {{ rulesSummary() }}</span></summary>
          <div class="ece-more-body">
            <div class="ece-fld"><label class="ece-lbl" for="eceRequester">{{ t('editor.rules.requester') }} <span class="ec-muted">— {{ t('editor.rules.requesterHint') }}</span></label>
              <select id="eceRequester" class="sel ece-req-sel" [ngModel]="requestedBy" (ngModelChange)="requestedBy = $event; isDirty.set(true)">
                <option value="">{{ t('editor.rules.me') }}</option>
                @for (person of requesters(); track person.id) { <option [value]="person.id">{{ person.display_name }}</option> }
              </select></div>
            <div class="ece-rule">
              <label for="eceMinDays">{{ t('editor.rules.minDays') }}</label>
              <input id="eceMinDays" type="number" class="ec-input" min="0" max="365" [(ngModel)]="minDays" (ngModelChange)="changed()"> <span>{{ t('editor.rules.days') }}</span>
            </div>
            <div class="ece-rule">
              <input id="eceRecentOn" type="checkbox" [(ngModel)]="isRecentContactRuleOn" (ngModelChange)="changed()">
              <label for="eceRecentOn">{{ t('editor.rules.recentContact') }}</label>
              <input type="number" class="ec-input" min="1" max="365" [(ngModel)]="recentDays" [disabled]="!isRecentContactRuleOn" (ngModelChange)="changed()" [attr.aria-label]="t('editor.rules.daysLabel')"> <span>{{ t('editor.rules.days') }}</span>
            </div>
            <p class="ece-hint">{{ t('editor.rules.always', { consent: consentLabel() }) }}</p>
            <div class="ece-fld"><label class="ece-lbl" for="eceUtm">{{ t('editor.rules.utm') }} <span class="ec-muted">{{ t('common.optional') }}</span></label>
              <input id="eceUtm" class="ec-input" [(ngModel)]="utm" (ngModelChange)="isDirty.set(true)" [placeholder]="slug(name)">
              <span class="ec-muted">{{ t('editor.rules.utmHint') }}</span></div>
          </div>
        </details>
      </section>
    </fieldset>

    <wt-crm-email-campaign-audience [preview]="preview()" [reasons]="reasons()" [status]="sendgridStatus()" [isLoading]="isPreviewLoading()"
                                    [isExporting]="isExporting()" [consentLabel]="consentLabel()" (exportRequested)="exportRecipients()" />
  </div>

  <div class="card ece-xls">
    <div class="ece-foot-txt">
      <b>{{ t('common.downloadExcel') }}</b>
      <span class="ec-muted">{{ t(status() === 'draft' ? 'editor.excel.draftHint' : 'editor.excel.sentHint') }}</span>
    </div>
    @if (status() === 'draft') {
      <button class="btn btn-g" [disabled]="isExporting() || !preview()" (click)="exportRecipients()"><i class="ei ei-download"></i> {{ t(isExporting() ? 'common.preparing' : 'editor.excel.recipients') }}</button>
    } @else {
      <button class="btn btn-g" [disabled]="isReporting()" (click)="exportReport()"><i class="ei ei-download"></i> {{ t(isReporting() ? 'common.preparing' : 'editor.excel.results') }}</button>
    }
  </div>
</div>
  `,
  styles: [EMAIL_CAMPAIGNS_SHARED_STYLES, `
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0; }
    .ece { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 24px 40px; container: ece / inline-size; display: grid; gap: 12px; align-content: start; }
    .ece-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .ece-back { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 10px; color: var(--gray-600); text-decoration: none; font-size: 18px; }
    .ece-back:hover { background: var(--gray-100); color: var(--orange); }
    .ece-name { flex: 1 1 260px; min-width: 0; font: 600 16px 'Sora', sans-serif; border: 1px solid transparent; border-radius: 8px; padding: 6px 10px;
                background: transparent; color: var(--gray-900); }
    .ece-name:hover, .ece-name:focus { border-color: var(--gray-200); background: var(--surface); outline: none; }
    .ece-confirm { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
    .ece-confirm p { margin: 4px 0 0; font-size: 14px; }
    .ece-confirm-acts { display: flex; gap: 8px; }
    .ece-large { display: flex; gap: 8px; align-items: flex-start; margin-top: 8px; font-size: 12px; cursor: pointer; }
    .ece-large input { margin-top: 2px; }
    .ece-locked { align-items: center; }
    .ece-locked a { color: var(--orange); margin-left: auto; }
    .ece-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: 16px; align-items: start; }
    fieldset.ece-form { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; gap: 14px; }
    fieldset.ece-form:disabled { opacity: .75; }
    .ece-sec { padding: 16px; display: grid; gap: 14px; }
    .ece-h { display: flex; align-items: center; gap: 10px; }
    .ece-h h2 { margin: 0; font: 600 16px 'Sora', sans-serif; color: var(--gray-900); }
    .ece-n { width: 22px; height: 22px; border-radius: 50%; background: var(--ink-strong); color: var(--surface); font-size: 12px; font-weight: 600; display: grid; place-items: center; }
    .ece-note { margin: 0; font-size: 12px; padding: 8px 10px; }
    .ece-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .ece-tpls { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
    .ece-tpls.is-err { outline: 1.5px solid #DC2626; outline-offset: 4px; border-radius: 10px; }
    .ece-large.is-err { color: oklch(from #dc2626 max(l, var(--text-min-l)) c h); }
    .ece-tpl { display: flex; align-items: flex-start; gap: 10px; text-align: left; border: 1px solid var(--gray-200); background: var(--surface); border-radius: 10px;
               padding: 10px 12px; cursor: pointer; font-family: inherit; text-decoration: none; min-width: 0; color: inherit; }
    .ece-tpl:hover { border-color: var(--gray-300); }
    .ece-tpl[aria-checked="true"] { border-color: var(--orange); background: var(--orange-pale); box-shadow: inset 0 0 0 1px var(--orange); }
    .ece-tpl-img { flex: none; width: 44px; height: 56px; object-fit: cover; object-position: top; border-radius: 6px; border: 1px solid var(--gray-200); background: var(--gray-50); }
    .ece-tpl-dot { flex: none; width: 16px; height: 16px; box-sizing: border-box; border-radius: 50%; border: 2px solid var(--gray-300); margin-top: 2px; }
    .ece-tpl[aria-checked="true"] .ece-tpl-dot { border: 6px solid var(--orange); }
    .ece-tpl-txt { min-width: 0; display: grid; }
    .ece-tpl-txt b { font-size: 14px; color: var(--gray-900); font-weight: 600; }
    .ece-tpl-txt small { font-size: 12px; color: var(--gray-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ece-tpl-new { align-items: center; justify-content: center; gap: 6px; border-style: dashed; color: var(--gray-600); font-size: 14px; font-weight: 500; }
    .ece-tpl-new:hover { color: var(--orange); border-color: var(--orange); }
    .ece-mail { width: 100%; height: 520px; border: 1px solid var(--gray-200); border-radius: 8px; background: var(--gray-50); }
    .ece-hint { margin: 0; font-size: 12px; color: var(--gray-500); }
    .ece-src { width: fit-content; max-width: 100%; }
    .ece-upload { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .ece-report { border: 1px solid var(--gray-200); border-radius: 10px; padding: 10px 12px; font-size: 14px; display: grid; gap: 8px; }
    .ece-report summary { cursor: pointer; color: var(--orange); font-size: 12px; }
    .ece-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .ece-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: var(--gray-500); font-weight: 600; padding: 6px 8px; }
    .ece-table td { padding: 8px; border-top: 1px solid var(--gray-100); vertical-align: top; }
    .ece-break { word-break: break-all; }
    .ece-segs { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
    .ece-seg-card { text-align: left; border: 1px solid var(--gray-200); background: var(--surface); border-radius: 10px; padding: 10px 12px; cursor: pointer;
                    display: grid; gap: 2px; font-family: inherit; color: inherit; }
    .ece-seg-card b { font-size: 12px; color: var(--gray-900); font-weight: 600; }
    .ece-seg-card span { font-size: 12px; color: var(--gray-500); line-height: 1.4; }
    .ece-seg-card i { font-style: normal; font-size: 10px; color: var(--gray-400); margin-top: 4px; }
    .ece-seg-card.on { border-color: var(--orange); background: var(--orange-pale); box-shadow: inset 0 0 0 1px var(--orange); }
    .ece-who { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .ece-who .seg { max-width: 100%; flex-wrap: wrap; }
    .ece-more { border: 1px solid var(--gray-200); border-radius: 10px; }
    .ece-more summary { cursor: pointer; padding: 10px 12px; font-size: 14px; font-weight: 600; color: var(--gray-800); display: flex; align-items: center; gap: 8px; list-style: none; flex-wrap: wrap; }
    .ece-more summary::-webkit-details-marker { display: none; }
    .ece-more summary::before { content: ''; flex: none; width: 6px; height: 6px; margin: 0 2px; border-right: 2px solid var(--gray-400); border-bottom: 2px solid var(--gray-400);
                                transform: rotate(-45deg); transition: transform .15s; }
    .ece-more[open] summary::before { transform: rotate(45deg); }
    .ece-more-body { display: grid; gap: 14px; padding: 4px 12px 14px; }
    .ece-count { background: var(--ink-strong); color: var(--surface); font-size: 12px; border-radius: 10px; padding: 0 8px; }
    .ece-clear { margin-left: auto; font-weight: 500; }
    .ece-fld { display: grid; gap: 6px; }
    .ece-lbl { font-size: 12px; font-weight: 600; color: var(--gray-600); }
    .ece-range { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .ece-range input { width: 150px; }
    .ece-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .ece-chip { border: 1px solid var(--gray-200); background: var(--surface); border-radius: 20px; padding: 4px 12px; font: 500 12px inherit; font-family: inherit;
                cursor: pointer; color: var(--gray-700); }
    .ece-chip i { font-style: normal; color: var(--gray-400); margin-left: 4px; }
    .ece-chip[aria-pressed="true"] { border-color: var(--orange); background: var(--orange-pale); color: var(--orange-dark); }
    .ece-chip[aria-pressed="true"] i { color: var(--orange-text); }
    .ece-tag { display: inline-flex; align-items: center; gap: 4px; background: var(--chip-bg); color: var(--chip-text); border-radius: 20px; padding: 4px 4px 4px 12px; font-size: 12px; }
    .ece-tag button { display: inline-grid; place-items: center; border: 0; background: transparent; color: inherit; width: 18px; height: 18px; border-radius: 50%; cursor: pointer; padding: 0; }
    .ece-tag button:hover { background: var(--hover-overlay); }
    .ece-pick { max-width: 220px; }
    .ece-req-sel { max-width: 320px; }
    .ece-rule { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 14px; color: var(--gray-700); }
    .ece-rule input[type=number] { width: 80px; }
    .ece-xls { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; padding: 14px 16px; margin-top: 4px; }
    .ece-foot-txt { display: grid; gap: 2px; min-width: 0; }
    .ece-foot-txt b { font-size: 14px; color: var(--gray-900); }
    @container ece (max-width: 1000px) { .ece-grid { grid-template-columns: minmax(0, 1fr); } }
    @container ece (max-width: 640px) {
      .ece-name { flex-basis: 100%; order: -1; }
      .ece-back { order: -2; }
      .ece-bar .btn { flex: 1; justify-content: center; }
      .ece-segs { grid-template-columns: minmax(0, 1fr); }
      .ece-mail { height: 420px; }
    }
    @media (max-width: 700px) { .ece { padding: 12px; } }
  `],
})
export class CrmEmailCampaignEditorComponent implements OnInit, OnDestroy {
  private readonly api = inject(EmailCampaignsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly transloco = inject(TranslocoService);
  private readonly tenantLabels = inject(TenantDefaultLabels);
  private readonly stages = inject(LeadStagesService);

  readonly templatesUrl = SENDGRID_TEMPLATES_URL;
  // SendGrid's Handlebars tags, filled in by the CRM at sending; shown literally, never translated.
  readonly firstNameTag = '{{imie}}';
  readonly companyTag = '{{firma}}';
  readonly pickLists: PickListKey[] = ['owners', 'industries', 'tags'];
  readonly audienceOptions: CampaignAudience[] = ['both', 'partners', 'leads'];

  id: number | null = null;
  name = '';
  minDays = 30;
  isRecentContactRuleOn = false;
  recentDays = 14;
  utm = '';
  requestedBy = '';
  criteria: CampaignCriteria = { audience: 'both', segments: [], industries: [], statuses: [], stages: [], owners: [], tags: [], sizes: [] };
  /** Bumped on every criteria change, so the computed values that read the plain `criteria` object recompute. */
  private readonly criteriaRevision = signal(0);

  readonly status = signal<string>('draft');
  readonly sentAt = signal<string | null>(null);
  readonly sendError = signal<string | null>(null);
  readonly templateId = signal<string | null>(null);
  readonly templates = signal<SendgridTemplate[]>([]);
  readonly isLoadingTemplates = signal(false);
  readonly templatesError = signal<string | null>(null);
  readonly selectedTemplate = computed(() => this.templates().find(template => template.id === this.templateId()) ?? null);
  /** Template version of this campaign's last test ("version id|change date"). */
  readonly testedVersion = signal<string | null>(null);
  readonly requesters = signal<{ id: string; display_name: string }[]>([]);
  readonly sendgridStatus = signal<SendgridStatus | null>(null);
  readonly typeFilter = signal<CampaignAudience>('both');
  readonly csvReport = signal<CsvImportResult | null>(null);
  readonly isImporting = signal(false);
  readonly isExporting = signal(false);
  readonly isReporting = signal(false);
  readonly isTesting = signal(false);
  readonly isSending = signal(false);
  readonly isConfirmOpen = signal(false);
  readonly isLargeConfirmed = signal(false);
  readonly isLocked = signal(false);
  readonly options = signal<FilterOptions | null>(null);
  readonly segments = computed(() => (this.options()?.segments ?? []).filter(segment => !segment.unavailable));
  readonly preview = signal<CampaignPreview | null>(null);
  readonly isPreviewLoading = signal(false);
  readonly templateHtml = signal<SafeHtml | null>(null);
  readonly isMailPreviewOpen = signal(false);
  readonly isNarrowOpen = signal(false);
  readonly isTemplateMissing = signal(false);
  readonly isRulesOpen = signal(false);
  readonly isDirty = signal(false);
  readonly isSaving = signal(false);
  readonly message = signal<{ text: string; isError: boolean } | null>(null);

  /** The consent type the campaign requires, per tenant; null leaves the choice to the server. */
  readonly consentKey = computed(() => this.options()?.consent_key || this.sendgridStatus()?.consent_key || null);
  readonly consentLabel = computed(() => this.tenantLabels.label('consentLabels', this.options()?.consent_label || this.sendgridStatus()?.consent_label)
    || this.transloco.translate('campaigns.common.marketingConsent'));
  /** The selected template was tested after its last change (the server checks the same before sending). */
  readonly isTested = computed(() => {
    const template = this.selectedTemplate();
    return !!template && this.testedVersion() === `${template.version_id || ''}|${template.updated_at || ''}`;
  });
  readonly isOverLimit = computed(() => (this.preview()?.to_send || 0) > (this.sendgridStatus()?.max_recipients || Infinity));
  /** Exclusion reasons with counts. Active sending rules are listed even at zero, so it is clear they work. */
  readonly reasons = computed<ExclusionRow[]>(() => {
    this.criteriaRevision();
    const preview = this.preview();
    if (!preview) return [];
    const minDays = Number(this.minDays) || 0;
    const isActive = (key: string) => (key === 'cooldown' && minDays > 0) || (key === 'recent_contact' && this.isRecentContactRuleOn);
    return Object.keys(preview.exclusion_labels)
      .map(key => ({ key, label: this.exclusionLabel(key, preview, minDays), count: preview.excluded[key] || 0 }))
      .filter(row => row.count > 0 || isActive(row.key));
  });
  readonly activeFilterCount = computed(() => {
    this.criteriaRevision();
    const c = this.criteria;
    return c.statuses.length + c.stages.length + c.owners.length + c.industries.length + c.tags.length + c.sizes.length
      + (c.turnover_min != null || c.turnover_max != null ? 1 : 0)
      + (c.last_contact_from || c.last_contact_to ? 1 : 0);
  });
  readonly segmentAudience = computed<CampaignAudience>(() => {
    this.criteriaRevision();
    const picked = (this.options()?.segments ?? []).filter(segment => this.criteria.segments.includes(segment.key));
    const audiences = new Set(picked.map(segment => segment.audience));
    return !picked.length || audiences.has('both') || audiences.size > 1 ? 'both' : [...audiences][0];
  });

  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private messageTimer: ReturnType<typeof setTimeout> | undefined;
  private statusTimer: ReturnType<typeof setTimeout> | undefined;
  private previewSequence = 0;

  ngOnInit(): void {
    this.name = this.transloco.translate('campaigns.editor.defaultName');
    this.api.filterOptions().subscribe({ next: options => { this.options.set(options); this.criteriaRevision.update(value => value + 1); }, error: () => undefined });
    this.api.requesters().subscribe({ next: people => this.requesters.set(people), error: () => undefined });
    this.api.sendgridStatus().subscribe({ next: status => this.sendgridStatus.set(status), error: () => undefined });
    this.loadTemplates();
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam && idParam !== 'new') {
      this.id = Number(idParam);
      this.api.getCampaign(this.id).subscribe({
        next: campaign => this.applyCampaign(campaign),
        error: error => this.flash(describeHttpError(error, this.transloco), true),
      });
    } else {
      this.isDirty.set(true);
      this.runPreview();
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.previewTimer);
    clearTimeout(this.messageTimer);
    clearTimeout(this.statusTimer);
  }

  partnerStatusLabel(status: string): string {
    return KNOWN_PARTNER_STATUSES.includes(status) ? this.transloco.translate('crm.labels.partnerStatuses.' + status) : status;
  }
  stageLabel(stage: string): string { return this.stages.label(stage); }
  segmentText(key: string, part: 'label' | 'description', apiText: string): string {
    if (!KNOWN_SEGMENTS.includes(key)) return apiText;
    if (part === 'description' && SEGMENTS_WITH_TENANT_DESCRIPTION.includes(key) && this.transloco.getActiveLang() === 'pl') return apiText;
    return this.transloco.translate(`campaigns.segments.${key}.${part}`);
  }
  has(key: ChipKey | PickListKey, value: string): boolean { return this.criteria[key].includes(value); }

  pickOptions(list: PickListKey): { value: string; label: string }[] {
    this.criteriaRevision();
    const options = this.options();
    const all = list === 'owners'
      ? (options?.owners ?? []).map(owner => ({ value: owner.id, label: owner.display_name }))
      : ((list === 'industries' ? options?.industries : options?.tags) ?? []).map(value => ({ value, label: value }));
    return all.filter(option => !this.criteria[list].includes(option.value));
  }
  pickLabel(list: PickListKey, value: string): string {
    if (list !== 'owners') return value;
    return this.options()?.owners.find(owner => owner.id === value)?.display_name ?? value;
  }
  pick(list: PickListKey, event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (select.value) this.toggle(list, select.value);
    select.value = '';
  }
  toggle(key: ChipKey | PickListKey, value: string): void {
    const values = this.criteria[key];
    this.criteria = { ...this.criteria, [key]: values.includes(value) ? values.filter(item => item !== value) : [...values, value] };
    if (key === 'segments') this.syncAudience();
    this.changed();
  }
  /** The "Everyone with consent" card = no group picked. */
  pickEveryone(): void {
    if (!this.criteria.segments.length) return;
    this.criteria = { ...this.criteria, segments: [] };
    this.syncAudience();
    this.changed();
  }
  setType(type: CampaignAudience): void { this.typeFilter.set(type); this.syncAudience(); this.changed(); }
  setTurnover(key: 'turnover_min' | 'turnover_max', value: unknown): void {
    const amount = value === null || value === '' ? null : Number(value);
    this.criteria = { ...this.criteria, [key]: amount === null || !Number.isFinite(amount) ? null : amount };
    this.changed();
  }
  setDate(key: 'last_contact_from' | 'last_contact_to', value: string): void { this.criteria = { ...this.criteria, [key]: value || null }; this.changed(); }
  setSource(source: 'filters' | 'csv'): void {
    if ((this.criteria.source || 'filters') === source) return;
    this.criteria = { ...this.criteria, source };
    this.changed();
  }
  clearFilters(): void {
    this.criteria = { ...this.criteria, statuses: [], stages: [], owners: [], industries: [], tags: [], sizes: [],
      turnover_min: null, turnover_max: null, last_contact_from: null, last_contact_to: null };
    this.syncAudience();
    this.changed();
  }

  rulesSummary(): string {
    this.criteriaRevision();
    const parts = [this.transloco.translate('campaigns.editor.rules.summaryMinDays', { count: Number(this.minDays) || 0 })];
    if (this.isRecentContactRuleOn) parts.push(this.transloco.translate('campaigns.editor.rules.summaryRecent', { count: Number(this.recentDays) || 0 }));
    const requester = this.requesters().find(person => person.id === this.requestedBy);
    if (requester) parts.push(this.transloco.translate('campaigns.editor.rules.summaryRequester', { name: requester.display_name }));
    return parts.join(', ');
  }

  pickTemplate(template: SendgridTemplate): void {
    if (this.templateId() === template.id) return;
    this.templateId.set(template.id);
    this.highlight.set(null);
    this.isTemplateMissing.set(false);
    this.templateHtml.set(null);
    this.isMailPreviewOpen.set(false);
    this.isDirty.set(true);
  }
  /** Templates from SendGrid; refresh = straight from SendGrid (a template was just added or changed). */
  loadTemplates(refresh = false): void {
    this.isLoadingTemplates.set(true);
    this.api.listTemplates(refresh).subscribe({
      next: templates => {
        this.templates.set(templates);
        this.templatesError.set(null);
        this.isLoadingTemplates.set(false);
        if (!this.id && !this.templateId() && templates.length === 1) this.pickTemplate(templates[0]);
        this.checkTemplateMissing();
        if (refresh && this.isMailPreviewOpen()) { this.templateHtml.set(null); this.loadMailPreview(); }
      },
      error: error => {
        this.isLoadingTemplates.set(false);
        this.templatesError.set(describeHttpError(error, this.transloco));
      },
    });
  }
  toggleMailPreview(): void {
    this.isMailPreviewOpen.set(!this.isMailPreviewOpen());
    if (this.isMailPreviewOpen() && !this.templateHtml()) this.loadMailPreview();
  }

  /** Field marked red after a click that cannot go ahead (template list, campaign name, the large-send checkbox). */
  readonly highlight = signal<'template' | 'name' | 'large' | null>(null);

  /** Buttons stay clickable: a click that cannot go ahead says why right under the bar and marks the field to fix. */
  private explainBlock(reason: string): void {
    if (!this.templateId()) this.highlight.set('template');
    this.flash(reason, true);
  }

  openSendConfirm(): void {
    const reason = this.sendBlockReason();
    if (reason) { this.explainBlock(reason); return; }
    this.isConfirmOpen.set(true);
  }

  testBlockReason(): string | null {
    if (!this.templateId()) return this.transloco.translate('campaigns.editor.block.pickTemplate');
    if (this.isDirty() || !this.id) return this.transloco.translate('campaigns.editor.block.saveFirst');
    return null;
  }
  /** Why "Send" is disabled — shown as the button's tooltip. */
  sendBlockReason(): string | null {
    const status = this.sendgridStatus();
    if (!status?.configured) return this.transloco.translate('campaigns.editor.block.notConfigured', { fields: this.missingSettings(status) });
    if (!this.templateId()) return this.transloco.translate('campaigns.editor.block.pickTemplate');
    if (this.isDirty() || !this.id) return this.transloco.translate('campaigns.editor.block.saveFirst');
    if (!this.preview()?.to_send) return this.transloco.translate('campaigns.editor.block.nobody');
    if (!this.isTested()) return this.transloco.translate('campaigns.editor.block.testFirst');
    if (this.isOverLimit() && !status.can_send_large) {
      return this.transloco.translate('campaigns.editor.block.overLimit', { count: this.preview()!.to_send, limit: status.max_recipients ?? 0 });
    }
    return null;
  }

  /** CSV file: the server checks the addresses and reports back; accepted addresses become the recipients. */
  onCsv(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_CSV_BYTES) { this.flash(this.transloco.translate('campaigns.editor.csv.tooLarge'), true); return; }
    this.isImporting.set(true);
    file.text().then(text => this.api.importCsv(text).subscribe({
      next: report => {
        this.isImporting.set(false);
        this.csvReport.set(report);
        this.criteria = { ...this.criteria, source: 'csv', csv_emails: report.emails };
        this.changed();
        if (!report.accepted) this.flash(this.transloco.translate('campaigns.editor.csv.noValid'), true);
      },
      error: error => { this.isImporting.set(false); this.flash(describeHttpError(error, this.transloco), true); },
    }));
  }
  /** The whole list (without the preview's 1000 limit) with exclusion reasons, for Excel. */
  exportRecipients(): void {
    this.isExporting.set(true);
    this.api.exportRecipients(this.criteria, this.rules()).subscribe({
      next: blob => { this.isExporting.set(false); saveBlob(blob, `recipients-${this.slug(this.name)}.xlsx`); },
      error: error => { this.isExporting.set(false); this.flash(describeHttpError(error, this.transloco), true); },
    });
  }
  /** Results of the sent campaign (.xlsx): numbers, clicks, every recipient with the mail's status. */
  exportReport(): void {
    if (!this.id) return;
    this.isReporting.set(true);
    this.api.exportResults({ campaign_id: this.id }).subscribe({
      next: blob => { this.isReporting.set(false); saveBlob(blob, `results-${this.slug(this.name)}.xlsx`); },
      error: error => { this.isReporting.set(false); this.flash(describeHttpError(error, this.transloco), true); },
    });
  }

  send(): void {
    if (!this.id) return;
    const reason = this.sendBlockReason();
    if (reason) { this.isConfirmOpen.set(false); this.explainBlock(reason); return; }
    if (this.isOverLimit() && !this.isLargeConfirmed()) { this.highlight.set('large'); return; }
    this.isSending.set(true);
    this.api.sendCampaign(this.id, this.isOverLimit() && this.isLargeConfirmed()).subscribe({
      next: result => {
        this.isSending.set(false);
        this.isConfirmOpen.set(false);
        this.status.set('sending');
        this.isLocked.set(true);
        this.sentAt.set(new Date().toISOString());
        this.flash(this.transloco.translate('campaigns.editor.sendStarted', { count: result.queued }));
        this.statusTimer = setTimeout(() => this.refreshStatus(), 4000);
      },
      error: error => { this.isSending.set(false); this.flash(describeHttpError(error, this.transloco), true); },
    });
  }
  sendTest(): void {
    const reason = this.testBlockReason();
    if (reason) { this.explainBlock(reason); return; }
    if (!this.id) return;
    this.isTesting.set(true);
    this.api.testCampaign(this.id).subscribe({
      next: result => {
        this.isTesting.set(false);
        this.testedVersion.set(result.tested_version);
        this.flash(this.transloco.translate('campaigns.editor.testSent', { emails: result.to.join(', ') }));
      },
      error: error => { this.isTesting.set(false); this.flash(describeHttpError(error, this.transloco), true); },
    });
  }

  slug(value: string): string { return campaignSlug(value); }

  changed(): void {
    this.isDirty.set(true);
    this.criteriaRevision.update(value => value + 1);
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.runPreview(), 350);
  }

  save(): void {
    if (!this.name.trim()) { this.highlight.set('name'); this.flash(this.transloco.translate('campaigns.editor.nameRequired'), true); return; }
    this.isSaving.set(true);
    const body: EmailCampaign = {
      name: this.name.trim(), filter_criteria: this.criteria,
      sendgrid_template_id: this.templateId(), sendgrid_template_name: this.selectedTemplate()?.name ?? null,
      sendgrid_template_subject: this.selectedTemplate()?.subject ?? null,
      min_days_between_sends: Number(this.minDays) || 0,
      exclude_recent_contact_days: this.isRecentContactRuleOn ? Number(this.recentDays) || null : null,
      utm_campaign: this.utm.trim() || this.slug(this.name),
      requested_by: this.requestedBy || null,
    };
    const request = this.id ? this.api.updateCampaign(this.id, body) : this.api.createCampaign(body);
    request.subscribe({
      next: campaign => {
        this.isSaving.set(false);
        this.isDirty.set(false);
        this.testedVersion.set(campaign.tested_version || null);
        this.flash(this.transloco.translate('campaigns.editor.draftSaved'));
        if (!this.id && campaign.id) {
          this.id = campaign.id;
          this.router.navigate(['/crm/email-campaigns', campaign.id], { replaceUrl: true });
        }
      },
      error: error => { this.isSaving.set(false); this.flash(describeHttpError(error, this.transloco), true); },
    });
  }

  private applyCampaign(campaign: EmailCampaign): void {
    this.name = campaign.name;
    this.status.set(campaign.status || 'draft');
    this.templateId.set(campaign.sendgrid_template_id);
    this.testedVersion.set(campaign.tested_version || null);
    this.minDays = campaign.min_days_between_sends;
    this.isRecentContactRuleOn = !!campaign.exclude_recent_contact_days;
    this.recentDays = campaign.exclude_recent_contact_days || 14;
    this.utm = campaign.utm_campaign || '';
    this.criteria = { ...this.criteria, ...(campaign.filter_criteria || {}) };
    this.typeFilter.set(this.criteria.type_filter || 'both');
    this.requestedBy = campaign.requested_by || '';
    this.sentAt.set(campaign.sent_at || null);
    this.sendError.set(campaign.send_error || null);
    this.isLocked.set(this.status() !== 'draft');
    this.criteriaRevision.update(value => value + 1);
    this.isNarrowOpen.set(this.activeFilterCount() > 0);
    this.isRulesOpen.set(this.minDays !== 30 || this.isRecentContactRuleOn || !!this.utm);
    this.checkTemplateMissing();
    this.runPreview();
  }

  /** Missing SendGrid settings, by name, for the disabled Send button. */
  private missingSettings(status: SendgridStatus | null): string {
    const missing = status?.missing ?? [];
    if (!missing.length) return this.transloco.translate('campaigns.missing.unknown');
    return missing.map(key => KNOWN_MISSING_SETTINGS.includes(key) ? this.transloco.translate('campaigns.missing.' + key) : key).join(', ');
  }

  private exclusionLabel(key: string, preview: CampaignPreview, minDays: number): string {
    if (key === 'cooldown' && minDays) return this.transloco.translate('campaigns.exclusions.cooldownDays', { count: minDays });
    if (key === 'recent_contact' && this.isRecentContactRuleOn) {
      return this.transloco.translate('campaigns.exclusions.recentContactDays', { count: Number(this.recentDays) || 0 });
    }
    if (KNOWN_EXCLUSIONS.includes(key)) return this.transloco.translate('campaigns.exclusions.' + key, { consent: this.consentLabel() });
    return preview.exclusion_labels[key];
  }

  /** Groups only for partners (or only for leads) hide the "Send to" choice and it stops counting. */
  private syncAudience(): void {
    const segmentAudience = this.segmentAudience();
    if (segmentAudience !== 'both' && this.typeFilter() !== 'both') this.typeFilter.set('both');
    const audience = this.typeFilter() !== 'both' ? this.typeFilter() : segmentAudience;
    this.criteria = {
      ...this.criteria, audience, type_filter: this.typeFilter(),
      statuses: audience === 'leads' ? [] : this.criteria.statuses,
      stages: audience === 'partners' ? [] : this.criteria.stages,
      sizes: audience === 'partners' ? [] : this.criteria.sizes,
    };
  }

  /** A saved template that disappeared from SendGrid gets a warning (only once the list has loaded). */
  private checkTemplateMissing(): void {
    this.isTemplateMissing.set(!!this.templateId() && !this.templatesError() && !this.isLoadingTemplates()
      && this.templates().length > 0 && !this.selectedTemplate());
  }
  private loadMailPreview(): void {
    const templateId = this.templateId();
    if (!templateId) return;
    this.api.getTemplate(templateId).subscribe({
      // The template's HTML is shown only in a sandboxed iframe without scripts.
      next: template => this.templateHtml.set(this.sanitizer.bypassSecurityTrustHtml(template.html
        || `<p style="font-family:sans-serif">${this.transloco.translate('campaigns.editor.emptyTemplate')}</p>`)),
      error: error => { this.isMailPreviewOpen.set(false); this.flash(describeHttpError(error, this.transloco), true); },
    });
  }
  private refreshStatus(): void {
    if (!this.id) return;
    this.api.getCampaign(this.id).subscribe({
      next: campaign => {
        this.status.set(campaign.status || this.status());
        this.sendError.set(campaign.send_error || null);
        if (this.status() === 'sending') this.statusTimer = setTimeout(() => this.refreshStatus(), 5000);
      },
      error: () => undefined,
    });
  }
  private rules(): PreviewRules {
    const rules: PreviewRules = {
      min_days_between_sends: Number(this.minDays) || 0,
      exclude_recent_contact_days: this.isRecentContactRuleOn ? Number(this.recentDays) || null : null,
    };
    const consentKey = this.consentKey();
    if (consentKey) rules.required_consent = consentKey;
    return rules;
  }
  private runPreview(): void {
    const sequence = ++this.previewSequence;
    this.isPreviewLoading.set(true);
    this.api.preview(this.criteria, this.rules()).subscribe({
      next: preview => { if (sequence === this.previewSequence) { this.preview.set(preview); this.isPreviewLoading.set(false); } },
      error: error => {
        if (sequence !== this.previewSequence) return;
        this.isPreviewLoading.set(false);
        this.flash(describeHttpError(error, this.transloco), true);
      },
    });
  }
  private flash(text: string, isError = false): void {
    this.message.set({ text, isError });
    clearTimeout(this.messageTimer);
    this.messageTimer = setTimeout(() => this.message.set(null), isError ? 8000 : 5000);
  }
}
