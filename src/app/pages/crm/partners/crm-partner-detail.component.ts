// src/app/pages/crm/partners/crm-partner-detail.component.ts
import { Component, OnInit, inject, Input, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { CrmApiService, Partner, PartnerActivity, OnboardingTask, PARTNER_STATUS_LABELS, PartnerStatus, CrmUser, PartnerGroup, LinkedDocument, GmailSendResult } from '../../../core/services/crm-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { AppSettingsService } from '../../../core/services/app-settings.service';

@Component({
  selector: 'wt-crm-partner-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
<div class="detail-page" *ngIf="partner">
  <div class="detail-header">
    <button class="back-btn" routerLink="/crm/partners">← Partnerzy</button>
    <h1>{{partner.company}}</h1>
    <span class="pbadge pbadge-{{partner.status}}">{{statusLabel(partner.status)}}</span>
    <span class="group-badge" *ngIf="partner.group_name">🏢 {{partner.group_name}}</span>
    <button class="btn-outline" (click)="openEdit()">✏️ Edytuj</button>
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
        <button class="btn-sm" (click)="openAddTask()" style="font-size:12px">+ Dodaj zadanie</button>
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
        <span class="lbl">Nr partnera</span>
        <span>
          <span *ngIf="partner.partner_number" style="font-family:monospace;font-weight:600;color:var(--orange)">{{partner.partner_number}}</span>
          <span *ngIf="!partner.partner_number" style="color:var(--gray-400)">— nie ustawiono</span>
        </span>
        <span class="lbl">NIP</span><span>{{partner.nip || '—'}}</span>
        <span class="lbl">Branża</span><span>{{partner.industry || '—'}}</span>
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

      <!-- Partner Admin (Zadanie C) -->
      <div class="info-subsection">
        <div class="info-subsection-title">👤 Partner Admin</div>
        <div class="info-grid">
          <span class="lbl">Imię</span><span>{{partner.admin_first_name || '—'}}</span>
          <span class="lbl">Nazwisko</span><span>{{partner.admin_last_name || '—'}}</span>
          <span class="lbl">Email</span><span>{{partner.admin_email || '—'}}</span>
        </div>
      </div>

      <!-- Kontakt do spraw umowy -->
      <div class="info-subsection">
        <div class="info-subsection-title">Kontakt do spraw umowy</div>
        <div class="info-grid">
          <span class="lbl">Imię i nazwisko</span><span>{{partner.contact_name || '—'}}</span>
          <span class="lbl">Stanowisko</span><span>{{partner.contact_title || '—'}}</span>
          <span class="lbl">Email</span><span>{{partner.email || '—'}}</span>
          <span class="lbl">Telefon</span><span>{{partner.phone || '—'}}</span>
        </div>
      </div>

      <!-- Billing Address (Zadanie B) -->
      <div class="info-subsection">
        <div class="info-subsection-title">Billing Address</div>
        <div class="info-grid">
          <span class="lbl">Adres</span><span>{{partner.billing_address || '—'}}</span>
          <span class="lbl">Kod pocztowy</span><span>{{partner.billing_zip || '—'}}</span>
          <span class="lbl">Miasto</span><span>{{partner.billing_city || '—'}}</span>
          <span class="lbl">Kraj</span><span>{{partner.billing_country || '—'}}</span>
          <span class="lbl">Email</span><span>{{partner.billing_email_address || '—'}}</span>
        </div>
      </div>

      <!-- Kontakt do spraw rozliczeń -->
      <div class="info-subsection">
        <div class="info-subsection-title">Kontakt do spraw rozliczeń</div>
        <div class="info-grid">
          <span class="lbl">Imię i nazwisko</span><span>{{partner.billing_contact_name || '—'}}</span>
          <span class="lbl">Stanowisko</span><span>{{partner.billing_contact_title || '—'}}</span>
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
      </div>

      <!-- Dane dodatkowe (Zadanie A) -->
      <div class="info-subsection">
        <div class="info-subsection-title">⚙️ Dane dodatkowe</div>
        <div class="info-grid">
          <span class="lbl">% Online</span><span>{{partner.online_pct != null ? partner.online_pct + '%' : '—'}}</span>
          <span class="lbl">Subdomena</span><span style="font-family:monospace">{{partner.subdomain || '—'}}</span>
          <span class="lbl">Język</span><span>{{partner.language || '—'}}</span>
          <span class="lbl">Waluta</span><span>{{partner.partner_currency || '—'}}</span>
          <span class="lbl">Kraj</span><span>{{partner.country || '—'}}</span>
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
          <button class="btn-sm" (click)="showDocPicker = true" style="font-size:11px">+ Dodaj</button>
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
      <div class="card-header">
        <h3>Aktywności</h3>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn-sm" (click)="openEmailModal()" [disabled]="!partner?.email" style="display:flex;align-items:center;gap:4px">
            ✉️ Email
            <span *ngIf="emailActivityCount>0" class="email-badge">{{emailActivityCount}}</span>
          </button>
          <button class="btn-sm" (click)="showNewActivity = !showNewActivity">+ Dodaj</button>
        </div>
      </div>
      <div class="new-activity-form" *ngIf="showNewActivity">
        <select [(ngModel)]="actForm.type" class="act-sel" (ngModelChange)="onActTypeChange()">
          <option value="call">📞 Połączenie</option>
          <option value="email">📧 Email</option>
          <option value="meeting">🤝 Spotkanie</option>
          <option value="note">📝 Notatka</option>
          <option value="training">🎓 Szkolenie</option>
          <option value="qbr">📊 QBR</option>
          <option value="opportunity">💡 Szansa</option>
        </select>
        <input [(ngModel)]="actForm.title" placeholder="Tytuł *" class="act-input">
        <ng-container *ngIf="actForm.type === 'meeting'">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
              Data i czas
              <input type="datetime-local" [(ngModel)]="actForm.activity_at" class="act-input" style="font-size:11px">
            </label>
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
        <!-- Szansa sprzedaży -->
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
        <div *ngFor="let a of sortedActivities" class="act-item">
          <span class="act-icon">{{actIcon(a.type)}}</span>
          <div *ngIf="editingActId !== a.id">
            <strong>{{a.title}}</strong>
            <div class="act-meta">{{a.activity_at | date:'dd.MM.yyyy HH:mm'}} · {{a.created_by_name}}</div>
            <div *ngIf="a.meeting_location" class="act-text">📍 {{a.meeting_location}}</div>
            <div *ngIf="a.participants" class="act-text">👥 {{a.participants}}</div>
            <ng-container *ngIf="a.type === 'opportunity'">
              <div class="act-text" style="display:flex;gap:8px;align-items:center">
                <span class="opp-status-badge opp-st-{{a.opp_status}}">{{oppStatusLabel(a.opp_status)}}</span>
                <span *ngIf="a.opp_value" style="font-weight:700;color:#f97316">{{a.opp_value | number:'1.0-0'}} {{a.opp_currency}}</span>
                <span *ngIf="a.opp_due_date" style="color:#9ca3af">do {{a.opp_due_date | date:'dd.MM.yy'}}</span>
              </div>
            </ng-container>
            <div class="act-text" *ngIf="a.body">{{a.body}}</div>
            <div *ngIf="a.type==='email' && a.gmail_thread_id" style="margin-top:4px;display:flex;gap:6px">
              <button class="btn-sm" style="font-size:10px" (click)="openThread(a.gmail_thread_id)">💬 Pokaż wątek</button>
              <button class="btn-sm primary" style="font-size:10px" (click)="replyToThread(a)">↩ Odpowiedz</button>
            </div>
            <!-- Thread preview -->
            <div *ngIf="openThreadId===a.gmail_thread_id && threadMessages.length>0"
                 style="margin-top:8px;border-top:1px solid #e5e7eb;padding-top:8px;display:flex;flex-direction:column;gap:6px">
              <div *ngFor="let m of threadMessages" style="background:#f9fafb;border-radius:6px;padding:8px;font-size:11px">
                <div style="font-weight:600;color:#374151">{{m.from}}</div>
                <div style="color:#9ca3af;font-size:10px">{{m.date|date:'dd.MM.yyyy HH:mm'}}</div>
                <div style="margin-top:4px;color:#374151;white-space:pre-line">{{m.snippet}}</div>
              </div>
            </div>
          </div>
          <div class="act-edit-form" *ngIf="editingActId === a.id">
            <select [(ngModel)]="actEditForm.type" class="act-sel">
              <option value="call">📞 Połączenie</option>
              <option value="email">📧 Email</option>
              <option value="meeting">🤝 Spotkanie</option>
              <option value="note">📝 Notatka</option>
              <option value="training">🎓 Szkolenie</option>
              <option value="qbr">📊 QBR</option>
              <option value="opportunity">💡 Szansa</option>
            </select>
            <input [(ngModel)]="actEditForm.title" placeholder="Tytuł *" class="act-input">
            <ng-container *ngIf="actEditForm.type === 'meeting'">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
                  Data i czas<input type="datetime-local" [(ngModel)]="actEditForm.activity_at" class="act-input" style="font-size:11px">
                </label>
                <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
                  Czas trwania (min)<input type="number" min="0" [(ngModel)]="actEditForm.duration_min" placeholder="60" class="act-input" style="font-size:11px">
                </label>
              </div>
              <input [(ngModel)]="actEditForm.meeting_location" placeholder="Miejsce spotkania" class="act-input">
              <input [(ngModel)]="actEditForm.participants" placeholder="Uczestnicy (emaile oddzielone przecinkiem)" class="act-input">
            </ng-container>
            <ng-container *ngIf="actEditForm.type === 'opportunity'">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
                  Status szansy
                  <select [(ngModel)]="actEditForm.opp_status" class="act-input" style="font-size:11px">
                    <option value="new">Nowa</option>
                    <option value="in_progress">W trakcie</option>
                    <option value="closed">Zamknięta</option>
                  </select>
                </label>
                <input type="date" [(ngModel)]="actEditForm.opp_due_date" class="act-input" style="font-size:11px;align-self:flex-end">
              </div>
              <div style="display:grid;grid-template-columns:2fr 1fr;gap:6px">
                <input type="number" min="0" step="0.01" [(ngModel)]="actEditForm.opp_value" placeholder="Wartość" class="act-input">
                <select [(ngModel)]="actEditForm.opp_currency" class="act-input">
                  <option value="PLN">PLN</option><option value="EUR">EUR</option>
                  <option value="USD">USD</option><option value="GBP">GBP</option>
                </select>
              </div>
            </ng-container>
            <textarea [(ngModel)]="actEditForm.body" placeholder="Treść…" rows="2" class="act-input"></textarea>
            <div class="act-actions">
              <button class="btn-sm" (click)="cancelEditActivity()">Anuluj</button>
              <button class="btn-sm primary" (click)="saveEditActivity(a)" [disabled]="!actEditForm.title || savingActivity">
                {{savingActivity ? '…' : 'Zapisz'}}
              </button>
            </div>
          </div>
          <div class="act-controls" *ngIf="editingActId !== a.id && canEditActivity(a)">
            <button class="act-ctrl-btn" (click)="startEditActivity(a)" title="Edytuj">✏️</button>
            <button class="act-ctrl-btn del" (click)="deleteActivity(a)" title="Usuń">🗑️</button>
          </div>
        </div>
        <div class="empty-act" *ngIf="!sortedActivities.length">Brak aktywności.</div>
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
               style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;transition:background .1s"
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
            <span *ngIf="isLinked(doc.id)" style="font-size:11px;font-weight:700;color:#16a34a">✓ Dodano</span>
            <span *ngIf="!isLinked(doc.id)" style="font-size:11px;color:#9ca3af">Dodaj</span>
          </div>
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
              Numer partnera
              <input [(ngModel)]="editForm.partner_number" placeholder="np. P-0001"
                     style="font-family:monospace">
              <span style="font-size:10px;color:var(--gray-400);margin-top:2px;display:block">
                Klucz łączący z danymi w systemie transakcyjnym
              </span>
            </label>
            <label>NIP <span style="color:#f97316">*</span>
              <input [(ngModel)]="editForm.nip" placeholder="PL1234567890" maxlength="14"
                     (ngModelChange)="validatePartnerNip()"
                     [style.border-color]="partnerNipEditError ? '#ef4444' : ''">
              <span *ngIf="partnerNipEditError" style="font-size:11px;color:#ef4444;margin-top:2px;display:block">{{ partnerNipEditError }}</span>
            </label>
          </div>
          <div class="edit-row">
            <label class="full">Adres (informacyjny)<input [(ngModel)]="editForm.address" placeholder="ul. Przykładowa 1, 00-001 Warszawa"></label>
          </div>
        </div>

        <!-- Partner Admin (Zadanie C) -->
        <div class="edit-section">
          <div class="edit-section-title">👤 Partner Admin *</div>
          <div class="edit-row">
            <label>Imię *
              <input [(ngModel)]="editForm.admin_first_name" placeholder="Jan"
                     [class.input-warn]="submitAttempted && !editForm.admin_first_name">
            </label>
            <label>Nazwisko *
              <input [(ngModel)]="editForm.admin_last_name" placeholder="Kowalski"
                     [class.input-warn]="submitAttempted && !editForm.admin_last_name">
            </label>
          </div>
          <div class="edit-row">
            <label class="full">Email *
              <input [(ngModel)]="editForm.admin_email" type="email" placeholder="admin@firma.pl"
                     [class.input-warn]="submitAttempted && (!editForm.admin_email || !isValidEmail(editForm.admin_email))">
            </label>
          </div>
          <div class="validation-msg" *ngIf="submitAttempted && (!editForm.admin_first_name || !editForm.admin_last_name || !editForm.admin_email || !isValidEmail(editForm.admin_email))" style="color:#ef4444">
            ⚠ Uzupełnij wszystkie pola Partner Admin (wymagane).
          </div>
        </div>

        <div class="edit-section">
          <div class="edit-section-title">Kontakt do spraw umowy *</div>
          <div class="edit-row">
            <label>Imię i nazwisko *
              <input [(ngModel)]="editForm.contact_name" placeholder="Jan Kowalski"
                     [class.input-warn]="submitAttempted && !editForm.contact_name">
            </label>
            <label>Stanowisko *
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
            <label>Stanowisko *
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

        <!-- Billing Address (Zadanie B) -->
        <div class="edit-section">
          <div class="edit-section-title">📍 Billing Address *</div>
          <div class="edit-row">
            <label class="full">Adres *
              <input [(ngModel)]="editForm.billing_address" placeholder="ul. Przykładowa 1"
                     maxlength="50"
                     [class.input-warn]="submitAttempted && !editForm.billing_address">
            </label>
          </div>
          <div class="edit-row">
            <label>Kod pocztowy *
              <input [(ngModel)]="editForm.billing_zip" placeholder="00-001"
                     maxlength="10"
                     [class.input-warn]="submitAttempted && !editForm.billing_zip">
            </label>
            <label>Miasto *
              <input [(ngModel)]="editForm.billing_city" placeholder="Warszawa"
                     maxlength="30"
                     [class.input-warn]="submitAttempted && !editForm.billing_city">
            </label>
          </div>
          <div class="edit-row">
            <label>Kraj *
              <select [(ngModel)]="editForm.billing_country"
                      [class.input-warn]="submitAttempted && !editForm.billing_country">
                <option value="">— wybierz kraj —</option>
                <option *ngFor="let c of countryOptions" [value]="c">{{c}}</option>
              </select>
            </label>
            <label>Email rozliczeniowy *
              <input [(ngModel)]="editForm.billing_email_address" type="email"
                     placeholder="faktury@firma.pl" maxlength="255"
                     [class.input-warn]="submitAttempted && (!editForm.billing_email_address || !isValidEmail(editForm.billing_email_address))">
            </label>
          </div>
          <div class="validation-msg" *ngIf="submitAttempted && (!editForm.billing_address || !editForm.billing_zip || !editForm.billing_city || !editForm.billing_country || !editForm.billing_email_address || !isValidEmail(editForm.billing_email_address))" style="color:#ef4444">
            ⚠ Uzupełnij wszystkie pola Billing Address (wymagane).
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

        <!-- Dane dodatkowe (Zadanie A) -->
        <div class="edit-section">
          <div class="edit-section-title">⚙️ Dane dodatkowe *</div>
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
            <label>Subdomena *
              <input [(ngModel)]="editForm.subdomain"
                     placeholder="np. acme (3-30 znaków, a-z, 0-9)"
                     maxlength="30"
                     (input)="onSubdomainInput($event)"
                     [class.input-warn]="submitAttempted && !isValidSubdomain(editForm.subdomain)">
              <span style="font-size:10px;color:var(--gray-400);margin-top:2px;display:block">
                Tylko małe litery (a-z) i cyfry (0-9), 3–30 znaków
              </span>
            </label>
          </div>
          <div class="edit-row">
            <label>Język *
              <select [(ngModel)]="editForm.language"
                      [class.input-warn]="submitAttempted && !editForm.language">
                <option value="">— wybierz język —</option>
                <option *ngFor="let l of languageOptions" [value]="l">{{l}}</option>
              </select>
            </label>
            <label>Waluta *
              <select [(ngModel)]="editForm.partner_currency"
                      [class.input-warn]="submitAttempted && !editForm.partner_currency">
                <option value="">— wybierz walutę —</option>
                <option *ngFor="let c of currencyOptions" [value]="c">{{c}}</option>
              </select>
            </label>
          </div>
          <div class="edit-row">
            <label>Kraj *
              <select [(ngModel)]="editForm.country"
                      [class.input-warn]="submitAttempted && !editForm.country">
                <option value="">— wybierz kraj —</option>
                <option *ngFor="let c of countryOptions" [value]="c">{{c}}</option>
              </select>
            </label>
          </div>
          <div class="validation-msg" *ngIf="submitAttempted && (!isValidSubdomain(editForm.subdomain) || !editForm.language || !editForm.partner_currency || !editForm.country)" style="color:#ef4444">
            ⚠ Uzupełnij wszystkie pola Dane dodatkowe (wymagane).
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
<div *ngIf="loading" class="loading">Ładowanie…</div>

<!-- ── Gmail Compose Modal ─────────────────────────────────────────────────── -->
<div class="modal-overlay" *ngIf="showEmailModal" (click)="showEmailModal=false">
  <div class="modal-wide" (click)="$event.stopPropagation()" style="width:min(580px,100%);background:white;border-radius:14px;max-height:88vh;overflow-y:auto;display:flex;flex-direction:column">
    <div class="modal-header">
      <h3>✉️ Wyślij email</h3>
      <button class="close-btn" (click)="showEmailModal=false">✕</button>
    </div>
    <div class="modal-body" style="gap:12px">
      <label style="font-size:12px;font-weight:600;display:flex;flex-direction:column;gap:4px">
        Do
        <div class="participant-chips">
          <span *ngFor="let r of emailForm.recipientList; let i=index" class="participant-chip">
            {{r}}<button (click)="emailForm.recipientList.splice(i,1)" type="button">✕</button>
          </span>
          <input class="participant-input" [(ngModel)]="recipientQuery"
                 (keydown.enter)="addRecipient()" (keydown.Tab)="addRecipient()"
                 placeholder="email@firma.pl" autocomplete="off">
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
        <textarea class="act-input" [(ngModel)]="emailForm.body" rows="7" placeholder="Treść wiadomości…"></textarea>
      </label>
      <label style="font-size:12px;font-weight:600;display:flex;flex-direction:column;gap:4px">
        Załączniki
        <input type="file" multiple (change)="onAttachmentChange($event)" style="font-size:12px;color:#6b7280">
      </label>
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
              [disabled]="sendingEmail||!emailForm.recipientList?.length||!emailForm.subject">
        {{sendingEmail ? '⏳ Wysyłanie…' : '📤 Wyślij'}}
      </button>
    </div>
  </div>
</div>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; flex:1; overflow:hidden; height:100%; }
    .detail-page { padding:20px; max-width:1000px; width:100%; height:100%; display:flex; flex-direction:column; overflow:hidden; box-sizing:border-box; }
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
    .detail-body { display:grid; grid-template-columns:320px 1fr; gap:16px; flex:1; overflow:hidden; min-height:0; }
    @media(max-width:700px) { .detail-body{grid-template-columns:1fr;} }
    .info-card, .activities-card { background:white; border:1px solid #e5e7eb; border-radius:12px; padding:16px; overflow-y:auto; min-height:0; }
    .info-card h3, .activities-card h3 { font-size:13px; font-weight:700; margin:0 0 12px; }
    .info-grid { display:grid; grid-template-columns:auto 1fr; gap:5px 10px; font-size:13px; }
    .lbl { color:#9ca3af; font-size:11px; white-space:nowrap; padding-top:2px; }
    .sub { color:#9ca3af; }
    .accent { color:#f97316; font-weight:700; }
    .notes { white-space:pre-line; }
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
    .new-activity-form { background:#fafafa; border-radius:8px; padding:10px; margin-bottom:12px; display:flex; flex-direction:column; gap:7px; }
    .act-sel { border:1px solid #d1d5db; border-radius:6px; padding:5px 8px; font-size:12px; }
    .act-input { border:1px solid #d1d5db; border-radius:6px; padding:6px 10px; font-size:12px; font-family:inherit; resize:vertical; }
    .act-actions { display:flex; gap:6px; justify-content:flex-end; }
    .activity-list { display:flex; flex-direction:column; gap:10px; overflow-y:auto; }
    .act-item { display:flex; gap:10px; }
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
    .input-error { border-color:#ef4444 !important; background:#fff5f5; }
    .input-warn  { border-color:#f59e0b !important; background:#fffbeb; }
    .validation-msg { font-size:11px; color:#ef4444; margin-top:2px; }
    .email-badge { background:#ef4444; color:white; border-radius:10px; font-size:10px; font-weight:700; padding:0 5px; line-height:16px; display:inline-block; }
  `],
})
export class CrmPartnerDetailComponent implements OnInit {
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
  submitAttempted = false;
  partnerNipEditError = '';

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
  actForm: any   = { type: 'note', title: '', body: '', activity_at: '', duration_min: null, meeting_location: '', participantList: [] as string[], opp_value: null, opp_currency: 'PLN', opp_status: 'new', opp_due_date: '' };
  actEditForm: any = { type: 'note', title: '', body: '', activity_at: '', duration_min: null, meeting_location: '', participants: '', opp_value: null, opp_currency: 'PLN', opp_status: 'new', opp_due_date: '' };
  editingActId: number | null = null;
  allSuggestions: { email: string; name: string }[] = [];
  filteredSuggestions: { email: string; name: string }[] = [];
  participantQuery = '';
  crmUsers: CrmUser[] = [];
  partnerGroups: PartnerGroup[] = [];

  // Powiązane dokumenty
  linkedDocs: LinkedDocument[] = [];
  showDocPicker = false;
  docSearch     = '';
  docResults: any[] = [];
  docSearching  = false;
  private docSearchTimer: any;

  // ── Gmail ────────────────────────────────────────────────────────────────────
  showEmailModal  = false;
  sendingEmail    = false;
  emailError      = '';
  emailForm: any  = { recipientList: [] as string[], subject: '', body: '', threadId: '' };
  recipientQuery  = '';
  emailAttachments: File[] = [];
  threadMessages: any[] = [];
  openThreadId    = '';

  get emailActivities(): any[] {
    return (this.partner?.activities || []).filter((a: any) => a.type === 'email');
  }

  get emailActivityCount(): number {
    return this.emailActivities.length;
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

  // ── Dokumenty powiązane ──────────────────────────────────────────
  loadLinkedDocs(id: number): void {
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
    if (this.isLinked(doc.id)) {
      this.api.unlinkPartnerDocument(this.partner.id, doc.id).subscribe({
        next: () => this.zone.run(() => {
          this.linkedDocs = this.linkedDocs.filter(d => d.document_id !== doc.id);
          this.cdr.markForCheck();
        }),
        error: () => {},
      });
    } else {
      this.api.linkPartnerDocument(this.partner.id, doc.id).subscribe({
        next: linked => this.zone.run(() => {
          this.linkedDocs = [...this.linkedDocs, { ...linked, document_title: doc.name, doc_number: doc.doc_number, doc_type: doc.doc_type }];
          this.cdr.markForCheck();
        }),
        error: () => {},
      });
    }
  }

  unlinkDoc(d: LinkedDocument): void {
    if (!this.partner || !confirm('Usunąć powiązanie z dokumentem?')) return;
    this.api.unlinkPartnerDocument(this.partner.id, d.document_id).subscribe({
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
    return [...(this.partner?.activities || [])].sort((a, b) =>
      new Date(b.activity_at).getTime() - new Date(a.activity_at).getTime()
    );
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

  ngOnInit() {
    const rawId = this.id || this.route.snapshot.paramMap.get('id') || '';
    const numId = parseInt(rawId, 10);
    if (!numId || isNaN(numId)) { this.loadError = true; return; }
    this.loadPartner(numId);
    this.loadLinkedDocs(numId);
    this.loadSuggestions(numId);
    this.api.getGroups().subscribe({ next: g => { this.zone.run(() => { this.partnerGroups = g; this.cdr.markForCheck(); }); }, error: () => {} });
  }

  private loadSuggestions(partnerId: number): void {
    this.api.getContactSuggestions(undefined, partnerId).subscribe({
      next: s => { this.allSuggestions = s; },
      error: () => {},
    });
  }

  loadPartner(numId?: number) {
    const id = numId ?? parseInt(this.id, 10);
    if (!id || isNaN(id)) return;
    this.loading = true;
    this.loadError = false;
    this.partner = null;
    this.api.getPartner(id).pipe(
      finalize(() => { this.zone.run(() => { this.loading = false; this.cdr.markForCheck(); }); })
    ).subscribe({
      next: p  => { this.zone.run(() => { this.partner = p; this.activeStep = p.onboarding_step || 0; this.cdr.markForCheck(); if (p.status === 'onboarding') this.loadTasks(p.id); }); },
      error: () => { this.zone.run(() => { this.loadError = true; this.cdr.markForCheck(); }); },
    });
  }

  openEdit() {
    if (!this.partner) return;
    this.editForm = {
      company:               this.partner.company,
      partner_number:        this.partner.partner_number || '',
      status:                this.partner.status,
      nip:                   this.partner.nip || '',
      address:               this.partner.address || '',
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
      deposit_date_in:       this.partner.deposit_date_in   ? this.partner.deposit_date_in.substring(0, 10)   : '',
      deposit_date_out:      this.partner.deposit_date_out  ? this.partner.deposit_date_out.substring(0, 10)  : '',
      commission_value:      this.partner.commission_value ?? null,
      commission_basis:      this.partner.commission_basis || 'nie_dotyczy',
      manager_id:            this.partner.manager_id || '',
      group_id:              this.partner.group_id || '',
      contract_signed:       this.partner.contract_signed  ? this.partner.contract_signed.substring(0, 10)   : '',
      contract_expires:      this.partner.contract_expires ? this.partner.contract_expires.substring(0, 10)  : '',
      contract_value:        this.partner.contract_value ?? null,
      annual_turnover_currency: this.partner.annual_turnover_currency || 'PLN',
      online_pct:               this.partner.online_pct != null ? String(this.partner.online_pct) : '',
      active_users:          this.partner.active_users ?? null,
      tagsStr:               (this.partner.tags || []).join(', '),
      notes:                 this.partner.notes || '',
      // Zadanie A
      subdomain:             this.partner.subdomain || '',
      language:              this.partner.language || '',
      partner_currency:      this.partner.partner_currency || '',
      country:               this.partner.country || '',
      // Zadanie B
      billing_address:       this.partner.billing_address || '',
      billing_zip:           this.partner.billing_zip || '',
      billing_city:          this.partner.billing_city || '',
      billing_country:       this.partner.billing_country || '',
      billing_email_address: this.partner.billing_email_address || '',
      // Zadanie C
      admin_first_name:      this.partner.admin_first_name || '',
      admin_last_name:       this.partner.admin_last_name || '',
      admin_email:           this.partner.admin_email || '',
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
    this.validatePartnerNip();
    if (this.partnerNipEditError) return;

    // Walidacja nowych pól wymaganych
    const subdomainOk = this.isValidSubdomain(this.editForm.subdomain);
    const adminEmailOk = this.isValidEmail(this.editForm.admin_email);
    const billingEmailOk = this.isValidEmail(this.editForm.billing_email_address);
    const newFieldsOk = subdomainOk && adminEmailOk && billingEmailOk
      && !!this.editForm.language && !!this.editForm.partner_currency && !!this.editForm.country
      && !!this.editForm.admin_first_name && !!this.editForm.admin_last_name && !!this.editForm.admin_email
      && !!this.editForm.billing_address && !!this.editForm.billing_zip
      && !!this.editForm.billing_city && !!this.editForm.billing_country && !!this.editForm.billing_email_address;
    if (!newFieldsOk) return;

    this.saving = true;
    const payload: Partial<Partner> = {
      company:               this.editForm.company,
      partner_number:        this.editForm.partner_number || null,
      status:                this.editForm.status,
      nip:                   this.editForm.nip ? this.editForm.nip.trim().toUpperCase() : null,
      address:               this.editForm.address || null,
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
      // Zadanie A
      subdomain:             this.editForm.subdomain || null,
      language:              this.editForm.language || null,
      partner_currency:      this.editForm.partner_currency || null,
      country:               this.editForm.country || null,
      // Zadanie B
      billing_address:       this.editForm.billing_address || null,
      billing_zip:           this.editForm.billing_zip || null,
      billing_city:          this.editForm.billing_city || null,
      billing_country:       this.editForm.billing_country || null,
      billing_email_address: this.editForm.billing_email_address || null,
      // Zadanie C
      admin_first_name:      this.editForm.admin_first_name || null,
      admin_last_name:       this.editForm.admin_last_name || null,
      admin_email:           this.editForm.admin_email || null,
    };
    this.api.updatePartner(this.partner.id, payload).subscribe({
      next: updated => {
        this.zone.run(() => {
          this.partner = { ...this.partner!, ...updated, activities: this.partner!.activities };
          // Zaktualizuj manager_name lokalnie
          if (this.editForm.manager_id) {
            const u = this.crmUsers.find(x => x.id === this.editForm.manager_id);
            if (u) this.partner!.manager_name = u.display_name;
          } else {
            this.partner!.manager_name = null;
          }
          this.saving = false;
          this.showEdit = false;
          this.cdr.markForCheck();
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

  loadTasks(partnerId: number): void {
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
    this.api.createOnboardingTask(this.partner.id, payload).subscribe({
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
    this.api.updateOnboardingTask(this.partner.id, t.id, payload).subscribe({
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
    this.api.updateOnboardingTask(this.partner.id, t.id, { done: !t.done }).subscribe({
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
    this.api.deleteOnboardingTask(this.partner.id, t.id).subscribe({
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
    // Krok 3 = ostatni — backend sprawdzi wszystkie zadania i ustawi status=active
    this.api.updateOnboardingStep(this.partner.id, 3).subscribe({
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
    this.api.updateOnboardingStep(this.partner.id, step).subscribe({
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
    if (this.actForm.type === 'meeting') {
      if (this.actForm.activity_at) payload.activity_at = this.actForm.activity_at;
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
    this.api.createPartnerActivity(this.partner.id, payload).subscribe({
      next: newAct => {
        this.zone.run(() => {
          if (this.partner) {
            this.partner = { ...this.partner, activities: [newAct, ...(this.partner.activities || [])] };
          }
          this.actForm = { type: 'note', title: '', body: '', activity_at: '', duration_min: null, meeting_location: '', participantList: [], opp_value: null, opp_currency: 'PLN', opp_status: 'new', opp_due_date: '' };
          this.participantQuery = '';
          this.showNewActivity  = false;
          this.savingActivity   = false;
          this.cdr.markForCheck();
        });
      },
      error: () => { this.zone.run(() => { this.savingActivity = false; this.cdr.markForCheck(); }); },
    });
  }

  // ── Gmail ────────────────────────────────────────────────────────────────────
  openEmailModal(prefillThreadId?: string): void {
    this.emailForm = {
      recipientList: this.partner?.email ? [this.partner.email] : [],
      subject: '',
      body: '',
      threadId: prefillThreadId || '',
    };
    this.recipientQuery   = '';
    this.emailAttachments = [];
    this.emailError       = '';
    this.showEmailModal   = true;
    this.cdr.markForCheck();
  }

  addRecipient(): void {
    const val = this.recipientQuery.trim();
    if (!val || !val.includes('@')) return;
    if (!this.emailForm.recipientList.includes(val)) {
      this.emailForm.recipientList.push(val);
    }
    this.recipientQuery = '';
    this.cdr.markForCheck();
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

  sendEmail(): void {
    if (!this.partner || !this.emailForm.recipientList?.length || !this.emailForm.subject) return;
    this.sendingEmail = true;
    this.emailError   = '';
    const fd = new FormData();
    fd.append('to', this.emailForm.recipientList.join(','));
    fd.append('subject', this.emailForm.subject);
    fd.append('body', this.emailForm.body || '');
    if (this.emailForm.threadId) fd.append('threadId', this.emailForm.threadId);
    this.emailAttachments.forEach(f => fd.append('attachments', f, f.name));

    this.api.sendPartnerEmail(this.partner.id, fd).subscribe({
      next: (result: GmailSendResult) => {
        this.zone.run(() => {
          if (this.partner) {
            const newAct: any = {
              id: result.activityId,
              type: 'email',
              title: this.emailForm.subject,
              body: this.emailForm.body,
              gmail_thread_id: result.threadId,
              gmail_message_id: result.messageId,
              activity_at: new Date().toISOString(),
              created_by_name: this.auth.user()?.display_name || null,
            };
            this.partner = { ...this.partner, activities: [newAct, ...(this.partner.activities || [])] };
          }
          this.sendingEmail   = false;
          this.showEmailModal = false;
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
    this.api.getPartnerEmailThread(this.partner.id, threadId).subscribe({
      next: msgs => this.zone.run(() => { this.threadMessages = msgs; this.cdr.markForCheck(); }),
      error: () => {},
    });
  }

  replyToThread(a: any): void {
    this.openEmailModal(a.gmail_thread_id);
    this.emailForm.subject = a.title?.startsWith('Re:') ? a.title : `Re: ${a.title}`;
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

  canEditActivity(a: any): boolean {
    const u = this.auth.user();
    return u?.is_admin || u?.crm_role === 'sales_manager' || a.created_by === u?.id;
  }

  startEditActivity(a: any): void {
    this.editingActId = a.id;
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
    };
  }

  cancelEditActivity(): void {
    this.editingActId = null;
  }

  saveEditActivity(a: any): void {
    if (!this.actEditForm.title || !this.partner) return;
    this.savingActivity = true;
    const payload: any = {
      type:  this.actEditForm.type,
      title: this.actEditForm.title,
      body:  this.actEditForm.body || null,
    };
    if (this.actEditForm.type === 'meeting') {
      if (this.actEditForm.activity_at)        payload.activity_at      = this.actEditForm.activity_at;
      if (this.actEditForm.duration_min !== '') payload.duration_min     = +this.actEditForm.duration_min;
      payload.meeting_location = this.actEditForm.meeting_location || null;
      payload.participants     = this.actEditForm.participants || null;
    }
    if (this.actEditForm.type === 'opportunity') {
      payload.opp_value    = this.actEditForm.opp_value != null && this.actEditForm.opp_value !== '' ? +this.actEditForm.opp_value : null;
      payload.opp_currency = this.actEditForm.opp_currency || 'PLN';
      payload.opp_status   = this.actEditForm.opp_status || 'new';
      payload.opp_due_date = this.actEditForm.opp_due_date || null;
    }
    this.api.updatePartnerActivity(this.partner.id, a.id, payload).subscribe({
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
    this.api.deletePartnerActivity(this.partner.id, a.id).subscribe({
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
      this.api.getContactSuggestions(undefined, this.partner.id).subscribe({
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
