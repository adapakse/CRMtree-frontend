import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { CampaignResultRow, CampaignResults, EmailCampaignsService, campaignSlug, saveBlob } from '../../../core/services/email-campaigns.service';
import { describeHttpError } from '../../../core/services/http-error-message';
import { ToastService } from '../../../core/services/toast.service';
import { PRESETS, Preset, presetRange } from './campaign-period';
import { EMAIL_CAMPAIGNS_SHARED_STYLES } from './email-campaigns.styles';

interface Clicker {
  company: string; person: string; link: string; when: string; owner: string;
  entityType: 'partner' | 'lead'; route: string[]; campaign?: string;
}
interface CampaignStats {
  id: number; name: string; sentAt: string; template: string;
  sent: number; delivered: number; opened: number; clicked: number; unsub: number; bounced: number; spam: number;
  links: { label: string; clicks: number }[];
  clickers: Clicker[];
}
type Counter = 'sent' | 'delivered' | 'opened' | 'clicked' | 'unsub' | 'bounced' | 'spam';

/** Id of the "all campaigns" view (sum over the chosen period). */
const ALL = 0;

/** Campaign results from the SendGrid webhook: tiles, funnel, links, who clicked, all campaigns side by side. */
@Component({
  selector: 'wt-crm-email-campaign-results',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, RouterModule, TranslocoDirective],
  providers: [provideTranslocoScope('campaigns')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<ng-container *transloco="let t; prefix: 'campaigns'">
  <div class="ecr-bar">
    <label class="ecr-f">{{ t('results.sent') }}
      <select class="sel" [ngModel]="preset()" (ngModelChange)="setPreset($event)">
        @for (option of presets; track option) { <option [value]="option">{{ t('periods.' + option) }}</option> }
      </select></label>
    <label class="ecr-f">{{ t('results.from') }} <input type="date" class="ec-input" [ngModel]="from()" [max]="to() || null" (ngModelChange)="setRange($event, to())"></label>
    <label class="ecr-f">{{ t('results.to') }} <input type="date" class="ec-input" [ngModel]="to()" [min]="from() || null" (ngModelChange)="setRange(from(), $event)"></label>
    @if (from() || to()) { <button class="ec-link" (click)="setPreset('all')">{{ t('results.allDates') }}</button> }
    <span class="ecr-sp"></span>
    <button class="btn-quiet" [disabled]="isLoading()" (click)="load()" [title]="t('results.refreshHint')"><i class="ei ei-refresh"></i> {{ t(isLoading() ? 'common.refreshing' : 'common.refresh') }}</button>
  </div>
  <div class="ec-muted">{{ t('results.sourcesNote') }}</div>

  @if (!campaigns().length) {
    <div class="card empty-state ec-empty">
      <span class="empty-tile"><i class="ei ei-chart"></i></span>
      @if (isLoading()) { <div>{{ t('common.loading') }}</div> }
      @else {
        <div class="empty-title">{{ t(from() || to() ? 'results.emptyPeriod' : 'results.emptyNone') }}</div>
        @if (!from() && !to()) { <span>{{ t('results.emptyNoneHint') }}</span> }
      }
    </div>
  } @else {
    <div class="ecr-pick">
      <label for="ecrCampaign">{{ t('results.campaign') }}</label>
      <select id="ecrCampaign" class="sel" [ngModel]="selectedId()" (ngModelChange)="select(+$event)">
        <option [ngValue]="0">{{ t('results.allCampaigns', { count: campaigns().length }) }}</option>
        @for (campaign of campaigns(); track campaign.id) { <option [ngValue]="campaign.id">{{ campaign.name }} · {{ campaign.sentAt | date:'d.MM.yyyy' }}</option> }
      </select>
    </div>

    @let stats = selected();
    <div class="ecr-tiles">
      <div class="card ecr-tile">
        <div class="ecr-k">{{ t('results.tiles.delivered') }}</div>
        <div class="ecr-v">{{ percent(stats.delivered, stats.sent) }}</div>
        <div class="ecr-s">{{ t('results.tiles.deliveredOf', { count: stats.delivered, total: stats.sent }) }}</div>
      </div>
      <div class="card ecr-tile">
        <div class="ecr-k">{{ t('results.tiles.opens') }}</div>
        <div class="ecr-v">{{ percent(stats.opened, stats.delivered) }}</div>
        <div class="ecr-s">{{ t('results.tiles.people', { count: stats.opened }) }}</div>
      </div>
      <div class="card ecr-tile ecr-main">
        <div class="ecr-k">{{ t('results.tiles.clicks') }}</div>
        <div class="ecr-v">{{ percent(stats.clicked, stats.delivered) }}</div>
        <div class="ecr-s">{{ t('results.tiles.clickedLink', { count: stats.clicked }) }}</div>
      </div>
      <div class="card ecr-tile">
        <div class="ecr-k">{{ t('results.tiles.unsubscribes') }}</div>
        <div class="ecr-v">{{ percent(stats.unsub, stats.delivered) }}</div>
        <div class="ecr-s">{{ t('results.tiles.people', { count: stats.unsub }) }}</div>
      </div>
      <div class="card ecr-tile">
        <div class="ecr-k">{{ t('results.tiles.addressProblems') }}</div>
        <div class="ecr-v">{{ percent(stats.bounced + stats.spam, stats.sent) }}</div>
        <div class="ecr-s">{{ t('results.tiles.bouncedSpam', { bounced: stats.bounced, spam: stats.spam }) }}</div>
        @if (health(stats); as state) {
          <div class="ecr-health" [class.warn]="state !== 'ok'"><i class="ei" [class.ei-warn]="state !== 'ok'" [class.ei-check-circle]="state === 'ok'"></i>
            {{ t('results.health.' + state) }}</div>
        }
      </div>
    </div>

    <div class="ecr-grid">
      <section class="card ecr-sec">
        <h3>{{ t('results.funnel.title') }}</h3>
        <div class="ecr-funnel" role="img" [attr.aria-label]="funnelLabel(stats)">
          @for (step of funnel(stats); track step.key) {
            <div class="ecr-frow">
              <span class="ecr-fl">{{ t('results.funnel.' + step.key) }}</span>
              <span class="ecr-ftrack"><span class="ecr-fbar" [style.width.%]="share(step.count, stats.sent)"></span></span>
              <span class="ecr-fn"><b>{{ step.count }}</b> {{ percent(step.count, step.of) }}</span>
            </div>
          }
        </div>
        <p class="ecr-note">{{ t('results.funnel.opensNote') }}</p>
      </section>

      <section class="card ecr-sec">
        <h3>{{ t('results.links.title') }}</h3>
        <table class="ecr-table">
          <thead><tr><th>{{ t('results.links.link') }}</th><th class="num">{{ t('results.links.clicks') }}</th></tr></thead>
          <tbody>
            @for (link of stats.links; track link.label) { <tr><td class="ecr-url">{{ link.label }}</td><td class="num">{{ link.clicks }}</td></tr> }
            @empty { <tr><td colspan="2" class="ec-muted">{{ t('results.links.empty') }}</td></tr> }
          </tbody>
        </table>
      </section>
    </div>

    <section class="card ecr-sec">
      <div class="ecr-head">
        <h3>{{ t('results.clickers.title') }} <span class="ec-muted">— {{ t('results.clickers.hint') }}</span></h3>
        @if (stats.clickers.length) {
          <button class="btn-quiet" [disabled]="isExporting()" (click)="exportReport()" [title]="t('results.clickers.exportHint')">
            <i class="ei ei-download"></i> {{ t('common.downloadExcel') }}</button>
        }
      </div>
      <div class="ecr-tw">
        <table class="ecr-table">
          <thead><tr>
            <th>{{ t('results.clickers.company') }}</th><th>{{ t('results.clickers.person') }}</th>
            @if (selectedId() === 0) { <th>{{ t('results.campaign') }}</th> }
            <th>{{ t('results.clickers.clicked') }}</th><th>{{ t('results.clickers.when') }}</th><th>{{ t('results.clickers.owner') }}</th>
          </tr></thead>
          <tbody>
            @for (clicker of stats.clickers; track clicker.company + clicker.when) {
              <tr>
                <td><a [routerLink]="clicker.route"><b>{{ clicker.company }}</b></a>
                  <div class="ec-muted">{{ t(clicker.entityType === 'partner' ? 'common.partner' : 'common.lead') }}</div></td>
                <td>{{ clicker.person }}</td>
                @if (selectedId() === 0) { <td>{{ clicker.campaign || '—' }}</td> }
                <td class="ecr-url">{{ clicker.link }}</td>
                <td class="ec-nowrap">{{ clicker.when | date:'d.MM, HH:mm' }}</td>
                <td>{{ clicker.owner }}</td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="ec-muted">{{ t('results.clickers.empty') }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="card ecr-sec">
      <h3>{{ t('results.all.title') }}</h3>
      <div class="ecr-tw">
        <table class="ecr-table ecr-all">
          <thead><tr>
            <th>{{ t('results.campaign') }}</th><th>{{ t('results.all.sentAt') }}</th><th class="num">{{ t('results.all.sent') }}</th>
            <th class="num">{{ t('results.tiles.delivered') }}</th><th class="num">{{ t('results.tiles.opens') }}</th>
            <th class="num">{{ t('results.tiles.clicks') }}</th><th class="num">{{ t('results.tiles.unsubscribes') }}</th>
          </tr></thead>
          <tbody>
            @let total = allStats();
            <tr class="ecr-total" [class.on]="selectedId() === 0" (click)="select(0)">
              <td><b>{{ t('results.all.total') }}</b></td><td></td>
              <td class="num">{{ total.sent }}</td>
              <td class="num">{{ percent(total.delivered, total.sent) }}</td>
              <td class="num">{{ percent(total.opened, total.delivered) }}</td>
              <td class="num"><b>{{ percent(total.clicked, total.delivered) }}</b></td>
              <td class="num">{{ percent(total.unsub, total.delivered) }}</td>
            </tr>
            @for (row of campaigns(); track row.id) {
              <tr [class.on]="row.id === selectedId()" (click)="select(row.id)">
                <td><b>{{ row.name }}</b><div class="ec-muted">{{ row.template }}</div></td>
                <td class="ec-nowrap">{{ row.sentAt | date:'d.MM.yyyy' }}</td>
                <td class="num">{{ row.sent | number }}</td>
                <td class="num">{{ percent(row.delivered, row.sent) }}</td>
                <td class="num">{{ percent(row.opened, row.delivered) }}</td>
                <td class="num"><b>{{ percent(row.clicked, row.delivered) }}</b></td>
                <td class="num">{{ percent(row.unsub, row.delivered) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="ecr-note">{{ t('results.all.note') }}</p>
      <div class="ecr-export">
        <div><b>{{ t('results.export.title') }}</b>
          <span class="ec-muted">{{ t(selectedId() === 0 ? 'results.export.allHint' : 'results.export.oneHint') }}</span></div>
        <button class="btn btn-g" [disabled]="isExporting()" (click)="exportReport()"><i class="ei ei-download"></i>
          {{ t(isExporting() ? 'common.preparing' : 'results.export.button') }}</button>
      </div>
    </section>
  }
</ng-container>
  `,
  styles: [EMAIL_CAMPAIGNS_SHARED_STYLES, `
    :host { display: grid; gap: 14px; min-width: 0; }
    .ecr-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .ecr-sp { flex: 1; }
    .ecr-f { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--gray-700); }
    .ecr-pick { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .ecr-pick label { font-size: 12px; font-weight: 600; color: var(--gray-600); }
    .ecr-pick select { min-width: 0; max-width: 100%; }
    .ecr-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
    .ecr-tile { padding: 14px 16px; display: grid; gap: 4px; align-content: start; }
    .ecr-k { font-size: 12px; color: var(--gray-600); font-weight: 500; }
    .ecr-v { font: 600 24px/1.1 'Sora', sans-serif; color: var(--gray-900); font-variant-numeric: tabular-nums; }
    .ecr-main { box-shadow: inset 0 0 0 1px var(--orange); background: var(--orange-pale); }
    .ecr-s { font-size: 12px; color: var(--gray-500); }
    .ecr-health { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; margin-top: 4px; color: oklch(from #15803D max(l, var(--text-min-l)) c h); }
    .ecr-health.warn { color: oklch(from #DC2626 max(l, var(--text-min-l)) c h); }
    .ecr-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 14px; align-items: start; }
    @media (max-width: 900px) { .ecr-grid { grid-template-columns: minmax(0, 1fr); } }
    .ecr-sec { padding: 16px; display: grid; gap: 12px; min-width: 0; }
    .ecr-sec h3 { margin: 0; font: 600 14px 'Sora', sans-serif; color: var(--gray-900); }
    .ecr-sec h3 .ec-muted { font-family: inherit; }
    .ecr-note { margin: 0; font-size: 12px; color: var(--gray-500); }
    .ecr-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
    .ecr-funnel { display: grid; gap: 10px; }
    .ecr-frow { display: grid; grid-template-columns: 96px minmax(0, 1fr) 96px; align-items: center; gap: 10px; }
    .ecr-fl { font-size: 12px; color: var(--gray-700); }
    .ecr-ftrack { height: 14px; background: var(--gray-100); border-radius: 4px; overflow: hidden; }
    .ecr-fbar { display: block; height: 100%; background: var(--orange); border-radius: 0 4px 4px 0; min-width: 2px; }
    .ecr-frow:nth-child(1) .ecr-fbar { opacity: .4; } .ecr-frow:nth-child(2) .ecr-fbar { opacity: .6; } .ecr-frow:nth-child(3) .ecr-fbar { opacity: .8; }
    .ecr-fn { font-size: 12px; color: var(--gray-500); text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .ecr-fn b { color: var(--gray-900); margin-right: 4px; }
    .ecr-tw { overflow-x: auto; }
    .ecr-table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .ecr-table th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .5px; color: var(--gray-500); font-weight: 600;
                    padding: 8px 10px; border-bottom: 1px solid var(--gray-200); white-space: nowrap; }
    .ecr-table th.num { text-align: right; }
    .ecr-table td { padding: 10px; border-bottom: 1px solid var(--gray-100); vertical-align: top; }
    .ecr-table a { color: var(--gray-900); text-decoration: none; }
    .ecr-table a:hover { color: var(--orange); }
    .ecr-url { word-break: break-all; }
    .ecr-all tbody tr { cursor: pointer; }
    .ecr-all tbody tr:hover { background: var(--gray-50); }
    .ecr-all tbody tr.on { background: var(--orange-pale); }
    .ecr-all tbody tr.ecr-total td { border-bottom: 1px solid var(--gray-200); }
    .ecr-export { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; border-top: 1px solid var(--gray-100); padding-top: 12px; }
    .ecr-export b { display: block; font-size: 14px; color: var(--gray-900); }
  `],
})
export class CrmEmailCampaignResultsComponent implements OnInit {
  private readonly api = inject(EmailCampaignsService);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  /** Campaign to open at once (the "Results" button of a list row). */
  readonly initialCampaignId = input<number | null>(null);

  readonly presets = PRESETS;
  readonly campaigns = signal<CampaignStats[]>([]);
  readonly from = signal('');
  readonly to = signal('');
  readonly preset = signal<Preset>('all');
  readonly isExporting = signal(false);
  readonly isLoading = signal(false);
  readonly selectedId = signal(ALL);
  private readonly allDetail = signal<Pick<CampaignStats, 'links' | 'clickers'>>({ links: [], clickers: [] });

  readonly allStats = computed<CampaignStats>(() => {
    const list = this.campaigns();
    const sum = (key: Counter) => list.reduce((total, campaign) => total + campaign[key], 0);
    return {
      id: ALL, name: '', sentAt: '', template: '',
      sent: sum('sent'), delivered: sum('delivered'), opened: sum('opened'), clicked: sum('clicked'),
      unsub: sum('unsub'), bounced: sum('bounced'), spam: sum('spam'), ...this.allDetail(),
    };
  });
  readonly selected = computed(() =>
    this.selectedId() === ALL ? this.allStats() : this.campaigns().find(campaign => campaign.id === this.selectedId()) ?? this.allStats());

  ngOnInit(): void {
    this.selectedId.set(this.initialCampaignId() || ALL);
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.api.results({ from: this.from() || null, to: this.to() || null, campaign_id: this.selectedId() || null }).subscribe({
      next: result => {
        this.isLoading.set(false);
        this.campaigns.set(result.campaigns.map(row => this.toStats(row, row.id === result.selected_id ? result : null)));
        if (result.selected_id && result.campaigns.some(row => row.id === result.selected_id)) {
          this.selectedId.set(result.selected_id);
        } else {
          this.selectedId.set(ALL);
          this.allDetail.set(this.detailOf(result));
        }
      },
      error: error => { this.isLoading.set(false); this.toast.error(describeHttpError(error, this.transloco)); },
    });
  }
  select(id: number): void { this.selectedId.set(id); this.load(); }
  setPreset(preset: Preset): void {
    this.preset.set(preset);
    if (preset === 'custom') return;
    const [from, to] = presetRange(preset);
    this.from.set(from); this.to.set(to);
    this.load();
  }
  setRange(from: string, to: string): void {
    this.from.set(from || ''); this.to.set(to || '');
    this.preset.set(from || to ? 'custom' : 'all');
    this.load();
  }

  /** Excel report from the server for the chosen period; one selected campaign = its report with all recipients. */
  exportReport(): void {
    this.isExporting.set(true);
    this.api.exportResults({ from: this.from() || null, to: this.to() || null, campaign_id: this.selectedId() || null }).subscribe({
      next: blob => {
        this.isExporting.set(false);
        const name = this.selectedId() === ALL ? 'all-campaigns' : campaignSlug(this.selected().name);
        saveBlob(blob, `results-${name}.xlsx`);
      },
      error: error => { this.isExporting.set(false); this.toast.error(describeHttpError(error, this.transloco)); },
    });
  }

  percent(count: number, of: number): string {
    if (!of) return '—';
    const value = (count / of) * 100;
    const digits = value < 10 ? 1 : 0;
    return new Intl.NumberFormat(this.transloco.getActiveLang(), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value) + '%';
  }
  share(count: number, of: number): number { return of ? (count / of) * 100 : 0; }

  /** Delivered from sent, opens and clicks from delivered — the same bases as the tiles. */
  funnel(stats: CampaignStats) {
    return [
      { key: 'sent', count: stats.sent, of: stats.sent },
      { key: 'delivered', count: stats.delivered, of: stats.sent },
      { key: 'opened', count: stats.opened, of: stats.delivered },
      { key: 'clicked', count: stats.clicked, of: stats.delivered },
    ];
  }
  funnelLabel(stats: CampaignStats): string {
    return this.funnel(stats).map(step => `${this.transloco.translate('campaigns.results.funnel.' + step.key)} ${step.count}`).join(', ');
  }
  /** SendGrid's thresholds: bounces above 5% or spam reports above 0.1% hurt the sender's reputation. */
  health(stats: CampaignStats): 'ok' | 'bounces' | 'spam' | null {
    if (!stats.sent) return null;
    if (stats.bounced / stats.sent > 0.05) return 'bounces';
    if (stats.spam / stats.sent > 0.001) return 'spam';
    return 'ok';
  }

  private toStats(row: CampaignResultRow, detail: CampaignResults | null): CampaignStats {
    return {
      id: row.id, name: row.name, sentAt: row.sent_at, template: row.template || '—',
      sent: row.sent, delivered: row.delivered, opened: row.opened, clicked: row.clicked, unsub: row.unsub, bounced: row.bounced, spam: row.spam,
      ...(detail ? this.detailOf(detail) : { links: [], clickers: [] }),
    };
  }
  private detailOf(result: CampaignResults): Pick<CampaignStats, 'links' | 'clickers'> {
    const short = (url: string | null) => (url || '').replace(/^https?:\/\//, '').replace(/[?#].*$/, '').replace(/\/$/, '') || '—';
    return {
      links: result.links.map(link => ({ label: short(link.url), clicks: link.clicks })),
      clickers: result.clickers.map(clicker => ({
        company: clicker.company, person: clicker.contact_name || '—', link: short(clicker.url), when: clicker.clicked_at,
        owner: clicker.owner_name || '—', entityType: clicker.entity_type, campaign: clicker.campaign,
        route: clicker.entity_type === 'partner' ? ['/crm/partners', clicker.entity_id] : ['/crm/leads', clicker.entity_id],
      })),
    };
  }
}
