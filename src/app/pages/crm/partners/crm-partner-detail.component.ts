// src/app/pages/crm/partners/crm-partner-detail.component.ts
import { Component, OnInit, OnDestroy, inject, Input, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { CrmApiService, Partner, PartnerActivity, OnboardingTask, PARTNER_STATUS_LABELS, PartnerStatus, CrmUser, PartnerGroup, LinkedDocument, GmailSendResult } from '../../../core/services/crm-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { AppSettingsService } from '../../../core/services/app-settings.service';
import { ActivityCountBadgeComponent } from '../../../shared/components/activity-count-badge/activity-count-badge.component';

function getMonthRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const cur = now.toISOString().substring(0, 7);
  const shift = (n: number) => { const d = new Date(now.getFullYear(), now.getMonth() + n, 1); return d.toISOString().substring(0, 7); };
  switch (preset) {
    case '1m':  return { from: cur, to: cur };
    case '3m':  return { from: shift(-3), to: cur };
    case '6m':  return { from: shift(-6), to: cur };
    case 'ytd': return { from: `${now.getFullYear()}-01`, to: cur };
    default:    return { from: shift(-11), to: cur };
  }
}

@Component({
  selector: 'wt-crm-partner-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ActivityCountBadgeComponent],
  template: `
<div class="detail-page" *ngIf="partner">
  <div class="detail-header">
    <button class="back-btn" routerLink="/crm/partners">← Partnerzy</button>
    <h1>{{(partner.dwh_partner_id ? (partner.dwh_company_name || partner.company) : partner.company)}}</h1>
    <span *ngIf="partner.switched_to_prod_at" style="font-size:12px;color:var(--gray-500);margin-left:8px;align-self:center">
      Aktywny od {{partner.switched_to_prod_at | date:'dd.MM.yyyy'}}
    </span>
    <span class="pbadge pbadge-{{partner.status}}">{{statusLabel(partner.status)}}</span>
    <span class="group-badge" *ngIf="partner.group_name">🏢 {{partner.group_name}}</span>
    <button class="btn-outline" (click)="openEdit()" [disabled]="!canEdit" [title]="canEdit ? 'Edytuj partnera' : 'Brak uprawnień do edycji tego partnera'">✏️ Edytuj</button>
  </div>

  <!-- Onboarding stepper + zadania -->
  <div class="onboarding-panel" *ngIf="partner.status === 'onboarding'">

    <!-- Pasek etapów -->
    <div class="onboarding-steps">
      <div *ngFor="let s of onboardingSteps; let i = index"
           class="step" [class.done]="partner.onboarding_step > i"
           [class.current]="activeStep === i"
           (click)="selectStep(i)" style="cursor:pointer">
        <div class="step-circle">
          <span *ngIf="partner.onboarding_step <= i">{{i + 1}}</span>
          <span *ngIf="partner.onboarding_step > i">✓</span>
        </div>
        <div class="step-label">{{s}}</div>
        <div class="step-tasks-count" *ngIf="tasksByStep[i]?.length">
          <span [class.all-done]="allTasksDone(i)">{{doneCount(i)}}/{{tasksByStep[i].length}}</span>
        </div>
      </div>
    </div>

    <!-- Panel zadań aktywnego etapu -->
    <div class="step-tasks-panel">
      <div class="step-tasks-header">
        <span class="step-tasks-title">📋 Zadania: <strong>{{onboardingSteps[activeStep]}}</strong></span>
        <button class="btn-sm" *ngIf="canEdit" (click)="openAddTask()" style="font-size:12px">+ Dodaj zadanie</button>
        <button class="btn-sm"
                *ngIf="partner.onboarding_step === activeStep && isManager && allTasksDone(activeStep) && activeStep < 3"
                (click)="advanceStep(activeStep + 1)"
                style="background:#22c55e;color:white;border:none">
          Następny etap →
        </button>
        <button class="btn-sm"
                *ngIf="partner.onboarding_step === activeStep && isManager && allTasksDone(activeStep) && activeStep === 3"
                (click)="finishOnboarding()"
                style="background:#22c55e;color:white;border:none">
          Zakończ wdrożenie ✓
        </button>
      </div>

      <!-- Formularz nowego zadania -->
      <div class="task-form" *ngIf="showTaskForm && activeStep === taskFormStep">
        <div class="task-form-row">
          <select [(ngModel)]="taskForm.type" class="tf-sel">
            <option value="task">✅ Zadanie</option>
            <option value="call">📞 Połączenie</option>
            <option value="email">📧 Email</option>
            <option value="meeting">🤝 Spotkanie</option>
            <option value="doc_sent">📄 Dokument</option>
            <option value="training">🎓 Szkolenie</option>
          </select>
          <input [(ngModel)]="taskForm.title" placeholder="Tytuł zadania *" class="tf-input" style="flex:1">
        </div>
        <div class="task-form-row">
          <select [(ngModel)]="taskForm.assigned_to" class="tf-sel" style="flex:1">
            <option value="">— osoba odpowiedzialna —</option>
            <option *ngFor="let u of crmUsers" [value]="u.id">{{u.display_name}}</option>
          </select>
          <label style="font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:4px;white-space:nowrap">
            Termin: <input type="date" [(ngModel)]="taskForm.due_date" class="tf-input" style="width:140px">
          </label>
        </div>
        <textarea [(ngModel)]="taskForm.body" placeholder="Opis (opcjonalnie)…" rows="2" class="tf-input tf-textarea"></textarea>
        <div class="task-form-actions">
          <button class="btn-sm" (click)="cancelTaskForm()">Anuluj</button>
          <button class="btn-sm primary" (click)="saveTask()" [disabled]="!taskForm.title || savingTask">
            {{savingTask ? '…' : 'Zapisz'}}
          </button>
        </div>
      </div>

      <!-- Lista zadań -->
      <div class="task-list" *ngIf="tasksByStep[activeStep]?.length; else noTasks">
        <div *ngFor="let t of tasksByStep[activeStep]" class="task-item" [class.task-done]="t.done">
          <button class="task-check" (click)="toggleTask(t)">{{t.done ? '✓' : '○'}}</button>
          <div class="task-body" *ngIf="editingTaskId !== t.id">
            <div class="task-title">
              <span class="task-type-icon">{{taskIcon(t.type)}}</span> {{t.title}}
            </div>
            <div class="task-meta">
              <span *ngIf="t.assigned_to_name">👤 {{t.assigned_to_name}}</span>
              <span *ngIf="t.due_date" [class.overdue]="isOverdue(t)">
                📅 {{t.due_date | date:'dd.MM.yyyy'}}
                <span *ngIf="isOverdue(t)" class="overdue-badge">Po terminie</span>
              </span>
              <span *ngIf="t.done && t.done_by_name" style="color:#22c55e">✓ {{t.done_by_name}}</span>
            </div>
            <div class="task-desc" *ngIf="t.body">{{t.body}}</div>
          </div>
          <div class="task-body task-edit" *ngIf="editingTaskId === t.id">
            <div class="task-form-row">
              <select [(ngModel)]="taskEditForm.type" class="tf-sel">
                <option value="task">✅ Zadanie</option>
                <option value="call">📞 Połączenie</option>
                <option value="email">📧 Email</option>
                <option value="meeting">🤝 Spotkanie</option>
                <option value="doc_sent">📄 Dokument</option>
                <option value="training">🎓 Szkolenie</option>
              </select>
              <input [(ngModel)]="taskEditForm.title" class="tf-input" style="flex:1">
            </div>
            <div class="task-form-row">
              <select [(ngModel)]="taskEditForm.assigned_to" class="tf-sel" style="flex:1">
                <option value="">— brak —</option>
                <option *ngFor="let u of crmUsers" [value]="u.id">{{u.display_name}}</option>
              </select>
              <input type="date" [(ngModel)]="taskEditForm.due_date" class="tf-input" style="width:140px">
            </div>
            <textarea [(ngModel)]="taskEditForm.body" rows="2" class="tf-input tf-textarea" placeholder="Opis…"></textarea>
            <div class="task-form-actions">
              <button class="btn-sm" (click)="cancelEditTask()">Anuluj</button>
              <button class="btn-sm primary" (click)="saveEditTask(t)" [disabled]="savingTask">{{savingTask ? '…' : 'Zapisz'}}</button>
            </div>
          </div>
          <div class="task-actions" *ngIf="editingTaskId !== t.id">
            <button class="task-act-btn" (click)="startEditTask(t)">✏️</button>
            <button class="task-act-btn del" (click)="deleteTask(t)">🗑️</button>
          </div>
        </div>
      </div>
      <ng-template #noTasks>
        <div class="task-empty">Brak zadań dla tego etapu. Kliknij „+ Dodaj zadanie".</div>
      </ng-template>
    </div>
  </div>

  <div class="detail-body">
    <div class="info-card">
      <h3>Informacje</h3>
      <div class="info-grid">
        <span class="lbl">Worktrips ID</span>
        <span>
          <span *ngIf="partner.dwh_partner_id" style="font-family:monospace;font-weight:600;color:var(--orange)">{{partner.dwh_partner_id}}</span>
          <span *ngIf="!partner.dwh_partner_id" style="color:var(--gray-400)">— nie ustawiono</span>
        </span>
        <span class="lbl">NIP <span class="dwh-badge" *ngIf="partner.dwh_partner_id">DWH</span></span>
        <span>{{(partner.dwh_partner_id ? partner.dwh_nip : partner.nip) || '—'}}</span>
        <span class="lbl">Branża</span><span>{{partner.industry || '—'}}</span>
        <span class="lbl">Strona WWW</span>
        <span>
          <a *ngIf="partner.website" [href]="partner.website" target="_blank" rel="noopener"
             style="color:var(--orange);word-break:break-all">{{partner.website}}</a>
          <span *ngIf="!partner.website">—</span>
        </span>
        <span class="lbl">Źródło</span><span>{{partner.source || '—'}}</span>
        <span class="lbl">Pierwszy kontakt</span>
        <span>{{partner.first_contact_date ? (partner.first_contact_date | date:'dd.MM.yyyy') : '—'}}</span>
        <span class="lbl">Opiekun</span><span>{{partner.manager_name || '—'}}</span>
        <span class="lbl">Umowa od</span><span>{{partner.contract_signed ? (partner.contract_signed | date:'dd.MM.yyyy') : '—'}}</span>
        <span class="lbl">Umowa do</span><span>{{partner.contract_expires ? (partner.contract_expires | date:'dd.MM.yyyy') : '—'}}</span>
        <span class="lbl">Obrót roczny</span><span class="accent">{{(partner.contract_value || 0) | number:'1.0-0'}} {{partner.annual_turnover_currency || 'PLN'}}</span>
        </div>
        <div class="info-row" *ngIf="partner.tags?.length">
          <span class="lbl">Tagi</span>
          <span>{{partner.tags?.join(', ')}}</span>

        <span class="lbl">Aktywni użytk.</span>
        <span>{{partner.active_users || 0}} aktywnych
        </span>
      </div>

      <!-- Partner Admin -->
      <div class="info-subsection" *ngIf="partner.admin_first_name || partner.admin_last_name || partner.admin_email || partner.dwh_partner_id">
        <div class="info-subsection-title">
          👤 Partner Admin
          <span class="dwh-badge" *ngIf="partner.admin_first_name_from_dwh || partner.admin_last_name_from_dwh || partner.admin_email_from_dwh">DWH</span>
        </div>
        <div class="info-grid">
          <span class="lbl">Imię <span class="dwh-badge" *ngIf="partner.admin_first_name_from_dwh">DWH</span></span>
          <span>{{partner.admin_first_name || '—'}}</span>
          <span class="lbl">Nazwisko <span class="dwh-badge" *ngIf="partner.admin_last_name_from_dwh">DWH</span></span>
          <span>{{partner.admin_last_name || '—'}}</span>
          <span class="lbl">Email <span class="dwh-badge" *ngIf="partner.admin_email_from_dwh">DWH</span></span>
          <span>{{partner.admin_email || '—'}}</span>
        </div>
      </div>

      <!-- Kontakt do spraw umowy -->
      <div class="info-subsection">
        <div class="info-subsection-title">Kontakt do spraw umowy</div>
        <div class="info-grid">
          <span class="lbl">Imię i nazwisko</span><span>{{partner.contact_name || '—'}}</span>
          <span class="lbl">Rola w firmie</span><span>{{partner.contact_title || '—'}}</span>
          <span class="lbl">Email</span><span>{{partner.email || '—'}}</span>
          <span class="lbl">Telefon</span><span>{{partner.phone || '—'}}</span>
        </div>
      </div>

      <!-- Billing Address -->
      <div class="info-subsection" *ngIf="partner.billing_address || partner.billing_zip || partner.billing_city || partner.billing_country || partner.billing_email_address || partner.dwh_partner_id">
        <div class="info-subsection-title">
          📍 Billing Address
          <span class="dwh-badge" *ngIf="partner.billing_address_from_dwh || partner.billing_zip_from_dwh || partner.billing_city_from_dwh || partner.billing_country_from_dwh || partner.billing_email_address_from_dwh">DWH</span>
        </div>
        <div class="info-grid">
          <span class="lbl">Adres <span class="dwh-badge" *ngIf="partner.billing_address_from_dwh">DWH</span></span>
          <span>{{partner.billing_address || '—'}}</span>
          <span class="lbl">Kod pocztowy <span class="dwh-badge" *ngIf="partner.billing_zip_from_dwh">DWH</span></span>
          <span>{{partner.billing_zip || '—'}}</span>
          <span class="lbl">Miasto <span class="dwh-badge" *ngIf="partner.billing_city_from_dwh">DWH</span></span>
          <span>{{partner.billing_city || '—'}}</span>
          <span class="lbl">Kraj <span class="dwh-badge" *ngIf="partner.billing_country_from_dwh">DWH</span></span>
          <span>{{partner.billing_country || '—'}}</span>
          <span class="lbl">Email <span class="dwh-badge" *ngIf="partner.billing_email_address_from_dwh">DWH</span></span>
          <span>{{partner.billing_email_address || '—'}}</span>
        </div>
      </div>

      <!-- Kontakt do spraw rozliczeń -->
      <div class="info-subsection">
        <div class="info-subsection-title">Kontakt do spraw rozliczeń</div>
        <div class="info-grid">
          <span class="lbl">Imię i nazwisko</span><span>{{partner.billing_contact_name || '—'}}</span>
          <span class="lbl">Rola w firmie</span><span>{{partner.billing_contact_title || '—'}}</span>
          <span class="lbl">Email</span><span>{{partner.billing_email || '—'}}</span>
          <span class="lbl">Telefon</span><span>{{partner.billing_phone || '—'}}</span>
        </div>
      </div>

      <!-- Finansowe dodatkowe -->
      <div class="info-subsection" *ngIf="partner.credit_limit_value != null || partner.deposit_value != null || partner.commission_value != null">
        <div class="info-subsection-title">Warunki finansowe</div>
        <div class="info-grid">
          <ng-container *ngIf="partner.credit_limit_value != null">
            <span class="lbl">Limit kredytowy</span>
            <span>{{partner.credit_limit_value | number:'1.0-2'}} {{partner.credit_limit_currency}}</span>
          </ng-container>
          <ng-container *ngIf="partner.deposit_value != null">
            <span class="lbl">Kwota depozytu</span>
            <span>{{partner.deposit_value | number:'1.0-2'}} {{partner.deposit_currency}}</span>
            <span class="lbl">Data wpłaty</span>
            <span>{{partner.deposit_date_in ? (partner.deposit_date_in | date:'dd.MM.yyyy') : '—'}}</span>
            <span class="lbl">Data zwrotu</span>
            <span>{{partner.deposit_date_out ? (partner.deposit_date_out | date:'dd.MM.yyyy') : '—'}}</span>
          </ng-container>
          <ng-container *ngIf="partner.commission_value != null">
            <span class="lbl">Prowizja WT/TM</span>
            <span>{{partner.commission_value | number:'1.0-4'}} · {{commissionBasisLabel(partner.commission_basis)}}</span>
          </ng-container>
        </div>
      </div>

      <div class="info-grid" style="margin-top:10px">
        <span class="lbl">Notatki</span><span class="notes">{{partner.notes || '—'}}</span>
        <ng-container *ngIf="partner.customer_service_note">
          <span class="lbl">Notatka <span class="dwh-badge">DWH</span></span>
          <span class="notes dwh-note" [innerHTML]="partner.customer_service_note"></span>
        </ng-container>
      </div>

      <!-- Dane dodatkowe — CRM + DWH -->
      <div class="info-subsection">
        <div class="info-subsection-title">⚙️ Dane dodatkowe</div>
        <div class="info-grid">
          <span class="lbl">% Online</span><span>{{partner.online_pct != null ? partner.online_pct + '%' : '—'}}</span>
          <ng-container *ngIf="partner.subdomain || partner.dwh_partner_id">
            <span class="lbl">Subdomena <span class="dwh-badge" *ngIf="partner.subdomain_from_dwh">DWH</span></span>
            <span style="font-family:monospace">{{partner.subdomain || '—'}}</span>
          </ng-container>
          <ng-container *ngIf="partner.language || partner.dwh_partner_id">
            <span class="lbl">Język <span class="dwh-badge" *ngIf="partner.language_from_dwh">DWH</span></span>
            <span>{{partner.language || '—'}}</span>
          </ng-container>
          <ng-container *ngIf="partner.partner_currency || partner.dwh_partner_id">
            <span class="lbl">Waluta <span class="dwh-badge" *ngIf="partner.partner_currency_from_dwh">DWH</span></span>
            <span>{{partner.partner_currency || '—'}}</span>
          </ng-container>
          <ng-container *ngIf="partner.dwh_currency">
            <span class="lbl">Waluta partnera <span class="dwh-badge">DWH</span></span>
            <span>{{partner.dwh_currency}}</span>
          </ng-container>
          <ng-container *ngIf="partner.country || partner.dwh_partner_id">
            <span class="lbl">Kraj <span class="dwh-badge" *ngIf="partner.country_from_dwh">DWH</span></span>
            <span>{{partner.country || '—'}}</span>
          </ng-container>
          <ng-container *ngIf="partner.max_debit != null">
            <span class="lbl">Limit kredytowy <span class="dwh-badge">DWH</span></span>
            <span>{{partner.max_debit | number:'1.2-2'}}</span>
          </ng-container>
        </div>
      </div>

      <!-- Agent -->
      <div *ngIf="partner.agent_name || partner.agent_email || partner.agent_phone"
           class="info-subsection">
        <div class="info-subsection-title">🤝 Dane Agenta</div>
        <div class="info-grid">
          <span class="lbl">Imię i nazwisko</span><span>{{partner.agent_name || '—'}}</span>
          <span class="lbl">Email</span><span>{{partner.agent_email || '—'}}</span>
          <span class="lbl">Telefon</span><span>{{partner.agent_phone || '—'}}</span>
        </div>
      </div>

      <!-- Powiązane dokumenty -->
      <div class="info-subsection">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div class="info-subsection-title" style="margin-bottom:0">📎 Dokumenty ({{linkedDocs.length}})</div>
          <button class="btn-sm" *ngIf="canEdit" (click)="showDocPicker = true" style="font-size:11px">+ Dodaj</button>
        </div>
        <div *ngIf="linkedDocs.length === 0" style="font-size:12px;color:#9ca3af;text-align:center;padding:8px">Brak powiązanych dokumentów</div>
        <div *ngFor="let d of linkedDocs"
             style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f9fafb;cursor:pointer"
             (click)="openDocument(d)" title="Przejdź do dokumentu">
          <span style="font-size:14px">📄</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              {{d.document_title || d.doc_number || 'Dokument #' + d.document_id}}
            </div>
            <div style="font-size:10px;color:#9ca3af">
              <span *ngIf="d.doc_number">#{{d.doc_number}} · </span>
              <span *ngIf="d.doc_type">{{d.doc_type}}</span>
            </div>
          </div>
          <button style="background:none;border:none;cursor:pointer;color:#d1d5db;font-size:13px;padding:2px 4px;border-radius:4px"
                  (click)="$event.stopPropagation(); unlinkDoc(d)" title="Usuń powiązanie">✕</button>
        </div>
      </div>

      <div *ngIf="activeOpps.length" class="opp-section">
        <h4>Szanse sprzedaży ({{ activeOpps.length }})</h4>
        <div *ngFor="let o of activeOpps" class="opp-item">
          <span class="opp-status-badge opp-st-{{o.opp_status}}">{{oppStatusLabel(o.opp_status)}}</span>
          <span class="opp-title">{{o.title}}</span>
          <span class="opp-value" *ngIf="o.opp_value">{{o.opp_value | number:'1.0-0'}} {{o.opp_currency}}</span>
          <span class="opp-due" *ngIf="o.opp_due_date">do {{o.opp_due_date | date:'dd.MM.yy'}}</span>
        </div>
      </div>
    </div>

    <div class="activities-card">
      <!-- Pasek tabów -->
      <div class="mid-tabs">
        <button class="tab-btn" [class.active]="midTab==='activities'" (click)="midTab='activities'">
          Aktywności
          <wt-activity-count-badge [activities]="partner.activities||[]"></wt-activity-count-badge>
        </button>
        <button class="tab-btn" [class.active]="midTab==='emails'" (click)="midTab='emails'; refreshEmailActivities()">
          📧 Maile
          <span *ngIf="emailActivityCount>0" class="email-badge">{{emailActivityCount}}</span>
        </button>
        <button class="tab-btn" [class.active]="midTab==='history'" (click)="midTab='history'; loadHistory()">Historia zmian</button>
      </div>

      <!-- ── Tab: Aktywności ─────────────────────────────────────────────── -->
      <div *ngIf="midTab==='activities'" style="overflow-y:auto;flex:1;padding:12px;display:flex;flex-direction:column;gap:0">
        <div *ngIf="canEdit" style="display:flex;justify-content:flex-end;margin-bottom:10px">
          <button class="btn-sm" (click)="openNewActivityForm()">+ Dodaj</button>
        </div>
        <div class="new-activity-form" *ngIf="showNewActivity">
          <select [(ngModel)]="actForm.type" class="act-sel" (ngModelChange)="onActTypeChange()">
            <option value="call">📞 Połączenie</option>
            <option value="meeting">🤝 Spotkanie</option>
            <option value="note">📝 Notatka</option>
            <option value="training">🎓 Szkolenie</option>
            <option value="qbr">📊 QBR</option>
            <option value="opportunity">💡 Szansa</option>
          </select>
          <input [(ngModel)]="actForm.title" placeholder="Tytuł *" class="act-input">
          <ng-container *ngIf="actForm.type !== 'email'">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
                Data i czas
                <input type="datetime-local" [(ngModel)]="actForm.activity_at" class="act-input" style="font-size:11px">
              </label>
              <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
                Przypisz do
                <select [(ngModel)]="actForm.assigned_to" class="act-sel" style="font-size:11px"><option value="">— ja (domyślnie) —</option><option *ngFor="let u of crmUsers" [value]="u.id">{{u.display_name}}</option></select>
              </label>
            </div>
          </ng-container>
          <ng-container *ngIf="actForm.type === 'meeting'">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
                Czas trwania (min)
                <input type="number" min="0" [(ngModel)]="actForm.duration_min" placeholder="np. 60" class="act-input" style="font-size:11px">
              </label>
            </div>
            <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
              Miejsce spotkania
              <input [(ngModel)]="actForm.meeting_location" placeholder="np. Sala konferencyjna A" class="act-input" style="font-size:11px">
            </label>
            <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
              Uczestnicy (emaile)
              <div class="participant-input-wrap">
                <div class="participant-chips">
                  <span *ngFor="let e of actForm.participantList; let i = index" class="participant-chip">
                    {{e}} <button (click)="removeParticipant(actForm, i)" type="button">✕</button>
                  </span>
                  <input class="participant-input" [(ngModel)]="participantQuery"
                         (ngModelChange)="filterSuggestions()"
                         (keydown.enter)="addParticipantFromInput(actForm)"
                         (keydown.Tab)="addParticipantFromInput(actForm)"
                         placeholder="Wpisz email lub imię…" autocomplete="off">
                </div>
                <div class="suggestions-dropdown" *ngIf="filteredSuggestions.length && participantQuery">
                  <div *ngFor="let s of filteredSuggestions" class="suggestion-item"
                       (mousedown)="pickSuggestion(actForm, s)">
                    <span style="font-weight:600">{{s.name}}</span>
                    <span style="color:#9ca3af;margin-left:6px;font-size:11px">{{s.email}}</span>
                  </div>
                </div>
              </div>
            </label>
          </ng-container>
          <ng-container *ngIf="actForm.type === 'opportunity'">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
                Status szansy
                <select [(ngModel)]="actForm.opp_status" class="act-input" style="font-size:11px">
                  <option value="new">Nowa</option>
                  <option value="in_progress">W trakcie</option>
                  <option value="closed">Zamknięta</option>
                </select>
              </label>
              <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
                Termin
                <input type="date" [(ngModel)]="actForm.opp_due_date" class="act-input" style="font-size:11px">
              </label>
            </div>
            <div style="display:grid;grid-template-columns:2fr 1fr;gap:6px">
              <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
                Wartość
                <input type="number" min="0" step="0.01" [(ngModel)]="actForm.opp_value" placeholder="0.00" class="act-input" style="font-size:11px">
              </label>
              <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
                Waluta
                <select [(ngModel)]="actForm.opp_currency" class="act-input" style="font-size:11px">
                  <option value="PLN">PLN</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </label>
            </div>
          </ng-container>
          <textarea [(ngModel)]="actForm.body" placeholder="Treść / opis…" rows="2" class="act-input"></textarea>
          <div class="act-actions">
            <button class="btn-sm" (click)="showNewActivity = false">Anuluj</button>
            <button class="btn-sm primary" (click)="addActivity()" [disabled]="!actForm.title || savingActivity">
              {{savingActivity ? '…' : 'Zapisz'}}
            </button>
          </div>
        </div>
        <div class="activity-list">
          <div *ngFor="let a of sortedActivities" class="act-item"
               [class.act-closed]="a.status==='closed'"
               [class.act-overdue]="a.status!=='closed' && a.activity_at && isActOverdue(a.activity_at)"
               [class.act-today]="a.status!=='closed' && a.activity_at && isActToday(a.activity_at)"
               style="cursor:pointer" (click)="openActModal(a)">
            <span class="act-icon">{{actIcon(a.type)}}</span>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <strong>{{actTypeName(a.type)}}: {{a.title}}</strong>
                <span class="act-status-badge act-status-{{a.status||'new'}}">{{actStatusLabel(a.status||'new')}}</span>
              </div>
              <div class="act-meta">
                <span *ngIf="a.activity_at">{{a.activity_at | date:'dd.MM.yyyy HH:mm'}} · </span>
                <span *ngIf="a.assigned_to_name">👤 {{a.assigned_to_name}}</span>
                <span *ngIf="!a.assigned_to_name">{{a.created_by_name}}</span>
              </div>
              <div *ngIf="a.body" class="act-text" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:400px">{{stripHtml(a.body)}}</div>
            </div>
          </div>
          <div class="empty-act" *ngIf="!sortedActivities.length">Brak aktywności.</div>
        </div>
      </div>

      <!-- ── Tab: Maile ──────────────────────────────────────────────────── -->
      <div *ngIf="midTab==='emails'" style="flex:1;display:flex;flex-direction:column;overflow:hidden">
        <div *ngIf="canEdit" style="display:flex;justify-content:flex-end;padding:10px 12px 0;flex-shrink:0">
          <button class="btn-sm" (click)="openEmailModal()">✉️ Wyślij</button>
        </div>
        <!-- Lista emaili -->
        <div style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:0;min-width:0">
          <div *ngIf="emailActivities.length===0" class="empty-act">Brak emaili. Wyślij pierwszą wiadomość klikając „✉️ Wyślij".</div>
          <div *ngFor="let a of emailActivities"
               class="act-item"
               style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:8px;cursor:pointer"
               [style.border-left]="selectedEmailActivity?.id===a.id ? '3px solid #3b82f6' : hasUnreadInActivity(a) ? '3px solid #ef4444' : '3px solid #dbeafe'"
               [style.background]="selectedEmailActivity?.id===a.id ? '#eff6ff' : hasUnreadInActivity(a) ? '#fef2f2' : 'white'"
               (click)="selectEmailForPanel(a)">
            <span class="act-icon">📧</span>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:6px">
                <strong style="flex:1">{{a.title}}</strong>
                <span *ngIf="hasUnreadInActivity(a)" style="width:8px;height:8px;border-radius:50%;background:#ef4444;flex-shrink:0" title="Nieprzeczytana"></span>
              </div>
              <div class="act-meta">
                <span *ngIf="a.activity_at">{{a.activity_at|date:'dd.MM.yyyy HH:mm'}} · </span>
                <span *ngIf="a.assigned_to_name">👤 {{a.assigned_to_name}}</span>
                <span *ngIf="!a.assigned_to_name && a.created_by_name">{{a.created_by_name}}</span>
                <span *ngIf="!a.assigned_to_name && !a.created_by_name" style="color:#ef4444">↩ Odpowiedź</span>
              </div>
              <div class="act-text" *ngIf="a.body" style="margin-top:4px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">{{stripHtml(a.body)}}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Tab: Historia zmian ────────────────────────────────────────── -->
      <div *ngIf="midTab==='history'" style="overflow-y:auto;flex:1;padding:12px">
        <div *ngIf="historyLoading" style="text-align:center;color:#9ca3af;padding:24px;font-size:13px">⏳ Ładowanie historii…</div>
        <div *ngIf="!historyLoading && history.length===0 && historyLoaded" class="empty-act">Brak wpisów historii.</div>
        <div *ngFor="let h of history" style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:12px">
          <div style="flex-shrink:0;width:6px;border-radius:3px;background:#f3f4f6;margin-top:2px"></div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;color:#111827">{{histLabel(h)}}</div>
            <div style="color:#9ca3af;font-size:11px;margin-top:2px">
              <span *ngIf="h.user_name">{{h.user_name}}</span>
              <span *ngIf="!h.user_name && h.user_email">{{h.user_email}}</span>
              <span *ngIf="!h.user_name && !h.user_email">System</span>
              · {{h.created_at | date:'dd.MM.yyyy HH:mm'}}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Right panel: DWH sales / email thread / products / docs -->
    <div class="right-panel">

      <!-- DWH: dane sprzedazowe -->
      <div *ngIf="partner.dwh_partner_id" class="dwh-box">
        <div class="dwh-box-title" style="justify-content:space-between">
          <div style="display:flex;align-items:center;gap:6px">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
            Dane sprzedażowe DWH
          </div>
          <select [(ngModel)]="salesPeriod" (ngModelChange)="onSalesPeriodChange()"
                  style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);border-radius:6px;color:white;font-size:10px;padding:2px 5px;cursor:pointer;outline:none;max-width:110px">
            <option value="1m" style="color:#374151">Bieżący mies.</option>
            <option value="3m" style="color:#374151">Ostatnie 3 mies.</option>
            <option value="6m" style="color:#374151">Ostatnie 6 mies.</option>
            <option value="12m" style="color:#374151">Ostatnie 12 mies.</option>
            <option value="ytd" style="color:#374151">YTD {{currentYear}}</option>
          </select>
        </div>
        <div *ngIf="salesDataLoading" style="text-align:center;color:rgba(255,255,255,.5);font-size:12px;padding:8px 0">Ładowanie…</div>
        <div *ngIf="!salesDataLoading && !partnerSalesKpi" style="text-align:center;color:rgba(255,255,255,.4);font-size:12px;padding:8px 0">Brak danych sprzedażowych</div>
        <div *ngIf="partnerSalesKpi" class="dwh-kpi-grid">
          <div class="dwh-kpi"><div class="dwh-kpi-val">{{(partnerSalesKpi.gross_turnover_pln||0)|number:'1.0-0'}}</div><div class="dwh-kpi-lbl">Obrót brutto PLN</div></div>
          <div class="dwh-kpi"><div class="dwh-kpi-val">{{(partnerSalesKpi.net_turnover_pln||0)|number:'1.0-0'}}</div><div class="dwh-kpi-lbl">Obrót netto PLN</div></div>
          <div class="dwh-kpi"><div class="dwh-kpi-val">{{(partnerSalesKpi.transactions_count||0)|number:'1.0-0'}}</div><div class="dwh-kpi-lbl">Transakcje</div></div>
          <div class="dwh-kpi"><div class="dwh-kpi-val">{{(partnerSalesKpi.pax_count||0)|number:'1.0-0'}}</div><div class="dwh-kpi-lbl">PAX</div></div>
          <div class="dwh-kpi dwh-kpi-wide"><div class="dwh-kpi-val" style="color:#86efac">{{(partnerSalesKpi.revenue_pln||0)|number:'1.0-0'}}</div><div class="dwh-kpi-lbl">Przychód netto PLN</div></div>
        </div>
      </div>

      <!-- Wybrany watek mailowy -->
      <div *ngIf="selectedEmailActivity" class="panel-email-box">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
          <div class="panel-email-title">&#128140; {{selectedEmailActivity.title}}</div>
          <button (click)="selectedEmailActivity=null;panelThreadMessages=[]" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:13px;line-height:1;flex-shrink:0">&#x2715;</button>
        </div>
        <div style="font-size:10px;color:#9ca3af;margin-bottom:10px">
          {{selectedEmailActivity.activity_at|date:'dd.MM.yyyy HH:mm'}}
          <span *ngIf="selectedEmailActivity.created_by_name"> · {{selectedEmailActivity.created_by_name}}</span>
        </div>
        <div *ngIf="panelLoadingThread" style="text-align:center;color:#9ca3af;font-size:12px;padding:8px">Ładowanie wątku…</div>
        <div *ngFor="let m of panelThreadMessages" class="panel-msg" [class.unread]="!isMessageRead(m)" [class.read]="isMessageRead(m)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:4px;margin-bottom:4px">
            <span [style.font-weight]="!isMessageRead(m) ? '700' : '600'" style="color:#374151;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{m.from}}</span>
            <span style="color:#9ca3af;font-size:10px;white-space:nowrap">{{m.date|date:'dd.MM HH:mm'}}</span>
          </div>
          <div style="color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:6px;cursor:pointer" (click)="openMsgModal(m)">{{m.snippet}}</div>
          <div style="display:flex;gap:6px">
            <button (click)="openMsgModal(m)" style="font-size:10px;padding:2px 8px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:4px;cursor:pointer;color:#374151">Otwórz</button>
            <button (click)="toggleMsgRead(m)"
                    style="font-size:10px;padding:2px 8px;border-radius:4px;cursor:pointer;border:1px solid"
                    [style.background]="isMessageRead(m) ? '#f3f4f6' : '#fef2f2'"
                    [style.border-color]="isMessageRead(m) ? '#e5e7eb' : '#fecaca'"
                    [style.color]="isMessageRead(m) ? '#6b7280' : '#dc2626'">
              {{isMessageRead(m) ? 'Przeczytana' : 'Nieprzeczytana'}}
            </button>
          </div>
        </div>
        <div *ngIf="!panelLoadingThread && panelThreadMessages.length===0 && selectedEmailActivity.body"
             style="font-size:11px;color:#374151;background:#f9fafb;border-radius:6px;padding:8px;margin-bottom:6px">
          {{stripHtml(selectedEmailActivity.body)}}
        </div>
        <button *ngIf="selectedEmailActivity.gmail_thread_id" class="comm-btn" style="margin-top:6px" (click)="replyToThread(selectedEmailActivity)">
          <span>&#x21a9;</span><div style="flex:1;text-align:left"><div style="font-size:12px;font-weight:600">Odpowiedz</div></div>
        </button>
      </div>

      <!-- Podzial produktowy -->
      <div *ngIf="partnerSalesProducts.length" class="prod-box">
        <div class="prod-box-title">Podział produktowy</div>
        <div *ngFor="let prod of partnerSalesProducts" class="prod-row">
          <span class="prod-name" [title]="prod.product_type">{{prod.product_type}}</span>
          <div class="prod-bar-wrap"><div class="prod-bar" [style.width.%]="((prod.gross_turnover_pln||0)/salesProductsMax)*100"></div></div>
          <span class="prod-val">{{(prod.gross_turnover_pln||0)|number:'1.0-0'}}</span>
        </div>
      </div>

      <!-- Powiazane dokumenty -->
      <div class="docs-box">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#9ca3af">Dokumenty ({{linkedDocs.length}})</div>
          <button class="btn-sm" *ngIf="canEdit" (click)="showDocPicker=true" style="font-size:11px">+ Dodaj</button>
        </div>
        <div *ngIf="linkedDocs.length===0 && partner.crm_uuid"
             style="display:flex;align-items:center;gap:6px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:8px 10px;margin-bottom:6px;font-size:12px;color:#9a3412">
          <span style="font-size:14px;color:#f97316">⚠️</span>
          <span><strong>Brak powiązanej umowy.</strong> Dodaj dokument, aby potwierdzić współpracę z partnerem.</span>
        </div>
        <div *ngIf="linkedDocs.length===0" style="font-size:12px;color:#9ca3af;text-align:center;padding:8px 0">Brak powiązanych dokumentów</div>
        <div *ngFor="let d of linkedDocs"
             style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f9fafb;cursor:pointer"
             (click)="openDocument(d)">
          <span style="font-size:14px">&#x1F4C4;</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{d.document_title || d.doc_number || ('Dokument #' + d.document_id)}}</div>
            <div style="font-size:10px;color:#9ca3af"><span *ngIf="d.doc_number">#{{d.doc_number}} · </span><span *ngIf="d.doc_type">{{d.doc_type}}</span></div>
          </div>
          <button style="background:none;border:none;cursor:pointer;color:#d1d5db;font-size:13px;padding:2px 4px;border-radius:4px"
                  (click)="$event.stopPropagation(); unlinkDoc(d)">&#x2715;</button>
        </div>
      </div>

    </div>
  </div>

  <!-- ï¿½?ï¿½? MODAL SZCZEGÓ�?ÓW AKTYWNOŚCI �?�? -->
  <div *ngIf="selectedAct" style="position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:400;display:flex;align-items:center;justify-content:center;padding:20px" (click)="closeActModal()">
    <div style="background:white;border-radius:14px;width:min(520px,100%);max-height:85vh;overflow-y:auto;box-shadow:0 12px 32px rgba(0,0,0,.15);display:flex;flex-direction:column" (click)="$event.stopPropagation()">
      <!-- Nagłówek -->
      <div style="padding:16px 20px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;gap:10px;position:sticky;top:0;background:white;z-index:1">
        <span style="font-size:12px;font-weight:600;color:#6b7280">{{actTypeName(selectedAct.type)}}</span>
        <span class="act-status-badge act-status-{{selectedAct.status||'new'}}">{{actStatusLabel(selectedAct.status||'new')}}</span>
        <span style="flex:1"></span>
        <button *ngIf="!actModalEditMode && canEditActivity(selectedAct)" style="background:#fff7ed;border:1px solid #fed7aa;color:#c2410c;border-radius:8px;padding:4px 12px;font-size:12px;cursor:pointer;font-weight:600" (click)="startEditActModal()">✏️ Edytuj</button>
        <button style="background:none;border:none;font-size:18px;color:#9ca3af;cursor:pointer" (click)="closeActModal()">✕</button>
      </div>

      <!-- Widok -->
      <div *ngIf="!actModalEditMode" style="padding:18px 20px;display:flex;flex-direction:column;gap:10px">
        <div style="font-family:'Sora',sans-serif;font-size:16px;font-weight:700;color:#18181b">{{selectedAct.title}}</div>
        <div *ngIf="selectedAct.activity_at" style="display:flex;gap:12px;font-size:13px;align-items:flex-start">
          <span style="color:#9ca3af;font-size:12px;min-width:100px;flex-shrink:0">📅 Data i czas</span>
          <span>{{selectedAct.activity_at | date:'dd.MM.yyyy HH:mm'}}</span>
        </div>
        <div *ngIf="selectedAct.assigned_to_name" style="display:flex;gap:12px;font-size:13px;align-items:flex-start">
          <span style="color:#9ca3af;font-size:12px;min-width:100px;flex-shrink:0">👤 Przypisano do</span>
          <span>{{selectedAct.assigned_to_name}}</span>
        </div>
        <div *ngIf="selectedAct.created_by_name" style="display:flex;gap:12px;font-size:13px;align-items:flex-start">
          <span style="color:#9ca3af;font-size:12px;min-width:100px;flex-shrink:0">✍️ Dodał</span>
          <span>{{selectedAct.created_by_name}}</span>
        </div>
        <div *ngIf="selectedAct.meeting_location" style="display:flex;gap:12px;font-size:13px">
          <span style="color:#9ca3af;font-size:12px;min-width:100px;flex-shrink:0">📍 Miejsce</span>
          <span>{{selectedAct.meeting_location}}</span>
        </div>
        <div *ngIf="selectedAct.participants" style="display:flex;gap:12px;font-size:13px">
          <span style="color:#9ca3af;font-size:12px;min-width:100px;flex-shrink:0">👥 Uczestnicy</span>
          <span style="word-break:break-all">{{selectedAct.participants}}</span>
        </div>
        <ng-container *ngIf="selectedAct.type === 'opportunity'">
          <div style="display:flex;gap:12px;font-size:13px">
            <span style="color:#9ca3af;font-size:12px;min-width:100px;flex-shrink:0">💡 Szansa</span>
            <span class="opp-status-badge opp-st-{{selectedAct.opp_status}}">{{oppStatusLabel(selectedAct.opp_status)}}</span>
            <span *ngIf="selectedAct.opp_value" style="font-weight:700;color:#f97316">{{selectedAct.opp_value | number:'1.0-0'}} {{selectedAct.opp_currency}}</span>
          </div>
        </ng-container>
        <div *ngIf="selectedAct.body" style="display:flex;gap:12px;font-size:13px;align-items:flex-start">
          <span style="color:#9ca3af;font-size:12px;min-width:100px;flex-shrink:0">📝 Opis</span>
          <span style="white-space:pre-line">{{selectedAct.body}}</span>
        </div>
        <div *ngIf="selectedAct.close_comment" style="display:flex;gap:12px;font-size:13px">
          <span style="color:#9ca3af;font-size:12px;min-width:100px;flex-shrink:0">💬 Komentarz</span>
          <span style="font-style:italic">{{selectedAct.close_comment}}</span>
        </div>
        <!-- Zamknij -->
        <div *ngIf="!actModalClosing && selectedAct.status !== 'closed' && canEditActivity(selectedAct)" style="margin-top:4px;display:flex;justify-content:flex-end">
          <button style="background:#f97316;color:white;border:none;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer" (click)="startCloseActModal()">✓ Zamknij aktywność</button>
        </div>
        <div *ngIf="actModalClosing" style="display:flex;flex-direction:column;gap:6px;margin-top:4px">
          <textarea [(ngModel)]="actModalCloseComment" placeholder="Komentarz zamknięcia *" rows="3"
                    style="border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;font-family:inherit;resize:vertical;width:100%;box-sizing:border-box"></textarea>
          <div style="display:flex;gap:6px;justify-content:flex-end">
            <button style="background:white;color:#374151;border:1px solid #d1d5db;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer" (click)="actModalClosing=false;actModalCloseComment=''">Anuluj</button>
            <button style="background:#f97316;color:white;border:none;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer" (click)="confirmCloseActModal()" [disabled]="!actModalCloseComment.trim() || savingActivity">{{savingActivity ? '…' : 'Zamknij'}}</button>
          </div>
        </div>
      </div>

      <!-- Edycja -->
      <div *ngIf="actModalEditMode" style="padding:18px 20px;display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;flex-direction:column;gap:5px">
          <label style="font-size:12px;font-weight:600;color:#374151">Typ</label>
          <select [(ngModel)]="actEditForm.type" class="act-sel">
            <option value="call">📞 Połączenie</option>
            <option value="meeting">🤝 Spotkanie</option>
            <option value="note">📝 Notatka</option>
            <option value="training">🎓 Szkolenie</option>
            <option value="qbr">📊 QBR</option>
            <option value="opportunity">💡 Szansa</option>
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px">
          <label style="font-size:12px;font-weight:600;color:#374151">Tytuł <span style="color:#dc2626">*</span></label>
          <input [(ngModel)]="actEditForm.title" class="act-input">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div style="display:flex;flex-direction:column;gap:5px">
            <label style="font-size:12px;font-weight:600;color:#374151">Data i godzina</label>
            <input type="datetime-local" [(ngModel)]="actEditForm.activity_at" class="act-input">
          </div>
          <div style="display:flex;flex-direction:column;gap:5px">
            <label style="font-size:12px;font-weight:600;color:#374151">Przypisz do handlowca</label>
            <select [(ngModel)]="actEditForm.assigned_to" class="act-sel">
              <option value="">— bez przypisania —</option>
              <option *ngFor="let u of crmUsers" [value]="u.id">{{u.display_name}}</option>
            </select>
          </div>
        </div>
        <ng-container *ngIf="actEditForm.type === 'meeting'">
          <div style="display:flex;flex-direction:column;gap:5px">
            <label style="font-size:12px;font-weight:600;color:#374151">Miejsce spotkania</label>
            <input [(ngModel)]="actEditForm.meeting_location" class="act-input">
          </div>
          <div style="display:flex;flex-direction:column;gap:5px">
            <label style="font-size:12px;font-weight:600;color:#374151">Uczestnicy</label>
            <input [(ngModel)]="actEditForm.participants" class="act-input" placeholder="emaile oddzielone przecinkiem">
          </div>
        </ng-container>
        <ng-container *ngIf="actEditForm.type === 'opportunity'">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="display:flex;flex-direction:column;gap:5px">
              <label style="font-size:12px;font-weight:600;color:#374151">Status szansy</label>
              <select [(ngModel)]="actEditForm.opp_status" class="act-sel">
                <option value="new">Nowa</option>
                <option value="in_progress">W trakcie</option>
                <option value="closed">Zamknięta</option>
              </select>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px">
              <label style="font-size:12px;font-weight:600;color:#374151">Termin</label>
              <input type="date" [(ngModel)]="actEditForm.opp_due_date" class="act-input">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px">
            <div style="display:flex;flex-direction:column;gap:5px">
              <label style="font-size:12px;font-weight:600;color:#374151">Wartość</label>
              <input type="number" min="0" step="0.01" [(ngModel)]="actEditForm.opp_value" class="act-input">
            </div>
            <div style="display:flex;flex-direction:column;gap:5px">
              <label style="font-size:12px;font-weight:600;color:#374151">Waluta</label>
              <select [(ngModel)]="actEditForm.opp_currency" class="act-sel">
                <option value="PLN">PLN</option><option value="EUR">EUR</option>
                <option value="USD">USD</option><option value="GBP">GBP</option>
              </select>
            </div>
          </div>
        </ng-container>
        <div style="display:flex;flex-direction:column;gap:5px">
          <label style="font-size:12px;font-weight:600;color:#374151">Opis / notatki</label>
          <textarea [(ngModel)]="actEditForm.body" rows="4" class="act-input" style="resize:vertical"></textarea>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
          <button style="background:white;color:#374151;border:1px solid #d1d5db;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer" (click)="actModalEditMode=false">Anuluj</button>
          <button style="background:#f97316;color:white;border:none;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer" (click)="saveEditActivityModal()" [disabled]="!actEditForm.title || savingActivity">{{savingActivity ? '…' : 'Zapisz zmiany'}}</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Edit modal -->
  <!-- Document Picker Modal -->
  <div class="modal-overlay" *ngIf="showDocPicker" (click)="showDocPicker = false">
    <div class="modal-wide" (click)="$event.stopPropagation()" style="width:min(640px,100%);background:white;border-radius:14px">
      <div class="modal-header">
        <h3>📎 Dodaj powiązany dokument</h3>
        <button class="close-btn" (click)="showDocPicker = false">✕</button>
      </div>
      <div class="modal-body" style="gap:10px">
        <div style="font-size:12px;color:#6b7280">Wyszukaj dokumenty po nazwie, numerze lub podmiocie (Entity). Widoczne są tylko dokumenty do których masz dostęp (min. Read).</div>
        <input class="act-input" style="font-size:13px;padding:8px 12px"
               [(ngModel)]="docSearch"
               (ngModelChange)="onDocSearch()"
               placeholder="Szukaj dokumentu…">
        <div *ngIf="docSearching" style="text-align:center;color:#9ca3af;font-size:12px;padding:12px">Wyszukuję…</div>
        <div *ngIf="!docSearching && docResults.length === 0 && docSearch.length > 1"
             style="text-align:center;color:#9ca3af;font-size:12px;padding:12px">Brak wyników</div>
        <div style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
          <div *ngFor="let doc of docResults"
               style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;transition:background .1s"
               [style.cursor]="doc._access==='read' ? 'default' : 'pointer'"
               [style.opacity]="doc._access==='read' ? '0.55' : '1'"
               [title]="doc._access==='read' ? 'Tylko odczyt — brak uprawnień do powiązania' : ''"
               [style.background]="isLinked(doc.id) ? '#f0fdf4' : 'white'"
               (click)="toggleLinkDoc(doc)">
            <span style="font-size:16px">📄</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{doc.name}}</div>
              <div style="font-size:10px;color:#9ca3af">
                <span *ngIf="doc.doc_number">#{{doc.doc_number}} · </span>
                <span>{{doc.doc_type}}</span>
              </div>
            </div>
            <span *ngIf="doc._access==='read'" style="font-size:11px;color:#9ca3af">🔒 Odczyt</span>
            <span *ngIf="doc._access!=='read' && isLinked(doc.id)" style="font-size:11px;font-weight:700;color:#16a34a">✓ Dodano</span>
            <span *ngIf="doc._access!=='read' && !isLinked(doc.id)" style="font-size:11px;color:#9ca3af">Dodaj</span>
          </div>
        </div>
        <div *ngIf="linkDocError" style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px 12px;font-size:12px;color:#dc2626">
          ⚠ {{linkDocError}}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-outline" (click)="showDocPicker = false">Zamknij</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" *ngIf="showEdit" (click)="showEdit = false">
    <div class="modal modal-wide" (click)="$event.stopPropagation()">
      <div class="modal-header">
        <h3>Edytuj partnera</h3>
        <button class="close-btn" (click)="showEdit = false">✕</button>
      </div>
      <div class="modal-body">

        <div class="edit-section">
          <div class="edit-section-title">Podstawowe</div>
          <div class="edit-row">
            <label>Nazwa firmy *<input [(ngModel)]="editForm.company" placeholder="Nazwa firmy" required></label>
            <label>Status
              <select [(ngModel)]="editForm.status">
                <option *ngFor="let s of dictStatuses" [value]="s"
                        [disabled]="s==='active' && hasOpenTasks && partner?.status==='onboarding'">
                  {{statusLabelStr(s)}} {{s==='active' && hasOpenTasks && partner?.status==='onboarding' ? '🔒' : ''}}
                </option>
              </select>
              <div *ngIf="hasOpenTasks && partner?.status === 'onboarding'" class="validation-msg" style="color:#f59e0b;margin-top:4px">
                ⚠ {{ openTasksCount }} niewykonan{{ openTasksCount === 1 ? 'e zadanie' : 'ych zadań' }} wdrożeniowych — nie można ustawić statusu Aktywny
              </div>
            </label>
          </div>
          <div class="edit-row">
            <label>
              Worktrips Partner ID
              <input [(ngModel)]="editForm.dwh_partner_id" type="number" placeholder="np. 42"
                     style="font-family:monospace" [disabled]="!isManager">
              <span style="font-size:10px;color:#7c3aed;margin-top:2px;display:block">
                ID partnera w systemie transakcyjnym Worktrips<span *ngIf="!isManager"> · tylko menedżerowie mogą edytować</span>
              </span>
            </label>
            <!-- NIP: edytowalny tylko dla partnerów bez DWH -->
            <label *ngIf="!partner?.dwh_partner_id">
              NIP <span style="color:#f97316">*</span>
              <input [(ngModel)]="editForm.nip" placeholder="PL1234567890" maxlength="14"
                     (ngModelChange)="validatePartnerNip()"
                     [style.border-color]="partnerNipEditError ? '#ef4444' : ''">
              <span *ngIf="partnerNipEditError" style="font-size:11px;color:#ef4444;margin-top:2px;display:block">{{ partnerNipEditError }}</span>
            </label>
            <label *ngIf="partner?.dwh_partner_id">
              NIP <span class="dwh-badge">DWH</span>
              <input [value]="partner?.dwh_nip || partner?.nip || ''" readonly
                     style="background:#f8f8f8;color:#9ca3af;cursor:not-allowed;font-family:monospace">
              <span style="font-size:10px;color:#7c3aed;margin-top:2px;display:block">Synchronizowane z DWH</span>
            </label>
          </div>
        </div>

        <!-- Partner Admin -->
        <div class="edit-section">
          <div class="edit-section-title">👤 Partner Admin</div>
          <div class="edit-row">
            <!-- admin_first_name -->
            <ng-container *ngIf="!isDwhFieldReadOnly('admin_first_name')">
              <label>Imię admina
                <input [(ngModel)]="editForm.admin_first_name" placeholder="np. Jan">
              </label>
            </ng-container>
            <div *ngIf="isDwhFieldReadOnly('admin_first_name')" class="dwh-readonly-field">
              <label>Imię admina <span class="dwh-badge">DWH</span></label>
              <span class="dwh-readonly-value">{{partner?.admin_first_name || '—'}}</span>
            </div>
            <!-- admin_last_name -->
            <ng-container *ngIf="!isDwhFieldReadOnly('admin_last_name')">
              <label>Nazwisko admina
                <input [(ngModel)]="editForm.admin_last_name" placeholder="np. Kowalski">
              </label>
            </ng-container>
            <div *ngIf="isDwhFieldReadOnly('admin_last_name')" class="dwh-readonly-field">
              <label>Nazwisko admina <span class="dwh-badge">DWH</span></label>
              <span class="dwh-readonly-value">{{partner?.admin_last_name || '—'}}</span>
            </div>
          </div>
          <div class="edit-row">
            <!-- admin_email -->
            <ng-container *ngIf="!isDwhFieldReadOnly('admin_email')">
              <label class="full">Email admina
                <input [(ngModel)]="editForm.admin_email" type="email" placeholder="admin@firma.pl">
              </label>
            </ng-container>
            <div *ngIf="isDwhFieldReadOnly('admin_email')" class="dwh-readonly-field full">
              <label>Email admina <span class="dwh-badge">DWH</span></label>
              <span class="dwh-readonly-value">{{partner?.admin_email || '—'}}</span>
            </div>
          </div>
          <div *ngIf="isDwhFieldReadOnly('admin_first_name') || isDwhFieldReadOnly('admin_last_name') || isDwhFieldReadOnly('admin_email')"
               style="font-size:11px;color:#7c3aed;margin-top:4px">
            🔒 Pola oznaczone DWH są synchronizowane z systemu transakcyjnego i nie mogą być edytowane.
          </div>
        </div>

        <div class="edit-section">
          <div class="edit-section-title">Kontakt do spraw umowy *</div>
          <div class="edit-row">
            <label>Imię i nazwisko *
              <input [(ngModel)]="editForm.contact_name" placeholder="Jan Kowalski"
                     [class.input-warn]="submitAttempted && !editForm.contact_name">
            </label>
            <label>Rola w firmie *
              <input [(ngModel)]="editForm.contact_title" placeholder="CEO"
                     [class.input-warn]="submitAttempted && !editForm.contact_title">
            </label>
          </div>
          <div class="edit-row">
            <label>Email *
              <input [(ngModel)]="editForm.email" type="email" placeholder="jan@firma.pl"
                     [class.input-warn]="submitAttempted && !editForm.email">
            </label>
            <label>Telefon *
              <input [(ngModel)]="editForm.phone" placeholder="+48 600 000 000"
                     [class.input-warn]="submitAttempted && !editForm.phone">
            </label>
          </div>
          <div class="validation-msg" *ngIf="submitAttempted && (!editForm.contact_name || !editForm.contact_title || !editForm.email || !editForm.phone)" style="color:#f59e0b">
            ⚠ Zalecane jest uzupełnienie wszystkich pól kontaktu do spraw umowy.
          </div>
        </div>

        <div class="edit-section">
          <div class="edit-section-title">Kontakt do spraw rozliczeń *</div>
          <div class="edit-row">
            <label>Imię i nazwisko *
              <input [(ngModel)]="editForm.billing_contact_name" placeholder="Anna Nowak"
                     [class.input-warn]="submitAttempted && !editForm.billing_contact_name">
            </label>
            <label>Rola w firmie *
              <input [(ngModel)]="editForm.billing_contact_title" placeholder="Kierownik rozliczeń"
                     [class.input-warn]="submitAttempted && !editForm.billing_contact_title">
            </label>
          </div>
          <div class="edit-row">
            <label>Email *
              <input [(ngModel)]="editForm.billing_email" type="email" placeholder="rozliczenia@firma.pl"
                     [class.input-warn]="submitAttempted && !editForm.billing_email">
            </label>
            <label>Telefon *
              <input [(ngModel)]="editForm.billing_phone" placeholder="+48 600 000 000"
                     [class.input-warn]="submitAttempted && !editForm.billing_phone">
            </label>
          </div>
          <div class="validation-msg" *ngIf="submitAttempted && (!editForm.billing_contact_name || !editForm.billing_contact_title || !editForm.billing_email || !editForm.billing_phone)" style="color:#f59e0b">
            ⚠ Zalecane jest uzupełnienie wszystkich pól kontaktu do spraw rozliczeń.
          </div>
        </div>

        <!-- Billing Address -->
        <div class="edit-section">
          <div class="edit-section-title">📍 Billing Address</div>
          <div class="edit-row">
            <!-- billing_address -->
            <ng-container *ngIf="!isDwhFieldReadOnly('billing_address')">
              <label class="full">Adres
                <input [(ngModel)]="editForm.billing_address" placeholder="ul. Przykładowa 1">
              </label>
            </ng-container>
            <div *ngIf="isDwhFieldReadOnly('billing_address')" class="dwh-readonly-field full">
              <label>Adres <span class="dwh-badge">DWH</span></label>
              <span class="dwh-readonly-value">{{partner?.billing_address || '—'}}</span>
            </div>
          </div>
          <div class="edit-row">
            <!-- billing_zip -->
            <ng-container *ngIf="!isDwhFieldReadOnly('billing_zip')">
              <label>Kod pocztowy
                <input [(ngModel)]="editForm.billing_zip" placeholder="00-000">
              </label>
            </ng-container>
            <div *ngIf="isDwhFieldReadOnly('billing_zip')" class="dwh-readonly-field">
              <label>Kod pocztowy <span class="dwh-badge">DWH</span></label>
              <span class="dwh-readonly-value">{{partner?.billing_zip || '—'}}</span>
            </div>
            <!-- billing_city -->
            <ng-container *ngIf="!isDwhFieldReadOnly('billing_city')">
              <label>Miasto
                <input [(ngModel)]="editForm.billing_city" placeholder="Warszawa">
              </label>
            </ng-container>
            <div *ngIf="isDwhFieldReadOnly('billing_city')" class="dwh-readonly-field">
              <label>Miasto <span class="dwh-badge">DWH</span></label>
              <span class="dwh-readonly-value">{{partner?.billing_city || '—'}}</span>
            </div>
          </div>
          <div class="edit-row">
            <!-- billing_country -->
            <ng-container *ngIf="!isDwhFieldReadOnly('billing_country')">
              <label>Kraj rozliczeniowy
                <input [(ngModel)]="editForm.billing_country" placeholder="Polska">
              </label>
            </ng-container>
            <div *ngIf="isDwhFieldReadOnly('billing_country')" class="dwh-readonly-field">
              <label>Kraj rozliczeniowy <span class="dwh-badge">DWH</span></label>
              <span class="dwh-readonly-value">{{partner?.billing_country || '—'}}</span>
            </div>
            <!-- billing_email_address -->
            <ng-container *ngIf="!isDwhFieldReadOnly('billing_email_address')">
              <label>Email rozliczeniowy
                <input [(ngModel)]="editForm.billing_email_address" type="email" placeholder="billing@firma.pl">
              </label>
            </ng-container>
            <div *ngIf="isDwhFieldReadOnly('billing_email_address')" class="dwh-readonly-field">
              <label>Email rozliczeniowy <span class="dwh-badge">DWH</span></label>
              <span class="dwh-readonly-value">{{partner?.billing_email_address || '—'}}</span>
            </div>
          </div>
          <div *ngIf="isDwhFieldReadOnly('billing_address') || isDwhFieldReadOnly('billing_zip') || isDwhFieldReadOnly('billing_city') || isDwhFieldReadOnly('billing_country') || isDwhFieldReadOnly('billing_email_address')"
               style="font-size:11px;color:#7c3aed;margin-top:4px">
            🔒 Pola oznaczone DWH są synchronizowane z systemu transakcyjnego i nie mogą być edytowane.
          </div>
        </div>

        <div class="edit-section">
          <div class="edit-section-title">Limit kredytowy</div>
          <div class="edit-row">
            <label>Wartość
              <input [(ngModel)]="editForm.credit_limit_value" type="number" min="0" placeholder="np. 50000">
            </label>
            <label>Waluta
              <select [(ngModel)]="editForm.credit_limit_currency">
                <option *ngFor="let c of dictCurrencies" [value]="c">{{c}}</option>
              </select>
            </label>
          </div>
        </div>

        <div class="edit-section">
          <div class="edit-section-title">Kwota depozytu</div>
          <div class="edit-row">
            <label>Wartość
              <input [(ngModel)]="editForm.deposit_value" type="number" min="0" placeholder="np. 10000">
            </label>
            <label>Waluta
              <select [(ngModel)]="editForm.deposit_currency">
                <option *ngFor="let c of dictCurrencies" [value]="c">{{c}}</option>
              </select>
            </label>
          </div>
          <div class="edit-row">
            <label>Data wpłaty<input [(ngModel)]="editForm.deposit_date_in" type="date"></label>
            <label>Data zwrotu<input [(ngModel)]="editForm.deposit_date_out" type="date"></label>
          </div>
        </div>

        <div class="edit-section">
          <div class="edit-section-title">Prowizja WT/TM</div>
          <div class="edit-row">
            <label>Wartość
              <input [(ngModel)]="editForm.commission_value" type="number" min="0" step="0.0001" placeholder="np. 0.05">
            </label>
            <label>Podstawa
              <select [(ngModel)]="editForm.commission_basis">
                <option value="">— brak —</option>
                <option *ngFor="let b of dictCommBasis" [value]="b">{{commissionBasisLabel(b)}}</option>
              </select>
            </label>
          </div>
        </div>

        <div class="edit-section">
          <div class="edit-section-title">Opiekun i Grupa</div>
          <div class="edit-row">
            <label>Opiekun / Handlowiec
              <select [(ngModel)]="editForm.manager_id">
                <option value="">— nieprzypisany —</option>
                <option *ngFor="let u of crmUsers" [value]="u.id">{{u.display_name}}</option>
              </select>
            </label>
            <label>Grupa partnerów
              <select [(ngModel)]="editForm.group_id">
                <option value="">— brak grupy —</option>
                <option *ngFor="let g of partnerGroups" [value]="g.id">{{g.name}}</option>
              </select>
            </label>
          </div>
        </div>

        <div class="edit-section">
          <div class="edit-section-title">🔍 Sprzedaż i źródło</div>
          <div class="edit-row">
            <label>Źródło
              <input [(ngModel)]="editForm.source" placeholder="np. targi, polecenie, cold call">
            </label>
            <label>Pierwszy kontakt
              <input [(ngModel)]="editForm.first_contact_date" type="date">
            </label>
          </div>
          <div class="edit-row">
            <label class="full">Strona WWW
              <input [(ngModel)]="editForm.website" type="url" placeholder="https://firma.pl">
            </label>
          </div>
        </div>

        <div class="edit-section">
          <div class="edit-section-title">Umowa i finansowe</div>
          <div class="edit-row">
            <label>Data podpisania<input [(ngModel)]="editForm.contract_signed" type="date"></label>
            <label>Data wygaśnięcia<input [(ngModel)]="editForm.contract_expires" type="date"></label>
          </div>
          <div class="edit-row">
            <label>Obrót roczny
              <div style="display:flex;gap:6px">
                <input [(ngModel)]="editForm.contract_value" type="number" min="0" placeholder="0" style="flex:1">
                <select [(ngModel)]="editForm.annual_turnover_currency" style="width:80px">
                  <option value="PLN">PLN</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="CHF">CHF</option>
                </select>
              </div>
            </label>
            <label>Aktywni użytkownicy<input [(ngModel)]="editForm.active_users" type="number" min="0" placeholder="0"></label>
          </div>
        </div>

        <!-- Dane dodatkowe — % Online + DWH-fillable: subdomain, language, partner_currency, country -->
        <div class="edit-section">
          <div class="edit-section-title">⚙️ Dane dodatkowe</div>
          <div class="edit-row">
            <label>% Online
              <select [(ngModel)]="editForm.online_pct">
                <option value="">— brak —</option>
                <option value="0">0%</option>
                <option value="10">10%</option>
                <option value="20">20%</option>
                <option value="30">30%</option>
                <option value="40">40%</option>
                <option value="50">50%</option>
                <option value="60">60%</option>
                <option value="70">70%</option>
                <option value="80">80%</option>
                <option value="90">90%</option>
                <option value="100">100%</option>
              </select>
            </label>
          </div>
          <!-- Subdomena -->
          <div class="edit-row">
            <ng-container *ngIf="!isDwhFieldReadOnly('subdomain')">
              <label class="full">Subdomena
                <input [(ngModel)]="editForm.subdomain" placeholder="np. acme" style="font-family:monospace">
                <span style="font-size:10px;color:#9ca3af;margin-top:2px;display:block">Adres subdomeny w systemie (wypełniany przy zakładaniu konta testowego)</span>
              </label>
            </ng-container>
            <div *ngIf="isDwhFieldReadOnly('subdomain')" class="dwh-readonly-field full">
              <label>Subdomena <span class="dwh-badge">DWH</span></label>
              <span class="dwh-readonly-value" style="font-family:monospace">{{partner?.subdomain || '—'}}</span>
            </div>
          </div>
          <!-- Język + Waluta -->
          <div class="edit-row">
            <ng-container *ngIf="!isDwhFieldReadOnly('language')">
              <label>Język
                <input [(ngModel)]="editForm.language" placeholder="np. pl">
              </label>
            </ng-container>
            <div *ngIf="isDwhFieldReadOnly('language')" class="dwh-readonly-field">
              <label>Język <span class="dwh-badge">DWH</span></label>
              <span class="dwh-readonly-value">{{partner?.language || '—'}}</span>
            </div>
            <ng-container *ngIf="!isDwhFieldReadOnly('partner_currency')">
              <label>Waluta partnera
                <select [(ngModel)]="editForm.partner_currency">
                  <option value="">— brak —</option>
                  <option *ngFor="let c of dictCurrencies" [value]="c">{{c}}</option>
                </select>
              </label>
            </ng-container>
            <div *ngIf="isDwhFieldReadOnly('partner_currency')" class="dwh-readonly-field">
              <label>Waluta partnera <span class="dwh-badge">DWH</span></label>
              <span class="dwh-readonly-value">{{partner?.partner_currency || '—'}}</span>
            </div>
          </div>
          <!-- Kraj -->
          <div class="edit-row">
            <ng-container *ngIf="!isDwhFieldReadOnly('country')">
              <label>Kraj
                <input [(ngModel)]="editForm.country" placeholder="np. Polska">
              </label>
            </ng-container>
            <div *ngIf="isDwhFieldReadOnly('country')" class="dwh-readonly-field">
              <label>Kraj <span class="dwh-badge">DWH</span></label>
              <span class="dwh-readonly-value">{{partner?.country || '—'}}</span>
            </div>
          </div>
          <div *ngIf="isDwhFieldReadOnly('subdomain') || isDwhFieldReadOnly('language') || isDwhFieldReadOnly('partner_currency') || isDwhFieldReadOnly('country')"
               style="font-size:11px;color:#7c3aed;margin-top:4px">
            🔒 Pola oznaczone DWH są synchronizowane z systemu transakcyjnego i nie mogą być edytowane.
          </div>
        </div>

        <div class="edit-section">
          <div class="edit-section-title">Tagi i Notatki</div>
          <label style="font-size:12px;font-weight:600;color:#6b7280;display:flex;flex-direction:column;gap:4px">Tagi (oddzielone przecinkiem)
            <input [(ngModel)]="editForm.tagsStr" placeholder="tag1, tag2" class="edit-input">
          </label>
          <textarea [(ngModel)]="editForm.notes" rows="3" class="edit-textarea" placeholder="Dowolne notatki…" style="margin-top:8px"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-outline" (click)="showEdit = false; submitAttempted = false">Anuluj</button>
        <button class="btn-primary" (click)="savePartner()" [disabled]="saving">
          {{saving ? 'Zapisywanie…' : 'Zapisz zmiany'}}
        </button>
      </div>
    </div>
  </div>
</div>
<div *ngIf="!partner && !loading" class="not-found">{{ loadError ? 'Błąd ładowania.' : 'Partner nie znaleziony.' }}</div>
<div *ngIf="loading" class="loading">�?adowanie…</div>

<!-- ── Gmail Compose Modal ─────────────────────────────────────────────────── -->
<div class="modal-overlay" *ngIf="showEmailModal" (click)="showEmailModal=false">
  <div class="modal-wide" (click)="$event.stopPropagation()" style="width:min(580px,100%);background:white;border-radius:14px;max-height:88vh;overflow-y:auto;display:flex;flex-direction:column">
    <div class="modal-header">
      <h3>✉️ Wyślij email</h3>
      <button class="close-btn" (click)="showEmailModal=false">✕</button>
    </div>

    <!-- Gmail not connected prompt -->
    <div *ngIf="!gmailConnected" class="modal-body" style="gap:16px;align-items:center;text-align:center;padding:32px 24px">
      <div style="font-size:40px">📧</div>
      <div style="font-size:15px;font-weight:700;color:#111827">Konto Gmail niepołączone</div>
      <div style="font-size:13px;color:#6b7280;max-width:380px">
        Aby wysyłać i odbierać emaile bezpośrednio z CRM, połącz swoje konto Gmail.
        Każdy handlowiec łączy własną skrzynkę.
      </div>
      <button *ngIf="gmailAuthUrl" (click)="connectGmail()"
         style="background:#f97316;color:white;border:none;border-radius:8px;padding:10px 24px;font-size:13px;font-weight:600;cursor:pointer;margin-top:4px">
        🔗 Połącz konto Gmail
      </button>
      <div *ngIf="!gmailAuthUrl" style="color:#9ca3af;font-size:12px">
        Brak konfiguracji OAuth. Skontaktuj się z administratorem.
      </div>
    </div>

    <!-- Normal compose form -->
    <ng-container *ngIf="gmailConnected">
      <div class="modal-body" style="gap:12px">
        <!-- Connected account info -->
        <div style="font-size:11px;color:#6b7280;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:6px 10px;display:flex;align-items:center;gap:6px">
          <span style="color:#16a34a">✓</span> Wysyłasz z: <strong>{{gmailEmail}}</strong>
        </div>
        <label style="font-size:12px;font-weight:600;display:flex;flex-direction:column;gap:4px">
          Do
          <div class="participant-chips" style="position:relative">
            <span *ngFor="let r of emailForm.recipientList; let i=index" class="participant-chip">
              {{r}}<button (click)="emailForm.recipientList.splice(i,1)" type="button">✕</button>
            </span>
            <input class="participant-input" [(ngModel)]="recipientQuery"
                   (keydown.enter)="addRecipient()" (keydown.Tab)="addRecipient()"
                   (input)="onRecipientInput()" (blur)="showRecipientSug=false"
                   placeholder="email@firma.pl" autocomplete="off">
            <div class="suggest-dropdown" *ngIf="showRecipientSug">
              <div *ngFor="let s of recipientSuggestions" class="suggest-item"
                   (mousedown)="pickRecipientSug(s)">
                <span style="font-weight:600">{{s.name}}</span>
                <span style="color:#9ca3af;margin-left:6px;font-size:11px">{{s.email}}</span>
              </div>
            </div>
          </div>
        </label>
        <!-- DW (CC): -->
        <label style="font-size:12px;font-weight:600;display:flex;flex-direction:column;gap:4px">
          DW
          <div class="participant-chips" style="position:relative">
            <span *ngFor="let r of emailForm.ccList; let i=index" class="participant-chip">
              {{r}}<button (click)="emailForm.ccList.splice(i,1)" type="button">✕</button>
            </span>
            <input class="participant-input" [(ngModel)]="ccQuery"
                   (keydown.enter)="addCc()" (keydown.Tab)="addCc()"
                   (input)="onCcInput()" (blur)="showCcSug=false"
                   placeholder="dw@firma.pl" autocomplete="off">
            <div class="suggest-dropdown" *ngIf="showCcSug">
              <div *ngFor="let s of ccSuggestions" class="suggest-item"
                   (mousedown)="pickCcSug(s)">
                <span style="font-weight:600">{{s.name}}</span>
                <span style="color:#9ca3af;margin-left:6px;font-size:11px">{{s.email}}</span>
              </div>
            </div>
          </div>
        </label>
        <label style="font-size:12px;font-weight:600;display:flex;flex-direction:column;gap:4px">
          Temat
          <input class="act-input" [(ngModel)]="emailForm.subject" placeholder="Temat wiadomości">
        </label>
        <div *ngIf="emailForm.threadId" style="font-size:11px;color:#6b7280;background:#eff6ff;border-radius:6px;padding:6px 10px;display:flex;align-items:center;gap:8px">
          <span>📎 Odpowiedź w wątku</span>
          <button (click)="emailForm.threadId=''" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:10px">✕ Usuń</button>
        </div>
        <label style="font-size:12px;font-weight:600;display:flex;flex-direction:column;gap:4px">
          Treść
          <textarea class="act-input" id="partner-email-body-textarea" [(ngModel)]="emailForm.body" rows="7" placeholder="Treść wiadomości…"></textarea>
          <div *ngIf="emailForm.quotedHtml" style="font-size:11px;color:#15803d;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:4px 10px;display:flex;align-items:center;gap:5px;margin-top:2px">
            📋 Historia korespondencji zostanie automatycznie dołączona
          </div>
        </label>
        <div style="font-size:12px;font-weight:600;display:flex;flex-direction:column;gap:4px">
          Załączniki
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <input type="file" multiple (change)="onAttachmentChange($event)" style="font-size:12px;color:#6b7280;flex:1;min-width:0">
            <button *ngIf="gmailConnected && !driveNeedsReauth"
                    (click)="openDrivePicker()" [disabled]="drivePickerLoading"
                    style="flex-shrink:0;font-size:11px;padding:4px 10px;border:1px solid #a5b4fc;border-radius:6px;background:#eef2ff;color:#4338ca;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:4px">
              <span *ngIf="!drivePickerLoading">📁 Z Google Drive</span>
              <span *ngIf="drivePickerLoading">⏳ Ładowanie…</span>
            </button>
          </div>
        </div>
        <div *ngIf="emailAttachments.length>0" style="display:flex;flex-wrap:wrap;gap:4px">
          <span *ngFor="let f of emailAttachments; let i=index"
                style="background:#eff6ff;color:#1d4ed8;border-radius:12px;padding:2px 8px;font-size:11px;display:flex;align-items:center;gap:4px">
            📎 {{f.name}}
            <button (click)="removeAttachment(i)" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:11px">✕</button>
          </span>
        </div>
        <div *ngIf="emailError" style="color:#ef4444;font-size:12px;background:#fef2f2;border-radius:6px;padding:6px 10px">⚠️ {{emailError}}</div>
      </div>
      <div class="modal-footer">
        <button class="btn-outline" (click)="showEmailModal=false">Anuluj</button>
        <button class="btn-primary" (click)="sendEmail()"
                [disabled]="sendingEmail||(!emailForm.recipientList?.length&&!recipientQuery?.trim())||!emailForm.subject">
          {{sendingEmail ? '⏳ Wysyłanie…' : '📤 Wyślij'}}
        </button>
      </div>
    </ng-container>

    <!-- Footer for not-connected state -->
    <div *ngIf="!gmailConnected" class="modal-footer">
      <button class="btn-outline" (click)="showEmailModal=false">Zamknij</button>
    </div>
  </div>
</div>

<!-- ── Message detail modal ─────────────────────────────────────────────────── -->
<div class="modal-overlay" *ngIf="showMsgModal" (click)="closeMsgModal()">
  <div class="modal-wide" (click)="$event.stopPropagation()" style="width:min(620px,100%);max-height:88vh;overflow-y:auto;display:flex;flex-direction:column">
    <div class="modal-header">
      <h3>📧 {{msgModalMsg?.subject || 'Wiadomość'}}</h3>
      <button class="close-btn" (click)="closeMsgModal()">✕</button>
    </div>
    <div class="modal-body" style="gap:10px" *ngIf="msgModalMsg && !msgModalReply">
      <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:12px">
        <span style="color:#9ca3af">Od:</span><span>{{msgModalMsg.from}}</span>
        <span style="color:#9ca3af">Do:</span><span>{{msgModalMsg.to}}</span>
        <span *ngIf="msgModalMsg.cc" style="color:#9ca3af">DW:</span>
        <span *ngIf="msgModalMsg.cc">{{msgModalMsg.cc}}</span>
        <span style="color:#9ca3af">Data:</span><span>{{msgModalMsg.date|date:'dd.MM.yyyy HH:mm'}}</span>
      </div>
      <div style="border-top:1px solid #f3f4f6;padding-top:10px;font-size:13px;color:#374151;max-height:320px;overflow-y:auto"
           [innerHTML]="msgModalMsg.body || msgModalMsg.snippet"></div>
      <!-- Attachments -->
      <div *ngIf="(msgModalMsg.attachments?.length||0)+(msgModalMsg.sentAttachments?.length||0)>0"
           style="display:flex;flex-wrap:wrap;gap:4px">
        <span *ngFor="let att of msgModalMsg.attachments" class="att-chip" style="background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;font-size:11px;padding:4px 10px">
          📎 {{att.filename}}
          <span class="att-chip-actions">
            <button class="att-action-btn view" (click)="$event.stopPropagation();viewAttachment(att,msgModalMsg)" title="Otwórz w przeglądarce">Podgląd</button>
            <button class="att-action-btn dl" (click)="$event.stopPropagation();downloadAtt(att,msgModalMsg)" title="Pobierz plik">Pobierz</button>
          </span>
        </span>
        <span *ngFor="let att of msgModalMsg.sentAttachments" class="att-chip" style="background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;font-size:11px;padding:4px 10px">
          📎 {{att.filename}}
          <span class="att-chip-actions">
            <button class="att-action-btn view" (click)="$event.stopPropagation();viewAttachment(att,msgModalMsg)" title="Otwórz w przeglądarce">Podgląd</button>
            <button class="att-action-btn dl" (click)="$event.stopPropagation();downloadAtt(att,msgModalMsg)" title="Pobierz plik">Pobierz</button>
          </span>
        </span>
      </div>
    </div>
    <!-- Reply form -->
    <div class="modal-body" style="gap:10px" *ngIf="msgModalReply">
      <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:4px">Odpowiedź</div>
      <div class="participant-chips" style="position:relative">
        <span *ngFor="let r of msgModalForm.recipientList; let i=index" class="participant-chip">
          {{r}}<button (click)="msgModalForm.recipientList.splice(i,1)" type="button">✕</button>
        </span>
        <input class="participant-input" [(ngModel)]="msgModalRecipientQuery"
               (keydown.enter)="pushMsgRecipient()"
               placeholder="Do…" autocomplete="off">
      </div>
      <div class="participant-chips" style="position:relative">
        <span *ngFor="let r of msgModalForm.ccList; let i=index" class="participant-chip">
          {{r}}<button (click)="msgModalForm.ccList.splice(i,1)" type="button">✕</button>
        </span>
        <input class="participant-input" [(ngModel)]="msgModalCcQuery"
               (keydown.enter)="pushMsgCc()"
               placeholder="DW…" autocomplete="off">
      </div>
      <input class="act-input" [(ngModel)]="msgModalForm.subject" placeholder="Temat">
      <textarea class="act-input" id="partner-msg-reply-textarea" [(ngModel)]="msgModalForm.body" rows="7" placeholder="Treść…"></textarea>
      <div *ngIf="msgModalForm.quotedHtml" style="font-size:11px;color:#15803d;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:4px 10px;display:flex;align-items:center;gap:5px;margin-top:2px">
        📋 Historia korespondencji zostanie automatycznie dołączona
      </div>
      <!-- Załączniki w odpowiedzi -->
      <div style="display:flex;flex-direction:column;gap:4px">
        <span style="font-size:12px;font-weight:600">Załączniki</span>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <input type="file" multiple (change)="onMsgReplyAttachmentChange($event)" style="font-size:12px;color:#6b7280;flex:1;min-width:0">
          <button *ngIf="gmailConnected && !driveNeedsReauth"
                  (click)="openDrivePicker('reply')" [disabled]="drivePickerLoading"
                  style="flex-shrink:0;font-size:11px;padding:4px 10px;border:1px solid #a5b4fc;border-radius:6px;background:#eef2ff;color:#4338ca;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:4px">
            <span *ngIf="!drivePickerLoading">📁 Z Google Drive</span>
            <span *ngIf="drivePickerLoading">⏳ Ładowanie…</span>
          </button>
        </div>
        <div *ngIf="msgModalAttachments.length>0" style="display:flex;flex-wrap:wrap;gap:4px">
          <span *ngFor="let f of msgModalAttachments; let i=index"
                style="background:#eff6ff;color:#1d4ed8;border-radius:12px;padding:2px 8px;font-size:11px;display:flex;align-items:center;gap:4px">
            📎 {{f.name}}
            <button (click)="removeMsgReplyAttachment(i)" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:11px">✕</button>
          </span>
        </div>
      </div>
      <div *ngIf="msgModalError" style="color:#ef4444;font-size:12px">⚠️ {{msgModalError}}</div>
    </div>
    <div class="modal-footer">
      <button class="btn-outline" (click)="closeMsgModal()">Zamknij</button>
      <button *ngIf="!msgModalReply" class="btn-primary" (click)="startMsgReply()">↩ Odpowiedz</button>
      <button *ngIf="msgModalReply" class="btn-primary" (click)="sendMsgReply()"
              [disabled]="msgModalSending||!msgModalForm.recipientList?.length||!msgModalForm.subject">
        {{msgModalSending ? '⏳ Wysyłanie…' : '📤 Wyślij odpowiedź'}}
      </button>
    </div>
  </div>
</div>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; flex:1; overflow:hidden; height:100%; }
    .detail-page { padding:20px; max-width:1400px; width:100%; height:100%; display:flex; flex-direction:column; overflow:hidden; box-sizing:border-box; }
    .detail-header { display:flex; align-items:center; gap:10px; margin-bottom:20px; flex-wrap:wrap; flex-shrink:0; }
    .back-btn { background:none; border:none; color:#f97316; cursor:pointer; font-size:13px; }
    .detail-header h1 { font-size:22px; font-weight:800; margin:0; flex:1; }
    .pbadge { padding:3px 10px; border-radius:10px; font-size:12px; font-weight:700; }
    .pbadge-active{background:#dcfce7;color:#166534} .pbadge-onboarding{background:#dbeafe;color:#1e40af}
    .pbadge-inactive{background:#f3f4f6;color:#374151} .pbadge-churned{background:#fee2e2;color:#991b1b}
    .group-badge { background:#f3f4f6; border-radius:8px; padding:3px 10px; font-size:11px; }
    .btn-outline { background:white; color:#374151; border:1px solid #d1d5db; border-radius:8px; padding:7px 14px; font-size:13px; cursor:pointer; }
    .btn-primary { background:#f97316; color:white; border:none; border-radius:8px; padding:7px 14px; font-size:13px; font-weight:600; cursor:pointer; }
    .btn-primary:disabled { opacity:.6; cursor:not-allowed; }
    /* Onboarding */
    /* Onboarding panel */
    .onboarding-panel { flex-shrink:0; margin-bottom:16px; background:white; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; }
    .onboarding-steps { display:flex; padding:16px 16px 0; border-bottom:1px solid #f3f4f6; }
    .step { flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; position:relative; padding-bottom:12px; }
    .step:not(:last-child)::after { content:''; position:absolute; top:14px; left:calc(50% + 16px); right:0; height:2px; background:#e5e7eb; }
    .step-circle { width:28px; height:28px; border-radius:50%; border:2px solid #e5e7eb; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; background:white; position:relative; z-index:1; transition:all .2s; }
    .step.done .step-circle { background:#f97316; border-color:#f97316; color:white; }
    .step.current .step-circle { border-color:#f97316; color:#f97316; box-shadow:0 0 0 3px rgba(249,115,22,.15); }
    .step-label { font-size:10px; color:#9ca3af; text-align:center; }
    .step.current .step-label { color:#f97316; font-weight:700; }
    .step.done .step-label { color:#6b7280; }
    .step-tasks-count { font-size:10px; font-weight:700; padding:1px 5px; border-radius:8px; background:#f3f4f6; color:#6b7280; }
    .step-tasks-count .all-done { color:#22c55e; }
    /* Tasks panel */
    .step-tasks-panel { padding:14px 16px; }
    .step-tasks-header { display:flex; align-items:center; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
    .step-tasks-title { font-size:12px; color:#374151; flex:1; }
    .step-tasks-title strong { color:#111827; }
    /* Task form */
    .task-form { background:#fafafa; border-radius:8px; padding:10px; margin-bottom:10px; display:flex; flex-direction:column; gap:7px; }
    .task-form-row { display:flex; gap:7px; align-items:center; }
    .tf-sel { border:1px solid #d1d5db; border-radius:6px; padding:5px 8px; font-size:12px; background:white; outline:none; font-family:inherit; }
    .tf-sel:focus { border-color:#f97316; }
    .tf-input { border:1px solid #d1d5db; border-radius:6px; padding:6px 10px; font-size:12px; font-family:inherit; outline:none; }
    .tf-input:focus { border-color:#f97316; }
    .tf-textarea { resize:vertical; width:100%; box-sizing:border-box; }
    .task-form-actions { display:flex; gap:6px; justify-content:flex-end; }
    /* Task list */
    .task-list { display:flex; flex-direction:column; gap:6px; }
    .task-item { display:flex; align-items:flex-start; gap:8px; padding:8px 10px; border:1px solid #f3f4f6; border-radius:8px; background:white; transition:background .1s; }
    .task-item:hover { background:#fafafa; }
    .task-item.task-done { background:#f9fafb; }
    .task-item.task-done .task-title { text-decoration:line-through; color:#9ca3af; }
    .task-check { width:22px; height:22px; border-radius:50%; border:2px solid #d1d5db; background:white; display:flex; align-items:center; justify-content:center; font-size:11px; cursor:pointer; flex-shrink:0; font-weight:700; transition:all .15s; }
    .task-item.task-done .task-check { background:#22c55e; border-color:#22c55e; color:white; }
    .task-check:hover { border-color:#f97316; }
    .task-body { flex:1; min-width:0; }
    .task-title { font-size:12.5px; font-weight:600; color:#111827; display:flex; align-items:center; gap:5px; }
    .task-type-icon { font-size:13px; }
    .task-meta { display:flex; gap:10px; flex-wrap:wrap; font-size:11px; color:#9ca3af; margin-top:3px; }
    .task-meta .overdue { color:#ef4444; }
    .overdue-badge { background:#fee2e2; color:#991b1b; border-radius:4px; padding:0 5px; font-size:10px; font-weight:600; }
    .task-desc { font-size:11px; color:#6b7280; margin-top:3px; white-space:pre-line; }
    .task-edit { display:flex; flex-direction:column; gap:6px; }
    .task-actions { display:flex; gap:3px; opacity:0; transition:opacity .15s; flex-shrink:0; }
    .task-item:hover .task-actions { opacity:1; }
    .task-act-btn { background:none; border:none; cursor:pointer; font-size:12px; padding:2px 4px; border-radius:4px; color:#9ca3af; }
    .task-act-btn:hover { background:#f3f4f6; color:#374151; }
    .task-act-btn.del:hover { color:#ef4444; }
    .task-empty { font-size:12px; color:#9ca3af; text-align:center; padding:16px; }
    /* Body */
    .detail-body { display:grid; grid-template-columns:320px 1fr 290px; gap:16px; flex:1; overflow:hidden; min-height:0; }
    @media(max-width:900px) { .detail-body{grid-template-columns:320px 1fr;} .right-panel{display:none} }
    @media(max-width:700px) { .detail-body{grid-template-columns:1fr;} }
    .info-card { background:white; border:1px solid #e5e7eb; border-radius:12px; padding:16px; overflow-y:auto; min-height:0; }
    .activities-card { background:white; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; min-height:0; display:flex; flex-direction:column; }
    .right-panel { display:flex; flex-direction:column; gap:12px; overflow-y:auto; min-height:0; }
    .dwh-box { background:linear-gradient(135deg,#166534 0%,#14532d 100%); border-radius:12px; padding:16px; color:white; flex-shrink:0; }
    .dwh-box-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:rgba(255,255,255,.6); margin-bottom:12px; display:flex; align-items:center; gap:6px; }
    .dwh-kpi-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .dwh-kpi { background:rgba(255,255,255,.1); border-radius:8px; padding:8px 10px; }
    .dwh-kpi-val { font-size:16px; font-weight:800; color:white; line-height:1; }
    .dwh-kpi-lbl { font-size:10px; color:rgba(255,255,255,.6); margin-top:3px; }
    .dwh-kpi-wide { grid-column:span 2; }
    .prod-box { background:white; border:1px solid #e5e7eb; border-radius:12px; padding:14px; flex-shrink:0; }
    .prod-box-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:#9ca3af; margin-bottom:10px; }
    .prod-row { display:flex; align-items:center; gap:8px; margin-bottom:7px; font-size:11px; }
    .prod-name { width:90px; color:#374151; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex-shrink:0; }
    .prod-bar-wrap { flex:1; background:#f3f4f6; border-radius:4px; height:6px; overflow:hidden; }
    .prod-bar { height:100%; background:#f97316; border-radius:4px; transition:width .4s; }
    .prod-val { width:64px; text-align:right; color:#9ca3af; flex-shrink:0; }
    .panel-email-box { background:white; border:1px solid #bfdbfe; border-radius:12px; padding:14px; flex-shrink:0; }
    .panel-email-title { font-size:11px; font-weight:700; color:#1d4ed8; margin-bottom:8px; padding-right:20px; display:flex; align-items:flex-start; gap:6px; }
    .panel-msg { border:1px solid #e5e7eb; border-radius:8px; padding:8px; margin-bottom:6px; font-size:11px; }
    .panel-msg.unread { border-left:3px solid #ef4444; }
    .panel-msg.read { border-left:3px solid #e5e7eb; }
    .docs-box { background:white; border:1px solid #e5e7eb; border-radius:12px; padding:14px; flex-shrink:0; }
    .info-card h3, .activities-card h3 { font-size:13px; font-weight:700; margin:0 0 12px; }
    .mid-tabs { display:flex; align-items:center; gap:0; padding:0 12px; border-bottom:2px solid #f3f4f6; flex-shrink:0; }
    .tab-btn { background:none; border:none; border-bottom:2px solid transparent; margin-bottom:-2px; padding:12px 14px; font-size:12px; font-weight:600; color:#9ca3af; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:5px; transition:color .15s,border-color .15s; }
    .tab-btn.active { color:#f97316; border-bottom-color:#f97316; }
    .tab-btn:hover:not(.active) { color:#374151; }
    .info-grid { display:grid; grid-template-columns:auto 1fr; gap:5px 10px; font-size:13px; }
    .lbl { color:#9ca3af; font-size:11px; white-space:nowrap; padding-top:2px; }
    .sub { color:#9ca3af; }
    .accent { color:#f97316; font-weight:700; }
    .notes { white-space:pre-line; }
    .dwh-note { white-space:normal; }
    .dwh-note p { margin:4px 0; }
    .dwh-note ul, .dwh-note ol { margin:4px 0 4px 18px; padding:0; }
    .dwh-note li { margin-bottom:2px; }
    .dwh-note strong, .dwh-note b { font-weight:700; }
    .dwh-note a { color:#f97316; text-decoration:underline; }
    .opp-section { margin-top:16px; padding-top:12px; border-top:1px solid #f3f4f6; }
    .opp-section h4 { font-size:12px; font-weight:700; margin:0 0 8px; }
    .opp-item { font-size:12px; margin-bottom:6px; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
    .opp-title { flex:1; font-weight:600; }
    .opp-value { font-weight:700; color:#f97316; }
    .opp-due { color:#9ca3af; font-size:11px; }
    .opp-status-badge { font-size:10px; font-weight:700; padding:1px 7px; border-radius:8px; white-space:nowrap; }
    .opp-st-new { background:#dbeafe; color:#1e40af; }
    .opp-st-in_progress { background:#fef3c7; color:#92400e; }
    .opp-st-closed { background:#f3f4f6; color:#6b7280; }
    .opp-type { font-size:10px; font-weight:700; padding:1px 6px; border-radius:6px; background:#f3f4f6; margin-right:4px; }
    .opp-type.upsell { background:#fef3c7; color:#92400e; }
    .opp-value { color:#f97316; font-weight:700; }
    .card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
    .card-header h3 { margin:0; }
    .btn-sm { font-size:12px; border:1px solid #e5e7eb; background:white; border-radius:6px; padding:3px 10px; cursor:pointer; }
    .btn-sm.primary { background:#f97316; color:white; border-color:#f97316; }
    .new-activity-form { background:#fafafa; border-radius:8px; padding:10px; margin-bottom:12px; margin-top:4px; display:flex; flex-direction:column; gap:7px; }
    .act-sel { border:1px solid #d1d5db; border-radius:6px; padding:5px 8px; font-size:12px; }
    .act-input { border:1px solid #d1d5db; border-radius:6px; padding:6px 10px; font-size:12px; font-family:inherit; resize:vertical; }
    .act-actions { display:flex; gap:6px; justify-content:flex-end; }
    .activity-list { display:flex; flex-direction:column; gap:10px; overflow-y:auto; }
    .act-item { display:flex; gap:10px; border-left:3px solid transparent; padding-left:6px; }
    .act-item.act-today { border-left-color:#bfdbfe; background:#eff6ff; border-radius:6px; }
    .act-item.act-overdue { border-left-color:#fca5a5; background:#fef2f2; border-radius:6px; }
    .act-item.act-closed { opacity:.65; }
    .act-status-badge { font-size:9px; font-weight:700; padding:1px 5px; border-radius:4px; text-transform:uppercase; letter-spacing:.04em; }
    .act-status-new { background:#f3f4f6; color:#6b7280; }
    .act-status-open { background:#dbeafe; color:#1d4ed8; }
    .act-status-closed { background:#d1fae5; color:#065f46; }
    .act-icon { font-size:18px; }
    .act-item strong { font-size:13px; }
    .act-meta { font-size:10px; color:#9ca3af; }
    .act-text { font-size:12px; color:#6b7280; margin-top:2px; white-space:pre-line; }
    .act-edit-form { display:flex;flex-direction:column;gap:6px;flex:1; }
    .act-controls { display:flex;gap:4px;align-self:flex-start;opacity:0;transition:opacity .15s; }
    .act-item:hover .act-controls { opacity:1; }
    .act-ctrl-btn { background:none;border:none;cursor:pointer;font-size:13px;padding:2px 4px;border-radius:4px;color:#9ca3af; }
    .act-ctrl-btn:hover { background:#f3f4f6;color:#374151; }
    .act-ctrl-btn.del:hover { color:#ef4444; }
    .participant-input-wrap { position:relative; }
    .participant-chips { display:flex;flex-wrap:wrap;gap:4px;align-items:center;border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;min-height:32px;background:white; }
    .participant-chip { display:inline-flex;align-items:center;gap:4px;background:#eff6ff;color:#1d4ed8;border-radius:12px;padding:1px 8px;font-size:11px; }
    .participant-chip button { background:none;border:none;cursor:pointer;color:#9ca3af;font-size:11px;padding:0;line-height:1; }
    .participant-chip button:hover { color:#ef4444; }
    .participant-input { border:none;outline:none;font-size:12px;min-width:120px;flex:1;font-family:inherit; }
    .suggestions-dropdown { position:absolute;top:100%;left:0;right:0;z-index:100;background:white;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);max-height:160px;overflow-y:auto;margin-top:2px; }
    .suggestion-item { padding:7px 12px;font-size:12px;cursor:pointer; }
    .suggestion-item:hover { background:#f9fafb; }
    .empty-act { color:#9ca3af; font-size:12px; text-align:center; padding:16px; }
    .loading, .not-found { padding:40px; text-align:center; color:#9ca3af; }
    /* Modal */
    .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:200; padding:16px; }
    .modal-wide { background:white; border-radius:14px; width:min(720px,100%); max-height:88vh; overflow-y:auto; display:flex; flex-direction:column; }
    .modal-header { display:flex; align-items:center; justify-content:space-between; padding:18px 24px 14px; border-bottom:1px solid #f3f4f6; position:sticky; top:0; background:white; z-index:1; }
    .modal-header h3 { margin:0; font-size:16px; font-weight:700; }
    .close-btn { background:none; border:none; font-size:18px; color:#9ca3af; cursor:pointer; }
    .modal-body { padding:20px 24px; display:flex; flex-direction:column; gap:16px; }
    .modal-footer { padding:14px 24px; border-top:1px solid #f3f4f6; display:flex; justify-content:flex-end; gap:8px; position:sticky; bottom:0; background:white; }
    .edit-section { display:flex; flex-direction:column; gap:10px; }
    .edit-section-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:#9ca3af; }
    .edit-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .edit-row label { display:flex; flex-direction:column; gap:4px; font-size:12px; font-weight:600; color:#374151; }
    .edit-row label.full { grid-column:1/-1; }
    .edit-row label input, .edit-row label select { border:1px solid #d1d5db; border-radius:6px; padding:7px 10px; font-size:13px; outline:none; font-family:inherit; background:white; }
    .edit-row label input:focus, .edit-row label select:focus { border-color:#f97316; }
    .edit-textarea { width:100%; border:1px solid #d1d5db; border-radius:6px; padding:8px 10px; font-size:13px; font-family:inherit; resize:vertical; outline:none; box-sizing:border-box; }
    .edit-textarea:focus { border-color:#f97316; }
    .info-subsection { margin-top:14px; padding-top:12px; border-top:1px solid #f3f4f6; }
    .info-subsection-title { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:#f97316; margin-bottom:8px; }
    .dwh-badge { display:inline-block; background:#ede9fe; color:#7c3aed; font-size:9px; font-weight:700; padding:1px 5px; border-radius:4px; text-transform:uppercase; letter-spacing:.3px; margin-left:4px; vertical-align:middle; }
    .dwh-readonly-field { display:flex; flex-direction:column; gap:4px; font-size:12px; font-weight:600; color:#374151; }
    .dwh-readonly-field.full { grid-column:1/-1; }
    .dwh-readonly-field label { font-size:12px; font-weight:600; color:#374151; display:flex; align-items:center; gap:4px; }
    .dwh-readonly-value { background:#faf5ff; border:1px solid #e9d5ff; border-radius:6px; padding:7px 10px; font-size:13px; color:#6b7280; cursor:not-allowed; }
    .input-error { border-color:#ef4444 !important; background:#fff5f5; }
    .input-warn  { border-color:#f59e0b !important; background:#fffbeb; }
    .validation-msg { font-size:11px; color:#ef4444; margin-top:2px; }
    .email-badge { background:#ef4444; color:white; border-radius:10px; font-size:10px; font-weight:700; padding:0 5px; line-height:16px; display:inline-block; }
    .suggest-dropdown { position:absolute;top:100%;left:0;right:0;z-index:300;background:white;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);max-height:180px;overflow-y:auto;margin-top:2px; }
    .suggest-item { padding:7px 12px;font-size:12px;cursor:pointer; }
    .suggest-item:hover { background:#f9fafb; }
    .att-chip { position:relative; display:inline-flex; align-items:center; gap:4px; border-radius:5px; padding:2px 7px; font-size:10px; cursor:default; user-select:none; }
    .att-chip::after { content:''; position:absolute; top:100%; left:0; right:0; height:6px; }
    .att-chip-actions { display:none; position:absolute; top:calc(100% + 2px); left:0; background:white; border:1px solid #e5e7eb; border-radius:7px; box-shadow:0 3px 10px rgba(0,0,0,.13); padding:3px; gap:2px; z-index:30; white-space:nowrap; align-items:center; min-width:max-content; }
    .att-chip:hover .att-chip-actions { display:flex; }
    .att-chip-actions:hover { display:flex; }
    .att-action-btn { background:none; border:none; cursor:pointer; padding:3px 10px; border-radius:5px; font-size:11px; white-space:nowrap; }
    .att-action-btn:hover { background:#f3f4f6; }
    .att-action-btn.dl { color:#1d4ed8; }
    .att-action-btn.view { color:#374151; }
  `],
})
export class CrmPartnerDetailComponent implements OnInit, OnDestroy {
  @Input() id!: string;
  private route  = inject(ActivatedRoute);
  private zone   = inject(NgZone);
  private cdr    = inject(ChangeDetectorRef);
  private api    = inject(CrmApiService);
  private auth     = inject(AuthService);
  private router   = inject(Router);
  private settings = inject(AppSettingsService);

  // Słowniki z app_settings
  get dictStatuses():  string[] { return this._dictArr('crm_partner_statuses', ['onboarding','active','inactive','churned']); }
  get dictCurrencies(): string[] { return this._dictArr('crm_currencies', ['PLN','EUR','USD','GBP','CHF']); }
  get dictCommBasis(): string[] { return this._dictArr('crm_commission_basis', ['nie_dotyczy','segmenty','rezerwacje','progi_obrotowe']); }
  get dictIndustries(): string[] { return this._dictArr('crm_industries', ['IT','Finance','Transport','Tourism','Healthcare','Retail','Manufacturing','Legal','Education','Other']); }
  get dictTitles():    string[] { return this._dictArr('crm_contact_titles', ['CEO','CFO','CTO','COO','VP','Director','Manager','Specialist','Owner','Other']); }

  // Nowe słowniki (Zadania A, B)
  get languageOptions(): string[] {
    return this._dictArr('crm_partner_languages', ['Polski','Angielski','Rosyjski','Rumuński','Niemiecki']);
  }
  get currencyOptions(): string[] {
    return this._dictArr('crm_currencies', ['PLN','EUR','USD','GBP','CHF']);
  }
  get countryOptions(): string[] {
    return this._dictArr('crm_partner_countries', ['Polska','Niemcy','Francja','Wielka Brytania','Czechy','Słowacja','Węgry','Rumunia','Ukraina','Rosja']);
  }

  // Walidacje
  isValidSubdomain(v: string): boolean {
    return /^[a-z0-9]{3,30}$/.test(v || '');
  }
  isValidEmail(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
  }
  onSubdomainInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    // Wymuś małe litery i tylko dozwolone znaki na bieżąco
    el.value = el.value.toLowerCase().replace(/[^a-z0-9]/g, '');
    this.editForm.subdomain = el.value;
  }

  get attachmentsFolderUrl(): string { return this.settings.get('partner_attachments_folder_url') as string || this.settings.get('lead_attachments_folder_url') as string || ''; }

  private _dictArr(key: string, fallback: string[]): string[] {
    try {
      const v = this.settings.get(key);
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') return JSON.parse(v);
    } catch(_) {}
    return fallback;
  }

  partner: Partner | null = null;
  loading        = false;
  loadError      = false;
  saving         = false;
  savingActivity = false;
  showNewActivity = false;
  showEdit = false;

  // ── Taby środkowej kolumny ───────────────────────────────────────────────────
  midTab: 'activities' | 'emails' | 'history' = 'activities';
  history: any[] = [];
  historyLoaded  = false;
  historyLoading = false;
  // Modal aktywności
  selectedAct: any = null;
  actModalEditMode = false;
  actModalClosing = false;
  actModalCloseComment = '';
  submitAttempted = false;
  partnerNipEditError = '';

  /**
   * Zwraca true gdy pole powinno być zablokowane do edycji (read-only z DWH).
   * Logika:
   *  - Zawsze edytowalne gdy brak połączenia z DWH (dwh_partner_id = null)
   *  - Read-only gdy DWH dostarczyło wartość (field_from_dwh = true) — niezależnie od statusu
   */
  isDwhFieldReadOnly(field: string): boolean {
    if (!this.partner) return false;
    if (!this.partner.dwh_partner_id) return false;
    return !!(this.partner as any)[field + '_from_dwh'];
  }

  validatePartnerNip(): void {
    const val = (this.editForm.nip || '').trim().toUpperCase();
    if (!val) { this.partnerNipEditError = 'NIP jest wymagany'; return; }
    const cc = val.slice(0, 2);
    const digits = val.slice(2);
    if (!/^[A-Z]{2}$/.test(cc)) { this.partnerNipEditError = 'Podaj kod kraju (2 litery), np. PL'; return; }
    if (cc === 'PL' && !/^\d{10}$/.test(digits)) { this.partnerNipEditError = 'Dla PL wymagane 10 cyfr po kodzie kraju'; return; }
    if (cc !== 'PL' && digits.length === 0) { this.partnerNipEditError = 'Podaj numer po kodzie kraju'; return; }
    this.partnerNipEditError = '';
  }
  editForm: any  = {};
  actForm: any   = { type: 'note', title: '', body: '', activity_at: '', duration_min: null, meeting_location: '', participantList: [] as string[], opp_value: null, opp_currency: 'PLN', opp_status: 'new', opp_due_date: '', assigned_to: '' };
  actEditForm: any = { type: 'note', title: '', body: '', activity_at: '', duration_min: null, meeting_location: '', participants: '', opp_value: null, opp_currency: 'PLN', opp_status: 'new', opp_due_date: '', assigned_to: '' };
  editingActId: number | null = null;
  closingActId: number | null = null;
  closeComment = '';
  allSuggestions: { email: string; name: string }[] = [];
  filteredSuggestions: { email: string; name: string }[] = [];
  participantQuery = '';
  crmUsers: CrmUser[] = [];
  partnerGroups: PartnerGroup[] = [];

  // Powiązane dokumenty
  linkedDocs: LinkedDocument[] = [];
  showDocPicker = false;
  linkDocError  = '';
  docSearch     = '';
  docResults: any[] = [];
  docSearching  = false;
  private docSearchTimer: any;

  // ── Gmail ────────────────────────────────────────────────────────────────────
  showEmailModal      = false;
  sendingEmail        = false;
  emailError          = '';
  emailForm: any      = { recipientList: [] as string[], ccList: [] as string[], subject: '', body: '', threadId: '', inReplyTo: '', references: '', quotedHtml: '' };
  recipientQuery      = '';
  ccQuery             = '';
  emailAttachments: File[] = [];
  threadMessages: any[] = [];
  loadingThread       = false;
  openThreadId        = '';
  selectedEmailActivity: any = null;
  panelThreadMessages: any[] = [];
  panelLoadingThread  = false;
  // Sales data (DWH)
  partnerSalesKpi: any = null;
  partnerSalesProducts: any[] = [];
  salesDataLoading = false;
  salesPeriod = 'ytd';
  readonly currentYear = new Date().getFullYear();
  gmailConnected      = false;
  gmailEmail          = '';
  gmailAuthUrl        = '';
  downloadingAttachment = '';
  drivePickerLoading  = false;
  driveNeedsReauth    = false;
  recipientSuggestions: { email: string; name: string }[] = [];
  ccSuggestions:        { email: string; name: string }[] = [];
  showRecipientSug      = false;
  showCcSug             = false;
  showMsgModal    = false;
  msgModalMsg: any = null;
  msgModalReply   = false;
  msgModalForm: any = { subject: '', body: '', recipientList: [] as string[], ccList: [] as string[], threadId: '', inReplyTo: '', references: '', quotedHtml: '' };
  msgModalRecipientQuery = '';
  msgModalCcQuery        = '';
  msgModalSending        = false;
  msgModalError          = '';
  msgModalAttachments: File[] = [];

  get emailActivities(): any[] {
    const all = (this.partner?.activities || [])
      .filter((a: any) => a.type === 'email')
      .sort((a: any, b: any) => (b.id || 0) - (a.id || 0));
    const byThread = new Map<string, any>();
    const noThread: any[] = [];
    for (const a of all) {
      if (!a.gmail_thread_id) { noThread.push(a); continue; }
      if (!byThread.has(a.gmail_thread_id)) {
        byThread.set(a.gmail_thread_id, { ...a });
      } else {
        if (!a.is_read) byThread.get(a.gmail_thread_id).is_read = false;
      }
    }
    return [...byThread.values(), ...noThread];
  }

  get newEmailCount(): number {
    return (this.partner?.activities || []).filter(
      (a: any) => a.type === 'email' && !a.is_read
    ).length;
  }

  get emailActivityCount(): number {
    return this.newEmailCount;
  }

  onboardingSteps = ['Umowa podpisana', 'Konfiguracja systemu', 'Szkolenie użytkowników', 'Gotowy'];
  activeStep = 0;
  // Tasks
  tasks: OnboardingTask[] = [];
  tasksByStep: Record<number, OnboardingTask[]> = { 0:[], 1:[], 2:[], 3:[] };
  showTaskForm = false;
  taskFormStep = 0;
  savingTask   = false;
  editingTaskId: number | null = null;
  taskForm: any = { type: 'task', title: '', body: '', assigned_to: '', due_date: '' };
  taskEditForm: any = { type: 'task', title: '', body: '', assigned_to: '', due_date: '' };

  get isManager() {
    const u = this.auth.user();
    return u?.is_admin || u?.crm_role === 'sales_manager';
  }

  get canEdit(): boolean {
    if (!this.partner) return false;
    if (this.isManager) return true;
    const u = this.auth.user();
    return this.partner.manager_id === u?.id;
  }

  get pid(): string | number { return this.partner?.crm_id || this.partner?.id || ''; }

  // ── Dokumenty powiązane ──────────────────────────────────────────
  loadLinkedDocs(id: number | string): void {
    this.api.getPartnerDocuments(id).subscribe({
      next: docs => this.zone.run(() => { this.linkedDocs = docs; this.cdr.markForCheck(); }),
      error: () => {},
    });
  }

  isLinked(docId: string): boolean {
    return this.linkedDocs.some(d => d.document_id === docId);
  }

  toggleLinkDoc(doc: any): void {
    if (!this.partner) return;
    if (doc._access === 'read') return;
    this.linkDocError = '';
    if (this.isLinked(doc.id)) {
      this.api.unlinkPartnerDocument(this.pid, doc.id).subscribe({
        next: () => this.zone.run(() => {
          this.linkedDocs = this.linkedDocs.filter(d => d.document_id !== doc.id);
          this.cdr.markForCheck();
        }),
        error: (err: any) => this.zone.run(() => {
          this.linkDocError = err?.error?.message || err?.error?.detail || 'Nie udało się usunąć powiązania.';
          this.cdr.markForCheck();
        }),
      });
    } else {
      this.api.linkPartnerDocument(this.pid, doc.id).subscribe({
        next: linked => this.zone.run(() => {
          this.linkedDocs = [...this.linkedDocs, { ...linked, document_title: doc.name, doc_number: doc.doc_number, doc_type: doc.doc_type }];
          this.cdr.markForCheck();
        }),
        error: (err: any) => this.zone.run(() => {
          this.linkDocError = err?.error?.message || err?.error?.detail || 'Nie udało się powiązać dokumentu. Sprawdź czy masz wymagane uprawnienia.';
          this.cdr.markForCheck();
        }),
      });
    }
  }

  unlinkDoc(d: LinkedDocument): void {
    if (!this.partner || !confirm('Usunąć powiązanie z dokumentem?')) return;
    this.api.unlinkPartnerDocument(this.pid, d.document_id).subscribe({
      next: () => this.zone.run(() => {
        this.linkedDocs = this.linkedDocs.filter(x => x.document_id !== d.document_id);
        this.cdr.markForCheck();
      }),
      error: () => {},
    });
  }

  openDocument(d: LinkedDocument): void {
    this.router.navigate(['/documents'], { queryParams: { open: d.document_id } });
  }

  onDocSearch(): void {
    this.linkDocError = '';
    clearTimeout(this.docSearchTimer);
    if (this.docSearch.length < 2) { this.docResults = []; this.cdr.markForCheck(); return; }
    this.docSearchTimer = setTimeout(() => {
      this.docSearching = true;
      this.cdr.markForCheck();
      this.api.searchDocuments(this.docSearch).subscribe({
        next: res => this.zone.run(() => {
          this.docResults = res.data || [];
          this.docSearching = false;
          this.cdr.markForCheck();
        }),
        error: () => this.zone.run(() => { this.docSearching = false; this.cdr.markForCheck(); }),
      });
    }, 350);
  }

  get sortedActivities(): any[] {
    return [...(this.partner?.activities || [])]
      .filter(a => a.type !== 'email')
      .sort((a, b) => {
        const ta = a.activity_at ? new Date(a.activity_at).getTime() : 0;
        const tb = b.activity_at ? new Date(b.activity_at).getTime() : 0;
        return tb - ta;
      });
  }

  get activeOpps(): any[] {
    return (this.partner?.all_opportunities || [])
      .filter((o: any) => o.opp_status !== 'closed')
      .sort((a: any, b: any) => (b.opp_value || 0) - (a.opp_value || 0));
  }

  oppStatusLabel(s: string | null): string {
    return { new: 'Nowa', in_progress: 'W trakcie', closed: 'Zamknięta' }[s || ''] || s || '—';
  }

  get openTasksCount(): number {
    return this.tasks.filter(t => !t.done).length;
  }

  get hasOpenTasks(): boolean {
    return this.openTasksCount > 0;
  }

  get adoptionPct() {
    if (!this.partner?.license_count) return 0;
    return Math.round(((this.partner.active_users || 0) / this.partner.license_count) * 100);
  }

  private gmailBc: BroadcastChannel | null = null;
  private emailPollInterval: any = null;

  private onGmailOauthResult(status: string): void {
    if (status !== 'connected') return;
    this.api.getGmailStatus().subscribe({
      next: s => this.zone.run(() => {
        this.gmailConnected = s.connected;
        this.gmailEmail     = s.email || '';
        this.gmailAuthUrl   = '';
        this.cdr.markForCheck();
      }),
      error: () => {},
    });
  }

  // storage event — główny mechanizm (nowa karta / popup przez redirecty)
  private gmailStorageHandler = (e: StorageEvent) => {
    if (e.key === 'gmail_oauth_connected' && e.newValue) {
      localStorage.removeItem('gmail_oauth_connected');
      this.onGmailOauthResult('connected');
    }
  };

  private _gmailMsgHandler = (ev: MessageEvent) => {
    if (ev.origin !== window.location.origin) return;
    if (ev.data?.type === 'gmail-oauth-result') {
      this.onGmailOauthResult(ev.data.status);
    }
  };

  ngOnInit() {
    const rawId = this.id || this.route.snapshot.paramMap.get('id') || '';
    if (!rawId) { this.loadError = true; return; }
    this.loadPartner(rawId);
    this.loadLinkedDocs(rawId);
    this.loadSuggestions(rawId);
    this.api.getGroups().subscribe({ next: g => { this.zone.run(() => { this.partnerGroups = g; this.cdr.markForCheck(); }); }, error: () => {} });
    this.api.getGmailStatus().subscribe({
      next: s => this.zone.run(() => { this.gmailConnected = s.connected; this.gmailEmail = s.email || ''; this.cdr.markForCheck(); }),
      error: () => {},
    });
    // storage event — główny mechanizm
    window.addEventListener('storage', this.gmailStorageHandler);
    // Fallback: BroadcastChannel
    try {
      this.gmailBc = new BroadcastChannel('gmail-oauth');
      this.gmailBc.onmessage = (e) => {
        if (e.data?.type === 'gmail-oauth-result') {
          this.onGmailOauthResult(e.data.status);
        }
      };
    } catch (_) {}
    // Fallback: postMessage
    window.addEventListener('message', this._gmailMsgHandler);
  }

  ngOnDestroy(): void {
    window.removeEventListener('storage', this.gmailStorageHandler);
    this.gmailBc?.close();
    this.gmailBc = null;
    window.removeEventListener('message', this._gmailMsgHandler);
    if (this.emailPollInterval) { clearInterval(this.emailPollInterval); this.emailPollInterval = null; }
  }

  private loadPartnerSalesData(p: any): void {
    if (!p.dwh_partner_id) return;
    this.salesDataLoading = true;
    this.cdr.markForCheck();
    const { from, to } = getMonthRange(this.salesPeriod);
    this.api.getPartnersReport({ partner_id: p.dwh_partner_id, period_from: from, period_to: to }).subscribe({
      next: (r: any) => this.zone.run(() => {
        // by_partner[0] gives individual partner data; kpi is the aggregate for the filtered set
        const row = r?.by_partner?.find((x: any) => x.partner_id === p.dwh_partner_id) ?? r?.by_partner?.[0] ?? r?.kpi ?? null;
        this.partnerSalesKpi = row;
        this.partnerSalesProducts = r?.by_product ?? [];
        this.salesDataLoading = false;
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => { this.salesDataLoading = false; this.cdr.markForCheck(); }),
    });
  }

  onSalesPeriodChange(): void {
    if (this.partner?.dwh_partner_id) this.loadPartnerSalesData(this.partner);
  }

  get salesProductsMax(): number {
    return Math.max(1, ...this.partnerSalesProducts.map((p: any) => p.gross_turnover_pln || 0));
  }

  private loadSuggestions(partnerId: number | string): void {
    this.api.getContactSuggestions(undefined, partnerId).subscribe({
      next: s => { this.allSuggestions = s; },
      error: () => {},
    });
  }

  loadPartner(numId?: number | string) {
    const id = numId ?? this.id;
    if (!id) return;
    this.loading = true;
    this.loadError = false;
    this.partner = null;
    if (this.emailPollInterval) { clearInterval(this.emailPollInterval); this.emailPollInterval = null; }
    this.api.getPartner(id).pipe(
      finalize(() => { this.zone.run(() => { this.loading = false; this.cdr.markForCheck(); }); })
    ).subscribe({
      next: p  => {
        this.zone.run(() => {
          this.partner = p;
          this.activeStep = p.onboarding_step || 0;
          this.cdr.markForCheck();
          if (p.status === 'onboarding') this.loadTasks(p.crm_id || p.id!);
          if (p.dwh_partner_id) this.loadPartnerSalesData(p);
          this.emailPollInterval = setInterval(() => this.refreshEmailActivities(), 30_000);
        });
      },
      error: () => { this.zone.run(() => { this.loadError = true; this.cdr.markForCheck(); }); },
    });
  }

  refreshEmailActivities(): void {
    if (!this.partner) return;
    this.api.getPartner(this.pid).subscribe({
      next: (fresh: any) => this.zone.run(() => {
        if (!this.partner) return;
        this.partner = { ...this.partner, activities: fresh.activities || [] };
        this.cdr.markForCheck();
      }),
      error: () => {},
    });
  }

  openEdit() {
    if (!this.partner) return;
    this.editForm = {
      company:               this.partner.company,
      status:                this.partner.status,
      nip:                   this.partner.nip || '',
      address:               (this.partner as any).address || '',
      industry:              this.partner.industry || '',
      contact_name:          this.partner.contact_name || '',
      contact_title:         this.partner.contact_title || '',
      email:                 this.partner.email || '',
      phone:                 this.partner.phone || '',
      billing_contact_name:  this.partner.billing_contact_name || '',
      billing_contact_title: this.partner.billing_contact_title || '',
      billing_email:         this.partner.billing_email || '',
      billing_phone:         this.partner.billing_phone || '',
      credit_limit_value:    this.partner.credit_limit_value ?? null,
      credit_limit_currency: this.partner.credit_limit_currency || 'PLN',
      deposit_value:         this.partner.deposit_value ?? null,
      deposit_currency:      this.partner.deposit_currency || 'PLN',
      deposit_date_in:       this.isoToDateInput(this.partner.deposit_date_in),
      deposit_date_out:      this.isoToDateInput(this.partner.deposit_date_out),
      commission_value:      this.partner.commission_value ?? null,
      commission_basis:      this.partner.commission_basis || 'nie_dotyczy',
      manager_id:            this.partner.manager_id || '',
      group_id:              this.partner.group_id || '',
      contract_signed:       this.isoToDateInput(this.partner.contract_signed),
      contract_expires:      this.isoToDateInput(this.partner.contract_expires),
      contract_value:        this.partner.contract_value ?? null,
      annual_turnover_currency: this.partner.annual_turnover_currency || 'PLN',
      online_pct:               this.partner.online_pct != null ? String(this.partner.online_pct) : '',
      active_users:          this.partner.active_users ?? null,
      tagsStr:               (this.partner.tags || []).join(', '),
      notes:                 this.partner.notes || '',
      website:               this.partner.website || '',
      source:                this.partner.source || '',
      first_contact_date:    this.isoToDateInput(this.partner.first_contact_date),
      // DWH-fillable fields — inicjalizowane zawsze (edytowalne lub read-only zależnie od isDwhFieldReadOnly)
      subdomain:             this.partner.subdomain || '',
      language:              this.partner.language || '',
      partner_currency:      this.partner.partner_currency || '',
      country:               this.partner.country || '',
      billing_address:       this.partner.billing_address || '',
      billing_zip:           this.partner.billing_zip || '',
      billing_city:          this.partner.billing_city || '',
      billing_country:       this.partner.billing_country || '',
      billing_email_address: this.partner.billing_email_address || '',
      admin_first_name:      this.partner.admin_first_name || '',
      admin_last_name:       this.partner.admin_last_name || '',
      admin_email:           this.partner.admin_email || '',
      // DWH Partner ID (edytowalny przez managerów)
      dwh_partner_id:        this.partner.dwh_partner_id || '',
    };
    this.submitAttempted = false;
    // Zawsze ładuj listę użytkowników przy otwarciu (manager i salesperson)
    if (!this.crmUsers.length) {
      this.api.getCrmUsers().subscribe({
        next: u => { this.zone.run(() => { this.crmUsers = u; this.cdr.markForCheck(); }); },
        error: () => {},
      });
    }
    this.showEdit = true;
  }

  savePartner() {
    this.submitAttempted = true;
    if (!this.editForm.company) return;
    if (!this.partner) return;

    const isDwhLinked = !!(this.partner as any)?.dwh_partner_id;
    // Walidacja NIP tylko dla partnerów bez DWH
    if (!isDwhLinked) {
      this.validatePartnerNip();
      if (this.partnerNipEditError) return;
    }

    this.saving = true;
    const payload: Partial<Partner> = {
      company:               this.editForm.company,
      status:                this.editForm.status,
      // NIP wysyłamy tylko dla partnerów bez DWH (dla DWH-linked NIP jest read-only kopią z DWH)
      ...(isDwhLinked ? {} : { nip: this.editForm.nip ? this.editForm.nip.trim().toUpperCase() : null }),
      industry:              this.editForm.industry || null,
      contact_name:          this.editForm.contact_name || null,
      contact_title:         this.editForm.contact_title || null,
      email:                 this.editForm.email || null,
      phone:                 this.editForm.phone || null,
      billing_contact_name:  this.editForm.billing_contact_name || null,
      billing_contact_title: this.editForm.billing_contact_title || null,
      billing_email:         this.editForm.billing_email || null,
      billing_phone:         this.editForm.billing_phone || null,
      credit_limit_value:    this.editForm.credit_limit_value != null && this.editForm.credit_limit_value !== '' ? +this.editForm.credit_limit_value : null,
      credit_limit_currency: this.editForm.credit_limit_currency || 'PLN',
      deposit_value:         this.editForm.deposit_value != null && this.editForm.deposit_value !== '' ? +this.editForm.deposit_value : null,
      deposit_currency:      this.editForm.deposit_currency || 'PLN',
      deposit_date_in:       this.editForm.deposit_date_in || null,
      deposit_date_out:      this.editForm.deposit_date_out || null,
      commission_value:      this.editForm.commission_value != null && this.editForm.commission_value !== '' ? +this.editForm.commission_value : null,
      commission_basis:      this.editForm.commission_basis || 'nie_dotyczy',
      manager_id:            this.editForm.manager_id || null,
      group_id:              this.editForm.group_id && this.editForm.group_id !== '' ? +this.editForm.group_id : null,
      contract_signed:       this.editForm.contract_signed || null,
      contract_expires:      this.editForm.contract_expires || null,
      contract_value:        this.editForm.contract_value != null && this.editForm.contract_value !== '' ? +this.editForm.contract_value : null,
      annual_turnover_currency: this.editForm.annual_turnover_currency || 'PLN',
      online_pct:               this.editForm.online_pct !== '' && this.editForm.online_pct != null ? +this.editForm.online_pct : null,
      active_users:          this.editForm.active_users != null && this.editForm.active_users !== '' ? +this.editForm.active_users : null,
      tags:                  this.editForm.tagsStr ? this.editForm.tagsStr.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      notes:                 this.editForm.notes || null,
      website:               this.editForm.website || null,
      source:                this.editForm.source || null,
      first_contact_date:    this.editForm.first_contact_date || null,
      // DWH Partner ID (tylko managerzy)
      ...(this.isManager ? { dwh_partner_id: this.editForm.dwh_partner_id !== '' && this.editForm.dwh_partner_id != null ? +this.editForm.dwh_partner_id : null } : {}),
      // DWH-fillable fields: wysyłamy tylko gdy pole NIE jest zablokowane przez DWH
      // Zasada: jeśli isDwhFieldReadOnly → pomijamy (wartość pochodzi z DWH, nie zapisujemy nad nią)
      ...(this.isDwhFieldReadOnly('subdomain')             ? {} : { subdomain:             this.editForm.subdomain             || null }),
      ...(this.isDwhFieldReadOnly('language')              ? {} : { language:              this.editForm.language              || null }),
      ...(this.isDwhFieldReadOnly('partner_currency')      ? {} : { partner_currency:      this.editForm.partner_currency      || null }),
      ...(this.isDwhFieldReadOnly('country')               ? {} : { country:               this.editForm.country               || null }),
      ...(this.isDwhFieldReadOnly('billing_address')       ? {} : { billing_address:       this.editForm.billing_address       || null }),
      ...(this.isDwhFieldReadOnly('billing_zip')           ? {} : { billing_zip:           this.editForm.billing_zip           || null }),
      ...(this.isDwhFieldReadOnly('billing_city')          ? {} : { billing_city:          this.editForm.billing_city          || null }),
      ...(this.isDwhFieldReadOnly('billing_country')       ? {} : { billing_country:       this.editForm.billing_country       || null }),
      ...(this.isDwhFieldReadOnly('billing_email_address') ? {} : { billing_email_address: this.editForm.billing_email_address || null }),
      ...(this.isDwhFieldReadOnly('admin_first_name')      ? {} : { admin_first_name:      this.editForm.admin_first_name      || null }),
      ...(this.isDwhFieldReadOnly('admin_last_name')       ? {} : { admin_last_name:       this.editForm.admin_last_name       || null }),
      ...(this.isDwhFieldReadOnly('admin_email')           ? {} : { admin_email:           this.editForm.admin_email           || null }),
    };
    const partnerId = this.pid;
    this.api.updatePartner(partnerId, payload).subscribe({
      next: () => {
        // Przeładuj pełne dane partnera przez GET /:id (z COALESCE + _from_dwh flagami z DWH JOIN).
        // Nie używamy wyniku PATCH bezpośrednio — nie zawiera pól DWH.
        this.api.getPartner(partnerId).subscribe({
          next: full => {
            this.zone.run(() => {
              this.partner = { ...full, activities: this.partner?.activities ?? full.activities };
              this.saving = false;
              this.showEdit = false;
              this.historyLoaded = false;
              if (this.midTab === 'history') this.loadHistory();
              this.cdr.markForCheck();
            });
          },
          error: () => {
            // Fallback — chociaż odśwież stronę
            this.zone.run(() => {
              this.saving = false;
              this.showEdit = false;
              this.loadPartner(partnerId);
              this.cdr.markForCheck();
            });
          },
        });
      },
      error: (err) => {
        this.zone.run(() => {
          this.saving = false;
          const msg = err?.error?.error || 'Błąd zapisu';
          alert(msg);
          this.cdr.markForCheck();
        });
      },
    });
  }

  loadTasks(partnerId: number | string): void {
    this.api.getOnboardingTasks(partnerId).subscribe({
      next: tasks => {
        this.zone.run(() => {
          this.tasks = tasks;
          this.tasksByStep = { 0:[], 1:[], 2:[], 3:[] };
          tasks.forEach(t => { if (this.tasksByStep[t.step]) this.tasksByStep[t.step].push(t); });
          this.cdr.markForCheck();
        });
      },
      error: () => {},
    });
  }

  selectStep(i: number): void {
    this.activeStep = i;
    this.showTaskForm = false;
    this.editingTaskId = null;
    this.cdr.markForCheck();
  }

  doneCount(step: number): number {
    return (this.tasksByStep[step] || []).filter(t => t.done).length;
  }

  allTasksDone(step: number): boolean {
    const tasks = this.tasksByStep[step] || [];
    return tasks.length === 0 || tasks.every(t => t.done);
  }

  isOverdue(t: OnboardingTask): boolean {
    if (!t.due_date || t.done) return false;
    return new Date(t.due_date) < new Date(new Date().toDateString());
  }

  taskIcon(type: string): string {
    return { task:'✅', call:'📞', email:'📧', meeting:'🤝', note:'📝', doc_sent:'📄', training:'🎓' }[type] || '✅';
  }

  openAddTask(): void {
    this.taskFormStep  = this.activeStep;
    this.taskForm      = { type: 'task', title: '', body: '', assigned_to: '', due_date: '' };
    this.showTaskForm  = true;
    this.editingTaskId = null;
    if (!this.crmUsers.length && this.partner) {
      this.api.getCrmUsers().subscribe({ next: u => { this.zone.run(() => { this.crmUsers = u; this.cdr.markForCheck(); }); }, error: () => {} });
    }
    this.cdr.markForCheck();
  }

  cancelTaskForm(): void { this.showTaskForm = false; this.cdr.markForCheck(); }

  saveTask(): void {
    if (!this.taskForm.title || !this.partner) return;
    this.savingTask = true;
    const payload = {
      step:        this.activeStep,
      title:       this.taskForm.title,
      body:        this.taskForm.body || null,
      type:        this.taskForm.type || 'task',
      assigned_to: this.taskForm.assigned_to || null,
      due_date:    this.taskForm.due_date || null,
    };
    this.api.createOnboardingTask(this.pid, payload).subscribe({
      next: task => {
        this.zone.run(() => {
          if (!this.tasksByStep[task.step]) this.tasksByStep[task.step] = [];
          this.tasksByStep[task.step] = [...this.tasksByStep[task.step], task];
          this.tasks = [...this.tasks, task];
          this.taskForm     = { type: 'task', title: '', body: '', assigned_to: '', due_date: '' };
          this.showTaskForm = false;
          this.savingTask   = false;
          this.cdr.markForCheck();
        });
      },
      error: () => { this.zone.run(() => { this.savingTask = false; this.cdr.markForCheck(); }); },
    });
  }

  startEditTask(t: OnboardingTask): void {
    this.editingTaskId = t.id;
    this.showTaskForm  = false;
    this.taskEditForm  = {
      type:        t.type,
      title:       t.title,
      body:        t.body || '',
      assigned_to: t.assigned_to || '',
      due_date:    t.due_date || '',
    };
    if (!this.crmUsers.length && this.partner) {
      this.api.getCrmUsers().subscribe({ next: u => { this.zone.run(() => { this.crmUsers = u; this.cdr.markForCheck(); }); }, error: () => {} });
    }
    this.cdr.markForCheck();
  }

  cancelEditTask(): void { this.editingTaskId = null; this.cdr.markForCheck(); }

  saveEditTask(t: OnboardingTask): void {
    if (!this.taskEditForm.title || !this.partner) return;
    this.savingTask = true;
    const payload = {
      title:       this.taskEditForm.title,
      body:        this.taskEditForm.body || null,
      type:        this.taskEditForm.type,
      assigned_to: this.taskEditForm.assigned_to || null,
      due_date:    this.taskEditForm.due_date || null,
    };
    this.api.updateOnboardingTask(this.pid, t.id, payload).subscribe({
      next: updated => {
        this.zone.run(() => {
          this.tasksByStep[t.step] = this.tasksByStep[t.step].map(x => x.id === t.id ? updated : x);
          this.tasks = this.tasks.map(x => x.id === t.id ? updated : x);
          this.editingTaskId = null;
          this.savingTask    = false;
          this.cdr.markForCheck();
        });
      },
      error: () => { this.zone.run(() => { this.savingTask = false; this.cdr.markForCheck(); }); },
    });
  }

  toggleTask(t: OnboardingTask): void {
    if (!this.partner) return;
    this.api.updateOnboardingTask(this.pid, t.id, { done: !t.done }).subscribe({
      next: updated => {
        this.zone.run(() => {
          this.tasksByStep[t.step] = this.tasksByStep[t.step].map(x => x.id === t.id ? updated : x);
          this.tasks = this.tasks.map(x => x.id === t.id ? updated : x);
          this.cdr.markForCheck();
        });
      },
      error: () => {},
    });
  }

  deleteTask(t: OnboardingTask): void {
    if (!this.partner || !confirm(`Usunąć zadanie "${t.title}"?`)) return;
    this.api.deleteOnboardingTask(this.pid, t.id).subscribe({
      next: () => {
        this.zone.run(() => {
          this.tasksByStep[t.step] = this.tasksByStep[t.step].filter(x => x.id !== t.id);
          this.tasks = this.tasks.filter(x => x.id !== t.id);
          this.cdr.markForCheck();
        });
      },
      error: () => {},
    });
  }

  finishOnboarding(): void {
    if (!this.partner) return;
    // Step 4 wyzwala isFinishing w backendzie → status='active', lead stage='onboarded'
    this.api.updateOnboardingStep(this.pid, 4).subscribe({
      next: p => {
        this.zone.run(() => {
          if (this.partner) {
            this.partner = { ...this.partner, ...p, activities: this.partner.activities };
            this.activeStep = 3;
            this.cdr.markForCheck();
          }
        });
      },
      error: (err) => {
        this.zone.run(() => {
          const msg = err?.error?.error || 'Nie można zakończyć wdrożenia';
          alert(msg);
          this.cdr.markForCheck();
        });
      },
    });
  }

  advanceStep(step: number) {
    if (!this.partner) return;
    this.api.updateOnboardingStep(this.pid, step).subscribe({
      next: p => {
        this.zone.run(() => {
          if (this.partner) {
            this.partner = { ...this.partner, ...p, activities: this.partner.activities };
            // Jeśli status zmienił się na active - przeładuj partnera
            if (p.status === 'active') {
              this.activeStep = 3;
            }
            this.cdr.markForCheck();
          }
        });
      },
      error: (err) => {
        this.zone.run(() => {
          const msg = err?.error?.error || 'Nie można zakończyć etapu';
          alert(msg);
          this.cdr.markForCheck();
        });
      },
    });
  }

  addActivity() {
    if (!this.actForm.title || !this.partner) return;
    this.savingActivity = true;
    const payload: any = {
      type:  this.actForm.type,
      title: this.actForm.title,
      body:  this.actForm.body || null,
    };
    if (this.actForm.type !== 'email') {
      payload.activity_at = this.actForm.activity_at || null;
      payload.assigned_to = this.actForm.assigned_to || null;
    }
    if (this.actForm.type === 'meeting') {
      if (this.actForm.duration_min) payload.duration_min = +this.actForm.duration_min;
      payload.meeting_location = this.actForm.meeting_location || null;
      payload.participants = (this.actForm.participantList || []).join(', ') || null;
    }
    if (this.actForm.type === 'opportunity') {
      payload.opp_value    = this.actForm.opp_value != null && this.actForm.opp_value !== '' ? +this.actForm.opp_value : null;
      payload.opp_currency = this.actForm.opp_currency || 'PLN';
      payload.opp_status   = this.actForm.opp_status || 'new';
      payload.opp_due_date = this.actForm.opp_due_date || null;
    }
    // Snapshot przed resetem formularza
    const meetingSnap = this.actForm.type === 'meeting' ? { ...payload } : null;
    this.api.createPartnerActivity(this.pid, payload).subscribe({
      next: newAct => {
        this.zone.run(() => {
          if (this.partner) {
            this.partner = { ...this.partner, activities: [newAct, ...(this.partner.activities || [])] };
          }
          this.actForm = { type: 'note', title: '', body: '', activity_at: '', duration_min: null, meeting_location: '', participantList: [], opp_value: null, opp_currency: 'PLN', opp_status: 'new', opp_due_date: '', assigned_to: '' };
          this.participantQuery = '';
          this.showNewActivity  = false;
          this.savingActivity   = false;
          this.cdr.markForCheck();
          if (meetingSnap) this.openGoogleCalendarForMeeting(meetingSnap);
        });
      },
      error: () => { this.zone.run(() => { this.savingActivity = false; this.cdr.markForCheck(); }); },
    });
  }

  openGoogleCalendarForMeeting(data: { title: string; activity_at?: string | null; duration_min?: number | null; body?: string | null; meeting_location?: string | null; participants?: string | null }): void {
    if (!data.activity_at) return;
    const pad    = (n: number) => String(n).padStart(2, '0');
    const toGCal = (d: Date)  => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const start  = new Date(data.activity_at);
    const end    = new Date(start.getTime() + (data.duration_min || 60) * 60_000);
    const params = new URLSearchParams({ action: 'TEMPLATE', text: data.title, dates: `${toGCal(start)}/${toGCal(end)}` });
    if (data.body)             params.set('details',  data.body);
    if (data.meeting_location) params.set('location', data.meeting_location);
    if (data.participants)     params.set('add',      data.participants);
    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank');
  }

  openNewActivityForm(): void {
    if (this.showNewActivity) { this.showNewActivity = false; return; }
    const currentUserId = this.auth.user()?.id || '';
    this.actForm = {
      type: 'note', title: '', body: '',
      activity_at: '', assigned_to: currentUserId,
      duration_min: null, meeting_location: '', participantList: [] as string[],
      opp_value: null, opp_currency: 'PLN', opp_status: 'new', opp_due_date: '',
    };
    this.participantQuery = '';
    if (!this.crmUsers.length) {
      this.api.getCrmUsers().subscribe({
        next: u => { this.zone.run(() => { this.crmUsers = u; this.cdr.markForCheck(); }); },
        error: () => {},
      });
    }
    this.showNewActivity = true;
  }

  // ── Gmail ────────────────────────────────────────────────────────────────────
  connectGmail(): void {
    if (!this.gmailAuthUrl) return;
    const popup = window.open(this.gmailAuthUrl, 'gmail-oauth', 'width=600,height=700,left=300,top=100');
    if (!popup) return;
    // Polling: gdy popup zostanie zamknięty — odśwież status Gmail
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        this.api.getGmailStatus().subscribe({
          next: s => this.zone.run(() => {
            this.gmailConnected = s.connected;
            this.gmailEmail     = s.email || '';
            if (s.connected) this.gmailAuthUrl = '';
            this.cdr.markForCheck();
          }),
          error: () => {},
        });
      }
    }, 500);
  }

  openEmailModal(prefillThreadId?: string): void {
    this.emailForm = {
      recipientList: this.partner?.email ? [this.partner.email] : (this.partner?.billing_email_address ? [this.partner.billing_email_address] : []),
      ccList: [],
      subject: '',
      body: '',
      threadId: prefillThreadId || '',
      inReplyTo: '',
      references: '',
      quotedHtml: '',
    };
    this.recipientQuery   = '';
    this.ccQuery          = '';
    this.emailAttachments = [];
    this.emailError       = '';
    if (!this.gmailConnected && !this.gmailAuthUrl) {
      this.api.getGmailAuthUrl().subscribe({
        next: r => this.zone.run(() => { this.gmailAuthUrl = r.url; this.showEmailModal = true; this.cdr.markForCheck(); }),
        error: () => this.zone.run(() => { this.gmailAuthUrl = ''; this.showEmailModal = true; this.cdr.markForCheck(); }),
      });
    } else {
      this.showEmailModal = true;
      this.cdr.markForCheck();
    }
  }

  downloadAttachment(att: any, messageId: string): void {
    if (this.downloadingAttachment === att.attachmentId) return;
    this.downloadingAttachment = att.attachmentId;
    this.cdr.markForCheck();
    this.api.downloadGmailAttachment(messageId, att.attachmentId, att.filename, att.mimeType || 'application/octet-stream').subscribe({
      next: blob => {
        this.zone.run(() => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = att.filename;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
          this.downloadingAttachment = '';
          this.cdr.markForCheck();
        });
      },
      error: () => this.zone.run(() => { this.downloadingAttachment = ''; this.cdr.markForCheck(); }),
    });
  }

  addRecipient(): void {
    const val = this.recipientQuery.trim();
    this.showRecipientSug = false;
    if (!val || !val.includes('@')) return;
    if (!this.emailForm.recipientList.includes(val)) {
      this.emailForm.recipientList.push(val);
    }
    this.recipientQuery = '';
    this.cdr.markForCheck();
  }

  onRecipientInput(): void {
    const q = this.recipientQuery.toLowerCase();
    if (!q) { this.showRecipientSug = false; return; }
    this.recipientSuggestions = this.allSuggestions.filter(
      s => !this.emailForm.recipientList.includes(s.email) &&
           (s.email.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
    ).slice(0, 8);
    this.showRecipientSug = this.recipientSuggestions.length > 0;
    this.cdr.markForCheck();
  }

  pickRecipientSug(s: { email: string; name: string }): void {
    if (!this.emailForm.recipientList.includes(s.email)) {
      this.emailForm.recipientList.push(s.email);
    }
    this.recipientQuery   = '';
    this.showRecipientSug = false;
    this.cdr.markForCheck();
  }

  addCc(): void {
    const val = this.ccQuery.trim();
    this.showCcSug = false;
    if (!val || !val.includes('@')) return;
    if (!this.emailForm.ccList.includes(val)) {
      this.emailForm.ccList.push(val);
    }
    this.ccQuery = '';
    this.cdr.markForCheck();
  }

  onCcInput(): void {
    const q = this.ccQuery.toLowerCase();
    if (!q) { this.showCcSug = false; return; }
    this.ccSuggestions = this.allSuggestions.filter(
      s => !this.emailForm.ccList.includes(s.email) &&
           (s.email.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
    ).slice(0, 8);
    this.showCcSug = this.ccSuggestions.length > 0;
    this.cdr.markForCheck();
  }

  pickCcSug(s: { email: string; name: string }): void {
    if (!this.emailForm.ccList.includes(s.email)) {
      this.emailForm.ccList.push(s.email);
    }
    this.ccQuery   = '';
    this.showCcSug = false;
    this.cdr.markForCheck();
  }

  /** Parsuje "Name <email>, email2" → ['email1', 'email2'] */
  parseAddressList(header: string): string[] {
    if (!header) return [];
    return header.split(',').map((s: string) => {
      const m = s.trim().match(/<([^>]+)>/);
      return m ? m[1].trim().toLowerCase() : s.trim().toLowerCase();
    }).filter((s: string) => s.includes('@'));
  }

  onAttachmentChange(event: Event): void {
    const files = (event.target as HTMLInputElement).files;
    if (files) this.emailAttachments = [...this.emailAttachments, ...Array.from(files)];
    this.cdr.markForCheck();
  }

  removeAttachment(idx: number): void {
    this.emailAttachments.splice(idx, 1);
    this.cdr.markForCheck();
  }

  openDrivePicker(target: 'compose' | 'reply' = 'compose'): void {
    this.drivePickerLoading = true;
    this.driveNeedsReauth   = false;
    this.cdr.markForCheck();

    Promise.all([
      this.api.getDrivePickerConfig().toPromise(),
      this.api.getDriveToken().toPromise(),
    ]).then(([cfg, tok]) => {
      if (!cfg || !tok) { this.drivePickerLoading = false; this.cdr.markForCheck(); return; }

      if ((tok as any).needsReauth) {
        this.drivePickerLoading = false;
        this.driveNeedsReauth   = true;
        this.cdr.markForCheck();
        this.api.getGmailAuthUrl().subscribe({
          next: r => this.zone.run(() => { this.gmailAuthUrl = r.url; this.cdr.markForCheck(); }),
          error: () => {},
        });
        return;
      }

      const loadPicker = () => {
        const gapi = (window as any).gapi;
        gapi.load('picker', () => {
          const google = (window as any).google;
          const folderUrl = this.attachmentsFolderUrl;
          const folderMatch = folderUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
          const folderId    = folderMatch ? folderMatch[1] : null;

          let view: any;
          if (folderId) {
            view = new google.picker.DocsView()
              .setParent(folderId)
              .setIncludeFolders(true);
          } else {
            view = new google.picker.DocsView()
              .setIncludeFolders(true)
              .setOwnedByMe(false);
          }

          const picker = new google.picker.PickerBuilder()
            .addView(view)
            .setOAuthToken(tok!.access_token)
            .setDeveloperKey(cfg!.apiKey)
            .setAppId(cfg!.appId)
            .setTitle('Wybierz pliki do załączenia')
            .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
            .setCallback((data: any) => {
              if (data.action !== google.picker.Action.PICKED) return;
              const docs: any[] = data.docs || [];
              docs.forEach(doc => this.downloadDriveFileAsAttachment(doc, target));
            })
            .build();

          this.drivePickerLoading = false;
          this.cdr.markForCheck();
          picker.setVisible(true);
        });
      };

      if ((window as any).gapi) {
        loadPicker();
      } else {
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.onload = loadPicker;
        script.onerror = () => { this.drivePickerLoading = false; this.cdr.markForCheck(); };
        document.head.appendChild(script);
      }
    }).catch(() => {
      this.drivePickerLoading = false;
      this.cdr.markForCheck();
    });
  }

  private downloadDriveFileAsAttachment(
    doc: { id: string; name: string; mimeType: string },
    target: 'compose' | 'reply' = 'compose',
  ): void {
    this.api.downloadDriveFile(doc.id).subscribe({
      next: blob => {
        const file = new File([blob], doc.name, { type: blob.type || doc.mimeType || 'application/octet-stream' });
        if (target === 'reply') {
          this.msgModalAttachments = [...this.msgModalAttachments, file];
        } else {
          this.emailAttachments = [...this.emailAttachments, file];
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        const msg = err?.error?.error || err?.message || 'Błąd pobierania pliku z Drive';
        if (target === 'reply') {
          this.msgModalError = msg;
        } else {
          this.emailError = msg;
        }
        this.cdr.markForCheck();
      },
    });
  }

  sendEmail(): void {
    this.addRecipient();
    this.addCc();
    if (!this.partner || !this.emailForm.recipientList?.length || !this.emailForm.subject) return;
    this.sendingEmail = true;
    this.emailError   = '';
    const fd = new FormData();
    fd.append('to', this.emailForm.recipientList.join(','));
    if (this.emailForm.ccList?.length) fd.append('cc', this.emailForm.ccList.join(','));
    fd.append('subject', this.emailForm.subject);
    fd.append('body', (this.emailForm.body || '') + (this.emailForm.quotedHtml || ''));
    if (this.emailForm.threadId)   fd.append('threadId',   this.emailForm.threadId);
    if (this.emailForm.inReplyTo)  fd.append('inReplyTo',  this.emailForm.inReplyTo);
    if (this.emailForm.references) fd.append('references', this.emailForm.references);
    this.emailAttachments.forEach(f => fd.append('attachments', f, f.name));

    this.api.sendPartnerEmail(this.pid, fd).subscribe({
      next: (result: GmailSendResult) => {
        this.zone.run(() => {
          const wasReply      = !!this.emailForm.threadId;
          const replyThreadId = this.emailForm.threadId;
          if (!wasReply && this.partner) {
            const newAct: any = {
              id: result.activityId,
              type: 'email',
              title: this.emailForm.subject,
              body: this.emailForm.body,
              gmail_thread_id: result.threadId,
              gmail_message_id: result.messageId,
              activity_at: new Date().toISOString(),
              created_by: this.auth.user()?.id || null,
              created_by_name: this.auth.user()?.display_name || null,
              is_read: true,
            };
            this.partner = { ...this.partner, activities: [newAct, ...(this.partner.activities || [])] };
          } else if (replyThreadId && this.partner) {
            this.api.getPartnerEmailThread(this.pid, replyThreadId).subscribe({
              next: msgs => this.zone.run(() => {
                this.threadMessages = msgs;
                this.openThreadId   = replyThreadId;
                this.cdr.markForCheck();
              }),
              error: () => {},
            });
          }
          this.sendingEmail   = false;
          this.showEmailModal = false;
          // Odśwież extra_contacts (autoSavePartnerContacts mogło dodać nowe)
          if (this.partner) {
            this.api.getPartner(this.pid).subscribe({
              next: (fresh: any) => this.zone.run(() => {
                if (this.partner) {
                  (this.partner as any).extra_contacts = fresh.extra_contacts || [];
                  this.cdr.markForCheck();
                }
              }),
              error: () => {},
            });
          }
          this.cdr.markForCheck();
        });
      },
      error: (err: any) => {
        this.zone.run(() => {
          this.emailError   = err?.error?.error || 'Błąd wysyłki emaila';
          this.sendingEmail = false;
          this.cdr.markForCheck();
        });
      },
    });
  }

  openThread(threadId: string): void {
    if (!this.partner) return;
    if (this.openThreadId === threadId) {
      this.openThreadId = ''; this.threadMessages = []; this.cdr.markForCheck(); return;
    }
    this.openThreadId = threadId;
    this.api.getPartnerEmailThread(this.pid, threadId).subscribe({
      next: msgs => this.zone.run(() => {
        this.threadMessages = msgs;
        const act = (this.partner?.activities || []).find((a: any) => a.gmail_thread_id === threadId && a.type === 'email');
        if (act && !act.is_read) act.is_read = true;
        this.cdr.markForCheck();
      }),
      error: () => {},
    });
  }

  replyToThread(a: any): void {
    if (this.openThreadId === a.gmail_thread_id && this.threadMessages.length > 0) {
      this._applyThreadReply(a.gmail_thread_id);
    } else {
      if (!this.partner) return;
      this.openThreadId = a.gmail_thread_id;
      this.api.getPartnerEmailThread(this.pid, a.gmail_thread_id).subscribe({
        next: msgs => this.zone.run(() => {
          this.threadMessages = msgs;
          this.cdr.markForCheck();
          this._applyThreadReply(a.gmail_thread_id);
        }),
        error: () => this.zone.run(() => this._applyThreadReply(a.gmail_thread_id)),
      });
    }
  }

  private _applyThreadReply(threadId: string): void {
    const m = this.threadMessages[this.threadMessages.length - 1];
    this.openEmailModal(threadId);
    if (m) {
      if (!this.emailForm.subject)
        this.emailForm.subject = m.subject?.startsWith('Re:') ? m.subject : `Re: ${m.subject || ''}`;
      const fromAddrs  = this.parseAddressList(m.from);
      const toAddrs    = this.parseAddressList(m.to);
      const isReceived = fromAddrs.length > 0 && fromAddrs[0] !== this.gmailEmail;
      this.emailForm.recipientList = isReceived ? fromAddrs : toAddrs;
      if (m.cc) this.emailForm.ccList = this.parseAddressList(m.cc);
      this.emailForm.inReplyTo  = m.messageIdHeader || '';
      this.emailForm.references = this.buildReferences(this.threadMessages);
      this.emailForm.body       = '';
      this.emailForm.quotedHtml = this.buildQuotedBody(this.threadMessages);
      this.focusEmailBodyTop();
    }
    this.cdr.markForCheck();
  }

  markEmailsRead(): void {}

  selectEmailForPanel(a: any): void {
    if (!this.partner) return;
    if (this.selectedEmailActivity?.id === a.id) {
      this.selectedEmailActivity = null;
      this.panelThreadMessages   = [];
      this.cdr.markForCheck();
      return;
    }
    this.selectedEmailActivity = a;
    this.panelThreadMessages   = [];
    this.panelLoadingThread    = true;
    this.cdr.markForCheck();
    if (!a.is_read) {
      a.is_read = true;
      this.api.patchPartnerActivityRead(this.pid, a.id, true).subscribe({ error: () => {} });
    }
    if (a.gmail_thread_id) {
      this.api.getPartnerEmailThread(this.pid, a.gmail_thread_id).subscribe({
        next: msgs => this.zone.run(() => {
          this.panelThreadMessages = msgs;
          this.panelLoadingThread  = false;
          msgs.forEach((m: any) => {
            if (m.is_read === false && m.created_by === null) {
              m.is_read = true;
              this.api.patchEmailMessageRead(m.id, true).subscribe({ error: () => {} });
            }
          });
          this.cdr.markForCheck();
        }),
        error: () => this.zone.run(() => { this.panelLoadingThread = false; this.cdr.markForCheck(); }),
      });
    } else {
      this.panelLoadingThread = false;
    }
  }

  toggleThreadInline(a: any): void {
    if (!this.partner || !a.gmail_thread_id) return;
    if (this.openThreadId === a.gmail_thread_id) {
      this.openThreadId = ''; this.threadMessages = []; this.cdr.markForCheck(); return;
    }
    this.openThreadId = a.gmail_thread_id;
    this.threadMessages = [];
    this.loadingThread = true;
    this.cdr.markForCheck();
    // Wątek ma nieprzeczytane — oznacz jako przeczytany
    if (!a.is_read) {
      a.is_read = true;
      this.api.patchPartnerActivityRead(this.pid, a.id, true).subscribe({ error: () => {} });
    }
    this.api.getPartnerEmailThread(this.pid, a.gmail_thread_id).subscribe({
      next: msgs => this.zone.run(() => {
        this.threadMessages = msgs;
        this.loadingThread = false;
        // Auto-mark all unread incoming messages in the thread
        msgs.forEach((m: any) => {
          if (m.is_read === false && m.created_by === null) {
            m.is_read = true;
            this.api.patchEmailMessageRead(m.id, true).subscribe({ error: () => {} });
          }
        });
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => { this.loadingThread = false; this.cdr.markForCheck(); }),
    });
  }

  isMessageRead(m: any): boolean {
    return m.is_read !== false;
  }

  hasUnreadInActivity(a: any): boolean {
    return !a.is_read;
  }

  markMsgRead(m: any): void {
    if (!this.partner || m.is_read !== false || m.created_by !== null) return;
    m.is_read = true;
    this.cdr.markForCheck();
    this.api.patchEmailMessageRead(m.id, true).subscribe({ error: () => {} });
  }

  toggleMsgRead(m: any): void {
    if (!this.partner || m.created_by !== null) return;
    const newVal = !m.is_read;
    m.is_read = newVal;
    this.cdr.markForCheck();
    this.api.patchEmailMessageRead(m.id, newVal).subscribe({ error: () => {} });
    // Jeśli oznaczamy jako nieprzeczytana — aktualizuj też aktywność wątku (badge)
    if (!newVal) {
      const currentThreadId = this.selectedEmailActivity?.gmail_thread_id || this.openThreadId;
      const threadAct = (this.partner.activities || []).find(
        (a: any) => a.gmail_thread_id === currentThreadId
      );
      if (threadAct) {
        threadAct.is_read = false;
        this.api.patchPartnerActivityRead(this.pid, threadAct.id, false).subscribe({ error: () => {} });
      }
      if (this.selectedEmailActivity?.gmail_thread_id === currentThreadId) {
        this.selectedEmailActivity.is_read = false;
      }
    }
  }

  loadHistory(): void {
    if (this.historyLoaded || !this.partner) return;
    this.historyLoading = true;
    this.cdr.markForCheck();
    this.api.getPartnerHistory(this.pid).subscribe({
      next: rows => this.zone.run(() => {
        this.history = rows;
        this.historyLoading = false;
        this.historyLoaded  = true;
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => { this.historyLoading = false; this.cdr.markForCheck(); }),
    });
  }

  histLabel(h: any): string {
    const a = h.action;
    const after  = h.after_state  || {};
    const before = h.before_state || {};
    if (a === 'crm_partner_create')  return 'Partner utworzony';
    if (a === 'crm_partner_delete')  return 'Partner usunięty';
    if (a === 'crm_activity_create') return `Aktywność dodana: ${after.title || ''}`;
    if (a === 'crm_activity_close')  return `Aktywność zamknięta: ${after.title || ''}`;
    if (a === 'crm_activity_update') return `Aktywność zaktualizowana: ${after.title || ''}`;
    if (a === 'crm_partner_update') {
      if (after.activity_action === 'created') return `Aktywność dodana: ${after.title || ''}`;
      if (after.activity_action === 'deleted') return `Aktywność usunięta: ${before.title || ''}`;
      const changed = Object.keys(after).filter(k => k !== 'updated_at' && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
      if (changed.length === 1) {
        const k = changed[0];
        return `Zmieniono: ${this._partnerFieldLabel(k)} → ${this._formatHistVal(k, after[k])}`;
      }
      if (changed.length > 1) {
        return `Zmieniono: ${changed.map(k => `${this._partnerFieldLabel(k)} → ${this._formatHistVal(k, after[k])}`).join('; ')}`;
      }
      return 'Zaktualizowano partnera';
    }
    return a.replace(/_/g, ' ');
  }

  private _partnerFieldLabel(key: string): string {
    const MAP: Record<string, string> = {
      company: 'Firma', status: 'Status', nip: 'NIP', contact_name: 'Kontakt',
      email: 'Email', phone: 'Telefon', notes: 'Notatki', manager_id: 'Handlowiec',
      billing_address: 'Adres', billing_city: 'Miasto', billing_country: 'Kraj',
      subdomain: 'Subdomena', language: 'Język', partner_currency: 'Waluta',
      dwh_partner_id: 'Worktrips Partner ID', contract_signed: 'Umowa od', contract_expires: 'Umowa do',
      contract_value: 'Obrót', active_users: 'Aktywni użytkownicy', tags: 'Tagi',
      industry: 'Branża', group_id: 'Grupa', commission_value: 'Prowizja',
      credit_limit_value: 'Limit kredytowy', deposit_value: 'Depozyt',
      contact_title: 'Rola w firmie', billing_email: 'Email rozl.', billing_phone: 'Tel. rozl.',
      online_pct: '% Online', country: 'Kraj', agent_name: 'Agent',
    };
    return MAP[key] || key;
  }

  /** Konwertuje ISO timestamp do YYYY-MM-DD w lokalnej strefie czasowej (browser = Warsaw).
   *  Używane w openEdit() dla pól <input type="date"> — zapobiega błędowi UTC vs lokalny. */
  private isoToDateInput(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  private _formatHistVal(key: string, val: any): string {
    if (val === null || val === undefined || val === '') return '(brak)';
    if (typeof val === 'boolean') return val ? 'Tak' : 'Nie';
    if (Array.isArray(val)) return val.length ? val.join(', ') : '(brak)';
    if (key === 'status') return PARTNER_STATUS_LABELS[val as PartnerStatus] ?? val;
    if (typeof val === 'string' && val.length > 60) return val.substring(0, 57) + '…';
    return String(val);
  }

  private buildQuotedBody(messages: any[]): string {
    if (!messages?.length) return '';
    const divider = '<br><hr style="border:none;border-top:2px solid #e5e7eb;margin:16px 0"><div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Historia korespondencji</div>';
    const quoted = messages.map((m: any) => {
      const d = m.date ? new Date(m.date) : null;
      const dateStr = d ? d.toLocaleString('pl-PL', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }) : '';
      const atts = [...(m.attachments || []), ...(m.sentAttachments || [])]
        .map((a: any) => `📎 ${a.filename}`).join(' &nbsp;');
      const bodyHtml = (m.body || (m.snippet ? m.snippet : '')).trim();
      const meta = [
        `<tr><td style="color:#9ca3af;padding-right:8px;white-space:nowrap;font-size:11px">Od:</td><td style="font-size:11px"><strong>${m.from}</strong></td></tr>`,
        m.to  ? `<tr><td style="color:#9ca3af;padding-right:8px;white-space:nowrap;font-size:11px">Do:</td><td style="font-size:11px">${m.to}</td></tr>`  : '',
        m.cc  ? `<tr><td style="color:#9ca3af;padding-right:8px;white-space:nowrap;font-size:11px">DW:</td><td style="font-size:11px">${m.cc}</td></tr>`  : '',
        dateStr ? `<tr><td style="color:#9ca3af;padding-right:8px;white-space:nowrap;font-size:11px">Data:</td><td style="font-size:11px">${dateStr}</td></tr>` : '',
        m.subject ? `<tr><td style="color:#9ca3af;padding-right:8px;white-space:nowrap;font-size:11px">Temat:</td><td style="font-size:11px">${m.subject}</td></tr>` : '',
      ].filter(Boolean).join('');
      return `<div style="border-left:3px solid #d1d5db;padding:8px 14px;margin:8px 0;background:#fafafa;border-radius:0 6px 6px 0">
<table style="margin-bottom:8px;border-collapse:collapse">${meta}</table>
<div style="color:#374151;font-size:13px;line-height:1.6">${bodyHtml}</div>${atts ? `<div style="margin-top:8px;font-size:11px;color:#6b7280;padding-top:6px;border-top:1px solid #f3f4f6">${atts}</div>` : ''}</div>`;
    }).join('\n');
    return divider + quoted;
  }

  private buildReferences(messages: any[]): string {
    return (messages || []).map((m: any) => m.messageIdHeader).filter(Boolean).join(' ');
  }

  stripHtml(html: string): string {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private focusEmailBodyTop(textareaId: string = 'partner-email-body-textarea'): void {
    setTimeout(() => {
      const el = document.getElementById(textareaId) as HTMLTextAreaElement | null;
      if (el) { el.focus(); el.setSelectionRange(0, 0); el.scrollTop = 0; }
    }, 50);
  }

  openMsgModal(msg: any): void {
    this.msgModalMsg    = msg;
    this.msgModalReply  = false;
    this.msgModalForm   = { subject: '', body: '', recipientList: [] as string[], ccList: [] as string[] };
    this.msgModalRecipientQuery = '';
    this.msgModalCcQuery        = '';
    this.msgModalError  = '';
    this.showMsgModal   = true;
    this.markMsgRead(msg);
    this.cdr.markForCheck();
  }

  closeMsgModal(): void {
    this.showMsgModal        = false;
    this.msgModalMsg         = null;
    this.msgModalReply       = false;
    this.msgModalAttachments = [];
    this.cdr.markForCheck();
  }

  startMsgReply(): void {
    const m = this.msgModalMsg;
    if (!m) return;
    const fromAddrs  = this.parseAddressList(m.from);
    const toAddrs    = this.parseAddressList(m.to);
    const isReceived = fromAddrs.length > 0 && fromAddrs[0] !== this.gmailEmail;
    this.msgModalForm = {
      subject:       m.subject?.startsWith('Re:') ? m.subject : `Re: ${m.subject || ''}`,
      body:          '',
      quotedHtml:    this.buildQuotedBody(this.threadMessages),
      threadId:      m.threadId,
      inReplyTo:     m.messageIdHeader || '',
      references:    this.buildReferences(this.threadMessages),
      recipientList: isReceived ? fromAddrs : toAddrs,
      ccList:        m.cc ? this.parseAddressList(m.cc) : [],
    };
    this.msgModalRecipientQuery = '';
    this.msgModalCcQuery        = '';
    this.msgModalAttachments    = [];
    this.msgModalReply = true;
    this.cdr.markForCheck();
    this.focusEmailBodyTop('partner-msg-reply-textarea');
  }

  onMsgReplyAttachmentChange(event: Event): void {
    const files = (event.target as HTMLInputElement).files;
    if (files) this.msgModalAttachments = [...this.msgModalAttachments, ...Array.from(files)];
    this.cdr.markForCheck();
  }

  removeMsgReplyAttachment(i: number): void {
    this.msgModalAttachments = this.msgModalAttachments.filter((_, idx) => idx !== i);
    this.cdr.markForCheck();
  }

  sendMsgReply(): void {
    this.pushMsgRecipient();
    this.pushMsgCc();
    if (!this.partner || !this.msgModalForm.recipientList?.length || !this.msgModalForm.subject) return;
    this.msgModalSending = true;
    this.msgModalError   = '';
    const fd = new FormData();
    fd.append('to', this.msgModalForm.recipientList.join(','));
    if (this.msgModalForm.ccList?.length) fd.append('cc', this.msgModalForm.ccList.join(','));
    fd.append('subject', this.msgModalForm.subject);
    fd.append('body', (this.msgModalForm.body || '') + (this.msgModalForm.quotedHtml || ''));
    if (this.msgModalForm.threadId)   fd.append('threadId',   this.msgModalForm.threadId || this.msgModalMsg?.threadId);
    if (this.msgModalForm.inReplyTo)  fd.append('inReplyTo',  this.msgModalForm.inReplyTo);
    if (this.msgModalForm.references) fd.append('references', this.msgModalForm.references);
    this.msgModalAttachments.forEach(f => fd.append('attachments', f, f.name));
    this.api.sendPartnerEmail(this.pid, fd).subscribe({
      next: (result: GmailSendResult) => {
        this.zone.run(() => {
          const replyThreadId = this.msgModalForm.threadId || this.msgModalMsg?.threadId;
          this.msgModalSending = false;
          this.closeMsgModal();
          if (replyThreadId && this.partner) {
            this.api.getPartnerEmailThread(this.pid, replyThreadId).subscribe({
              next: msgs => this.zone.run(() => {
                this.threadMessages = msgs;
                this.openThreadId   = replyThreadId;
                this.cdr.markForCheck();
              }),
              error: () => {},
            });
          }
          // Odśwież extra_contacts (autoSavePartnerContacts mogło dodać nowe)
          if (this.partner) {
            this.api.getPartner(this.pid).subscribe({
              next: (fresh: any) => this.zone.run(() => {
                if (this.partner) {
                  (this.partner as any).extra_contacts = fresh.extra_contacts || [];
                  this.cdr.markForCheck();
                }
              }),
              error: () => {},
            });
          }
          this.cdr.markForCheck();
        });
      },
      error: (err: any) => {
        this.zone.run(() => {
          this.msgModalError   = err?.error?.error || 'Błąd wysyłki';
          this.msgModalSending = false;
          this.cdr.markForCheck();
        });
      },
    });
  }

  viewAttachment(att: any, msg: any): void {
    const base = '/api/crm/gmail';
    let url = '';
    if (att.attachmentId) {
      url = `${base}/attachment/${encodeURIComponent(msg.id)}/${att.attachmentId}?filename=${encodeURIComponent(att.filename)}&mime=${encodeURIComponent(att.mimeType||'')}`;
    } else if (att.blobPath !== undefined) {
      url = `${base}/sent-attachment/${encodeURIComponent(msg.id)}?filename=${encodeURIComponent(att.filename)}&mime=${encodeURIComponent(att.mimeType||'')}`;
    }
    if (url) window.open(url, '_blank');
  }

  async downloadAtt(att: any, msg: any): Promise<void> {
    const base = '/api/crm/gmail';
    let url = '';
    if (att.attachmentId) {
      url = `${base}/attachment/${encodeURIComponent(msg.id)}/${att.attachmentId}?filename=${encodeURIComponent(att.filename)}&mime=${encodeURIComponent(att.mimeType||'')}`;
    } else if (att.blobPath !== undefined) {
      url = `${base}/sent-attachment/${encodeURIComponent(msg.id)}?filename=${encodeURIComponent(att.filename)}&mime=${encodeURIComponent(att.mimeType||'')}`;
    }
    if (!url) return;
    try {
      const resp = await fetch(url, { credentials: 'include' });
      const blob = await resp.blob();
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = att.filename || 'attachment';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (e) { console.error('[downloadAtt]', e); }
  }

  pushMsgRecipient(): void {
    const val = this.msgModalRecipientQuery.trim();
    if (!val || !val.includes('@')) return;
    if (!this.msgModalForm.recipientList.includes(val)) this.msgModalForm.recipientList.push(val);
    this.msgModalRecipientQuery = '';
  }

  pushMsgCc(): void {
    const val = this.msgModalCcQuery.trim();
    if (!val || !val.includes('@')) return;
    if (!this.msgModalForm.ccList.includes(val)) this.msgModalForm.ccList.push(val);
    this.msgModalCcQuery = '';
  }

  // ─────────────────────────────────────────────────────────────────────────────

  statusLabelStr(s: string): string { return PARTNER_STATUS_LABELS[s as PartnerStatus] || s; }
  statusLabel(s: PartnerStatus) { return PARTNER_STATUS_LABELS[s] || s; }
  actIcon(type: string) {
    return { call:'📞', email:'📧', meeting:'🤝', note:'📝', training:'🎓', qbr:'📊', doc_sent:'📄', opportunity:'💡' }[type] || '💬';
  }
  commissionBasisLabel(basis: string | null): string {
    const map: Record<string, string> = {
      segmenty:       'Ilość segmentów',
      rezerwacje:     'Ilość rezerwacji',
      progi_obrotowe: 'Progi obrotowe',
      nie_dotyczy:    'Nie dotyczy',
    };
    return map[basis || 'nie_dotyczy'] ?? basis ?? '—';
  }

  // ── Modal aktywności ────────────────────────────────────────────────────────
  actTypeName(type: string): string {
    const map: Record<string, string> = {
      call:        'Połączenie',
      email:       'Email',
      meeting:     'Spotkanie',
      note:        'Notatka',
      training:    'Szkolenie',
      qbr:         'QBR',
      doc_sent:    'Dokument',
      opportunity: 'Szansa',
    };
    return map[type] || type;
  }

  openActModal(a: any): void {
    this.selectedAct          = a;
    this.actModalEditMode     = false;
    this.actModalClosing      = false;
    this.actModalCloseComment = '';
    if (!this.crmUsers.length) {
      this.api.getCrmUsers().subscribe({
        next: u => { this.zone.run(() => { this.crmUsers = u; this.cdr.markForCheck(); }); },
        error: () => {},
      });
    }
    this.cdr.markForCheck();
  }

  closeActModal(): void {
    this.selectedAct          = null;
    this.actModalEditMode     = false;
    this.actModalClosing      = false;
    this.actModalCloseComment = '';
    this.cdr.markForCheck();
  }

  startEditActModal(): void {
    const a = this.selectedAct;
    if (!a) return;
    this.actEditForm = {
      type:             a.type,
      title:            a.title,
      body:             a.body || '',
      activity_at:      a.activity_at ? a.activity_at.substring(0, 16) : '',
      duration_min:     a.duration_min ?? '',
      meeting_location: a.meeting_location || '',
      participants:     a.participants || '',
      opp_value:        a.opp_value ?? '',
      opp_currency:     a.opp_currency || 'PLN',
      opp_status:       a.opp_status || 'new',
      opp_due_date:     a.opp_due_date || '',
      assigned_to:      a.assigned_to || '',
    };
    this.actModalEditMode = true;
    this.cdr.markForCheck();
  }

  startCloseActModal(): void {
    this.actModalClosing      = true;
    this.actModalCloseComment = this.selectedAct?.close_comment || '';
    this.cdr.markForCheck();
  }

  confirmCloseActModal(): void {
    const a = this.selectedAct;
    if (!this.actModalCloseComment.trim() || !a || !this.partner) return;
    this.savingActivity = true;
    this.api.updatePartnerActivity(this.pid, a.id, { status: 'closed', close_comment: this.actModalCloseComment }).subscribe({
      next: updated => {
        this.zone.run(() => {
          if (this.partner) {
            this.partner = {
              ...this.partner,
              activities: (this.partner.activities || []).map(x => x.id === a.id ? { ...x, ...updated } : x),
            };
          }
          this.selectedAct          = { ...a, ...updated };
          this.actModalClosing      = false;
          this.actModalCloseComment = '';
          this.savingActivity       = false;
          this.cdr.markForCheck();
        });
      },
      error: () => { this.zone.run(() => { this.savingActivity = false; this.cdr.markForCheck(); }); },
    });
  }

  saveEditActivityModal(): void {
    const a = this.selectedAct;
    if (!this.actEditForm.title || !a || !this.partner) return;
    this.savingActivity = true;
    const payload: any = {
      type:  this.actEditForm.type,
      title: this.actEditForm.title,
      body:  this.actEditForm.body || null,
    };
    if (this.actEditForm.type !== 'email') {
      payload.activity_at = this.actEditForm.activity_at || null;
      payload.assigned_to = this.actEditForm.assigned_to || null;
    }
    if (this.actEditForm.type === 'meeting') {
      if (this.actEditForm.duration_min !== '') payload.duration_min = +this.actEditForm.duration_min;
      payload.meeting_location = this.actEditForm.meeting_location || null;
      payload.participants     = this.actEditForm.participants || null;
    }
    if (this.actEditForm.type === 'opportunity') {
      payload.opp_value    = this.actEditForm.opp_value != null && this.actEditForm.opp_value !== '' ? +this.actEditForm.opp_value : null;
      payload.opp_currency = this.actEditForm.opp_currency || 'PLN';
      payload.opp_status   = this.actEditForm.opp_status || 'new';
      payload.opp_due_date = this.actEditForm.opp_due_date || null;
    }
    this.api.updatePartnerActivity(this.pid, a.id, payload).subscribe({
      next: (updated: PartnerActivity) => {
        this.zone.run(() => {
          if (this.partner) {
            this.partner = {
              ...this.partner,
              activities: (this.partner.activities || []).map(x => x.id === a.id ? { ...x, ...updated } : x),
            };
          }
          this.selectedAct      = { ...a, ...updated };
          this.actModalEditMode = false;
          this.savingActivity   = false;
          this.cdr.markForCheck();
        });
      },
      error: () => { this.zone.run(() => { this.savingActivity = false; this.cdr.markForCheck(); }); },
    });
  }

  canEditActivity(a: any): boolean {
    const u = this.auth.user();
    return !!(u?.is_admin || u?.crm_role === 'sales_manager' || a.created_by === u?.id || a.assigned_to === u?.id);
  }

  startEditActivity(a: any): void {
    this.editingActId = a.id;
    this.closingActId = null;
    this.actEditForm  = {
      type:             a.type,
      title:            a.title,
      body:             a.body || '',
      activity_at:      a.activity_at ? a.activity_at.substring(0, 16) : '',
      duration_min:     a.duration_min ?? '',
      meeting_location: a.meeting_location || '',
      participants:     a.participants || '',
      opp_value:        a.opp_value ?? '',
      opp_currency:     a.opp_currency || 'PLN',
      opp_status:       a.opp_status || 'new',
      opp_due_date:     a.opp_due_date || '',
      assigned_to:      a.assigned_to || '',
    };
    if (!this.crmUsers.length) {
      this.api.getCrmUsers().subscribe({
        next: u => { this.zone.run(() => { this.crmUsers = u; this.cdr.markForCheck(); }); },
        error: () => {},
      });
    }
  }

  cancelEditActivity(): void {
    this.editingActId = null;
  }

  startCloseActivity(a: any): void {
    this.closingActId = a.id;
    this.editingActId = null;
    this.closeComment = a.close_comment || '';
  }

  cancelClose(): void {
    this.closingActId = null;
    this.closeComment = '';
  }

  confirmCloseActivity(a: any): void {
    if (!this.closeComment.trim() || !this.partner) return;
    this.savingActivity = true;
    this.api.updatePartnerActivity(this.pid, a.id, { status: 'closed', close_comment: this.closeComment }).subscribe({
      next: updated => {
        this.zone.run(() => {
          if (this.partner) {
            this.partner = {
              ...this.partner,
              activities: (this.partner.activities || []).map(x => x.id === a.id ? { ...x, ...updated } : x),
            };
          }
          this.closingActId   = null;
          this.closeComment   = '';
          this.savingActivity = false;
          this.cdr.markForCheck();
        });
      },
      error: () => { this.zone.run(() => { this.savingActivity = false; this.cdr.markForCheck(); }); },
    });
  }

  actStatusLabel(s: string): string {
    return s === 'closed' ? 'zamknięta' : s === 'open' ? 'otwarta' : 'nowa';
  }

  isActOverdue(activityAt: string): boolean {
    return new Date(activityAt) < new Date(new Date().toDateString());
  }

  isActToday(activityAt: string): boolean {
    const d = new Date(activityAt);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }

  saveEditActivity(a: any): void {
    if (!this.actEditForm.title || !this.partner) return;
    this.savingActivity = true;
    const payload: any = {
      type:  this.actEditForm.type,
      title: this.actEditForm.title,
      body:  this.actEditForm.body || null,
    };
    if (this.actEditForm.type !== 'email') {
      payload.activity_at = this.actEditForm.activity_at || null;
      payload.assigned_to = this.actEditForm.assigned_to || null;
    }
    if (this.actEditForm.type === 'meeting') {
      if (this.actEditForm.duration_min !== '') payload.duration_min = +this.actEditForm.duration_min;
      payload.meeting_location = this.actEditForm.meeting_location || null;
      payload.participants     = this.actEditForm.participants || null;
    }
    if (this.actEditForm.type === 'opportunity') {
      payload.opp_value    = this.actEditForm.opp_value != null && this.actEditForm.opp_value !== '' ? +this.actEditForm.opp_value : null;
      payload.opp_currency = this.actEditForm.opp_currency || 'PLN';
      payload.opp_status   = this.actEditForm.opp_status || 'new';
      payload.opp_due_date = this.actEditForm.opp_due_date || null;
    }
    this.api.updatePartnerActivity(this.pid, a.id, payload).subscribe({
      next: (updated: PartnerActivity) => {
        this.zone.run(() => {
          if (this.partner) {
            this.partner = {
              ...this.partner,
              activities: (this.partner.activities || []).map(x => x.id === a.id ? { ...x, ...updated } : x),
            };
          }
          this.editingActId   = null;
          this.savingActivity = false;
          this.cdr.markForCheck();
        });
      },
      error: () => { this.zone.run(() => { this.savingActivity = false; this.cdr.markForCheck(); }); },
    });
  }

  deleteActivity(a: any): void {
    if (!this.partner || !confirm(`Usunąć aktywność "${a.title}"?`)) return;
    this.api.deletePartnerActivity(this.pid, a.id).subscribe({
      next: () => {
        this.zone.run(() => {
          if (this.partner) {
            this.partner = {
              ...this.partner,
              activities: (this.partner.activities || []).filter(x => x.id !== a.id),
            };
          }
          this.cdr.markForCheck();
        });
      },
      error: () => {},
    });
  }

  onActTypeChange(): void {
    if (this.actForm.type !== 'meeting') {
      this.actForm.participantList = [];
      this.participantQuery = '';
    }
    this.cdr.markForCheck();
  }

  filterSuggestions(): void {
    const q = this.participantQuery.toLowerCase();
    if (!q) { this.filteredSuggestions = []; this.cdr.markForCheck(); return; }
    // Załaduj sugestie jeśli jeszcze nie załadowane
    if (!this.allSuggestions.length && this.partner?.id) {
      this.api.getContactSuggestions(undefined, this.pid).subscribe({
        next: s => {
          this.allSuggestions = s;
          this._applyFilter(q);
        },
        error: () => {},
      });
      return;
    }
    this._applyFilter(q);
  }

  private _applyFilter(q: string): void {
    const existing = new Set((this.actForm.participantList || []) as string[]);
    this.filteredSuggestions = this.allSuggestions.filter(
      s => !existing.has(s.email) && (s.email.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
    ).slice(0, 8);
    this.cdr.markForCheck();
  }

  pickSuggestion(form: any, s: { email: string; name: string }): void {
    if (!form.participantList) form.participantList = [];
    if (!form.participantList.includes(s.email)) form.participantList.push(s.email);
    this.participantQuery = '';
    this.filteredSuggestions = [];
    this.cdr.markForCheck();
  }

  addParticipantFromInput(form: any): void {
    const val = this.participantQuery.trim().replace(/,\s*$/, '');
    if (!val) return;
    if (!form.participantList) form.participantList = [];
    const emails = val.split(/[,;\s]+/).map((e: string) => e.trim()).filter(Boolean);
    emails.forEach((e: string) => { if (!form.participantList.includes(e)) form.participantList.push(e); });
    this.participantQuery = '';
    this.filteredSuggestions = [];
    this.cdr.markForCheck();
  }

  removeParticipant(form: any, idx: number): void {
    form.participantList.splice(idx, 1);
    this.cdr.markForCheck();
  }

}
