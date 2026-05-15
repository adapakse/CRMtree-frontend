import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AppSettingsService, AppSettingsMeta } from '../../../core/services/app-settings.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { environment } from '../../../../environments/environment';

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
type Tab = 'global' | 'crm' | 'documents' | 'users' | 'onboarding' | 'tooltips';

// Katalog tooltip-slotów: klucz techniczny → ekran + label (widoczne dla admina)
const TOOLTIP_CATALOG: { key: string; screen: string; label: string }[] = [
  // Partner Performance
  { key: 'crm.partners.kpi.gross_turnover',  screen: 'Partner Performance', label: 'Obrót brutto (PLN)' },
  { key: 'crm.partners.kpi.revenue',         screen: 'Partner Performance', label: 'Przychód / Marża (PLN)' },
  { key: 'crm.partners.kpi.fees',            screen: 'Partner Performance', label: 'Fees (PLN)' },
  { key: 'crm.partners.kpi.transactions',    screen: 'Partner Performance', label: 'Transakcje' },
  { key: 'crm.partners.kpi.active_partners', screen: 'Partner Performance', label: 'Aktywnych partnerów' },
  { key: 'crm.partners.scorecard.health',    screen: 'Partner Performance', label: 'Scorecard: Health' },
  // Raporty sprzedaży – KPI
  { key: 'crm.leads.kpi.pipeline',  screen: 'Raporty sprzedaży', label: 'KPI: Pipeline (PLN)' },
  { key: 'crm.leads.kpi.won',       screen: 'Raporty sprzedaży', label: 'KPI: Zamknięte / Won (PLN)' },
  { key: 'crm.leads.kpi.win_rate',  screen: 'Raporty sprzedaży', label: 'KPI: Win Rate' },
  { key: 'crm.leads.kpi.avg_cycle', screen: 'Raporty sprzedaży', label: 'KPI: Avg. cykl sprzedaży' },
  { key: 'crm.leads.kpi.budget',    screen: 'Raporty sprzedaży', label: 'KPI: Planowany budżet (PLN)' },
  // Raporty sprzedaży – Lejek
  { key: 'crm.leads.funnel.title',       screen: 'Raporty sprzedaży', label: 'Lejek sprzedażowy (tytuł)' },
  { key: 'crm.leads.funnel.pct',         screen: 'Raporty sprzedaży', label: 'Lejek: % konwersji między etapami' },
  { key: 'crm.leads.funnel.conversion',  screen: 'Raporty sprzedaży', label: 'Lejek: Konwersja do Wygranego' },
  { key: 'crm.leads.funnel.avg_won',     screen: 'Raporty sprzedaży', label: 'Lejek: Avg. wartość wygranego' },
  { key: 'crm.leads.funnel.active',      screen: 'Raporty sprzedaży', label: 'Lejek: Aktywne leady' },
  { key: 'crm.leads.funnel.hot',         screen: 'Raporty sprzedaży', label: 'Lejek: Gorące leady' },
  // Raporty sprzedaży – Trend miesięczny
  { key: 'crm.leads.trend.title',        screen: 'Raporty sprzedaży', label: 'Trend miesięczny (tytuł)' },
  // Raporty sprzedaży – Wyniki handlowców
  { key: 'crm.leads.reps.title',         screen: 'Raporty sprzedaży', label: 'Wyniki handlowców (tytuł)' },
  { key: 'crm.leads.reps.col.leads',     screen: 'Raporty sprzedaży', label: 'Handlowcy: kolumna Leady' },
  { key: 'crm.leads.reps.col.pipeline',  screen: 'Raporty sprzedaży', label: 'Handlowcy: kolumna Pipeline' },
  { key: 'crm.leads.reps.col.won',       screen: 'Raporty sprzedaży', label: 'Handlowcy: kolumna Won' },
  { key: 'crm.leads.reps.col.win_rate',  screen: 'Raporty sprzedaży', label: 'Handlowcy: kolumna Win%' },
  { key: 'crm.leads.reps.col.progress',  screen: 'Raporty sprzedaży', label: 'Handlowcy: kolumna Postęp' },
  // Raporty sprzedaży – Źródła leadów
  { key: 'crm.leads.sources.title',      screen: 'Raporty sprzedaży', label: 'Źródła leadów (tytuł)' },
  { key: 'crm.leads.sources.quality',    screen: 'Raporty sprzedaży', label: 'Źródła: Jakość po źródle (win rate)' },
  // Raporty sprzedaży – Czas w etapie
  { key: 'crm.leads.velocity.title',     screen: 'Raporty sprzedaży', label: 'Czas w etapie – avg dni (tytuł)' },
  // Raporty sprzedaży – Powody przegranej
  { key: 'crm.leads.lost.title',         screen: 'Raporty sprzedaży', label: 'Powody przegranej (tytuł)' },
  // Sales Dashboard – KPI
  { key: 'crm.sales.kpi.new_contacts',   screen: 'Sales Dashboard', label: 'KPI: Nowe kontakty' },
  { key: 'crm.sales.kpi.new_companies',  screen: 'Sales Dashboard', label: 'KPI: Nowe firmy' },
  { key: 'crm.sales.kpi.new_leads',      screen: 'Sales Dashboard', label: 'KPI: Nowe szanse (aktywny pipeline)' },
  { key: 'crm.sales.kpi.pipeline_value', screen: 'Sales Dashboard', label: 'KPI: Wartość szans (pipeline)' },
  { key: 'crm.sales.kpi.won',            screen: 'Sales Dashboard', label: 'KPI: Wygrane szanse' },
  // Sales Dashboard – Panele
  { key: 'crm.sales.pipeline',           screen: 'Sales Dashboard', label: 'Panel: Pipeline sprzedaży' },
  { key: 'crm.sales.chart',              screen: 'Sales Dashboard', label: 'Panel: Wyniki sprzedażowe (wykres)' },
  { key: 'crm.sales.tasks',              screen: 'Sales Dashboard', label: 'Panel: Zadania na dziś' },
  { key: 'crm.sales.recent_leads',       screen: 'Sales Dashboard', label: 'Panel: Najnowsze szanse (tabela)' },
  { key: 'crm.sales.activity',           screen: 'Sales Dashboard', label: 'Panel: Ostatnia aktywność' },
];

// Kategorie globalnej aplikacji
const GLOBAL_CATEGORIES = ['documents', 'workflow', 'general'];
// Klucze słownikowe dokumentów - pokazywane tylko w zakładce 'Słowniki dokumentów'
const DOC_DICT_KEYS = ['doc_types', 'doc_statuses', 'doc_gdpr_types', 'doc_entity1_options', 'doc_contract_subjects'];
const CRM_DICT_KEYS = ['onboarding_task_templates', 'crm_lead_sources'];

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  documents: { label: 'Dokumenty i terminy',    icon: '📄' },
  workflow:  { label: 'Workflow i Kanban',       icon: '🗂' },
  general:   { label: 'Ogólne / UI',             icon: '⚙️' },
  crm:       { label: 'CRM – parametry biznesowe', icon: '💼' },
};

// Etykiety dla pól json – mapuje klucz → etykiety elementów tablicy
const JSON_ITEM_LABELS: Record<string, Record<string, string>> = {
  crm_product_types: {
    hotel: 'Hotel', transport_flight: 'Lot', transport_train: 'Pociąg',
    transport_bus: 'Autobus', transport_ferry: 'Prom', car_rental: 'Wynajem auta',
    transfer: 'Transfer', travel_insurance: 'Ubezpieczenie', visa: 'Wiza', other: 'Inne',
  },
  crm_commission_basis_options: {
    nie_dotyczy: 'Nie dotyczy', segmenty: 'Ilość segmentów',
    rezerwacje: 'Ilość rezerwacji', progi_obrotowe: 'Progi obrotowe',
  },
  // Słowniki leadów i partnerów
  crm_lead_sources: {
    strona_www: 'Strona www', polecenie: 'Polecenie', cold_call: 'Cold call',
    linkedin: 'LinkedIn', targi: 'Targi / Wydarzenie', partner: 'Partner',
    agent: 'Agent', kampania: 'Kampania email', inbound: 'Inbound', inne: 'Inne',
  },
  crm_lead_stages: {
    new: 'Nowy', qualification: 'Kwalifikacja', presentation: 'Prezentacja',
    offer: 'Oferta', negotiation: 'Negocjacje', closed_won: 'Wygrana', closed_lost: 'Przegrana',
  },
  crm_partner_statuses: {
    onboarding: 'Wdrożenie', active: 'Aktywny', inactive: 'Nieaktywny', churned: 'Utracony',
  },
  crm_contact_titles: {
    CEO: 'CEO', CFO: 'CFO', CTO: 'CTO', COO: 'COO', VP: 'VP',
    Director: 'Dyrektor', Manager: 'Manager', Specialist: 'Specjalista',
    Owner: 'Właściciel', Other: 'Inne',
  },
  crm_industries: {
    IT: 'IT', Finance: 'Finanse', Transport: 'Transport', Tourism: 'Turystyka',
    Healthcare: 'Zdrowie', Retail: 'Handel', Manufacturing: 'Produkcja',
    Legal: 'Prawo', Education: 'Edukacja', Other: 'Inne',
  },
  crm_currencies: { PLN: 'PLN', EUR: 'EUR', USD: 'USD', GBP: 'GBP', CHF: 'CHF' },
  crm_commission_basis: {
    nie_dotyczy: 'Nie dotyczy', segmenty: 'Ilość segmentów',
    rezerwacje: 'Ilość rezerwacji', progi_obrotowe: 'Progi obrotowe',
  },
  // Słowniki dokumentów
  doc_types: {
    partner_agreement: 'Umowa partnerska', nda: 'NDA',
    it_supplier_agreement: 'Umowa z dostawcą IT', employee_agreement: 'Umowa pracownicza',
  },
  doc_gdpr_types: {
    no_gdpr: 'Brak GDPR',
    data_processing_entrustment: 'Powierzenie przetwarzania',
    data_administration: 'Współadministrowanie',
  },
  doc_statuses: {
    new: 'Nowy', being_edited: 'W edycji', being_approved: 'Do akceptacji',
    being_signed: 'Do podpisu', signed: 'Podpisany', completed: 'Zakończony', rejected: 'Odrzucony',
  },
  doc_entity1_options: {},  // wartości są wyświetlane bezpośrednio (nie są kluczami technicznymi)
};

@Component({
  selector: 'wt-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div id="topbar">
      <span class="page-title">Ustawienia aplikacji</span>
      <span class="tsp"></span>
      @if (dirty()) {
        <span style="font-size:12px;color:var(--orange);font-weight:500;margin-right:8px">
          ● Niezapisane zmiany
        </span>
      }
      <button class="btn btn-p" [disabled]="saving() || !dirty()" (click)="saveAll()">
        @if (saving()) { Zapisywanie… } @else { 💾 Zapisz zmiany }
      </button>
      <button class="btn btn-g" [disabled]="!dirty()" (click)="resetDrafts()">
        Odrzuć
      </button>
    </div>

    <div id="content">
      @if (loading()) {
        <div class="loading-overlay"><div class="spinner"></div></div>
      }

      <div style="max-width:820px">

        <!-- Zakładki -->
        <div class="tabs">
          <button class="tab-btn" [class.active]="activeTab() === 'global'" (click)="activeTab.set('global')">
            ⚙️ Parametry globalne
          </button>
          <button class="tab-btn" [class.active]="activeTab() === 'crm'" (click)="activeTab.set('crm')">
            💼 Parametry biznesowe CRM
          </button>
          <button class="tab-btn" [class.active]="activeTab() === 'documents'" (click)="activeTab.set('documents')">
            📄 Słowniki dokumentów
          </button>
          <button class="tab-btn" [class.active]="activeTab() === 'users'" (click)="activeTab.set('users'); loadGroups()">
            👥 Grupy użytkowników
          </button>
          <button class="tab-btn" [class.active]="activeTab() === 'onboarding'" (click)="activeTab.set('onboarding')">
            🚀 Szablony Onboarding
          </button>
          <button class="tab-btn" [class.active]="activeTab() === 'tooltips'" (click)="activeTab.set('tooltips')">
            💬 Podpowiedzi
          </button>
        </div>

        <!-- TAB: Parametry globalne -->
        @if (activeTab() === 'global') {

          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#1D4ED8;display:flex;gap:12px;align-items:flex-start">
            <span style="font-size:18px;flex-shrink:0">ℹ️</span>
            <div>
              <strong>Parametry globalne</strong> — ustawienia techniczne aplikacji widoczne dla wszystkich użytkowników. Zmiany wchodzą w życie natychmiast po zapisie.
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
                      <div class="field-meta">Zmienione przez <strong>{{ field.updated_by_name }}</strong> · {{ field.updated_at | date:'dd.MM.yyyy HH:mm' }}</div>
                    }
                  </div>
                  <div style="display:flex;flex-direction:column;gap:4px">
                    @if (field.value_type === 'boolean') {
                      <select class="fsel" [(ngModel)]="field.draft" (ngModelChange)="onFieldChange(field)">
                        <option value="true">Włączone</option>
                        <option value="false">Wyłączone</option>
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
                    @if (field.dirty && !field.error) { <span class="field-dirty">● Zmienione</span> }
                  </div>
                </div>
              }
            </div>
          }

          <!-- Preview -->
          <div class="card" style="padding:20px;margin-bottom:20px">
            <div class="cat-title" style="margin-bottom:14px">🔍 Podgląd kolorów terminów</div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:16px;height:16px;background:var(--gray-800);border-radius:3px"></div>
                <span>Więcej niż <strong>{{ previewRedDays() }}</strong> dni → bez ostrzeżenia</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:16px;height:16px;background:#DC2626;border-radius:3px"></div>
                <span>≤ <strong>{{ previewRedDays() }}</strong> dni → czerwony (pilne)</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:16px;height:16px;background:#F59E0B;border-radius:3px"></div>
                <span>≤ <strong>{{ previewSoonDays() }}</strong> dni → "wygasa wkrótce"</span>
              </div>
            </div>
          </div>
        }

        <!-- TAB: Parametry biznesowe CRM -->
        @if (activeTab() === 'crm') {

          <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#9A3412;display:flex;gap:12px;align-items:flex-start">
            <span style="font-size:18px;flex-shrink:0">💼</span>
            <div>
              <strong>Parametry biznesowe CRM</strong> — słowniki i progi używane przez moduł CRM.
              Listy edytuj przez dodawanie / usuwanie elementów. Zmiany wchodzą w życie po zapisie.
            </div>
          </div>

          @for (field of crmFields(); track field.key) {
            <div class="card" style="margin-bottom:16px;overflow:hidden">
              <div class="cat-header" style="padding:12px 20px">
                <span class="cat-title" style="font-size:13px">{{ field.label }}</span>
                @if (field.dirty) { <span class="field-dirty" style="margin-left:auto">● Zmienione</span> }
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
                        <button class="json-del" (click)="removeJsonItem(field, jsonItems(field).indexOf(item))" title="Usuń">✕</button>
                      </div>
                    }
                    @if (jsonItems(field).length === 0) {
                      <div style="color:var(--gray-400);font-size:12px;padding:6px 0">— lista pusta —</div>
                    }
                  </div>
                  <div class="json-add-row">
                    <input class="fi" style="flex:1"
                           [placeholder]="field.key === 'crm_lost_reasons' ? 'Nowa wartość (np. Wysoka cena)' : 'Nowa wartość (kod, np. hotel)'"
                           [(ngModel)]="jsonNewItem[field.key]"
                           (keydown.enter)="addJsonItem(field)">
                    <button class="btn btn-p" style="padding:6px 14px;font-size:12px"
                            (click)="addJsonItem(field)">+ Dodaj</button>
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
                    Zmienione przez <strong>{{ field.updated_by_name }}</strong> · {{ field.updated_at | date:'dd.MM.yyyy HH:mm' }}
                  </div>
                }
              </div>
            </div>
          }

          <!-- Algorytm Churn -->
          @if (churnFields().length > 0) {
            <div class="card" style="margin-bottom:16px;overflow:hidden">
              <div class="cat-header" style="padding:12px 20px">
                <span class="cat-title" style="font-size:13px">📉 Algorytm Churn — parametry punktacji</span>
                @if (churnFields().some(f => f.dirty)) {
                  <span class="field-dirty" style="margin-left:auto">● Zmienione</span>
                }
              </div>
              <table style="width:100%;border-collapse:collapse;font-size:12.5px">
                <thead>
                  <tr style="background:var(--gray-50)">
                    <th style="padding:8px 20px;text-align:left;font-weight:600;color:var(--gray-600);border-bottom:1px solid var(--gray-200)">Parametr</th>
                    <th style="padding:8px 12px;text-align:left;font-weight:600;color:var(--gray-600);border-bottom:1px solid var(--gray-200)">Opis</th>
                    <th style="padding:8px 16px;text-align:right;font-weight:600;color:var(--gray-600);border-bottom:1px solid var(--gray-200);width:110px">Wartość</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="background:#fafafa">
                    <td colspan="3" style="padding:5px 20px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-400);letter-spacing:.5px">Brak zamówień (dni)</td>
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
                    <td colspan="3" style="padding:5px 20px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-400);letter-spacing:.5px">Spadek sprzedaży (M-2→M-1)</td>
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
                    <td colspan="3" style="padding:5px 20px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-400);letter-spacing:.5px">Progi ryzyka (punkty)</td>
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
                      <td colspan="3" style="padding:5px 20px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-400);letter-spacing:.5px">Harmonogram</td>
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
                <span class="cat-title" style="font-size:13px">💚 Health Score — parametry punktacji</span>
                @if (healthFields().some(f => f.dirty)) {
                  <span class="field-dirty" style="margin-left:auto">● Zmienione</span>
                }
              </div>
              <table style="width:100%;border-collapse:collapse;font-size:12.5px">
                <thead>
                  <tr style="background:var(--gray-50)">
                    <th style="padding:8px 20px;text-align:left;font-weight:600;color:var(--gray-600);border-bottom:1px solid var(--gray-200)">Parametr</th>
                    <th style="padding:8px 12px;text-align:left;font-weight:600;color:var(--gray-600);border-bottom:1px solid var(--gray-200)">Opis</th>
                    <th style="padding:8px 16px;text-align:right;font-weight:600;color:var(--gray-600);border-bottom:1px solid var(--gray-200);width:110px">Wartość</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="background:#fafafa">
                    <td colspan="3" style="padding:5px 20px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-400);letter-spacing:.5px">Aktywność (ostatnie 20 dni)</td>
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
                    <td colspan="3" style="padding:5px 20px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-400);letter-spacing:.5px">Wzrost przychodów (M-2→M-1)</td>
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
                    <td colspan="3" style="padding:5px 20px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-400);letter-spacing:.5px">Progi Health Level (punkty)</td>
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
              <strong>Słowniki dokumentów</strong> — zarządzaj dostępnymi wartościami dla typów dokumentów, statusów i klasyfikacji GDPR.
              Uwaga: usunięcie wartości która jest już użyta w dokumentach może powodować problemy wyświetlania.
            </div>
          </div>

          @for (field of docFields(); track field.key) {
            <div class="card" style="margin-bottom:16px;overflow:hidden">
              <div class="cat-header" style="padding:12px 20px">
                <span class="cat-title" style="font-size:13px">{{ field.label }}</span>
                @if (field.dirty) { <span class="field-dirty" style="margin-left:auto">● Zmienione</span> }
              </div>
              <div style="padding:14px 20px">
                <div class="field-desc" style="margin-bottom:12px">{{ field.description }}</div>

                @if (field.value_type === 'json') {
                  <div class="json-list">
                    @for (item of displayItems(field); track item; let idx = $index) {
                      <div class="json-item">
                        <span class="json-item-val">{{ jsonItemLabel(field.key, item) }}</span>
                        <span class="json-item-raw">{{ item }}</span>
                        <button class="json-del" (click)="removeJsonItem(field, jsonItems(field).indexOf(item))" title="Usuń">✕</button>
                      </div>
                    }
                    @if (jsonItems(field).length === 0) {
                      <div style="color:var(--gray-400);font-size:12px;padding:6px 0">— lista pusta —</div>
                    }
                  </div>
                  <div class="json-add-row">
                    <input class="fi" style="flex:1" type="text" placeholder="Nowa wartość (klucz techniczny)"
                           [(ngModel)]="jsonNewItem[field.key]"
                           (keydown.enter)="addJsonItem(field)">
                    <button class="btn btn-p btn-sm" (click)="addJsonItem(field)">+ Dodaj</button>
                  </div>
                  @if (field.error) { <span class="field-err">{{ field.error }}</span> }
                }

                @if (field.updated_by_name) {
                  <div class="field-meta" style="margin-top:10px">
                    Zmienione przez <strong>{{ field.updated_by_name }}</strong> · {{ field.updated_at | date:'dd.MM.yyyy HH:mm' }}
                  </div>
                }
              </div>
            </div>
          }

          @if (docFields().length === 0) {
            <div style="text-align:center;color:var(--gray-400);padding:40px;font-size:13px">
              Brak słowników dokumentów. Uruchom migrację 0116.
            </div>
          }
        }

        <!-- TAB: Grupy użytkowników -->
        @if (activeTab() === 'users') {

          <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#0369A1;display:flex;gap:12px;align-items:flex-start">
            <span style="font-size:18px;flex-shrink:0">👥</span>
            <div>
              <strong>Grupy użytkowników</strong> — zarządzaj grupami do których można przypisywać użytkowników.
              Grupy kontrolują dostęp do dokumentów. Nie można usunąć grupy z przypisanymi użytkownikami lub dokumentami.
            </div>
          </div>

          <!-- Formularz dodawania grupy -->
          <div class="card" style="margin-bottom:20px;padding:20px">
            <div class="cat-title" style="margin-bottom:14px">➕ Dodaj nową grupę</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
              <div>
                <label class="field-label">Nazwa techniczna <span style="color:#ef4444">*</span></label>
                <div class="field-desc">Unikalny identyfikator (np. Accounting, HR). Bez polskich znaków.</div>
                <input class="fi" style="width:100%;box-sizing:border-box;margin-top:4px"
                       placeholder="np. Accounting"
                       [(ngModel)]="newGroup.name">
              </div>
              <div>
                <label class="field-label">Nazwa wyświetlana <span style="color:#ef4444">*</span></label>
                <div class="field-desc">Widoczna dla użytkowników (np. Obsługa Klienta, Zarząd).</div>
                <input class="fi" style="width:100%;box-sizing:border-box;margin-top:4px"
                       placeholder="np. Obsługa Klienta"
                       [(ngModel)]="newGroup.display_name">
              </div>
              <div>
                <label class="field-label">Opis</label>
                <input class="fi" style="width:100%;box-sizing:border-box;margin-top:4px"
                       placeholder="Opcjonalny opis grupy"
                       [(ngModel)]="newGroup.description">
              </div>
              <div style="display:flex;flex-direction:column;justify-content:flex-end">
                <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin-bottom:12px">
                  <input type="checkbox" [(ngModel)]="newGroup.has_owner_restriction">
                  Ograniczenie właściciela (Owner restriction)
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
              @if (groupSaving()) { Dodawanie… } @else { ➕ Dodaj grupę }
            </button>
          </div>

          <!-- Lista istniejących grup -->
          @if (groupsLoading()) {
            <div style="text-align:center;padding:40px"><div class="spinner"></div></div>
          } @else if (groups().length === 0) {
            <div style="text-align:center;color:var(--gray-400);padding:40px;font-size:13px">
              Brak grup. Dodaj pierwszą grupę powyżej lub uruchom migrację 0127.
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
                      <span>{{ g.member_count }} użytkowników</span>
                      <span style="margin:0 6px">·</span>
                      <span>{{ g.document_count }} dokumentów</span>
                      @if (g.has_owner_restriction) {
                        <span style="margin-left:8px;background:#FEF3C7;color:#92400E;padding:1px 8px;border-radius:10px;font-size:10px;font-weight:700">Owner restriction</span>
                      }
                      @if (!g.is_active) {
                        <span style="margin-left:8px;background:#F3F4F6;color:#6B7280;padding:1px 8px;border-radius:10px;font-size:10px;font-weight:700">Nieaktywna</span>
                      }
                    </div>
                    @if (g.description) {
                      <div style="font-size:12px;color:var(--gray-500);margin-top:3px">{{ g.description }}</div>
                    }
                  </div>
                  <button class="btn btn-d btn-sm"
                          [disabled]="g.member_count > 0 || g.document_count > 0"
                          [title]="g.member_count > 0 || g.document_count > 0 ? 'Nie można usunąć — ma przypisanych użytkowników lub dokumenty' : 'Usuń grupę'"
                          (click)="deleteGroup(g)">
                    🗑 Usuń
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
              <strong>Szablony zadań onboardingowych</strong> — zdefiniuj standardowe zadania dla każdego kroku procesu wdrożenia.
              Szablony są automatycznie podpowiadane podczas tworzenia zadań w panelu Onboarding.
              Format JSON: <code style="background:#fff;padding:1px 6px;border-radius:4px;font-size:11px">[ {{ '{' }}"id":"...", "title":"...", "type":"task|call|...", "step":0{{ '}' }} ]</code>
              Kroki: 0=Podpisanie umowy, 1=Konfiguracja, 2=Szkolenie, 3=Uruchomienie.
            </div>
          </div>

          @for (field of crmDictFields(); track field.key) {
            <div class="card" style="margin-bottom:16px;overflow:hidden">
              <div class="cat-header" style="padding:12px 20px;display:flex;align-items:center">
                <span class="cat-title" style="font-size:13px">{{ field.label }}</span>
                @if (field.dirty) { <span class="field-dirty" style="margin-left:8px">● Zmienione</span> }
                @if (field.updated_by_name) {
                  <span class="field-meta" style="margin-left:auto;font-size:11px;color:var(--gray-400)">
                    Zmienione przez {{ field.updated_by_name }} · {{ field.updated_at | date:'dd.MM.yyyy' }}
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
                          <th style="padding:8px 10px;text-align:left;font-weight:600">Wartość (kod)</th>
                          <th style="padding:8px 10px;text-align:left;font-weight:600">Etykieta (wyświetlana)</th>
                          <th style="padding:8px 10px;text-align:left;font-weight:600;width:160px"
                              title="Nazwa grupy lub puste — wartości z grupą wyświetlane w sekcji poniżej">Grupa</th>
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
                                     placeholder="— brak grupy —">
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
                    🔵 Niebieskie tło = wartość należy do grupy (wyświetlana w sekcji Marketingu w listach).
                  </div>
                  <button class="btn btn-g btn-sm" style="margin-top:8px"
                          (click)="addLeadSource(field)">+ Dodaj źródło</button>
                }

                @if (field.key === 'onboarding_task_templates') {
                  <div style="overflow-x:auto">
                    <table style="width:100%;border-collapse:collapse;font-size:12px">
                      <thead>
                        <tr style="background:var(--gray-50);border-bottom:2px solid var(--gray-200)">
                          <th style="padding:8px 10px;text-align:left;font-weight:600">Tytuł</th>
                          <th style="padding:8px 10px;text-align:left;font-weight:600;width:110px">Typ</th>
                          <th style="padding:8px 10px;text-align:left;font-weight:600;width:140px">Krok</th>
                          <th style="padding:8px 10px;text-align:center;font-weight:600;width:80px"
                              title="Czy zadanie tworzy się automatycznie przy migracji leada">Standardowe</th>
                          <th style="padding:8px 10px;text-align:left;font-weight:600;width:160px"
                              title="User automatycznie przypisany. Krok 0 zawsze → handlowiec leada">Przypisany</th>
                          <th style="padding:8px 10px;text-align:center;font-weight:600;width:70px"
                              title="Ile dni od daty migracji ustawić jako termin (null = brak terminu)">Dni</th>
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
                                <option value="task">✅ Zadanie</option>
                                <option value="call">📞 Telefon</option>
                                <option value="email">📧 Email</option>
                                <option value="meeting">🤝 Spotkanie</option>
                                <option value="doc_sent">📄 Dokument</option>
                                <option value="training">🎓 Szkolenie</option>
                              </select>
                            </td>
                            <td style="padding:6px 10px">
                              <select style="width:100%;border:1px solid var(--gray-200);border-radius:4px;padding:4px 6px;font-size:12px"
                                      [ngModel]="tpl.step"
                                      (ngModelChange)="updateTemplate(field, idx, 'step', +$event)">
                                <option [value]="0">📝 Podpisanie umowy</option>
                                <option [value]="1">⚙️ Konfiguracja</option>
                                <option [value]="2">🎓 Szkolenie</option>
                                <option [value]="3">🚀 Uruchomienie</option>
                              </select>
                            </td>
                            <td style="padding:6px 10px;text-align:center">
                              <input type="checkbox"
                                     [ngModel]="tpl.standard"
                                     (ngModelChange)="updateTemplate(field, idx, 'standard', $event)"
                                     title="Automatycznie tworzone przy migracji">
                            </td>
                            <td style="padding:6px 10px">
                              @if (tpl.step === 0) {
                                <span style="font-size:11px;color:#f97316;font-style:italic">← handlowiec leada</span>
                              } @else {
                                <select style="width:100%;border:1px solid var(--gray-200);border-radius:4px;padding:4px 6px;font-size:12px"
                                        [ngModel]="tpl.assignee"
                                        (ngModelChange)="updateTemplate(field, idx, 'assignee', $event || null)">
                                  <option [ngValue]="null">— brak —</option>
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
                    🟢 Zielone tło = zadanie standardowe (tworzone automatycznie przy migracji leada).
                    Krok "Podpisanie umowy" zawsze przypisuje się do handlowca leada.
                  </div>
                  <button class="btn btn-g btn-sm" style="margin-top:8px"
                          (click)="addTemplate(field)">+ Dodaj szablon</button>
                }

                @if (field.error) { <div class="field-err" style="margin-top:8px">{{ field.error }}</div> }
              </div>
            </div>
          }

          @if (crmDictFields().length === 0) {
            <div style="text-align:center;color:var(--gray-400);padding:40px;font-size:13px">
              Brak szablonów. Uruchom migrację 0133.
            </div>
          }
        }

        <!-- TAB: Podpowiedzi (Tooltips) -->
        @if (activeTab() === 'tooltips') {

          <div style="background:#EDE9FE;border:1px solid #C4B5FD;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#5B21B6;display:flex;gap:12px;align-items:flex-start">
            <span style="font-size:18px;flex-shrink:0">💬</span>
            <div>
              <strong>Podpowiedzi (Tooltips)</strong> — wybierz ekran i labelkę, wpisz tekst.
              Ikona <strong style="font-family:sans-serif;background:#e5e7eb;border-radius:50%;width:15px;height:15px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:800">?</strong>
              pojawi się automatycznie obok danej labelki gdy treść jest zdefiniowana.
            </div>
          </div>

          <!-- Formularz dodawania nowego -->
          <div class="card" style="padding:20px;margin-bottom:24px">
            <div class="cat-title" style="margin-bottom:16px">+ Dodaj podpowiedź</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
              <div>
                <label class="field-label" style="display:block;margin-bottom:4px">Ekran <span style="color:#ef4444">*</span></label>
                <select class="fsel" [(ngModel)]="newTipScreen" (ngModelChange)="onNewTipScreenChange()">
                  <option value="">— wybierz ekran —</option>
                  @for (s of catalogScreens; track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="field-label" style="display:block;margin-bottom:4px">Label <span style="color:#ef4444">*</span></label>
                <select class="fsel" [(ngModel)]="newTipLabelKey" [disabled]="!newTipScreen">
                  <option value="">— wybierz label —</option>
                  @for (e of catalogForScreen; track e.key) {
                    <option [value]="e.key" [disabled]="isAlreadyDefined(e.key)">
                      {{ e.label }}{{ isAlreadyDefined(e.key) ? ' ✓' : '' }}
                    </option>
                  }
                </select>
              </div>
            </div>
            <div style="margin-bottom:12px">
              <label class="field-label" style="display:block;margin-bottom:4px">Treść podpowiedzi <span style="color:#ef4444">*</span></label>
              <textarea class="fi" style="width:100%;box-sizing:border-box;resize:vertical;min-height:72px"
                        [(ngModel)]="newTipValue"
                        placeholder="Tekst który zobaczy użytkownik po najechaniu na ikonę ?."></textarea>
            </div>
            @if (tipError()) {
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px 12px;font-size:12px;color:#dc2626;margin-bottom:10px">⚠ {{ tipError() }}</div>
            }
            <button class="btn btn-p" style="padding:8px 20px"
                    [disabled]="tipSaving() || !newTipLabelKey || !newTipValue.trim()"
                    (click)="addTooltip()">
              {{ tipSaving() ? 'Zapisywanie…' : '+ Dodaj podpowiedź' }}
            </button>
          </div>

          <!-- Lista istniejących, pogrupowana po ekranach -->
          @if (tooltipFields().length === 0) {
            <div style="text-align:center;color:var(--gray-400);padding:40px;font-size:13px">
              Brak zdefiniowanych podpowiedzi. Dodaj pierwszą powyżej.
            </div>
          }

          @for (screen of catalogScreens; track screen) {
            @if (tooltipFieldsForScreen(screen).length > 0) {
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--gray-400);margin:20px 0 8px;padding-left:2px">
                {{ screen }}
              </div>
              @for (t of tooltipFieldsForScreen(screen); track t.key) {
                <div class="card" style="margin-bottom:10px;overflow:hidden">
                  <div class="cat-header" style="padding:10px 18px;display:flex;align-items:center;gap:10px">
                    <span class="cat-title" style="font-size:13px;font-weight:600">{{ catalogEntry(t.key)?.label }}</span>
                    <code style="font-size:10px;font-family:monospace;color:#a78bfa;background:#f3f0ff;padding:1px 6px;border-radius:4px">{{ t.key }}</code>
                    <span style="flex:1"></span>
                    @if (t.updated_by_name) {
                      <span class="field-meta">{{ t.updated_by_name }} · {{ t.updated_at | date:'dd.MM.yy HH:mm' }}</span>
                    }
                    <button style="background:#fee2e2;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;color:#991b1b;font-size:12px;flex-shrink:0"
                            (click)="deleteTooltip(t.key)">🗑 Usuń</button>
                  </div>
                  <div style="padding:14px 18px;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end">
                    <textarea class="fi" style="width:100%;box-sizing:border-box;resize:vertical;min-height:60px;font-size:13px"
                              [(ngModel)]="tipDrafts[t.key]"
                              (ngModelChange)="tipDirty[t.key] = true"></textarea>
                    <button class="btn btn-p" style="padding:7px 16px;font-size:12px;white-space:nowrap"
                            [disabled]="!tipDirty[t.key] || tipSaving()"
                            (click)="saveTooltip(t.key, tipDrafts[t.key])">
                      💾 Zapisz
                    </button>
                  </div>
                </div>
              }
            }
          }

          <!-- Klucze spoza katalogu (legacy / ręcznie dodane wcześniej) -->
          @if (uncategorizedTooltips().length > 0) {
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--gray-400);margin:20px 0 8px;padding-left:2px">
              Inne
            </div>
            @for (t of uncategorizedTooltips(); track t.key) {
              <div class="card" style="margin-bottom:10px;overflow:hidden">
                <div class="cat-header" style="padding:10px 18px;display:flex;align-items:center;gap:10px">
                  <code style="font-size:11px;font-family:monospace;color:#7c3aed;background:#f3f0ff;padding:2px 8px;border-radius:4px">{{ t.key }}</code>
                  <span class="cat-title" style="font-size:12px;color:var(--gray-600);font-weight:500">{{ t.label }}</span>
                  <span style="flex:1"></span>
                  @if (t.updated_by_name) {
                    <span class="field-meta">{{ t.updated_by_name }} · {{ t.updated_at | date:'dd.MM.yy HH:mm' }}</span>
                  }
                  <button style="background:#fee2e2;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;color:#991b1b;font-size:12px;flex-shrink:0"
                          (click)="deleteTooltip(t.key)">🗑 Usuń</button>
                </div>
                <div style="padding:14px 18px;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end">
                  <textarea class="fi" style="width:100%;box-sizing:border-box;resize:vertical;min-height:60px;font-size:13px"
                            [(ngModel)]="tipDrafts[t.key]"
                            (ngModelChange)="tipDirty[t.key] = true"></textarea>
                  <button class="btn btn-p" style="padding:7px 16px;font-size:12px;white-space:nowrap"
                          [disabled]="!tipDirty[t.key] || tipSaving()"
                          (click)="saveTooltip(t.key, tipDrafts[t.key])">
                    💾 Zapisz
                  </button>
                </div>
              </div>
            }
          }
        }

      </div>
    </div>
  `,
  styles: [`
    #topbar { height:60px;background:white;border-bottom:1px solid var(--gray-200);display:flex;align-items:center;gap:10px;padding:0 24px;flex-shrink:0; }
    .page-title { font-family:'Sora',sans-serif;font-size:17px;font-weight:700;color:var(--gray-900); }
    .tsp { flex:1; }
    #content { flex:1;overflow-y:auto;padding:24px; }
    .tabs { display:flex;gap:4px;margin-bottom:24px;border-bottom:2px solid var(--gray-200);padding-bottom:0; }
    .tab-btn { background:none;border:none;padding:10px 20px;font-size:13px;font-weight:600;color:var(--gray-500);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .15s; }
    .tab-btn.active { color:#f97316;border-bottom-color:#f97316; }
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
  `],
})
export class SettingsComponent implements OnInit {
  private settingsSvc = inject(AppSettingsService);
  private toast       = inject(ToastService);
  auth                = inject(AuthService);

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
        this.toast.success(`Grupa '${created.display_name}' została dodana`);
      },
      error: err => {
        this.groupError.set(err?.error?.error ?? 'Błąd dodawania grupy');
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
    if (!confirm(`Usunąć grupę "${g.display_name}"?`)) return;
    this.http.delete(`${environment.apiUrl}/admin/settings/groups/${g.id}`).subscribe({
      next: () => {
        this.groups.update(list => list.filter(x => x.id !== g.id));
        this.toast.success(`Grupa '${g.display_name}' usunięta`);
      },
      error: err => this.toast.error(err?.error?.error ?? 'Błąd usuwania grupy'),
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
      label: CATEGORY_LABELS[key]?.label ?? key,
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
  get catalogForScreen(): { key: string; screen: string; label: string }[] {
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

  catalogEntry(key: string): { screen: string; label: string } | undefined {
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
    if (!key)   { this.tipError.set('Wybierz ekran i label'); return; }
    if (!value) { this.tipError.set('Treść podpowiedzi jest wymagana'); return; }
    const entry = this.catalogEntry(key);
    const label = entry ? `${entry.screen} › ${entry.label}` : key;
    this.tipError.set('');
    this.tipSaving.set(true);
    this.http.post(`${environment.apiUrl}/admin/settings/tooltips`, { key, label, value }).subscribe({
      next: () => {
        this.newTipScreen = ''; this.newTipLabelKey = ''; this.newTipValue = '';
        this.tipSaving.set(false);
        this.toast.success(`Tooltip dodany`);
        this.settingsSvc.reload().then(() => this.buildFields(this.settingsSvc.meta()));
      },
      error: err => { this.tipError.set(err?.error?.error ?? 'Błąd zapisu'); this.tipSaving.set(false); },
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
        this.toast.success(`Tooltip "${key}" zapisany`);
        this.settingsSvc.reload().then(() => this.buildFields(this.settingsSvc.meta()));
      },
      error: err => { this.toast.error(err?.error?.error ?? 'Błąd zapisu'); this.tipSaving.set(false); },
    });
  }

  deleteTooltip(key: string): void {
    if (!confirm(`Usunąć tooltip "${key}"?`)) return;
    this.http.delete(`${environment.apiUrl}/admin/settings/tooltips/${encodeURIComponent(key)}`).subscribe({
      next: () => {
        this.toast.success(`Tooltip "${key}" usunięty`);
        this.settingsSvc.reload().then(() => this.buildFields(this.settingsSvc.meta()));
      },
      error: err => this.toast.error(err?.error?.error ?? 'Błąd usuwania'),
    });
  }

  onFieldChange(field: SettingField): void {
    field.dirty = true;
    field.error = '';
    if (field.value_type === 'number') {
      const n = Number(field.draft);
      if (isNaN(n) || n < 0) field.error = 'Musi być liczbą nieujemną';
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
        (this.jsonItemLabel(field.key, a)).localeCompare(this.jsonItemLabel(field.key, b), 'pl')
      );
    }
    return items;
  }

  jsonItemLabel(key: string, item: string): string {
    return JSON_ITEM_LABELS[key]?.[item] ?? item;
  }

  addJsonItem(field: SettingField): void {
    const val = (this.jsonNewItem[field.key] || '').trim();
    if (!val) return;
    const items = this.jsonItems(field);
    if (items.includes(val)) { field.error = 'Wartość już istnieje'; this.fields.update(fs => [...fs]); return; }
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
        this.toast.success(`${dirtyFields.length} ustawień zapisanych`);
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err?.error?.error ?? 'Błąd zapisu ustawień');
      },
    });
  }
}
