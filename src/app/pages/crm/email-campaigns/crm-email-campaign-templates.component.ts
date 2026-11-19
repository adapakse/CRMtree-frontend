import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { SendgridTemplate } from '../../../core/services/email-campaigns.service';
import { SENDGRID_TEMPLATES_URL } from './campaign-period';
import { EMAIL_CAMPAIGNS_SHARED_STYLES } from './email-campaigns.styles';

const PAGE_SIZE = 12;

/** Overview of the SendGrid templates. They are designed and edited in SendGrid; the CRM only lists them. */
@Component({
  selector: 'wt-crm-email-campaign-templates',
  standalone: true,
  imports: [DatePipe, TranslocoDirective],
  providers: [provideTranslocoScope('campaigns')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<ng-container *transloco="let t; prefix: 'campaigns'">
  <div class="ec-info ec-tpl-info">
    <span>{{ t('templates.info', { firstName: firstNameTag, company: companyTag }) }}</span>
    <button class="btn-quiet" [disabled]="isLoading()" (click)="refresh.emit()"><i class="ei ei-refresh"></i> {{ t(isLoading() ? 'common.refreshing' : 'common.refresh') }}</button>
  </div>
  @if (error()) {
    <div class="card empty-state ec-empty">
      <span class="empty-tile"><i class="ei ei-warn"></i></span>
      <div class="empty-title">{{ t('templates.loadFailed') }}</div>
      <span>{{ error() }}</span>
      @if (isAdmin()) { <button class="btn btn-g" (click)="openSettings.emit()"><i class="ei ei-settings"></i> {{ t('page.notConfigured.openSettings') }}</button> }
    </div>
  } @else if (!templates().length) {
    <div class="card empty-state ec-empty">
      <span class="empty-tile"><i class="ei ei-file"></i></span>
      <div class="empty-title">{{ t('templates.empty') }}</div>
      <span>{{ t('templates.emptyHint') }}</span>
      <a class="btn btn-p" [href]="templatesUrl" target="_blank" rel="noopener">{{ t('templates.openSendgrid') }} <i class="ei ei-link"></i></a>
    </div>
  } @else {
    <div class="ec-grid">
      @for (template of pageItems(); track template.id) {
        <div class="card ec-tpl">
          <a class="ec-thumb" [href]="editUrl(template)" target="_blank" rel="noopener" [title]="t('templates.openOne', { name: template.name })">
            @if (template.thumbnail_url) { <img [src]="template.thumbnail_url" [alt]="t('templates.thumbnail', { name: template.name })" loading="lazy"> }
            @else { <span>{{ t('templates.noThumbnail') }}</span> }
          </a>
          <div class="ec-tpl-txt">
            <b>{{ template.name }}</b>
            <div class="ec-tpl-subj">{{ template.subject || t('templates.noSubject') }}</div>
          </div>
          <div class="ec-tpl-meta ec-muted">{{ t('templates.changedAt', { date: (template.updated_at | date:'d.MM.yyyy HH:mm') }) }}</div>
          <div><a class="btn btn-g btn-sm" [href]="editUrl(template)" target="_blank" rel="noopener">{{ t('templates.editInSendgrid') }} <i class="ei ei-link"></i></a></div>
        </div>
      }
    </div>
    @if (pageCount() > 1) {
      <div class="ec-pager">
        <span class="ec-muted">{{ t('templates.range', { from: firstItem(), to: lastItem(), total: templates().length }) }}</span>
        <button class="btn btn-g btn-sm" [disabled]="page() <= 1" (click)="page.set(page() - 1)">← {{ t('common.previous') }}</button>
        <button class="btn btn-g btn-sm" [disabled]="page() >= pageCount()" (click)="page.set(page() + 1)">{{ t('common.next') }} →</button>
      </div>
    }
  }
</ng-container>
  `,
  styles: [EMAIL_CAMPAIGNS_SHARED_STYLES, `
    :host { display: grid; gap: 14px; min-width: 0; }
    .ec-tpl-info { align-items: center; justify-content: space-between; }
    .ec-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
    .ec-tpl { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .ec-tpl-txt { min-width: 0; }
    .ec-tpl-txt b { font-size: 14px; color: var(--gray-900); }
    .ec-tpl-subj { font-size: 14px; color: var(--gray-700); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ec-tpl-meta { border-top: 1px solid var(--gray-100); padding-top: 8px; }
    .ec-thumb { display: grid; place-items: center; height: 160px; border-radius: 8px; background: var(--gray-50); border: 1px solid var(--gray-100);
                overflow: hidden; color: var(--gray-400); font-size: 12px; text-decoration: none; }
    .ec-thumb img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
    .ec-thumb:hover { border-color: var(--orange); }
    .ec-pager { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
  `],
})
export class CrmEmailCampaignTemplatesComponent {
  readonly templates = input.required<SendgridTemplate[]>();
  readonly isLoading = input(false);
  readonly error = input<string | null>(null);
  readonly isAdmin = input(false);
  readonly refresh = output<void>();
  readonly openSettings = output<void>();

  readonly templatesUrl = SENDGRID_TEMPLATES_URL;
  // SendGrid's Handlebars tags, filled in by the CRM at sending; shown literally, never translated.
  readonly firstNameTag = '{{imie}}';
  readonly companyTag = '{{firma}}';

  /** SendGrid returns all templates at once, so they are paged here. */
  readonly page = signal(1);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.templates().length / PAGE_SIZE)));
  private readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));
  readonly pageItems = computed(() => this.templates().slice((this.currentPage() - 1) * PAGE_SIZE, this.currentPage() * PAGE_SIZE));
  readonly firstItem = computed(() => (this.currentPage() - 1) * PAGE_SIZE + 1);
  readonly lastItem = computed(() => Math.min(this.templates().length, this.currentPage() * PAGE_SIZE));

  editUrl(template: SendgridTemplate): string { return `${SENDGRID_TEMPLATES_URL}/${template.id}`; }
}
