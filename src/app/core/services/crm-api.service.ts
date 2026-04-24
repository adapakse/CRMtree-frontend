// src/app/core/services/crm-api.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
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
  first_contact_date?: string | null;
  agent_name: string | null;
  agent_email: string | null;
  agent_phone: string | null;
  nip: string | null;
  converted_partner_id?: number | null;
  converted_partner_company?: string | null;
  activity_count?: number;
  non_email_activity_count?: number;
  document_count?: number;
  email_count?: number;
  activities?: LeadActivity[];
  linked_documents?: LinkedDocument[];
  extra_contacts?: LeadContact[];
  can_edit?: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeadActivity {
  id: number;
  lead_id: number;
  type: 'call' | 'email' | 'meeting' | 'note' | 'doc_sent';
  title: string;
  body: string | null;
  activity_at: string | null;
  duration_min: number | null;
  participants: string | null;
  meeting_location: string | null;
  created_by: string | null;
  created_by_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  status: 'new' | 'open' | 'closed';
  close_comment: string | null;
  gmail_thread_id: string | null;
  gmail_message_id: string | null;
  is_read: boolean | null;
}

export interface CalendarMeeting {
  id: number;
  type: string;
  title: string;
  body: string | null;
  activity_at: string;
  duration_min: number | null;
  participants: string | null;
  meeting_location: string | null;
  created_by_name: string | null;
  created_by: string;
  status: 'new' | 'open' | 'closed';
  close_comment: string | null;
  source_type: 'lead' | 'partner';
  source_id: number;
  source_name: string;
  assigned_to_name: string | null;
  assigned_to_id: string | null;
  act_assigned_to_name: string | null;
  act_assigned_to_id: string | null;
}

export interface ActivityTask {
  id: number;
  type: string;
  title: string;
  body: string | null;
  activity_at: string | null;
  duration_min: number | null;
  participants: string | null;
  meeting_location: string | null;
  created_by: string | null;
  created_by_name: string | null;
  status: 'new' | 'open' | 'closed';
  close_comment: string | null;
  created_at: string;
  updated_at: string;
  source_type: 'lead' | 'partner';
  source_id: number;
  source_name: string;
  assigned_to_name: string | null;
  assigned_to_id: string | null;
  act_assigned_to_name: string | null;
  act_assigned_to_id: string | null;
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
  // ── DWH integracja ─────────────────────────────────────────────────────────
  dwh_partner_id: number | null;
  dwh_company_name: string | null;  // oficjalna nazwa firmy z DWH
  dwh_nip: string | null;           // NIP z DWH
  // Pola DWH-fillable: wartości scalone (COALESCE crm, dwh) — CRM ma pierwszeństwo
  subdomain: string | null;
  language: string | null;
  partner_currency: string | null;
  country: string | null;
  billing_address: string | null;
  billing_zip: string | null;
  billing_city: string | null;
  billing_country: string | null;
  billing_email_address: string | null;
  admin_first_name: string | null;
  admin_last_name: string | null;
  admin_email: string | null;
  // Flagi _from_dwh: true gdy wartość pochodzi z DWH (pole w CRM było puste)
  // Używane do logiki read-only: pole jest zablokowane gdy not onboarding AND _from_dwh=true
  subdomain_from_dwh: boolean;
  language_from_dwh: boolean;
  partner_currency_from_dwh: boolean;
  country_from_dwh: boolean;
  billing_address_from_dwh: boolean;
  billing_zip_from_dwh: boolean;
  billing_city_from_dwh: boolean;
  billing_country_from_dwh: boolean;
  billing_email_address_from_dwh: boolean;
  admin_first_name_from_dwh: boolean;
  admin_last_name_from_dwh: boolean;
  admin_email_from_dwh: boolean;
  // Dodatkowe pola z DWH (tylko do odczytu)
  dwh_currency: string | null;
  max_debit: number | null;
  customer_service_note: string | null;
  switched_to_prod_at: string | null;
  // ──────────────────────────────────────────────────────────────────────────
  open_opp_count?: number;
  open_opp_value?: number;
  email_count?: number;
  non_email_activity_count?: number;
  new_email_count?: number;
  last_reply_at?: string | null;
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
  activity_at: string | null;
  duration_min: number | null;
  participants: string | null;
  meeting_location: string | null;
  opp_value: number | null;
  opp_currency: string | null;
  opp_status: 'new' | 'in_progress' | 'closed' | null;
  opp_due_date: string | null;
  created_by: string | null;
  created_by_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  status: 'new' | 'open' | 'closed';
  close_comment: string | null;
  gmail_thread_id: string | null;
  gmail_message_id: string | null;
  is_read: boolean;
}

export interface OnboardingTask {
  id: number;
  partner_id: number;
  partner_name?: string;
  partner_nip?: string;
  partner_step?: number;
  step: number;
  title: string;
  body: string | null;
  type: 'task' | 'call' | 'email' | 'meeting' | 'note' | 'doc_sent' | 'training';
  assigned_to: string | null;
  assigned_to_name: string | null;
  due_date: string | null;
  due_time: string | null;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
  done_by_name: string | null;
  created_by: string | null;
  created_at: string;
}

export interface OnboardingPartner {
  id: number;
  company: string;
  nip: string | null;
  onboarding_step: number;
  status: string;
  created_at: string;
  manager_name: string | null;
  task_count: number;
  done_count: number;
}

export interface OnboardingTaskTemplate {
  id: string;
  title: string;
  type: OnboardingTask['type'];
  step: number;
}


export interface LeadContact {
  id?: number;
  lead_id?: number;
  contact_name: string | null;
  contact_title: string | null;
  email: string | null;
  phone: string | null;
}

export interface PartnerGroup {
  id: number | null;
  name: string;
  industry: string | null;
  description: string | null;
  manager_id: string | null;
  manager_name: string | null;
  source?: 'crm' | 'dwh';
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
export interface LeadsReportStageVelocity { stage: string; count: number; avg_days: number; }

export interface LeadsReport {
  kpi: LeadsReportKpi;
  funnel: LeadsReportFunnel[];
  monthly: LeadsReportMonthly[];
  by_rep: LeadsReportByRep[];
  by_source: LeadsReportBySource[];
  lost_reasons: LeadsReportLostReason[];
  stage_velocity: LeadsReportStageVelocity[];
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

/** Grupa użytkowników CRM — do filtra handlowiec/grupa */
export interface CrmGroup {
  id: string;
  name: string;
  user_ids: string[];
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

// ── Gmail ─────────────────────────────────────────────────────────────────────

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body: string;
  attachments?: { filename: string; mimeType: string; attachmentId: string }[];
}

export interface GmailSendResult {
  messageId: string;
  threadId: string;
  activityId: number;
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
  // Nowe wartości
  'Własne':              'Własne',
  'Cold_Call':           'Cold Call',
  'Partner':             'Partner',
  'Ajent':               'Agent',
  'LinkedIn_Lead_Form':  'LinkedIn Lead Form',
  'LinkedIn_in_mail':    'LinkedIn InMail',
  'Alias_Hello':         'Alias Hello',
  'Formularz_online':    'Formularz online',
  'GoogleAds_AISearch':  'Google Ads AI Search',
  'GoogleAds_PMax':      'Google Ads PMax',
  'GoogleAds_SEA_Brand': 'Google Ads SEA Brand',
  // Stare wartości (fallback dla istniejących danych)
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

export interface LeadSource {
  value: string;
  label: string;
  group: string | null;
}

/** Domyślna lista źródeł — używana jako fallback gdy app_settings nie załadowane */
export const LEAD_SOURCES: LeadSource[] = [
  { value: 'Własne',             label: 'Własne',               group: null },
  { value: 'Cold_Call',          label: 'Cold Call',            group: null },
  { value: 'Partner',            label: 'Partner',              group: null },
  { value: 'Ajent',              label: 'Agent',                group: null },
  { value: 'LinkedIn_Lead_Form', label: 'LinkedIn Lead Form',   group: 'Marketing' },
  { value: 'LinkedIn_in_mail',   label: 'LinkedIn InMail',      group: 'Marketing' },
  { value: 'Alias_Hello',        label: 'Alias Hello',          group: 'Marketing' },
  { value: 'Formularz_online',   label: 'Formularz online',     group: 'Marketing' },
  { value: 'GoogleAds_AISearch', label: 'Google Ads AI Search', group: 'Marketing' },
  { value: 'GoogleAds_PMax',     label: 'Google Ads PMax',      group: 'Marketing' },
  { value: 'GoogleAds_SEA_Brand',label: 'Google Ads SEA Brand', group: 'Marketing' },
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

  /** Zwraca aktywne grupy CRM z listą user_ids — do filtra grup na liście leadów */
  getCrmGroups(): Observable<CrmGroup[]> {
    return this.http.get<CrmGroup[]>(`${BASE}/leads/groups`);
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
  /** Alias — backend obsługuje /migrate i /convert (backwards compat) */
  migrateLead(leadId: number, data: object): Observable<{ lead_id: number; partner: Partner }> {
    return this.http.post<any>(`${BASE}/leads/${leadId}/migrate`, data);
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
  patchLeadActivityRead(leadId: number, actId: number, isRead: boolean): Observable<{ ok: boolean }> {
    return this.http.patch<{ ok: boolean }>(`${BASE}/leads/${leadId}/activities/${actId}/read`, { is_read: isRead });
  }
  patchPartnerActivityRead(partnerId: number, actId: number, isRead: boolean): Observable<{ ok: boolean }> {
    return this.http.patch<{ ok: boolean }>(`${BASE}/partners/${partnerId}/activities/${actId}/read`, { is_read: isRead });
  }
  patchEmailMessageRead(msgId: string, isRead: boolean): Observable<{ ok: boolean }> {
    return this.http.patch<{ ok: boolean }>(`${BASE}/gmail/messages/${msgId}/read`, { is_read: isRead });
  }
  debugProcessGmail(): Observable<any> {
    return this.http.post<any>(`${BASE}/gmail/debug/process`, {});
  }
  getPartnerTransactions(partnerId: number): Observable<Transaction[]> {
    return this.http.get<Transaction[]>(`${BASE}/partners/${partnerId}/transactions`);
  }

  // ── Groups ───────────────────────────────────────────────
  getGroups(): Observable<PartnerGroup[]> {
    return this.http.get<PartnerGroup[]>(`${BASE}/groups`);
  }
  /** Zwraca listę unikalnych nazw grup partnerów (COALESCE DWH + lokalne) — do filtrów */
  getPartnerGroupNames(): Observable<string[]> {
    return this.http.get<string[]>(`${BASE}/partners/group-names`);
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
  getPartnersReport(p: { period_from?: string; period_to?: string; product_type?: string; rep_id?: string; partner_name?: string; group_name?: string } = {}): Observable<PartnersReport> {
    return this.http.get<PartnersReport>(`${BASE}/sales-data/report`, { params: this.toParams(p) });
  }


  // ── Słownik Źródeł (z app_settings) ─────────────────────────
  getLeadSources(): Observable<LeadSource[]> {
    return this.http.get<LeadSource[]>(`${BASE}/leads/sources`);
  }

  // ── Historia Leada ────────────────────────────────────────
  getLeadHistory(leadId: number): Observable<LeadHistoryEntry[]> {
    return this.http.get<LeadHistoryEntry[]>(`${BASE}/leads/${leadId}/history`);
  }

  // ── Historia Partnera ─────────────────────────────────────
  getPartnerHistory(partnerId: number): Observable<LeadHistoryEntry[]> {
    return this.http.get<LeadHistoryEntry[]>(`${BASE}/partners/${partnerId}/history`);
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

  // ── Dodatkowe kontakty leada ─────────────────────────────
  getLeadContacts(leadId: number): Observable<LeadContact[]> {
    return this.http.get<LeadContact[]>(`${BASE}/leads/${leadId}/contacts`);
  }
  saveLeadContacts(leadId: number, contacts: LeadContact[]): Observable<LeadContact[]> {
    return this.http.post<LeadContact[]>(`${BASE}/leads/${leadId}/contacts`, { contacts });
  }

  // ── Konto testowe ───────────────────────────────────────
  getLeadTestAccount(leadId: number): Observable<any> {
    return this.http.get<any>(`${BASE}/leads/${leadId}/test-account`);
  }
  createLeadTestAccount(leadId: number, data: {
    subdomain: string; language: string; partner_currency: string; country: string;
    billing_address: string; billing_zip: string; billing_city: string;
    billing_country: string; billing_email_address: string;
    admin_first_name: string; admin_last_name: string; admin_email: string;
  }): Observable<any> {
    return this.http.post<any>(`${BASE}/leads/${leadId}/test-account`, data);
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

  // ── Zadania (zakładka Zadania w kalendarzu) ───────────────────
  getActivityTasks(p: { assigned_to?: string; type?: string; include_closed?: boolean; include_no_date?: boolean } = {}): Observable<ActivityTask[]> {
    const combined: { [k: string]: string } = {};
    if (p.assigned_to) combined['assigned_to'] = p.assigned_to;
    if (p.type) combined['type'] = p.type;
    if (p.include_closed !== undefined) combined['include_closed'] = String(p.include_closed);
    if (p.include_no_date !== undefined) combined['include_no_date'] = String(p.include_no_date);

    return combineLatest([
      this.http.get<ActivityTask[]>(`${BASE}/leads/tasks`, { params: combined }),
      this.http.get<ActivityTask[]>(`${BASE}/partners/tasks`, { params: combined }),
    ]).pipe(
      map(([leads, partners]) =>
        [...leads, ...partners].sort((a, b) => {
          if (!a.activity_at && !b.activity_at) return 0;
          if (!a.activity_at) return 1;
          if (!b.activity_at) return -1;
          return new Date(a.activity_at).getTime() - new Date(b.activity_at).getTime();
        })
      )
    );
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

  // ── Panel Onboarding — globalne widoki ──────────────────────────────────
  getOnboardingPartners(params: Record<string,any> = {}): Observable<OnboardingPartner[]> {
    return this.http.get<OnboardingPartner[]>(`${BASE}/partners/onboarding`, { params: this.toParams(params) });
  }

  getOnboardingAllTasks(params: Record<string,any> = {}): Observable<OnboardingTask[]> {
    return this.http.get<OnboardingTask[]>(`${BASE}/partners/onboarding/tasks`, { params: this.toParams(params) });
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

  // ── Gmail ─────────────────────────────────────────────────
  sendLeadEmail(leadId: number, data: FormData): Observable<GmailSendResult> {
    return this.http.post<GmailSendResult>(`${BASE}/gmail/send/lead/${leadId}`, data);
  }
  getLeadEmailThread(leadId: number, threadId: string): Observable<GmailMessage[]> {
    return this.http.get<GmailMessage[]>(`${BASE}/gmail/thread/lead/${leadId}/${threadId}`);
  }
  sendPartnerEmail(partnerId: number, data: FormData): Observable<GmailSendResult> {
    return this.http.post<GmailSendResult>(`${BASE}/gmail/send/partner/${partnerId}`, data);
  }
  getPartnerEmailThread(partnerId: number, threadId: string): Observable<GmailMessage[]> {
    return this.http.get<GmailMessage[]>(`${BASE}/gmail/thread/partner/${partnerId}/${threadId}`);
  }
  getGmailStatus(): Observable<{ connected: boolean; email?: string }> {
    return this.http.get<{ connected: boolean; email?: string }>(`${BASE}/gmail/status`);
  }
  getGmailAuthUrl(): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${BASE}/gmail/oauth/url`);
  }
  disconnectGmail(): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${BASE}/gmail/oauth/disconnect`);
  }
  downloadGmailAttachment(messageId: string, attachmentId: string, filename: string, mime: string): Observable<Blob> {
    const params = { filename, mime };
    return this.http.get(
      `${BASE}/gmail/attachment/${messageId}/${attachmentId}`,
      { params, responseType: 'blob' },
    );
  }

}
