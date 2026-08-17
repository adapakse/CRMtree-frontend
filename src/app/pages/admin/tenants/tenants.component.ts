import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Tenant, TenantFeature, CrmFeature, BillingPlan, BillingCycle, TenantSubscription, TenantBillingDetails } from '../../../core/models/models';
import { environment } from '../../../../environments/environment';

const API = environment.apiUrl;
// Meta calls this URL directly — it must be internet-reachable, so in local
// dev (apiUrl is an absolute http://localhost:... URL) it only works behind
// a tunnel (e.g. ngrok); shown as-is regardless, since the super admin pastes
// it into the tenant's Meta app and knows their own setup.
const WHATSAPP_WEBHOOK_URL = (API.startsWith('http') ? API : window.location.origin + API) + '/crm/whatsapp/webhook';

const FEATURE_LABELS: Record<CrmFeature, string> = {
  documents:        'Dokumenty',
  leads:            'Leady',
  sales_reports:    'Raporty sprzedaży',
  onboarding:       'Onboarding',
  partner_registry: 'Rejestr Partnerów',
  dwh_integration:  'DWH Integration',
  performance:      'Performance',
  seo_bot:          'SEObot',
  whatsapp:         'WhatsApp',
  prospects:        'Prospekty',
};

const ALL_FEATURES: CrmFeature[] = [
  'documents', 'leads', 'sales_reports', 'onboarding',
  'partner_registry', 'dwh_integration', 'performance', 'seo_bot', 'whatsapp', 'prospects',
];

interface TenantUser {
  id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
  is_active: boolean;
  crm_role?: string | null;
  last_login_at?: string | null;
}

type EmailProviderKey = 'gmail' | 'outlook' | 'zoho';

interface EmailProvider {
  id: string;
  provider: EmailProviderKey;
  client_id: string;
  redirect_uri: string | null;
  extra_config: Record<string, string>;
  is_enabled: boolean;
  client_secret_configured: boolean;
  updated_at: string;
}

interface GmailForm {
  client_id: string; client_secret: string; redirect_uri: string;
  pubsub_topic: string; pubsub_subscription: string;
}
interface OutlookForm {
  client_id: string; client_secret: string; azure_tenant_id: string;
  redirect_uri: string;
}
interface ZohoForm {
  client_id: string; client_secret: string;
  redirect_uri: string;
}

// One shared company WhatsApp Business number per tenant, configured here by
// a super admin — never per-user. webhook_verify_token is only ever present
// once configured (the CRM generates it on first save).
// display_phone_number/verified_name/code_verification_status are always
// fetched from Meta server-side on save — never editable, never sent by
// this form — see whatsappService.upsertTenantConfig on the backend.
interface WhatsappConfig {
  configured: boolean;
  id?: string;
  waba_id?: string;
  phone_number_id?: string;
  display_phone_number?: string | null;
  verified_name?: string | null;
  code_verification_status?: string | null;
  is_enabled?: boolean;
  access_token_configured?: boolean;
  app_secret_configured?: boolean;
  webhook_verify_token?: string;
  updated_at?: string;
}

interface WhatsappConfigForm {
  waba_id: string; phone_number_id: string;
  access_token: string; app_secret: string; is_enabled: boolean;
}

type EditTab = 'settings' | 'features' | 'plan' | 'billing' | 'users' | 'email' | 'whatsapp';

interface PlanChangeConfirmData {
  tenantId: string;
  tenantName: string;
  before: { planName: string; cycle: string; price: string | null };
  after: { planName: string; cycle: string; price: string | null };
}

const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = { monthly: 'Miesięczny', annual: 'Roczny' };

// Display order on the pricing page — not alphabetical (API returns plans ordered by code).
const PLAN_DISPLAY_ORDER: Record<string, number> = { lite: 0, standard: 1, professional: 2 };

@Component({
  selector: 'app-tenants',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">

      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Zarządzanie tenantami</h1>
          <p class="page-sub">{{ tenants().length }} tenant{{ tenants().length !== 1 ? 'y' : '' }}</p>
        </div>
        <button class="btn-primary" (click)="openCreate()">+ Nowy tenant</button>
      </div>

      <!-- Table -->
      @if (loading()) {
        <div class="state-msg">Ładowanie...</div>
      } @else if (tenants().length === 0) {
        <div class="state-msg">Brak tenantów.</div>
      } @else {
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Slug</th>
                <th>Domena</th>
                <th>Status</th>
                <th>Użytkownicy</th>
                <th>Moduły</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (t of tenants(); track t.id) {
                <tr [class.expanded]="expandedId() === t.id">
                  <td><span class="tenant-name">{{ t.name }}</span></td>
                  <td><code class="slug">{{ t.slug }}</code></td>
                  <td class="td-muted">{{ t.email_domain || '—' }}</td>
                  <td>
                    <span class="badge" [class.badge-on]="t.is_active" [class.badge-off]="!t.is_active">
                      {{ t.is_active ? 'Aktywny' : 'Nieaktywny' }}
                    </span>
                  </td>
                  <td class="td-muted">{{ t.user_count ?? 0 }} / {{ t.total_users ?? 0 }}</td>
                  <td>
                    <div class="feat-pills">
                      @for (f of enabledFeatures(t); track f) {
                        <span class="pill">{{ featureLabel(f) }}</span>
                      }
                      @if (enabledFeatures(t).length === 0) {
                        <span class="td-muted">brak</span>
                      }
                    </div>
                  </td>
                  <td>
                    <div class="td-actions">
                      <button class="btn-icon" (click)="toggleExpand(t)" title="Edytuj / Użytkownicy">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                             [style.transform]="expandedId() === t.id ? 'rotate(180deg)' : 'rotate(0)'">
                          <polyline points="6,9 12,15 18,9"/>
                        </svg>
                      </button>
                      <button class="btn-icon btn-imp" (click)="impersonate(t)" title="Impersonuj admina">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                          <polyline points="10,17 15,12 10,7"/>
                          <line x1="15" y1="12" x2="3" y2="12"/>
                        </svg>
                      </button>
                      <button class="btn-icon btn-danger-icon" (click)="openDeleteTenant(t); $event.stopPropagation()" title="Usuń tenant">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="3,6 5,6 21,6"/>
                          <path d="M19,6v14a2,2 0 0 1-2,2H7a2,2 0 0 1-2-2V6m3,0V4a2,2 0 0 1 2,-2h4a2,2 0 0 1 2,2v2"/>
                          <line x1="10" y1="11" x2="10" y2="17"/>
                          <line x1="14" y1="11" x2="14" y2="17"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>

                <!-- Expanded panel -->
                @if (expandedId() === t.id) {
                  <tr class="edit-row">
                    <td colspan="7">
                      <div class="edit-panel">

                        <!-- Tabs -->
                        <div class="tabs">
                          <button class="tab" [class.active]="editTab() === 'settings'" (click)="editTab.set('settings')">Ustawienia</button>
                          <button class="tab" [class.active]="editTab() === 'features'"  (click)="editTab.set('features')">Moduły</button>
                          <button class="tab" [class.active]="editTab() === 'plan'" (click)="openPlanTab(t)">Plan</button>
                          <button class="tab" [class.active]="editTab() === 'billing'" (click)="openBillingDetailsTab(t)">Dane rozliczeniowe</button>
                          <button class="tab" [class.active]="editTab() === 'users'"  (click)="openUsersTab(t.id)">
                            Użytkownicy
                            @if (tenantUsers().length > 0) { <span class="tab-badge">{{ tenantUsers().length }}</span> }
                          </button>
                          <button class="tab" [class.active]="editTab() === 'email'" (click)="openEmailTab(t.id)">Email</button>
                          <button class="tab" [class.active]="editTab() === 'whatsapp'" (click)="openWhatsappTab(t.id)">WhatsApp</button>
                        </div>

                        <!-- Tab: Settings -->
                        @if (editTab() === 'settings') {
                          <div class="tab-body">
                            <div class="edit-grid">
                              <div class="field">
                                <label>Nazwa</label>
                                <input [(ngModel)]="editDraft.name" placeholder="Nazwa tenanta">
                              </div>
                              <div class="field">
                                <label>Domena email</label>
                                <input [(ngModel)]="editDraft.email_domain" placeholder="acmecorp.com">
                              </div>
                              <div class="field">
                                <label>DWH prefix</label>
                                <input [(ngModel)]="editDraft.dwh_schema_prefix" placeholder="acme">
                              </div>
                              <div class="field field-check">
                                <label class="check-label">
                                  <input type="checkbox" [(ngModel)]="editDraft.is_active">
                                  Aktywny
                                </label>
                              </div>
                            </div>
                            <div class="reinit-box">
                              <div class="reinit-desc">
                                <strong>Tryb szkoleniowy</strong>
                                <span>Gdy włączony, ten tenant widzi symulowaną wysyłkę maili i połączeń zamiast realnego Outlook/Gmail/Zoho. Dotyczy wyłącznie tego tenanta.</span>
                              </div>
                              <label class="check-label">
                                <input type="checkbox" [checked]="trainingMode()" [disabled]="saving()"
                                       (change)="setTrainingMode(t.id, !trainingMode())">
                                Włączony
                              </label>
                            </div>
                            <div class="reinit-box">
                              <div class="reinit-desc">
                                <strong>Inicjalizacja z Gold</strong>
                                <span>Kopiuje app_settings, group_profiles i feature flags z tenanta crmtree-gold. Istniejące ustawienia są nadpisywane.</span>
                              </div>
                              <button class="btn-reinit" [disabled]="saving()" (click)="reinit(t.id)">
                                {{ saving() ? 'Kopiuję...' : '↺ Reinit z Gold' }}
                              </button>
                            </div>
                            <div class="panel-footer">
                              <button class="btn-secondary" (click)="cancelEdit()">Anuluj</button>
                              <button class="btn-primary" [disabled]="saving()" (click)="saveSettings(t.id)">
                                {{ saving() ? 'Zapisuję...' : 'Zapisz' }}
                              </button>
                            </div>
                          </div>
                        }

                        <!-- Tab: Features -->
                        @if (editTab() === 'features') {
                          <div class="tab-body">
                            <div class="feat-grid">
                              @for (f of ALL_FEATURES; track f) {
                                <label class="feat-toggle" [class.on]="editDraft.features[f]">
                                  <input type="checkbox" [(ngModel)]="editDraft.features[f]">
                                  <span>{{ featureLabel(f) }}</span>
                                </label>
                              }
                            </div>
                            <div class="panel-footer">
                              <button class="btn-secondary" (click)="cancelEdit()">Anuluj</button>
                              <button class="btn-primary" [disabled]="saving()" (click)="saveFeatures(t.id)">
                                {{ saving() ? 'Zapisuję...' : 'Zapisz moduły' }}
                              </button>
                            </div>
                          </div>
                        }

                        <!-- Tab: Plan -->
                        @if (editTab() === 'plan') {
                          <div class="tab-body">
                            @if (billingPlansLoading()) {
                              <div class="state-msg">Ładowanie...</div>
                            } @else {
                              <div class="edit-grid">
                                <div class="field">
                                  <label>Plan</label>
                                  <select [(ngModel)]="subscriptionDraft.planId">
                                    @for (p of billingPlans(); track p.id) {
                                      <option [value]="p.id">{{ p.name }}</option>
                                    }
                                  </select>
                                </div>
                                <div class="field">
                                  <label>Cykl rozliczeniowy</label>
                                  <select [(ngModel)]="subscriptionDraft.billingCycle" (ngModelChange)="onBillingCycleChange()">
                                    <option value="monthly">Miesięczny</option>
                                    <option value="annual">Roczny</option>
                                  </select>
                                </div>
                                <div class="field">
                                  <label>{{ selectedPlanIsCustomPricing() ? 'Kwota za okres rozliczeniowy (EUR)' : 'Cena za użytkownika (EUR)' }}</label>
                                  <input type="number" min="0.01" step="0.01"
                                    [placeholder]="selectedPlanIsCustomPricing() ? 'np. 5000.00' : 'np. 26.00'"
                                    [(ngModel)]="subscriptionDraft.customPriceEur">
                                </div>
                              </div>
                              @if (selectedPlanIsCustomPricing()) {
                                <div class="state-msg">Plan Professional wymaga indywidualnej kwoty — batch wygeneruje fakturę na tę kwotę zgodnie z wybranym cyklem (nie jest mnożona przez liczbę użytkowników).</div>
                              } @else {
                                <div class="state-msg">Zostaw puste, żeby rozliczać wg standardowej ceny z cennika. Wpisana kwota nadpisuje cenę za użytkownika (np. przy wynegocjowanym rabacie, 29 → 26 EUR) — nadal mnożona przez liczbę aktywnych userów w okresie, w przeciwieństwie do ryczałtu w Professional.</div>
                              }
                              @if (t.subscription) {
                                <div class="td-muted">
                                  Obecny plan: {{ t.subscription.plan_name }} · {{ billingCycleLabel(t.subscription.billing_cycle) }}
                                  @if (t.subscription.custom_price_eur) {
                                    · {{ t.subscription.custom_price_eur }} EUR{{ t.subscription.plan_code === 'professional' ? '' : '/user' }}
                                  }
                                  @if (t.subscription.plan_started_at) {
                                    · od {{ t.subscription.plan_started_at | date:'dd.MM.yyyy' }}
                                  }
                                </div>
                              } @else {
                                <div class="td-muted">Ten tenant nie ma przypisanego planu.</div>
                              }
                              @if (t.subscription?.cancelled_at) {
                                <div class="billing-hint billing-hint-warn">
                                  <span>
                                    Subskrypcja zakończona {{ t.subscription!.cancelled_at | date:'dd.MM.yyyy HH:mm' }} —
                                    bieżący okres rozliczeniowy zostanie jeszcze zafakturowany w całości (bez proracji),
                                    kolejne już nie.
                                  </span>
                                  <button class="btn-secondary" [disabled]="saving()" (click)="reactivateSubscription(t)">Cofnij rezygnację</button>
                                </div>
                              } @else if (t.subscription) {
                                <div class="billing-hint">
                                  <button class="btn-secondary" [disabled]="saving()" (click)="cancelSubscription(t)">Zakończ subskrypcję</button>
                                </div>
                              }
                              @if (t.subscription) {
                                @if (isBillingDetailsComplete(t)) {
                                  <div class="billing-hint billing-hint-ok">
                                    <span>✓ Dane rozliczeniowe: kompletne</span>
                                    <button class="btn-secondary" (click)="openBillingDetailsTab(t)">Edytuj dane rozliczeniowe →</button>
                                  </div>
                                } @else {
                                  <div class="billing-hint billing-hint-warn">
                                    <span>Ten tenant nie ma jeszcze kompletnych danych rozliczeniowych. Uzupełnij je w zakładce Dane rozliczeniowe.</span>
                                    <button class="btn-secondary" (click)="openBillingDetailsTab(t)">Uzupełnij dane rozliczeniowe →</button>
                                  </div>
                                }
                              }
                              <div class="panel-footer">
                                <button class="btn-secondary" [disabled]="isPlanDraftUnchanged(t)" (click)="cancelPlanEdit(t)">Anuluj</button>
                                <button class="btn-primary"
                                  [disabled]="saving() || !subscriptionDraft.planId || (selectedPlanIsCustomPricing() && !subscriptionDraft.customPriceEur)"
                                  (click)="openPlanChangeConfirm(t)">
                                  {{ saving() ? 'Zapisuję...' : 'Zapisz plan' }}
                                </button>
                              </div>
                            }
                          </div>
                        }

                        <!-- Tab: Billing details -->
                        @if (editTab() === 'billing') {
                          <div class="tab-body">
                            @if (billingDetailsLoading()) {
                              <div class="state-msg">Ładowanie...</div>
                            } @else {
                              <div class="state-msg">
                                Dane prawne nabywcy na fakturach tego tenanta — niezależne od nazwy w CRM
                                ({{ t.name }}), którą widzą jego użytkownicy.
                              </div>
                              <div class="edit-grid">
                                <div class="field">
                                  <label>Nazwa firmy (do faktury)</label>
                                  <input [(ngModel)]="billingDetailsDraft.company_name" placeholder="np. Acme Sp. z o.o.">
                                </div>
                                <div class="field">
                                  <label>NIP</label>
                                  <input [(ngModel)]="billingDetailsDraft.nip" placeholder="np. 1234567890">
                                </div>
                                <div class="field">
                                  <label>Ulica i numer</label>
                                  <input [(ngModel)]="billingDetailsDraft.street" placeholder="ul. Przykładowa 1">
                                </div>
                                <div class="field">
                                  <label>Kod pocztowy</label>
                                  <input [(ngModel)]="billingDetailsDraft.postal_code" placeholder="00-001">
                                </div>
                                <div class="field">
                                  <label>Miasto</label>
                                  <input [(ngModel)]="billingDetailsDraft.city" placeholder="Warszawa">
                                </div>
                                <div class="field">
                                  <label>Kraj</label>
                                  <input [(ngModel)]="billingDetailsDraft.country" placeholder="Polska">
                                </div>
                                <div class="field">
                                  <label>E-mail do faktur</label>
                                  <input type="email" [(ngModel)]="billingDetailsDraft.invoice_email" placeholder="ksiegowosc@klient.pl">
                                </div>
                              </div>
                              <div class="panel-footer">
                                <button class="btn-secondary" [disabled]="isBillingDetailsDraftUnchanged(t)" (click)="cancelBillingDetailsEdit(t)">Anuluj</button>
                                @if (t.billing_details) {
                                  <button class="btn-danger" [disabled]="saving()" (click)="openDeleteBillingDetails(t)">Usuń dane rozliczeniowe</button>
                                }
                                <button class="btn-primary" [disabled]="saving()" (click)="saveBillingDetails(t.id)">
                                  {{ saving() ? 'Zapisuję...' : 'Zapisz dane rozliczeniowe' }}
                                </button>
                              </div>
                            }
                          </div>
                        }

                        <!-- Tab: Email -->
                        @if (editTab() === 'email') {
                          <div class="tab-body">
                            @if (emailLoading()) {
                              <div class="state-msg">Ładowanie...</div>
                            } @else {

                              <div class="email-tab-toolbar">
                                <span class="email-tab-toolbar-label">Aktywny dostawca:</span>
                                <label class="radio-option">
                                  <input type="radio" name="active-provider-{{t.id}}" [checked]="!activeProvider()"
                                         (change)="setActiveProvider(t.id, null)">
                                  Brak konfiguracji
                                </label>
                              </div>

                              <!-- Gmail -->
                              <div class="provider-card">
                                <div class="provider-header">
                                  <div class="provider-title">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,14 22,4"/></svg>
                                    <span>Gmail / Google Workspace</span>
                                  </div>
                                  <div class="provider-header-right">
                                    @if (gmailProvider()) {
                                      <span class="badge badge-on">Skonfigurowany</span>
                                    } @else {
                                      <span class="badge badge-off">Nieskonfigurowany</span>
                                    }
                                    <label class="radio-option" [class.disabled]="!gmailProvider()">
                                      <input type="radio" name="active-provider-{{t.id}}" [checked]="activeProvider() === 'gmail'"
                                             [disabled]="!gmailProvider()" (change)="setActiveProvider(t.id, 'gmail')">
                                      Używaj tego providera
                                    </label>
                                  </div>
                                </div>
                                @if (gmailProvider()) {
                                  <div class="provider-meta">
                                    Client ID: <code>{{ gmailProvider()!.client_id }}</code>
                                    · zaktualizowany {{ gmailProvider()!.updated_at | date:'dd.MM.yyyy' }}
                                  </div>
                                }
                                <div class="provider-form">
                                  <div class="edit-grid">
                                    <div class="field">
                                      <label>Client ID <span class="req">*</span></label>
                                      <input [(ngModel)]="gmailForm.client_id" placeholder="123456789.apps.googleusercontent.com">
                                    </div>
                                    <div class="field">
                                      <label>Client Secret {{ gmailProvider() ? '(zostaw puste = bez zmian)' : '' }} <span class="req">*</span></label>
                                      <input [(ngModel)]="gmailForm.client_secret" type="password" placeholder="{{ gmailProvider() ? '••••••••' : 'GOCSPX-...' }}">
                                    </div>
                                    <div class="field">
                                      <label>Redirect URI <span class="req">*</span></label>
                                      <input [(ngModel)]="gmailForm.redirect_uri" placeholder="https://app.example.com/api/crm/gmail/oauth/callback">
                                    </div>
                                    <div class="field">
                                      <label>Pub/Sub Topic <span class="req">*</span></label>
                                      <input [(ngModel)]="gmailForm.pubsub_topic" placeholder="projects/my-project/topics/gmail-push">
                                    </div>
                                    <div class="field">
                                      <label>Pub/Sub Subscription <span class="hint-inline">(opcjonalne — obecnie nieużywane)</span></label>
                                      <input [(ngModel)]="gmailForm.pubsub_subscription" placeholder="projects/my-project/subscriptions/gmail-sub">
                                    </div>
                                  </div>
                                  <div class="provider-actions">
                                    @if (gmailProvider()) {
                                      <button class="btn-danger-sm" [disabled]="saving()" (click)="deleteEmailProvider(t.id, 'gmail')">Usuń</button>
                                    }
                                    <button class="btn-primary" [disabled]="saving() || !gmailForm.client_id || (!gmailForm.client_secret && !gmailProvider()) || !gmailForm.redirect_uri || !gmailForm.pubsub_topic"
                                            (click)="saveEmailProvider(t.id, 'gmail')">
                                      {{ saving() ? 'Zapisuję...' : (gmailProvider() ? 'Aktualizuj' : 'Zapisz') }}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <!-- Outlook -->
                              <div class="provider-card">
                                <div class="provider-header">
                                  <div class="provider-title">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,14 22,4"/></svg>
                                    <span>Outlook / Microsoft 365</span>
                                  </div>
                                  <div class="provider-header-right">
                                    @if (outlookProvider()) {
                                      <span class="badge badge-on">Skonfigurowany</span>
                                    } @else {
                                      <span class="badge badge-off">Nieskonfigurowany</span>
                                    }
                                    <label class="radio-option" [class.disabled]="!outlookProvider()">
                                      <input type="radio" name="active-provider-{{t.id}}" [checked]="activeProvider() === 'outlook'"
                                             [disabled]="!outlookProvider()" (change)="setActiveProvider(t.id, 'outlook')">
                                      Używaj tego providera
                                    </label>
                                  </div>
                                </div>
                                @if (outlookProvider()) {
                                  <div class="provider-meta">
                                    Client ID: <code>{{ outlookProvider()!.client_id }}</code>
                                    · zaktualizowany {{ outlookProvider()!.updated_at | date:'dd.MM.yyyy' }}
                                  </div>
                                }
                                <div class="provider-form">
                                  <div class="edit-grid">
                                    <div class="field">
                                      <label>Client ID <span class="req">*</span></label>
                                      <input [(ngModel)]="outlookForm.client_id" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
                                    </div>
                                    <div class="field">
                                      <label>Client Secret {{ outlookProvider() ? '(zostaw puste = bez zmian)' : '' }} <span class="req">*</span></label>
                                      <input [(ngModel)]="outlookForm.client_secret" type="password" placeholder="{{ outlookProvider() ? '••••••••' : 'secret~...' }}">
                                    </div>
                                    <div class="field">
                                      <label>Azure Tenant ID <span class="req">*</span></label>
                                      <input [(ngModel)]="outlookForm.azure_tenant_id" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
                                    </div>
                                    <div class="field">
                                      <label>Redirect URI <span class="req">*</span></label>
                                      <input [(ngModel)]="outlookForm.redirect_uri" placeholder="https://app.example.com/api/crm/outlook/oauth/callback">
                                    </div>
                                  </div>
                                  <div class="provider-actions">
                                    @if (outlookProvider()) {
                                      <button class="btn-danger-sm" [disabled]="saving()" (click)="deleteEmailProvider(t.id, 'outlook')">Usuń</button>
                                    }
                                    <button class="btn-primary" [disabled]="saving() || !outlookForm.client_id || (!outlookForm.client_secret && !outlookProvider()) || !outlookForm.azure_tenant_id || !outlookForm.redirect_uri"
                                            (click)="saveEmailProvider(t.id, 'outlook')">
                                      {{ saving() ? 'Zapisuję...' : (outlookProvider() ? 'Aktualizuj' : 'Zapisz') }}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <!-- Zoho -->
                              <div class="provider-card">
                                <div class="provider-header">
                                  <div class="provider-title">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,14 22,4"/></svg>
                                    <span>Zoho Mail</span>
                                  </div>
                                  <div class="provider-header-right">
                                    @if (zohoProvider()) {
                                      <span class="badge badge-on">Skonfigurowany</span>
                                    } @else {
                                      <span class="badge badge-off">Nieskonfigurowany</span>
                                    }
                                    <label class="radio-option" [class.disabled]="!zohoProvider()">
                                      <input type="radio" name="active-provider-{{t.id}}" [checked]="activeProvider() === 'zoho'"
                                             [disabled]="!zohoProvider()" (change)="setActiveProvider(t.id, 'zoho')">
                                      Używaj tego providera
                                    </label>
                                  </div>
                                </div>
                                @if (zohoProvider()) {
                                  <div class="provider-meta">
                                    Client ID: <code>{{ zohoProvider()!.client_id }}</code>
                                    · zaktualizowany {{ zohoProvider()!.updated_at | date:'dd.MM.yyyy' }}
                                  </div>
                                }
                                <div class="provider-form">
                                  <div class="edit-grid">
                                    <div class="field">
                                      <label>Client ID <span class="req">*</span></label>
                                      <input [(ngModel)]="zohoForm.client_id" placeholder="1000.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX">
                                    </div>
                                    <div class="field">
                                      <label>Client Secret {{ zohoProvider() ? '(zostaw puste = bez zmian)' : '' }} <span class="req">*</span></label>
                                      <input [(ngModel)]="zohoForm.client_secret" type="password" placeholder="{{ zohoProvider() ? '••••••••' : 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }}">
                                    </div>
                                    <div class="field">
                                      <label>Redirect URI <span class="hint-inline">(opcjonalne — nadpisuje domyślne)</span></label>
                                      <input [(ngModel)]="zohoForm.redirect_uri" placeholder="https://app.example.com/api/crm/zoho/oauth/callback">
                                    </div>
                                  </div>
                                  <div class="provider-actions">
                                    @if (zohoProvider()) {
                                      <button class="btn-danger-sm" [disabled]="saving()" (click)="deleteEmailProvider(t.id, 'zoho')">Usuń</button>
                                    }
                                    <button class="btn-primary" [disabled]="saving() || !zohoForm.client_id || (!zohoForm.client_secret && !zohoProvider())"
                                            (click)="saveEmailProvider(t.id, 'zoho')">
                                      {{ saving() ? 'Zapisuję...' : (zohoProvider() ? 'Aktualizuj' : 'Zapisz') }}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <div class="panel-footer">
                                <button class="btn-secondary" (click)="cancelEdit()">Zamknij</button>
                              </div>
                            }
                          </div>
                        }

                        <!-- Tab: WhatsApp (one shared company number per tenant, configured here) -->
                        @if (editTab() === 'whatsapp') {
                          <div class="tab-body">
                            @if (whatsappLoading()) {
                              <div class="state-msg">Ładowanie...</div>
                            } @else {

                              <div class="provider-card">
                                <div class="provider-header">
                                  <div class="provider-title">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                                    <span>WhatsApp Business</span>
                                  </div>
                                  <div class="provider-header-right">
                                    @if (whatsappConfig()?.configured) {
                                      <span class="badge badge-on">Skonfigurowany</span>
                                    } @else {
                                      <span class="badge badge-off">Nieskonfigurowany</span>
                                    }
                                  </div>
                                </div>
                                @if (whatsappConfig()?.configured) {
                                  <div class="provider-meta">
                                    Numer: <strong>{{ whatsappConfig()!.display_phone_number }}</strong>
                                    @if (whatsappConfig()!.verified_name) { · {{ whatsappConfig()!.verified_name }} }
                                    @if (whatsappConfig()!.code_verification_status === 'VERIFIED') {
                                      <span class="badge badge-on">VERIFIED</span>
                                    } @else {
                                      <span class="badge badge-off">{{ whatsappConfig()!.code_verification_status || 'NIEZWERYFIKOWANY' }}</span>
                                    }
                                    <br>Phone Number ID: <code>{{ whatsappConfig()!.phone_number_id }}</code>
                                    · zaktualizowany {{ whatsappConfig()!.updated_at | date:'dd.MM.yyyy' }}
                                    <div class="hint-inline" style="margin-top:4px">
                                      Numer, nazwa i status weryfikacji pochodzą bezpośrednio z Meta (pobierane przy każdym zapisie) — nie da się ich wpisać ręcznie.
                                    </div>
                                  </div>
                                }
                                <div class="provider-form">
                                  <div class="edit-grid">
                                    <div class="field">
                                      <label>WABA ID <span class="req">*</span></label>
                                      <input [(ngModel)]="whatsappForm.waba_id" placeholder="123456789012345">
                                    </div>
                                    <div class="field">
                                      <label>Phone Number ID <span class="req">*</span></label>
                                      <input [(ngModel)]="whatsappForm.phone_number_id" placeholder="987654321098765">
                                    </div>
                                    <div class="field">
                                      <label>Access Token {{ whatsappConfig()?.access_token_configured ? '(zostaw puste = bez zmian)' : '' }} <span class="req">*</span></label>
                                      <input [(ngModel)]="whatsappForm.access_token" type="password"
                                             placeholder="{{ whatsappConfig()?.access_token_configured ? '••••••••' : 'EAAG...' }}">
                                    </div>
                                    <div class="field">
                                      <label>App Secret <span class="hint-inline">{{ whatsappConfig()?.app_secret_configured ? '(zostaw puste = bez zmian)' : '(opcjonalne, wymagane do weryfikacji webhooka)' }}</span></label>
                                      <input [(ngModel)]="whatsappForm.app_secret" type="password"
                                             placeholder="{{ whatsappConfig()?.app_secret_configured ? '••••••••' : '' }}">
                                    </div>
                                    <div class="field">
                                      <label class="radio-option">
                                        <input type="checkbox" [(ngModel)]="whatsappForm.is_enabled"> Aktywny
                                      </label>
                                    </div>
                                  </div>

                                  @if (whatsappConfig()?.configured) {
                                    <div class="provider-meta" style="margin-top:12px">
                                      <strong>Konfiguracja webhooka w Meta App</strong><br>
                                      Callback URL: <code>{{ whatsappWebhookUrl }}</code><br>
                                      Verify token:
                                      @if (whatsappShowVerifyToken()) {
                                        <code>{{ whatsappConfig()!.webhook_verify_token }}</code>
                                        <button class="btn-secondary" style="padding:2px 8px;font-size:11px" (click)="copyWhatsappVerifyToken()">Kopiuj</button>
                                      } @else {
                                        <code>••••••••••••••••</code>
                                      }
                                      <button class="btn-secondary" style="padding:2px 8px;font-size:11px" (click)="whatsappShowVerifyToken.set(!whatsappShowVerifyToken())">
                                        {{ whatsappShowVerifyToken() ? 'Ukryj' : 'Pokaż' }}
                                      </button>
                                    </div>
                                  }

                                  <div class="provider-actions">
                                    @if (whatsappConfig()?.configured) {
                                      <button class="btn-danger-sm" [disabled]="saving()" (click)="deleteWhatsappConfig(t.id)">Usuń</button>
                                    }
                                    <button class="btn-primary" [disabled]="saving() || !whatsappForm.waba_id || !whatsappForm.phone_number_id || (!whatsappForm.access_token && !whatsappConfig()?.access_token_configured)"
                                            (click)="saveWhatsappConfig(t.id)">
                                      {{ saving() ? 'Zapisuję...' : (whatsappConfig()?.configured ? 'Aktualizuj' : 'Zapisz') }}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <div class="panel-footer">
                                <button class="btn-secondary" (click)="cancelEdit()">Zamknij</button>
                              </div>
                            }
                          </div>
                        }

                        <!-- Tab: Users -->
                        @if (editTab() === 'users') {
                          <div class="tab-body">
                            @if (usersLoading()) {
                              <div class="state-msg">Ładowanie użytkowników...</div>
                            } @else if (tenantUsers().length === 0) {
                              <div class="empty-users">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                  <circle cx="12" cy="7" r="4"/>
                                </svg>
                                <p>Brak użytkowników w tym tenancie.</p>
                                <p class="hint">Utwórz pierwszego admina, żeby móc się zalogować.</p>
                              </div>
                            } @else {
                              <table class="users-table">
                                <thead>
                                  <tr>
                                    <th>Email</th>
                                    <th>Nazwa</th>
                                    <th>Rola</th>
                                    <th>Status</th>
                                    <th>Ostatnie logowanie</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  @for (u of tenantUsers(); track u.id) {
                                    <tr>
                                      <td>{{ u.email }}</td>
                                      <td>{{ u.display_name }}</td>
                                      <td>
                                        @if (u.is_admin) { <span class="badge badge-admin">Admin</span> }
                                        @else if (u.crm_role) { <span class="td-muted">{{ u.crm_role }}</span> }
                                        @else { <span class="td-muted">—</span> }
                                      </td>
                                      <td>
                                        <span class="badge" [class.badge-on]="u.is_active" [class.badge-off]="!u.is_active">
                                          {{ u.is_active ? 'Aktywny' : 'Nieaktywny' }}
                                        </span>
                                      </td>
                                      <td class="td-muted">{{ u.last_login_at ? (u.last_login_at | date:'dd.MM.yyyy HH:mm') : '—' }}</td>
                                    </tr>
                                  }
                                </tbody>
                              </table>
                            }
                            <div class="panel-footer">
                              <button class="btn-secondary" (click)="cancelEdit()">Zamknij</button>
                              <button class="btn-primary" (click)="openAddUser(t.id)">+ Dodaj użytkownika</button>
                            </div>
                          </div>
                        }

                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- Create tenant modal -->
    @if (showCreate()) {
      <div class="modal-backdrop" (click)="closeCreate()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Nowy tenant</h2>
            <button class="btn-icon" (click)="closeCreate()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="field">
              <label>Nazwa <span class="req">*</span></label>
              <input [(ngModel)]="createForm.name" placeholder="CRMtree Silver" (input)="autoSlug()">
            </div>
            <div class="field">
              <label>Slug <span class="req">*</span></label>
              <input [(ngModel)]="createForm.slug" placeholder="crmtree-silver">
              <div class="hint">Tylko [a-z0-9-], min 2 znaki. Niezmienialny po utworzeniu.</div>
            </div>
            <div class="field">
              <label>Domena email</label>
              <input [(ngModel)]="createForm.email_domain" placeholder="acmecorp.com">
            </div>
            <div class="field">
              <label>DWH prefix</label>
              <input [(ngModel)]="createForm.dwh_schema_prefix" placeholder="crmtree_silver">
              <div class="hint">Tylko [a-z0-9_], musi zaczynać się literą</div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" (click)="closeCreate()">Anuluj</button>
            <button class="btn-primary" [disabled]="saving() || !createForm.name || !createForm.slug" (click)="submitCreate()">
              {{ saving() ? 'Tworzę...' : 'Utwórz tenant' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Add user modal -->
    @if (showAddUser()) {
      <div class="modal-backdrop" (click)="closeAddUser()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Dodaj użytkownika</h2>
            <button class="btn-icon" (click)="closeAddUser()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="field">
              <label>Email <span class="req">*</span></label>
              <input type="email" [(ngModel)]="addUserForm.email" placeholder="jan.kowalski@firma.com">
            </div>
            <div class="field">
              <label>Imię <span class="req">*</span></label>
              <input [(ngModel)]="addUserForm.first_name" placeholder="Jan">
            </div>
            <div class="field">
              <label>Nazwisko <span class="req">*</span></label>
              <input [(ngModel)]="addUserForm.last_name" placeholder="Kowalski">
            </div>
            <div class="field field-check">
              <label class="check-label">
                <input type="checkbox" [(ngModel)]="addUserForm.is_admin">
                Administrator tenanta
              </label>
            </div>
            <div class="info-box">
              Zostanie wygenerowane jednorazowe hasło tymczasowe. Użytkownik będzie musiał je zmienić przy pierwszym logowaniu.
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" (click)="closeAddUser()">Anuluj</button>
            <button class="btn-primary"
                    [disabled]="saving() || !addUserForm.email || !addUserForm.first_name || !addUserForm.last_name"
                    (click)="submitAddUser()">
              {{ saving() ? 'Tworzę...' : 'Utwórz użytkownika' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Temp password modal -->
    @if (tempPassword()) {
      <div class="modal-backdrop">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Użytkownik utworzony</h2>
          </div>
          <div class="modal-body">
            <p>Użytkownik <strong>{{ tempUserEmail() }}</strong> został dodany.</p>
            <p>Jednorazowe hasło tymczasowe (wyświetlane tylko raz):</p>
            <div class="temp-pass-box">{{ tempPassword() }}</div>
            <div class="info-box">Skopiuj hasło teraz — nie będzie dostępne po zamknięciu tego okna.</div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" (click)="copyTempPassword()">Kopiuj</button>
            <button class="btn-primary" (click)="closeTempPassword()">Zamknij</button>
          </div>
        </div>
      </div>
    }

    <!-- Impersonate confirm -->
    @if (impersonateTarget()) {
      <div class="modal-backdrop" (click)="cancelImpersonate()">
        <div class="modal modal-sm" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Impersonacja</h2>
            <button class="btn-icon" (click)="cancelImpersonate()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <p>Zaloguj się jako admin tenanta <strong>{{ impersonateTarget()!.name }}</strong>?</p>
            <p class="hint">Otrzymasz nowy token dostępu (ważny 15 min). Twoja sesja nie zostanie zakończona.</p>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" (click)="cancelImpersonate()">Anuluj</button>
            <button class="btn-danger" [disabled]="saving()" (click)="confirmImpersonate()">
              {{ saving() ? 'Ładowanie...' : 'Impersonuj' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Plan change confirm -->
    @if (planChangeConfirm()) {
      <div class="modal-backdrop" (click)="cancelPlanChangeConfirm()">
        <div class="modal modal-sm" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Potwierdź zmianę planu</h2>
            <button class="btn-icon" (click)="cancelPlanChangeConfirm()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <p>Zmieniasz plan tenanta <strong>{{ planChangeConfirm()!.tenantName }}</strong>:</p>
            <div class="plan-diff">
              <div class="plan-diff-col">
                <span class="plan-diff-label">Obecnie</span>
                <span>{{ planChangeConfirm()!.before.planName }} · {{ planChangeConfirm()!.before.cycle }}</span>
                @if (planChangeConfirm()!.before.price) { <span>{{ planChangeConfirm()!.before.price }} EUR</span> }
              </div>
              <span class="plan-diff-arrow">→</span>
              <div class="plan-diff-col">
                <span class="plan-diff-label">Nowo</span>
                <span>{{ planChangeConfirm()!.after.planName }} · {{ planChangeConfirm()!.after.cycle }}</span>
                @if (planChangeConfirm()!.after.price) { <span>{{ planChangeConfirm()!.after.price }} EUR</span> }
              </div>
            </div>
            <p class="hint">
              Zmiana wpływa wyłącznie na przyszłe rozliczenia — już wystawione faktury pozostają niezmienione
              (batch zawsze fakturuje plan/cenę zapisane w historii dla danego okresu).
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" (click)="cancelPlanChangeConfirm()">Anuluj</button>
            <button class="btn-primary" [disabled]="saving()" (click)="confirmPlanChange()">
              {{ saving() ? 'Zapisuję...' : 'Potwierdź zmianę' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Delete tenant confirm -->
    @if (deleteTarget()) {
      <div class="modal-backdrop" (click)="cancelDeleteTenant()">
        <div class="modal modal-sm" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Usuń tenant</h2>
            <button class="btn-icon" (click)="cancelDeleteTenant()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <p>Usuwasz tenant <strong>{{ deleteTarget()!.name }}</strong> (<code>{{ deleteTarget()!.slug }}</code>).</p>
            <p class="hint">
              Tenant zniknie ze standardowej listy. Jego użytkownicy nie będą mogli się zalogować, a już wydane
              tokeny przestaną działać przy kolejnym żądaniu. Dane, tokeny skrzynek i konfiguracje
              <strong>pozostają w bazie</strong> — to nie jest trwałe kasowanie.
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" (click)="cancelDeleteTenant()">Anuluj</button>
            <button class="btn-danger" [disabled]="saving()" (click)="confirmDeleteTenant()">
              {{ saving() ? 'Usuwam...' : 'Usuń tenant' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Delete billing details confirm -->
    @if (deleteBillingDetailsTarget()) {
      <div class="modal-backdrop" (click)="cancelDeleteBillingDetails()">
        <div class="modal modal-sm" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Usuń dane rozliczeniowe</h2>
            <button class="btn-icon" (click)="cancelDeleteBillingDetails()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <p>Usuwasz dane rozliczeniowe nabywcy dla tenanta <strong>{{ deleteBillingDetailsTarget()!.name }}</strong>.</p>
            <p class="hint">
              To nie wpłynie na dane zapisane na już wystawionych fakturach — każda faktura zachowuje własną,
              zamrożoną kopię danych nabywcy z momentu wystawienia. Usunięty zostanie tylko bieżący
              formularz — kolejne faktury tego tenanta znów będą pokazywać baner „dokument roboczy”, dopóki
              dane nie zostaną uzupełnione ponownie.
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" (click)="cancelDeleteBillingDetails()">Anuluj</button>
            <button class="btn-danger" [disabled]="saving()" (click)="confirmDeleteBillingDetails()">
              {{ saving() ? 'Usuwam...' : 'Usuń dane rozliczeniowe' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .page { padding: 28px 32px; max-width: 1400px; }

    .page-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      margin-bottom: 24px;
    }
    .page-title { font-size: 22px; font-weight: 600; color: var(--gray-900); margin: 0 0 2px; }
    .page-sub   { font-size: 13px; color: var(--gray-500); margin: 0; }

    .state-msg { color: var(--gray-500); font-size: 14px; padding: 24px 0; text-align: center; }
    .billing-hint {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      border-radius: 8px; padding: 10px 14px; margin-top: 10px; font-size: 13px;
    }
    .billing-hint-warn { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
    .billing-hint-ok   { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
    .billing-hint .btn-secondary { flex-shrink: 0; padding: 6px 12px; font-size: 12.5px; }

    /* Table */
    .table-wrap { overflow-x: auto; }
    .data-table {
      width: 100%; border-collapse: collapse; font-size: 13.5px;
      background: white; border: 1px solid var(--gray-200); border-radius: 8px; overflow: hidden;
    }
    .data-table th {
      background: var(--gray-50); padding: 10px 14px; text-align: left;
      font-weight: 600; font-size: 11.5px; text-transform: uppercase; letter-spacing: .4px;
      color: var(--gray-500); border-bottom: 1px solid var(--gray-200);
    }
    .data-table td { padding: 12px 14px; border-bottom: 1px solid var(--gray-100); vertical-align: middle; }
    .data-table tr:last-child > td { border-bottom: none; }
    .data-table tr.expanded > td { background: var(--orange-pale); }
    .data-table tr.edit-row > td { padding: 0; border-bottom: 2px solid var(--orange); }

    .tenant-name { font-weight: 500; color: var(--gray-900); }
    .slug { background: var(--gray-100); padding: 2px 7px; border-radius: 4px; font-size: 12px; color: var(--gray-700); }
    .td-muted { color: var(--gray-500); font-size: 13px; }
    .td-actions { display: flex; gap: 4px; justify-content: flex-end; }

    .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 12px; font-weight: 500; }
    .badge-on    { background: #dcfce7; color: #16a34a; }
    .badge-off   { background: var(--gray-100); color: var(--gray-500); }
    .badge-admin { background: #eff6ff; color: #2563eb; }

    .feat-pills { display: flex; flex-wrap: wrap; gap: 4px; }
    .pill { background: var(--orange-pale); color: var(--orange-dark); font-size: 11px; padding: 2px 8px; border-radius: 99px; }

    .btn-icon {
      width: 30px; height: 30px; border-radius: 6px; border: none; background: none;
      cursor: pointer; color: var(--gray-500);
      display: flex; align-items: center; justify-content: center; transition: background .12s, color .12s;
    }
    .btn-icon:hover { background: var(--gray-100); color: var(--gray-700); }
    .btn-icon svg { width: 15px; height: 15px; transition: transform .2s; }
    .btn-icon.btn-imp:hover { background: #eff6ff; color: #2563eb; }
    .btn-icon.btn-danger-icon { color: #dc2626; }
    .btn-icon.btn-danger-icon:hover { background: #fee2e2; color: #b91c1c; }

    /* Edit panel */
    .edit-panel { background: var(--orange-pale); }

    .tabs { display: flex; border-bottom: 1px solid var(--gray-200); padding: 0 20px; background: white; }
    .tab {
      padding: 10px 16px; font-size: 13.5px; font-weight: 500; color: var(--gray-500);
      background: none; border: none; border-bottom: 2px solid transparent;
      cursor: pointer; margin-bottom: -1px; transition: color .12s, border-color .12s;
      display: flex; align-items: center; gap: 6px;
    }
    .tab:hover { color: var(--gray-700); }
    .tab.active { color: var(--orange); border-bottom-color: var(--orange); }
    .tab-badge { background: var(--orange); color: white; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px; }

    .tab-body { padding: 16px 20px 20px; }

    .edit-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px 16px; margin-bottom: 16px;
    }
    .field label { display: block; font-size: 12px; font-weight: 600; color: var(--gray-600); margin-bottom: 4px; }
    .field input:not([type=checkbox]) {
      width: 100%; padding: 7px 10px; border: 1px solid var(--gray-300);
      border-radius: 6px; font-size: 13px; background: white; box-sizing: border-box;
    }
    .field input:focus, .field select:focus { outline: none; border-color: var(--orange); box-shadow: 0 0 0 2px rgba(59,170,93,.15); }
    .field select {
      width: 100%; padding: 7px 10px; border: 1px solid var(--gray-300);
      border-radius: 6px; font-size: 13px; background: white; box-sizing: border-box;
    }
    .field-check { display: flex; align-items: flex-end; padding-bottom: 2px; }
    .check-label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--gray-700); cursor: pointer; }

    .feat-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .feat-toggle {
      display: flex; align-items: center; gap: 6px;
      padding: 5px 12px; border-radius: 99px; cursor: pointer;
      border: 1.5px solid var(--gray-300); background: white;
      font-size: 12.5px; color: var(--gray-600); user-select: none;
      transition: border-color .12s, background .12s, color .12s;
    }
    .feat-toggle input { display: none; }
    .feat-toggle.on { border-color: var(--orange); background: var(--orange-pale); color: var(--orange-dark); font-weight: 500; }
    .feat-toggle:hover { border-color: var(--orange); }

    .panel-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }

    /* Users tab */
    .empty-users { text-align: center; padding: 24px 0; color: var(--gray-500); }
    .empty-users svg { width: 36px; height: 36px; margin-bottom: 8px; }
    .empty-users p { margin: 4px 0; font-size: 14px; }
    .users-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px; }
    .users-table th {
      text-align: left; padding: 7px 10px; font-size: 11.5px; font-weight: 600;
      color: var(--gray-500); text-transform: uppercase; letter-spacing: .4px;
      border-bottom: 1px solid var(--gray-200);
    }
    .users-table td { padding: 9px 10px; border-bottom: 1px solid var(--gray-100); }
    .users-table tr:last-child td { border-bottom: none; }

    /* Buttons */
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
    .btn-danger {
      padding: 8px 18px; background: #dc2626; color: white;
      border: none; border-radius: 7px; font-size: 13.5px; font-weight: 500; cursor: pointer;
    }
    .btn-danger:hover:not(:disabled) { background: #b91c1c; }
    .btn-danger:disabled { opacity: .55; cursor: not-allowed; }

    /* Modal */
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.45);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .modal { background: white; border-radius: 12px; width: 480px; max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,.25); }
    .modal-sm { width: 360px; }
    .modal-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 22px 14px; border-bottom: 1px solid var(--gray-200);
    }
    .modal-header h2 { margin: 0; font-size: 16px; font-weight: 600; }
    .modal-body { padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; }
    .modal-body p { margin: 0; font-size: 14px; color: var(--gray-700); }
    .plan-diff {
      display: flex; align-items: center; gap: 12px; background: var(--gray-50);
      border: 1px solid var(--gray-200); border-radius: 8px; padding: 12px 14px;
    }
    .plan-diff-col { display: flex; flex-direction: column; gap: 2px; font-size: 13px; flex: 1; }
    .plan-diff-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--gray-500); }
    .plan-diff-arrow { color: var(--gray-400); font-size: 16px; }
    .modal-footer {
      display: flex; gap: 8px; justify-content: flex-end;
      padding: 14px 22px 18px; border-top: 1px solid var(--gray-200);
    }

    .reinit-box {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;
      padding: 12px 16px; margin-bottom: 16px;
    }
    .reinit-desc { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
    .reinit-desc strong { color: var(--gray-800); }
    .reinit-desc span { color: var(--gray-500); font-size: 12px; }
    .btn-reinit {
      white-space: nowrap; padding: 7px 14px; background: #f59e0b; color: white;
      border: none; border-radius: 7px; font-size: 13px; font-weight: 500;
      cursor: pointer; transition: background .12s; flex-shrink: 0;
    }
    .btn-reinit:hover:not(:disabled) { background: #d97706; }
    .btn-reinit:disabled { opacity: .55; cursor: not-allowed; }

    /* Email providers tab */
    .provider-card {
      background: white; border: 1px solid var(--gray-200); border-radius: 8px;
      margin-bottom: 12px; overflow: hidden;
    }
    .provider-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; background: var(--gray-50); border-bottom: 1px solid var(--gray-200);
    }
    .provider-header-right { display: flex; align-items: center; gap: 12px; }
    .provider-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 14px; font-weight: 600; color: var(--gray-800);
    }
    .provider-title svg { width: 16px; height: 16px; color: var(--gray-500); }
    .provider-meta { padding: 8px 16px; font-size: 12px; color: var(--gray-500); border-bottom: 1px solid var(--gray-100); }
    .provider-meta code { background: var(--gray-100); padding: 1px 5px; border-radius: 4px; font-size: 11px; }
    .provider-form { padding: 14px 16px 16px; }
    .provider-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
    .btn-danger-sm {
      padding: 6px 12px; background: #fee2e2; color: #dc2626;
      border: 1px solid #fca5a5; border-radius: 6px; font-size: 12.5px; cursor: pointer;
      transition: background .12s;
    }
    .btn-danger-sm:hover:not(:disabled) { background: #fecaca; }
    .btn-danger-sm:disabled { opacity: .55; cursor: not-allowed; }

    /* Active email provider — small radio in each card header + toolbar "none" option */
    .email-tab-toolbar {
      display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
    }
    .email-tab-toolbar-label { font-size: 12.5px; font-weight: 600; color: var(--gray-600); }
    .radio-option {
      display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--gray-700);
      cursor: pointer; user-select: none;
    }
    .radio-option.disabled { color: var(--gray-400); cursor: not-allowed; }

    .hint { font-size: 11.5px; color: var(--gray-400); margin-top: 3px; }
    .hint-inline { font-size: 11px; color: var(--gray-400); font-weight: 400; }
    .req  { color: #dc2626; }
    .info-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px 14px; font-size: 13px; color: #1e40af; }
    .temp-pass-box {
      font-family: monospace; font-size: 20px; font-weight: 700; letter-spacing: 2px;
      background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: 8px;
      padding: 12px 16px; text-align: center; color: var(--gray-900);
    }
  `],
})
export class TenantsComponent implements OnInit {
  private http  = inject(HttpClient);
  private toast = inject(ToastService);
  auth = inject(AuthService);

  readonly ALL_FEATURES = ALL_FEATURES;

  tenants      = signal<Tenant[]>([]);
  loading      = signal(true);
  saving       = signal(false);
  expandedId   = signal<string | null>(null);
  editTab      = signal<EditTab>('settings');

  tenantUsers  = signal<TenantUser[]>([]);
  usersLoading = signal(false);

  emailProviders  = signal<EmailProvider[]>([]);
  emailLoading    = signal(false);
  gmailProvider   = signal<EmailProvider | null>(null);
  outlookProvider = signal<EmailProvider | null>(null);
  zohoProvider    = signal<EmailProvider | null>(null);
  activeProvider  = signal<EmailProviderKey | null>(null);

  whatsappConfig          = signal<WhatsappConfig | null>(null);
  whatsappLoading         = signal(false);
  whatsappShowVerifyToken = signal(false);

  trainingMode = signal(false);

  billingPlans        = signal<BillingPlan[]>([]);
  billingPlansLoading = signal(false);
  subscriptionDraft: { planId: string; billingCycle: BillingCycle; customPriceEur: number | null } =
    { planId: '', billingCycle: 'monthly', customPriceEur: null };

  showCreate        = signal(false);
  showAddUser       = signal(false);
  addUserTenantId   = signal<string | null>(null);
  impersonateTarget = signal<Tenant | null>(null);
  deleteTarget       = signal<Tenant | null>(null);
  planChangeConfirm  = signal<PlanChangeConfirmData | null>(null);

  billingDetailsLoading = signal(false);
  billingDetailsDraft: { company_name: string; nip: string; street: string; postal_code: string; city: string; country: string; invoice_email: string } =
    { company_name: '', nip: '', street: '', postal_code: '', city: '', country: '', invoice_email: '' };
  deleteBillingDetailsTarget = signal<Tenant | null>(null);

  tempPassword  = signal<string | null>(null);
  tempUserEmail = signal<string>('');

  createForm = { name: '', slug: '', email_domain: '', dwh_schema_prefix: '' };
  addUserForm = { email: '', first_name: '', last_name: '', is_admin: true };
  gmailForm:   GmailForm   = this.emptyGmailForm();
  outlookForm: OutlookForm = this.emptyOutlookForm();
  zohoForm:    ZohoForm    = this.emptyZohoForm();
  whatsappForm: WhatsappConfigForm = this.emptyWhatsappForm();
  readonly whatsappWebhookUrl = WHATSAPP_WEBHOOK_URL;

  editDraft: {
    name: string; email_domain: string; dwh_schema_prefix: string; is_active: boolean;
    features: Record<CrmFeature, boolean>;
  } = this.emptyDraft();

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.http.get<Tenant[]>(`${API}/admin/tenants`).subscribe({
      next: ts => { this.tenants.set(ts); this.loading.set(false); },
      error: () => { this.toast.error('Nie udało się pobrać tenantów'); this.loading.set(false); },
    });
  }

  enabledFeatures(t: Tenant): CrmFeature[] {
    return (t.features ?? []).filter(f => f.is_enabled).map(f => f.feature);
  }
  featureLabel(f: CrmFeature): string { return FEATURE_LABELS[f] ?? f; }

  // ── Expand / edit ────────────────────────────────────────────
  toggleExpand(t: Tenant): void {
    if (this.expandedId() === t.id) { this.expandedId.set(null); return; }
    const featMap = Object.fromEntries(ALL_FEATURES.map(f => [f, false])) as Record<CrmFeature, boolean>;
    for (const tf of t.features ?? []) featMap[tf.feature] = tf.is_enabled;
    this.editDraft = {
      name: t.name, email_domain: t.email_domain ?? '', dwh_schema_prefix: t.dwh_schema_prefix ?? '',
      is_active: t.is_active, features: featMap,
    };
    this.trainingMode.set(t.crm_training_mode ?? false);
    this.editTab.set('settings');
    this.tenantUsers.set([]);
    this.expandedId.set(t.id);
  }

  cancelEdit(): void { this.expandedId.set(null); }

  reinit(id: string): void {
    if (!confirm('Skopiować app_settings, group_profiles i feature flags z crmtree-gold do tego tenanta? Istniejące ustawienia zostaną nadpisane.')) return;
    this.saving.set(true);
    this.http.post<{ settings_upserted: number; groups_inserted: number }>(`${API}/admin/tenants/${id}/reinit`, {}).subscribe({
      next: result => {
        this.saving.set(false);
        this.toast.success(`Reinit zakończony — ${result.settings_upserted} ustawień, ${result.groups_inserted} grup`);
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.error ?? 'Błąd reinit'); },
    });
  }

  saveSettings(id: string): void {
    this.saving.set(true);
    const body = {
      name:              this.editDraft.name || undefined,
      email_domain:      this.editDraft.email_domain || null,
      dwh_schema_prefix: this.editDraft.dwh_schema_prefix || null,
      is_active:         this.editDraft.is_active,
    };
    this.http.patch<Tenant>(`${API}/admin/tenants/${id}`, body).subscribe({
      next: updated => {
        this.tenants.update(ts => ts.map(t => t.id === id ? { ...t, ...updated } : t));
        this.saving.set(false);
        this.toast.success('Ustawienia zapisane');
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.error ?? 'Błąd zapisu'); },
    });
  }

  saveFeatures(id: string): void {
    this.saving.set(true);
    this.http.put<TenantFeature[]>(`${API}/admin/tenants/${id}/features`, { features: this.editDraft.features }).subscribe({
      next: features => {
        this.tenants.update(ts => ts.map(t => t.id === id ? { ...t, features } : t));
        this.saving.set(false);
        this.toast.success('Moduły zapisane');
      },
      error: () => { this.saving.set(false); this.toast.error('Błąd zapisu modułów'); },
    });
  }

  // ── Plan tab ─────────────────────────────────────────────────
  billingCycleLabel(c: BillingCycle): string { return BILLING_CYCLE_LABELS[c] ?? c; }

  selectedPlanIsCustomPricing(): boolean {
    return this.billingPlans().find(p => p.id === this.subscriptionDraft.planId)?.is_custom_pricing ?? false;
  }

  // Professional's custom_price_eur is a single amount for whichever cycle is
  // currently active — it does NOT auto-convert between monthly/annual, so
  // leaving a stale monthly quote in the draft after switching to annual (or
  // vice versa) risks saving an annual subscription at a monthly price.
  // Clearing it forces the admin to re-enter the amount for the new cycle.
  onBillingCycleChange(): void {
    this.subscriptionDraft.customPriceEur = null;
  }

  // Form pre-fill only when the tenant has no subscription row yet — never written to the
  // backend on its own, just what the "Plan" tab shows until the admin hits "Zapisz plan".
  private defaultPlanId(): string {
    return this.billingPlans().find(p => p.code === 'lite')?.id ?? this.billingPlans()[0]?.id ?? '';
  }

  private applyPlanDraft(sub: TenantSubscription | null): void {
    this.subscriptionDraft = sub
      ? { planId: sub.plan_id, billingCycle: sub.billing_cycle, customPriceEur: sub.custom_price_eur ? Number(sub.custom_price_eur) : null }
      : { planId: this.defaultPlanId(), billingCycle: 'monthly', customPriceEur: null };
  }

  openPlanTab(t: Tenant): void {
    this.editTab.set('plan');
    this.billingPlansLoading.set(true);
    // The tenant list (GET /admin/tenants) doesn't carry `subscription` — re-fetch the
    // single-tenant detail so the form reflects what's actually saved, not stale list data.
    this.http.get<Tenant>(`${API}/admin/tenants/${t.id}`).subscribe({
      next: fresh => {
        this.tenants.update(ts => ts.map(x => x.id === t.id ? { ...x, subscription: fresh.subscription, billing_details: fresh.billing_details } : x));
        this.applyPlanDraft(fresh.subscription ?? null);
        if (this.billingPlans().length > 0) { this.billingPlansLoading.set(false); return; }
        this.http.get<BillingPlan[]>(`${API}/admin/billing/plans`).subscribe({
          next: plans => {
            const sorted = [...plans].sort((a, b) =>
              (PLAN_DISPLAY_ORDER[a.code] ?? 99) - (PLAN_DISPLAY_ORDER[b.code] ?? 99));
            this.billingPlans.set(sorted);
            this.billingPlansLoading.set(false);
            if (!fresh.subscription) this.applyPlanDraft(null);
          },
          error: () => { this.toast.error('Błąd ładowania planów'); this.billingPlansLoading.set(false); },
        });
      },
      error: () => { this.toast.error('Błąd ładowania danych tenanta'); this.billingPlansLoading.set(false); },
    });
  }

  // Reverts unsaved edits to the last-saved subscription — unlike cancelEdit(), it must
  // NOT collapse the tenant panel, since this button sits next to "Zapisz plan" and reads
  // as "discard form changes", not "close panel".
  cancelPlanEdit(t: Tenant): void {
    this.applyPlanDraft(t.subscription ?? null);
  }

  isPlanDraftUnchanged(t: Tenant): boolean {
    const sub = t.subscription;
    const savedPlanId = sub ? sub.plan_id : this.defaultPlanId();
    const savedCycle: BillingCycle = sub ? sub.billing_cycle : 'monthly';
    const savedCustomPrice = sub?.custom_price_eur ? Number(sub.custom_price_eur) : null;
    return this.subscriptionDraft.planId === savedPlanId
      && this.subscriptionDraft.billingCycle === savedCycle
      && this.subscriptionDraft.customPriceEur === savedCustomPrice;
  }

  saveSubscription(id: string): void {
    this.saving.set(true);
    this.http.put<{ plan_id: string; billing_cycle: BillingCycle; custom_price_eur: string | null; started_at: string; plan_started_at: string; cancelled_at: string | null }>(
      `${API}/admin/tenants/${id}/subscription`,
      {
        planId: this.subscriptionDraft.planId,
        billingCycle: this.subscriptionDraft.billingCycle,
        customPriceEur: this.subscriptionDraft.customPriceEur,
      }
    ).subscribe({
      next: sub => {
        const plan = this.billingPlans().find(p => p.id === sub.plan_id);
        this.tenants.update(ts => ts.map(t => t.id === id
          ? { ...t, subscription: { ...sub, plan_code: plan?.code ?? '', plan_name: plan?.name ?? '' } }
          : t));
        this.saving.set(false);
        this.toast.success('Plan zapisany');
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.error ?? 'Błąd zapisu planu'); },
    });
  }

  // Superadmin guardrail: plan/cycle/price changes only ever affect future
  // billing (already-issued invoices are frozen from tenant_subscription_history),
  // but that's exactly the kind of thing that's easy to click by accident —
  // show the before/after and require a second click before saving.
  openPlanChangeConfirm(t: Tenant): void {
    const draftPlan = this.billingPlans().find(p => p.id === this.subscriptionDraft.planId);
    const sub = t.subscription;
    this.planChangeConfirm.set({
      tenantId: t.id,
      tenantName: t.name,
      before: sub
        ? { planName: sub.plan_name, cycle: this.billingCycleLabel(sub.billing_cycle), price: sub.custom_price_eur }
        : { planName: 'brak planu', cycle: '—', price: null },
      after: {
        planName: draftPlan?.name ?? '—',
        cycle: this.billingCycleLabel(this.subscriptionDraft.billingCycle),
        price: this.subscriptionDraft.customPriceEur != null ? String(this.subscriptionDraft.customPriceEur) : null,
      },
    });
  }
  cancelPlanChangeConfirm(): void { this.planChangeConfirm.set(null); }
  confirmPlanChange(): void {
    const c = this.planChangeConfirm();
    if (!c) return;
    this.planChangeConfirm.set(null);
    this.saveSubscription(c.tenantId);
  }

  // Ends the subscription (tenant_subscriptions.cancelled_at) — billing's own
  // record, independent from tenants.is_active. The already-running/closed
  // billing period is still invoiced in full once it ends; nothing after it.
  cancelSubscription(t: Tenant): void {
    if (!confirm(`Zakończyć subskrypcję tenanta „${t.name}"? Bieżący okres rozliczeniowy zostanie jeszcze zafakturowany w całości (bez proracji) po jego zakończeniu — kolejne już nie, do czasu ponownego przypisania planu lub cofnięcia rezygnacji.`)) return;
    this.saving.set(true);
    this.http.put<{ cancelled_at: string }>(`${API}/admin/tenants/${t.id}/subscription/cancel`, {}).subscribe({
      next: res => {
        this.tenants.update(ts => ts.map(x => x.id === t.id && x.subscription
          ? { ...x, subscription: { ...x.subscription, cancelled_at: res.cancelled_at } }
          : x));
        this.saving.set(false);
        this.toast.success('Subskrypcja zakończona');
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.error ?? 'Błąd kończenia subskrypcji'); },
    });
  }

  reactivateSubscription(t: Tenant): void {
    this.saving.set(true);
    this.http.delete(`${API}/admin/tenants/${t.id}/subscription/cancel`).subscribe({
      next: () => {
        this.tenants.update(ts => ts.map(x => x.id === t.id && x.subscription
          ? { ...x, subscription: { ...x.subscription, cancelled_at: null } }
          : x));
        this.saving.set(false);
        this.toast.success('Rezygnacja cofnięta');
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.error ?? 'Błąd cofania rezygnacji'); },
    });
  }

  // ── Billing details tab (legal buyer data for invoices) ────────
  openBillingDetailsTab(t: Tenant): void {
    this.editTab.set('billing');
    this.billingDetailsLoading.set(true);
    // Same reasoning as openPlanTab: the tenant list doesn't carry billing_details.
    this.http.get<Tenant>(`${API}/admin/tenants/${t.id}`).subscribe({
      next: fresh => {
        this.tenants.update(ts => ts.map(x => x.id === t.id ? { ...x, billing_details: fresh.billing_details } : x));
        this.applyBillingDetailsDraft(fresh.billing_details ?? null);
        this.billingDetailsLoading.set(false);
      },
      error: () => { this.toast.error('Błąd ładowania danych rozliczeniowych'); this.billingDetailsLoading.set(false); },
    });
  }

  private applyBillingDetailsDraft(details: TenantBillingDetails | null): void {
    this.billingDetailsDraft = {
      company_name: details?.company_name ?? '',
      nip: details?.nip ?? '',
      street: details?.street ?? '',
      postal_code: details?.postal_code ?? '',
      city: details?.city ?? '',
      country: details?.country ?? '',
      invoice_email: details?.invoice_email ?? '',
    };
  }

  // Reverts unsaved form edits to whatever is currently saved in the
  // database — never deletes anything. Deleting the saved record is a
  // separate, explicit destructive action (openDeleteBillingDetails below).
  cancelBillingDetailsEdit(t: Tenant): void {
    this.applyBillingDetailsDraft(t.billing_details ?? null);
  }

  isBillingDetailsDraftUnchanged(t: Tenant): boolean {
    const d = t.billing_details;
    return this.billingDetailsDraft.company_name === (d?.company_name ?? '')
      && this.billingDetailsDraft.nip === (d?.nip ?? '')
      && this.billingDetailsDraft.street === (d?.street ?? '')
      && this.billingDetailsDraft.postal_code === (d?.postal_code ?? '')
      && this.billingDetailsDraft.city === (d?.city ?? '')
      && this.billingDetailsDraft.country === (d?.country ?? '')
      && this.billingDetailsDraft.invoice_email === (d?.invoice_email ?? '');
  }

  // True once every field a complete invoice needs is filled in — mirrors
  // isInvoiceComplete() in invoicePdfService.js (backend is the source of
  // truth for what actually gates the PDF banner; this is only used here to
  // drive the non-blocking hint in the Plan tab).
  isBillingDetailsComplete(t: Tenant): boolean {
    const d = t.billing_details;
    return !!(d?.company_name && d?.nip && d?.street && d?.postal_code && d?.city && d?.country && d?.invoice_email);
  }

  saveBillingDetails(id: string): void {
    this.saving.set(true);
    this.http.put<TenantBillingDetails>(`${API}/admin/tenants/${id}/billing-details`, {
      company_name: this.billingDetailsDraft.company_name || null,
      nip: this.billingDetailsDraft.nip || null,
      street: this.billingDetailsDraft.street || null,
      postal_code: this.billingDetailsDraft.postal_code || null,
      city: this.billingDetailsDraft.city || null,
      country: this.billingDetailsDraft.country || null,
      invoice_email: this.billingDetailsDraft.invoice_email || null,
    }).subscribe({
      next: details => {
        this.tenants.update(ts => ts.map(t => t.id === id ? { ...t, billing_details: details } : t));
        this.saving.set(false);
        this.toast.success('Dane rozliczeniowe zapisane');
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.error ?? 'Błąd zapisu danych rozliczeniowych'); },
    });
  }

  // ── Delete billing details (destructive, separate from Anuluj) ─
  openDeleteBillingDetails(t: Tenant): void { this.deleteBillingDetailsTarget.set(t); }
  cancelDeleteBillingDetails(): void { this.deleteBillingDetailsTarget.set(null); }

  confirmDeleteBillingDetails(): void {
    const t = this.deleteBillingDetailsTarget();
    if (!t) return;
    this.saving.set(true);
    this.http.delete(`${API}/admin/tenants/${t.id}/billing-details`).subscribe({
      next: () => {
        this.tenants.update(ts => ts.map(x => x.id === t.id ? { ...x, billing_details: null } : x));
        this.applyBillingDetailsDraft(null);
        this.saving.set(false);
        this.deleteBillingDetailsTarget.set(null);
        this.toast.success('Dane rozliczeniowe usunięte — już wystawione faktury pozostają bez zmian.');
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.error ?? 'Błąd usuwania danych rozliczeniowych'); },
    });
  }

  // ── Users tab ────────────────────────────────────────────────
  openUsersTab(id: string): void {
    this.editTab.set('users');
    this.usersLoading.set(true);
    this.http.get<TenantUser[]>(`${API}/admin/tenants/${id}/users`).subscribe({
      next: users => { this.tenantUsers.set(users); this.usersLoading.set(false); },
      error: () => { this.toast.error('Błąd ładowania użytkowników'); this.usersLoading.set(false); },
    });
  }

  openAddUser(tenantId: string): void {
    this.addUserForm = { email: '', first_name: '', last_name: '', is_admin: true };
    this.addUserTenantId.set(tenantId);
    this.showAddUser.set(true);
  }

  closeAddUser(): void { this.showAddUser.set(false); }

  submitAddUser(): void {
    const tenantId = this.addUserTenantId()!;
    this.saving.set(true);
    this.http.post<any>(`${API}/admin/tenants/${tenantId}/users`, this.addUserForm).subscribe({
      next: result => {
        this.saving.set(false);
        this.showAddUser.set(false);
        this.tenantUsers.update(us => [...us, result]);
        this.tenants.update(ts => ts.map(t => t.id === tenantId
          ? { ...t, total_users: (t.total_users ?? 0) + 1, user_count: (t.user_count ?? 0) + 1 }
          : t
        ));
        this.tempPassword.set(result.temp_password);
        this.tempUserEmail.set(result.email);
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.error ?? 'Błąd tworzenia użytkownika');
      },
    });
  }

  copyTempPassword(): void {
    navigator.clipboard.writeText(this.tempPassword()!);
    this.toast.success('Hasło skopiowane');
  }

  closeTempPassword(): void { this.tempPassword.set(null); }

  // ── Create tenant ────────────────────────────────────────────
  openCreate(): void {
    this.createForm = { name: '', slug: '', email_domain: '', dwh_schema_prefix: '' };
    this.showCreate.set(true);
  }
  closeCreate(): void { this.showCreate.set(false); }

  autoSlug(): void {
    this.createForm.slug = this.createForm.name
      .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  submitCreate(): void {
    this.saving.set(true);
    const payload: any = { name: this.createForm.name, slug: this.createForm.slug };
    if (this.createForm.email_domain)      payload.email_domain      = this.createForm.email_domain;
    if (this.createForm.dwh_schema_prefix) payload.dwh_schema_prefix = this.createForm.dwh_schema_prefix;
    this.http.post<Tenant>(`${API}/admin/tenants`, payload).subscribe({
      next: tenant => {
        this.tenants.update(ts => [{
          ...tenant, user_count: 0, total_users: 0,
          features: ALL_FEATURES.map(f => ({ feature: f, is_enabled: false })),
        }, ...ts]);
        this.saving.set(false);
        this.showCreate.set(false);
        this.toast.success(`Tenant "${tenant.name}" utworzony`);
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.errors?.[0]?.msg ?? err?.error?.error ?? 'Błąd tworzenia tenanta');
      },
    });
  }

  // ── Impersonate ──────────────────────────────────────────────
  impersonate(t: Tenant): void { this.impersonateTarget.set(t); }
  cancelImpersonate(): void    { this.impersonateTarget.set(null); }

  confirmImpersonate(): void {
    const t = this.impersonateTarget()!;
    this.saving.set(true);
    this.http.post<{ access_token: string; impersonated_user: any }>(`${API}/admin/tenants/${t.id}/impersonate`, {}).subscribe({
      next: ({ access_token, impersonated_user }) => {
        sessionStorage.setItem('wt_impersonation', JSON.stringify({ token: access_token, tenant: t.name, user: impersonated_user.email }));
        this.saving.set(false);
        this.impersonateTarget.set(null);
        this.toast.success(`Token dla ${impersonated_user.email} zapisany w sessionStorage['wt_impersonation']`);
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.error ?? 'Błąd impersonacji'); },
    });
  }

  // ── Delete tenant (soft delete) — data/tokens/config stay in the DB;
  // the tenant just disappears from the standard list and its users are
  // locked out (see requireAuth / routes/auth.js on the backend). ─────────
  openDeleteTenant(t: Tenant): void {
    this.deleteTarget.set(t);
  }
  cancelDeleteTenant(): void {
    this.deleteTarget.set(null);
  }

  confirmDeleteTenant(): void {
    const t = this.deleteTarget();
    if (!t) return;
    this.saving.set(true);
    this.http.delete(`${API}/admin/tenants/${t.id}`).subscribe({
      next: () => {
        this.tenants.update(ts => ts.filter(x => x.id !== t.id));
        this.saving.set(false);
        this.deleteTarget.set(null);
        this.cancelEdit();
        this.toast.success(`Tenant „${t.name}” usunięty — dane pozostają w bazie, dostęp został zablokowany.`);
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.error ?? 'Błąd usuwania tenanta'); },
    });
  }

  // ── Email providers tab ──────────────────────────────────────────
  openEmailTab(id: string): void {
    this.editTab.set('email');
    this.emailLoading.set(true);
    const tenant = this.tenants().find(t => t.id === id);
    this.activeProvider.set(tenant?.active_email_provider ?? null);
    this.http.get<EmailProvider[]>(`${API}/admin/tenants/${id}/email-providers`).subscribe({
      next: providers => {
        this.emailProviders.set(providers);
        const gmail   = providers.find(p => p.provider === 'gmail')   ?? null;
        const outlook = providers.find(p => p.provider === 'outlook') ?? null;
        const zoho    = providers.find(p => p.provider === 'zoho')    ?? null;
        this.gmailProvider.set(gmail);
        this.outlookProvider.set(outlook);
        this.zohoProvider.set(zoho);
        this.gmailForm   = gmail   ? this.providerToGmailForm(gmail)     : this.emptyGmailForm();
        this.outlookForm = outlook ? this.providerToOutlookForm(outlook) : this.emptyOutlookForm();
        this.zohoForm    = zoho    ? this.providerToZohoForm(zoho)       : this.emptyZohoForm();
        this.emailLoading.set(false);
      },
      error: () => { this.toast.error('Błąd ładowania konfiguracji email'); this.emailLoading.set(false); },
    });
  }

  private static readonly PROVIDER_LABELS: Record<EmailProviderKey, string> = {
    gmail: 'Gmail', outlook: 'Outlook', zoho: 'Zoho',
  };

  saveEmailProvider(tenantId: string, provider: EmailProviderKey): void {
    this.saving.set(true);
    let body: any;
    if (provider === 'gmail') {
      body = {
        client_id:    this.gmailForm.client_id,
        client_secret: this.gmailForm.client_secret || undefined,
        redirect_uri:  this.gmailForm.redirect_uri  || undefined,
        extra_config: {
          ...(this.gmailForm.pubsub_topic        ? { pubsub_topic:        this.gmailForm.pubsub_topic }        : {}),
          ...(this.gmailForm.pubsub_subscription ? { pubsub_subscription: this.gmailForm.pubsub_subscription } : {}),
        },
        // Whether this saved config is "the one used" is entirely decided by
        // active_email_provider (see setActiveProvider) — a saved config is
        // always enabled.
        is_enabled: true,
      };
    } else if (provider === 'outlook') {
      body = {
        client_id:    this.outlookForm.client_id,
        client_secret: this.outlookForm.client_secret || undefined,
        redirect_uri:  this.outlookForm.redirect_uri  || undefined,
        extra_config: this.outlookForm.azure_tenant_id
          ? { azure_tenant_id: this.outlookForm.azure_tenant_id }
          : {},
        is_enabled: true,
      };
    } else {
      body = {
        client_id:    this.zohoForm.client_id,
        client_secret: this.zohoForm.client_secret || undefined,
        redirect_uri:  this.zohoForm.redirect_uri  || undefined,
        extra_config: {},
        is_enabled: true,
      };
    }

    this.http.put<EmailProvider & { active_email_provider: EmailProviderKey | null }>(
      `${API}/admin/tenants/${tenantId}/email-providers/${provider}`, body,
    ).subscribe({
      next: saved => {
        if (provider === 'gmail')        { this.gmailProvider.set(saved);   this.gmailForm.client_secret = ''; }
        else if (provider === 'outlook') { this.outlookProvider.set(saved); this.outlookForm.client_secret = ''; }
        else                              { this.zohoProvider.set(saved);   this.zohoForm.client_secret = ''; }

        // Backend auto-activates this provider when the tenant had none yet —
        // reflect that here so the header radio updates without a page reload.
        // If the tenant already had a different active provider, this is a no-op.
        this.activeProvider.set(saved.active_email_provider);
        this.tenants.update(ts => ts.map(t => t.id === tenantId
          ? { ...t, active_email_provider: saved.active_email_provider }
          : t
        ));

        this.saving.set(false);
        this.toast.success(`${TenantsComponent.PROVIDER_LABELS[provider]} zapisany`);
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.error ?? 'Błąd zapisu'); },
    });
  }

  deleteEmailProvider(tenantId: string, provider: EmailProviderKey): void {
    if (!confirm(`Usunąć konfigurację ${TenantsComponent.PROVIDER_LABELS[provider]}?`)) return;
    this.saving.set(true);
    this.http.delete(`${API}/admin/tenants/${tenantId}/email-providers/${provider}`).subscribe({
      next: () => {
        if (provider === 'gmail')        { this.gmailProvider.set(null);   this.gmailForm = this.emptyGmailForm(); }
        else if (provider === 'outlook') { this.outlookProvider.set(null); this.outlookForm = this.emptyOutlookForm(); }
        else                              { this.zohoProvider.set(null);   this.zohoForm = this.emptyZohoForm(); }
        // Deleting the active provider's config deactivates it tenant-wide (mirrors backend).
        if (this.activeProvider() === provider) { this.activeProvider.set(null); }
        this.tenants.update(ts => ts.map(t => t.id === tenantId
          ? { ...t, active_email_provider: this.activeProvider() }
          : t
        ));
        this.saving.set(false);
        this.toast.success(`${TenantsComponent.PROVIDER_LABELS[provider]} usunięty`);
      },
      error: () => { this.saving.set(false); this.toast.error('Błąd usuwania'); },
    });
  }

  // Sets the tenant's single active email provider. CRM users never see or
  // choose this — it's exclusively a super-admin setting from this panel.
  setActiveProvider(tenantId: string, provider: EmailProviderKey | null): void {
    this.saving.set(true);
    this.http.put<{ id: string; active_email_provider: EmailProviderKey | null }>(
      `${API}/admin/tenants/${tenantId}/active-provider`, { provider },
    ).subscribe({
      next: result => {
        this.activeProvider.set(result.active_email_provider);
        this.tenants.update(ts => ts.map(t => t.id === tenantId
          ? { ...t, active_email_provider: result.active_email_provider }
          : t
        ));
        this.saving.set(false);
        this.toast.success(provider
          ? `Aktywny provider: ${TenantsComponent.PROVIDER_LABELS[provider]}`
          : 'Aktywny provider wyczyszczony');
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.error ?? 'Błąd zapisu aktywnego providera'); },
    });
  }

  // Sets crm_training_mode for the currently-open tenant only (never the
  // calling super admin's own tenant). Saves immediately so the affected
  // tenant's users see the switch (demo ↔ real Outlook/Gmail/Zoho) right away.
  setTrainingMode(tenantId: string, enabled: boolean): void {
    this.saving.set(true);
    this.http.put<{ id: string; crm_training_mode: boolean }>(
      `${API}/admin/tenants/${tenantId}/training-mode`, { enabled },
    ).subscribe({
      next: result => {
        this.trainingMode.set(result.crm_training_mode);
        this.tenants.update(ts => ts.map(t => t.id === tenantId
          ? { ...t, crm_training_mode: result.crm_training_mode }
          : t
        ));
        this.saving.set(false);
        this.toast.success(result.crm_training_mode ? 'Tryb szkoleniowy włączony' : 'Tryb szkoleniowy wyłączony');
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.error ?? 'Błąd zapisu trybu szkoleniowego'); },
    });
  }

  // ── WhatsApp tab (superadmin — configures the tenant's one shared number) ──
  openWhatsappTab(id: string): void {
    this.editTab.set('whatsapp');
    this.whatsappLoading.set(true);
    this.whatsappShowVerifyToken.set(false);
    this.http.get<WhatsappConfig>(`${API}/admin/tenants/${id}/whatsapp-config`).subscribe({
      next: cfg => {
        this.whatsappConfig.set(cfg);
        this.whatsappForm = cfg.configured
          ? {
              waba_id: cfg.waba_id || '',
              phone_number_id: cfg.phone_number_id || '',
              access_token: '',
              app_secret: '',
              is_enabled: cfg.is_enabled !== false,
            }
          : this.emptyWhatsappForm();
        this.whatsappLoading.set(false);
      },
      error: () => { this.toast.error('Błąd ładowania konfiguracji WhatsApp'); this.whatsappLoading.set(false); },
    });
  }

  saveWhatsappConfig(tenantId: string): void {
    this.saving.set(true);
    const body = {
      waba_id: this.whatsappForm.waba_id,
      phone_number_id: this.whatsappForm.phone_number_id,
      access_token: this.whatsappForm.access_token || undefined,
      app_secret: this.whatsappForm.app_secret || undefined,
      is_enabled: this.whatsappForm.is_enabled,
    };
    this.http.put<WhatsappConfig>(`${API}/admin/tenants/${tenantId}/whatsapp-config`, body).subscribe({
      next: saved => {
        this.whatsappConfig.set(saved);
        this.whatsappForm.access_token = '';
        this.whatsappForm.app_secret   = '';
        this.saving.set(false);
        this.toast.success('WhatsApp zapisany');
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.error ?? 'Błąd zapisu'); },
    });
  }

  deleteWhatsappConfig(tenantId: string): void {
    if (!confirm('Usunąć konfigurację WhatsApp?')) return;
    this.saving.set(true);
    this.http.delete(`${API}/admin/tenants/${tenantId}/whatsapp-config`).subscribe({
      next: () => {
        this.whatsappConfig.set(null);
        this.whatsappForm = this.emptyWhatsappForm();
        this.saving.set(false);
        this.toast.success('WhatsApp usunięty');
      },
      error: () => { this.saving.set(false); this.toast.error('Błąd usuwania'); },
    });
  }

  copyWhatsappVerifyToken(): void {
    const token = this.whatsappConfig()?.webhook_verify_token;
    if (!token) return;
    navigator.clipboard.writeText(token);
    this.toast.success('Verify token skopiowany');
  }

  private providerToGmailForm(p: EmailProvider): GmailForm {
    return {
      client_id: p.client_id, client_secret: '',
      redirect_uri: p.redirect_uri ?? '',
      pubsub_topic:        p.extra_config?.['pubsub_topic']        ?? '',
      pubsub_subscription: p.extra_config?.['pubsub_subscription'] ?? '',
    };
  }
  private providerToOutlookForm(p: EmailProvider): OutlookForm {
    return {
      client_id: p.client_id, client_secret: '',
      azure_tenant_id: p.extra_config?.['azure_tenant_id'] ?? '',
      redirect_uri: p.redirect_uri ?? '',
    };
  }
  private providerToZohoForm(p: EmailProvider): ZohoForm {
    return {
      client_id: p.client_id, client_secret: '',
      redirect_uri: p.redirect_uri ?? '',
    };
  }
  private emptyGmailForm():   GmailForm   { return { client_id: '', client_secret: '', redirect_uri: '', pubsub_topic: '', pubsub_subscription: '' }; }
  private emptyOutlookForm(): OutlookForm { return { client_id: '', client_secret: '', azure_tenant_id: '', redirect_uri: '' }; }
  private emptyZohoForm():    ZohoForm    { return { client_id: '', client_secret: '', redirect_uri: '' }; }
  private emptyWhatsappForm(): WhatsappConfigForm {
    return { waba_id: '', phone_number_id: '', access_token: '', app_secret: '', is_enabled: true };
  }

  private emptyDraft() {
    return {
      name: '', email_domain: '', dwh_schema_prefix: '', is_active: true,
      features: Object.fromEntries(ALL_FEATURES.map(f => [f, false])) as Record<CrmFeature, boolean>,
    };
  }
}
