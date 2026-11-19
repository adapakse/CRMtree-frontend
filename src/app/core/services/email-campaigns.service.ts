import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Observable, catchError, of, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SHOWS_OWN_ERROR } from './http-error-message';

const BASE = `${environment.apiUrl}/crm/email-campaigns`;
const OWN_ERROR = { context: new HttpContext().set(SHOWS_OWN_ERROR, true) };

/** A SendGrid Dynamic Template — designed in SendGrid; the CRM only picks it. */
export interface SendgridTemplate {
  id: string;
  name: string;
  subject: string;
  thumbnail_url: string | null;
  /** Active version; together with updated_at it tells whether the last test is still current. */
  version_id: string | null;
  updated_at: string | null;
  /** HTML of the active version — only when a single template is fetched (preview). */
  html?: string;
}

export interface TestSendResult { sent: boolean; to: string[]; tested_at: string; tested_version: string; template: string; }

export type CampaignAudience = 'partners' | 'leads' | 'both';

export interface CampaignCriteria {
  audience: CampaignAudience;
  segments: string[];
  industries: string[];
  statuses: string[];
  stages: string[];
  owners: string[];
  tags: string[];
  sizes: string[];
  turnover_min?: number | null;
  turnover_max?: number | null;
  /** Last salesperson contact, YYYY-MM-DD. */
  last_contact_from?: string | null;
  last_contact_to?: string | null;
  /** 'csv' = recipients from an uploaded file instead of groups and filters. */
  source?: 'filters' | 'csv';
  csv_emails?: string[];
  /** Recipient type picked by hand under groups that cover both partners and leads. */
  type_filter?: CampaignAudience;
}

export type CampaignStatus = 'draft' | 'sending' | 'sent' | 'failed' | 'cancelled';

export interface EmailCampaignListItem {
  id: number;
  name: string;
  status: CampaignStatus;
  sendgrid_template_id: string | null;
  template_name: string | null;
  estimated_recipients: number | null;
  estimated_excluded: number | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  created_by_name: string | null;
  archived_at: string | null;
  requested_by: string | null;
  requested_by_name: string | null;
  sent_count: number;
  opened_count: number;
  clicked_count: number;
}

export interface Requester { id: string; display_name: string; }

export interface CampaignListPage {
  items: EmailCampaignListItem[];
  total: number;
  page: number;
  page_size: number;
  requesters: Requester[];
  /** Campaigns per status under the other filters (without the status filter). */
  status_counts: Partial<Record<CampaignStatus, number>>;
  /** Archived campaigns, when archived ones are not shown. */
  archived_total?: number;
}

export type CampaignSort = 'updated' | 'date' | 'name' | 'recipients';

export interface CampaignListQuery {
  status?: string | null;
  requested_by?: string | null;
  archived?: boolean;
  page?: number;
  page_size?: number;
  q?: string | null;
  from?: string | null;
  to?: string | null;
  sort?: CampaignSort;
  dir?: 'asc' | 'desc';
}

export interface EmailCampaign {
  id?: number;
  name: string;
  status?: CampaignStatus;
  sendgrid_template_id: string | null;
  sendgrid_template_name?: string | null;
  sendgrid_template_subject?: string | null;
  /** Template version of the last test ("version id|change date"). */
  tested_version?: string | null;
  tested_at?: string | null;
  filter_criteria: CampaignCriteria;
  min_days_between_sends: number;
  exclude_recent_contact_days: number | null;
  utm_campaign: string | null;
  requested_by?: string | null;
  sent_at?: string | null;
  send_error?: string | null;
}

export interface CsvImportResult {
  rows_total: number;
  email_column: string;
  accepted: number;
  in_crm: number;
  emails: string[];
  rejected: { row: number; value: string; reason: string }[];
  rejected_total: number;
}

export interface SendgridStatus {
  configured: boolean;
  missing: string[];
  from_email: string | null;
  from_name: string;
  asm_group_id: number | null;
  webhook_signed: boolean;
  /** Recipient limit of one campaign; above it only an admin sends. */
  max_recipients?: number;
  can_send_large?: boolean;
  /** The consent type campaigns require, resolved per tenant. */
  consent_key?: string | null;
  consent_label?: string | null;
}

export interface ConsentTypeOption { key: string; label: string; }

/** Tenant's own SendGrid account. The API key and webhook key are write-only. */
export interface SendgridSettings {
  has_api_key: boolean;
  /** Last 4 characters of the saved key. */
  api_key_hint: string | null;
  from_email: string | null;
  from_name: string | null;
  reply_to: string | null;
  asm_group_id: number | null;
  has_webhook_public_key: boolean;
  webhook_url: string | null;
  consent_key?: string | null;
  consent_types?: ConsentTypeOption[];
}

/** Omitted api_key / webhook_public_key keep the saved value; api_key null removes it. */
export interface SendgridSettingsUpdate {
  api_key?: string | null;
  from_email: string;
  from_name?: string | null;
  reply_to?: string | null;
  asm_group_id?: number | null;
  webhook_public_key?: string | null;
  consent_key?: string | null;
}

export interface CampaignResultRow {
  id: number;
  name: string;
  sent_at: string;
  status: string;
  template: string | null;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  unsub: number;
  bounced: number;
  spam: number;
}

export interface CampaignClicker {
  entity_type: 'partner' | 'lead';
  entity_id: string;
  company: string;
  contact_name: string | null;
  email: string;
  clicked_at: string;
  url: string | null;
  owner_name: string | null;
  campaign?: string;
}

export interface CampaignResults {
  campaigns: CampaignResultRow[];
  selected_id: number | null;
  links: { url: string; clicks: number }[];
  clickers: CampaignClicker[];
}

export interface SegmentDef { key: string; label: string; audience: CampaignAudience; description: string; unavailable?: boolean; }

export interface FilterOptions {
  segments: SegmentDef[];
  industries: string[];
  partner_statuses: { status: string; n: number }[];
  /** label = the tenant's own stage name. */
  lead_stages: { stage: string; n: number; label?: string }[];
  owners: { id: string; display_name: string }[];
  tags: string[];
  company_sizes: string[];
  consent_types: ConsentTypeOption[];
  /** Partner turnover from the tenant's data warehouse can be filtered. */
  turnover_available?: boolean;
  consent_key?: string | null;
  consent_label?: string | null;
}

export interface PreviewRecipient {
  /** null = an address from the CSV file that is not in the CRM. */
  entity_type: 'partner' | 'lead' | null;
  entity_id: string | null;
  company: string | null;
  contact_name: string | null;
  email: string | null;
  industry: string | null;
  status: string | null;
  owner_name: string | null;
  consent: string;
  last_activity_at: string | null;
  reason: string | null;
  reason_label: string | null;
  turnover?: number | null;
}

export interface CampaignPreview {
  total_candidates: number;
  to_send: number;
  excluded_total: number;
  excluded: Record<string, number>;
  exclusion_labels: Record<string, string>;
  recipients: PreviewRecipient[];
  truncated: boolean;
}

export interface PreviewRules { required_consent?: string; min_days_between_sends: number; exclude_recent_contact_days: number | null; }

@Injectable({ providedIn: 'root' })
export class EmailCampaignsService {
  private http = inject(HttpClient);
  private cachedStatus$: Observable<SendgridStatus | null> | null = null;

  /** Templates from SendGrid; refresh = skip the server's 60 s cache (a template was just added). */
  listTemplates(refresh = false): Observable<SendgridTemplate[]> {
    return this.http.get<SendgridTemplate[]>(`${BASE}/templates`, { params: refresh ? { refresh: '1' } : {} });
  }
  getTemplate(id: string): Observable<SendgridTemplate> {
    return this.http.get<SendgridTemplate>(`${BASE}/templates/${encodeURIComponent(id)}`);
  }
  /** Test to the user's own mailbox; unlocks sending for the tested template version. */
  testCampaign(id: number, to: string[] = []): Observable<TestSendResult> {
    return this.http.post<TestSendResult>(`${BASE}/${id}/test-send`, { to }, OWN_ERROR);
  }

  filterOptions(): Observable<FilterOptions> { return this.http.get<FilterOptions>(`${BASE}/filter-options`); }
  preview(criteria: CampaignCriteria, rules: PreviewRules): Observable<CampaignPreview> {
    return this.http.post<CampaignPreview>(`${BASE}/preview`, { criteria, rules }, OWN_ERROR);
  }

  listCampaigns(query: CampaignListQuery = {}): Observable<CampaignListPage> {
    return this.http.get<CampaignListPage>(BASE, { params: this.listParams(query) });
  }
  /** Ids of every campaign matching the filters ("select all on all pages"). */
  listCampaignIds(query: CampaignListQuery): Observable<{ items: { id: number; status: CampaignStatus; archived: boolean }[] }> {
    const params = this.listParams({ ...query, page: undefined, page_size: undefined, sort: undefined, dir: undefined }).set('ids_only', '1');
    return this.http.get<{ items: { id: number; status: CampaignStatus; archived: boolean }[] }>(BASE, { params });
  }
  bulkCampaigns(action: 'archive' | 'restore', ids: number[]): Observable<{ ok: boolean; done: number; skipped: number }> {
    return this.http.post<{ ok: boolean; done: number; skipped: number }>(`${BASE}/bulk`, { action, ids });
  }
  requesters(): Observable<Requester[]> { return this.http.get<Requester[]>(`${BASE}/requesters`); }
  archiveCampaign(id: number): Observable<{ ok: boolean }> { return this.http.post<{ ok: boolean }>(`${BASE}/${id}/archive`, {}); }
  restoreCampaign(id: number): Observable<{ ok: boolean }> { return this.http.post<{ ok: boolean }>(`${BASE}/${id}/restore`, {}); }
  duplicateCampaign(id: number): Observable<EmailCampaign> { return this.http.post<EmailCampaign>(`${BASE}/${id}/duplicate`, {}); }
  sendCampaign(id: number, confirmLarge = false): Observable<{ ok: boolean; queued: number }> {
    return this.http.post<{ ok: boolean; queued: number }>(`${BASE}/${id}/send`, confirmLarge ? { confirm_large: true } : {}, OWN_ERROR);
  }

  sendgridStatus(): Observable<SendgridStatus> { return this.http.get<SendgridStatus>(`${BASE}/sendgrid/status`); }
  /**
   * Status fetched once per session and shared (lead and partner cards only need the
   * required consent type). Null when the call fails, e.g. the module is off.
   */
  cachedSendgridStatus(): Observable<SendgridStatus | null> {
    this.cachedStatus$ ??= this.sendgridStatus().pipe(catchError(() => of(null)), shareReplay(1));
    return this.cachedStatus$;
  }
  /** Settings saved or the test changed the configuration — the next card asks again. */
  forgetCachedStatus(): void { this.cachedStatus$ = null; }

  getSendgridSettings(): Observable<SendgridSettings> { return this.http.get<SendgridSettings>(`${BASE}/sendgrid/settings`); }
  saveSendgridSettings(body: SendgridSettingsUpdate): Observable<SendgridSettings> {
    return this.http.put<SendgridSettings>(`${BASE}/sendgrid/settings`, body, OWN_ERROR);
  }
  testSendgridConnection(): Observable<{ ok: boolean; templates: number }> {
    return this.http.post<{ ok: boolean; templates: number }>(`${BASE}/sendgrid/test`, {}, OWN_ERROR);
  }

  exportRecipients(criteria: CampaignCriteria, rules: PreviewRules): Observable<Blob> {
    return this.http.post(`${BASE}/preview/export`, { criteria, rules }, { ...OWN_ERROR, responseType: 'blob' });
  }
  /** Results to Excel: without campaign_id every campaign of the period, with it one campaign and its recipients. */
  exportResults(query: ResultsQuery = {}): Observable<Blob> {
    return this.http.get(`${BASE}/results/export`, { params: this.resultsParams(query), responseType: 'blob' });
  }
  importCsv(text: string): Observable<CsvImportResult> {
    return this.http.post<CsvImportResult>(`${BASE}/import-csv`, { text }, OWN_ERROR);
  }
  results(query: ResultsQuery = {}): Observable<CampaignResults> {
    return this.http.get<CampaignResults>(`${BASE}/results`, { params: this.resultsParams(query) });
  }

  getCampaign(id: number): Observable<EmailCampaign> { return this.http.get<EmailCampaign>(`${BASE}/${id}`); }
  createCampaign(campaign: EmailCampaign): Observable<EmailCampaign> { return this.http.post<EmailCampaign>(BASE, campaign, OWN_ERROR); }
  updateCampaign(id: number, campaign: EmailCampaign): Observable<EmailCampaign> {
    return this.http.put<EmailCampaign>(`${BASE}/${id}`, campaign, OWN_ERROR);
  }
  deleteCampaign(id: number): Observable<{ ok: boolean }> { return this.http.delete<{ ok: boolean }>(`${BASE}/${id}`); }

  private listParams(query: CampaignListQuery): HttpParams {
    let params = new HttpParams();
    for (const key of ['status', 'requested_by', 'q', 'from', 'to', 'sort', 'dir'] as const) {
      const value = query[key];
      if (value) params = params.set(key, value);
    }
    if (query.archived) params = params.set('archived', '1');
    if (query.page) params = params.set('page', query.page);
    if (query.page_size) params = params.set('page_size', query.page_size);
    return params;
  }

  private resultsParams(query: ResultsQuery): HttpParams {
    let params = new HttpParams();
    if (query.from) params = params.set('from', query.from);
    if (query.to) params = params.set('to', query.to);
    if (query.campaign_id) params = params.set('campaign_id', query.campaign_id);
    return params;
  }
}

export interface ResultsQuery { from?: string | null; to?: string | null; campaign_id?: number | null; }

/** Lower-case ASCII slug: "Winter offer 2026" → "winter-offer-2026" (UTM name, file names). */
export function campaignSlug(value: string, fallback = 'campaign'): string {
  return (value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0142/g, 'l')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || fallback;
}

/** Saves a downloaded file under the given name. */
export function saveBlob(blob: Blob, fileName: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
