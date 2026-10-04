import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { LocaleService } from '../../../core/i18n/locale.service';
import { AppSettingsService, AppSettingsMeta } from '../../../core/services/app-settings.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ProjectSettingsComponent } from '../project-settings/project-settings.component';
import { LanguagePickerComponent } from '../../../shared/components/language-picker/language-picker.component';
import { environment } from '../../../../environments/environment';
import { Tenant } from '../../../core/models/models';

interface SettingField {
  key: string;
  label: string;
  description: string;
  value_type: 'number' | 'boolean' | 'string' | 'json';
  category: string;
  updated_at: string;
  updated_by_name: string | null;
  draft: string;
  dirty: boolean;
  error: string;
}

// Zakładki
type Tab = 'global' | 'crm' | 'documents' | 'users' | 'onboarding' | 'tooltips' | 'icp' | 'projects';

// Dynamic ICP config per tenant. `key` is immutable once created — editable
// only through `label`; the backend rejects any attempt to change `key`, so
// the form never sends it. `requires_any_of` holds OTHER signals' `id` (not
// `key`) — an internal backend relationship, never edited from this tab
// directly (V1: managed only via the API, not a dependency picker).
interface IcpSignal {
  id: string;
  key: string;
  label: string;
  ai_definition: string;
  short_description: string | null;
  points: number;
  tier: string | null;
  active: boolean;
  sort_order: number;
  requires_any_of: string[] | null;
}

interface IcpConfig {
  // qualification_threshold: read-only here — the single editable source is
  // app_settings.prospect_lead_min_score (zakładka "Parametry biznesowe CRM"),
  // frozen into this snapshot only for historical explainability.
  qualification_threshold: number;
  // config_revision: concurrency token dla LIVE edycji (tenant_icp_signals),
  // niezależny od current_version/current_version_id — te dwa liczniki celowo
  // się rozjeżdżają: LIVE może być chwilowo invalid bez ruszania opublikowanej
  // wersji, którą realnie używa enrichment. Patrz tenantIcpConfigService.js.
  config_revision: number;
  current_version_id: string | null;
  current_version: number | null;
  // Kto i kiedy opublikował wersję, której realnie używa enrichment. Autor może
  // być null — created_by ma ON DELETE SET NULL, wersja przeżywa usunięcie usera.
  current_version_published_at: string | null;
  current_version_author: string | null;
  is_default: boolean;
  signals: IcpSignal[];
  signals_sum: number;
  signals_max: number;
  is_valid: boolean;
  final_max_score: number;
}

// One list row = one persisted signal. Only points/active are quick-editable
// inline (number field + toggle right on the list); name and the full "jak
// rozpoznać ten sygnał" text only change through the edit modal
// (icpModalDraft below). Dirty state is derived (isIcpRowDirty).
interface IcpRow {
  signal: IcpSignal;
  points: number;
  active: boolean;
}

// Draft bound to the edit modal — plain-mutable-object + ngModel.
interface IcpModalDraft {
  label: string;
  ai_definition: string;
  short_description: string;
  points: number;
  active: boolean;
}

// Katalog tooltip-slotów: klucz techniczny → ekran + label (widoczne dla admina)
// `screen` and `labelKey` are translation keys under `admin.settings.tooltips.screens` / `.catalog`.
interface TooltipCatalogEntry { key: string; screen: string; labelKey: string }

const TOOLTIP_CATALOG: TooltipCatalogEntry[] = [
  // Partner Performance
  { key: 'crm.partners.kpi.gross_turnover',  screen: 'partnerPerformance', labelKey: 'partnersKpiGrossTurnover' },
  { key: 'crm.partners.kpi.revenue',         screen: 'partnerPerformance', labelKey: 'partnersKpiRevenue' },
  { key: 'crm.partners.kpi.fees',            screen: 'partnerPerformance', labelKey: 'partnersKpiFees' },
  { key: 'crm.partners.kpi.transactions',    screen: 'partnerPerformance', labelKey: 'partnersKpiTransactions' },
  { key: 'crm.partners.kpi.active_partners', screen: 'partnerPerformance', labelKey: 'partnersKpiActivePartners' },
  { key: 'crm.partners.scorecard.health',    screen: 'partnerPerformance', labelKey: 'partnersScorecardHealth' },
  // Raporty sprzedaży – KPI
  { key: 'crm.leads.kpi.pipeline',  screen: 'salesReports', labelKey: 'leadsKpiPipeline' },
  { key: 'crm.leads.kpi.won',       screen: 'salesReports', labelKey: 'leadsKpiWon' },
  { key: 'crm.leads.kpi.win_rate',  screen: 'salesReports', labelKey: 'leadsKpiWinRate' },
  { key: 'crm.leads.kpi.avg_cycle', screen: 'salesReports', labelKey: 'leadsKpiAvgCycle' },
  { key: 'crm.leads.kpi.budget',    screen: 'salesReports', labelKey: 'leadsKpiBudget' },
  // Raporty sprzedaży – Lejek
  { key: 'crm.leads.funnel.title',       screen: 'salesReports', labelKey: 'leadsFunnelTitle' },
  { key: 'crm.leads.funnel.pct',         screen: 'salesReports', labelKey: 'leadsFunnelPct' },
  { key: 'crm.leads.funnel.conversion',  screen: 'salesReports', labelKey: 'leadsFunnelConversion' },
  { key: 'crm.leads.funnel.avg_won',     screen: 'salesReports', labelKey: 'leadsFunnelAvgWon' },
  { key: 'crm.leads.funnel.active',      screen: 'salesReports', labelKey: 'leadsFunnelActive' },
  { key: 'crm.leads.funnel.hot',         screen: 'salesReports', labelKey: 'leadsFunnelHot' },
  // Raporty sprzedaży – Trend miesięczny
  { key: 'crm.leads.trend.title',        screen: 'salesReports', labelKey: 'leadsTrendTitle' },
  // Raporty sprzedaży – Wyniki handlowców
  { key: 'crm.leads.reps.title',         screen: 'salesReports', labelKey: 'leadsRepsTitle' },
  { key: 'crm.leads.reps.col.leads',     screen: 'salesReports', labelKey: 'leadsRepsColLeads' },
  { key: 'crm.leads.reps.col.pipeline',  screen: 'salesReports', labelKey: 'leadsRepsColPipeline' },
  { key: 'crm.leads.reps.col.won',       screen: 'salesReports', labelKey: 'leadsRepsColWon' },
  { key: 'crm.leads.reps.col.win_rate',  screen: 'salesReports', labelKey: 'leadsRepsColWinRate' },
  { key: 'crm.leads.reps.col.progress',  screen: 'salesReports', labelKey: 'leadsRepsColProgress' },
  // Raporty sprzedaży – Źródła leadów
  { key: 'crm.leads.sources.title',      screen: 'salesReports', labelKey: 'leadsSourcesTitle' },
  { key: 'crm.leads.sources.quality',    screen: 'salesReports', labelKey: 'leadsSourcesQuality' },
  // Raporty sprzedaży – Czas w etapie
  { key: 'crm.leads.velocity.title',     screen: 'salesReports', labelKey: 'leadsVelocityTitle' },
  // Raporty sprzedaży – Powody przegranej
  { key: 'crm.leads.lost.title',         screen: 'salesReports', labelKey: 'leadsLostTitle' },
  // Sales Dashboard – KPI
  { key: 'crm.sales.kpi.new_contacts',   screen: 'salesDashboard', labelKey: 'salesKpiNewContacts' },
  { key: 'crm.sales.kpi.new_companies',  screen: 'salesDashboard', labelKey: 'salesKpiNewCompanies' },
  { key: 'crm.sales.kpi.new_leads',      screen: 'salesDashboard', labelKey: 'salesKpiNewLeads' },
  { key: 'crm.sales.kpi.pipeline_value', screen: 'salesDashboard', labelKey: 'salesKpiPipelineValue' },
  { key: 'crm.sales.kpi.won',            screen: 'salesDashboard', labelKey: 'salesKpiWon' },
  // Sales Dashboard – Panele
  { key: 'crm.sales.pipeline',           screen: 'salesDashboard', labelKey: 'salesPipeline' },
  { key: 'crm.sales.chart',              screen: 'salesDashboard', labelKey: 'salesChart' },
  { key: 'crm.sales.tasks',              screen: 'salesDashboard', labelKey: 'salesTasks' },
  { key: 'crm.sales.recent_leads',       screen: 'salesDashboard', labelKey: 'salesRecentLeads' },
  { key: 'crm.sales.activity',           screen: 'salesDashboard', labelKey: 'salesActivity' },
];

// Kategorie globalnej aplikacji
const GLOBAL_CATEGORIES = ['documents', 'workflow', 'general'];
// Klucze słownikowe dokumentów - pokazywane tylko w zakładce 'Słowniki dokumentów'
const DOC_DICT_KEYS = ['doc_types', 'doc_statuses', 'doc_gdpr_types', 'doc_entity1_options', 'doc_contract_subjects'];
const CRM_DICT_KEYS = ['onboarding_task_templates', 'crm_lead_sources'];

const CATEGORY_LABELS: Record<string, { labelKey: string; icon: string }> = {
  documents: { labelKey: 'admin.settings.global.categories.documents', icon: '📄' },
  workflow:  { labelKey: 'admin.settings.global.categories.workflow',  icon: '🗂' },
  general:   { labelKey: 'admin.settings.global.categories.general',   icon: '⚙️' },
  crm:       { labelKey: 'admin.settings.global.categories.crm',       icon: '💼' },
};

// Etykiety dla pól json – mapuje klucz → etykiety elementów tablicy
// `group` is the namespace under `admin.settings.itemLabels`; `codes` lists the
// technical values that have a translated label there. Any other value is shown as is.
const COMMISSION_BASIS_CODES = ['nie_dotyczy', 'segmenty', 'rezerwacje', 'progi_obrotowe'];
const JSON_ITEM_LABELS: Record<string, { group: string; codes: string[] }> = {
  crm_product_types: {
    group: 'productTypes',
    codes: ['hotel', 'transport_flight', 'transport_train', 'transport_bus', 'transport_ferry',
            'car_rental', 'transfer', 'travel_insurance', 'visa', 'other'],
  },
  crm_commission_basis_options: { group: 'commissionBasis', codes: COMMISSION_BASIS_CODES },
  // Słowniki leadów i partnerów
  crm_lead_sources: {
    group: 'leadSources',
    codes: ['strona_www', 'polecenie', 'cold_call', 'linkedin', 'targi', 'partner',
            'agent', 'kampania', 'inbound', 'inne'],
  },
  crm_lead_stages: {
    group: 'leadStages',
    codes: ['new', 'qualification', 'presentation', 'offer', 'negotiation', 'closed_won', 'closed_lost'],
  },
  crm_partner_statuses: { group: 'partnerStatuses', codes: ['onboarding', 'active', 'inactive', 'churned'] },
  crm_contact_titles: { group: 'contactTitles', codes: ['Director', 'Manager', 'Specialist', 'Owner', 'Other'] },
  crm_industries: {
    group: 'industries',
    codes: ['Finance', 'Transport', 'Tourism', 'Healthcare', 'Retail', 'Manufacturing', 'Legal', 'Education', 'Other'],
  },
  crm_commission_basis: { group: 'commissionBasis', codes: COMMISSION_BASIS_CODES },
  // Słowniki dokumentów
  doc_types: {
    group: 'documentTypes',
    codes: ['partner_agreement', 'nda', 'it_supplier_agreement', 'employee_agreement'],
  },
  doc_gdpr_types: {
    group: 'gdprTypes',
    codes: ['no_gdpr', 'data_processing_entrustment', 'data_administration'],
  },
  doc_statuses: {
    group: 'documentStatuses',
    codes: ['new', 'being_edited', 'being_approved', 'being_signed', 'signed', 'completed', 'rejected'],
  },
};

@Component({
  selector: 'wt-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ProjectSettingsComponent, LanguagePickerComponent, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t; prefix: 'admin'">
    <div id="topbar">
      <span class="page-title">{{ t('settings.title') }}</span>
      <span class="tsp"></span>
      @if (dirty()) {
        <span style="font-size:12px;color:var(--orange);font-weight:500;margin-right:8px">
          ● {{ t('settings.topbar.unsavedChanges') }}
        </span>
      }
      <button class="btn btn-p" [disabled]="saving() || !dirty()" (click)="saveAll()">
        @if (saving()) { {{ t('settings.actions.saving') }} } @else { 💾 {{ t('settings.actions.saveChanges') }} }
      </button>
      <button class="btn btn-g" [disabled]="!dirty()" (click)="resetDrafts()">
        {{ t('settings.actions.discard') }}
      </button>
    </div>

    <div id="content">
      @if (loading()) {
        <div class="loading-overlay"><div class="spinner"></div></div>
      }

      <div style="max-width:820px">

        <a class="survey-link" routerLink="/admin/onboarding-survey">
          <span style="font-size:18px">📝</span>
          <span>
            <strong>{{ t('settings.survey.title') }}</strong> {{ t('settings.survey.description') }}
          </span>
          <span class="survey-link-cta">{{ t('settings.survey.open') }} →</span>
        </a>

        <!-- Zakładki -->
        <div class="tabs">
          <button class="tab-btn" [class.active]="activeTab() === 'global'" (click)="activeTab.set('global')">
            ⚙️ {{ t('settings.tabs.global') }}
          </button>
          <button class="tab-btn" [class.active]="activeTab() === 'crm'" (click)="activeTab.set('crm')">
            💼 {{ t('settings.tabs.crm') }}
          </button>
          <button class="tab-btn" [class.active]="activeTab() === 'documents'" (click)="activeTab.set('documents')">
            📄 {{ t('settings.tabs.documents') }}
          </button>
          <button class="tab-btn" [class.active]="activeTab() === 'users'" (click)="activeTab.set('users'); loadGroups()">
            👥 {{ t('settings.tabs.users') }}
          </button>
          <button class="tab-btn" [class.active]="activeTab() === 'onboarding'" (click)="activeTab.set('onboarding')">
            🚀 {{ t('settings.tabs.onboarding') }}
          </button>
          <button class="tab-btn" [class.active]="activeTab() === 'tooltips'" (click)="activeTab.set('tooltips')">
            💬 {{ t('settings.tabs.tooltips') }}
          </button>
          <!-- Endpoint /admin/prospects/icp-config jest za requireFeature('prospects'),
               więc bez modułu Prospekty zakładka mogłaby tylko pokazać błąd —
               gate'ujemy ją tak samo jak pozycję Prospekty w sidebarze.
               Superadmin jest wyjątkiem: on konfiguruje ICP INNYCH tenantów przez
               /admin/tenants/:id/icp-* (bez requireFeature), więc flaga jego
               własnego tenanta nie może mu tego ekranu odbierać. -->
          @if (auth.hasFeature('prospects') || auth.isSuperAdmin()) {
            <button class="tab-btn" [class.active]="activeTab() === 'icp'" (click)="activeTab.set('icp'); loadIcpTenants(); loadIcpConfig()">
              🎯 {{ t('settings.tabs.icp') }}
            </button>
          }
          @if (auth.hasFeature('projects')) {
            <button class="tab-btn" [class.active]="activeTab() === 'projects'" (click)="activeTab.set('projects')">
              📋 {{ t('settings.tabs.projects') }}
            </button>
          }
        </div>

        @if (activeTab() === 'projects') {
          <wt-project-settings />
        }

        <!-- TAB: Parametry globalne -->
        @if (activeTab() === 'global') {

          <div class="card" style="padding:18px 20px;margin-bottom:24px">
            <wt-language-picker mode="tenant" />
          </div>

          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#1D4ED8;display:flex;gap:12px;align-items:flex-start">
            <span style="font-size:18px;flex-shrink:0">ℹ️</span>
            <div>
              <strong>{{ t('settings.tabs.global') }}</strong> {{ t('settings.global.intro') }}
            </div>
          </div>

          @for (cat of globalCategories(); track cat.key) {
            <div class="card" style="margin-bottom:20px;overflow:hidden">
              <div class="cat-header">
                <span style="font-size:18px">{{ cat.icon }}</span>
                <span class="cat-title">{{ cat.label }}</span>
              </div>
              @for (field of cat.fields; track field.key; let last = $last) {
                <div [style.border-bottom]="last ? 'none' : '1px solid var(--gray-100)'"
                     style="padding:16px 20px;display:grid;grid-template-columns:1fr 220px;gap:20px;align-items:start">
                  <div>
                    <div class="field-label">{{ field.label }}</div>
                    <div class="field-desc">{{ field.description }}</div>
                    @if (field.updated_by_name) {
                      <div class="field-meta">{{ t('settings.fields.changedBy') }} <strong>{{ field.updated_by_name }}</strong> · {{ field.updated_at | date:'dd.MM.yyyy HH:mm' }}</div>
                    }
                  </div>
                  <div style="display:flex;flex-direction:column;gap:4px">
                    @if (field.value_type === 'boolean') {
                      <select class="fsel" [(ngModel)]="field.draft" (ngModelChange)="onFieldChange(field)">
                        <option value="true">{{ t('settings.fields.enabled') }}</option>
                        <option value="false">{{ t('settings.fields.disabled') }}</option>
                      </select>
                    } @else if (field.value_type === 'number') {
                      <input class="fi" type="number" min="0"
                             [(ngModel)]="field.draft"
                             (ngModelChange)="onFieldChange(field)"
                             [class.fi-err]="!!field.error"
                             style="width:100%;box-sizing:border-box;text-align:right;padding-right:12px">
                    } @else {
                      <input class="fi" type="text"
                             [(ngModel)]="field.draft"
                             (ngModelChange)="onFieldChange(field)"
                             [class.fi-err]="!!field.error">
                    }
                    @if (field.error) { <span class="field-err">{{ field.error }}</span> }
                    @if (field.dirty && !field.error) { <span class="field-dirty">● {{ t('settings.fields.changed') }}</span> }
                  </div>
                </div>
              }
            </div>
          }

          <!-- Preview -->
          <div class="card" style="padding:20px;margin-bottom:20px">
            <div class="cat-title" style="margin-bottom:14px">🔍 {{ t('settings.global.preview.title') }}</div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:16px;height:16px;background:var(--gray-800);border-radius:3px"></div>
                <span>{{ t('settings.global.preview.moreThan') }} <strong>{{ previewRedDays() }}</strong> {{ t('settings.global.preview.noWarning') }}</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:16px;height:16px;background:#DC2626;border-radius:3px"></div>
                <span>≤ <strong>{{ previewRedDays() }}</strong> {{ t('settings.global.preview.urgent') }}</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:16px;height:16px;background:#F59E0B;border-radius:3px"></div>
                <span>≤ <strong>{{ previewSoonDays() }}</strong> {{ t('settings.global.preview.expiringSoon') }}</span>
              </div>
            </div>
          </div>
        }

        <!-- TAB: Parametry biznesowe CRM -->
        @if (activeTab() === 'crm') {

          <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#9A3412;display:flex;gap:12px;align-items:flex-start">
            <span style="font-size:18px;flex-shrink:0">💼</span>
            <div>
              <strong>{{ t('settings.tabs.crm') }}</strong> {{ t('settings.crm.intro') }}
            </div>
          </div>

          @for (field of crmFields(); track field.key) {
            <div class="card" style="margin-bottom:16px;overflow:hidden">
              <div class="cat-header" style="padding:12px 20px">
                <span class="cat-title" style="font-size:13px">{{ field.label }}</span>
                @if (field.dirty) { <span class="field-dirty" style="margin-left:auto">● {{ t('settings.fields.changed') }}</span> }
              </div>
              <div style="padding:14px 20px">
                <div class="field-desc" style="margin-bottom:12px">{{ field.description }}</div>

                @if (field.value_type === 'json') {
                  <!-- Edytor listy JSON -->
                  <div class="json-list">
                    @for (item of displayItems(field); track item; let idx = $index) {
                      <div class="json-item">
                        <span class="json-item-val">{{ jsonItemLabel(field.key, item) }}</span>
                        <span class="json-item-raw">{{ item }}</span>
                        <button class="json-del" (click)="removeJsonItem(field, jsonItems(field).indexOf(item))" [title]="t('settings.actions.delete')">✕</button>
                      </div>
                    }
                    @if (jsonItems(field).length === 0) {
                      <div style="color:var(--gray-400);font-size:12px;padding:6px 0">{{ t('settings.fields.emptyList') }}</div>
                    }
                  </div>
                  <div class="json-add-row">
                    <input class="fi" style="flex:1"
                           [placeholder]="field.key === 'crm_lost_reasons' ? t('settings.fields.newValueExample') : t('settings.fields.newValueCode')"
                           [(ngModel)]="jsonNewItem[field.key]"
                           (keydown.enter)="addJsonItem(field)">
                    <button class="btn btn-p" style="padding:6px 14px;font-size:12px"
                            (click)="addJsonItem(field)">+ {{ t('settings.actions.add') }}</button>
                  </div>
                  @if (field.error) { <div class="field-err" style="margin-top:4px">{{ field.error }}</div> }

                } @else if (field.value_type === 'number') {
                  <input class="fi" type="number" min="0" style="width:200px"
                         [(ngModel)]="field.draft"
                         (ngModelChange)="onFieldChange(field)"
                         [class.fi-err]="!!field.error">
                  @if (field.error) { <div class="field-err" style="margin-top:4px">{{ field.error }}</div> }
                } @else {
                  <input class="fi" type="text" style="width:100%;box-sizing:border-box"
                         [(ngModel)]="field.draft"
                         (ngModelChange)="onFieldChange(field)"
                         [class.fi-err]="!!field.error">
                  @if (field.error) { <div class="field-err" style="margin-top:4px">{{ field.error }}</div> }
                }

                @if (field.updated_by_name) {
                  <div class="field-meta" style="margin-top:10px">
                    {{ t('settings.fields.changedBy') }} <strong>{{ field.updated_by_name }}</strong> · {{ field.updated_at | date:'dd.MM.yyyy HH:mm' }}
                  </div>
                }
              </div>
            </div>
          }

          <!-- Algorytm Churn -->
          @if (churnFields().length > 0) {
            <div class="card" style="margin-bottom:16px;overflow:hidden">
              <div class="cat-header" style="padding:12px 20px">
                <span class="cat-title" style="font-size:13px">📉 {{ t('settings.crm.scoring.churnTitle') }}</span>
                @if (churnFields().some(f => f.dirty)) {
                  <span class="field-dirty" style="margin-left:auto">● {{ t('settings.fields.changed') }}</span>
                }
              </div>
              <table style="width:100%;border-collapse:collapse;font-size:12.5px">
                <thead>
                  <tr style="background:var(--gray-50)">
                    <th style="padding:8px 20px;text-align:left;font-weight:600;color:var(--gray-600);border-bottom:1px solid var(--gray-200)">{{ t('settings.crm.scoring.parameter') }}</th>
                    <th style="padding:8px 12px;text-align:left;font-weight:600;color:var(--gray-600);border-bottom:1px solid var(--gray-200)">{{ t('settings.crm.scoring.description') }}</th>
                    <th style="padding:8px 16px;text-align:right;font-weight:600;color:var(--gray-600);border-bottom:1px solid var(--gray-200);width:110px">{{ t('settings.crm.scoring.value') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="background:#fafafa">
                    <td colspan="3" style="padding:5px 20px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-400);letter-spacing:.5px">{{ t('settings.crm.scoring.noOrdersDays') }}</td>
                  </tr>
                  @for (f of churnDayFields(); track f.key) {
                    <tr style="border-top:1px solid var(--gray-100)">
                      <td style="padding:9px 20px;color:var(--gray-700)">{{ f.label }}</td>
                      <td style="padding:9px 12px;color:var(--gray-400);font-size:12px">{{ f.description }}</td>
                      <td style="padding:9px 16px;text-align:right">
                        <input class="fi" type="number" min="0" style="width:76px;text-align:right;padding:5px 8px;font-size:12.5px"
                               [(ngModel)]="f.draft" (ngModelChange)="onFieldChange(f)" [class.fi-err]="!!f.error">
                      </td>
                    </tr>
                  }
                  <tr style="background:#fafafa">
                    <td colspan="3" style="padding:5px 20px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-400);letter-spacing:.5px">{{ t('settings.crm.scoring.salesDrop') }}</td>
                  </tr>
                  @for (f of churnSalesFields(); track f.key) {
                    <tr style="border-top:1px solid var(--gray-100)">
                      <td style="padding:9px 20px;color:var(--gray-700)">{{ f.label }}</td>
                      <td style="padding:9px 12px;color:var(--gray-400);font-size:12px">{{ f.description }}</td>
                      <td style="padding:9px 16px;text-align:right">
                        <input class="fi" type="number" min="0" style="width:76px;text-align:right;padding:5px 8px;font-size:12.5px"
                               [(ngModel)]="f.draft" (ngModelChange)="onFieldChange(f)" [class.fi-err]="!!f.error">
                      </td>
                    </tr>
                  }
                  <tr style="background:#fafafa">
                    <td colspan="3" style="padding:5px 20px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-400);letter-spacing:.5px">{{ t('settings.crm.scoring.riskThresholds') }}</td>
                  </tr>
                  @for (f of churnRiskFields(); track f.key) {
                    <tr style="border-top:1px solid var(--gray-100)">
                      <td style="padding:9px 20px;color:var(--gray-700)">{{ f.label }}</td>
                      <td style="padding:9px 12px;color:var(--gray-400);font-size:12px">{{ f.description }}</td>
                      <td style="padding:9px 16px;text-align:right">
                        <input class="fi" type="number" min="0" style="width:76px;text-align:right;padding:5px 8px;font-size:12.5px"
                               [(ngModel)]="f.draft" (ngModelChange)="onFieldChange(f)" [class.fi-err]="!!f.error">
                      </td>
                    </tr>
                  }
                  @if (churnTimeField()) {
                    <tr style="background:#fafafa">
                      <td colspan="3" style="padding:5px 20px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-400);letter-spacing:.5px">{{ t('settings.crm.scoring.schedule') }}</td>
                    </tr>
                    <tr style="border-top:1px solid var(--gray-100)">
                      <td style="padding:9px 20px;color:var(--gray-700)">{{ churnTimeField()!.label }}</td>
                      <td style="padding:9px 12px;color:var(--gray-400);font-size:12px">{{ churnTimeField()!.description }}</td>
                      <td style="padding:9px 16px;text-align:right">
                        <input class="fi" type="text" placeholder="HH:MM"
                               style="width:76px;text-align:center;padding:5px 8px;font-size:12.5px"
                               [(ngModel)]="churnTimeField()!.draft"
                               (ngModelChange)="onFieldChange(churnTimeField()!)"
                               [class.fi-err]="!!churnTimeField()!.error">
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          <!-- Algorytm Health Score -->
          @if (healthFields().length > 0) {
            <div class="card" style="margin-bottom:16px;overflow:hidden">
              <div class="cat-header" style="padding:12px 20px">
                <span class="cat-title" style="font-size:13px">💚 {{ t('settings.crm.scoring.healthTitle') }}</span>
                @if (healthFields().some(f => f.dirty)) {
                  <span class="field-dirty" style="margin-left:auto">● {{ t('settings.fields.changed') }}</span>
                }
              </div>
              <table style="width:100%;border-collapse:collapse;font-size:12.5px">
                <thead>
                  <tr style="background:var(--gray-50)">
                    <th style="padding:8px 20px;text-align:left;font-weight:600;color:var(--gray-600);border-bottom:1px solid var(--gray-200)">{{ t('settings.crm.scoring.parameter') }}</th>
                    <th style="padding:8px 12px;text-align:left;font-weight:600;color:var(--gray-600);border-bottom:1px solid var(--gray-200)">{{ t('settings.crm.scoring.description') }}</th>
                    <th style="padding:8px 16px;text-align:right;font-weight:600;color:var(--gray-600);border-bottom:1px solid var(--gray-200);width:110px">{{ t('settings.crm.scoring.value') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="background:#fafafa">
                    <td colspan="3" style="padding:5px 20px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-400);letter-spacing:.5px">{{ t('settings.crm.scoring.activityLast20Days') }}</td>
                  </tr>
                  @for (f of healthActFields(); track f.key) {
                    <tr style="border-top:1px solid var(--gray-100)">
                      <td style="padding:9px 20px;color:var(--gray-700)">{{ f.label }}</td>
                      <td style="padding:9px 12px;color:var(--gray-400);font-size:12px">{{ f.description }}</td>
                      <td style="padding:9px 16px;text-align:right">
                        <input class="fi" type="number" min="0" style="width:76px;text-align:right;padding:5px 8px;font-size:12.5px"
                               [(ngModel)]="f.draft" (ngModelChange)="onFieldChange(f)" [class.fi-err]="!!f.error">
                      </td>
                    </tr>
                  }
                  <tr style="background:#fafafa">
                    <td colspan="3" style="padding:5px 20px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-400);letter-spacing:.5px">{{ t('settings.crm.scoring.revenueGrowth') }}</td>
                  </tr>
                  @for (f of healthRevFields(); track f.key) {
                    <tr style="border-top:1px solid var(--gray-100)">
                      <td style="padding:9px 20px;color:var(--gray-700)">{{ f.label }}</td>
                      <td style="padding:9px 12px;color:var(--gray-400);font-size:12px">{{ f.description }}</td>
                      <td style="padding:9px 16px;text-align:right">
                        <input class="fi" type="number" min="0" style="width:76px;text-align:right;padding:5px 8px;font-size:12.5px"
                               [(ngModel)]="f.draft" (ngModelChange)="onFieldChange(f)" [class.fi-err]="!!f.error">
                      </td>
                    </tr>
                  }
                  <tr style="background:#fafafa">
                    <td colspan="3" style="padding:5px 20px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-400);letter-spacing:.5px">{{ t('settings.crm.scoring.healthLevelThresholds') }}</td>
                  </tr>
                  @for (f of healthLevelFields(); track f.key) {
                    <tr style="border-top:1px solid var(--gray-100)">
                      <td style="padding:9px 20px;color:var(--gray-700)">{{ f.label }}</td>
                      <td style="padding:9px 12px;color:var(--gray-400);font-size:12px">{{ f.description }}</td>
                      <td style="padding:9px 16px;text-align:right">
                        <input class="fi" type="number" min="0" style="width:76px;text-align:right;padding:5px 8px;font-size:12.5px"
                               [(ngModel)]="f.draft" (ngModelChange)="onFieldChange(f)" [class.fi-err]="!!f.error">
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }

        <!-- TAB: Słowniki dokumentów -->
        @if (activeTab() === 'documents') {

          <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#166534;display:flex;gap:12px;align-items:flex-start">
            <span style="font-size:18px;flex-shrink:0">📄</span>
            <div>
              <strong>{{ t('settings.tabs.documents') }}</strong> {{ t('settings.documents.intro') }}
            </div>
          </div>

          @for (field of docFields(); track field.key) {
            <div class="card" style="margin-bottom:16px;overflow:hidden">
              <div class="cat-header" style="padding:12px 20px">
                <span class="cat-title" style="font-size:13px">{{ field.label }}</span>
                @if (field.dirty) { <span class="field-dirty" style="margin-left:auto">● {{ t('settings.fields.changed') }}</span> }
              </div>
              <div style="padding:14px 20px">
                <div class="field-desc" style="margin-bottom:12px">{{ field.description }}</div>

                @if (field.value_type === 'json') {
                  <div class="json-list">
                    @for (item of displayItems(field); track item; let idx = $index) {
                      <div class="json-item">
                        <span class="json-item-val">{{ jsonItemLabel(field.key, item) }}</span>
                        <span class="json-item-raw">{{ item }}</span>
                        <button class="json-del" (click)="removeJsonItem(field, jsonItems(field).indexOf(item))" [title]="t('settings.actions.delete')">✕</button>
                      </div>
                    }
                    @if (jsonItems(field).length === 0) {
                      <div style="color:var(--gray-400);font-size:12px;padding:6px 0">{{ t('settings.fields.emptyList') }}</div>
                    }
                  </div>
                  <div class="json-add-row">
                    <input class="fi" style="flex:1" type="text" [placeholder]="t('settings.fields.newValueTechnicalKey')"
                           [(ngModel)]="jsonNewItem[field.key]"
                           (keydown.enter)="addJsonItem(field)">
                    <button class="btn btn-p btn-sm" (click)="addJsonItem(field)">+ {{ t('settings.actions.add') }}</button>
                  </div>
                  @if (field.error) { <span class="field-err">{{ field.error }}</span> }
                }

                @if (field.updated_by_name) {
                  <div class="field-meta" style="margin-top:10px">
                    {{ t('settings.fields.changedBy') }} <strong>{{ field.updated_by_name }}</strong> · {{ field.updated_at | date:'dd.MM.yyyy HH:mm' }}
                  </div>
                }
              </div>
            </div>
          }

          @if (docFields().length === 0) {
            <div style="text-align:center;color:var(--gray-400);padding:40px;font-size:13px">
              {{ t('settings.documents.empty') }}
            </div>
          }
        }

        <!-- TAB: Grupy użytkowników -->
        @if (activeTab() === 'users') {

          <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#0369A1;display:flex;gap:12px;align-items:flex-start">
            <span style="font-size:18px;flex-shrink:0">👥</span>
            <div>
              <strong>{{ t('settings.tabs.users') }}</strong> {{ t('settings.groups.intro') }}
            </div>
          </div>

          <!-- Formularz dodawania grupy -->
          <div class="card" style="margin-bottom:20px;padding:20px">
            <div class="cat-title" style="margin-bottom:14px">➕ {{ t('settings.groups.addTitle') }}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
              <div>
                <label class="field-label">{{ t('settings.groups.technicalName') }} <span style="color:#ef4444">*</span></label>
                <div class="field-desc">{{ t('settings.groups.technicalNameHint') }}</div>
                <input class="fi" style="width:100%;box-sizing:border-box;margin-top:4px"
                       [placeholder]="t('settings.groups.technicalNamePlaceholder')"
                       [(ngModel)]="newGroup.name">
              </div>
              <div>
                <label class="field-label">{{ t('settings.groups.displayName') }} <span style="color:#ef4444">*</span></label>
                <div class="field-desc">{{ t('settings.groups.displayNameHint') }}</div>
                <input class="fi" style="width:100%;box-sizing:border-box;margin-top:4px"
                       [placeholder]="t('settings.groups.displayNamePlaceholder')"
                       [(ngModel)]="newGroup.display_name">
              </div>
              <div>
                <label class="field-label">{{ t('settings.groups.description') }}</label>
                <input class="fi" style="width:100%;box-sizing:border-box;margin-top:4px"
                       [placeholder]="t('settings.groups.descriptionPlaceholder')"
                       [(ngModel)]="newGroup.description">
              </div>
              <div style="display:flex;flex-direction:column;justify-content:flex-end">
                <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin-bottom:12px">
                  <input type="checkbox" [(ngModel)]="newGroup.has_owner_restriction">
                  {{ t('settings.groups.ownerRestrictionOption') }}
                </label>
              </div>
            </div>
            @if (groupError()) {
              <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:10px 14px;font-size:12.5px;color:#DC2626;margin-bottom:12px">
                ⚠️ {{ groupError() }}
              </div>
            }
            <button class="btn btn-p"
                    [disabled]="!newGroup.name.trim() || !newGroup.display_name.trim() || groupSaving()"
                    (click)="addGroup()">
              @if (groupSaving()) { {{ t('settings.groups.adding') }} } @else { ➕ {{ t('settings.groups.addGroup') }} }
            </button>
          </div>

          <!-- Lista istniejących grup -->
          @if (groupsLoading()) {
            <div style="text-align:center;padding:40px"><div class="spinner"></div></div>
          } @else if (groups().length === 0) {
            <div style="text-align:center;color:var(--gray-400);padding:40px;font-size:13px">
              {{ t('settings.groups.empty') }}
            </div>
          } @else {
            @for (g of groups(); track g.id) {
              <div class="card" style="margin-bottom:12px;overflow:hidden">
                <div style="padding:14px 20px;display:flex;align-items:center;gap:12px">
                  <div style="width:36px;height:36px;background:#EFF6FF;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">👥</div>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:13.5px;font-weight:700;color:var(--gray-900)">{{ g.display_name }}</div>
                    <div style="font-size:11.5px;color:var(--gray-400);margin-top:1px">
                      <span style="font-family:monospace;background:var(--gray-100);padding:1px 6px;border-radius:4px">{{ g.name }}</span>
                      <span style="margin:0 6px">·</span>
                      <span>{{ t('settings.groups.memberCount', { count: g.member_count }) }}</span>
                      <span style="margin:0 6px">·</span>
                      <span>{{ t('settings.groups.documentCount', { count: g.document_count }) }}</span>
                      @if (g.has_owner_restriction) {
                        <span style="margin-left:8px;background:#FEF3C7;color:#92400E;padding:1px 8px;border-radius:10px;font-size:10px;font-weight:700">{{ t('settings.groups.ownerRestriction') }}</span>
                      }
                      @if (!g.is_active) {
                        <span style="margin-left:8px;background:#F3F4F6;color:#6B7280;padding:1px 8px;border-radius:10px;font-size:10px;font-weight:700">{{ t('settings.groups.inactive') }}</span>
                      }
                    </div>
                    @if (g.description) {
                      <div style="font-size:12px;color:var(--gray-500);margin-top:3px">{{ g.description }}</div>
                    }
                  </div>
                  <button class="btn btn-d btn-sm"
                          [disabled]="g.member_count > 0 || g.document_count > 0"
                          [title]="g.member_count > 0 || g.document_count > 0 ? t('settings.groups.cannotDelete') : t('settings.groups.deleteGroup')"
                          (click)="deleteGroup(g)">
                    🗑 {{ t('settings.actions.delete') }}
                  </button>
                </div>
              </div>
            }
          }
        }

        <!-- TAB: Szablony zadań onboardingowych -->
        @if (activeTab() === 'onboarding') {

          <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#9A3412;display:flex;gap:12px;align-items:flex-start">
            <span style="font-size:18px;flex-shrink:0">🚀</span>
            <div>
              <strong>{{ t('settings.onboarding.introTitle') }}</strong> {{ t('settings.onboarding.intro') }}
              {{ t('settings.onboarding.jsonFormat') }} <code style="background:#fff;padding:1px 6px;border-radius:4px;font-size:11px">[ {{ '{' }}"id":"...", "title":"...", "type":"task|call|...", "step":0{{ '}' }} ]</code>
              {{ t('settings.onboarding.stepsLegend') }}
            </div>
          </div>

          @for (field of crmDictFields(); track field.key) {
            <div class="card" style="margin-bottom:16px;overflow:hidden">
              <div class="cat-header" style="padding:12px 20px;display:flex;align-items:center">
                <span class="cat-title" style="font-size:13px">{{ field.label }}</span>
                @if (field.dirty) { <span class="field-dirty" style="margin-left:8px">● {{ t('settings.fields.changed') }}</span> }
                @if (field.updated_by_name) {
                  <span class="field-meta" style="margin-left:auto;font-size:11px;color:var(--gray-400)">
                    {{ t('settings.fields.changedBy') }} {{ field.updated_by_name }} · {{ field.updated_at | date:'dd.MM.yyyy' }}
                  </span>
                }
              </div>
              <div style="padding:14px 20px">
                <div class="field-desc" style="margin-bottom:12px">{{ field.description }}</div>

                <!-- Edytor tabeli szablonów -->
                @if (field.key === 'crm_lead_sources') {
                  <div style="overflow-x:auto">
                    <table style="width:100%;border-collapse:collapse;font-size:12px">
                      <thead>
                        <tr style="background:var(--gray-50);border-bottom:2px solid var(--gray-200)">
                          <th style="padding:8px 10px;text-align:left;font-weight:600">{{ t('settings.onboarding.leadSources.value') }}</th>
                          <th style="padding:8px 10px;text-align:left;font-weight:600">{{ t('settings.onboarding.leadSources.label') }}</th>
                          <th style="padding:8px 10px;text-align:left;font-weight:600;width:160px"
                              [title]="t('settings.onboarding.leadSources.groupHint')">{{ t('settings.onboarding.leadSources.group') }}</th>
                          <th style="padding:8px 10px;width:40px"></th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (src of getTemplates(field); track src.value; let idx = $index) {
                          <tr style="border-bottom:1px solid var(--gray-100)"
                              [style.background]="src.group ? '#eff6ff' : 'white'">
                            <td style="padding:6px 10px">
                              <input style="width:100%;border:1px solid var(--gray-200);border-radius:4px;padding:4px 8px;font-size:12px;box-sizing:border-box;font-family:monospace"
                                     [ngModel]="src.value"
                                     (ngModelChange)="updateTemplate(field, idx, 'value', $event)">
                            </td>
                            <td style="padding:6px 10px">
                              <input style="width:100%;border:1px solid var(--gray-200);border-radius:4px;padding:4px 8px;font-size:12px;box-sizing:border-box"
                                     [ngModel]="src.label"
                                     (ngModelChange)="updateTemplate(field, idx, 'label', $event)">
                            </td>
                            <td style="padding:6px 10px">
                              <input style="width:100%;border:1px solid var(--gray-200);border-radius:4px;padding:4px 8px;font-size:12px;box-sizing:border-box"
                                     [ngModel]="src.group || ''"
                                     (ngModelChange)="updateTemplate(field, idx, 'group', $event || null)"
                                     [placeholder]="t('settings.onboarding.leadSources.noGroup')">
                            </td>
                            <td style="padding:6px 10px;text-align:center">
                              <button style="background:#fee2e2;border:none;border-radius:4px;padding:3px 7px;cursor:pointer;color:#991b1b;font-size:12px"
                                      (click)="removeTemplate(field, idx)">✕</button>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <div style="margin-top:8px;font-size:11px;color:var(--gray-400)">
                    🔵 {{ t('settings.onboarding.leadSources.legend') }}
                  </div>
                  <button class="btn btn-g btn-sm" style="margin-top:8px"
                          (click)="addLeadSource(field)">+ {{ t('settings.onboarding.leadSources.add') }}</button>
                }

                @if (field.key === 'onboarding_task_templates') {
                  <div style="overflow-x:auto">
                    <table style="width:100%;border-collapse:collapse;font-size:12px">
                      <thead>
                        <tr style="background:var(--gray-50);border-bottom:2px solid var(--gray-200)">
                          <th style="padding:8px 10px;text-align:left;font-weight:600">{{ t('settings.onboarding.templates.title') }}</th>
                          <th style="padding:8px 10px;text-align:left;font-weight:600;width:110px">{{ t('settings.onboarding.templates.type') }}</th>
                          <th style="padding:8px 10px;text-align:left;font-weight:600;width:140px">{{ t('settings.onboarding.templates.step') }}</th>
                          <th style="padding:8px 10px;text-align:center;font-weight:600;width:80px"
                              [title]="t('settings.onboarding.templates.standardHint')">{{ t('settings.onboarding.templates.standard') }}</th>
                          <th style="padding:8px 10px;text-align:left;font-weight:600;width:160px"
                              [title]="t('settings.onboarding.templates.assigneeHint')">{{ t('settings.onboarding.templates.assignee') }}</th>
                          <th style="padding:8px 10px;text-align:center;font-weight:600;width:70px"
                              [title]="t('settings.onboarding.templates.daysHint')">{{ t('settings.onboarding.templates.days') }}</th>
                          <th style="padding:8px 10px;width:40px"></th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (tpl of getTemplates(field); track tpl.id; let idx = $index) {
                          <tr style="border-bottom:1px solid var(--gray-100)" [style.background]="tpl.standard ? '#f0fdf4' : 'white'">
                            <td style="padding:6px 10px">
                              <input style="width:100%;border:1px solid var(--gray-200);border-radius:4px;padding:4px 8px;font-size:12px;box-sizing:border-box"
                                     [ngModel]="tpl.title"
                                     (ngModelChange)="updateTemplate(field, idx, 'title', $event)">
                            </td>
                            <td style="padding:6px 10px">
                              <select style="width:100%;border:1px solid var(--gray-200);border-radius:4px;padding:4px 6px;font-size:12px"
                                      [ngModel]="tpl.type"
                                      (ngModelChange)="updateTemplate(field, idx, 'type', $event)">
                                <option value="task">✅ {{ t('settings.onboarding.taskTypes.task') }}</option>
                                <option value="call">📞 {{ t('settings.onboarding.taskTypes.call') }}</option>
                                <option value="email">📧 {{ t('settings.onboarding.taskTypes.email') }}</option>
                                <option value="meeting">🤝 {{ t('settings.onboarding.taskTypes.meeting') }}</option>
                                <option value="doc_sent">📄 {{ t('settings.onboarding.taskTypes.doc_sent') }}</option>
                                <option value="training">🎓 {{ t('settings.onboarding.taskTypes.training') }}</option>
                              </select>
                            </td>
                            <td style="padding:6px 10px">
                              <select style="width:100%;border:1px solid var(--gray-200);border-radius:4px;padding:4px 6px;font-size:12px"
                                      [ngModel]="tpl.step"
                                      (ngModelChange)="updateTemplate(field, idx, 'step', +$event)">
                                <option [value]="0">📝 {{ t('settings.onboarding.steps.contractSigning') }}</option>
                                <option [value]="1">⚙️ {{ t('settings.onboarding.steps.configuration') }}</option>
                                <option [value]="2">🎓 {{ t('settings.onboarding.steps.training') }}</option>
                                <option [value]="3">🚀 {{ t('settings.onboarding.steps.launch') }}</option>
                              </select>
                            </td>
                            <td style="padding:6px 10px;text-align:center">
                              <input type="checkbox"
                                     [ngModel]="tpl.standard"
                                     (ngModelChange)="updateTemplate(field, idx, 'standard', $event)"
                                     [title]="t('settings.onboarding.templates.standardCheckboxHint')">
                            </td>
                            <td style="padding:6px 10px">
                              @if (tpl.step === 0) {
                                <span style="font-size:11px;color:var(--orange);font-style:italic">← {{ t('settings.onboarding.templates.leadOwner') }}</span>
                              } @else {
                                <select style="width:100%;border:1px solid var(--gray-200);border-radius:4px;padding:4px 6px;font-size:12px"
                                        [ngModel]="tpl.assignee"
                                        (ngModelChange)="updateTemplate(field, idx, 'assignee', $event || null)">
                                  <option [ngValue]="null">{{ t('settings.onboarding.templates.noAssignee') }}</option>
                                  @for (u of allUsers(); track u.id) {
                                    <option [value]="u.id">{{ u.display_name }}</option>
                                  }
                                </select>
                              }
                            </td>
                            <td style="padding:6px 10px;text-align:center">
                              <input type="number" min="0" max="365"
                                     style="width:54px;border:1px solid var(--gray-200);border-radius:4px;padding:3px 6px;font-size:12px;text-align:center"
                                     [ngModel]="tpl.days"
                                     (ngModelChange)="updateTemplate(field, idx, 'days', $event === '' || $event === null ? null : +$event)"
                                     placeholder="—">
                            </td>
                            <td style="padding:6px 10px;text-align:center">
                              <button style="background:#fee2e2;border:none;border-radius:4px;padding:3px 7px;cursor:pointer;color:#991b1b;font-size:12px"
                                      (click)="removeTemplate(field, idx)">✕</button>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <div style="margin-top:8px;font-size:11px;color:var(--gray-400)">
                    🟢 {{ t('settings.onboarding.templates.legend') }}
                  </div>
                  <button class="btn btn-g btn-sm" style="margin-top:8px"
                          (click)="addTemplate(field)">+ {{ t('settings.onboarding.templates.add') }}</button>
                }

                @if (field.error) { <div class="field-err" style="margin-top:8px">{{ field.error }}</div> }
              </div>
            </div>
          }

          @if (crmDictFields().length === 0) {
            <div style="text-align:center;color:var(--gray-400);padding:40px;font-size:13px">
              {{ t('settings.onboarding.templates.empty') }}
            </div>
          }
        }

        <!-- TAB: Podpowiedzi (Tooltips) -->
        @if (activeTab() === 'tooltips') {

          <div style="background:#EDE9FE;border:1px solid #C4B5FD;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#5B21B6;display:flex;gap:12px;align-items:flex-start">
            <span style="font-size:18px;flex-shrink:0">💬</span>
            <div>
              <strong>{{ t('settings.tooltips.introTitle') }}</strong> {{ t('settings.tooltips.introBeforeIcon') }}
              <strong style="font-family:sans-serif;background:#e5e7eb;border-radius:50%;width:15px;height:15px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:800">?</strong>
              {{ t('settings.tooltips.introAfterIcon') }}
            </div>
          </div>

          <!-- Formularz dodawania nowego -->
          <div class="card" style="padding:20px;margin-bottom:24px">
            <div class="cat-title" style="margin-bottom:16px">+ {{ t('settings.tooltips.add') }}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
              <div>
                <label class="field-label" style="display:block;margin-bottom:4px">{{ t('settings.tooltips.screen') }} <span style="color:#ef4444">*</span></label>
                <select class="fsel" [(ngModel)]="newTipScreen" (ngModelChange)="onNewTipScreenChange()">
                  <option value="">{{ t('settings.tooltips.chooseScreen') }}</option>
                  @for (s of catalogScreens; track s) {
                    <option [value]="s">{{ t('settings.tooltips.screens.' + s) }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="field-label" style="display:block;margin-bottom:4px">{{ t('settings.tooltips.label') }} <span style="color:#ef4444">*</span></label>
                <select class="fsel" [(ngModel)]="newTipLabelKey" [disabled]="!newTipScreen">
                  <option value="">{{ t('settings.tooltips.chooseLabel') }}</option>
                  @for (e of catalogForScreen; track e.key) {
                    <option [value]="e.key" [disabled]="isAlreadyDefined(e.key)">
                      {{ t('settings.tooltips.catalog.' + e.labelKey) }}{{ isAlreadyDefined(e.key) ? ' ✓' : '' }}
                    </option>
                  }
                </select>
              </div>
            </div>
            <div style="margin-bottom:12px">
              <label class="field-label" style="display:block;margin-bottom:4px">{{ t('settings.tooltips.content') }} <span style="color:#ef4444">*</span></label>
              <textarea class="fi" style="width:100%;box-sizing:border-box;resize:vertical;min-height:72px"
                        [(ngModel)]="newTipValue"
                        [placeholder]="t('settings.tooltips.contentPlaceholder')"></textarea>
            </div>
            @if (tipError()) {
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px 12px;font-size:12px;color:#dc2626;margin-bottom:10px">⚠ {{ tipError() }}</div>
            }
            <button class="btn btn-p" style="padding:8px 20px"
                    [disabled]="tipSaving() || !newTipLabelKey || !newTipValue.trim()"
                    (click)="addTooltip()">
              {{ tipSaving() ? t('settings.actions.saving') : '+ ' + t('settings.tooltips.add') }}
            </button>
          </div>

          <!-- Lista istniejących, pogrupowana po ekranach -->
          @if (tooltipFields().length === 0) {
            <div style="text-align:center;color:var(--gray-400);padding:40px;font-size:13px">
              {{ t('settings.tooltips.empty') }}
            </div>
          }

          @for (screen of catalogScreens; track screen) {
            @if (tooltipFieldsForScreen(screen).length > 0) {
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--gray-400);margin:20px 0 8px;padding-left:2px">
                {{ t('settings.tooltips.screens.' + screen) }}
              </div>
              @for (tip of tooltipFieldsForScreen(screen); track tip.key) {
                <div class="card" style="margin-bottom:10px;overflow:hidden">
                  <div class="cat-header" style="padding:10px 18px;display:flex;align-items:center;gap:10px">
                    <span class="cat-title" style="font-size:13px;font-weight:600">{{ t('settings.tooltips.catalog.' + catalogEntry(tip.key)?.labelKey) }}</span>
                    <code style="font-size:10px;font-family:monospace;color:#a78bfa;background:#f3f0ff;padding:1px 6px;border-radius:4px">{{ tip.key }}</code>
                    <span style="flex:1"></span>
                    @if (tip.updated_by_name) {
                      <span class="field-meta">{{ tip.updated_by_name }} · {{ tip.updated_at | date:'dd.MM.yy HH:mm' }}</span>
                    }
                    <button style="background:#fee2e2;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;color:#991b1b;font-size:12px;flex-shrink:0"
                            (click)="deleteTooltip(tip.key)">🗑 {{ t('settings.actions.delete') }}</button>
                  </div>
                  <div style="padding:14px 18px;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end">
                    <textarea class="fi" style="width:100%;box-sizing:border-box;resize:vertical;min-height:60px;font-size:13px"
                              [(ngModel)]="tipDrafts[tip.key]"
                              (ngModelChange)="tipDirty[tip.key] = true"></textarea>
                    <button class="btn btn-p" style="padding:7px 16px;font-size:12px;white-space:nowrap"
                            [disabled]="!tipDirty[tip.key] || tipSaving()"
                            (click)="saveTooltip(tip.key, tipDrafts[tip.key])">
                      💾 {{ 'actions.save' | transloco }}
                    </button>
                  </div>
                </div>
              }
            }
          }

          <!-- Klucze spoza katalogu (legacy / ręcznie dodane wcześniej) -->
          @if (uncategorizedTooltips().length > 0) {
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--gray-400);margin:20px 0 8px;padding-left:2px">
              {{ t('settings.tooltips.other') }}
            </div>
            @for (tip of uncategorizedTooltips(); track tip.key) {
              <div class="card" style="margin-bottom:10px;overflow:hidden">
                <div class="cat-header" style="padding:10px 18px;display:flex;align-items:center;gap:10px">
                  <code style="font-size:11px;font-family:monospace;color:#7c3aed;background:#f3f0ff;padding:2px 8px;border-radius:4px">{{ tip.key }}</code>
                  <span class="cat-title" style="font-size:12px;color:var(--gray-600);font-weight:500">{{ tip.label }}</span>
                  <span style="flex:1"></span>
                  @if (tip.updated_by_name) {
                    <span class="field-meta">{{ tip.updated_by_name }} · {{ tip.updated_at | date:'dd.MM.yy HH:mm' }}</span>
                  }
                  <button style="background:#fee2e2;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;color:#991b1b;font-size:12px;flex-shrink:0"
                          (click)="deleteTooltip(tip.key)">🗑 {{ t('settings.actions.delete') }}</button>
                </div>
                <div style="padding:14px 18px;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end">
                  <textarea class="fi" style="width:100%;box-sizing:border-box;resize:vertical;min-height:60px;font-size:13px"
                            [(ngModel)]="tipDrafts[tip.key]"
                            (ngModelChange)="tipDirty[tip.key] = true"></textarea>
                  <button class="btn btn-p" style="padding:7px 16px;font-size:12px;white-space:nowrap"
                          [disabled]="!tipDirty[tip.key] || tipSaving()"
                          (click)="saveTooltip(tip.key, tipDrafts[tip.key])">
                    💾 {{ 'actions.save' | transloco }}
                  </button>
                </div>
              </div>
            }
          }
        }

        <!-- TAB: Enrichment / ICP — sygnały ICP tenanta. Admin tenanta edytuje
             WYŁĄCZNIE swojego (endpoint bierze tenant z sesji); superadmin
             dostaje dodatkowo dropdown i edytuje dowolnego, tą samą logiką
             ekranu — patrz icpApiBase(). -->
        @if (activeTab() === 'icp') {
          <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#9A3412;display:flex;gap:12px;align-items:flex-start">
            <span style="font-size:18px;flex-shrink:0">🎯</span>
            <div>
              <strong>{{ t('settings.icp.introTitle') }}</strong> {{ t('settings.icp.intro') }}
            </div>
          </div>

          @if (auth.isSuperAdmin()) {
            <!-- Nazwa tenanta jest też POZA selectem, na stałe widoczna: bez tego
                 łatwo opublikować zmianę u złego klienta, bo cały ekran wygląda
                 identycznie dla każdego tenanta. -->
            <div class="icp-tenant-bar">
              <label class="fl" style="margin:0;white-space:nowrap">{{ t('settings.icp.tenantConfig') }}</label>
              <select class="fsel" style="min-width:240px"
                      [ngModel]="icpTenantId()"
                      (ngModelChange)="switchIcpTenant($event)"
                      [disabled]="icpLoading() || icpSaving()">
                @for (tenant of icpTenants(); track tenant.id) {
                  <option [value]="tenant.id">{{ tenant.name }}{{ tenant.id === auth.user()?.tenant_id ? ' ' + t('settings.icp.ownTenantSuffix') : '' }}</option>
                }
              </select>
              <span class="icp-tenant-current">{{ t('settings.icp.editing') }} <strong>{{ icpTenantName() }}</strong></span>
            </div>
          }

          @if (icpLoading()) {
            <div class="state-msg">{{ t('settings.icp.loading') }}</div>
          } @else if (icpError(); as err) {
            <div class="icp-error">
              <div><strong>{{ t('settings.icp.loadFailedTitle') }}</strong></div>
              <div style="margin-top:4px">{{ err }}</div>
              <button class="btn-secondary" style="margin-top:12px" (click)="loadIcpConfig()">{{ t('settings.icp.retry') }}</button>
            </div>
          } @else if (icpConfig(); as cfg) {

            <div class="icp-summary">
              <span>
                {{ t('settings.icp.pointsSum') }}
                <strong [style.color]="cfg.is_valid ? null : '#dc2626'">{{ cfg.final_max_score }} / 100</strong>
              </span>
            </div>
            @if (!cfg.is_valid) {
              <div class="hint-inline" style="margin-top:6px;color:#dc2626">
                {{ t('settings.icp.draftInvalid', { score: cfg.final_max_score }) }}
              </div>
            }
            <!-- Wersja opublikowana = ta, której realnie używa enrichment; nie to
                 samo co stan roboczy na tej liście (config_revision).
                 Brak autora NIE znaczy "nie wiadomo kto" — wersje wstawiane
                 migracjami (aktualizacja wbudowanych defaultów po stronie CRM
                 Tree, np. 0288-0293) nie mają usera, bo nie stoi za nimi
                 człowiek. Każda zmiana zrobiona z UI zawsze ma autora. -->
            <div class="field-meta" style="margin-top:6px">
              @if (cfg.current_version) {
                {{ t('settings.icp.lastUpdateVersion') }} <strong>{{ cfg.current_version }}</strong>
                @if (cfg.current_version_published_at) { · {{ cfg.current_version_published_at | date:'dd.MM.yyyy HH:mm' }} }
                @if (cfg.current_version_author) {
                  · {{ cfg.current_version_author }}
                } @else {
                  · {{ t('settings.icp.systemUpdate') }}
                }
              } @else {
                {{ t('settings.icp.defaultConfig') }}
              }
            </div>

            <div class="icp-list">
              @for (row of icpRows(); track row.signal.id) {
                <div class="icp-row">
                  <div class="icp-row-main">
                    <button type="button" class="icp-toggle" [class.on]="row.active" [disabled]="icpSaving()"
                            [attr.aria-label]="row.active ? t('settings.icp.disableSignal') : t('settings.icp.enableSignal')"
                            (click)="toggleIcpSignalActive(row)"></button>
                    <div class="icp-row-text">
                      <div class="icp-row-name" [class.inactive]="!row.active">{{ row.signal.label }}</div>
                      <div class="icp-row-desc">{{ row.signal.short_description || row.signal.ai_definition }}</div>
                    </div>
                  </div>
                  <div class="icp-row-side">
                    <input type="number" min="0" class="icp-points-input" [(ngModel)]="row.points">
                    @if (isIcpRowDirty(row)) {
                      <button class="icp-save-check" [disabled]="icpSaving()" [title]="t('settings.actions.saveChanges')" (click)="saveIcpRowQuickFields(row)">✓</button>
                    }
                    <button class="btn-secondary" style="padding:4px 10px;font-size:12px" [disabled]="icpSaving()" (click)="openIcpEditModal(row.signal)">{{ t('settings.icp.edit') }}</button>
                    <button class="btn-danger-sm" style="padding:4px 10px;font-size:12px" [disabled]="icpSaving()" (click)="deleteIcpRow(row)">{{ t('settings.actions.delete') }}</button>
                  </div>
                </div>
              } @empty {
                <div class="icp-row"><span class="td-muted">{{ t('settings.icp.noSignals') }}</span></div>
              }
            </div>

            <div class="panel-footer">
              <button class="btn-primary" [disabled]="icpSaving()" (click)="openIcpEditModal(null)">+ {{ t('settings.icp.addSignal') }}</button>
            </div>
          }
        }

      </div>
    </div>

    <!-- ICP signal edit modal — the only place the full "jak rozpoznać ten
         sygnał" text is edited; the list only ever shows a truncated preview. -->
    @if (icpModalTarget() !== null) {
      <div class="modal-backdrop"
           (mousedown)="onIcpBackdropMouseDown($event)"
           (mouseup)="onIcpBackdropMouseUp($event)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>{{ icpModalTarget() === 'new' ? t('settings.icp.modal.newTitle') : t('settings.icp.modal.editTitle') }}</h2>
            <button class="btn-icon" (click)="closeIcpEditModal()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="field">
              <label>{{ t('settings.icp.modal.name') }} <span class="req">*</span></label>
              <input [(ngModel)]="icpModalDraft.label" [placeholder]="t('settings.icp.modal.namePlaceholder')">
            </div>
            <div class="field">
              <label>{{ t('settings.icp.modal.definition') }} <span class="req">*</span></label>
              <textarea [(ngModel)]="icpModalDraft.ai_definition" rows="8"
                [placeholder]="t('settings.icp.modal.definitionPlaceholder')"></textarea>
              <div class="hint">{{ t('settings.icp.modal.definitionHint') }}</div>
            </div>
            <div class="field">
              <label>{{ t('settings.icp.modal.shortDescription') }}</label>
              <textarea [(ngModel)]="icpModalDraft.short_description" rows="2" maxlength="500"
                [placeholder]="t('settings.icp.modal.shortDescriptionPlaceholder')"></textarea>
              <div class="hint">{{ t('settings.icp.modal.shortDescriptionHint') }}</div>
            </div>
            <div class="edit-grid">
              <div class="field">
                <label>{{ t('settings.icp.modal.points') }} <span class="req">*</span></label>
                <input type="number" min="0" [(ngModel)]="icpModalDraft.points">
              </div>
              <div class="field field-check">
                <label class="check-label">
                  <input type="checkbox" [(ngModel)]="icpModalDraft.active"> {{ t('settings.icp.modal.active') }}
                </label>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" [disabled]="icpSaving()" (click)="closeIcpEditModal()">{{ 'actions.cancel' | transloco }}</button>
            <button class="btn-primary" [disabled]="icpSaving() || !icpModalDraft.label.trim() || !icpModalDraft.ai_definition.trim()"
                    (click)="saveIcpModalDraft()">
              {{ icpSaving() ? t('settings.icp.modal.saving') : ('actions.save' | transloco) }}
            </button>
          </div>
        </div>
      </div>
    }
    </ng-container>
  `,
  styles: [`
    #topbar { height:60px;background:white;border-bottom:1px solid var(--gray-200);display:flex;align-items:center;gap:10px;padding:0 24px;flex-shrink:0; }
    .page-title { font-family:'Sora',sans-serif;font-size:17px;font-weight:700;color:var(--gray-900); }
    .tsp { flex:1; }
    #content { flex:1;overflow-y:auto;padding:24px; }
    .tabs { display:flex;gap:4px;margin-bottom:24px;border-bottom:2px solid var(--gray-200);padding-bottom:0; }
    .tab-btn { background:none;border:none;padding:10px 20px;font-size:13px;font-weight:600;color:var(--gray-500);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .15s; }
    .tab-btn.active { color:var(--orange);border-bottom-color:var(--orange); }
    .tab-btn:hover:not(.active) { color:var(--gray-700); }
    .cat-header { padding:14px 20px;background:var(--gray-50);border-bottom:1px solid var(--gray-200);display:flex;align-items:center;gap:10px; }
    .cat-title { font-family:'Sora',sans-serif;font-size:14px;font-weight:700;color:var(--gray-900); }
    .field-label { font-size:13.5px;font-weight:600;color:var(--gray-900);margin-bottom:3px; }
    .field-desc { font-size:12px;color:var(--gray-500);line-height:1.5;margin-bottom:6px; }
    .field-meta { font-size:11px;color:var(--gray-400); }
    .field-err { font-size:11px;color:#EF4444; }
    .field-dirty { font-size:11px;color:var(--orange); }
    .fi { border:1px solid var(--gray-200);border-radius:8px;padding:8px 12px;font-size:13px;font-family:inherit;outline:none;transition:border .15s; }
    .fi:focus { border-color:var(--orange); }
    .fi-err { border-color:#EF4444 !important; }
    .fsel { border:1px solid var(--gray-200);border-radius:8px;padding:8px 12px;font-size:13px;font-family:inherit;outline:none;background:white;width:100%; }
    .fsel:focus { border-color:var(--orange); }
    /* JSON list editor */
    .json-list { display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px; }
    .json-item { display:flex;align-items:center;gap:6px;background:#f3f4f6;border-radius:8px;padding:5px 10px;font-size:12px; }
    .json-item-val { font-weight:600;color:#374151; }
    .json-item-raw { color:#9ca3af;font-family:monospace;font-size:10px; }
    .json-del { background:none;border:none;color:#9ca3af;cursor:pointer;font-size:13px;padding:0 2px;line-height:1; }
    .json-del:hover { color:#ef4444; }
    .json-add-row { display:flex;gap:8px;align-items:center; }
    .loading-overlay { display:flex;align-items:center;justify-content:center;padding:60px; }
    .spinner { width:32px;height:32px;border:3px solid var(--gray-200);border-top-color:var(--orange);border-radius:50%;animation:spin .8s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }

    /* Enrichment / ICP tab */
    .state-msg { color: var(--gray-500); font-size: 14px; padding: 24px 0; text-align: center; }
    .td-muted { color: var(--gray-500); font-size: 13px; }
    .hint { font-size: 11.5px; color: var(--gray-400); margin-top: 3px; }
    .hint-inline { font-size: 11px; color: var(--gray-400); font-weight: 400; }
    .req { color: #dc2626; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 12px; font-weight: 500; }
    .badge-off { background: var(--gray-100); color: var(--gray-500); }
    .panel-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }

    .icp-tenant-bar {
      display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px;
      padding: 12px 16px; margin-bottom: 14px; border-radius: 10px;
      background: #EFF6FF; border: 1px solid #BFDBFE;
    }
    .icp-tenant-current { font-size: 12.5px; color: #1D4ED8; margin-left: auto; }
    .icp-summary {
      display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px;
      padding: 10px 16px; font-size: 12.5px; color: var(--gray-600);
      background: var(--gray-50); border: 1px solid var(--gray-100); border-radius: 8px;
    }
    .icp-error {
      border: 1px solid #FECACA; background: #FEF2F2; color: #991B1B;
      border-radius: 10px; padding: 16px 18px; font-size: 13px;
    }
    .icp-list { border: 1px solid var(--gray-100); border-radius: 10px; overflow: hidden; margin-top: 14px; }
    .icp-row {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
      padding: 10px 14px; border-bottom: 1px solid var(--gray-100); background: white;
    }
    .icp-row:last-child { border-bottom: none; }
    .icp-row-main { display: flex; align-items: flex-start; gap: 10px; min-width: 0; flex: 1; }
    .icp-row-text { min-width: 0; }
    .icp-row-name { font-size: 13.5px; font-weight: 600; color: var(--gray-800); }
    .icp-row-name.inactive { color: var(--gray-400); font-weight: 500; }
    .icp-row-desc {
      font-size: 12px; color: var(--gray-500); margin-top: 2px; max-width: 480px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .icp-row-side { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .icp-points-input {
      width: 40px; padding: 4px 4px; border: 1px solid var(--gray-200); border-radius: 6px;
      font-size: 12.5px; text-align: center;
    }
    .icp-save-check {
      width: 22px; height: 22px; border-radius: 50%; border: none; background: #dcfce7; color: #16a34a;
      cursor: pointer; font-size: 12px; line-height: 1; display: inline-flex; align-items: center; justify-content: center;
    }
    .icp-save-check:disabled { opacity: .55; cursor: not-allowed; }
    .icp-toggle {
      position: relative; width: 32px; height: 18px; border-radius: 999px; border: none; cursor: pointer;
      background: var(--gray-200); flex-shrink: 0; margin-top: 2px; transition: background .15s; padding: 0;
    }
    .icp-toggle::after {
      content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%;
      background: white; transition: left .15s; box-shadow: 0 1px 2px rgba(0,0,0,.25);
    }
    .icp-toggle.on { background: #16a34a; }
    .icp-toggle.on::after { left: 16px; }
    .icp-toggle:disabled { opacity: .55; cursor: not-allowed; }

    /* ICP modal */
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.45);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .modal { background: white; border-radius: 12px; width: 480px; max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,.25); }
    .modal-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 22px 14px; border-bottom: 1px solid var(--gray-200);
    }
    .modal-header h2 { margin: 0; font-size: 16px; font-weight: 600; }
    .modal-body { padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; }
    .modal-footer {
      display: flex; gap: 8px; justify-content: flex-end;
      padding: 14px 22px 18px; border-top: 1px solid var(--gray-200);
    }
    .btn-icon {
      width: 30px; height: 30px; border-radius: 6px; border: none; background: none;
      cursor: pointer; color: var(--gray-500);
      display: flex; align-items: center; justify-content: center; transition: background .12s, color .12s;
    }
    .btn-icon:hover { background: var(--gray-100); color: var(--gray-700); }
    .btn-icon svg { width: 15px; height: 15px; }
    .edit-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px 16px;
    }
    .field label { display: block; font-size: 12px; font-weight: 600; color: var(--gray-600); margin-bottom: 4px; }
    .field input:not([type=checkbox]) {
      width: 100%; padding: 7px 10px; border: 1px solid var(--gray-300);
      border-radius: 6px; font-size: 13px; background: white; box-sizing: border-box;
    }
    .field input:focus, .field textarea:focus { outline: none; border-color: var(--orange); box-shadow: 0 0 0 2px rgba(59,170,93,.15); }
    .field textarea {
      width: 100%; padding: 7px 10px; border: 1px solid var(--gray-300);
      border-radius: 6px; font-size: 13px; background: white; box-sizing: border-box;
      font-family: inherit; resize: vertical;
    }
    .field-check { display: flex; align-items: flex-end; padding-bottom: 2px; }
    .check-label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--gray-700); cursor: pointer; }
    .btn-primary {
      padding: 8px 18px; background: var(--orange); color: white;
      border: none; border-radius: 7px; font-size: 13.5px; font-weight: 500;
      cursor: pointer; transition: background .12s;
    }
    .btn-primary:hover:not(:disabled) { background: var(--orange-dark); }
    .btn-primary:disabled { opacity: .55; cursor: not-allowed; }
    .btn-secondary {
      padding: 8px 18px; background: white; color: var(--gray-700);
      border: 1px solid var(--gray-300); border-radius: 7px; font-size: 13.5px;
      cursor: pointer; transition: background .12s;
    }
    .btn-secondary:hover { background: var(--gray-50); }
    .btn-danger-sm {
      padding: 6px 12px; background: #fee2e2; color: #dc2626;
      border: 1px solid #fca5a5; border-radius: 6px; font-size: 12.5px; cursor: pointer;
      transition: background .12s;
    }
    .btn-danger-sm:hover:not(:disabled) { background: #fecaca; }
    .btn-danger-sm:disabled { opacity: .55; cursor: not-allowed; }
    .survey-link {
      display: flex; align-items: center; gap: 12px; margin-bottom: 20px; padding: 12px 18px;
      background: var(--orange-pale); border: 1px solid var(--orange); border-radius: 10px;
      font-size: 13px; color: var(--gray-800); text-decoration: none;
    }
    .survey-link:hover { background: white; }
    .survey-link-cta { margin-left: auto; font-weight: 600; color: var(--orange-dark); white-space: nowrap; }
  `],
})
export class SettingsComponent implements OnInit {
  private settingsSvc = inject(AppSettingsService);
  private toast       = inject(ToastService);
  auth                = inject(AuthService);
  private transloco     = inject(TranslocoService);
  private localeService = inject(LocaleService);

  loading   = signal(true);
  saving    = signal(false);
  fields    = signal<SettingField[]>([]);
  activeTab = signal<Tab>('global');

  private http        = inject(HttpClient);
  allUsers            = signal<{id:string;display_name:string}[]>([]);
  private templateDrafts = new Map<string, any[]>();

  // ── Grupy użytkowników ────────────────────────────────────────────────────
  groups        = signal<any[]>([]);
  groupsLoading = signal(false);
  groupSaving   = signal(false);
  groupError    = signal('');
  newGroup      = { name: '', display_name: '', description: '', has_owner_restriction: false };
  private groupsLoaded = false;

  loadGroups(): void {
    if (this.groupsLoaded) return;
    this.groupsLoading.set(true);
    this.http.get<any[]>(`${environment.apiUrl}/admin/settings/groups`).subscribe({
      next: list => {
        this.groups.set(list);
        this.groupsLoading.set(false);
        this.groupsLoaded = true;
      },
      error: () => this.groupsLoading.set(false),
    });
  }

  addGroup(): void {
    const { name, display_name, description, has_owner_restriction } = this.newGroup;
    if (!name.trim() || !display_name.trim()) return;
    this.groupSaving.set(true);
    this.groupError.set('');
    this.http.post<any>(`${environment.apiUrl}/admin/settings/groups`, {
      name: name.trim(), display_name: display_name.trim(),
      description: description.trim() || null, has_owner_restriction,
    }).subscribe({
      next: created => {
        this.groups.update(list => [...list, created].sort((a, b) => a.name.localeCompare(b.name)));
        this.newGroup = { name: '', display_name: '', description: '', has_owner_restriction: false };
        this.groupSaving.set(false);
        this.toast.success(this.transloco.translate('admin.settings.groups.added', { name: created.display_name }));
      },
      error: err => {
        this.groupError.set(err?.error?.error ?? this.transloco.translate('admin.settings.groups.addFailed'));
        this.groupSaving.set(false);
      },
    });
  }

  // ── Edytor szablonów onboardingowych ─────────────────────────────────────
  getTemplates(field: any): any[] {
    if (!this.templateDrafts.has(field.key)) {
      try {
        const raw = field.draft || field.value || '[]';
        this.templateDrafts.set(field.key, JSON.parse(String(raw)));
      } catch {
        this.templateDrafts.set(field.key, []);
      }
    }
    return this.templateDrafts.get(field.key)!;
  }

  onTemplatesChange(field: any): void {
    const tpls = this.templateDrafts.get(field.key) || [];
    field.draft = JSON.stringify(tpls);
    field.dirty = true;
    this.fields.update(f => [...f]);
  }

  updateTemplate(field: any, idx: number, prop: string, value: any): void {
    const tpls = this.getTemplates(field);
    if (tpls[idx]) {
      tpls[idx] = { ...tpls[idx], [prop]: value };
      this.templateDrafts.set(field.key, tpls);
      field.draft = JSON.stringify(tpls);
      field.dirty = true;
      this.fields.update(f => [...f]);
    }
  }

  addTemplate(field: any): void {
    const tpls = this.getTemplates(field); // ensures cache exists
    tpls.push({ id: 'tpl_' + Date.now(), title: '', type: 'task', step: 0, standard: false, assignee: null, days: null });
    this.templateDrafts.set(field.key, [...tpls]); // update cache with new array
    field.draft = JSON.stringify(tpls);
    field.dirty = true;
    this.fields.update(f => [...f]);
  }

  addLeadSource(field: any): void {
    const items = this.getTemplates(field);
    items.push({ value: '', label: '', group: null });
    this.templateDrafts.set(field.key, [...items]);
    field.draft = JSON.stringify(items);
    field.dirty = true;
    this.fields.update(f => [...f]);
  }

  removeTemplate(field: any, idx: number): void {
    const tpls = this.getTemplates(field);
    tpls.splice(idx, 1);
    this.templateDrafts.set(field.key, [...tpls]);
    field.draft = JSON.stringify(tpls);
    field.dirty = true;
    this.fields.update(f => [...f]);
  }

  deleteGroup(g: any): void {
    if (g.member_count > 0 || g.document_count > 0) return;
    if (!confirm(this.transloco.translate('admin.settings.groups.deleteConfirm', { name: g.display_name }))) return;
    this.http.delete(`${environment.apiUrl}/admin/settings/groups/${g.id}`).subscribe({
      next: () => {
        this.groups.update(list => list.filter(x => x.id !== g.id));
        this.toast.success(this.transloco.translate('admin.settings.groups.deleted', { name: g.display_name }));
      },
      error: err => this.toast.error(err?.error?.error ?? this.transloco.translate('admin.settings.groups.deleteFailed')),
    });
  }

  // buffer for new JSON items
  jsonNewItem: Record<string, string> = {};

  dirty = computed(() => this.fields().some(f => f.dirty));

  previewRedDays  = computed(() => Number(this.fields().find(x => x.key === 'expiration_red_days')?.draft)  || 90);
  previewSoonDays = computed(() => Number(this.fields().find(x => x.key === 'expiration_soon_days')?.draft) || 30);

  globalCategories = computed(() => {
    const byCategory: Record<string, SettingField[]> = {};
    for (const f of this.fields().filter(f => GLOBAL_CATEGORIES.includes(f.category) && !DOC_DICT_KEYS.includes(f.key))) {
      (byCategory[f.category] ??= []).push(f);
    }
    return Object.entries(byCategory).map(([key, flds]) => ({
      key,
      label: CATEGORY_LABELS[key] ? this.transloco.translate(CATEGORY_LABELS[key].labelKey) : key,
      icon:  CATEGORY_LABELS[key]?.icon  ?? '⚙️',
      fields: flds,
    }));
  });

  crmFields     = computed(() => this.fields().filter(f => f.category === 'crm' && !CRM_DICT_KEYS.includes(f.key) && !f.key.startsWith('churn_') && !f.key.startsWith('health_')));
  docFields     = computed(() => this.fields().filter(f => DOC_DICT_KEYS.includes(f.key)));
  crmDictFields = computed(() => this.fields().filter(f => CRM_DICT_KEYS.includes(f.key)));
  tooltipFields = computed(() => this.fields().filter(f => f.category === 'tooltip').sort((a, b) => a.key.localeCompare(b.key)));

  churnFields      = computed(() => this.fields().filter(f => f.key.startsWith('churn_')));
  churnDayFields   = computed(() => this.churnFields().filter(f => f.key.startsWith('churn_days')));
  churnSalesFields = computed(() => this.churnFields().filter(f => f.key.startsWith('churn_sales')));
  churnRiskFields  = computed(() => this.churnFields().filter(f => f.key.startsWith('churn_risk')));
  churnTimeField   = computed(() => this.fields().find(f => f.key === 'churn_daily_run_time'));

  healthFields      = computed(() => this.fields().filter(f => f.key.startsWith('health_')));
  healthActFields   = computed(() => this.healthFields().filter(f => f.key.startsWith('health_act')));
  healthRevFields   = computed(() => this.healthFields().filter(f => f.key.startsWith('health_rev')));
  healthLevelFields = computed(() => this.healthFields().filter(f => f.key.startsWith('health_good') || f.key.startsWith('health_warn')));

  // ── Tooltips CRUD ─────────────────────────────────────────────────────────
  newTipScreen   = '';
  newTipLabelKey = '';
  newTipValue    = '';
  tipSaving      = signal(false);
  tipError       = signal('');
  tipDrafts:     Record<string, string> = {};
  tipDirty:      Record<string, boolean> = {};

  get catalogScreens(): string[] { return [...new Set(TOOLTIP_CATALOG.map(e => e.screen))]; }
  get catalogForScreen(): TooltipCatalogEntry[] {
    return TOOLTIP_CATALOG.filter(e => e.screen === this.newTipScreen);
  }

  tooltipFieldsForScreen(screen: string): SettingField[] {
    const keys = new Set(TOOLTIP_CATALOG.filter(e => e.screen === screen).map(e => e.key));
    return this.tooltipFields().filter(f => keys.has(f.key));
  }

  uncategorizedTooltips = computed(() => {
    const catalogKeys = new Set(TOOLTIP_CATALOG.map(e => e.key));
    return this.tooltipFields().filter(f => !catalogKeys.has(f.key));
  });

  catalogEntry(key: string): TooltipCatalogEntry | undefined {
    return TOOLTIP_CATALOG.find(e => e.key === key);
  }

  isAlreadyDefined(key: string): boolean {
    return this.tooltipFields().some(t => t.key === key);
  }

  onNewTipScreenChange(): void {
    this.newTipLabelKey = '';
  }

  ngOnInit(): void {
    // Załaduj listę userów dla edytora szablonów onboarding
    this.http.get<any[]>(`${environment.apiUrl}/admin/users?limit=200`).subscribe({
      next: r => this.allUsers.set((r as any)?.data || r),
      error: () => {},
    });
    this.settingsSvc.reload().then(() => {
      this.buildFields(this.settingsSvc.meta());
      this.loading.set(false);
    });
  }

  private buildFields(meta: AppSettingsMeta[]): void {
    this.templateDrafts.clear();
    this.fields.set(meta.map(m => ({
      key:             m.key,
      label:           m.label,
      description:     m.description,
      value_type:      m.value_type as any,
      category:        m.category,
      updated_at:      m.updated_at,
      updated_by_name: m.updated_by_name,
      draft:           m.value,
      dirty:           false,
      error:           '',
    })));
    this.jsonNewItem = {};
    for (const m of meta) if (m.value_type === 'json') this.jsonNewItem[m.key] = '';

    // Sync tooltip drafts (preserve dirty edits)
    this.tipDrafts = {};
    this.tipDirty  = {};
    for (const m of meta.filter(x => x.category === 'tooltip')) {
      this.tipDrafts[m.key] = m.value ?? '';
    }
  }

  addTooltip(): void {
    const key   = this.newTipLabelKey;
    const value = this.newTipValue.trim();
    if (!key)   { this.tipError.set(this.transloco.translate('admin.settings.tooltips.errors.chooseLabel')); return; }
    if (!value) { this.tipError.set(this.transloco.translate('admin.settings.tooltips.errors.contentRequired')); return; }
    const entry = this.catalogEntry(key);
    // The label is stored with the tooltip, so it is saved in the admin's current language.
    const label = entry
      ? `${this.transloco.translate('admin.settings.tooltips.screens.' + entry.screen)} › ${this.transloco.translate('admin.settings.tooltips.catalog.' + entry.labelKey)}`
      : key;
    this.tipError.set('');
    this.tipSaving.set(true);
    this.http.post(`${environment.apiUrl}/admin/settings/tooltips`, { key, label, value }).subscribe({
      next: () => {
        this.newTipScreen = ''; this.newTipLabelKey = ''; this.newTipValue = '';
        this.tipSaving.set(false);
        this.toast.success(this.transloco.translate('admin.settings.tooltips.added'));
        this.settingsSvc.reload().then(() => this.buildFields(this.settingsSvc.meta()));
      },
      error: err => { this.tipError.set(err?.error?.error ?? this.transloco.translate('admin.settings.errors.saveFailed')); this.tipSaving.set(false); },
    });
  }

  saveTooltip(key: string, value: string): void {
    const f = this.tooltipFields().find(t => t.key === key);
    if (!f) return;
    this.tipSaving.set(true);
    this.http.post(`${environment.apiUrl}/admin/settings/tooltips`, { key, label: f.label, value: value.trim() }).subscribe({
      next: () => {
        this.tipDirty[key] = false;
        this.tipSaving.set(false);
        this.toast.success(this.transloco.translate('admin.settings.tooltips.saved', { key }));
        this.settingsSvc.reload().then(() => this.buildFields(this.settingsSvc.meta()));
      },
      error: err => { this.toast.error(err?.error?.error ?? this.transloco.translate('admin.settings.errors.saveFailed')); this.tipSaving.set(false); },
    });
  }

  deleteTooltip(key: string): void {
    if (!confirm(this.transloco.translate('admin.settings.tooltips.deleteConfirm', { key }))) return;
    this.http.delete(`${environment.apiUrl}/admin/settings/tooltips/${encodeURIComponent(key)}`).subscribe({
      next: () => {
        this.toast.success(this.transloco.translate('admin.settings.tooltips.deleted', { key }));
        this.settingsSvc.reload().then(() => this.buildFields(this.settingsSvc.meta()));
      },
      error: err => this.toast.error(err?.error?.error ?? this.transloco.translate('admin.settings.tooltips.deleteFailed')),
    });
  }

  onFieldChange(field: SettingField): void {
    field.dirty = true;
    field.error = '';
    if (field.value_type === 'number') {
      const n = Number(field.draft);
      if (isNaN(n) || n < 0) field.error = this.transloco.translate('admin.settings.fields.errors.nonNegativeNumber');
    }
    this.fields.update(fs => [...fs]);
  }

  // JSON list helpers
  jsonItems(field: SettingField): string[] {
    try { return JSON.parse(field.draft); } catch { return []; }
  }

  /** Zwraca elementy posortowane alfabetycznie — tylko dla wybranych kluczy */
  private readonly SORTED_KEYS = new Set(['doc_types', 'crm_contact_titles']);

  displayItems(field: SettingField): string[] {
    const items = this.jsonItems(field);
    if (this.SORTED_KEYS.has(field.key)) {
      return [...items].sort((a, b) =>
        (this.jsonItemLabel(field.key, a)).localeCompare(this.jsonItemLabel(field.key, b), this.localeService.activeLocale())
      );
    }
    return items;
  }

  jsonItemLabel(key: string, item: string): string {
    const labels = JSON_ITEM_LABELS[key];
    return labels?.codes.includes(item)
      ? this.transloco.translate(`admin.settings.itemLabels.${labels.group}.${item}`)
      : item;
  }

  addJsonItem(field: SettingField): void {
    const val = (this.jsonNewItem[field.key] || '').trim();
    if (!val) return;
    const items = this.jsonItems(field);
    if (items.includes(val)) { field.error = this.transloco.translate('admin.settings.fields.errors.valueExists'); this.fields.update(fs => [...fs]); return; }
    items.push(val);
    field.draft = JSON.stringify(items);
    field.dirty = true;
    field.error = '';
    this.jsonNewItem[field.key] = '';
    this.fields.update(fs => [...fs]);
  }

  removeJsonItem(field: SettingField, idx: number): void {
    const items = this.jsonItems(field);
    items.splice(idx, 1);
    field.draft = JSON.stringify(items);
    field.dirty = true;
    this.fields.update(fs => [...fs]);
  }

  resetDrafts(): void {
    this.buildFields(this.settingsSvc.meta());
  }

  saveAll(): void {
    const dirtyFields = this.fields().filter(f => f.dirty && !f.error);
    if (!dirtyFields.length) return;

    const updates: Record<string, any> = {};
    for (const f of dirtyFields) {
      if (f.value_type === 'number')       updates[f.key] = Number(f.draft);
      else if (f.value_type === 'boolean') updates[f.key] = f.draft === 'true';
      else if (f.value_type === 'json')    updates[f.key] = JSON.stringify(this.jsonItems(f));
      else                                 updates[f.key] = f.draft;
    }

    this.saving.set(true);
    this.settingsSvc.save(updates).subscribe({
      next: (res) => {
        this.settingsSvc.settings.set({ ...res.settings });
        this.settingsSvc.meta.set(res.meta);
        this.buildFields(res.meta);
        this.saving.set(false);
        this.toast.success(this.transloco.translate('admin.settings.saved', { count: dirtyFields.length }));
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err?.error?.error ?? this.transloco.translate('admin.settings.errors.settingsSaveFailed'));
      },
    });
  }

  // ── Enrichment / ICP tab (tenant admin — dynamic ICP signals of THIS tenant) ─
  // Two mutation paths, both one PUT/POST on an explicit click (no autosave):
  //  - quick inline edit on the list row (points/active only) → saveIcpRowQuickFields,
  //  - full edit (name + "jak rozpoznać ten sygnał") → the modal, saveIcpModalDraft.
  // Uses a dedicated `icpSaving` signal (not the top-bar `saving`) so the global
  // "Zapisz zmiany" button never shows a save state that isn't actually its own.
  icpConfig  = signal<IcpConfig | null>(null);
  icpLoading = signal(false);
  icpSaving  = signal(false);
  // Osobny stan błędu — bez niego 403/404/5xx wyglądały w UI dokładnie tak samo
  // jak poprawnie wczytana, pusta konfiguracja (audyt multi-tenant ICP, 23.09).
  icpError   = signal<string | null>(null);
  icpRows    = signal<IcpRow[]>([]);
  // null = closed; 'new' = creating a signal; an IcpSignal = editing that one.
  icpModalTarget = signal<IcpSignal | 'new' | null>(null);
  icpModalDraft: IcpModalDraft = { label: '', ai_definition: '', short_description: '', points: 0, active: true };

  // Tenant, którego konfigurację pokazuje ekran. Admin tenanta ma tu na stałe
  // swój własny; superadmin przestawia to dropdownem (switchIcpTenant).
  icpTenantId = signal<string | null>(this.auth.user()?.tenant_id ?? null);
  icpTenants  = signal<Tenant[]>([]);

  icpTenantName = computed(() => {
    const id = this.icpTenantId();
    return this.icpTenants().find(t => t.id === id)?.name
      ?? (id === this.auth.user()?.tenant_id ? this.transloco.translate('admin.settings.icp.ownTenant') : '—');
  });

  // Jedyne miejsce, które decyduje, w którą rodzinę endpointów idą żądania ICP.
  // Oba zestawy mają IDENTYCZNY kształt żądania i odpowiedzi, różnią się tylko
  // ścieżką, dzięki czemu reszta ekranu nie wie o tym podziale:
  //   superadmin    → /admin/tenants/:id/icp-*   (requireSuperAdmin, dowolny tenant)
  //   admin tenanta → /admin/prospects/icp-*     (tenant brany z sesji)
  private icpApiBase(): string {
    const id = this.icpTenantId();
    return this.auth.isSuperAdmin() && id
      ? `${environment.apiUrl}/admin/tenants/${id}`
      : `${environment.apiUrl}/admin/prospects`;
  }

  private icpSignalsUrl(signalId?: string): string {
    return `${this.icpApiBase()}/icp-signals${signalId ? `/${signalId}` : ''}`;
  }

  // Lista tenantów tylko dla superadmina — admin tenanta nie ma dostępu do
  // /admin/tenants (requireSuperAdmin) i nie ma czego wybierać.
  loadIcpTenants(): void {
    if (!this.auth.isSuperAdmin() || this.icpTenants().length) return;
    this.http.get<Tenant[]>(`${environment.apiUrl}/admin/tenants`).subscribe({
      next: ts => this.icpTenants.set(ts.filter(t => !t.deleted_at)),
      error: () => { /* dropdown zostaje pusty — własny tenant i tak się wczyta */ },
    });
  }

  switchIcpTenant(tenantId: string): void {
    if (!tenantId || tenantId === this.icpTenantId()) return;
    this.icpTenantId.set(tenantId);
    this.loadIcpConfig();
  }

  loadIcpConfig(): void {
    const tenantId = this.icpTenantId();
    if (!tenantId) {
      this.icpError.set(this.transloco.translate('admin.settings.icp.errors.noTenant'));
      this.toast.error(this.transloco.translate('admin.settings.icp.errors.noTenantToast'));
      return;
    }
    this.icpLoading.set(true);
    this.icpError.set(null);
    this.icpModalTarget.set(null);
    this.http.get<IcpConfig>(`${this.icpApiBase()}/icp-config`).subscribe({
      next: cfg => {
        this.icpConfig.set(cfg);
        this.icpRows.set([...cfg.signals]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(s => ({ signal: s, points: s.points, active: s.active })));
        this.icpError.set(null);
        this.icpLoading.set(false);
      },
      error: err => {
        // Pusta lista sygnałów i nieudany request to dwie różne rzeczy —
        // czyścimy config, żeby nie pokazać nieaktualnych danych, ale
        // renderujemy jawny komunikat, nie pustkę.
        this.icpConfig.set(null);
        this.icpRows.set([]);
        this.icpError.set(this.icpLoadErrorMessage(err));
        this.icpLoading.set(false);
        this.toast.error(this.transloco.translate('admin.settings.icp.errors.loadFailed'));
      },
    });
  }

  private icpLoadErrorMessage(err: { status?: number; error?: { error?: string } }): string {
    const detail = err?.error?.error;
    switch (err?.status) {
      case 0:   return this.transloco.translate('admin.settings.icp.errors.noConnection');
      case 401: return this.transloco.translate('admin.settings.icp.errors.sessionExpired');
      case 403: return detail || this.transloco.translate('admin.settings.icp.errors.forbidden');
      case 404: return this.transloco.translate('admin.settings.icp.errors.notFound');
      default:  return detail || this.transloco.translate('admin.settings.icp.errors.fetchFailed', {
        status: err?.status ?? this.transloco.translate('admin.settings.icp.errors.unknownStatus'),
      });
    }
  }

  isIcpRowDirty(row: IcpRow): boolean {
    return row.points !== row.signal.points || row.active !== row.signal.active;
  }

  // Toggle sam w sobie JEST akcją zapisu (bez osobnego "✓") — inaczej admin
  // przełącza wizualnie, ale bez świadomego dodatkowego kliknięcia zmiana
  // nigdy nie trafia do backendu i po odświeżeniu wraca do stanu sprzed toggle.
  toggleIcpSignalActive(row: IcpRow): void {
    row.active = !row.active;
    this.saveIcpRowQuickFields(row);
  }

  saveIcpRowQuickFields(row: IcpRow): void {
    const tenantId = this.icpTenantId();
    const cfg = this.icpConfig();
    if (!tenantId || !cfg) return;
    this.icpSaving.set(true);
    this.http.put(this.icpSignalsUrl(row.signal.id), {
      points: row.points,
      active: row.active,
      expected_revision: cfg.config_revision,
    }).subscribe({
      next: () => { this.icpSaving.set(false); this.loadIcpConfig(); },
      error: err => this.handleIcpError(err),
    });
  }

  openIcpEditModal(signal: IcpSignal | null): void {
    this.icpModalTarget.set(signal ?? 'new');
    this.icpModalDraft = signal
      ? { label: signal.label, ai_definition: signal.ai_definition, short_description: signal.short_description ?? '', points: signal.points, active: signal.active }
      : { label: '', ai_definition: '', short_description: '', points: 0, active: true };
  }

  // Modal zamyka się tylko wtedy, gdy CAŁE kliknięcie — mousedown i mouseup —
  // odbyło się na backdropie. Samo (click) na backdropie nie wystarczało:
  // przy zaznaczaniu tekstu w input/textarea mouseup ląduje często poza
  // modalem, a przeglądarka wysyła wtedy `click` na najbliższego wspólnego
  // przodka obu zdarzeń, czyli właśnie backdrop — (click)="$event.stopPropagation()"
  // na .modal nigdy się w tym scenariuszu nie odpala, więc modal zamykał się
  // w trakcie zaznaczania tekstu.
  private icpBackdropMouseDown = false;

  onIcpBackdropMouseDown(event: MouseEvent): void {
    this.icpBackdropMouseDown = event.target === event.currentTarget;
  }

  onIcpBackdropMouseUp(event: MouseEvent): void {
    const startedOnBackdrop = this.icpBackdropMouseDown;
    this.icpBackdropMouseDown = false;
    if (startedOnBackdrop && event.target === event.currentTarget) {
      this.closeIcpEditModal();
    }
  }

  closeIcpEditModal(): void {
    this.icpModalTarget.set(null);
  }

  saveIcpModalDraft(): void {
    const tenantId = this.icpTenantId();
    const cfg = this.icpConfig();
    const target = this.icpModalTarget();
    if (!tenantId || !cfg || target === null) return;

    this.icpSaving.set(true);
    const body = {
      label: this.icpModalDraft.label,
      ai_definition: this.icpModalDraft.ai_definition,
      short_description: this.icpModalDraft.short_description.trim() || null,
      points: this.icpModalDraft.points,
      active: this.icpModalDraft.active,
      expected_revision: cfg.config_revision,
    };
    const req$ = target === 'new'
      ? this.http.post(this.icpSignalsUrl(), body)
      : this.http.put(this.icpSignalsUrl(target.id), body);

    req$.subscribe({
      next: () => {
        this.icpSaving.set(false);
        this.toast.success(this.transloco.translate(target === 'new' ? 'admin.settings.icp.signalAdded' : 'admin.settings.icp.signalUpdated'));
        this.icpModalTarget.set(null);
        this.loadIcpConfig();
      },
      error: err => this.handleIcpError(err),
    });
  }

  deleteIcpRow(row: IcpRow): void {
    const tenantId = this.icpTenantId();
    if (!tenantId || !confirm(this.transloco.translate('admin.settings.icp.deleteConfirm', { name: row.signal.label }))) return;
    const cfg = this.icpConfig();
    this.icpSaving.set(true);
    this.http.delete<{ soft_deleted: boolean }>(this.icpSignalsUrl(row.signal.id), {
      body: { expected_revision: cfg?.config_revision },
    }).subscribe({
      next: res => {
        this.icpSaving.set(false);
        this.toast.success(this.transloco.translate(res.soft_deleted ? 'admin.settings.icp.signalDisabled' : 'admin.settings.icp.signalDeleted'));
        this.loadIcpConfig();
      },
      error: err => this.handleIcpError(err),
    });
  }

  // Shared by every ICP mutation above. 409 means someone else changed the LIVE
  // draft since this tab loaded (optimistic concurrency on config_revision —
  // independent of the published version number, patrz IcpConfig) — reload
  // rather than silently overwrite their change.
  private handleIcpError(err: { status?: number; error?: { error?: string } }): void {
    this.icpSaving.set(false);
    if (err?.status === 409) {
      this.toast.error(this.transloco.translate('admin.settings.icp.errors.conflict'));
      this.loadIcpConfig();
      return;
    }
    this.toast.error(err?.error?.error ?? this.transloco.translate('admin.settings.errors.saveFailed'));
  }
}
