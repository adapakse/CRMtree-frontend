import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, concatMap, filter, map, switchMap, take, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProjectCostStatus } from './project-finance-api.service';

export type KsefEnvironment = 'test' | 'production';
/** `invalid` = KSeF rejected the token; `error` = the last sync failed for another reason. */
export type KsefCompanyStatus = 'active' | 'invalid' | 'error';

export interface KsefCompany {
  id: string;
  nip: string;
  name: string | null;
  /** Last four characters of the token; the token itself never leaves the server. */
  token_hint: string;
  status: KsefCompanyStatus;
  last_error: string | null;
  sync_from: string;
  last_attempt_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KsefAdminConfig {
  /** False when the server has no KSeF environment set; companies cannot be added then. */
  is_configured: boolean;
  environment: KsefEnvironment | null;
  initial_sync_days: number;
  companies: KsefCompany[];
}

export interface KsefCompanyCreatePayload {
  nip: string;
  token: string;
  name?: string | null;
}

export interface KsefCompanyUpdatePayload {
  token?: string;
  name?: string | null;
}

export interface KsefCompanySyncState {
  id: string;
  nip: string;
  name: string | null;
  status: KsefCompanyStatus;
  last_attempt_at: string | null;
  last_synced_at: string | null;
}

export interface KsefSyncState {
  is_configured: boolean;
  companies: KsefCompanySyncState[];
}

export interface KsefSyncOutcome {
  state: KsefSyncState;
  /** False when the wait limit passed before the background run reported its end. */
  isFinished: boolean;
}

export interface KsefInvoiceRow {
  id: string;
  invoice_number: string | null;
  ksef_number: string;
  issue_date: string;
  seller_name: string | null;
  seller_nip: string | null;
  buyer_nip: string | null;
  net_amount: number | null;
  vat_amount: number | null;
  gross_amount: number | null;
  currency: string;
  payment_due_date: string | null;
  links_count: number;
}

/** Invoice summary carried by a linked cost item. */
export interface KsefCostInvoice extends KsefInvoiceRow {
  /** In the invoice currency; null when a needed exchange rate is missing. */
  linked_total: number | null;
  is_over_allocated: boolean | null;
}

/** One cost item an invoice is linked to. */
export interface KsefInvoiceLink {
  cost_item_id: string;
  project_id: string;
  project_key: string;
  project_name: string;
  /** null = the cost belongs to the whole project. */
  task_id: string | null;
  task_number: number | null;
  task_name: string | null;
  amount: number;
  /** Currency of the linked project. */
  currency: string;
  status: ProjectCostStatus;
  linked_by: string | null;
  linked_by_name: string | null;
  linked_at: string;
}

export interface KsefBankAccount {
  number: string | null;
  bank_name: string | null;
  swift: string | null;
  is_factor: boolean | null;
}

export interface KsefInvoicePayment {
  /** Payment form code of the FA schema ("1"–"7"). */
  form: string | null;
  due_dates: string[];
  bank_accounts: KsefBankAccount[];
  is_partially_paid: boolean | null;
}

export interface KsefInvoiceLine {
  number: number | null;
  name: string | null;
  unit: string | null;
  quantity: number | null;
  unit_net_price: number | null;
  net_amount: number | null;
  vat_rate: string | number | null;
  exchange_rate: number | null;
}

export interface KsefInvoiceDetail extends KsefCostInvoice {
  company_id: string | null;
  invoice_type: string | null;
  sale_date: string | null;
  seller_address: string | null;
  buyer_name: string | null;
  buyer_address: string | null;
  bank_account: string | null;
  is_paid: boolean | null;
  payment_date: string | null;
  amount_due: number | null;
  payment: KsefInvoicePayment | null;
  lines: KsefInvoiceLine[];
  permanent_storage_date: string | null;
  created_at: string;
  has_xml: boolean;
  links: KsefInvoiceLink[];
}

export interface KsefInvoiceQuery {
  date_from?: string;
  date_to?: string;
  seller?: string;
  invoice_number?: string;
  buyer_nip?: string;
  net_min?: number;
  net_max?: number;
  gross_min?: number;
  gross_max?: number;
  page?: number;
  page_size?: number;
}

export interface KsefInvoicePage {
  items: KsefInvoiceRow[];
  total: number;
  page: number;
  page_size: number;
  date_from: string;
  date_to: string;
}

const SYNC_POLL_INTERVAL_MS = 3000;
// Two minutes: a sync usually ends within seconds, a long one is picked up on the next manual refresh.
const SYNC_MAX_POLLS = 40;

@Injectable({ providedIn: 'root' })
export class KsefApiService {
  private readonly http = inject(HttpClient);
  private readonly adminUrl = `${environment.apiUrl}/admin/ksef`;
  private readonly url = `${environment.apiUrl}/ksef`;

  getAdminConfig(): Observable<KsefAdminConfig> {
    return this.http.get<KsefAdminConfig>(this.adminUrl);
  }

  setInitialSyncDays(days: number): Observable<KsefAdminConfig> {
    return this.http.put<KsefAdminConfig>(`${this.adminUrl}/settings`, { initial_sync_days: days });
  }

  createCompany(payload: KsefCompanyCreatePayload): Observable<KsefCompany> {
    return this.http.post<KsefCompany>(`${this.adminUrl}/companies`, payload);
  }

  updateCompany(companyId: string, payload: KsefCompanyUpdatePayload): Observable<KsefCompany> {
    return this.http.patch<KsefCompany>(`${this.adminUrl}/companies/${companyId}`, payload);
  }

  deleteCompany(companyId: string): Observable<void> {
    return this.http.delete<void>(`${this.adminUrl}/companies/${companyId}`);
  }

  listInvoices(query: KsefInvoiceQuery): Observable<KsefInvoicePage> {
    const params: Record<string, string> = {};
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params[name] = String(value);
    }
    return this.http.get<KsefInvoicePage>(`${this.url}/invoices`, { params });
  }

  getInvoice(invoiceId: string): Observable<KsefInvoiceDetail> {
    return this.http.get<KsefInvoiceDetail>(`${this.url}/invoices/${invoiceId}`);
  }

  getSyncState(): Observable<KsefSyncState> {
    return this.http.get<KsefSyncState>(`${this.url}/companies`);
  }

  /** The sync runs in the background; the answer only confirms that it started. */
  startSync(companyId: string | null): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`${this.url}/sync`, { company_id: companyId });
  }

  /**
   * Starts a sync (of one company, or of all with null) and emits once: when
   * every synced company reports a new attempt, or when the wait limit passes.
   */
  syncAndWait(companyId: string | null): Observable<KsefSyncOutcome> {
    const attemptsOf = (state: KsefSyncState) => state.companies
      .filter(company => companyId === null || company.id === companyId)
      .map(company => [company.id, company.last_attempt_at] as const);

    return this.getSyncState().pipe(
      switchMap(before => {
        const previousAttempts = new Map(attemptsOf(before));
        return this.startSync(companyId).pipe(
          switchMap(() => timer(SYNC_POLL_INTERVAL_MS, SYNC_POLL_INTERVAL_MS).pipe(take(SYNC_MAX_POLLS))),
          concatMap(pollIndex => this.getSyncState().pipe(map(state => ({
            state,
            isFinished: attemptsOf(state).every(([id, attemptedAt]) => attemptedAt !== previousAttempts.get(id)),
            isLastPoll: pollIndex === SYNC_MAX_POLLS - 1,
          })))),
          filter(poll => poll.isFinished || poll.isLastPoll),
          take(1),
          map(({ state, isFinished }) => ({ state, isFinished })),
        );
      }),
    );
  }
}
