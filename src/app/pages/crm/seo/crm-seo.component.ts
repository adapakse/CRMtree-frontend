import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { CrmSeoService, SeoContentSummary, SeoContent, SeoContentStatus, GscStatus, SeoPillar, SeoAuthor, SeoInternalLink, SocialPost, SocialPlatform, SeoRefreshReason, SeoRefreshSignal, SeoGenerationJob, SeoScreenshot } from '../../../core/services/crm-seo.service';
import { ToastService } from '../../../core/services/toast.service';
import { SeoStrategyPanelComponent } from './seo-strategy-panel.component';
import { SeoSocialChannelsComponent } from './seo-social-channels.component';
import { SeoTenantSettingsComponent } from './seo-tenant-settings.component';
import { SeoAuthorsPanelComponent } from './seo-authors-panel.component';
import { SeoPublishingCalendarComponent } from './seo-publishing-calendar.component';
import { SeoScreenshotsPanelComponent } from './seo-screenshots-panel.component';
import { SeoContentSlotsComponent } from './seo-content-slots.component';

const STATUS_LABEL_KEYS: Record<SeoContentStatus, string> = {
  draft: 'crm.seo.main.statuses.draft',
  in_review: 'crm.seo.main.statuses.in_review',
  approved: 'crm.seo.main.statuses.approved',
  scheduled: 'crm.seo.main.statuses.scheduled',
  published: 'crm.seo.main.statuses.published',
  // Since 0299 only new drafts that failed automatic validation land here —
  // published articles queued for a refresh stay 'published' (refresh_reason).
  needs_update: 'crm.seo.main.statuses.needs_update',
  archived: 'crm.seo.main.statuses.archived',
  queued: 'crm.seo.main.statuses.queued',
};

// "Do odświeżenia" isn't a status: it lists published articles with a refresh_reason.
type ContentFilter = SeoContentStatus | '' | 'refresh';

const REFRESH_REASON_LABEL_KEYS: Record<SeoRefreshReason, string> = {
  striking_distance: 'crm.seo.main.refresh.reasons.striking_distance',
  position_drop: 'crm.seo.main.refresh.reasons.position_drop',
  age: 'crm.seo.main.refresh.reasons.age',
  manual: 'crm.seo.main.refresh.reasons.manual',
};

const REFRESH_POLL_MS = 15000;

const SOCIAL_PLATFORM_LABELS: Record<string, string> = { linkedin: 'LinkedIn', facebook: 'Facebook' };

// Reasons sent back by the backend OAuth callbacks (crm-seo.js) — LinkedIn's
// and Meta's own error codes are passed through as-is.
const SOCIAL_ERROR_MESSAGE_KEYS: Record<string, string> = {
  user_cancelled_login: 'crm.seo.main.socialConnect.errors.user_cancelled_login',
  user_cancelled_authorize: 'crm.seo.main.socialConnect.errors.user_cancelled_authorize',
  access_denied: 'crm.seo.main.socialConnect.errors.access_denied',
  unauthorized_scope_error: 'crm.seo.main.socialConnect.errors.unauthorized_scope_error',
  invalid_state: 'crm.seo.main.socialConnect.errors.invalid_state',
  callback_failed: 'crm.seo.main.socialConnect.errors.callback_failed',
};

const SOCIAL_STATUS_LABEL_KEYS: Record<SocialPost['status'], string> = {
  draft: 'crm.seo.main.social.statuses.draft',
  queued: 'crm.seo.main.social.statuses.queued',
  published: 'crm.seo.main.social.statuses.published',
  failed: 'crm.seo.main.social.statuses.failed',
};

@Component({
  selector: 'wt-crm-seo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideTranslocoScope('crm')],
  imports: [FormsModule, DatePipe, TranslocoDirective, TranslocoPipe, SeoStrategyPanelComponent, SeoSocialChannelsComponent, SeoTenantSettingsComponent, SeoAuthorsPanelComponent, SeoPublishingCalendarComponent, SeoScreenshotsPanelComponent, SeoContentSlotsComponent],
  template: `
    <ng-container *transloco="let t; prefix: 'crm'">
    <div class="seo-page">
      <header class="seo-header">
        <h1>{{ t('seo.main.title') }}</h1>
        <div class="header-actions">
          <button type="button" class="btn-ghost section-toggle" [class.active]="showStrategy()" (click)="showStrategy.set(!showStrategy())">
            {{ t('seo.main.header.strategyToggle', { count: pillars().length }) }}
          </button>
          <button type="button" class="btn-ghost section-toggle" [class.active]="showAuthors()" (click)="showAuthors.set(!showAuthors())">
            {{ t('seo.main.header.authorsToggle', { count: authors().length }) }}
          </button>
          <button type="button" class="btn-ghost section-toggle" [class.active]="showScreenshots()" (click)="showScreenshots.set(!showScreenshots())">{{ t('seo.main.header.screenshotsToggle') }}</button>
          <button type="button" class="btn-ghost section-toggle" [class.active]="showChannels()" (click)="showChannels.set(!showChannels())">{{ t('seo.main.sections.channels') }}</button>
          <button type="button" class="btn-ghost section-toggle" [class.active]="showCalendar()" (click)="showCalendar.set(!showCalendar())">{{ t('seo.main.sections.calendar') }}</button>
          <button type="button" class="btn-ghost section-toggle" [class.active]="showSettings()" (click)="showSettings.set(!showSettings())">{{ t('seo.main.sections.settings') }}</button>
          <button type="button" class="btn-accent" (click)="generate()" [disabled]="generating()">
            @if (generating()) { {{ t('seo.main.generate.inProgress') }} } @else { {{ t('seo.main.generate.action') }} }
          </button>
          <div class="gsc-status">
            @if (gsc()?.connected) {
              <span class="gsc-badge gsc-connected">{{ t('seo.main.gsc.connected', { siteUrl: gsc()?.site_url }) }}</span>
              <button type="button" class="btn-ghost btn-sm" (click)="syncGsc()" [disabled]="syncingGsc()">
                @if (syncingGsc()) { {{ t('seo.main.gsc.syncing') }} } @else { {{ t('seo.main.gsc.syncNow') }} }
              </button>
              <button type="button" class="btn-ghost btn-sm" (click)="disconnectGsc()">{{ t('seo.main.gsc.disconnect') }}</button>
            } @else {
              <button type="button" class="btn-ghost" (click)="connectGsc()">{{ t('seo.main.gsc.connect') }}</button>
            }
          </div>
        </div>
      </header>

      @if (showStrategy()) {
        <section class="seo-section">
          <h2 class="section-title">{{ t('seo.main.sections.strategy') }}</h2>
          <wt-seo-strategy-panel [pillars]="pillars()" (pillarsChanged)="loadPillars()" />
        </section>
      }
      @if (showAuthors()) {
        <section class="seo-section">
          <h2 class="section-title">{{ t('seo.main.sections.authors') }}</h2>
          <wt-seo-authors-panel (authorsChanged)="loadAuthors()" />
        </section>
      }
      @if (showScreenshots()) {
        <section class="seo-section">
          <h2 class="section-title">{{ t('seo.main.sections.screenshots') }}</h2>
          <wt-seo-screenshots-panel />
        </section>
      }
      @if (showChannels()) {
        <section class="seo-section">
          <h2 class="section-title">{{ t('seo.main.sections.channels') }}</h2>
          <wt-seo-social-channels />
        </section>
      }
      @if (showSettings()) {
        <section class="seo-section">
          <h2 class="section-title">{{ t('seo.main.sections.settings') }}</h2>
          <wt-seo-tenant-settings />
        </section>
      }
      @if (showCalendar()) {
        <section class="seo-section">
          <h2 class="section-title">{{ t('seo.main.sections.calendar') }}</h2>
          <wt-seo-publishing-calendar />
        </section>
      }

      <!-- Filters + article list/editor are one main part of the page —
           kept in a single wrapper so they get one uniform gap from whatever
           is above them, regardless of how many sections happen to be open. -->
      <div class="article-list-section">
        <div class="status-tabs">
          @for (s of statusFilters; track s.value) {
            <button
              type="button"
              class="tab"
              [class.active]="statusFilter() === s.value"
              (click)="setStatusFilter(s.value)"
            >{{ t(s.labelKey) }}</button>
          }
        </div>

        <div class="seo-layout">
          <div class="seo-list">
          @if (items().length === 0) {
            <p class="empty">{{ t('seo.main.list.empty') }}</p>
          }
          @for (item of items(); track item.id) {
            <button type="button" class="content-row" [class.selected]="selected()?.id === item.id" (click)="select(item.id)">
              <span class="status-pill" [attr.data-status]="item.status">{{ statusLabel(item.status) }}</span>
              <span class="row-title">{{ item.title }}</span>
              <span class="row-locale">{{ item.locale }}</span>
              @if (item.status === 'published' && item.refresh_reason) {
                <span class="refresh-pill">↻ {{ refreshReasonLabel(item.refresh_reason) }}</span>
              }
              @if (item.impressions_28d > 0 || item.clicks_28d > 0) {
                <span class="row-metrics">{{ t('seo.main.list.metrics', { impressions: item.impressions_28d, clicks: item.clicks_28d }) }}</span>
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
                <span>{{ t('seo.main.detail.metrics.impressions', { count: d.impressions_28d }) }}</span>
                <span>{{ t('seo.main.detail.metrics.clicks', { count: d.clicks_28d }) }}</span>
                @if (d.avg_position_28d) { <span>{{ t('seo.main.detail.metrics.avgPosition', { position: d.avg_position_28d }) }}</span> }
                <span class="metrics-note">{{ t('seo.main.detail.metrics.note') }}</span>
              </div>
            }
            <div class="image-controls">
              <input class="image-url-input" [(ngModel)]="editImageUrl" [placeholder]="t('seo.main.detail.image.urlPlaceholder')">
              <button type="button" class="btn-ghost btn-sm" (click)="saveImageUrl(d.id)">{{ t('seo.main.detail.image.save') }}</button>
              <button type="button" class="btn-ghost btn-sm" (click)="rerollImage(d.id)" [disabled]="rerolling()">
                @if (rerolling()) { {{ t('seo.main.detail.image.rerolling') }} } @else { {{ t('seo.main.detail.image.reroll') }} }
              </button>
            </div>
            <h2>
              <input class="title-input" [(ngModel)]="editTitle" [disabled]="!isEditable(d.status)">
            </h2>
            <div class="author-row">
              <label for="authorSelect">{{ t('seo.main.detail.author.label') }}</label>
              <select id="authorSelect" [(ngModel)]="editAuthorId" [disabled]="!isEditable(d.status)" (change)="saveAuthor(d.id)">
                <option [ngValue]="null">{{ t('seo.main.detail.author.choose') }}</option>
                @for (a of selectableAuthors(); track a.id) {
                  <option [ngValue]="a.id">{{ a.full_name }}{{ a.job_title ? ' · ' + a.job_title : '' }}{{ !a.is_active ? ' (' + t('seo.main.detail.author.inactive') + ')' : '' }}</option>
                }
              </select>
              @if (!d.author_id) { <span class="author-missing-note">{{ t('seo.main.detail.author.required') }}</span> }
            </div>
            <textarea class="meta-input" [(ngModel)]="editMeta" [disabled]="!isEditable(d.status)" rows="2" [placeholder]="t('seo.main.detail.metaPlaceholder')"></textarea>
            <textarea class="body-input" [(ngModel)]="editBody" [disabled]="!isEditable(d.status)" rows="14"></textarea>

            <wt-seo-content-slots
              [content]="d"
              [editable]="isEditable(d.status)"
              [screenshots]="screenshots()"
              (contentChanged)="onSlotsChanged($event)"
              (screenshotAdded)="loadScreenshots()" />

            @if (internalLinks().length > 0) {
              <div class="internal-links-row">
                <span class="internal-links-label">{{ t('seo.main.detail.internalLinks') }}</span>
                @for (link of internalLinks(); track link.id) {
                  <span class="internal-link-chip">{{ link.to_title }}</span>
                }
              </div>
            }

            @if (isEditable(d.status)) {
              <div class="schedule-row">
                <label for="scheduleInput">{{ t('seo.main.schedule.label') }}</label>
                <input id="scheduleInput" type="datetime-local" [(ngModel)]="editScheduledAt" (change)="saveScheduledAt(d.id)">
                @if (editScheduledAt) {
                  <button type="button" class="btn-ghost btn-sm" (click)="clearSchedule(d.id)">{{ t('seo.main.schedule.clear') }}</button>
                }
              </div>
            } @else if (d.status === 'scheduled' && d.scheduled_at) {
              <p class="schedule-note">{{ t('seo.main.schedule.scheduledNote', { date: (d.scheduled_at | date:'d MMMM y, HH:mm') }) }}</p>
            }

            <div class="detail-actions">
              @if (isEditable(d.status)) {
                <button type="button" class="btn-ghost" (click)="saveEdits(d.id)">{{ t('seo.main.actions.saveChanges') }}</button>
              }
              @if (d.status === 'in_review' || d.status === 'needs_update') {
                <button type="button" class="btn-reject" (click)="reject(d.id)">{{ t('seo.main.actions.reject') }}</button>
              }
              @if (d.status === 'scheduled') {
                <button type="button" class="btn-reject" (click)="unpublish(d.id)">{{ t('seo.main.actions.cancelSchedule') }}</button>
              }
              @if (d.status === 'draft' || d.status === 'in_review' || d.status === 'needs_update') {
                <button type="button" class="btn-accent" (click)="approve(d.id)" [disabled]="pendingSlotCount() > 0"
                        [title]="pendingSlotCount() > 0 ? t('seo.main.actions.pendingSlotsHint') : ''">
                  @if (editScheduledAt) { {{ t('seo.main.actions.approveAndSchedule') }} } @else { {{ t('seo.main.actions.approveAndPublish') }} }
                </button>
              }
              @if (d.status === 'published') {
                <button type="button" class="btn-reject" (click)="unpublish(d.id)">{{ t('seo.main.actions.unpublish') }}</button>
                @if (!d.refresh_reason) {
                  <button type="button" class="btn-ghost" (click)="requestRefresh(d.id)">{{ t('seo.main.actions.markForRefresh') }}</button>
                }
              }
            </div>

            @if (d.status === 'published' && d.refresh_reason) {
              <div class="refresh-box">
                <h3>{{ t('seo.main.refresh.title') }}</h3>
                <p class="refresh-reason">
                  <strong>{{ refreshReasonLabel(d.refresh_reason) }}</strong> — {{ refreshReasonDetail(d.refresh_reason, d.refresh_signal) }}
                </p>
                <p class="refresh-note">{{ t('seo.main.refresh.publishedNote') }}</p>

                @if (d.refresh_status === 'generating') {
                  <p class="refresh-generating">{{ t('seo.main.refresh.generating') }}</p>
                } @else if (d.refresh_status === 'ready' && d.refresh_draft) {
                  @if (d.refresh_draft; as draft) {
                  @if (draft.validation_errors.length) {
                    <div class="refresh-warnings">
                      <strong>{{ t('seo.main.refresh.validationWarning') }}</strong>
                      <ul>@for (e of draft.validation_errors; track e) { <li>{{ e }}</li> }</ul>
                    </div>
                  }
                  @if (draft.queries.length) {
                    <div class="refresh-queries">
                      <span class="refresh-label">{{ t('seo.main.refresh.queriesLabel') }}</span>
                      @for (q of draft.queries; track q.phrase) {
                        <span class="query-chip">{{ q.phrase }} <small>{{ t('seo.main.refresh.queryStats', { impressions: q.impressions, position: q.position }) }}</small></span>
                      }
                    </div>
                  } @else {
                    <p class="refresh-note">{{ t('seo.main.refresh.noQueries') }}</p>
                  }
                  <label class="refresh-label" for="refreshTitle">{{ t('seo.main.refresh.newTitle') }}</label>
                  <input id="refreshTitle" class="title-input" [value]="draft.title" readonly>
                  <label class="refresh-label" for="refreshMeta">{{ t('seo.main.refresh.newMeta') }}</label>
                  <textarea id="refreshMeta" class="meta-input" rows="2" [value]="draft.meta_description" readonly></textarea>
                  <label class="refresh-label" for="refreshBody">{{ t('seo.main.refresh.newBody') }}</label>
                  <textarea id="refreshBody" class="body-input" rows="14" [value]="draft.body" readonly></textarea>
                  <p class="refresh-note">
                    {{ t('seo.main.refresh.generatedInfo', { date: (draft.generated_at | date:'d MMM y, HH:mm'), cost: draft.cost_usd, facts: draft.facts_used }) }}
                  </p>
                  <div class="detail-actions">
                    <button type="button" class="btn-accent" (click)="applyRefresh(d.id)">{{ t('seo.main.refresh.apply') }}</button>
                    <button type="button" class="btn-ghost" (click)="generateRefresh(d.id)">{{ t('seo.main.refresh.regenerate') }}</button>
                    <button type="button" class="btn-reject" (click)="dismissRefresh(d.id)">{{ t('seo.main.refresh.dismissDraft') }}</button>
                  </div>
                  }
                } @else {
                  @if (d.refresh_status === 'failed') {
                    <p class="social-error">{{ t('seo.main.refresh.failed', { error: d.refresh_error }) }}</p>
                  }
                  <div class="detail-actions">
                    <button type="button" class="btn-accent" (click)="generateRefresh(d.id)">{{ t('seo.main.refresh.prepare') }}</button>
                    <button type="button" class="btn-reject" (click)="dismissRefresh(d.id)">{{ t('seo.main.refresh.notNeeded') }}</button>
                  </div>
                }
              </div>
            }

            @if (d.status === 'published' || d.status === 'scheduled' || socialPosts().length > 0) {
              <div class="social-box">
                <h3>{{ t('seo.main.social.title') }}</h3>
                @if (socialPosts().length === 0 && unpublishedSocialPlatforms().length === 0) {
                  <p class="empty">{{ t('seo.main.social.noChannels') }}</p>
                }
                @if (d.status === 'published' && unpublishedSocialPlatforms().length > 0) {
                  <div class="social-actions">
                    @for (platform of unpublishedSocialPlatforms(); track platform) {
                      <button type="button" class="btn-ghost btn-sm" (click)="retrySocialPost(d.id, platform)" [disabled]="retryingSocial().has(platform)">
                        @if (retryingSocial().has(platform)) { {{ t('seo.main.social.publishing') }} } @else { {{ t('seo.main.social.publishOn', { platform: platformLabel(platform) }) }} }
                      </button>
                    }
                  </div>
                }
                @for (post of socialPosts(); track post.platform) {
                  <div class="social-platform">
                    <div class="social-platform-head">
                      <span class="social-platform-name">{{ platformLabel(post.platform) }}</span>
                      <span class="social-status" [attr.data-status]="post.status">{{ socialStatusLabel(post.status) }}</span>
                      @if (post.remote_url) {
                        <a [href]="post.remote_url" target="_blank" rel="noopener" class="social-view-link">{{ t('seo.main.social.viewPost') }}</a>
                      }
                    </div>
                    @if (post.status === 'failed' && post.error_message) {
                      <p class="social-error">{{ post.error_message }}</p>
                    }
                    <textarea class="social-textarea" [ngModel]="post.body" (ngModelChange)="setSocialBody(post.platform, $event)" rows="4"></textarea>
                    <div class="social-actions">
                      <button type="button" class="btn-ghost btn-sm" (click)="saveSocialPost(d.id, post.platform)">{{ 'actions.save' | transloco }}</button>
                      <button type="button" class="btn-ghost btn-sm" (click)="copySocialBody(post.body)">{{ t('seo.main.social.copy') }}</button>
                      @if (post.status === 'failed' || post.status === 'draft') {
                        <button type="button" class="btn-ghost btn-sm" (click)="retrySocialPost(d.id, post.platform)" [disabled]="retryingSocial().has(post.platform)">
                          @if (retryingSocial().has(post.platform)) { {{ t('seo.main.social.publishing') }} } @else { {{ t('seo.main.social.publishOrRetry') }} }
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          } @else {
            <p class="empty">{{ t('seo.main.detail.empty') }}</p>
          }
        </div>
        </div>
      </div>
    </div>
    </ng-container>
  `,
  styles: [`
    /* Single source of truth for the ~24px gap between this page's main parts —
       header, each open section, and the filters+list block below them — no
       matter which combination of sections happens to be open. Nothing here
       carries its own margin-bottom; the gap owns all of that spacing. */
    .seo-page { padding: 1.5rem; max-width: 1200px; display: flex; flex-direction: column; gap: 1.5rem; }
    .seo-header { display:flex; align-items:center; justify-content:space-between; }
    .seo-header h1 { font-size: 1.4rem; margin: 0; }
    .section-title { font-size: 1.05rem; font-weight: 700; color: var(--gray-900); margin: 0 0 0.75rem; }
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
    .refresh-pill { font-size: 0.7rem; font-weight: 600; color: var(--orange-dark); background: var(--orange-pale); border-radius: 999px; padding: 0.1rem 0.5rem; }
    .refresh-box { border: 1px solid var(--orange-muted, #bfe3c9); background: #fbfdfb; border-radius: var(--radius); margin-top: 1.25rem; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .refresh-box h3 { font-size: 0.9rem; margin: 0; color: var(--gray-800); }
    .refresh-reason { font-size: 0.85rem; margin: 0; color: var(--gray-800); }
    .refresh-note { font-size: 0.78rem; color: var(--gray-500); margin: 0; }
    .refresh-generating { font-size: 0.85rem; color: var(--orange-dark); margin: 0; }
    .refresh-label { font-size: 0.78rem; font-weight: 600; color: var(--gray-700); }
    .refresh-warnings { font-size: 0.78rem; color: #92400E; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 0.5rem 0.75rem; }
    .refresh-warnings ul { margin: 0.3rem 0 0; padding-left: 1.1rem; }
    .refresh-queries { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; }
    .query-chip { font-size: 0.75rem; background: var(--gray-100); border-radius: 999px; padding: 0.15rem 0.6rem; color: var(--gray-700); }
    .query-chip small { color: var(--gray-500); }
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
    .author-row { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.6rem; font-size: 0.85rem; color: var(--gray-700); }
    .author-row select { border: 1px solid var(--gray-200); border-radius: 8px; padding: 0.4rem 0.6rem; font-family: inherit; font-size: 0.85rem; }
    .author-missing-note { font-size: 0.75rem; color: #92400E; background: #FEF3C7; border-radius: 999px; padding: 0.15rem 0.6rem; }
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
    /* Section toggles up top — open/active state is a border + faint tint, never
       a full green fill (that's reserved for the "Generuj nowy artykuł" CTA).
       Border is always reserved (transparent when inactive) so toggling doesn't
       shift the button's size. Several toggles can be active at once. */
    .section-toggle { border: 1.5px solid transparent; padding: calc(0.55rem - 1.5px) calc(1.1rem - 1.5px); }
    .section-toggle.active { border-color: var(--orange); background: var(--orange-pale); color: var(--orange-dark); }
    .empty { color: var(--gray-500); padding: 1rem 0; }
  `],
})
export class CrmSeoComponent implements OnInit {
  private seoService = inject(CrmSeoService);
  private toast = inject(ToastService);
  private transloco = inject(TranslocoService);

  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private refreshPoll: ReturnType<typeof setInterval> | null = null;
  private generationPoll: ReturnType<typeof setInterval> | null = null;

  // Keys are relative to the 'crm' scope — the template translates them.
  readonly statusFilters: { value: ContentFilter; labelKey: string }[] = [
    { value: '', labelKey: 'seo.main.filters.all' },
    { value: 'in_review', labelKey: 'seo.main.statuses.in_review' },
    { value: 'refresh', labelKey: 'seo.main.filters.refresh' },
    { value: 'needs_update', labelKey: 'seo.main.statuses.needs_update' },
    { value: 'scheduled', labelKey: 'seo.main.statuses.scheduled' },
    { value: 'published', labelKey: 'seo.main.statuses.published' },
    { value: 'draft', labelKey: 'seo.main.filters.drafts' },
    { value: 'queued', labelKey: 'seo.main.statuses.queued' },
  ];

  readonly items = signal<SeoContentSummary[]>([]);
  readonly detail = signal<SeoContent | null>(null);
  readonly gsc = signal<GscStatus | null>(null);
  readonly pillars = signal<SeoPillar[]>([]);
  readonly authors = signal<SeoAuthor[]>([]);
  // Inactive authors drop out of the picker for new assignments, but an
  // article already assigned to one keeps showing it — deactivating someone
  // must never silently blank out an already-approved/published article's author.
  readonly selectableAuthors = computed(() => {
    const currentId = this.detail()?.author_id ?? null;
    return this.authors().filter((a) => a.is_active || a.id === currentId);
  });
  readonly showStrategy = signal(false);
  readonly showAuthors = signal(false);
  readonly showScreenshots = signal(false);
  readonly connectedSocialPlatforms = signal<SocialPlatform[]>([]);
  // A channel connected after the article went live has no post yet — offer
  // to publish there by hand (WordPress publishes the whole article, not a post).
  readonly unpublishedSocialPlatforms = computed(() => {
    const posted = new Set(this.socialPosts().map((p) => p.platform));
    return this.connectedSocialPlatforms().filter((p) => p !== 'wordpress' && !posted.has(p));
  });
  readonly screenshots = signal<SeoScreenshot[]>([]);
  readonly pendingSlotCount = computed(() => (this.detail()?.enrichment_slots ?? []).filter((s) => s.status === 'pending').length);
  readonly showChannels = signal(false);
  readonly showSettings = signal(false);
  readonly showCalendar = signal(false);
  readonly statusFilter = signal<ContentFilter>('');
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
  editAuthorId: number | null = null;

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => { this.stopRefreshPoll(); this.stopGenerationPoll(); });
    this.showSocialConnectResult();
    this.loadList();
    this.checkGenerationJob(false);
    this.seoService.gscStatus().subscribe((s) => this.gsc.set(s));
    this.loadPillars();
    this.loadAuthors();
  }

  // The LinkedIn/Facebook OAuth callback redirects back here with the outcome
  // in the query string; before this it was silently ignored.
  private showSocialConnectResult(): void {
    const params = this.route.snapshot.queryParamMap;
    const result = params.get('social');
    if (!result) return;
    const platform = SOCIAL_PLATFORM_LABELS[params.get('platform') ?? ''] ?? this.transloco.translate('crm.seo.main.socialConnect.fallbackPlatform');
    if (result === 'connected') {
      this.toast.success(this.transloco.translate('crm.seo.main.socialConnect.connected', { platform }));
    } else {
      const reason = params.get('reason') ?? '';
      const messageKey = SOCIAL_ERROR_MESSAGE_KEYS[reason];
      const message = messageKey
        ? this.transloco.translate(messageKey)
        : this.transloco.translate('crm.seo.main.socialConnect.unknownFailure', { reason: reason || this.transloco.translate('crm.seo.main.errors.unknown') });
      this.toast.error(`${platform}: ${message}`);
    }
    this.showChannels.set(true);
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  loadPillars(): void {
    this.seoService.pillars().subscribe((p) => this.pillars.set(p));
  }

  loadAuthors(): void {
    this.seoService.authors().subscribe((a) => this.authors.set(a));
  }

  statusLabel(status: SeoContentStatus): string {
    const key = STATUS_LABEL_KEYS[status];
    return key ? this.transloco.translate(key) : status;
  }

  isEditable(status: SeoContentStatus): boolean {
    return status === 'in_review' || status === 'needs_update' || status === 'draft';
  }

  setStatusFilter(value: ContentFilter): void {
    this.statusFilter.set(value);
    this.loadList();
  }

  private loadList(): void {
    const filter = this.statusFilter();
    const request = filter === 'refresh' ? this.seoService.refreshQueue() : this.seoService.list(filter || undefined);
    request.subscribe((items) => this.items.set(items));
  }

  refreshReasonLabel(reason: SeoRefreshReason): string {
    const key = REFRESH_REASON_LABEL_KEYS[reason];
    return key ? this.transloco.translate(key) : reason;
  }

  refreshReasonDetail(reason: SeoRefreshReason, signal: SeoRefreshSignal | null): string {
    const s = signal ?? {};
    switch (reason) {
      case 'striking_distance':
        return this.transloco.translate('crm.seo.main.refresh.reasonDetails.strikingDistance', { position: s.position, impressions: s.impressions });
      case 'position_drop':
        return this.transloco.translate('crm.seo.main.refresh.reasonDetails.positionDrop', { before: s.positionBefore, now: s.positionNow });
      case 'age':
        return this.transloco.translate('crm.seo.main.refresh.reasonDetails.age');
      default:
        return this.transloco.translate('crm.seo.main.refresh.reasonDetails.manual');
    }
  }

  requestRefresh(id: number): void {
    this.seoService.requestRefresh(id).subscribe({
      next: () => { this.toast.success(this.transloco.translate('crm.seo.main.toasts.refreshMarked')); this.select(id); this.loadList(); },
      error: (err) => this.toast.error(err?.error?.error ?? this.transloco.translate('crm.seo.main.toasts.refreshMarkFailed')),
    });
  }

  generateRefresh(id: number): void {
    this.seoService.generateRefresh(id).subscribe({
      next: () => { this.toast.success(this.transloco.translate('crm.seo.main.toasts.refreshGenerating')); this.select(id); },
      error: (err) => this.toast.error(err?.error?.error ?? this.transloco.translate('crm.seo.main.toasts.generationStartFailed')),
    });
  }

  applyRefresh(id: number): void {
    if (!confirm(this.transloco.translate('crm.seo.main.refresh.applyConfirm'))) return;
    this.seoService.applyRefresh(id).subscribe({
      next: () => { this.toast.success(this.transloco.translate('crm.seo.main.toasts.refreshApplied')); this.select(id); this.loadList(); },
      error: (err) => this.toast.error(err?.error?.error ?? this.transloco.translate('crm.seo.main.toasts.refreshApplyFailed')),
    });
  }

  dismissRefresh(id: number): void {
    this.seoService.dismissRefresh(id).subscribe({
      next: () => { this.toast.success(this.transloco.translate('crm.seo.main.toasts.refreshDismissed')); this.select(id); this.loadList(); },
      error: (err) => this.toast.error(err?.error?.error ?? this.transloco.translate('crm.seo.main.toasts.refreshDismissFailed')),
    });
  }

  // Draft generation runs server-side for minutes; poll the open article
  // until it leaves 'generating'.
  private syncRefreshPoll(d: SeoContent): void {
    if (d.refresh_status !== 'generating') { this.stopRefreshPoll(); return; }
    if (this.refreshPoll) return;
    this.refreshPoll = setInterval(() => {
      const current = this.detail();
      if (current) this.select(current.id);
    }, REFRESH_POLL_MS);
  }

  private stopRefreshPoll(): void {
    if (this.refreshPoll) { clearInterval(this.refreshPoll); this.refreshPoll = null; }
  }

  select(id: number): void {
    if (this.detail()?.id !== id) this.stopRefreshPoll();
    this.seoService.get(id).subscribe((d) => {
      this.detail.set(d);
      this.syncRefreshPoll(d);
      this.editTitle = d.title;
      this.editMeta = d.meta_description ?? '';
      this.editBody = d.body;
      this.editImageUrl = d.header_image_url ?? '';
      this.editAuthorId = d.author_id;
      // datetime-local expects "YYYY-MM-DDTHH:mm" in local time, not an ISO string with seconds/zone.
      this.editScheduledAt = d.scheduled_at ? this.toDatetimeLocal(d.scheduled_at) : '';
    });
    this.seoService.internalLinks(id).subscribe((links) => this.internalLinks.set(links));
    this.seoService.articleSocialPosts(id).subscribe((posts) => this.socialPosts.set(posts));
    this.seoService.socialAccounts().subscribe((accounts) => this.connectedSocialPlatforms.set(accounts.map((a) => a.platform)));
    this.loadScreenshots();
  }

  loadScreenshots(): void {
    this.seoService.screenshots().subscribe((s) => this.screenshots.set(s));
  }

  // Filling a slot rewrites the body server-side; the textarea must follow,
  // or a later "Zapisz zmiany" would write the old markers back.
  onSlotsChanged(d: SeoContent): void {
    this.detail.set(d);
    this.editBody = d.body;
    this.loadList();
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
      next: (d) => { this.toast.success(this.transloco.translate('crm.seo.main.toasts.changesSaved')); this.detail.set(d); this.loadList(); },
      error: () => this.toast.error(this.transloco.translate('crm.seo.main.toasts.changesSaveFailed')),
    });
  }

  saveImageUrl(id: number): void {
    this.seoService.update(id, { header_image_url: this.editImageUrl || null }).subscribe({
      next: (d) => { this.toast.success(this.transloco.translate('crm.seo.main.toasts.imageSaved')); this.detail.set(d); this.loadList(); },
      error: () => this.toast.error(this.transloco.translate('crm.seo.main.toasts.imageSaveFailed')),
    });
  }

  saveAuthor(id: number): void {
    this.seoService.update(id, { author_id: this.editAuthorId }).subscribe({
      next: (d) => { this.toast.success(this.transloco.translate('crm.seo.main.toasts.authorSaved')); this.detail.set(d); this.loadList(); },
      error: (err) => { this.toast.error(err?.error?.error ?? this.transloco.translate('crm.seo.main.toasts.authorSaveFailed')); },
    });
  }

  saveScheduledAt(id: number): void {
    const iso = this.editScheduledAt ? new Date(this.editScheduledAt).toISOString() : null;
    this.seoService.update(id, { scheduled_at: iso }).subscribe({
      next: (d) => { this.toast.success(this.transloco.translate('crm.seo.main.toasts.scheduleSaved')); this.detail.set(d); this.loadList(); },
      error: () => this.toast.error(this.transloco.translate('crm.seo.main.toasts.scheduleSaveFailed')),
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
        this.toast.success(this.transloco.translate('crm.seo.main.toasts.imageRerolled'));
        this.detail.set(d);
        this.editImageUrl = d.header_image_url ?? '';
        this.rerolling.set(false);
      },
      error: (err) => { this.toast.error(err?.error?.error ?? this.transloco.translate('crm.seo.main.toasts.imageRerollFailed')); this.rerolling.set(false); },
    });
  }

  approve(id: number): void {
    this.seoService.approve(id).subscribe({
      next: (d) => {
        this.toast.success(d.status === 'scheduled' ? this.transloco.translate('crm.seo.main.toasts.scheduled') : this.transloco.translate('crm.seo.main.toasts.published'));
        this.detail.set(null);
        this.loadList();
      },
      error: (err) => this.toast.error(err?.error?.error ?? this.transloco.translate('crm.seo.main.toasts.approveFailed')),
    });
  }

  reject(id: number): void {
    this.seoService.reject(id).subscribe({
      next: () => { this.toast.info(this.transloco.translate('crm.seo.main.toasts.rejected')); this.detail.set(null); this.loadList(); },
      error: () => this.toast.error(this.transloco.translate('crm.seo.main.toasts.rejectFailed')),
    });
  }

  unpublish(id: number): void {
    this.seoService.unpublish(id).subscribe({
      next: () => { this.toast.info(this.transloco.translate('crm.seo.main.toasts.unpublished')); this.detail.set(null); this.loadList(); },
      error: () => this.toast.error(this.transloco.translate('crm.seo.main.toasts.unpublishFailed')),
    });
  }

  generate(): void {
    if (this.generating()) return;
    this.seoService.generate().subscribe({
      next: (job) => {
        this.toast.success(this.transloco.translate('crm.seo.main.toasts.generationStarted'));
        this.trackGenerationJob(job);
      },
      error: (err) => {
        this.toast.error(err?.error?.error ?? this.transloco.translate('crm.seo.main.toasts.generationStartFailed'));
        // 409 = a job is already running (e.g. started in another tab) — follow that one.
        if (err?.error?.job) this.trackGenerationJob(err.error.job);
      },
    });
  }

  // Also called on page load, so a generation started before a reload (or in
  // another tab) keeps showing as in progress and still announces its result.
  private checkGenerationJob(announce: boolean): void {
    this.seoService.generationStatus().subscribe((job) => {
      if (!job) { this.generating.set(false); return; }
      if (job.status === 'generating') { this.trackGenerationJob(job); return; }
      this.stopGenerationPoll();
      if (!announce) return;
      if (job.status === 'done') {
        this.toast.success(this.transloco.translate('crm.seo.main.toasts.generationDone'));
        this.loadList();
        this.loadPillars();
        if (job.content_id) this.select(job.content_id);
      } else {
        this.toast.error(this.transloco.translate('crm.seo.main.toasts.generationFailed', { error: job.error ?? this.transloco.translate('crm.seo.main.errors.unknown') }));
      }
    });
  }

  private trackGenerationJob(job: SeoGenerationJob): void {
    if (job.status !== 'generating') return;
    this.generating.set(true);
    if (this.generationPoll) return;
    this.generationPoll = setInterval(() => this.checkGenerationJob(true), REFRESH_POLL_MS);
  }

  private stopGenerationPoll(): void {
    this.generating.set(false);
    if (this.generationPoll) { clearInterval(this.generationPoll); this.generationPoll = null; }
  }

  connectGsc(): void {
    this.seoService.gscAuthUrl().subscribe((res) => window.location.assign(res.url));
  }

  disconnectGsc(): void {
    this.seoService.gscDisconnect().subscribe({
      next: () => {
        this.gsc.set(null);
        this.toast.success(this.transloco.translate('crm.seo.main.toasts.gscDisconnected'));
      },
      error: () => this.toast.error(this.transloco.translate('crm.seo.main.toasts.gscDisconnectFailed')),
    });
  }

  syncGsc(): void {
    if (this.syncingGsc()) return;
    this.syncingGsc.set(true);
    this.seoService.gscSync().subscribe({
      next: () => {
        this.toast.success(this.transloco.translate('crm.seo.main.toasts.gscSynced'));
        this.syncingGsc.set(false);
        this.loadList();
        if (this.detail()) this.select(this.detail()!.id);
      },
      error: (err) => { this.toast.error(err?.error?.error ?? this.transloco.translate('crm.seo.main.toasts.gscSyncFailed')); this.syncingGsc.set(false); },
    });
  }

  platformLabel(platform: SocialPlatform): string {
    return { linkedin: 'LinkedIn', facebook: 'Facebook', instagram: 'Instagram', wordpress: 'WordPress' }[platform];
  }

  socialStatusLabel(status: SocialPost['status']): string {
    return this.transloco.translate(SOCIAL_STATUS_LABEL_KEYS[status]);
  }

  setSocialBody(platform: SocialPlatform, body: string): void {
    this.socialPosts.update((posts) => posts.map((p) => (p.platform === platform ? { ...p, body } : p)));
  }

  saveSocialPost(id: number, platform: SocialPlatform): void {
    const post = this.socialPosts().find((p) => p.platform === platform);
    if (!post?.body) return;
    this.seoService.updateSocialPost(id, platform, post.body).subscribe({
      next: () => this.toast.success(this.transloco.translate('crm.seo.main.toasts.socialPostSaved')),
      error: () => this.toast.error(this.transloco.translate('crm.seo.main.toasts.socialPostSaveFailed')),
    });
  }

  copySocialBody(body: string | null): void {
    if (!body) return;
    navigator.clipboard.writeText(body).then(
      () => this.toast.success(this.transloco.translate('crm.seo.main.toasts.copied')),
      () => this.toast.error(this.transloco.translate('crm.seo.main.toasts.copyFailed')),
    );
  }

  retrySocialPost(id: number, platform: SocialPlatform): void {
    if (this.retryingSocial().has(platform)) return;
    this.retryingSocial.update((s) => new Set(s).add(platform));
    this.seoService.retrySocialPost(id, platform).subscribe({
      next: (post) => {
        this.toast.success(post.status === 'published' ? this.transloco.translate('crm.seo.main.toasts.socialPublished') : this.transloco.translate('crm.seo.main.toasts.socialPublishFailedCheck'));
        this.socialPosts.update((posts) => (posts.some((p) => p.platform === platform)
          ? posts.map((p) => (p.platform === platform ? post : p))
          : [...posts, post]));
        this.retryingSocial.update((s) => { const n = new Set(s); n.delete(platform); return n; });
      },
      error: () => {
        this.toast.error(this.transloco.translate('crm.seo.main.toasts.socialPublishFailed'));
        this.retryingSocial.update((s) => { const n = new Set(s); n.delete(platform); return n; });
      },
    });
  }
}
