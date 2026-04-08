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
type Tab = 'global' | 'crm' | 'documents' | 'users';

// Kategorie globalnej aplikacji
const GLOBAL_CATEGORIES = ['documents', 'workflow', 'general'];
// Klucze słownikowe dokumentów - pokazywane tylko w zakładce 'Słowniki dokumentów'
const DOC_DICT_KEYS = ['doc_types', 'doc_statuses', 'doc_gdpr_types', 'doc_entity1_options'];

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
                    <input class="fi" style="flex:1" placeholder="Nowa wartość (kod, np. hotel)"
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

  crmFields = computed(() => this.fields().filter(f => f.category === 'crm'));
  docFields  = computed(() => this.fields().filter(f => DOC_DICT_KEYS.includes(f.key)));

  ngOnInit(): void {
    this.settingsSvc.reload().then(() => {
      this.buildFields(this.settingsSvc.meta());
      this.loading.set(false);
    });
  }

  private buildFields(meta: AppSettingsMeta[]): void {
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
    // init jsonNewItem map
    this.jsonNewItem = {};
    for (const m of meta) if (m.value_type === 'json') this.jsonNewItem[m.key] = '';
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
