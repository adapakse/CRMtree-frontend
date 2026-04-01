// src/app/core/services/crm-api.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

// ─────────────────────────────────────────────────────────────────
// Models
// ─────────────────────────────────────────────────────────────────

export type LeadStage =
  | 'new' | 'qualification' | 'presentation'
  | 'offer' | 'negotiation' | 'closed_won' | 'closed_lost';

export type PartnerStatus = 'onboarding' | 'active' | 'inactive' | 'churned';

export type ProductType =
  | 'hotel' | 'transport_flight' | 'transport_train' | 'transport_bus'
  | 'transport_ferry' | 'car_rental' | 'transfer'
  | 'travel_insurance' | 'visa' | 'other';

export interface Lead {
  id: number;
  company: string;
  website?: string;
  logo_url?: string;
  contact_name: string | null;
  contact_title: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  stage: LeadStage;
  value_pln: number | null;
  probability: number | null;
  close_date: string | null;
  industry: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  tags: string[];
  notes: string | null;
  hot: boolean;
  lost_reason: string | null;
  annual_turnover_currency: string;
  online_pct: number | null;
  converted_at: string | null;
  agent_name: string | null;
  agent_email: string | null;
  agent_phone: string | null;
  activity_count?: number;
  document_count?: number;
  activities?: LeadActivity[];
  linked_documents?: LinkedDocument[];
  created_at: string;
  updated_at: string;
}

export interface LeadActivity {
  id: number;
  lead_id: number;
  type: 'call' | 'email' | 'meeting' | 'note' | 'doc_sent';
  title: string;
  body: string | null;
  activity_at: string;
  duration_min: number | null;
  participants: string | null;
  meeting_location: string | null;
  created_by_name: string | null;
}

export interface CalendarMeeting {
  id: number;
  type: 'meeting';
  title: string;
  body: string | null;
  activity_at: string;
  duration_min: number | null;
  participants: string | null;
  meeting_location: string | null;
  created_by_name: string | null;
  created_by: string;
  source_type: 'lead' | 'partner';
  source_id: number;
  source_name: string;
  assigned_to_name: string | null;
  assigned_to_id: string | null;
}


export interface LinkedDocument {
  id: number;
  document_id: string;
  doc_role: string | null;
  document_title?: string;
  doc_number?: string;
  doc_type?: string;
  linked_at?: string;
}

export interface LeadHistoryEntry {
  id: string;
  user_name: string | null;
  user_email: string | null;
  action: string;
  before_state: any;
  after_state: any;
  metadata: any;
  created_at: string;
}

/** Dane agenta (pola wspólne dla Lead i Partner) */
export interface AgentData {
  agent_name: string | null;
  agent_email: string | null;
  agent_phone: string | null;
}

export interface Partner {
  id: number;
  company: string;
  partner_number: string | null;
  nip: string | null;
  address: string | null;
  contact_name: string | null;
  contact_title: string | null;
  email: string | null;
  phone: string | null;
  // Kontakt do spraw rozliczeń
  billing_contact_name: string | null;
  billing_contact_title: string | null;
  billing_email: string | null;
  billing_phone: string | null;
  // Limit kredytowy
  credit_limit_value: number | null;
  credit_limit_currency: string;
  // Kwota depozytu
  deposit_value: number | null;
  deposit_currency: string;
  deposit_date_in: string | null;
  deposit_date_out: string | null;
  // Prowizja WT/TM
  commission_value: number | null;
  commission_basis: 'segmenty' | 'rezerwacje' | 'progi_obrotowe' | 'nie_dotyczy';
  industry: string | null;
  group_id: number | null;
  group_name: string | null;
  lead_id: number | null;
  lead_company: string | null;
  manager_id: string | null;
  manager_name: string | null;
  contract_signed: string | null;
  contract_expires: string | null;
  contract_value: number | null;
  status: PartnerStatus;
  annual_turnover_currency: string;
  online_pct: number | null;
  license_count: number | null;
  tags: string[];
  active_users: number | null;
  onboarding_step: number;
  notes: string | null;
  agent_name: string | null;
  agent_email: string | null;
  agent_phone: string | null;
  open_opp_count?: number;
  open_opp_value?: number;
  group_siblings?: { id: number; company: string; status: string; contract_value: number | null }[];
  activities?: PartnerActivity[];
  open_opportunities?: Opportunity[];
  all_opportunities?: PartnerActivity[];
  created_at: string;
  updated_at: string;
}

export interface PartnerActivity {
  id: number;
  partner_id: number;
  type: 'call' | 'email' | 'meeting' | 'note' | 'doc_sent' | 'training' | 'qbr' | 'opportunity';
  title: string;
  body: string | null;
  activity_at: string;
  duration_min: number | null;
  participants: string | null;
  meeting_location: string | null;
  opp_value: number | null;
  opp_currency: string | null;
  opp_status: 'new' | 'in_progress' | 'closed' | null;
  opp_due_date: string | null;
  created_by: string | null;
  created_by_name: string | null;
}

export interface OnboardingTask {
  id: number;
  partner_id: number;
  step: number;
  title: string;
  body: string | null;
  type: 'task' | 'call' | 'email' | 'meeting' | 'note' | 'doc_sent' | 'training';
  assigned_to: string | null;
  assigned_to_name: string | null;
  due_date: string | null;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
  done_by_name: string | null;
  created_by: string | null;
  created_at: string;
}


export interface PartnerGroup {
  id: number;
  name: string;
  industry: string | null;
  description: string | null;
  manager_id: string | null;
  manager_name: string | null;
  partner_count: number;
  total_arr: number;
  partners: Partial<Partner>[];
}

export interface Opportunity {
  id: number;
  partner_id: number;
  type: 'upsell' | 'crosssell';
  title: string;
  value_pln: number | null;
  status: 'open' | 'in_progress' | 'won' | 'snoozed' | 'dismissed';
  partner_company?: string;
}

export interface Transaction {
  id: number;
  partner_id: number | null;
  partner_company?: string;
  external_id: string;
  booking_ref: string | null;
  transaction_date: string;
  traveler_name: string | null;
  traveler_email: string | null;
  total_net: number;
  total_gross: number;
  total_commission: number;
  total_margin: number;
  currency: string;
  status: 'confirmed' | 'cancelled' | 'refunded';
  products: TransactionProduct[];
}

export interface TransactionProduct {
  product_type: ProductType;
  product_name: string | null;
  supplier: string | null;
  departure_at: string | null;
  arrival_at: string | null;
  origin_city: string | null;
  destination_city: string | null;
  hotel_name: string | null;
  hotel_stars: number | null;
  room_type: string | null;
  check_in: string | null;
  check_out: string | null;
  flight_number: string | null;
  airline: string | null;
  cabin_class: string | null;
  car_category: string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  net_cost: number;
  gross_cost: number;
  commission_pct: number | null;
  commission_amt: number | null;
  margin_amt: number | null;
  currency: string;
  pax_count: number;
}

export interface ImportResult {
  import_id: number;
  filename: string;
  rows_total: number;
  imported: number;
  skipped: number;
  errors_count: number;
  errors: { row: number; field?: string; company?: string; error: string }[];
}

export interface ImportLog {
  id: number;
  import_type: 'leads' | 'partners' | 'sales';
  filename: string;
  rows_total: number;
  rows_imported: number;
  rows_skipped: number;
  rows_error: number;
  status: 'processing' | 'done' | 'error';
  imported_by_name: string;
  started_at: string;
  finished_at: string | null;
}

export interface SalesTransaction {
  id: number;
  period: string;
  partner_number: string | null;
  partner_name: string;
  partner_id: number | null;
  product_type: string;
  gross_turnover_pln: number;
  net_turnover_pln: number;
  fees_pln: number;
  revenue_pln: number;
  transactions_count: number;
  pax_count: number;
  salesperson_name: string | null;
  salesperson_id: string | null;
  notes: string | null;
  imported_by_name: string | null;
  created_at: string;
}
// ── Raporty Leady ────────────────────────────────────────────────────────────
export interface LeadsReportKpi {
  active: number; won: number; lost: number; hot: number;
  pipeline_value: number; won_value: number;
  win_rate: number; avg_cycle_days: number;
  pipeline_in_period?: number;
}
export interface LeadsReportFunnel   { stage: string; count: number; value: number; }
export interface LeadsReportMonthly  { month: string; new_leads: number; won: number; lost: number; won_value: number; }
export interface LeadsReportByRep    { rep_name: string; rep_id: string; total: number; active: number; won: number; lost: number; pipeline_value: number; won_value: number; win_rate: number; avg_cycle_days: number; }
export interface LeadsReportBySource { source: string; count: number; won_count: number; won_value: number; }
export interface LeadsReportLostReason { reason: string; count: number; }
export interface LeadsReport {
  kpi: LeadsReportKpi;
  funnel: LeadsReportFunnel[];
  monthly: LeadsReportMonthly[];
  by_rep: LeadsReportByRep[];
  by_source: LeadsReportBySource[];
  lost_reasons: LeadsReportLostReason[];
}

// ── Raporty Partnerzy ────────────────────────────────────────────────────────
export interface PartnersReportKpi {
  gross_turnover_pln: number; net_turnover_pln: number; fees_pln: number; revenue_pln: number;
  transactions_count: number; pax_count: number; margin_pct: number; fee_rate_pct: number; partners_count: number;
}
export interface PartnersReportTrend   { period: string; gross_turnover_pln: number; net_turnover_pln: number; revenue_pln: number; transactions_count: number; }
export interface PartnersReportPartner { partner_name: string; partner_number: string | null; partner_id: number | null; salesperson_name: string | null; salesperson_id: string | null; gross_turnover_pln: number; net_turnover_pln: number; fees_pln: number; revenue_pln: number; transactions_count: number; pax_count: number; }
export interface PartnersReportProduct { product_type: string; gross_turnover_pln: number; net_turnover_pln: number; fees_pln: number; revenue_pln: number; transactions_count: number; pax_count: number; }
export interface PartnersReportByRep   { salesperson_name: string; salesperson_id: string | null; partners_count: number; gross_turnover_pln: number; net_turnover_pln: number; fees_pln: number; revenue_pln: number; transactions_count: number; pax_count: number; }
export interface PartnersReport {
  kpi: PartnersReportKpi;
  prev_kpi: PartnersReportKpi | null;
  trend: PartnersReportTrend[];
  by_partner: PartnersReportPartner[];
  by_product: PartnersReportProduct[];
  by_rep: PartnersReportByRep[];
  period_from: string;
  period_to: string;
}



export interface SalesSummaryRow {
  period: string;
  gross_turnover_pln: number;
  net_turnover_pln: number;
  fees_pln: number;
  revenue_pln: number;
  transactions_count: number;
  pax_count: number;
}

export interface SalesByPartner {
  partner_number: string | null;
  partner_name: string;
  partner_id: number | null;
  salesperson_name: string | null;
  salesperson_id: string | null;
  gross_turnover_pln: number;
  net_turnover_pln: number;
  fees_pln: number;
  revenue_pln: number;
  transactions_count: number;
  pax_count: number;
}

export interface SalesByPerson {
  salesperson_name: string;
  salesperson_id: string | null;
  partners_count: number;
  gross_turnover_pln: number;
  net_turnover_pln: number;
  fees_pln: number;
  revenue_pln: number;
  transactions_count: number;
  pax_count: number;
}

export interface SalesByProduct {
  product_type: string;
  gross_turnover_pln: number;
  net_turnover_pln: number;
  fees_pln: number;
  revenue_pln: number;
  transactions_count: number;
  pax_count: number;
}

export interface SalesPartnerMeta {
  partner_number: string | null;
  partner_name: string;
  partner_id: number | null;
  salesperson_name: string | null;
}

export interface SalesImportResult {
  rows_total: number;
  rows_imported: number;
  rows_skipped: number;
  rows_error: number;
  errors: { line: number; reason: string }[];
}

export interface SalesImportLog {
  id: number;
  filename: string;
  rows_total: number;
  rows_imported: number;
  rows_skipped: number;
  rows_error: number;
  status: 'done' | 'error';
  imported_by_name: string | null;
  created_at: string;
}

export interface PagedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

/** Użytkownik systemu do wyboru jako handlowiec/opiekun */
export interface CrmUser {
  id: string;
  display_name: string;
  email: string;
  crm_role: 'salesperson' | 'sales_manager' | null;
}

/** Planowany budżet sprzedażowy */
export interface SalesBudget {
  id: number;
  user_id: string;
  user_name?: string;
  year: number;
  period_type: 'month' | 'quarter';
  period_number: number;
  amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────
// Stałe
// ─────────────────────────────────────────────────────────────────

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new:           'Nowy',
  qualification: 'Kwalifikacja',
  presentation:  'Prezentacja',
  offer:         'Oferta',
  negotiation:   'Negocjacje',
  closed_won:    'Wygrany',
  closed_lost:   'Przegrany',
};

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  onboarding: 'Wdrożenie',
  active:     'Aktywny',
  inactive:   'Nieaktywny',
  churned:    'Utracony',
};

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  hotel:             'Hotel',
  transport_flight:  'Lot',
  transport_train:   'Pociąg',
  transport_bus:     'Autobus',
  transport_ferry:   'Prom',
  car_rental:        'Wynajem auta',
  transfer:          'Transfer',
  travel_insurance:  'Ubezpieczenie',
  visa:              'Wiza',
  other:             'Inne',
};

export const PRODUCT_TYPE_ICONS: Record<ProductType, string> = {
  hotel:             '🏨',
  transport_flight:  '✈️',
  transport_train:   '🚂',
  transport_bus:     '🚌',
  transport_ferry:   '⛴️',
  car_rental:        '🚗',
  transfer:          '🚕',
  travel_insurance:  '🛡️',
  visa:              '🪪',
  other:             '📦',
};

/** Źródła leadów — spójne z importem CSV (pole source/zrodlo) */
/** Mapa etykiet dla kluczy źródeł — używana przy renderowaniu listy z app_settings */
export const LEAD_SOURCE_LABELS: Record<string, string> = {
  strona_www: 'Strona www',
  polecenie:  'Polecenie',
  cold_call:  'Cold call',
  linkedin:   'LinkedIn',
  targi:      'Targi / Wydarzenie',
  partner:    'Partner',
  agent:      'Agent',
  kampania:   'Kampania email',
  inbound:    'Inbound',
  inne:       'Inne',
};

/** Domyślna lista źródeł — używana jako fallback gdy app_settings nie załadowane */
export const LEAD_SOURCES: { value: string; label: string }[] = [
  { value: 'strona_www',  label: 'Strona www' },
  { value: 'polecenie',   label: 'Polecenie' },
  { value: 'cold_call',   label: 'Cold call' },
  { value: 'linkedin',    label: 'LinkedIn' },
  { value: 'targi',       label: 'Targi / Wydarzenie' },
  { value: 'partner',     label: 'Partner' },
  { value: 'agent',       label: 'Agent' },
  { value: 'kampania',    label: 'Kampania email' },
  { value: 'inbound',     label: 'Inbound' },
  { value: 'inne',        label: 'Inne' },
];

// ─────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────

const BASE = `${environment.apiUrl}/crm`;

@Injectable({ providedIn: 'root' })
export class CrmApiService {
  private http = inject(HttpClient);

  private toParams(obj: Record<string, any>): HttpParams {
    let p = new HttpParams();
    Object.entries(obj).forEach(([k, v]) => { if (v != null && v !== '') p = p.set(k, String(v)); });
    return p;
  }

  // ── Użytkownicy CRM (do wyboru handlowca / opiekuna) ──────────
  /** Zwraca aktywnych użytkowników z rolą CRM (salesperson + sales_manager) */
  getCrmUsers(): Observable<CrmUser[]> {
    return this.http.get<CrmUser[]>(`${BASE}/leads/users`);
  }

  // ── Leads ────────────────────────────────────────────────
  getLeads(params: Record<string, any> = {}): Observable<PagedResponse<Lead>> {
    return this.http.get<PagedResponse<Lead>>(`${BASE}/leads`, { params: this.toParams(params) });
  }
  getLead(id: number): Observable<Lead> {
    return this.http.get<Lead>(`${BASE}/leads/${id}`);
  }
  createLead(data: Partial<Lead>): Observable<Lead> {
    return this.http.post<Lead>(`${BASE}/leads`, data);
  }
  getLeadLogoSas(leadId: number): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${BASE}/leads/${leadId}/logo`);
  }
  getLeadLogoImg(leadId: number): Observable<string> {
    return new Observable(observer => {
      this.http.get(`${BASE}/leads/${leadId}/logo-img`, { responseType: 'blob' }).subscribe({
        next: blob => {
          const url = URL.createObjectURL(blob);
          observer.next(url);
          observer.complete();
        },
        error: e => observer.error(e),
      });
    });
  }
  enrichDomain(domain: string): Observable<{
    domain: string; company: string | null; email: string | null;
    phone: string | null; address: string | null;
    nip: string | null; regon: string | null; logo_blob_path: string | null;
  }> {
    return this.http.post<any>(`${BASE}/leads/enrich`, { domain });
  }
  updateLead(id: number, data: Partial<Lead>): Observable<Lead> {
    return this.http.patch<Lead>(`${BASE}/leads/${id}`, data);
  }
  deleteLead(id: number): Observable<void> {
    return this.http.delete<void>(`${BASE}/leads/${id}`);
  }
  getLeadActivities(leadId: number): Observable<LeadActivity[]> {
    return this.http.get<LeadActivity[]>(`${BASE}/leads/${leadId}/activities`);
  }
  createLeadActivity(leadId: number, data: Partial<LeadActivity>): Observable<LeadActivity> {
    return this.http.post<LeadActivity>(`${BASE}/leads/${leadId}/activities`, data);
  }
  updateLeadActivity(leadId: number, actId: number, data: Partial<LeadActivity>): Observable<LeadActivity> {
    return this.http.patch<LeadActivity>(`${BASE}/leads/${leadId}/activities/${actId}`, data);
  }
  deleteLeadActivity(leadId: number, actId: number): Observable<void> {
    return this.http.delete<void>(`${BASE}/leads/${leadId}/activities/${actId}`);
  }
  linkDocumentToLead(leadId: number, documentId: number, docRole?: string): Observable<any> {
    return this.http.post(`${BASE}/leads/${leadId}/documents`, { document_id: documentId, doc_role: docRole });
  }
  convertLead(leadId: number, data: object): Observable<{ lead_id: number; partner: Partner }> {
    return this.http.post<any>(`${BASE}/leads/${leadId}/convert`, data);
  }

  // ── Partners ─────────────────────────────────────────────
  getPartners(params: Record<string, any> = {}): Observable<PagedResponse<Partner>> {
    return this.http.get<PagedResponse<Partner>>(`${BASE}/partners`, { params: this.toParams(params) });
  }
  getPartner(id: number): Observable<Partner> {
    return this.http.get<Partner>(`${BASE}/partners/${id}`);
  }
  createPartner(data: Partial<Partner>): Observable<Partner> {
    return this.http.post<Partner>(`${BASE}/partners`, data);
  }
  updatePartner(id: number, data: Partial<Partner>): Observable<Partner> {
    return this.http.patch<Partner>(`${BASE}/partners/${id}`, data);
  }
  updateOnboardingStep(partnerId: number, step: number): Observable<Partner> {
    return this.http.patch<Partner>(`${BASE}/partners/${partnerId}/onboarding`, { step });
  }
  deletePartner(id: number): Observable<void> {
    return this.http.delete<void>(`${BASE}/partners/${id}`);
  }
  getPartnerActivities(partnerId: number): Observable<PartnerActivity[]> {
    return this.http.get<PartnerActivity[]>(`${BASE}/partners/${partnerId}/activities`);
  }
  createPartnerActivity(partnerId: number, data: Partial<PartnerActivity>): Observable<PartnerActivity> {
    return this.http.post<PartnerActivity>(`${BASE}/partners/${partnerId}/activities`, data);
  }
  updatePartnerActivity(partnerId: number, actId: number, data: Partial<PartnerActivity>): Observable<PartnerActivity> {
    return this.http.patch<PartnerActivity>(`${BASE}/partners/${partnerId}/activities/${actId}`, data);
  }
  deletePartnerActivity(partnerId: number, actId: number): Observable<void> {
    return this.http.delete<void>(`${BASE}/partners/${partnerId}/activities/${actId}`);
  }
  getPartnerTransactions(partnerId: number): Observable<Transaction[]> {
    return this.http.get<Transaction[]>(`${BASE}/partners/${partnerId}/transactions`);
  }

  // ── Groups ───────────────────────────────────────────────
  getGroups(): Observable<PartnerGroup[]> {
    return this.http.get<PartnerGroup[]>(`${BASE}/groups`);
  }
  getGroup(id: number): Observable<PartnerGroup> {
    return this.http.get<PartnerGroup>(`${BASE}/groups/${id}`);
  }
  createGroup(data: Partial<PartnerGroup>): Observable<PartnerGroup> {
    return this.http.post<PartnerGroup>(`${BASE}/groups`, data);
  }
  updateGroup(id: number, data: Partial<PartnerGroup>): Observable<PartnerGroup> {
    return this.http.patch<PartnerGroup>(`${BASE}/groups/${id}`, data);
  }
  deleteGroup(id: number): Observable<void> {
    return this.http.delete<void>(`${BASE}/groups/${id}`);
  }

  // ── Dashboard ─────────────────────────────────────────────
  getDashboard(): Observable<any> {
    return this.http.get<any>(`${BASE}/dashboard`);
  }
  getPartnerPerformance(period = '12m'): Observable<any> {
    return this.http.get<any>(`${BASE}/dashboard/partner-performance`, { params: { period } });
  }
  getRenewals(): Observable<any[]> {
    return this.http.get<any[]>(`${BASE}/dashboard/renewals`);
  }

  // ── Transactions ──────────────────────────────────────────
  getTransactions(params: Record<string, any> = {}): Observable<PagedResponse<Transaction>> {
    return this.http.get<PagedResponse<Transaction>>(`${BASE}/transactions`, { params: this.toParams(params) });
  }
  getTransactionReport(dateFrom?: string, dateTo?: string): Observable<any> {
    const p: any = {};
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo)   p.date_to   = dateTo;
    return this.http.get<any>(`${BASE}/transactions/report/summary`, { params: this.toParams(p) });
  }
  updateTransactionStatus(id: number, status: string): Observable<Transaction> {
    return this.http.patch<Transaction>(`${BASE}/transactions/${id}/status`, { status });
  }

  // ── Import ────────────────────────────────────────────────
  importLeadsCsv(file: File): Observable<ImportResult> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<ImportResult>(`${BASE}/import/leads`, fd);
  }
  importPartnersCsv(file: File): Observable<ImportResult> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<ImportResult>(`${BASE}/import/partners`, fd);
  }
  importDocumentsCsv(file: File): Observable<ImportResult> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<ImportResult>(`${BASE}/import/documents`, fd);
  }
  getImportLogs(): Observable<ImportLog[]> {
    return this.http.get<ImportLog[]>(`${BASE}/import/logs`);
  }
  downloadImportTemplate(type: 'leads' | 'partners'): void {
    this.http.get(`${BASE}/import/template/${type}`, {
      responseType: 'blob',
      observe: 'response',
    }).subscribe({
      next: response => {
        const blob = response.body!;
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `import_${type}_template.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => console.error('Błąd pobierania szablonu'),
    });
  }

  // ── Sales Data (dane z zewnętrznego systemu, row-level) ────────
  getSalesTransactions(p: { period_from?: string; period_to?: string; partner_name?: string; product_type?: string } = {}): Observable<SalesTransaction[]> {
    return this.http.get<SalesTransaction[]>(`${BASE}/sales-data`, { params: this.toParams(p) });
  }
  getSalesSummary(p: { period_from?: string; period_to?: string; partner_name?: string; product_type?: string } = {}): Observable<SalesSummaryRow[]> {
    return this.http.get<SalesSummaryRow[]>(`${BASE}/sales-data/summary`, { params: this.toParams(p) });
  }
  getSalesByPartner(p: { period_from?: string; period_to?: string; product_type?: string; salesperson_name?: string } = {}): Observable<SalesByPartner[]> {
    return this.http.get<SalesByPartner[]>(`${BASE}/sales-data/by-partner`, { params: this.toParams(p) });
  }
  getSalesBySalesperson(p: { period_from?: string; period_to?: string; product_type?: string } = {}): Observable<SalesByPerson[]> {
    return this.http.get<SalesByPerson[]>(`${BASE}/sales-data/by-salesperson`, { params: this.toParams(p) });
  }
  getSalesByProduct(p: { period_from?: string; period_to?: string; partner_name?: string } = {}): Observable<SalesByProduct[]> {
    return this.http.get<SalesByProduct[]>(`${BASE}/sales-data/by-product`, { params: this.toParams(p) });
  }
  getSalesPartnersMeta(): Observable<SalesPartnerMeta[]> {
    return this.http.get<SalesPartnerMeta[]>(`${BASE}/sales-data/partners`);
  }
  importSalesDataCsv(file: File): Observable<SalesImportResult> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<SalesImportResult>(`${BASE}/sales-data/import`, fd);
  }
  downloadSalesDataTemplate(): void {
    this.http.get(`${BASE}/sales-data/template`, { responseType: 'blob', observe: 'response' }).subscribe({
      next: r => {
        const url = URL.createObjectURL(r.body!);
        const a = document.createElement('a');
        a.href = url; a.download = 'import_dane_sprzedazowe_template.csv';
        a.click(); URL.revokeObjectURL(url);
      },
      error: () => console.error('Błąd pobierania szablonu'),
    });
  }

  // ── Raport Leady ─────────────────────────────────────────────
  getLeadsReport(p: { date_from?: string; date_to?: string; assigned_to?: string } = {}): Observable<LeadsReport> {
    return this.http.get<LeadsReport>(`${BASE}/leads/report`, { params: this.toParams(p) });
  }

  // ── Raport Partnerzy ──────────────────────────────────────────
  getPartnersReport(p: { period_from?: string; period_to?: string; product_type?: string } = {}): Observable<PartnersReport> {
    return this.http.get<PartnersReport>(`${BASE}/sales-data/report`, { params: this.toParams(p) });
  }


  // ── Słownik Źródeł (z app_settings) ─────────────────────────
  getLeadSources(): Observable<{ value: string; label: string }[]> {
    return this.http.get<{ value: string; label: string }[]>(`${BASE}/leads/sources`);
  }

  // ── Historia Leada ────────────────────────────────────────
  getLeadHistory(leadId: number): Observable<LeadHistoryEntry[]> {
    return this.http.get<LeadHistoryEntry[]>(`${BASE}/leads/${leadId}/history`);
  }

  // ── Dokumenty powiązane z Leadem ──────────────────────────
  getLeadDocuments(leadId: number): Observable<LinkedDocument[]> {
    return this.http.get<LinkedDocument[]>(`${BASE}/leads/${leadId}/documents`);
  }
  linkLeadDocument(leadId: number, documentId: string, docRole?: string): Observable<LinkedDocument> {
    return this.http.post<LinkedDocument>(`${BASE}/leads/${leadId}/documents`, { document_id: documentId, doc_role: docRole });
  }
  unlinkLeadDocument(leadId: number, documentId: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/leads/${leadId}/documents/${documentId}`);
  }

  // ── Dokumenty powiązane z Partnerem ───────────────────────
  getPartnerDocuments(partnerId: number): Observable<LinkedDocument[]> {
    return this.http.get<LinkedDocument[]>(`${BASE}/partners/${partnerId}/documents`);
  }
  linkPartnerDocument(partnerId: number, documentId: string, docRole?: string): Observable<LinkedDocument> {
    return this.http.post<LinkedDocument>(`${BASE}/partners/${partnerId}/documents`, { document_id: documentId, doc_role: docRole });
  }
  unlinkPartnerDocument(partnerId: number, documentId: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/partners/${partnerId}/documents/${documentId}`);
  }

  // ── Wyszukiwanie dokumentów (do pickera) ──────────────────
  searchDocuments(search: string): Observable<{ data: any[] }> {
    const params = this.toParams({ search, limit: 20, sort: 'name', order: 'asc' });
    return this.http.get<{ data: any[] }>(`${environment.apiUrl}/documents`, { params });
  }

  // ── Kalendarz ────────────────────────────────────────────────
  getCalendarMeetings(p: { date_from?: string; date_to?: string; assigned_to?: string } = {}): Observable<CalendarMeeting[]> {
    return this.http.get<CalendarMeeting[]>(`${BASE}/leads/calendar`, { params: this.toParams(p) });
  }

  // ── Planowane Budżety Sprzedażowe ─────────────────────────
  getSalesBudgets(p: { user_id?: string; year?: number } = {}): Observable<SalesBudget[]> {
    return this.http.get<SalesBudget[]>(`${BASE}/budgets`, { params: this.toParams(p) });
  }
  upsertSalesBudget(data: {
    user_id: string; year: number; period_type: 'month' | 'quarter';
    period_number: number; amount: number; currency?: string;
  }): Observable<SalesBudget> {
    return this.http.post<SalesBudget>(`${BASE}/budgets`, data);
  }
  deleteSalesBudgetsByUser(user_id: string, year: number): Observable<void> {
    return this.http.delete<void>(`${BASE}/budgets/by-user`, { params: this.toParams({ user_id, year }) });
  }
  getSalesBudgetTotal(p: { year?: number; date_from?: string; date_to?: string; assigned_to?: string } = {}): Observable<{ total: number; year: number; currency: string }> {
    return this.http.get<{ total: number; year: number; currency: string }>(`${BASE}/budgets/total`, { params: this.toParams(p) });
  }

  // ── Podpowiedzi kontaktów do aktywności ──────────────────────
  getContactSuggestions(leadId?: number, partnerId?: number): Observable<{ email: string; name: string }[]> {
    const p: any = {};
    if (leadId)    p.lead_id    = leadId;
    if (partnerId) p.partner_id = partnerId;
    return this.http.get<{ email: string; name: string }[]>(`${BASE}/leads/contact-suggestions`, { params: this.toParams(p) });
  }


  // ── Onboarding Tasks ─────────────────────────────────────
  getOnboardingTasks(partnerId: number): Observable<OnboardingTask[]> {
    return this.http.get<OnboardingTask[]>(`${BASE}/partners/${partnerId}/onboarding-tasks`);
  }
  createOnboardingTask(partnerId: number, data: Partial<OnboardingTask>): Observable<OnboardingTask> {
    return this.http.post<OnboardingTask>(`${BASE}/partners/${partnerId}/onboarding-tasks`, data);
  }
  updateOnboardingTask(partnerId: number, taskId: number, data: Partial<OnboardingTask>): Observable<OnboardingTask> {
    return this.http.patch<OnboardingTask>(`${BASE}/partners/${partnerId}/onboarding-tasks/${taskId}`, data);
  }
  deleteOnboardingTask(partnerId: number, taskId: number): Observable<void> {
    return this.http.delete<void>(`${BASE}/partners/${partnerId}/onboarding-tasks/${taskId}`);
  }

}
