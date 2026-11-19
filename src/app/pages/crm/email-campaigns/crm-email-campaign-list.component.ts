import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import {
  CampaignListPage, CampaignListQuery, CampaignSort, CampaignStatus, EmailCampaignListItem, EmailCampaignsService,
} from '../../../core/services/email-campaigns.service';
import { ToastService } from '../../../core/services/toast.service';
import { describeHttpError } from '../../../core/services/http-error-message';
import { ListFilter, ListParams, ListQueryState, createListLoader } from '../../../shared/list/list-query';
import { ListFilterBarComponent } from '../../../shared/list/list-filter-bar.component';
import { ListColumnHeaderComponent } from '../../../shared/list/list-column-header.component';
import { ListPagerComponent } from '../../../shared/list/list-pager.component';
import { CAMPAIGNS_SCREEN_PARAMS } from './campaign-period';
import { EMAIL_CAMPAIGNS_SHARED_STYLES } from './email-campaigns.styles';

// The global save-error toast already told the user why a change failed.
const IGNORE_SHOWN_ERROR = () => undefined;
const STATUS_CHIPS: CampaignStatus[] = ['draft', 'sending', 'sent', 'failed'];

/** Server-side list of campaigns: filters, sorting and pages in the address, bulk archive / restore. */
@Component({
  selector: 'wt-crm-email-campaign-list',
  standalone: true,
  imports: [DatePipe, TranslocoDirective, ListFilterBarComponent, ListColumnHeaderComponent, ListPagerComponent],
  providers: [provideTranslocoScope('campaigns')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<ng-container *transloco="let t; prefix: 'campaigns'">
  <wt-list-filter-bar [filters]="filters()" [query]="query">
    <label class="ec-chk"><input type="checkbox" [checked]="showsArchived()" (change)="setShowsArchived($any($event.target).checked)"> {{ t('list.showArchived') }}</label>
  </wt-list-filter-bar>
  <div class="ec-hint">{{ t('list.periodHint') }}</div>

  <div class="ec-chips" role="tablist" [attr.aria-label]="t('list.statusFilter')">
    @for (chip of statusChips(); track chip.key) {
      <button class="fchip" role="tab" [class.on]="statusFilter() === chip.key" [attr.aria-selected]="statusFilter() === chip.key"
              (click)="query.setValue('status', chip.key)">{{ chip.key ? t('status.' + chip.key + 'Plural') : t('list.allStatuses') }} <span>{{ chip.count }}</span></button>
    }
  </div>

  @if (selectedCount()) {
    <div class="ec-bulk">
      <b>{{ t('list.selected', { count: selectedCount() }) }}</b>
      @if (isPageSelected() && total() > campaigns().length && !isAllMatchingSelected()) {
        <button class="ec-link" (click)="selectAllMatching()">{{ t('list.selectAllMatching', { count: total() }) }}</button>
      }
      <span class="ec-bulk-sp"></span>
      @if (selectedActiveCount()) { <button class="btn-quiet" (click)="bulk('archive')">{{ t('list.archiveCount', { count: selectedActiveCount() }) }}</button> }
      @if (selectedArchivedCount()) { <button class="btn-quiet" (click)="bulk('restore')">{{ t('list.restoreCount', { count: selectedArchivedCount() }) }}</button> }
      <button class="ec-link" (click)="clearSelection()">{{ t('list.unselect') }}</button>
    </div>
  }

  @if (!campaigns().length) {
    <div class="card empty-state ec-empty">
      @if (loader.isLoading()) {
        <div>{{ t('common.loading') }}</div>
      } @else if (!query.isDefault() || showsArchived()) {
        <span class="empty-tile"><i class="ei ei-search"></i></span>
        <div class="empty-title">{{ t('list.empty.noMatch') }}</div>
        <button class="btn btn-g" (click)="query.clearFilters()">{{ t('list.empty.showAll') }}</button>
      } @else if (archivedTotal()) {
        <span class="empty-tile"><i class="ei ei-package"></i></span>
        <div class="empty-title">{{ t('list.empty.allArchived', { count: archivedTotal() }) }}</div>
        <span>{{ t('list.empty.archivedHint') }}</span>
        <button class="btn btn-g" (click)="setShowsArchived(true)">{{ t('list.showArchived') }}</button>
      } @else {
        <span class="empty-tile"><i class="ei ei-mail"></i></span>
        <div class="empty-title">{{ t('list.empty.none') }}</div>
        <span>{{ t('list.empty.noneHint') }}</span>
        <button class="btn btn-p" (click)="router.navigate(['/crm/email-campaigns/new'])"><i class="ei ei-plus"></i> {{ t('list.empty.createFirst') }}</button>
      }
    </div>
  } @else {
    <div class="card ec-table-wrap shadow-room" [class.is-loading]="loader.isLoading()">
      <table class="ec-table">
        <thead><tr>
          <th class="ec-cb"><input type="checkbox" [attr.aria-label]="t('list.selectPage')"
                [checked]="isPageSelected()" [indeterminate]="isPagePartlySelected()" (change)="togglePage()"></th>
          <th [wtListColumn]="t('list.columns.campaign')" [query]="query" sortKey="name" [filter]="filterById().name"></th>
          <th [wtListColumn]="t('list.columns.requester')" [query]="query" [filter]="filterById().requester"></th>
          <th>{{ t('list.columns.status') }}</th>
          <th class="num" [wtListColumn]="t('list.columns.recipients')" [query]="query" sortKey="recipients"></th>
          <th class="num" [title]="t('list.columns.opensHint')">{{ t('list.columns.opens') }}</th>
          <th class="num" [title]="t('list.columns.clicksHint')">{{ t('list.columns.clicks') }}</th>
          <th [wtListColumn]="t('list.columns.date')" [query]="query" sortKey="date" [filter]="filterById().period"></th>
          <th></th>
        </tr></thead>
        <tbody>
          @for (campaign of campaigns(); track campaign.id) {
            <tr [class.ec-arch]="!!campaign.archived_at" [class.ec-sel]="selection().has(campaign.id)" (click)="router.navigate(['/crm/email-campaigns', campaign.id])">
              <td class="ec-cb" (click)="$event.stopPropagation()">
                <input type="checkbox" [attr.aria-label]="t('list.selectOne', { name: campaign.name })" [checked]="selection().has(campaign.id)" (change)="toggle(campaign)"></td>
              <td>
                <b>{{ campaign.name }}</b>
                <div class="ec-muted">{{ campaign.template_name || t('list.noTemplate') }}</div>
              </td>
              <td>{{ campaign.requested_by_name || '—' }}</td>
              <td class="ec-nowrap">
                <span class="ec-badge" [class]="'ec-badge st-' + campaign.status">{{ t('status.' + campaign.status) }}</span>
                @if (campaign.archived_at) { <span class="ec-badge ec-arch-badge">{{ t('list.archived') }}</span> }
              </td>
              <td class="num">{{ campaign.status === 'draft' ? (campaign.estimated_recipients ?? '—') : campaign.sent_count }}
                @if (campaign.status === 'draft' && campaign.estimated_excluded) {
                  <div class="ec-muted">{{ t('list.excluded', { count: campaign.estimated_excluded }) }}</div>
                }
              </td>
              <td class="num">@if (campaign.sent_count) { {{ percent(campaign.opened_count, campaign.sent_count) }} } @else { <span class="ec-muted">—</span> }</td>
              <td class="num">@if (campaign.sent_count) { {{ percent(campaign.clicked_count, campaign.sent_count) }} } @else { <span class="ec-muted">—</span> }</td>
              <td class="ec-nowrap">
                @if (campaign.sent_at && campaign.status !== 'draft') {
                  {{ campaign.sent_at | date:'d.MM.yyyy' }}<div class="ec-muted">{{ t('list.sentAt', { time: (campaign.sent_at | date:'HH:mm') }) }}</div>
                } @else {
                  {{ campaign.created_at | date:'d.MM.yyyy' }}<div class="ec-muted">{{ t('list.createdBy', { name: campaign.created_by_name || '—' }) }}</div>
                }
              </td>
              <td class="ec-act" (click)="$event.stopPropagation()">
                @if (campaign.sent_count) { <button class="btn-quiet" (click)="openResults.emit(campaign.id)" [title]="t('list.resultsHint')">{{ t('list.results') }}</button> }
                <button class="btn-quiet" (click)="duplicate(campaign)" [title]="t('list.duplicateHint')">{{ t('list.duplicate') }}</button>
                @if (campaign.archived_at) {
                  <button class="btn-quiet" (click)="restore(campaign)">{{ t('list.restore') }}</button>
                } @else if (campaign.status !== 'sending') {
                  <button class="btn-quiet" (click)="archive(campaign)" [title]="t('list.archiveHint')">{{ t('list.archive') }}</button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <wt-list-pager class="ec-pager" [query]="query" [total]="total()" />
  }
</ng-container>
  `,
  styles: [EMAIL_CAMPAIGNS_SHARED_STYLES, `
    :host { display: grid; gap: 12px; min-width: 0; }
    .ec-hint { font-size: 12px; color: var(--gray-500); margin-top: -4px; }
    .ec-chk { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--gray-700); cursor: pointer; }
    .ec-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .fchip span { color: var(--gray-500); font-weight: 500; margin-left: 2px; }
    .fchip.on { background: var(--orange-pale); border-color: var(--orange); color: var(--orange-dark); }
    .ec-bulk { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; border-radius: 10px; padding: 8px 12px; font-size: 14px;
               background: var(--orange-pale); border: 1px solid var(--orange); }
    .ec-bulk-sp { flex: 1; }
    .ec-table-wrap { overflow-x: auto; }
    .ec-table-wrap.is-loading { opacity: .6; }
    .ec-table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .ec-table th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .5px; color: var(--gray-500); font-weight: 600;
                   padding: 10px 14px; border-bottom: 1px solid var(--gray-200); white-space: nowrap; }
    .ec-table th.num { text-align: right; }
    .ec-table td { padding: 12px 14px; border-bottom: 1px solid var(--gray-100); vertical-align: middle; }
    .ec-table tbody tr { cursor: pointer; }
    .ec-table tbody tr:hover { background: var(--gray-50); }
    .ec-act { white-space: nowrap; text-align: right; }
    .ec-arch-badge { margin-left: 4px; }
    tr.ec-arch td { color: var(--gray-500); }
    tr.ec-sel td { background: var(--orange-pale); }
    .ec-cb { width: 34px; padding-right: 0 !important; }
    .ec-cb input { cursor: pointer; vertical-align: middle; }
  `],
})
export class CrmEmailCampaignListComponent {
  readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(EmailCampaignsService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly totalChange = output<number>();
  readonly openResults = output<number>();

  readonly query = new ListQueryState();
  private readonly requesters = signal<{ id: string; display_name: string }[]>([]);

  readonly filters = computed<ListFilter[]>(() => [
    { id: 'name', label: this.label('list.columns.campaign'), kind: 'text', params: ['q'], maxLength: 200 },
    { id: 'requester', label: this.label('list.columns.requester'), kind: 'select', params: ['requested_by'],
      options: this.requesters().map(person => ({ value: person.id, label: person.display_name })) },
    { id: 'period', label: this.label('list.columns.date'), kind: 'dateRange', params: ['period_from', 'period_to'] },
  ]);
  readonly filterById = computed(() => {
    const [name, requester, period] = this.filters();
    return { name, requester, period };
  });

  readonly loader = createListLoader<CampaignListPage>(
    computed(() => this.query.params()),
    params => this.api.listCampaigns(this.toApiQuery(params)),
    error => this.toast.error(describeHttpError(error, this.transloco)),
  );

  readonly campaigns = computed(() => this.loader.result()?.items ?? []);
  readonly total = computed(() => this.loader.result()?.total ?? 0);
  readonly archivedTotal = computed(() => this.loader.result()?.archived_total ?? 0);
  readonly statusFilter = computed(() => this.query.value('status'));
  readonly showsArchived = computed(() => this.query.value('archived') === '1');
  readonly statusChips = computed(() => {
    const counts = this.loader.result()?.status_counts ?? {};
    const all = Object.values(counts).reduce<number>((sum, count) => sum + (count || 0), 0);
    return [{ key: '', count: all },
      ...STATUS_CHIPS.filter(status => counts[status] || this.statusFilter() === status).map(status => ({ key: status, count: counts[status] || 0 }))];
  });

  /** Selected campaign id → whether it is archived (for the Archive / Restore counts). */
  readonly selection = signal<Map<number, boolean>>(new Map());
  readonly isAllMatchingSelected = signal(false);
  readonly selectedCount = computed(() => this.selection().size);
  readonly selectedArchivedCount = computed(() => [...this.selection().values()].filter(Boolean).length);
  readonly selectedActiveCount = computed(() => this.selectedCount() - this.selectedArchivedCount());
  private readonly selectable = computed(() => this.campaigns().filter(campaign => campaign.status !== 'sending' || campaign.archived_at));
  readonly isPageSelected = computed(() => {
    const selected = this.selection(), rows = this.selectable();
    return rows.length > 0 && rows.every(campaign => selected.has(campaign.id));
  });
  readonly isPagePartlySelected = computed(() => !this.isPageSelected() && this.campaigns().some(campaign => this.selection().has(campaign.id)));

  constructor() {
    this.query.restore(this.route.snapshot.queryParamMap, CAMPAIGNS_SCREEN_PARAMS);
    effect(() => {
      const queryParams: ListParams = { ...this.query.queryParams() };
      untracked(() => this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true }));
    });
    effect(() => {
      const result = this.loader.result();
      untracked(() => {
        if (!result) return;
        this.requesters.set(result.requesters ?? []);
        this.totalChange.emit(result.total);
      });
    });
    // A changed filter, sort or page starts a new selection.
    effect(() => { this.query.params(); untracked(() => this.clearSelection()); });
  }

  setShowsArchived(isShown: boolean): void { this.query.setValue('archived', isShown ? '1' : ''); }

  percent(count: number, of: number): string { return of ? `${Math.round((count / of) * 100)}%` : '—'; }

  toggle(campaign: EmailCampaignListItem): void {
    const next = new Map(this.selection());
    if (next.has(campaign.id)) next.delete(campaign.id); else next.set(campaign.id, !!campaign.archived_at);
    this.selection.set(next);
    this.isAllMatchingSelected.set(false);
  }
  togglePage(): void {
    const next = new Map(this.selection());
    if (this.isPageSelected()) this.campaigns().forEach(campaign => next.delete(campaign.id));
    else this.selectable().forEach(campaign => next.set(campaign.id, !!campaign.archived_at));
    this.selection.set(next);
    this.isAllMatchingSelected.set(false);
  }
  selectAllMatching(): void {
    this.api.listCampaignIds(this.toApiQuery(this.query.params())).subscribe({
      next: result => {
        this.selection.set(new Map(result.items.filter(item => item.status !== 'sending' || item.archived).map(item => [item.id, item.archived])));
        this.isAllMatchingSelected.set(true);
      },
      error: error => this.toast.error(describeHttpError(error, this.transloco)),
    });
  }
  clearSelection(): void { this.selection.set(new Map()); this.isAllMatchingSelected.set(false); }

  bulk(action: 'archive' | 'restore'): void {
    const ids = [...this.selection()].filter(([, isArchived]) => action === 'archive' ? !isArchived : isArchived).map(([id]) => id);
    this.api.bulkCampaigns(action, ids).subscribe({ error: IGNORE_SHOWN_ERROR, next: result => {
      const key = action === 'archive' ? 'campaigns.list.bulkArchived' : 'campaigns.list.bulkRestored';
      this.toast.success(this.transloco.translate(key, { count: result.done })
        + (result.skipped ? ' · ' + this.transloco.translate('campaigns.list.bulkSkipped', { count: result.skipped }) : ''));
      this.clearSelection();
      this.loader.reload();
    } });
  }

  duplicate(campaign: EmailCampaignListItem): void {
    this.api.duplicateCampaign(campaign.id).subscribe({ error: IGNORE_SHOWN_ERROR, next: copy => this.router.navigate(['/crm/email-campaigns', copy.id]) });
  }
  archive(campaign: EmailCampaignListItem): void {
    this.api.archiveCampaign(campaign.id).subscribe({ error: IGNORE_SHOWN_ERROR, next: () => {
      this.toast.success(this.transloco.translate('campaigns.list.archivedOne', { name: campaign.name }));
      this.loader.reload();
    } });
  }
  restore(campaign: EmailCampaignListItem): void {
    this.api.restoreCampaign(campaign.id).subscribe({ error: IGNORE_SHOWN_ERROR, next: () => {
      this.toast.success(this.transloco.translate('campaigns.list.restoredOne', { name: campaign.name }));
      this.loader.reload();
    } });
  }

  private label(key: string): string { return this.transloco.translate('campaigns.' + key); }

  /** The list's own parameters → the API's names (the API keeps WorkTrips' contract: from/to, dir). */
  private toApiQuery(params: ListParams): CampaignListQuery {
    return {
      q: params['q'] || null, status: params['status'] || null, requested_by: params['requested_by'] || null,
      archived: params['archived'] === '1', from: params['period_from'] || null, to: params['period_to'] || null,
      sort: (params['sort'] as CampaignSort) || undefined, dir: params['sort'] ? (params['order'] === 'desc' ? 'desc' : 'asc') : undefined,
      page: Number(params['page']) || 1, page_size: Number(params['page_size']) || undefined,
    };
  }
}
