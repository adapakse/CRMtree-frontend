// src/app/pages/crm/leads/crm-lead-detail.component.ts
import { Component, OnInit, OnDestroy, Input, inject, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import {
  CrmApiService, Lead, LeadActivity, LEAD_STAGE_LABELS, LeadStage,
  LEAD_SOURCES, LEAD_SOURCE_LABELS, LeadSource, LeadContact, LinkedDocument, LeadHistoryEntry, CrmUser,
  GmailSendResult,
} from '../../../core/services/crm-api.service';
import { AppSettingsService } from '../../../core/services/app-settings.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ActivityCountBadgeComponent } from '../../../shared/components/activity-count-badge/activity-count-badge.component';

@Component({
  selector: 'wt-crm-lead-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ActivityCountBadgeComponent],
  template: `
<div style="display:flex;flex-direction:column;height:100%;overflow:hidden" *ngIf="lead">

  <!-- HEADER -->
  <div style="height:56px;background:white;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:12px;padding:0 20px;flex-shrink:0">
    <button style="background:none;border:none;color:#f97316;cursor:pointer;font-size:13px;padding:4px 8px;border-radius:6px" routerLink="/crm/leads">← Leady</button>
    <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
      <div *ngIf="lead.logo_url && logoSasUrl" style="width:34px;height:34px;border-radius:50%;background-size:cover;background-position:center;border:1px solid #e5e7eb;flex-shrink:0;background-color:#f9fafb"
           [style.background-image]="logoSasUrl"></div>
      <div style="font-family:'Sora',sans-serif;font-size:16px;font-weight:700;color:#18181b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{lead.company}}</div>
    </div>
    <span class="stage-badge stage-{{lead.stage}}">{{stageLabel(lead.stage)}}</span>
    <span *ngIf="lead.hot" style="background:#fef3c7;color:#92400e;font-size:11px;padding:2px 8px;border-radius:8px;font-weight:700">🔥 Gorący</span>
    <div style="display:flex;gap:6px">
      <button class="hdr-btn" *ngIf="lead.phone && canEdit"  (click)="mockCall()"        title="Zadzwoń: {{lead.phone}}">📞</button>
      <button class="hdr-btn" *ngIf="lead.email && canEdit"  (click)="openEmailModal()"  title="Email: {{lead.email}}">
        ✉️ Email
        <span *ngIf="emailActivityCount>0" class="email-badge">{{emailActivityCount}}</span>
      </button>
      <button class="hdr-btn hdr-btn-edit" (click)="openEdit()" [disabled]="!canEdit" [title]="canEdit ? 'Edytuj lead' : 'Brak uprawnień — handlowiec nie należy do Twojej grupy'">✏️ Edytuj</button>
      <button class="hdr-btn hdr-btn-test" *ngIf="!lead.converted_at && canEdit" (click)="openTestAccountModal()" title="Załóż konto testowe w systemie zewnętrznym">
        🖥️ Konto testowe
        <span *ngIf="testAccount?.status==='created'" class="ta-badge-ok">✓</span>
        <span *ngIf="testAccount?.status==='error'"   class="ta-badge-err">!</span>
      </button>
      <button class="hdr-btn hdr-btn-primary" *ngIf="!lead.converted_at && canEdit" (click)="showConvert=true">🚀 Rozpocznij onboarding</button>
    </div>
  </div>

  <!-- BODY: 3 kolumny -->
  <div style="flex:1;display:grid;grid-template-columns:280px 1fr 340px;gap:0;overflow:hidden;min-height:0">

    <!-- LEWA: Informacje -->
    <div style="border-right:1px solid #e5e7eb;overflow-y:auto;padding:16px">

      <!-- Firma -->
      <div class="info-section">
        <div class="info-section-title">Firma</div>
        <div class="info-kv"><span class="lbl">Nazwa</span><span class="val fw">{{lead.company}}</span></div>
        <div class="info-kv" *ngIf="lead.nip"><span class="lbl">NIP</span><span class="val" style="font-family:monospace">{{lead.nip}}</span></div>
        <div class="info-kv" *ngIf="lead.website">
          <span class="lbl">WWW</span>
          <span class="val"><a class="link" [href]="'https://'+lead.website" target="_blank">{{lead.website}}</a></span>
        </div>
        <div class="info-kv" *ngIf="lead.industry"><span class="lbl">Branża</span><span class="val">{{lead.industry}}</span></div>
        <div *ngIf="lead.hot" style="display:inline-flex;align-items:center;gap:4px;background:#fef3c7;color:#92400e;font-size:11px;padding:2px 10px;border-radius:10px;font-weight:700;margin-top:4px">🔥 Gorący lead</div>
      </div>

      <!-- Główny kontakt -->
      <div class="info-section" *ngIf="lead.contact_name || lead.email || lead.phone">
        <div class="info-section-title">Kontakt</div>
        <div class="info-kv" *ngIf="lead.contact_name">
          <span class="lbl">Osoba</span>
          <span class="val">{{lead.contact_name}}<span style="color:#9ca3af" *ngIf="lead.contact_title"> · {{lead.contact_title}}</span></span>
        </div>
        <div class="info-kv" *ngIf="lead.email">
          <span class="lbl">Email</span>
          <span class="val" style="display:flex;align-items:center;gap:4px">
            <a class="link" href="mailto:{{lead.email}}">{{lead.email}}</a>
            <button style="background:none;border:none;cursor:pointer;font-size:12px;opacity:.6" (click)="openEmailModal()" title="Wyślij przez Gmail">✉️</button>
          </span>
        </div>
        <div class="info-kv" *ngIf="lead.phone">
          <span class="lbl">Telefon</span>
          <span class="val">
            <a class="link" href="tel:{{lead.phone}}">{{lead.phone}}</a>
            <button *ngIf="canEdit" style="background:none;border:none;cursor:pointer;font-size:12px;margin-left:4px;opacity:.6" (click)="mockCall()" title="Zadzwoń">📞</button>
          </span>
        </div>
      </div>

      <!-- Dodatkowe kontakty -->
      <div class="info-section" *ngIf="lead.extra_contacts?.length">
        <div class="info-section-title">Dodatkowe kontakty</div>
        @for (ec of lead.extra_contacts || []; track ec.id) {
          <div style="padding:8px 0;border-bottom:1px solid #f3f4f6">
            <div style="font-size:12px;font-weight:600;color:#374151">
              {{ec.contact_name || '—'}}<span style="color:#9ca3af;font-weight:400" *ngIf="ec.contact_title"> · {{ec.contact_title}}</span>
            </div>
            <div *ngIf="ec.email" style="font-size:11px;color:#6b7280;margin-top:2px"><a class="link" href="mailto:{{ec.email}}">{{ec.email}}</a></div>
            <div *ngIf="ec.phone" style="font-size:11px;color:#6b7280;margin-top:1px"><a class="link" href="tel:{{ec.phone}}">{{ec.phone}}</a></div>
          </div>
        }
      </div>

      <!-- Agent -->
      <div class="info-section" *ngIf="lead.agent_name || lead.agent_email || lead.agent_phone">
        <div class="info-section-title" style="color:#f97316">🤝 Agent</div>
        <div class="info-kv" *ngIf="lead.agent_name"><span class="lbl">Imię i nazwisko</span><span class="val fw">{{lead.agent_name}}</span></div>
        <div class="info-kv" *ngIf="lead.agent_email">
          <span class="lbl">Email</span>
          <a class="val link" href="mailto:{{lead.agent_email}}">{{lead.agent_email}}</a>
        </div>
        <div class="info-kv" *ngIf="lead.agent_phone"><span class="lbl">Telefon</span><span class="val">{{lead.agent_phone}}</span></div>
      </div>

      <!-- Sprzedaż -->
      <div class="info-section">
        <div class="info-section-title">Sprzedaż</div>
        <div class="info-kv"><span class="lbl">Etap</span><span class="val"><span class="stage-badge stage-{{lead.stage}}" style="font-size:10px">{{stageLabel(lead.stage)}}</span></span></div>
        <div class="info-kv" *ngIf="lead.stage==='closed_lost' && lead.lost_reason">
          <span class="lbl">Powód przegranej</span>
          <span class="val" style="color:#991b1b">{{lead.lost_reason}}</span>
        </div>
        <div class="info-kv"><span class="lbl">Szansa</span><span class="val">{{lead.probability||0}}%</span></div>
        <div class="info-kv" *ngIf="lead.value_pln">
          <span class="lbl">Obrót roczny</span>
          <span class="val" style="color:#f97316;font-family:'Sora',sans-serif;font-weight:700">{{lead.value_pln|number:'1.0-0'}} {{lead.annual_turnover_currency||'PLN'}}</span>
        </div>
        <div class="info-kv" *ngIf="lead.online_pct!=null"><span class="lbl">% Online</span><span class="val">{{lead.online_pct}}%</span></div>
        <div class="info-kv" *ngIf="lead.source"><span class="lbl">Źródło</span><span class="val">{{sourceLabel(lead.source)}}</span></div>
        <div class="info-kv" *ngIf="lead.first_contact_date"><span class="lbl">Pierwszy kontakt</span><span class="val">{{lead.first_contact_date|date:'dd.MM.yyyy'}}</span></div>
        <div class="info-kv" *ngIf="lead.close_date"><span class="lbl">Data zamknięcia</span><span class="val">{{lead.close_date|date:'dd.MM.yyyy'}}</span></div>
        <div class="info-kv" *ngIf="lead.assigned_to_name"><span class="lbl">Handlowiec</span><span class="val fw">{{lead.assigned_to_name}}</span></div>
      </div>

      <!-- Notatki i tagi -->
      <div class="info-section" *ngIf="lead.tags?.length || lead.notes">
        <div class="info-section-title">Notatki</div>
        <div *ngIf="lead.tags?.length" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
          <span *ngFor="let t of lead.tags" style="background:#eff6ff;color:#1d4ed8;border-radius:12px;padding:1px 8px;font-size:11px">{{t}}</span>
        </div>
        <div *ngIf="lead.notes" style="font-size:12px;color:#6b7280;white-space:pre-line;line-height:1.5">{{lead.notes}}</div>
      </div>

    </div>

    <!-- ŚRODEK: Aktywności (tabs: Aktywności | Historia) -->
    <div style="display:flex;flex-direction:column;overflow:hidden;min-height:0">

      <!-- STAGE STEPPER BAR -->
      <div style="background:white;border-bottom:1px solid #e5e7eb;padding:10px 12px;flex-shrink:0;display:flex;align-items:center;gap:8px">
        <!-- Onboarding in progress: blue banner -->
        <ng-container *ngIf="lead.stage==='onboarding'">
          <span style="font-size:15px">⏳</span>
          <span style="color:#1d4ed8;font-weight:700;font-size:13px">W trakcie onboardingu</span>
          <span style="font-size:12px;color:#6b7280;margin-left:4px">— partner w procesie wdrożenia</span>
          <span style="flex:1"></span>
          <span style="font-size:11px;color:#9ca3af">Lead zablokowany do edycji</span>
          <a routerLink="/crm/onboarding" style="font-size:12px;color:#2563eb;font-weight:600;text-decoration:none;margin-left:8px">→ Panel Onboarding</a>
        </ng-container>
        <!-- Onboarded: locked banner -->
        <ng-container *ngIf="lead.stage==='onboarded'">
          <span style="font-size:15px">✅</span>
          <span style="color:#15803d;font-weight:700;font-size:13px">Onboarding zakończony — Partner aktywny</span>
          <span style="flex:1"></span>
          <span style="font-size:11px;color:#9ca3af">Lead zablokowany do edycji</span>
          <a routerLink="/crm/partners" style="font-size:12px;color:#2563eb;font-weight:600;text-decoration:none;margin-left:8px">→ Rejestr Partnerów</a>
        </ng-container>
        <!-- Closed lost: red banner mode -->
        <ng-container *ngIf="lead.stage==='closed_lost'">
          <span style="font-size:15px">⛔</span>
          <span style="color:#dc2626;font-weight:700;font-size:13px">Przegrany</span>
          <span *ngIf="lead.lost_reason" style="font-size:12px;color:#991b1b">· {{lead.lost_reason}}</span>
          <span style="flex:1"></span>
          <button *ngIf="canEdit" class="stage-arrow-btn" style="color:#15803d;border-color:#bbf7d0;font-size:12px;padding:4px 12px" (click)="quickChangeStage('new')">↩ Wróć do Nowego</button>
        </ng-container>
        <!-- Normal stepper mode -->
        <ng-container *ngIf="lead.stage!=='closed_lost' && lead.stage!=='onboarded' && lead.stage!=='onboarding'">
          <button class="stage-arrow-btn" [disabled]="!prevStage() || !canEdit" (click)="quickChangeStage(prevStage()!)" title="Poprzedni etap">‹</button>
          <div style="flex:1;display:flex;align-items:flex-start;padding-top:2px">
            <ng-container *ngFor="let s of orderedStageOptions; let last=last">
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
                <div class="stepper-dot" [ngStyle]="stepperDotStyle(s.key)"
                     (click)="isStageAllowed(s.key) && canEdit && quickChangeStage(s.key)"
                     [style.cursor]="canEdit && isStageAllowed(s.key) ? 'pointer' : 'default'"
                     [title]="s.label"></div>
                <div class="stepper-label" [ngStyle]="stepperLabelStyle(s.key)">{{s.label}}</div>
              </div>
              <div *ngIf="!last" style="flex:0 0 8px;height:2px;margin-top:8px;border-radius:1px"
                   [style.background]="isStageCompleted(s.key) ? '#22c55e' : '#d1d5db'"></div>
            </ng-container>
          </div>
          <button class="stage-arrow-btn" [disabled]="!nextStage() || !canEdit" (click)="quickChangeStage(nextStage()!)" title="Następny etap">›</button>
          <button *ngIf="canEdit && lead.stage!=='closed_won'" class="stage-arrow-btn" style="color:#dc2626;border-color:#fecaca;font-size:12px;padding:4px 8px" (click)="quickChangeStage('closed_lost')" title="Przegrany">⛔</button>
        </ng-container>
      </div>

      <div style="display:flex;align-items:center;border-bottom:1px solid #e5e7eb;padding:0 16px;background:white;flex-shrink:0;gap:0">
        <button class="tab-btn" [class.active]="midTab==='activities'" (click)="midTab='activities'">
          Aktywności
          <wt-activity-count-badge [activities]="lead.activities||[]"></wt-activity-count-badge>
        </button>
        <button class="tab-btn" [class.active]="midTab==='emails'" (click)="midTab='emails'; refreshEmailActivities()">
          📧 Emaile
          <span *ngIf="emailActivityCount>0" class="email-badge" style="margin-left:4px">{{emailActivityCount}}</span>
        </button>
        <button class="tab-btn" [class.active]="midTab==='history'" (click)="midTab='history';loadHistory()">
          Historia
          <span *ngIf="history.length" style="background:#f3f4f6;border-radius:10px;padding:1px 6px;font-size:10px;margin-left:4px">{{history.length}}</span>
        </button>
      </div>

      <!-- Aktywności tab -->
      <div *ngIf="midTab==='activities'" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:0">
        <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
          <button class="btn-sm primary" *ngIf="canEdit" (click)="openNewActivityForm()">+ Dodaj aktywność</button>
        </div>

        <!-- Nowa aktywność form -->
        <div *ngIf="showNewActivity" style="background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin-bottom:12px;display:flex;flex-direction:column;gap:8px">
          <select [(ngModel)]="actForm.type" class="act-sel" (ngModelChange)="onActTypeChange()">
            <option value="task">✅ Zadanie</option>
            <option value="call">📞 Połączenie</option>
            <option value="meeting">🤝 Spotkanie</option>
            <option value="note">📝 Notatka</option>
            <option value="doc_sent">📄 Dokument</option>
          </select>
          <input [(ngModel)]="actForm.title" placeholder="Tytuł *" class="act-input">
          <!-- Data i przypisanie — dostępne dla wszystkich typów -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <label style="font-size:11px;color:#6b7280;display:flex;flex-direction:column;gap:2px;font-weight:600">
              Data i godzina wykonania
              <input type="datetime-local" [(ngModel)]="actForm.activity_at" class="act-input" style="font-size:12px">
            </label>
            <label style="font-size:11px;color:#6b7280;display:flex;flex-direction:column;gap:2px;font-weight:600">
              Przypisz do handlowca
              <select [(ngModel)]="actForm.assigned_to" class="act-input" style="font-size:12px">
                <option value="">— bez przypisania —</option>
                <option *ngFor="let u of crmUsers" [value]="u.id">{{u.display_name}}</option>
              </select>
            </label>
          </div>
          <ng-container *ngIf="actForm.type==='meeting'">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              <label style="font-size:11px;color:#6b7280;display:flex;flex-direction:column;gap:2px;font-weight:600">Czas trwania (min)<input type="number" min="0" [(ngModel)]="actForm.duration_min" placeholder="60" class="act-input" style="font-size:11px"></label>
              <label style="font-size:11px;color:#6b7280;display:flex;flex-direction:column;gap:2px;font-weight:600">Miejsce<input [(ngModel)]="actForm.meeting_location" placeholder="np. Sala konferencyjna A" class="act-input" style="font-size:11px"></label>
            </div>
            <label style="font-size:11px;color:#6b7280;display:flex;flex-direction:column;gap:2px;font-weight:600">
              Uczestnicy
              <div class="participant-input-wrap">
                <div class="participant-chips">
                  <span *ngFor="let e of actForm.participantList; let i=index" class="participant-chip">{{e}}<button (click)="removeParticipant(actForm,i)" type="button">✕</button></span>
                  <input class="participant-input" [(ngModel)]="participantQuery" (ngModelChange)="filterSuggestions()" (keydown.enter)="addParticipantFromInput(actForm)" (keydown.Tab)="addParticipantFromInput(actForm)" placeholder="Wpisz email…" autocomplete="off">
                </div>
                <div class="suggestions-dropdown" *ngIf="filteredSuggestions.length && participantQuery">
                  <div *ngFor="let s of filteredSuggestions" class="suggestion-item" (mousedown)="pickSuggestion(actForm,s)"><span style="font-weight:600">{{s.name}}</span><span style="color:#9ca3af;margin-left:6px;font-size:11px">{{s.email}}</span></div>
                </div>
              </div>
            </label>
          </ng-container>
          <textarea [(ngModel)]="actForm.body" placeholder="Treść / notatki…" rows="2" class="act-input"></textarea>
          <div style="display:flex;gap:6px;justify-content:flex-end">
            <button class="btn-sm" (click)="showNewActivity=false">Anuluj</button>
            <button class="btn-sm primary" (click)="addActivity()" [disabled]="!actForm.title||savingActivity">{{savingActivity?'…':'Zapisz'}}</button>
          </div>
        </div>

        <!-- Lista aktywności -->
        <div *ngFor="let a of (lead.activities||[]).filter(x => x.type !== 'email')" class="act-item"
             [class.act-closed]="a.status==='closed'"
             [class.act-overdue]="a.status!=='closed' && a.activity_at && isActOverdue(a.activity_at)"
             [class.act-today]="a.status!=='closed' && a.activity_at && isActToday(a.activity_at)"
             style="cursor:pointer" (click)="openActModal(a)">
          <span class="act-type-icon">{{actIcon(a.type)}}</span>
          <div class="act-body">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <strong>{{actTypeName(a.type)}}: {{a.title}}</strong>
              <span class="act-status-badge act-status-{{a.status||'new'}}">{{actStatusLabel(a.status||'new')}}</span>
            </div>
            <div class="act-meta">
              <span *ngIf="a.activity_at">{{a.activity_at|date:'dd.MM.yyyy HH:mm'}} · </span>
              <span *ngIf="a.assigned_to_name">👤 {{a.assigned_to_name}}</span>
              <span *ngIf="!a.assigned_to_name">{{a.created_by_name}}</span>
            </div>
            <div class="act-text" *ngIf="a.body" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:400px">{{stripHtml(a.body)}}</div>
          </div>
        </div>
        <div *ngIf="!(lead.activities?.filter(x => x.type !== 'email')?.length)" class="empty-act">Brak aktywności. Dodaj pierwszą powyżej.</div>
      </div>

      <!-- Emaile tab -->
      <div *ngIf="midTab==='emails'" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:0">
        <div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:10px">
          <button class="btn-sm" (click)="debugProcessGmail()" [disabled]="debugProcessing" title="Sprawdź nowe emaile przez Gmail API (debug)">
            {{debugProcessing ? '⏳' : '🔄'}} Sprawdź nowe
          </button>
          <button class="btn-sm primary" *ngIf="canEdit" (click)="openEmailModal()">+ Nowy email</button>
        </div>
        <div *ngIf="emailActivities.length===0" class="empty-act">Brak wysłanych emaili.</div>
        <!-- Aktywności email -->
        <div *ngFor="let a of emailActivities"
             class="act-item"
             style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:8px;cursor:pointer;"
             [style.border-left]="selectedEmailActivity?.id===a.id ? '3px solid #3b82f6' : hasUnreadInActivity(a) ? '3px solid #ef4444' : '3px solid #dbeafe'"
             [style.background]="selectedEmailActivity?.id===a.id ? '#eff6ff' : hasUnreadInActivity(a) ? '#fef2f2' : 'white'"
             (click)="selectEmailForPanel(a)">
          <span class="act-type-icon">📧</span>
          <div class="act-body" style="flex:1">
            <div style="display:flex;align-items:center;gap:6px">
              <strong style="flex:1">{{a.title}}</strong>
              <span *ngIf="hasUnreadInActivity(a)" style="width:8px;height:8px;border-radius:50%;background:#ef4444;flex-shrink:0" title="Nieprzeczytana"></span>
            </div>
            <div class="act-meta">
              <span *ngIf="a.activity_at">{{a.activity_at|date:'dd.MM.yyyy HH:mm'}} · </span>
              <span *ngIf="a.assigned_to_name">👤 {{a.assigned_to_name}}</span>
              <span *ngIf="!a.assigned_to_name">{{a.created_by_name}}</span>
            </div>
            <div class="act-text" *ngIf="a.body" style="margin-top:4px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">{{stripHtml(a.body)}}</div>
          </div>
        </div>
      </div>

      <!-- Historia tab -->
      <div *ngIf="midTab==='history'" style="flex:1;overflow-y:auto;padding:16px">
        <div *ngIf="historyLoading" style="text-align:center;color:#9ca3af;padding:20px;font-size:12px">�?adowanie historii…</div>
        <div *ngIf="!historyLoading && history.length===0" style="text-align:center;color:#9ca3af;padding:20px;font-size:12px">Brak wpisów historii.</div>
        <div *ngFor="let h of history" class="hist-item">
          <div class="hist-dot" [style.background]="histColor(h.action)"></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600;color:#374151">{{histLabel(h)}}</div>
            <div style="font-size:10px;color:#9ca3af;margin-top:1px">{{h.created_at|date:'dd.MM.yyyy HH:mm'}} · {{h.user_name||h.user_email||'System'}}</div>
            <div *ngIf="histDetail(h)" style="font-size:11px;color:#6b7280;margin-top:3px;background:#f9fafb;border-radius:4px;padding:4px 6px">{{histDetail(h)}}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- PRAWA: Mock call/email + Konwertuj info -->
    <div style="border-left:1px solid #e5e7eb;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px">

      <!-- Komunikacja -->
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#15803d;margin-bottom:10px">📞 Komunikacja</div>
        <button class="comm-btn" *ngIf="canEdit" (click)="mockCall()" [disabled]="!lead.phone">
          <span style="font-size:16px">📞</span>
          <div style="flex:1;text-align:left">
            <div style="font-size:12px;font-weight:600">Zadzwoń</div>
            <div style="font-size:10px;color:#9ca3af">{{lead.phone||'Brak numeru'}}</div>
          </div>
        </button>
        <button class="comm-btn" *ngIf="canEdit" (click)="openEmailModal()" [disabled]="!lead.email" style="margin-top:6px">
          <span style="font-size:16px">✉️</span>
          <div style="flex:1;text-align:left">
            <div style="font-size:12px;font-weight:600">Wyślij email</div>
            <div style="font-size:10px;color:#9ca3af">{{lead.email||'Brak adresu'}}</div>
          </div>
          <span *ngIf="emailActivityCount>0" class="email-badge">{{emailActivityCount}}</span>
        </button>
        <div *ngIf="mockCallActive" style="margin-top:8px;background:#dcfce7;border-radius:6px;padding:8px;font-size:11px;color:#15803d;text-align:center">
          🔔 Symulacja połączenia z {{lead.phone}}…
          <button (click)="mockCallActive=false" style="background:none;border:none;cursor:pointer;color:#15803d;margin-left:8px;font-weight:700">Rozłącz</button>
        </div>
      </div>

      <!-- Email otwarty w panelu -->
      <div *ngIf="selectedEmailActivity" style="background:white;border:1px solid #bfdbfe;border-radius:10px;padding:14px;position:relative">
        <button (click)="selectedEmailActivity=null;panelThreadMessages=[]"
                style="position:absolute;top:8px;right:8px;background:none;border:none;cursor:pointer;color:#9ca3af;font-size:14px;line-height:1">✕</button>
        <div style="font-size:11px;font-weight:700;color:#1d4ed8;margin-bottom:4px;padding-right:20px">📧 {{selectedEmailActivity.title}}</div>
        <div style="font-size:10px;color:#9ca3af;margin-bottom:10px">
          {{selectedEmailActivity.activity_at|date:'dd.MM.yyyy HH:mm'}}
          <span *ngIf="selectedEmailActivity.created_by_name"> · {{selectedEmailActivity.created_by_name}}</span>
        </div>
        <div *ngIf="panelLoadingThread" style="text-align:center;color:#9ca3af;font-size:12px;padding:8px">Ładowanie wątku…</div>
        <div *ngFor="let m of panelThreadMessages"
             style="border:1px solid #e5e7eb;border-radius:6px;padding:8px;margin-bottom:6px;font-size:11px"
             [style.border-left]="isMessageRead(m) ? '3px solid #e5e7eb' : '3px solid #ef4444'">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:4px;margin-bottom:4px">
            <span style="font-weight:600;color:#374151;flex:1">{{m.from}}</span>
            <span style="color:#9ca3af;font-size:10px;white-space:nowrap">{{m.date|date:'dd.MM HH:mm'}}</span>
          </div>
          <div style="color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px;cursor:pointer"
               (click)="openMsgModal(m)">{{m.snippet}}</div>
          <div style="display:flex;gap:6px;align-items:center">
            <button (click)="openMsgModal(m)"
                    style="font-size:10px;padding:2px 8px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:4px;cursor:pointer;color:#374151">
              Otwórz
            </button>
            <button (click)="toggleMsgRead(m)"
                    style="font-size:10px;padding:2px 8px;border-radius:4px;cursor:pointer;border:1px solid"
                    [style.background]="isMessageRead(m) ? '#f3f4f6' : '#fef2f2'"
                    [style.border-color]="isMessageRead(m) ? '#e5e7eb' : '#fecaca'"
                    [style.color]="isMessageRead(m) ? '#6b7280' : '#dc2626'">
              {{isMessageRead(m) ? '✓ Przeczytana' : '● Nieprzeczytana'}}
            </button>
          </div>
        </div>
        <div *ngIf="!panelLoadingThread && panelThreadMessages.length===0 && selectedEmailActivity.body"
             style="font-size:11px;color:#374151;background:#f9fafb;border-radius:6px;padding:8px;margin-bottom:6px">
          {{stripHtml(selectedEmailActivity.body)}}
        </div>
        <button *ngIf="selectedEmailActivity.gmail_thread_id" class="comm-btn" style="margin-top:6px"
                (click)="replyToThread(selectedEmailActivity)">
          <span>↩</span><div style="flex:1;text-align:left"><div style="font-size:12px;font-weight:600">Odpowiedz</div></div>
        </button>
      </div>

      <!-- Powiązane dokumenty -->
      <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af">📎 Dokumenty ({{linkedDocs.length}})</div>
          <button class="btn-sm" *ngIf="canEdit" (click)="showDocPicker=true" style="font-size:10px">+ Dodaj</button>
        </div>
        <div *ngIf="linkedDocs.length===0" style="font-size:11px;color:#9ca3af;text-align:center;padding:6px">Brak</div>
        <div *ngFor="let d of linkedDocs" style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #f9fafb;cursor:pointer" (click)="openDocument(d)" title="Otwórz dokument">
          <span style="font-size:13px">📄</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:600;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{d.document_title||'#'+d.document_id}}</div>
            <div style="font-size:10px;color:#9ca3af"><span *ngIf="d.doc_number">#{{d.doc_number}} · </span>{{d.doc_type}}</div>
          </div>
          <button style="background:none;border:none;cursor:pointer;color:#d1d5db;font-size:11px;padding:2px" (click)="$event.stopPropagation();unlinkDoc(d)">✕</button>
        </div>
      </div>

      <!-- Onboarding -->
      <div *ngIf="!lead.converted_at && canEdit" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#c2410c;margin-bottom:8px">🚀 Rozpocznij onboarding</div>
        <div style="font-size:12px;color:#9a3412;margin-bottom:10px">Podaj wartość kontraktu i datę podpisania umowy, aby przenieść leada do procesu wdrożenia.</div>
        <button class="hdr-btn hdr-btn-primary" style="width:100%;justify-content:center" (click)="showConvert=true">🚀 Rozpocznij onboarding →</button>
      </div>
      <div *ngIf="lead.converted_at && lead.stage==='onboarding'" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px">
        <div style="font-size:11px;font-weight:700;color:#1d4ed8;margin-bottom:4px">⏳ W trakcie onboardingu</div>
        <div style="font-size:11px;color:#9ca3af;margin-bottom:6px">Rozpoczęto: {{lead.converted_at|date:'dd.MM.yyyy'}}</div>
        <div style="font-size:11px;color:#6b7280;margin-bottom:8px">Lead jest w procesie wdrożenia. Szczegóły w sekcji Onboarding.</div>
        <a routerLink="/crm/onboarding" style="font-size:12px;color:#2563eb;font-weight:600;text-decoration:none">→ Przejdź do Onboarding</a>
      </div>
      <div *ngIf="lead.stage==='onboarded'" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px">
        <div style="font-size:11px;font-weight:700;color:#15803d;margin-bottom:4px">✓ Onboarding zakończony</div>
        <div style="font-size:11px;color:#9ca3af;margin-bottom:4px">{{lead.converted_at|date:'dd.MM.yyyy'}}</div>
        <div style="font-size:11px;color:#6b7280">Partner pojawi się w Rejestrze Partnerów po synchronizacji z DWH.</div>
      </div>
    </div>
  </div>
</div>

<div *ngIf="!lead&&!loading" style="padding:40px;text-align:center;color:#9ca3af">
  {{ loadError ? 'Błąd ładowania leada.' : 'Lead nie znaleziony.' }}
</div>
<div *ngIf="loading" style="padding:40px;text-align:center;color:#9ca3af">�?adowanie…</div>

<!-- ── Gmail Compose Modal ─────────────────────────────────────────────────── -->
<div class="modal-overlay" *ngIf="showEmailModal" (click)="showEmailModal=false">
  <div class="modal modal-wide" (click)="$event.stopPropagation()" style="width:min(580px,100%)">
    <div class="modal-header">
      <h3>✉️ Wyślij email</h3>
      <button class="close-btn" (click)="showEmailModal=false">✕</button>
    </div>

    <!-- Gmail niepołączony — pokaż prompt -->
    <div *ngIf="!gmailConnected" class="modal-body" style="gap:14px;text-align:center;padding:28px 24px">
      <div style="font-size:36px">📧</div>
      <div style="font-size:15px;font-weight:700;color:#18181b">Konto Gmail niepołączone</div>
      <div style="font-size:13px;color:#6b7280;line-height:1.6">
        Aby wysyłać i odbierać emaile bezpośrednio z CRM, połącz swoje konto Gmail.<br>
        Każdy handlowiec łączy własną skrzynkę.
      </div>
      <button *ngIf="gmailAuthUrl" (click)="connectGmail()"
         style="background:#f97316;color:white;border:none;border-radius:8px;padding:9px 22px;font-size:13px;font-weight:600;cursor:pointer;margin-top:6px">
        🔗 Połącz konto Gmail
      </button>
      <div *ngIf="!gmailAuthUrl" style="color:#9ca3af;font-size:12px">
        Brak konfiguracji OAuth. Skontaktuj się z administratorem.
      </div>
    </div>

    <!-- Formularz wysyłki -->
    <div *ngIf="gmailConnected" class="modal-body" style="gap:10px">
      <div style="font-size:11px;color:#6b7280;background:#f0fdf4;border-radius:6px;padding:5px 10px;display:flex;align-items:center;gap:6px">
        ✅ Wysyłam z: <strong>{{gmailEmail}}</strong>
      </div>
      <!-- Do: -->
      <label style="font-size:12px;font-weight:600;display:flex;flex-direction:column;gap:4px">
        Do
        <div class="participant-chips">
          <span *ngFor="let r of emailForm.recipientList; let i=index" class="participant-chip">
            {{r}}<button (click)="emailForm.recipientList.splice(i,1)" type="button">✕</button>
          </span>
          <input class="participant-input" [(ngModel)]="recipientQuery"
                 (input)="onRecipientInput()"
                 (keydown.enter)="addRecipient()" (keydown.Tab)="addRecipient()"
                 (blur)="showRecipientSug=false"
                 placeholder="email@firma.pl" autocomplete="off">
          <div *ngIf="showRecipientSug" class="suggest-dropdown">
            <div *ngFor="let s of recipientSuggestions" class="suggest-item"
                 (mousedown)="pickRecipientSug(s)">
              <span style="font-weight:600">{{s.name||s.email}}</span>
              <span style="color:#9ca3af;font-size:10px;margin-left:4px">{{s.name ? s.email : ''}}</span>
            </div>
          </div>
        </div>
      </label>
      <!-- DW (CC): -->
      <label style="font-size:12px;font-weight:600;display:flex;flex-direction:column;gap:4px">
        DW
        <div class="participant-chips">
          <span *ngFor="let r of emailForm.ccList; let i=index" class="participant-chip">
            {{r}}<button (click)="emailForm.ccList.splice(i,1)" type="button">✕</button>
          </span>
          <input class="participant-input" [(ngModel)]="ccQuery"
                 (input)="onCcInput()"
                 (keydown.enter)="addCc()" (keydown.Tab)="addCc()"
                 (blur)="showCcSug=false"
                 placeholder="dw@firma.pl" autocomplete="off">
          <div *ngIf="showCcSug" class="suggest-dropdown">
            <div *ngFor="let s of ccSuggestions" class="suggest-item"
                 (mousedown)="pickCcSug(s)">
              <span style="font-weight:600">{{s.name||s.email}}</span>
              <span style="color:#9ca3af;font-size:10px;margin-left:4px">{{s.name ? s.email : ''}}</span>
            </div>
          </div>
        </div>
      </label>
      <!-- Temat -->
      <label style="font-size:12px;font-weight:600;display:flex;flex-direction:column;gap:4px">
        Temat
        <input class="act-input" [(ngModel)]="emailForm.subject" placeholder="Temat wiadomości">
      </label>
      <!-- Thread reply info -->
      <div *ngIf="emailForm.threadId" style="font-size:11px;color:#6b7280;background:#eff6ff;border-radius:6px;padding:6px 10px;display:flex;align-items:center;gap:8px">
        <span>📎 Odpowiedź w wątku</span>
        <button (click)="emailForm.threadId=''" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:10px">✕ Usuń</button>
      </div>
      <!-- Treść -->
      <label style="font-size:12px;font-weight:600;display:flex;flex-direction:column;gap:4px">
        Treść
        <textarea class="act-input" id="email-body-textarea" [(ngModel)]="emailForm.body" rows="7" placeholder="Treść wiadomości…"></textarea>
        <div *ngIf="emailForm.quotedHtml" style="font-size:11px;color:#15803d;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:4px 10px;display:flex;align-items:center;gap:5px;margin-top:2px">
          📋 Historia korespondencji zostanie automatycznie dołączona
        </div>
      </label>
      <!-- Załączniki -->
      <div style="display:flex;flex-direction:column;gap:6px">
        <span style="font-size:12px;font-weight:600">Załączniki</span>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <input type="file" multiple (change)="onAttachmentChange($event)" style="font-size:12px;color:#6b7280;flex:1;min-width:0">
          <button *ngIf="gmailConnected && !driveNeedsReauth"
                  (click)="openDrivePicker()" [disabled]="drivePickerLoading"
                  style="flex-shrink:0;font-size:11px;padding:4px 10px;border:1px solid #a5b4fc;border-radius:6px;background:#eef2ff;color:#4338ca;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:4px">
            <span *ngIf="!drivePickerLoading">📁 Z Google Drive</span>
            <span *ngIf="drivePickerLoading">⏳ Ładowanie…</span>
          </button>
        </div>
        <div *ngIf="driveNeedsReauth"
             style="background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:8px 12px;font-size:11px;color:#9a3412;display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span>⚠️ Wymagane ponowne połączenie Gmail (nowe uprawnienia do Drive)</span>
          <button *ngIf="gmailAuthUrl" (click)="connectGmail()"
                  style="flex-shrink:0;font-size:11px;padding:3px 10px;border:1px solid #fb923c;border-radius:5px;background:#fff;color:#ea580c;cursor:pointer;white-space:nowrap">
            Połącz ponownie
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
      <!-- Error -->
      <div *ngIf="emailError" style="color:#ef4444;font-size:12px;background:#fef2f2;border-radius:6px;padding:6px 10px">⚠️ {{emailError}}</div>
    </div>

    <div class="modal-footer">
      <button class="btn-outline" (click)="showEmailModal=false">Anuluj</button>
      <button *ngIf="gmailConnected" class="btn-primary" (click)="sendEmail()"
              [disabled]="sendingEmail || (!emailForm.recipientList?.length && !recipientQuery?.includes('@')) || !emailForm.subject">
        {{sendingEmail ? '⏳ Wysyłanie…' : '📤 Wyślij'}}
      </button>
    </div>
  </div>
</div>

<!-- Thread modal -->
<div class="modal-overlay" *ngIf="showThreadModal" (click)="showThreadModal=false">
  <div class="modal modal-wide" (click)="$event.stopPropagation()" style="width:min(680px,100%)">
    <div class="modal-header">
      <h3>💬 Wątek email</h3>
      <button class="close-btn" (click)="showThreadModal=false">✕</button>
    </div>
    <div class="modal-body" style="gap:8px">
      <div *ngIf="loadingThread" style="text-align:center;color:#9ca3af;padding:20px">�?adowanie wątku…</div>
      <div *ngFor="let m of threadMessages"
           [style.border]="!m.is_read && !m.created_by ? '1px solid #fbbf24' : '1px solid #e5e7eb'"
           [style.background]="!m.is_read && !m.created_by ? '#fffbeb' : 'white'"
           style="border-radius:8px;padding:12px;font-size:12px;cursor:pointer;transition:background .15s"
           (click)="openMsgModal(m)"
           (mouseenter)="$any($event.currentTarget).style.background='#f9fafb'"
           (mouseleave)="$any($event.currentTarget).style.background=(!m.is_read && !m.created_by) ? '#fffbeb' : 'white'">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span [style.font-weight]="!m.is_read && !m.created_by ? '700' : '600'" style="color:#374151">{{m.from}}</span>
          <span style="color:#9ca3af;font-size:11px">{{m.date|date:'dd.MM.yyyy HH:mm'}}</span>
        </div>
        <div style="color:#6b7280;font-size:11px;margin-bottom:1px">Do: {{m.to}}</div>
        <div *ngIf="m.cc" style="color:#6b7280;font-size:11px;margin-bottom:4px">DW: {{m.cc}}</div>
        <div style="color:#374151;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:560px">{{m.snippet}}</div>
        <!-- Wszystkie załączniki (odebrane + wysłane) -->
        <div *ngIf="(m.attachments?.length||0)+(m.sentAttachments?.length||0)>0"
             style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px" (click)="$event.stopPropagation()">
          <span *ngFor="let att of m.attachments" class="att-chip" style="background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8">
            📎 {{att.filename}}
            <span class="att-chip-actions">
              <button class="att-action-btn view" (click)="$event.stopPropagation();viewAttachment(att,m.id)" title="Otwórz w przeglądarce">Podgląd</button>
              <button class="att-action-btn dl" (click)="$event.stopPropagation();downloadAtt(att,m.id)" title="Pobierz plik">Pobierz</button>
            </span>
          </span>
          <span *ngFor="let att of m.sentAttachments" class="att-chip" style="background:#f0fdf4;border:1px solid #bbf7d0;color:#166534">
            📎 {{att.filename}}
            <span class="att-chip-actions">
              <button class="att-action-btn view" (click)="$event.stopPropagation();viewAttachment(att,m.id)" title="Otwórz w przeglądarce">Podgląd</button>
              <button class="att-action-btn dl" (click)="$event.stopPropagation();downloadAtt(att,m.id)" title="Pobierz plik">Pobierz</button>
            </span>
          </span>
        </div>
      </div>
      <div *ngIf="!loadingThread&&threadMessages.length===0" style="text-align:center;color:#9ca3af;padding:16px">Brak wiadomości w wątku.</div>
    </div>
    <div class="modal-footer">
      <button class="btn-outline" (click)="showThreadModal=false">Zamknij</button>
      <button class="btn-primary" (click)="replyToCurrentThread()">↩ Odpowiedz</button>
    </div>
  </div>
</div>

<!-- Message Detail Modal -->
<div class="modal-overlay" *ngIf="showMsgModal" (click)="closeMsgModal()">
  <div class="modal modal-wide" (click)="$event.stopPropagation()" style="width:min(720px,100%);max-height:90vh;display:flex;flex-direction:column">
    <div class="modal-header">
      <h3>📧 {{msgModalMsg?.subject}}</h3>
      <button class="close-btn" (click)="closeMsgModal()">✕</button>
    </div>
    <div class="modal-body" style="gap:10px;overflow-y:auto;flex:1" *ngIf="msgModalMsg">
      <!-- Metadane -->
      <div style="background:#f9fafb;border-radius:8px;padding:12px;font-size:12px;display:flex;flex-direction:column;gap:4px">
        <div style="display:flex;gap:8px"><span style="color:#9ca3af;min-width:40px">Od:</span><span style="color:#374151;font-weight:600">{{msgModalMsg.from}}</span></div>
        <div style="display:flex;gap:8px"><span style="color:#9ca3af;min-width:40px">Do:</span><span style="color:#374151">{{msgModalMsg.to}}</span></div>
        <div *ngIf="msgModalMsg.cc" style="display:flex;gap:8px"><span style="color:#9ca3af;min-width:40px">DW:</span><span style="color:#374151">{{msgModalMsg.cc}}</span></div>
        <div style="display:flex;gap:8px"><span style="color:#9ca3af;min-width:40px">Data:</span><span style="color:#374151">{{msgModalMsg.date|date:'dd.MM.yyyy HH:mm'}}</span></div>
      </div>
      <!-- Treść -->
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;font-size:13px;line-height:1.6;color:#374151;white-space:pre-line;max-height:320px;overflow-y:auto"
           [innerHTML]="msgModalMsg.body || msgModalMsg.snippet"></div>
      <!-- Załączniki -->
      <div *ngIf="(msgModalMsg.attachments?.length||0)+(msgModalMsg.sentAttachments?.length||0)>0"
           style="display:flex;flex-wrap:wrap;gap:6px">
        <span *ngFor="let att of msgModalMsg.attachments" class="att-chip" style="background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;font-size:11px;padding:4px 10px">
          📎 {{att.filename}}
          <span class="att-chip-actions">
            <button class="att-action-btn view" (click)="$event.stopPropagation();viewAttachment(att,msgModalMsg.id)" title="Otwórz w przeglądarce">Podgląd</button>
            <button class="att-action-btn dl" (click)="$event.stopPropagation();downloadAtt(att,msgModalMsg.id)" title="Pobierz plik">Pobierz</button>
          </span>
        </span>
        <span *ngFor="let att of msgModalMsg.sentAttachments" class="att-chip" style="background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;font-size:11px;padding:4px 10px">
          📎 {{att.filename}}
          <span class="att-chip-actions">
            <button class="att-action-btn view" (click)="$event.stopPropagation();viewAttachment(att,msgModalMsg.id)" title="Otwórz w przeglądarce">Podgląd</button>
            <button class="att-action-btn dl" (click)="$event.stopPropagation();downloadAtt(att,msgModalMsg.id)" title="Pobierz plik">Pobierz</button>
          </span>
        </span>
      </div>
      <!-- Reply form -->
      <div *ngIf="msgModalReply" style="border-top:1px solid #e5e7eb;padding-top:12px;display:flex;flex-direction:column;gap:8px">
        <div style="font-size:12px;font-weight:700;color:#374151">↩ Odpowiedz</div>
        <!-- Do -->
        <label style="font-size:12px;font-weight:600;display:flex;flex-direction:column;gap:3px">
          Do
          <div class="participant-chips">
            <span *ngFor="let r of msgModalForm.recipientList; let i=index" class="participant-chip">
              {{r}}<button (click)="msgModalForm.recipientList.splice(i,1)" type="button">✕</button>
            </span>
            <input class="participant-input" [(ngModel)]="msgModalRecipientQuery"
                   (keydown.enter)="pushMsgRecipient()" (keydown.Tab)="pushMsgRecipient()"
                   placeholder="email@firma.pl" autocomplete="off">
          </div>
        </label>
        <!-- DW -->
        <label style="font-size:12px;font-weight:600;display:flex;flex-direction:column;gap:3px">
          DW
          <div class="participant-chips">
            <span *ngFor="let r of msgModalForm.ccList; let i=index" class="participant-chip">
              {{r}}<button (click)="msgModalForm.ccList.splice(i,1)" type="button">✕</button>
            </span>
            <input class="participant-input" [(ngModel)]="msgModalCcQuery"
                   (keydown.enter)="pushMsgCc()" (keydown.Tab)="pushMsgCc()"
                   placeholder="dw@firma.pl" autocomplete="off">
          </div>
        </label>
        <!-- Temat -->
        <label style="font-size:12px;font-weight:600;display:flex;flex-direction:column;gap:3px">
          Temat
          <input class="act-input" [(ngModel)]="msgModalForm.subject" placeholder="Temat wiadomości">
        </label>
        <!-- Treść -->
        <label style="font-size:12px;font-weight:600;display:flex;flex-direction:column;gap:3px">
          Treść
          <textarea class="act-input" id="msg-reply-textarea" [(ngModel)]="msgModalForm.body" rows="5" placeholder="Treść odpowiedzi…"></textarea>
          <div *ngIf="msgModalForm.quotedHtml" style="font-size:11px;color:#15803d;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:4px 10px;display:flex;align-items:center;gap:5px;margin-top:2px">
            📋 Historia korespondencji zostanie automatycznie dołączona
          </div>
        </label>
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
        <div *ngIf="msgModalError" style="color:#ef4444;font-size:12px;background:#fef2f2;border-radius:6px;padding:6px 10px">⚠️ {{msgModalError}}</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-outline" (click)="closeMsgModal()">Zamknij</button>
      <button *ngIf="!msgModalReply && gmailConnected" class="btn-outline" (click)="startMsgReply()">↩ Odpowiedz</button>
      <button *ngIf="msgModalReply && gmailConnected" class="btn-primary" (click)="sendMsgReply()"
              [disabled]="msgModalSending || !msgModalForm.recipientList?.length || !msgModalForm.subject">
        {{msgModalSending ? '⏳ Wysyłanie…' : '📤 Wyślij odpowiedź'}}
      </button>
    </div>
  </div>
</div>

<!-- Edit modal -->
<div class="modal-overlay" *ngIf="showEdit" (click)="showEdit=false">
  <div class="modal modal-wide" (click)="$event.stopPropagation()">
    <div class="modal-header">
      <h3>Edytuj lead</h3>
      <button class="close-btn" (click)="showEdit=false">✕</button>
    </div>
    <div class="modal-body">
      <div class="edit-section">
        <div class="edit-section-title">Podstawowe</div>
        <div class="edit-row">
          <label>Nazwa firmy *<input [(ngModel)]="editForm.company" placeholder="Nazwa firmy" required></label>
          <label>Etap<select [(ngModel)]="editForm.stage"><option *ngFor="let s of allowedStageOptions" [value]="s.key">{{s.label}}</option></select></label>
        </div>
        <div class="edit-row" *ngIf="editForm.stage==='closed_lost'">
          <label class="full" style="color:#991b1b">Powód przegranej *
            <select [(ngModel)]="editForm.lost_reason"
                    [style.border-color]="!editForm.lost_reason ? '#ef4444' : ''">
              <option value="">— wybierz powód —</option>
              <option *ngFor="let r of lostReasons" [value]="r">{{r}}</option>
            </select>
          </label>
        </div>
        <div class="edit-row"><label class="check-label"><input type="checkbox" [(ngModel)]="editForm.hot"> 🔥 Gorący lead</label></div>
      </div>
      <div class="edit-section">
        <div class="edit-section-title">Strona WWW</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;outline:none;font-family:inherit"
                 [(ngModel)]="editForm.website" placeholder="np. acme.pl"
                 (keydown.enter)="runDetailEnrich()">
          <button class="btn-outline" style="white-space:nowrap;flex-shrink:0"
                  (click)="runDetailEnrich()"
                  [disabled]="!editForm.website||detailEnriching">
            {{detailEnriching ? '⏳ Pobieranie…' : '🔍 Pobierz dane'}}
          </button>
        </div>
        <div *ngIf="detailEnrichDone" style="margin-top:6px;font-size:11px;color:#15803d;background:#f0fdf4;border-radius:6px;padding:5px 10px">
          ✓ Dane pobrane — sprawdź pola poniżej
        </div>
      </div>
      <div class="edit-section">
        <div class="edit-section-title">Kontakt</div>
        <div class="edit-row">
          <label><span style="display:flex;align-items:center;gap:4px">Imię i nazwisko <span *ngIf="requiresFullFields" style="color:#f97316">*</span></span>
            <input [(ngModel)]="editForm.contact_name" placeholder="Jan Kowalski"
                   [style.border-color]="requiresFullFields && !editForm.contact_name ? '#fca5a5' : ''">
          </label>
          <label><span style="display:flex;align-items:center;gap:4px">Rola w firmie <span *ngIf="requiresFullFields" style="color:#f97316">*</span></span><select [(ngModel)]="editForm.contact_title"
                   [style.border-color]="requiresFullFields && !editForm.contact_title ? '#fca5a5' : ''"><option value="">— brak —</option><option *ngFor="let t of dictTitles" [value]="t">{{t}}</option></select></label>
        </div>
        <div class="edit-row">
          <label><span style="display:flex;align-items:center;gap:4px">Email <span *ngIf="requiresFullFields" style="color:#f97316">*</span></span>
            <input [(ngModel)]="editForm.email" type="email" placeholder="jan@firma.pl"
                   [style.border-color]="requiresFullFields && !editForm.email ? '#fca5a5' : ''">
          </label>
          <label><span style="display:flex;align-items:center;gap:4px">Telefon <span *ngIf="requiresFullFields" style="color:#f97316">*</span></span>
            <input [(ngModel)]="editForm.phone" placeholder="+48 600 000 000"
                   [style.border-color]="requiresFullFields && !editForm.phone ? '#fca5a5' : ''">
          </label>
        </div>
      </div>
      <div class="edit-section">
        <div class="edit-section-title" style="display:flex;align-items:center;justify-content:space-between">
          <span>Dodatkowe kontakty</span>
          <button style="background:none;border:1px solid #fed7aa;border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer;color:#f97316" (click)="addExtraContact()">+ Dodaj kontakt</button>
        </div>
        @for (ec of extraContacts; track $index; let i = $index) {
          <div style="border:1px solid var(--gray-200);border-radius:8px;padding:10px 12px;margin-bottom:8px;position:relative">
            <button style="position:absolute;top:6px;right:8px;background:none;border:none;color:var(--gray-400);font-size:14px;cursor:pointer;line-height:1" (click)="removeExtraContact(i)">✕</button>
            <div class="edit-row">
              <label>Imię i nazwisko<input [(ngModel)]="ec.contact_name" placeholder="Jan Kowalski"></label>
              <label>Rola w firmie<select [(ngModel)]="ec.contact_title"><option value="">— brak —</option><option *ngFor="let t of dictTitles" [value]="t">{{t}}</option></select></label>
            </div>
            <div class="edit-row">
              <label>Email<input [(ngModel)]="ec.email" type="email" placeholder="jan@firma.pl"></label>
              <label>Telefon<input [(ngModel)]="ec.phone" placeholder="+48 600 000 000"></label>
            </div>
          </div>
        }
        @if (extraContacts.length === 0) {
          <div style="font-size:12px;color:var(--gray-400);text-align:center;padding:12px">Brak dodatkowych kontaktów</div>
        }
      </div>
      <div class="edit-section">
        <div class="edit-section-title">NIP</div>
        <div class="edit-row">
          <label class="full"><span style="display:flex;align-items:center;gap:4px;margin-bottom:4px">NIP <span style="color:#f97316">*</span></span>
            <input [(ngModel)]="editForm.nip" placeholder="PL1234567890" maxlength="14"
                   style="font-family:monospace"
                   (ngModelChange)="validateEditNip()"
                   [style.border-color]="editNipError ? '#ef4444' : ''">
            <span *ngIf="editNipError" style="font-size:11px;color:#ef4444;margin-top:2px;display:block">{{ editNipError }}</span>
          </label>
        </div>
      </div>
      <div class="edit-section">
        <div class="edit-section-title">Szczegóły sprzedażowe</div>
        <div class="edit-row">
          <label>Obrót roczny<div style="display:flex;gap:6px"><input [(ngModel)]="editForm.value_pln" type="number" min="0" placeholder="0" style="flex:1"><select [(ngModel)]="editForm.annual_turnover_currency" style="width:80px"><option value="PLN">PLN</option><option value="EUR">EUR</option><option value="USD">USD</option><option value="GBP">GBP</option><option value="CHF">CHF</option></select></div></label>
          <label>% Online<select [(ngModel)]="editForm.online_pct"><option value="">— brak —</option><option *ngFor="let v of [0,10,20,30,40,50,60,70,80,90,100]" [value]="v">{{v}}%</option></select></label>
        </div>
        <div class="edit-row">
          <label>Pierwszy kontakt<input [(ngModel)]="editForm.first_contact_date" type="date"></label>
          <label>Data zamknięcia<input [(ngModel)]="editForm.close_date" type="date"></label>
        </div>
        <div class="edit-row">
          <label>Źródło<select [(ngModel)]="editForm.source" (ngModelChange)="onSourceChange()"><option value="">— brak —</option>
                  @for (s of sourcesWithoutGroup(); track s.value) { <option [value]="s.value">{{s.label}}</option> }
                  @for (g of sourceGroups(); track g) { <optgroup [label]="g">@for (s of sourcesInGroup(g); track s.value) { <option [value]="s.value">{{s.label}}</option> }</optgroup> }
                  </select></label>
          <label>Branża<select [(ngModel)]="editForm.industry"><option value="">— brak —</option><option *ngFor="let ind of dictIndustries" [value]="ind">{{ind}}</option></select></label>
        </div>
        <ng-container *ngIf="editForm.source==='agent'">
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:10px;margin-top:4px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#f97316">🤝 Dane Agenta</div>
            <div class="edit-row">
              <label>Imię i nazwisko<input [(ngModel)]="editForm.agent_name" placeholder="Jan Kowalski"></label>
              <label>Telefon<input [(ngModel)]="editForm.agent_phone" placeholder="+48 600 000 000"></label>
            </div>
            <div class="edit-row"><label class="full">Email<input [(ngModel)]="editForm.agent_email" type="email" placeholder="agent@firma.pl"></label></div>
          </div>
        </ng-container>
        <div class="edit-row">
          <label>Handlowiec<select [(ngModel)]="editForm.assigned_to"><option value="">— nieprzypisany —</option><option *ngFor="let u of crmUsers" [value]="u.id">{{u.display_name}}</option></select></label>
          <label>% Szansa<select [(ngModel)]="editForm.probability"><option value="">— brak —</option><option *ngFor="let v of [0,10,20,30,40,50,60,70,80,90,100]" [value]="v">{{v}}%</option></select></label>
        </div>
        <div class="edit-row">
          <label class="full">Tagi (oddzielone przecinkiem)<input [(ngModel)]="editForm.tagsStr" placeholder="tag1, tag2"></label>
        </div>
      </div>
      <div class="edit-section">
        <div class="edit-section-title">Notatki</div>
        <textarea [(ngModel)]="editForm.notes" rows="3" class="edit-textarea" placeholder="Dowolne notatki…"></textarea>
      </div>
    </div>

      <!-- Błędy walidacji -->
      @if (editErrors.length > 0) {
        <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:10px 14px;margin:0 0 8px;font-size:12px;color:#991b1b">
          <strong>Uzupełnij wymagane pola dla etapu "{{ stageLabel(editForm.stage) }}":</strong>
          <div style="margin-top:4px">{{ editErrors.join(', ') }}</div>
        </div>
      }

    <div class="modal-footer">
      <button class="btn-outline" (click)="showEdit=false">Anuluj</button>
      <button class="btn-primary" (click)="saveLead()" [disabled]="saving||!editForm.company">{{saving?'Zapisywanie…':'Zapisz zmiany'}}</button>
    </div>
  </div>
</div>

<!-- Document Picker Modal -->
<div class="modal-overlay" *ngIf="showDocPicker" (click)="showDocPicker=false">
  <div class="modal modal-wide" (click)="$event.stopPropagation()" style="width:min(640px,100%)">
    <div class="modal-header"><h3>📎 Dodaj powiązany dokument</h3><button class="close-btn" (click)="showDocPicker=false">✕</button></div>
    <div class="modal-body" style="gap:10px">
      <div style="font-size:12px;color:#6b7280">Wyszukaj dokumenty po nazwie, numerze lub podmiocie.</div>
      <input class="act-input" style="font-size:13px;padding:8px 12px" [(ngModel)]="docSearch" (ngModelChange)="onDocSearch()" placeholder="Szukaj dokumentu…">
      <div *ngIf="docSearching" style="text-align:center;color:#9ca3af;font-size:12px;padding:12px">Wyszukuję…</div>
      <div *ngIf="!docSearching&&docResults.length===0&&docSearch.length>1" style="text-align:center;color:#9ca3af;font-size:12px;padding:12px">Brak wyników</div>
      <div style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
        <div *ngFor="let doc of docResults"
             style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;transition:background .1s"
             [style.cursor]="doc._access==='read' ? 'default' : 'pointer'"
             [style.opacity]="doc._access==='read' ? '0.55' : '1'"
             [title]="doc._access==='read' ? 'Tylko odczyt — brak uprawnień do powiązania' : ''"
             [style.background]="isLinked(doc.id)?'#f0fdf4':'white'"
             (click)="toggleLinkDoc(doc)">
          <span style="font-size:16px">📄</span>
          <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{doc.name}}</div><div style="font-size:10px;color:#9ca3af"><span *ngIf="doc.doc_number">#{{doc.doc_number}} · </span>{{doc.doc_type}}</div></div>
          <span *ngIf="doc._access==='read'" style="font-size:11px;color:#9ca3af">🔒 Odczyt</span>
          <span *ngIf="doc._access!=='read' && isLinked(doc.id)" style="font-size:11px;font-weight:700;color:#16a34a">✓ Dodano</span>
          <span *ngIf="doc._access!=='read' && !isLinked(doc.id)" style="font-size:11px;color:#9ca3af">Dodaj</span>
        </div>
      </div>
      <div *ngIf="linkDocError" style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px 12px;font-size:12px;color:#dc2626">
        ⚠ {{linkDocError}}
      </div>
    </div>
    <div class="modal-footer"><button class="btn-outline" (click)="showDocPicker=false">Zamknij</button></div>
  </div>
</div>

<!-- Test Account Modal -->
<div class="modal-overlay" *ngIf="showTestAccount" (click)="closeTestAccountModal()">
  <div class="modal modal-wide" (click)="$event.stopPropagation()" style="width:min(660px,100%)">
    <div class="modal-header">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h3>🖥️ Konto testowe</h3>
        <div style="font-size:11px;color:#9ca3af;font-weight:400">{{lead?.company}}<span *ngIf="lead?.nip"> · NIP: {{lead?.nip}}</span></div>
      </div>
      <button class="close-btn" (click)="closeTestAccountModal()">✕</button>
    </div>

    <div class="modal-body" style="gap:20px">

      <!-- Status: konto już założone -->
      <div *ngIf="testAccount?.status==='created'" class="ta-status-ok">
        <span style="font-size:22px">✅</span>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700;color:#15803d">Konto testowe założone</div>
          <div style="font-size:12px;color:#16a34a;font-family:monospace;margin-top:2px">
            Nr: {{testAccount!.test_account_number}}
            <span *ngIf="testAccount!.htcd_partner_id" style="color:#6b7280"> · ID HTCD: {{testAccount!.htcd_partner_id}}</span>
          </div>
          <div *ngIf="testAccount!.price_list_url" style="margin-top:4px">
            <a [href]="testAccount!.price_list_url" target="_blank"
               style="font-size:11px;color:#2563eb;text-decoration:underline">
              📋 Otwórz cennik w HTCD
            </a>
          </div>
          <div style="font-size:10px;color:#6b7280;margin-top:2px">Ten numer zostanie przekazany jako Nr. Partnera podczas migracji.</div>
        </div>
      </div>

      <!-- Status: błąd poprzedniego wywołania -->
      <div *ngIf="testAccount?.status==='error'" class="ta-status-err">
        <span style="font-size:22px">⚠️</span>
        <div>
          <div style="font-size:12px;font-weight:700;color:#dc2626">Poprzednie wywołanie zakończyło się błędem</div>
          <div style="font-size:12px;color:#ef4444;margin-top:2px">{{testAccount!.last_error}}</div>
          <div style="font-size:10px;color:#6b7280;margin-top:2px">Popraw dane poniżej i spróbuj ponownie.</div>
        </div>
      </div>

      <!-- Błąd bieżącego wywołania -->
      <div *ngIf="testAccountError" class="ta-status-err">
        <span style="font-size:20px">❌</span>
        <div style="font-size:12px;color:#dc2626;font-weight:600">{{testAccountError}}</div>
      </div>

      <!-- Sekcja A: Dane techniczne -->
      <div class="ta-section">
        <div class="ta-section-title">A — Dane techniczne konta</div>
        <div class="ta-row">
          <label>Subdomena *
            <input [(ngModel)]="taForm.subdomain" placeholder="np. firma-testowa" [style.border-color]="taSubmitAttempt&&!taForm.subdomain?'#ef4444':''">
          </label>
          <label>Język *
            <select [(ngModel)]="taForm.language" [style.border-color]="taSubmitAttempt&&!taForm.language?'#ef4444':''">
              <option value="">— wybierz —</option>
              <option value="PL">Polski</option>
              <option value="EN">Angielski</option>
              <option value="DE">Niemiecki</option>
              <option value="RU">Rosyjski</option>
              <option value="RO">Rumuński</option>
            </select>
          </label>
        </div>
        <div class="ta-row">
          <label>Waluta *
            <select [(ngModel)]="taForm.partner_currency" [style.border-color]="taSubmitAttempt&&!taForm.partner_currency?'#ef4444':''">
              <option value="">— wybierz —</option>
              <option value="PLN">PLN</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
              <option value="CHF">CHF</option>
            </select>
          </label>
          <label>Kraj *
            <select [(ngModel)]="taForm.country" [style.border-color]="taSubmitAttempt&&!taForm.country?'#ef4444':''">
              <option value="">— wybierz —</option>
              <option value="PL">Polska</option>
              <option value="DE">Niemcy</option>
              <option value="FR">Francja</option>
              <option value="GB">Wielka Brytania</option>
              <option value="CZ">Czechy</option>
              <option value="SK">Słowacja</option>
              <option value="HU">Węgry</option>
              <option value="RO">Rumunia</option>
              <option value="UA">Ukraina</option>
              <option value="RU">Rosja</option>
            </select>
          </label>
        </div>
      </div>

      <!-- Sekcja B: Adres rozliczeniowy -->
      <div class="ta-section">
        <div class="ta-section-title">B — Adres rozliczeniowy</div>
        <div class="ta-row">
          <label class="full">Ulica i numer *
            <input [(ngModel)]="taForm.billing_address" placeholder="np. ul. Przykładowa 1" [style.border-color]="taSubmitAttempt&&!taForm.billing_address?'#ef4444':''">
          </label>
        </div>
        <div class="ta-row">
          <label>Kod pocztowy *
            <input [(ngModel)]="taForm.billing_zip" placeholder="np. 00-001" [style.border-color]="taSubmitAttempt&&!taForm.billing_zip?'#ef4444':''">
          </label>
          <label>Miasto *
            <input [(ngModel)]="taForm.billing_city" placeholder="np. Warszawa" [style.border-color]="taSubmitAttempt&&!taForm.billing_city?'#ef4444':''">
          </label>
        </div>
        <div class="ta-row">
          <label>Kraj rozliczeniowy *
            <select [(ngModel)]="taForm.billing_country" [style.border-color]="taSubmitAttempt&&!taForm.billing_country?'#ef4444':''">
              <option value="">— wybierz —</option>
              <option value="PL">Polska</option>
              <option value="DE">Niemcy</option>
              <option value="FR">Francja</option>
              <option value="GB">Wielka Brytania</option>
              <option value="CZ">Czechy</option>
              <option value="SK">Słowacja</option>
              <option value="HU">Węgry</option>
              <option value="RO">Rumunia</option>
              <option value="UA">Ukraina</option>
              <option value="RU">Rosja</option>
            </select>
          </label>
          <label>Email rozliczeniowy *
            <input [(ngModel)]="taForm.billing_email_address" type="email" placeholder="faktury@firma.pl" [style.border-color]="taSubmitAttempt&&!taForm.billing_email_address?'#ef4444':''">
          </label>
        </div>
      </div>

      <!-- Sekcja C: Administrator konta -->
      <div class="ta-section">
        <div class="ta-section-title">C — Administrator konta</div>
        <div class="ta-row">
          <label>Imię *
            <input [(ngModel)]="taForm.admin_first_name" placeholder="Jan" [style.border-color]="taSubmitAttempt&&!taForm.admin_first_name?'#ef4444':''">
          </label>
          <label>Nazwisko *
            <input [(ngModel)]="taForm.admin_last_name" placeholder="Kowalski" [style.border-color]="taSubmitAttempt&&!taForm.admin_last_name?'#ef4444':''">
          </label>
        </div>
        <div class="ta-row">
          <label class="full">Email administratora *
            <input [(ngModel)]="taForm.admin_email" type="email" placeholder="admin@firma.pl" [style.border-color]="taSubmitAttempt&&!taForm.admin_email?'#ef4444':''">
          </label>
        </div>
      </div>

    </div>

    <div class="modal-footer">
      <button class="btn-outline" (click)="closeTestAccountModal()">Anuluj</button>
      <button class="btn-primary" (click)="submitTestAccount()" [disabled]="submittingTestAccount" style="background:#1d4ed8;border-color:#1d4ed8;min-width:180px">
        <span *ngIf="!submittingTestAccount">🖥️ {{testAccount?.status==='created'?'Ponów założenie':'Załóż konto testowe'}}</span>
        <span *ngIf="submittingTestAccount">⏳ Zakładanie konta…</span>
      </button>
    </div>
  </div>
</div>

<!-- Rozpocznij onboarding dialog -->
<div class="modal-overlay" *ngIf="showConvert" (click)="showConvert=false">
  <div class="modal" (click)="$event.stopPropagation()">
    <h3>🚀 Rozpocznij onboarding</h3>
    <p style="margin-bottom:16px">Migracja leada <strong>{{lead?.company}}</strong> do procesu wdrożenia. Lead pojawi się w sekcji Onboarding. W Rejestrze Partnerów pojawi się po synchronizacji z DWH.</p>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
      <label style="font-size:13px;color:#374151;display:flex;flex-direction:column;gap:4px">
        Wartość kontraktu (PLN)
        <input type="number" min="0" step="1000"
               [(ngModel)]="convertForm.contract_value"
               placeholder="np. 50000"
               style="border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px">
      </label>
      <label style="font-size:13px;color:#374151;display:flex;flex-direction:column;gap:4px">
        Data podpisania umowy
        <input type="date"
               [(ngModel)]="convertForm.contract_signed"
               style="border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px">
      </label>
    </div>
    <div class="modal-actions">
      <button class="btn-outline" (click)="showConvert=false">Anuluj</button>
      <button class="btn-primary" (click)="convertLead()" [disabled]="converting">{{converting?'…':'🚀 Rozpocznij onboarding'}}</button>
    </div>
  </div>
</div>

<!-- �?�? MODAL SZCZEGÓ�?ÓW AKTYWNOŚCI (Lead) �?�? -->
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
          <option value="task">✅ Zadanie</option>
          <option value="call">📞 Połączenie</option>
          <option value="meeting">🤝 Spotkanie</option>
          <option value="note">📝 Notatka</option>
          <option value="doc_sent">📄 Dokument</option>
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
  `,
  styles: [`
    :host { display:flex; flex-direction:column; flex:1; overflow:hidden; height:100%; }
    .hdr-btn { background:white; border:1px solid #e5e7eb; border-radius:8px; padding:5px 12px; font-size:12px; cursor:pointer; display:flex; align-items:center; gap:4px; position:relative; }
    .hdr-btn:hover { background:#f9fafb; }
    .hdr-btn:disabled { opacity:.45; cursor:not-allowed; pointer-events:auto; }
    .hdr-btn-edit { border-color:#d1d5db; }
    .hdr-btn-primary { background:#f97316; color:white; border-color:#f97316; }
    .hdr-btn-primary:hover { background:#ea6a0a; }
    .hdr-btn-test { background:#eff6ff; color:#1d4ed8; border-color:#bfdbfe; }
    .hdr-btn-test:hover { background:#dbeafe; }
    .ta-badge-ok { background:#16a34a; color:white; border-radius:10px; font-size:9px; font-weight:700; padding:0 5px; line-height:15px; display:inline-block; margin-left:2px; }
    .ta-badge-err { background:#ef4444; color:white; border-radius:10px; font-size:9px; font-weight:700; padding:0 5px; line-height:15px; display:inline-block; margin-left:2px; }
    .ta-section { display:flex; flex-direction:column; gap:10px; }
    .ta-section-title { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:#9ca3af; padding-bottom:4px; border-bottom:1px solid #f3f4f6; }
    .ta-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .ta-row label { display:flex; flex-direction:column; gap:4px; font-size:12px; font-weight:600; color:#374151; }
    .ta-row label.full { grid-column:1/-1; }
    .ta-row label input, .ta-row label select { border:1px solid #d1d5db; border-radius:6px; padding:7px 10px; font-size:13px; outline:none; font-family:inherit; background:white; }
    .ta-row label input:focus, .ta-row label select:focus { border-color:#1d4ed8; }
    .ta-status-ok  { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:10px 14px; display:flex; align-items:center; gap:10px; }
    .ta-status-err { background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:10px 14px; display:flex; align-items:center; gap:10px; }
    .email-badge { background:#ef4444; color:white; border-radius:10px; font-size:10px; font-weight:700; padding:0 5px; line-height:16px; display:inline-block; }
    .info-section { margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid #f3f4f6; }
    .info-section:last-child { border-bottom:none; }
    .info-section-title { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:#9ca3af; margin-bottom:8px; }
    .info-kv { display:flex; gap:8px; align-items:flex-start; margin-bottom:5px; font-size:12.5px; }
    .lbl { color:#9ca3af; font-size:11px; white-space:nowrap; min-width:72px; padding-top:1px; }
    .val { color:#374151; flex:1; }
    .val.fw { font-weight:600; color:#18181b; }
    .link { color:#f97316; text-decoration:none; }
    .link:hover { text-decoration:underline; }
    .tab-btn { background:none; border:none; border-bottom:2px solid transparent; padding:12px 16px; font-size:12.5px; font-weight:600; color:#9ca3af; cursor:pointer; white-space:nowrap; }
    .tab-btn.active { color:#f97316; border-bottom-color:#f97316; }
    .tab-btn:hover:not(.active) { color:#374151; }
    .stage-badge { padding:2px 9px; border-radius:10px; font-size:11px; font-weight:700; }
    .stage-new{background:#f3f4f6;color:#374151} .stage-qualification{background:#dbeafe;color:#1e40af}
    .stage-presentation{background:#fef3c7;color:#92400e} .stage-offer{background:#f3e8ff;color:#6b21a8}
    .stage-negotiation{background:#ffedd5;color:#9a3412} .stage-closed_won{background:#dcfce7;color:#166534}
    .stage-closed_lost{background:#fee2e2;color:#991b1b}
    .stage-btn { display:flex; align-items:center; gap:8px; padding:6px 10px; border:1px solid #e5e7eb; border-radius:7px; background:white; font-size:12px; cursor:pointer; transition:all .15s; text-align:left; width:100%; }
    .stage-btn:hover:not(:disabled) { background:#fff7ed; border-color:#f97316; }
    .stage-btn.active { background:#fff7ed; border-color:#f97316; color:#9a3412; font-weight:600; }
    .stage-btn:disabled { cursor:default; }
    .stage-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .stage-dot-new{background:#94a3b8} .stage-dot-qualification{background:#f59e0b} .stage-dot-presentation{background:#3b82f6}
    .stage-dot-offer{background:#a855f7} .stage-dot-negotiation{background:#f97316} .stage-dot-closed_won{background:#22c55e} .stage-dot-closed_lost{background:#ef4444}
    .comm-btn { display:flex; align-items:center; gap:10px; padding:8px 12px; border:1px solid #bbf7d0; border-radius:8px; background:white; cursor:pointer; width:100%; transition:background .15s; }
    .comm-btn:hover:not(:disabled) { background:#f0fdf4; }
    .comm-btn:disabled { opacity:.5; cursor:not-allowed; }
    .act-item { display:flex; gap:10px; padding:10px 0; border-bottom:1px solid #f4f4f5; transition:background .1s; border-radius:6px; }
    .act-item:last-child { border-bottom:none; }
    .act-item:hover { background:#fffbf7; }
    .act-item.act-closed { opacity:.6; }
    .act-item.act-overdue { border-left:3px solid #ef4444; padding-left:7px; }
    .act-item.act-today { border-left:3px solid #f97316; padding-left:7px; }
    .act-status-badge { font-size:10px; font-weight:700; padding:1px 7px; border-radius:9px; white-space:nowrap; }
    .act-status-new { background:#f3f4f6; color:#374151; }
    .act-status-open { background:#dbeafe; color:#1e40af; }
    .act-status-closed { background:#dcfce7; color:#166534; }
    .act-type-icon { font-size:18px; flex-shrink:0; }
    .act-body { flex:1; }
    .act-body strong { font-size:12.5px; }
    .act-meta { font-size:10px; color:#9ca3af; margin-top:1px; }
    .act-text { font-size:11.5px; color:#6b7280; margin-top:2px; white-space:pre-line; }
    .act-edit-form { display:flex; flex-direction:column; gap:6px; }
    .act-controls { display:flex; gap:4px; align-self:flex-start; opacity:0; transition:opacity .15s; }
    .act-item:hover .act-controls { opacity:1; }
    .act-ctrl-btn { background:none; border:none; cursor:pointer; font-size:12px; padding:2px 4px; border-radius:4px; color:#9ca3af; }
    .act-ctrl-btn:hover { background:#f3f4f6; color:#374151; }
    .act-ctrl-btn.del:hover { color:#ef4444; }
    .act-sel { border:1px solid #d1d5db; border-radius:6px; padding:5px 8px; font-size:12px; }
    .act-input { border:1px solid #d1d5db; border-radius:6px; padding:6px 10px; font-size:12px; font-family:inherit; resize:vertical; outline:none; }
    .act-input:focus { border-color:#f97316; }
    .btn-sm { font-size:12px; border:1px solid #e5e7eb; background:white; border-radius:6px; padding:4px 12px; cursor:pointer; }
    .btn-sm.primary { background:#f97316; color:white; border-color:#f97316; }
    .btn-sm:disabled { opacity:.6; cursor:not-allowed; }
    .empty-act { color:#9ca3af; font-size:12px; text-align:center; padding:20px 0; }
    .participant-input-wrap { position:relative; }
    .participant-chips { display:flex;flex-wrap:wrap;gap:4px;align-items:center;border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;min-height:32px;background:white;position:relative; }
    .suggest-dropdown { position:absolute; background:white; border:1px solid #e5e7eb; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,.1); z-index:100; min-width:240px; max-height:180px; overflow-y:auto; }
    .suggest-item { padding:7px 12px; font-size:12px; cursor:pointer; display:flex; align-items:center; gap:4px; }
    .suggest-item:hover { background:#f3f4f6; }
    .participant-chip { display:inline-flex;align-items:center;gap:4px;background:#eff6ff;color:#1d4ed8;border-radius:12px;padding:1px 8px;font-size:11px; }
    .participant-chip button { background:none;border:none;cursor:pointer;color:#9ca3af;font-size:11px;padding:0;line-height:1; }
    .participant-input { border:none;outline:none;font-size:12px;min-width:100px;flex:1;font-family:inherit; }
    .suggestions-dropdown { position:absolute;top:100%;left:0;right:0;z-index:100;background:white;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);max-height:160px;overflow-y:auto;margin-top:2px; }
    .suggestion-item { padding:7px 12px;font-size:12px;cursor:pointer; }
    .suggestion-item:hover { background:#f9fafb; }
    .hist-item { display:flex; gap:10px; padding:10px 0; border-bottom:1px solid #f4f4f5; align-items:flex-start; }
    .hist-item:last-child { border-bottom:none; }
    .hist-dot { width:8px; height:8px; border-radius:50%; margin-top:4px; flex-shrink:0; }
    .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:200; padding:16px; }
    .modal { background:white; border-radius:14px; padding:24px; width:380px; display:flex; flex-direction:column; gap:12px; }
    .modal h3 { margin:0; font-size:16px; font-weight:700; }
    .modal p { margin:0; font-size:13px; color:#6b7280; }
    .modal label { display:flex; flex-direction:column; gap:4px; font-size:12px; font-weight:600; }
    .modal input { border:1px solid #d1d5db; border-radius:6px; padding:7px 10px; font-size:13px; outline:none; }
    .modal-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:4px; }
    .modal-wide { width:min(700px,100%); max-height:86vh; overflow-y:auto; padding:0; gap:0; }
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
    .btn-primary { background:#f97316; color:white; border:none; border-radius:8px; padding:7px 14px; font-size:13px; font-weight:600; cursor:pointer; }
    .btn-primary:disabled { opacity:.6; }
    .btn-outline { background:white; color:#374151; border:1px solid #d1d5db; border-radius:8px; padding:7px 14px; font-size:13px; cursor:pointer; }
    .check-label { flex-direction:row !important; align-items:center; gap:8px !important; font-size:13px !important; font-weight:400 !important; cursor:pointer; }
    .check-label input { width:auto; }
    .att-chip { position:relative; display:inline-flex; align-items:center; gap:4px; border-radius:5px; padding:2px 7px; font-size:10px; cursor:default; user-select:none; }
    .att-chip::after { content:''; position:absolute; top:100%; left:0; right:0; height:6px; }
    .att-chip-actions { display:none; position:absolute; top:calc(100% + 2px); left:0; background:white; border:1px solid #e5e7eb; border-radius:7px; box-shadow:0 3px 10px rgba(0,0,0,.13); padding:3px; gap:2px; z-index:30; white-space:nowrap; align-items:center; min-width:max-content; }
    .att-chip:hover .att-chip-actions { display:flex; }
    .att-chip-actions:hover { display:flex; }
    .att-action-btn { background:none; border:none; cursor:pointer; padding:3px 10px; border-radius:5px; font-size:11px; white-space:nowrap; }
    .att-action-btn:hover { background:#f3f4f6; }
    .att-action-btn.dl { color:#1d4ed8; }
    .att-action-btn.view { color:#374151; }
    .stage-arrow-btn { background:white;border:1px solid #e5e7eb;border-radius:6px;padding:5px 12px;font-size:18px;cursor:pointer;color:#374151;flex-shrink:0;line-height:1;transition:background .15s; }
    .stage-arrow-btn:hover:not(:disabled) { background:#f9fafb; }
    .stage-arrow-btn:disabled { opacity:.35;cursor:default; }
    .stepper-dot { width:14px;height:14px;border-radius:50%;background:#d1d5db;border:2px solid #d1d5db;transition:background .2s,border-color .2s,transform .2s;flex-shrink:0; }
    .stepper-label { font-size:9px;font-weight:500;color:#9ca3af;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:64px;transition:color .2s; }
  `],
})
export class CrmLeadDetailComponent implements OnInit, OnDestroy {
  private gmailBc: BroadcastChannel | null = null;
  private emailPollInterval: any = null;
  debugProcessing = false;

  private onGmailOauthResult(status: string): void {
    if (status !== 'connected') return;
    this.api.getGmailStatus().subscribe({
      next: s => this.zone.run(() => {
        this.gmailConnected  = s.connected;
        this.gmailEmail      = s.email || '';
        this.gmailAuthUrl    = '';
        if (s.connected) this.driveNeedsReauth = false;
        this.cdr.markForCheck();
      }),
      error: () => {},
    });
  }

  // storage event — główny mechanizm (działa dla nowych kart i popupów przez redirecty)
  private gmailStorageHandler = (e: StorageEvent) => {
    if (e.key === 'gmail_oauth_connected' && e.newValue) {
      localStorage.removeItem('gmail_oauth_connected');
      this.onGmailOauthResult('connected');
    }
  };

  private gmailMessageHandler = (e: MessageEvent) => {
    if (e.origin !== window.location.origin) return;
    if (e.data?.type === 'gmail-oauth-result') {
      this.onGmailOauthResult(e.data.status);
    }
  };
  @Input() id!: string;
  private route    = inject(ActivatedRoute);
  private zone     = inject(NgZone);
  private api      = inject(CrmApiService);
  private auth     = inject(AuthService);
  private router   = inject(Router);
  private cdr      = inject(ChangeDetectorRef);
  private settings = inject(AppSettingsService);
  logoSasUrl       = '';

  // Słowniki z app_settings
  get dictStages():    { value: string; label: string }[] { return this._dictList('crm_lead_stages',    LEAD_STAGE_LABELS as any); }
  get dictIndustries(): string[] { return this._dictArr('crm_industries', ['IT','Finance','Transport','Tourism','Healthcare','Retail','Manufacturing','Legal','Education','Other']); }
  get dictTitles():    string[] { return this._dictArr('crm_contact_titles', ['CEO','CFO','CTO','COO','VP','Director','Manager','Specialist','Owner','Other']); }
  get dictPartnerLanguages(): string[] { return this._dictArr('crm_partner_languages', ['Polski','Angielski','Rosyjski','Rumuński','Niemiecki']); }
  get dictPartnerCountries(): string[] { return this._dictArr('crm_partner_countries', ['Polska','Niemcy','Francja','Wielka Brytania','Czechy','Słowacja','Węgry','Rumunia','Ukraina','Rosja']); }

  private _dictArr(key: string, fallback: string[]): string[] {
    try {
      const v = this.settings.get(key);
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') return JSON.parse(v);
    } catch(_) {}
    return fallback;
  }

  private _dictList(key: string, labelMap: Record<string, string>): { value: string; label: string }[] {
    return this._dictArr(key, Object.keys(labelMap)).map(v => ({ value: v, label: labelMap[v] || v }));
  }

  lead: Lead | null = null;
  loading      = false;
  loadError    = false;
  saving       = false;
  savingActivity = false;
  showNewActivity = false;
  showEdit     = false;
  showConvert  = false;
  converting   = false;

  editForm: any  = {};
  editNipError = '';

  // ── Dodatkowe kontakty ────────────────────────────────────────────────────
  extraContacts: LeadContact[] = [];

  addExtraContact(): void {
    this.extraContacts.push({ contact_name: null, contact_title: null, email: null, phone: null });
  }

  removeExtraContact(i: number): void {
    this.extraContacts.splice(i, 1);
  }

  private isContactEmpty(c: LeadContact): boolean {
    return !c.contact_name && !c.email && !c.phone;
  }

  // ── Wymagalność wg etapu ─────────────────────────────────────────────────
  private FULL_REQUIRED_STAGES = ['qualification','presentation','offer','negotiation','closed_won'];

  get requiresFullFields(): boolean {
    return this.FULL_REQUIRED_STAGES.includes(this.editForm?.stage);
  }

  get editErrors(): string[] {
    const f = this.editForm;
    const errs: string[] = [];
    if (f.stage === 'closed_lost' && !f.lost_reason) errs.push('Powód przegranej');
    if (!this.requiresFullFields) return errs;
    if (!f.website)            errs.push('Strona WWW');
    if (!f.contact_name)       errs.push('Imię i Nazwisko');
    if (!f.contact_title)      errs.push('Rola w firmie');
    if (!f.email)              errs.push('Email');
    if (!f.phone)              errs.push('Telefon');
    if (!f.value_pln && f.value_pln !== 0) errs.push('Obrót roczny');
    if (f.online_pct === '' || f.online_pct == null) errs.push('% Online');
    if (!f.first_contact_date) errs.push('Pierwszy kontakt');
    if (!f.close_date)         errs.push('Data zamknięcia');
    if (!f.source)             errs.push('Źródło');
    if (!f.industry)           errs.push('Branża');
    if (!f.assigned_to)        errs.push('Handlowiec');
    if (f.probability === '' || f.probability == null) errs.push('% Szansa');
    return errs;
  }

  validateEditNip(): void {
    const val = (this.editForm.nip || '').trim().toUpperCase();
    if (!val) { this.editNipError = 'NIP jest wymagany'; return; }
    const cc = val.slice(0, 2);
    const digits = val.slice(2);
    if (!/^[A-Z]{2}$/.test(cc)) { this.editNipError = 'Podaj kod kraju (2 litery), np. PL'; return; }
    if (cc === 'PL' && !/^\d{10}$/.test(digits)) { this.editNipError = 'Dla PL wymagane 10 cyfr po kodzie kraju'; return; }
    if (cc !== 'PL' && digits.length === 0) { this.editNipError = 'Podaj numer po kodzie kraju'; return; }
    this.editNipError = '';
  }
  detailEnriching   = false;
  detailEnrichDone  = false;
  actForm: any   = { type: 'note', title: '', body: '', activity_at: '', assigned_to: '', duration_min: null, meeting_location: '', participantList: [] as string[] };
  actEditForm: any = { type: 'note', title: '', body: '', activity_at: '', assigned_to: '', duration_min: null, meeting_location: '', participants: '' };
  editingActId: number | null = null;
  // Modal aktywności
  selectedAct: any = null;
  actModalEditMode = false;
  actModalClosing = false;
  actModalCloseComment = '';
  allSuggestions: { email: string; name: string }[] = [];
  filteredSuggestions: { email: string; name: string }[] = [];
  participantQuery = '';
  convertForm    = { contract_value: null as number | null, contract_signed: '' };

  crmUsers: CrmUser[] = [];
  private readonly STAGE_SEQ = ['new', 'qualification', 'presentation', 'offer', 'negotiation', 'closed_won'];

  private allowedNextStages(current: string): string[] {
    if (current === 'closed_lost') return ['new'];
    if (current === 'closed_won')  return ['negotiation'];
    const idx = this.STAGE_SEQ.indexOf(current);
    if (idx === -1) return [];
    const result: string[] = [];
    if (idx > 0) result.push(this.STAGE_SEQ[idx - 1]);
    if (idx < this.STAGE_SEQ.length - 1) result.push(this.STAGE_SEQ[idx + 1]);
    result.push('closed_lost');
    return result;
  }

  isStageAllowed(targetStage: string): boolean {
    const current = this.lead?.stage;
    if (!current || current === targetStage) return false;
    return this.allowedNextStages(current).includes(targetStage);
  }

  // Wszystkie etapy — do wizualnego paska postępu
  get stageOptions() { return this.dictStages.map(s => ({ key: s.value as LeadStage, label: s.label })); }

  // Etapy w kolejności głównego lejka (bez closed_lost)
  get orderedStageOptions() {
    return this.STAGE_SEQ
      .map(k => this.stageOptions.find(s => s.key === k))
      .filter(Boolean) as { key: LeadStage; label: string }[];
  }

  prevStage(): LeadStage | null {
    const cur = this.lead?.stage;
    if (!cur) return null;
    if (cur === 'closed_lost') return 'new';
    if (cur === 'closed_won')  return 'negotiation' as LeadStage;
    const idx = this.STAGE_SEQ.indexOf(cur);
    return idx > 0 ? this.STAGE_SEQ[idx - 1] as LeadStage : null;
  }

  nextStage(): LeadStage | null {
    const cur = this.lead?.stage;
    if (!cur || cur === 'closed_lost' || cur === 'closed_won') return null;
    const idx = this.STAGE_SEQ.indexOf(cur);
    return (idx >= 0 && idx < this.STAGE_SEQ.length - 1) ? this.STAGE_SEQ[idx + 1] as LeadStage : null;
  }

  isStageCompleted(key: string): boolean {
    const cur = this.lead?.stage;
    if (!cur) return false;
    const curIdx = this.STAGE_SEQ.indexOf(cur);
    return this.STAGE_SEQ.indexOf(key) < curIdx;
  }

  stepperDotStyle(key: string): Record<string, string> {
    const cur = this.lead?.stage;
    if (key === cur) {
      const color = key === 'closed_won' ? '#22c55e' : '#f26522';
      return { background: color, borderColor: color, transform: 'scale(1.3)' };
    }
    if (this.isStageCompleted(key)) return { background: '#22c55e', borderColor: '#22c55e' };
    return {};
  }

  stepperLabelStyle(key: string): Record<string, string> {
    const cur = this.lead?.stage;
    if (key === cur) return { color: key === 'closed_won' ? '#15803d' : '#f26522', fontWeight: '700' };
    if (this.isStageCompleted(key)) return { color: '#15803d' };
    return {};
  }

  // Tylko dozwolone przejścia — do dropdownu w formularzu edycji
  get allowedStageOptions() {
    const current = this.lead?.stage;
    if (!current) return this.stageOptions;
    const allowed = new Set([current, ...this.allowedNextStages(current)]);
    return this.dictStages
      .filter(s => allowed.has(s.value))
      .map(s => ({ key: s.value as LeadStage, label: s.label }));
  }
  leadSources: LeadSource[] = LEAD_SOURCES;

  sourcesWithoutGroup(): LeadSource[] { return this.leadSources.filter(s => !s.group); }
  sourceGroups(): string[] { return [...new Set(this.leadSources.filter(s => s.group).map(s => s.group!))]; }
  sourcesInGroup(g: string): LeadSource[] { return this.leadSources.filter(s => s.group === g); }

  get lostReasons(): string[] {
    try { return JSON.parse(String(this.settings.settings()['crm_lost_reasons'] || '[]')); }
    catch { return []; }
  }

  // Powiązane dokumenty
  linkedDocs: LinkedDocument[]  = [];
  showDocPicker = false;
  linkDocError  = '';
  docSearch     = '';
  docResults: any[] = [];
  docSearching  = false;
  private docSearchTimer: any;

  // Historia
  midTab: 'activities' | 'emails' | 'history' = 'activities';
  history: LeadHistoryEntry[] = [];
  historyLoading = false;
  private historyLoaded = false;

  // Mock komunikacja
  mockCallActive  = false;

  // ── Gmail ────────────────────────────────────────────────────────────────────
  gmailConnected  = false;
  gmailEmail      = '';
  gmailAuthUrl    = '';
  showEmailModal  = false;
  sendingEmail    = false;
  emailError      = '';
  emailForm: any  = { recipientList: [] as string[], ccList: [] as string[], subject: '', body: '', threadId: '', inReplyTo: '', references: '', quotedHtml: '' };
  recipientQuery  = '';
  ccQuery         = '';
  emailAttachments: File[] = [];
  downloadingAttachment: string = '';  // attachmentId aktualnie pobieranego załącznika
  drivePickerLoading  = false;
  driveNeedsReauth    = false;

  // Email recipient autocomplete
  recipientSuggestions: { email: string; name: string }[] = [];
  ccSuggestions:        { email: string; name: string }[] = [];
  showRecipientSug      = false;
  showCcSug             = false;

  // Message detail modal
  showMsgModal    = false;
  msgModalMsg: any = null;
  msgModalReply   = false;
  msgModalForm: any = { subject: '', body: '', recipientList: [] as string[], ccList: [] as string[], threadId: '', inReplyTo: '', references: '', quotedHtml: '' };
  msgModalRecipientQuery = '';
  msgModalCcQuery        = '';
  msgModalSending        = false;
  msgModalError          = '';
  msgModalAttachments: File[] = [];

  // Thread viewer
  showThreadModal = false;
  loadingThread   = false;
  threadMessages: any[] = [];
  openThreadId    = '';
  private currentThreadActivity: any = null;
  selectedEmailActivity: any = null;
  panelThreadMessages: any[] = [];
  panelLoadingThread = false;

  // ── Konto testowe ─────────────────────────────────────────────────────────
  showTestAccount       = false;
  testAccount: any      = null;       // dane z GET /api/crm/leads/:id/test-account
  submittingTestAccount = false;
  testAccountError      = '';
  taSubmitAttempt       = false;
  taForm: any = {
    subdomain: '', language: '', partner_currency: '', country: '',
    billing_address: '', billing_zip: '', billing_city: '', billing_country: '', billing_email_address: '',
    admin_first_name: '', admin_last_name: '', admin_email: '',
  };

  get emailActivities(): any[] {
    const all = (this.lead?.activities || [])
      .filter((a: any) => a.type === 'email')
      .sort((a: any, b: any) => (b.id || 0) - (a.id || 0));
    const byThread = new Map<string, any>();
    const noThread: any[] = [];
    for (const a of all) {
      if (!a.gmail_thread_id) { noThread.push(a); continue; }
      if (!byThread.has(a.gmail_thread_id)) {
        byThread.set(a.gmail_thread_id, { ...a });
      } else {
        // Jeśli którakolwiek aktywność w wątku jest nieprzeczytana — wątek jest nieprzeczytany
        if (!a.is_read) byThread.get(a.gmail_thread_id).is_read = false;
      }
    }
    return [...byThread.values(), ...noThread];
  }

  get emailActivityCount(): number {
    return this.newEmailCount;
  }


  get attachmentsFolderUrl(): string { return this.settings.get('lead_attachments_folder_url') as string || ''; }

  get isManager() {
    const u = this.auth.user();
    return u?.is_admin || u?.crm_role === 'sales_manager';
  }

  get canEdit(): boolean {
    if (!this.lead) return false;
    if (this.lead.stage === 'onboarded' || this.lead.stage === 'onboarding') return false;
    return this.lead.can_edit !== false;
  }

  ngOnInit() {
    const rawId = this.id || this.route.snapshot.paramMap.get('id') || '';
    const numId = parseInt(rawId, 10);
    if (!numId || isNaN(numId)) { this.loadError = true; return; }
    this.loadLead(numId);
    this.loadLinkedDocs(numId);
    this.loadTestAccount(numId);
    this.api.getContactSuggestions(numId).subscribe({
      next: s => { this.allSuggestions = s; },
      error: () => {},
    });
    this.api.getLeadSources().subscribe({
      next: sources => { this.zone.run(() => { this.leadSources = sources; this.cdr.markForCheck(); }); },
      error: () => {},
    });
    // Sprawdź status połączenia Gmail
    this.api.getGmailStatus().subscribe({
      next: s => this.zone.run(() => {
        this.gmailConnected = s.connected;
        this.gmailEmail     = s.email || '';
        this.cdr.markForCheck();
      }),
      error: () => {},
    });
    // BroadcastChannel — główny mechanizm (omija nullowanie window.opener przez Google COOP)
    try {
      this.gmailBc = new BroadcastChannel('gmail-oauth');
      this.gmailBc.onmessage = (e) => {
        if (e.data?.type === 'gmail-oauth-result') {
          this.onGmailOauthResult(e.data.status);
        }
      };
    } catch (_) {}
    // storage event — główny mechanizm (nowa karta / popup przez redirecty)
    window.addEventListener('storage', this.gmailStorageHandler);
    // Fallback: BroadcastChannel
    window.addEventListener('message', this.gmailMessageHandler);
  }

  ngOnDestroy(): void {
    window.removeEventListener('storage', this.gmailStorageHandler);
    this.gmailBc?.close();
    this.gmailBc = null;
    window.removeEventListener('message', this.gmailMessageHandler);
    if (this.emailPollInterval) { clearInterval(this.emailPollInterval); this.emailPollInterval = null; }
  }

  loadLead(numId?: number) {
    const id = numId ?? parseInt(this.id, 10);
    if (!id || isNaN(id)) return;
    this.loading = true;
    this.loadError = false;
    this.lead = null;
    if (this.emailPollInterval) { clearInterval(this.emailPollInterval); this.emailPollInterval = null; }
    this.api.getLead(id).pipe(
      finalize(() => { this.zone.run(() => { this.loading = false; this.cdr.markForCheck(); }); })
    ).subscribe({
      next: l  => {
        this.zone.run(() => {
          this.lead = l;
          this.historyLoaded = false;
          this.loadLogoSas();
          this.cdr.markForCheck();
          // Poll for new incoming emails every 30 s
          this.emailPollInterval = setInterval(() => this.refreshEmailActivities(), 30_000);
        });
      },
      error: () => { this.zone.run(() => { this.loadError = true; this.cdr.markForCheck(); }); },
    });
  }

  refreshEmailActivities(): void {
    if (!this.lead) return;
    this.api.getLead(this.lead.id).subscribe({
      next: (fresh: any) => this.zone.run(() => {
        if (!this.lead) return;
        this.lead = { ...this.lead, activities: fresh.activities || [] };
        this.cdr.markForCheck();
      }),
      error: () => {},
    });
  }

  debugProcessGmail(): void {
    this.debugProcessing = true;
    this.cdr.markForCheck();
    this.api.debugProcessGmail().subscribe({
      next: (result: any) => this.zone.run(() => {
        this.debugProcessing = false;
        console.log('[Debug] processGmail result:', result);
        alert(
          `historyId: ${result.historyId_before} → ${result.historyId_after}\n` +
          `Nowe wiadomości: ${(result.messageIds_found || []).length}\n` +
          `crm_email_message_reads (ostatnie 10): ${result.recent_message_reads?.length || 0} rekordów\n\n` +
          `Sprawdź konsolę po szczegóły.`
        );
        this.refreshEmailActivities();
        this.cdr.markForCheck();
      }),
      error: (e: any) => this.zone.run(() => {
        this.debugProcessing = false;
        alert('Błąd: ' + (e.error?.error || e.message));
        this.cdr.markForCheck();
      }),
    });
  }

  // ── Gmail ────────────────────────────────────────────────────────────────────
  connectGmail(): void {
    if (!this.gmailAuthUrl) return;
    console.log('[Gmail] connectGmail() — otwieranie popup, url:', this.gmailAuthUrl.slice(0, 60) + '...');
    const popup = window.open(this.gmailAuthUrl, 'gmail-oauth', 'width=600,height=700,left=300,top=100');
    console.log('[Gmail] popup ref:', popup, '| null?', popup === null);
    if (!popup) {
      console.warn('[Gmail] Popup zablokowany przez przeglądarkę!');
      return;
    }
    // Polling: gdy popup zostanie zamknięty — odśwież status Gmail
    const timer = setInterval(() => {
      try {
        console.log('[Gmail] polling — popup.closed =', popup.closed);
        if (popup.closed) {
          clearInterval(timer);
          console.log('[Gmail] popup zamknięty → getGmailStatus()');
          this.api.getGmailStatus().subscribe({
            next: s => {
              console.log('[Gmail] getGmailStatus() odpowiedź:', s);
              this.zone.run(() => {
                this.gmailConnected  = s.connected;
                this.gmailEmail      = s.email || '';
                if (s.connected) { this.gmailAuthUrl = ''; this.driveNeedsReauth = false; }
                this.cdr.markForCheck();
              });
            },
            error: (err) => { console.error('[Gmail] getGmailStatus() błąd:', err); },
          });
        }
      } catch (e) {
        console.error('[Gmail] polling error (cross-origin?):', e);
        clearInterval(timer);
      }
    }, 500);
  }

  openEmailModal(prefillThreadId?: string): void {
    if (!this.gmailConnected) {
      // Gmail niepołączony — pobierz URL autoryzacji i pokaż prompt
      this.api.getGmailAuthUrl().subscribe({
        next: r => this.zone.run(() => { this.gmailAuthUrl = r.url; this.showEmailModal = true; this.cdr.markForCheck(); }),
        error: () => this.zone.run(() => { this.gmailAuthUrl = ''; this.showEmailModal = true; this.cdr.markForCheck(); }),
      });
      this.emailForm = { recipientList: [], ccList: [], subject: '', body: '', threadId: prefillThreadId || '', inReplyTo: '', references: '', quotedHtml: '' };
      return;
    }
    this.emailForm = {
      recipientList: this.lead?.email ? [this.lead.email] : [],
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
    this.showEmailModal   = true;
    this.cdr.markForCheck();
  }

  downloadAttachment(att: { filename: string; mimeType: string; attachmentId: string }, messageId: string): void {
    if (this.downloadingAttachment === att.attachmentId) return;
    this.downloadingAttachment = att.attachmentId;
    this.api.downloadGmailAttachment(messageId, att.attachmentId, att.filename, att.mimeType || 'application/octet-stream').subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = att.filename;
        a.click();
        URL.revokeObjectURL(url);
        this.zone.run(() => { this.downloadingAttachment = ''; this.cdr.markForCheck(); });
      },
      error: () => this.zone.run(() => { this.downloadingAttachment = ''; this.cdr.markForCheck(); }),
    });
  }

  addRecipient(): void {
    const val = this.recipientQuery.trim();
    if (!val || !val.includes('@')) return;
    if (!this.emailForm.recipientList.includes(val)) {
      this.emailForm.recipientList.push(val);
    }
    this.recipientQuery = '';
    this.showRecipientSug = false;
    this.cdr.markForCheck();
  }

  onRecipientInput(): void {
    const q = this.recipientQuery.toLowerCase();
    if (q.length < 2) { this.showRecipientSug = false; return; }
    this.recipientSuggestions = this.allSuggestions.filter(
      s => (s.email.toLowerCase().includes(q) || (s.name||'').toLowerCase().includes(q))
        && !this.emailForm.recipientList.includes(s.email)
    ).slice(0, 6);
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
    if (!val || !val.includes('@')) return;
    if (!this.emailForm.ccList.includes(val)) {
      this.emailForm.ccList.push(val);
    }
    this.ccQuery  = '';
    this.showCcSug = false;
    this.cdr.markForCheck();
  }

  onCcInput(): void {
    const q = this.ccQuery.toLowerCase();
    if (q.length < 2) { this.showCcSug = false; return; }
    this.ccSuggestions = this.allSuggestions.filter(
      s => (s.email.toLowerCase().includes(q) || (s.name||'').toLowerCase().includes(q))
        && !this.emailForm.ccList.includes(s.email)
    ).slice(0, 6);
    this.showCcSug = this.ccSuggestions.length > 0;
    this.cdr.markForCheck();
  }

  pickCcSug(s: { email: string; name: string }): void {
    if (!this.emailForm.ccList.includes(s.email)) {
      this.emailForm.ccList.push(s.email);
    }
    this.ccQuery  = '';
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
    if (files) {
      this.emailAttachments = [...this.emailAttachments, ...Array.from(files)];
    }
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

    // Pobierz config i token równolegle
    Promise.all([
      this.api.getDrivePickerConfig().toPromise(),
      this.api.getDriveToken().toPromise(),
    ]).then(([cfg, tok]) => {
      if (!cfg || !tok) { this.drivePickerLoading = false; this.cdr.markForCheck(); return; }

      // Backend wykrył brak scope drive.readonly — wymuś ponowne połączenie
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

          // Wyciągnij folder ID z URL (format: .../folders/FOLDER_ID)
          const folderMatch = folderUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
          const folderId    = folderMatch ? folderMatch[1] : null;

          let view: any;
          if (folderId) {
            view = new google.picker.DocsView()
              .setParent(folderId)
              .setIncludeFolders(true);
          } else {
            // "shared-with-me" lub inny URL — pokaż wszystkie pliki
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

      // Załaduj GAPI jeśli jeszcze nie jest załadowany
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
    this.addRecipient(); // dodaj email z pola input jeśli użytkownik nie wcisnął Enter
    this.addCc();        // dodaj CC z pola input jeśli użytkownik nie wcisnął Enter
    if (!this.lead || !this.emailForm.recipientList?.length || !this.emailForm.subject) return;
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

    this.api.sendLeadEmail(this.lead.id, fd).subscribe({
      next: (result: GmailSendResult) => {
        this.zone.run(() => {
          const wasReply     = !!this.emailForm.threadId;
          const replyThreadId = this.emailForm.threadId;
          if (!wasReply && this.lead) {
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
            this.lead = { ...this.lead, activities: [newAct, ...(this.lead.activities || [])] };
          } else if (replyThreadId && this.lead) {
            this.api.getLeadEmailThread(this.lead.id, replyThreadId).subscribe({
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
          this.midTab         = 'emails';
          // Odśwież extra_contacts (autoSaveLeadContacts mogło dodać nowe)
          if (this.lead) {
            this.api.getLead(this.lead.id).subscribe({
              next: (fresh: any) => this.zone.run(() => {
                if (this.lead) {
                  (this.lead as any).extra_contacts = fresh.extra_contacts || [];
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
    if (!this.lead) return;
    if (this.openThreadId === threadId) {
      this.openThreadId = '';
      this.threadMessages = [];
      this.cdr.markForCheck();
      return;
    }
    this.openThreadId = threadId;
    this.api.getLeadEmailThread(this.lead.id, threadId).subscribe({
      next: msgs => this.zone.run(() => {
        this.threadMessages = msgs;
        // Synchronizuj lokalny stan is_read z odpowiedzią serwera
        // (serwer oznacza wątek jako przeczytany po stronie DB)
        const act = (this.lead?.activities || []).find((a: any) => a.gmail_thread_id === threadId && a.type === 'email');
        if (act && !act.is_read) act.is_read = true;
        this.cdr.markForCheck();
      }),
      error: () => {},
    });
  }

  showThread(threadId: string): void {
    if (!this.lead) return;
    this.showThreadModal = true;
    this.loadingThread   = true;
    this.threadMessages  = [];
    this.cdr.markForCheck();
    this.api.getLeadEmailThread(this.lead.id, threadId).subscribe({
      next: msgs => this.zone.run(() => { this.threadMessages = msgs; this.loadingThread = false; this.cdr.markForCheck(); }),
      error: () => this.zone.run(() => { this.loadingThread = false; this.cdr.markForCheck(); }),
    });
  }

  replyToThread(a: any): void {
    if (this.openThreadId === a.gmail_thread_id && this.threadMessages.length > 0) {
      this._applyThreadReply(a.gmail_thread_id);
    } else {
      if (!this.lead) return;
      this.openThreadId = a.gmail_thread_id;
      this.api.getLeadEmailThread(this.lead.id, a.gmail_thread_id).subscribe({
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

  replyToCurrentThread(): void {
    this.showThreadModal = false;
    const m = this.threadMessages[this.threadMessages.length - 1];
    this.openEmailModal(m?.threadId || '');
    if (m) {
      this.emailForm.subject = m.subject?.startsWith('Re:') ? m.subject : `Re: ${m.subject || ''}`;
      const toAddrs    = this.parseAddressList(m.to);
      const fromAddrs  = this.parseAddressList(m.from);
      const isReceived = fromAddrs.length > 0 && fromAddrs[0] !== this.gmailEmail;
      this.emailForm.recipientList = isReceived ? fromAddrs : toAddrs;
      if (m.cc) this.emailForm.ccList = this.parseAddressList(m.cc);
      this.emailForm.inReplyTo  = m.messageIdHeader || '';
      this.emailForm.references = this.buildReferences(this.threadMessages);
      this.emailForm.body       = '';
      this.emailForm.quotedHtml = this.buildQuotedBody(this.threadMessages);
      this.focusEmailBodyTop();
    }
  }

  openMsgModal(m: any): void {
    this.msgModalMsg    = m;
    this.msgModalReply  = false;
    this.msgModalError  = '';
    this.msgModalSending = false;
    this.showMsgModal   = true;
    this.markMsgRead(m);
    this.cdr.markForCheck();
  }

  selectEmailForPanel(a: any): void {
    if (!this.lead) return;
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
    // Wątek ma nieprzeczytane — oznacz jako przeczytany
    if (!a.is_read) {
      a.is_read = true;
      this.api.patchLeadActivityRead(this.lead.id, a.id, true).subscribe({ error: () => {} });
    }
    if (a.gmail_thread_id) {
      this.api.getLeadEmailThread(this.lead.id, a.gmail_thread_id).subscribe({
        next: msgs => this.zone.run(() => {
          this.panelThreadMessages = msgs;
          this.panelLoadingThread  = false;
          // Auto-mark all unread incoming messages in the thread
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

  isMessageRead(m: any): boolean {
    return m.is_read !== false;
  }

  hasUnreadInActivity(a: any): boolean {
    return !a.is_read;
  }

  markMsgRead(m: any): void {
    if (!this.lead || m.is_read !== false || m.created_by !== null) return;
    m.is_read = true;
    this.cdr.markForCheck();
    this.api.patchEmailMessageRead(m.id, true).subscribe({ error: () => {} });
  }

  toggleMsgRead(m: any): void {
    if (!this.lead || m.created_by !== null) return;
    const newVal = !m.is_read;
    m.is_read = newVal;
    this.cdr.markForCheck();
    this.api.patchEmailMessageRead(m.id, newVal).subscribe({ error: () => {} });
    // Jeśli oznaczamy jako nieprzeczytana — aktualizuj też aktywność wątku (badge)
    if (!newVal && this.selectedEmailActivity) {
      this.selectedEmailActivity.is_read = false;
      this.api.patchLeadActivityRead(this.lead.id, this.selectedEmailActivity.id, false).subscribe({ error: () => {} });
    }
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
    this.focusEmailBodyTop('msg-reply-textarea');
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
    // flush raw inputs
    const rq = this.msgModalRecipientQuery.trim();
    if (rq && rq.includes('@') && !this.msgModalForm.recipientList.includes(rq)) {
      this.msgModalForm.recipientList.push(rq); this.msgModalRecipientQuery = '';
    }
    const cq = this.msgModalCcQuery.trim();
    if (cq && cq.includes('@') && !this.msgModalForm.ccList.includes(cq)) {
      this.msgModalForm.ccList.push(cq); this.msgModalCcQuery = '';
    }
    if (!this.lead || !this.msgModalForm.recipientList?.length || !this.msgModalForm.subject) return;
    this.msgModalSending = true;
    this.msgModalError   = '';
    const fd = new FormData();
    fd.append('to', this.msgModalForm.recipientList.join(','));
    if (this.msgModalForm.ccList?.length) fd.append('cc', this.msgModalForm.ccList.join(','));
    fd.append('subject', this.msgModalForm.subject);
    fd.append('body',    (this.msgModalForm.body || '') + (this.msgModalForm.quotedHtml || ''));
    if (this.msgModalForm.threadId)   fd.append('threadId',   this.msgModalForm.threadId);
    if (this.msgModalForm.inReplyTo)  fd.append('inReplyTo',  this.msgModalForm.inReplyTo);
    if (this.msgModalForm.references) fd.append('references', this.msgModalForm.references);
    this.msgModalAttachments.forEach(f => fd.append('attachments', f, f.name));
    this.api.sendLeadEmail(this.lead.id, fd).subscribe({
      next: (result: GmailSendResult) => {
        this.zone.run(() => {
          const replyThreadId = this.msgModalForm.threadId || this.msgModalMsg?.threadId;
          this.msgModalSending = false;
          this.msgModalReply   = false;
          this.closeMsgModal();
          if (replyThreadId && this.lead) {
            this.api.getLeadEmailThread(this.lead.id, replyThreadId).subscribe({
              next: msgs => this.zone.run(() => {
                this.threadMessages = msgs;
                this.openThreadId   = replyThreadId;
                this.cdr.markForCheck();
              }),
              error: () => {},
            });
          }
          // Odśwież extra_contacts (autoSaveLeadContacts mogło dodać nowe)
          if (this.lead) {
            this.api.getLead(this.lead.id).subscribe({
              next: (fresh: any) => this.zone.run(() => {
                if (this.lead) {
                  (this.lead as any).extra_contacts = fresh.extra_contacts || [];
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

  viewAttachment(att: any, msgId: string): void {
    const base = '/api/crm/gmail';
    let url = '';
    if (att.attachmentId) {
      url = `${base}/attachment/${msgId}/${att.attachmentId}?filename=${encodeURIComponent(att.filename)}&mime=${encodeURIComponent(att.mimeType||'')}`;
    } else if (att.blobPath !== undefined) {
      url = `${base}/sent-attachment/${msgId}?filename=${encodeURIComponent(att.filename)}&mime=${encodeURIComponent(att.mimeType||'')}`;
    }
    if (url) window.open(url, '_blank');
  }

  async downloadAtt(att: any, msgId: string): Promise<void> {
    const base = '/api/crm/gmail';
    let url = '';
    if (att.attachmentId) {
      url = `${base}/attachment/${msgId}/${att.attachmentId}?filename=${encodeURIComponent(att.filename)}&mime=${encodeURIComponent(att.mimeType||'')}`;
    } else if (att.blobPath !== undefined) {
      url = `${base}/sent-attachment/${msgId}?filename=${encodeURIComponent(att.filename)}&mime=${encodeURIComponent(att.mimeType||'')}`;
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

  markEmailsRead(): void {}

  private buildQuotedBody(messages: any[]): string {
    if (!messages?.length) return '';
    // Pusta linia na wpisanie treści przez użytkownika — kursor ustawiamy tu programatycznie
    const userArea = '';
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
    return userArea + divider + quoted;
  }

  private buildReferences(messages: any[]): string {
    return (messages || []).map((m: any) => m.messageIdHeader).filter(Boolean).join(' ');
  }

  stripHtml(html: string): string {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private focusEmailBodyTop(textareaId: string = 'email-body-textarea'): void {
    // Przesuń kursor na początek pola treści (przed cytowaną korespondencją)
    setTimeout(() => {
      const el = document.getElementById(textareaId) as HTMLTextAreaElement | null;
      if (el) { el.focus(); el.setSelectionRange(0, 0); el.scrollTop = 0; }
    }, 50);
  }

  get newEmailCount(): number {
    if (!this.lead) return 0;
    return (this.lead.activities || []).filter(
      (a: any) => a.type === 'email' && !a.is_read
    ).length;
  }

  pushMsgRecipient(): void {
    const v = this.msgModalRecipientQuery.trim();
    if (v && v.includes('@') && !this.msgModalForm.recipientList.includes(v)) {
      this.msgModalForm.recipientList.push(v);
    }
    this.msgModalRecipientQuery = '';
    this.cdr.markForCheck();
  }

  pushMsgCc(): void {
    const v = this.msgModalCcQuery.trim();
    if (v && v.includes('@') && !this.msgModalForm.ccList.includes(v)) {
      this.msgModalForm.ccList.push(v);
    }
    this.msgModalCcQuery = '';
    this.cdr.markForCheck();
  }

  // ── Reszta metod (bez zmian) ─────────────────────────────────────────────────

  openEdit() {
    if (!this.lead) return;
    this.editForm = {
      company:      this.lead.company,
      stage:        this.lead.stage,
      hot:          this.lead.hot,
      contact_name: this.lead.contact_name || '',
      contact_title:this.lead.contact_title || '',
      email:        this.lead.email || '',
      phone:        this.lead.phone || '',
      nip:          (this.lead as any).nip || '',
      value_pln:                this.lead.value_pln ?? null,
      annual_turnover_currency: this.lead.annual_turnover_currency || 'PLN',
      online_pct:           this.lead.online_pct != null ? String(this.lead.online_pct) : '',
      probability:  this.lead.probability ?? null,
      close_date:         this.isoToDateInput(this.lead.close_date),
      first_contact_date: this.isoToDateInput(this.lead.first_contact_date),
      source:       this.lead.source || '',
      industry:     this.lead.industry || '',
      assigned_to:  this.lead.assigned_to || '',
      tagsStr:      (this.lead.tags || []).join(', '),
      notes:        this.lead.notes || '',
      agent_name:   (this.lead as any).agent_name || '',
      agent_email:  (this.lead as any).agent_email || '',
      agent_phone:  (this.lead as any).agent_phone || '',
      website:      (this.lead as any).website || '',
      lost_reason:  this.lead.lost_reason || '',
    };
    this.editNipError = '';
    this.detailEnrichDone = false;
    // Zawsze inicjalizuj extraContacts z aktualnych danych leada przy otwarciu formularza
    this.extraContacts = ((this.lead as any).extra_contacts || []).map((ec: any) => ({
      id:            ec.id,
      contact_name:  ec.contact_name  || null,
      contact_title: ec.contact_title || null,
      email:         ec.email         || null,
      phone:         ec.phone         || null,
    }));
    if (this.extraContacts.length === 0) this.addExtraContact();
    if (!this.crmUsers.length) {
      this.api.getCrmUsers().subscribe({
        next: u => { this.zone.run(() => { this.crmUsers = u; this.cdr.markForCheck(); }); },
        error: () => {},
      });
    }
    this.showEdit = true;
  }

  saveLead() {
    if (!this.lead || !this.editForm.company) return;
    this.validateEditNip();
    if (this.editNipError) return;
    // Walidacja wymagalności wg etapu
    if (this.editErrors.length > 0) {
      alert('Uzupełnij wymagane pola:\n• ' + this.editErrors.join('\n• '));
      return;
    }
    this.saving = true;
    const payload: Partial<Lead> = {
      company:       this.editForm.company,
      stage:         this.editForm.stage,
      hot:           this.editForm.hot,
      contact_name:  this.editForm.contact_name || null,
      contact_title: this.editForm.contact_title || null,
      email:         this.editForm.email || null,
      phone:         this.editForm.phone || null,
      nip:           this.editForm.nip ? this.editForm.nip.trim().toUpperCase() : null,
      value_pln:                this.editForm.value_pln != null && this.editForm.value_pln !== '' ? +this.editForm.value_pln : null,
      annual_turnover_currency: this.editForm.annual_turnover_currency || 'PLN',
      online_pct:               this.editForm.online_pct !== '' && this.editForm.online_pct != null ? +this.editForm.online_pct : null,
      probability:   this.editForm.probability != null && this.editForm.probability !== '' ? +this.editForm.probability : null,
      close_date:    this.editForm.close_date || null,
      first_contact_date: this.editForm.first_contact_date || null,
      source:        this.editForm.source || null,
      industry:      this.editForm.industry || null,
      assigned_to:   this.editForm.assigned_to || null,
      tags:          this.editForm.tagsStr ? this.editForm.tagsStr.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      notes:         this.editForm.notes || null,
      lost_reason:   this.editForm.stage === 'closed_lost' ? (this.editForm.lost_reason || null) : null,
      agent_name:    this.editForm.source === 'agent' ? (this.editForm.agent_name || null) : null,
      agent_email:   this.editForm.source === 'agent' ? (this.editForm.agent_email || null) : null,
      agent_phone:   this.editForm.source === 'agent' ? (this.editForm.agent_phone || null) : null,
      website:       (this.editForm.website || null) as any,
      logo_url:      ((this.editForm as any).logo_url || null) as any,
    };
    this.api.updateLead(this.lead.id, payload).subscribe({
      next: updated => {
        this.zone.run(() => {
          this.lead = { ...this.lead!, ...updated, activities: this.lead!.activities };
          if (this.editForm.assigned_to) {
            const u = this.crmUsers.find(x => x.id === this.editForm.assigned_to);
            if (u) this.lead!.assigned_to_name = u.display_name;
          } else {
            this.lead!.assigned_to_name = null;
          }
          // Zapisz dodatkowe kontakty (pomiń puste)
          const nonEmpty = this.extraContacts.filter(ec => !this.isContactEmpty(ec));
          // Optymistycznie ustaw widok — bez czekania na odpowiedź backendu
          (this.lead as any).extra_contacts = nonEmpty;
          this.saving = false;
          this.showEdit = false;
          this.historyLoaded = false;
          if (this.midTab === 'history') this.loadHistory();
          if (updated.logo_url && !this.logoSasUrl) this.loadLogoSas();
          this.cdr.markForCheck();
          // Zapis do bazy — po odpowiedzi podmień na rekordy z ID z bazy
          this.api.saveLeadContacts(this.lead!.id, nonEmpty).subscribe({
            next: contacts => { (this.lead as any).extra_contacts = contacts; this.cdr.markForCheck(); },
            error: () => {},
          });
        });
      },
      error: (err: any) => { this.zone.run(() => {
        this.saving = false;
        if (err?.status === 409) this.editNipError = err?.error?.error || 'Ten Numer NIP jest już przypisany dla innego rekordu.';
        this.cdr.markForCheck();
      }); },
    });
  }

  runDetailEnrich() {
    const domain = (this.editForm.website || '').trim();
    if (!domain) return;
    this.detailEnriching  = true;
    this.editNipError = '';
    this.detailEnrichDone = false;
    this.cdr.markForCheck();
    this.api.enrichDomain(domain).subscribe({
      next: (r: any) => this.zone.run(() => {
        this.detailEnriching  = false;
        this.detailEnrichDone = true;
        if (r.company && !this.editForm.company)  this.editForm.company = r.company;
        if (r.email   && !this.editForm.email)    this.editForm.email   = r.email;
        if (r.phone   && !this.editForm.phone)    this.editForm.phone   = r.phone;
        if (r.logo_blob_path) {
          (this.editForm as any).logo_url = r.logo_blob_path;
          (this.lead as any).logo_url     = r.logo_blob_path;
          this.loadLogoSas();
        }
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => { this.detailEnriching = false; this.cdr.markForCheck(); }),
    });
  }

  loadLogoSas(): void {
    if (!this.lead?.logo_url) return;
    this.api.getLeadLogoImg(this.lead.id).subscribe({
      next: blobUrl => this.zone.run(() => { this.logoSasUrl = `url('${blobUrl}')`; this.cdr.markForCheck(); }),
      error: () => {},
    });
  }

  // ── Modal aktywności ────────────────────────────────────────────────────────
  actTypeName(type: string): string {
    const map: Record<string, string> = {
      task: 'Zadanie', call: 'Połączenie', email: 'Email', meeting: 'Spotkanie', note: 'Notatka',
      training: 'Szkolenie', qbr: 'QBR', doc_sent: 'Dokument', opportunity: 'Szansa',
    };
    return map[type] || type;
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
      assigned_to:      a.assigned_to || '',
      duration_min:     a.duration_min ?? '',
      meeting_location: a.meeting_location || '',
      participants:     a.participants || '',
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
    if (!this.actModalCloseComment.trim() || !a || !this.lead) return;
    this.savingActivity = true;
    this.api.updateLeadActivity(this.lead.id, a.id, { status: 'closed', close_comment: this.actModalCloseComment }).subscribe({
      next: updated => {
        this.zone.run(() => {
          if (this.lead) {
            this.lead = {
              ...this.lead,
              activities: (this.lead.activities || []).map(x => x.id === a.id ? { ...x, ...updated } : x),
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
    if (!this.actEditForm.title || !a || !this.lead) return;
    this.savingActivity = true;
    const payload: any = {
      type:        this.actEditForm.type,
      title:       this.actEditForm.title,
      body:        this.actEditForm.body || null,
      activity_at: this.actEditForm.activity_at || null,
      assigned_to: this.actEditForm.assigned_to || null,
    };
    if (this.actEditForm.type === 'meeting') {
      if (this.actEditForm.duration_min !== '') payload.duration_min = +this.actEditForm.duration_min;
      payload.meeting_location = this.actEditForm.meeting_location || null;
      payload.participants     = this.actEditForm.participants || null;
    }
    this.api.updateLeadActivity(this.lead.id, a.id, payload).subscribe({
      next: updated => {
        this.zone.run(() => {
          if (this.lead) {
            this.lead = {
              ...this.lead,
              activities: (this.lead.activities || []).map(x => x.id === a.id ? { ...x, ...updated } : x),
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
    return u?.is_admin || u?.crm_role === 'sales_manager' || a.created_by === u?.id || a.assigned_to === u?.id;
  }

  startEditActivity(a: any): void {
    this.editingActId = a.id;
    this.actEditForm  = {
      type:             a.type,
      title:            a.title,
      body:             a.body || '',
      activity_at:      a.activity_at ? a.activity_at.substring(0, 16) : '',
      assigned_to:      a.assigned_to || '',
      duration_min:     a.duration_min ?? '',
      meeting_location: a.meeting_location || '',
      participants:     a.participants || '',
    };
    if (!this.crmUsers.length) {
      this.api.getCrmUsers().subscribe({
        next: u => { this.zone.run(() => { this.crmUsers = u; this.cdr.markForCheck(); }); },
        error: () => {},
      });
    }
  }

  cancelEditActivity(): void { this.editingActId = null; }

  saveEditActivity(a: any): void {
    if (!this.actEditForm.title || !this.lead) return;
    this.savingActivity = true;
    const payload: any = {
      type:        this.actEditForm.type,
      title:       this.actEditForm.title,
      body:        this.actEditForm.body || null,
      activity_at: this.actEditForm.activity_at || null,
      assigned_to: this.actEditForm.assigned_to || null,
    };
    if (this.actEditForm.type === 'meeting') {
      if (this.actEditForm.duration_min !== '') payload.duration_min = +this.actEditForm.duration_min;
      payload.meeting_location = this.actEditForm.meeting_location || null;
      payload.participants     = this.actEditForm.participants || null;
    }
    this.api.updateLeadActivity(this.lead.id, a.id, payload).subscribe({
      next: updated => {
        this.zone.run(() => {
          if (this.lead) {
            this.lead = {
              ...this.lead,
              activities: (this.lead.activities || []).map(x => x.id === a.id ? { ...x, ...updated } : x),
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
    if (!this.lead || !confirm(`Usunąć aktywność "${a.title}"?`)) return;
    this.api.deleteLeadActivity(this.lead.id, a.id).subscribe({
      next: () => {
        this.zone.run(() => {
          if (this.lead) {
            this.lead = {
              ...this.lead,
              activities: (this.lead.activities || []).filter(x => x.id !== a.id),
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
    if (!this.allSuggestions.length && this.lead?.id) {
      this.api.getContactSuggestions(this.lead.id).subscribe({
        next: s => { this.allSuggestions = s; this._applyFilter(q); },
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

  openNewActivityForm(): void {
    if (this.showNewActivity) { this.showNewActivity = false; return; }
    const currentUserId = this.auth.user()?.id || '';
    this.actForm = {
      type: 'note', title: '', body: '',
      activity_at: '', assigned_to: currentUserId,
      duration_min: null, meeting_location: '', participantList: [] as string[],
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

  addActivity() {
    if (!this.actForm.title || !this.lead) return;
    this.savingActivity = true;
    const payload: any = {
      type:        this.actForm.type,
      title:       this.actForm.title,
      body:        this.actForm.body || null,
      activity_at: this.actForm.activity_at || null,
      assigned_to: this.actForm.assigned_to || null,
    };
    if (this.actForm.type === 'meeting') {
      if (this.actForm.duration_min) payload.duration_min = +this.actForm.duration_min;
      payload.meeting_location = this.actForm.meeting_location || null;
      payload.participants = (this.actForm.participantList || []).join(', ') || null;
    }
    // Snapshot przed resetem formularza
    const meetingSnap = this.actForm.type === 'meeting' ? { ...payload } : null;
    this.api.createLeadActivity(this.lead.id, payload).subscribe({
      next: newAct => {
        this.zone.run(() => {
          if (this.lead) {
            this.lead = { ...this.lead, activities: [newAct, ...(this.lead.activities || [])] };
          }
          this.actForm = { type: 'note', title: '', body: '', activity_at: '', assigned_to: '', duration_min: null, meeting_location: '', participantList: [] };
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
    const pad   = (n: number) => String(n).padStart(2, '0');
    const toGCal = (d: Date)  => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const start  = new Date(data.activity_at);
    const end    = new Date(start.getTime() + (data.duration_min || 60) * 60_000);
    const params = new URLSearchParams({ action: 'TEMPLATE', text: data.title, dates: `${toGCal(start)}/${toGCal(end)}` });
    if (data.body)             params.set('details',  data.body);
    if (data.meeting_location) params.set('location', data.meeting_location);
    if (data.participants)     params.set('add',      data.participants);
    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank');
  }

  convertLead() {
    if (!this.lead) return;
    this.converting = true;
    this.api.convertLead(this.lead.id, this.convertForm).subscribe({
      next: () => {
        this.converting = false;
        this.showConvert = false;
        this.lead = {
          ...this.lead!,
          stage: 'onboarding' as any,
          converted_at: new Date().toISOString(),
        };
        this.cdr.markForCheck();
      },
      error: () => { this.zone.run(() => { this.converting = false; this.cdr.markForCheck(); }); },
    });
  }

  loadHistory(): void {
    if (this.historyLoaded || !this.lead) return;
    this.historyLoading = true;
    this.cdr.markForCheck();
    this.api.getLeadHistory(this.lead.id).subscribe({
      next: rows => this.zone.run(() => {
        this.history = rows;
        this.historyLoading = false;
        this.historyLoaded = true;
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => { this.historyLoading = false; this.cdr.markForCheck(); }),
    });
  }

  histLabel(h: LeadHistoryEntry): string {
    const a = h.action;
    const after  = h.after_state  || {};
    const before = h.before_state || {};
    if (a === 'crm_lead_create')    return 'Lead utworzony';
    if (a === 'crm_lead_delete')    return 'Lead usunięty';
    if (a === 'crm_lead_converted') return 'Lead skonwertowany na Partnera';
    if (a === 'crm_lead_update') {
      if (after.activity_action === 'created') return `Aktywność dodana: ${after.title || ''}`;
      if (after.activity_action === 'deleted') return `Aktywność usunięta: ${before.title || ''}`;
      if (after.document_action === 'linked')  return 'Dokument powiązany';
      if (before.stage && after.stage && before.stage !== after.stage) {
        const bl = (LEAD_STAGE_LABELS as any)[before.stage] || before.stage;
        const al = (LEAD_STAGE_LABELS as any)[after.stage]  || after.stage;
        return `Zmiana etapu: ${bl} → ${al}`;
      }
      const changed = Object.keys(after).filter(k => k !== 'updated_at' && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
      if (changed.length === 1) {
        const k = changed[0];
        return `Zmieniono: ${this.fieldLabel(k)} → ${this._formatHistVal(k, after[k])}`;
      }
      if (changed.length > 1) {
        return `Zmieniono: ${changed.map(k => `${this.fieldLabel(k)} → ${this._formatHistVal(k, after[k])}`).join('; ')}`;
      }
      return 'Zaktualizowano lead';
    }
    return a.replace(/_/g, ' ');
  }

  private fieldLabel(key: string): string {
    const MAP: Record<string, string> = {
      company: 'Firma', stage: 'Etap', hot: 'Gorący', contact_name: 'Kontakt',
      email: 'Email', phone: 'Telefon', value_pln: 'Wartość PLN', source: 'Źródło',
      assigned_to: 'Handlowiec', close_date: 'Data zamk.', notes: 'Notatki',
      probability: 'Szansa %', industry: 'Branża', lost_reason: 'Powód przegranej',
      agent_name: 'Agent', annual_turnover_currency: 'Waluta', tags: 'Tagi',
      contact_title: 'Rola w firmie', nip: 'NIP', website: 'Strona WWW',
      online_pct: '% Online', first_contact_date: 'Pierwszy kontakt',
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
    if (key === 'stage') return (LEAD_STAGE_LABELS as any)[val] || val;
    if (typeof val === 'string' && val.length > 60) return val.substring(0, 57) + '…';
    return String(val);
  }

  histDetail(h: LeadHistoryEntry): string {
    const after = h.after_state || {};
    const before = h.before_state || {};
    if (h.action === 'crm_lead_update' && before.stage && after.stage && before.stage !== after.stage) {
      if (after.lost_reason) return `Powód: ${after.lost_reason}`;
    }
    return '';
  }

  histColor(action: string): string {
    if (action === 'crm_lead_create') return '#22c55e';
    if (action === 'crm_lead_delete') return '#ef4444';
    if (action === 'crm_lead_converted') return '#f97316';
    return '#94a3b8';
  }

  mockCall(): void {
    if (!this.lead?.phone) return;
    this.mockCallActive = true;
    this.cdr.markForCheck();
    setTimeout(() => { this.mockCallActive = false; this.cdr.markForCheck(); }, 5000);
  }

  quickChangeStage(stage: LeadStage): void {
    if (!this.lead || this.lead.stage === stage) return;
    if (stage === 'closed_lost') {
      this.openEdit();
      this.editForm.stage = 'closed_lost';
      return;
    }
    this.api.updateLead(this.lead.id, { stage } as any).subscribe({
      next: updated => this.zone.run(() => {
        this.lead = { ...this.lead!, ...updated, activities: this.lead!.activities };
        this.historyLoaded = false;
        this.cdr.markForCheck();
      }),
      error: () => {},
    });
  }

  onSourceChange(): void {
    if (this.editForm.source !== 'agent') {
      this.editForm.agent_name = '';
      this.editForm.agent_email = '';
      this.editForm.agent_phone = '';
    }
  }

  loadLinkedDocs(id: number): void {
    this.api.getLeadDocuments(id).subscribe({
      next: docs => this.zone.run(() => { this.linkedDocs = docs; this.cdr.markForCheck(); }),
      error: () => {},
    });
  }

  isLinked(docId: string): boolean {
    return this.linkedDocs.some(d => d.document_id === docId);
  }

  toggleLinkDoc(doc: any): void {
    if (!this.lead) return;
    if (doc._access === 'read') return;
    this.linkDocError = '';
    if (this.isLinked(doc.id)) {
      this.api.unlinkLeadDocument(this.lead.id, doc.id).subscribe({
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
      this.api.linkLeadDocument(this.lead.id, doc.id).subscribe({
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
    if (!this.lead || !confirm('Usunąć powiązanie z dokumentem?')) return;
    this.api.unlinkLeadDocument(this.lead.id, d.document_id).subscribe({
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

  sourceLabel(val: string | null): string {
    if (!val) return '';
    const found = this.leadSources.find(s => s.value === val);
    return found?.label ?? LEAD_SOURCE_LABELS[val] ?? val;
  }

  stageLabel(s: LeadStage) { return LEAD_STAGE_LABELS[s] || s; }
  actIcon(type: string) {
    return { task:'✅', call:'📞', email:'📧', meeting:'🤝', note:'📝', doc_sent:'📄' }[type] || '💬';
  }

  // ── Konto testowe ────────────────────────────────────────────────────────────

  loadTestAccount(leadId?: number): void {
    const id = leadId ?? (this.lead?.id);
    if (!id) return;
    this.api.getLeadTestAccount(id).subscribe({
      next: rec => this.zone.run(() => {
        this.testAccount = rec;
        // Wstępnie wypełnij formularz zapisanymi danymi
        if (rec) {
          this.taForm = {
            subdomain:             rec.subdomain             || '',
            language:              rec.language              || '',
            partner_currency:      rec.partner_currency      || '',
            country:               rec.country               || '',
            billing_address:       rec.billing_address       || '',
            billing_zip:           rec.billing_zip           || '',
            billing_city:          rec.billing_city          || '',
            billing_country:       rec.billing_country       || '',
            billing_email_address: rec.billing_email_address || '',
            admin_first_name:      rec.admin_first_name      || '',
            admin_last_name:       rec.admin_last_name       || '',
            admin_email:           rec.admin_email           || '',
          };
        }
        this.cdr.markForCheck();
      }),
      error: () => {},
    });
  }

  openTestAccountModal(): void {
    this.testAccountError = '';
    this.taSubmitAttempt  = false;
    this.showTestAccount  = true;
    this.cdr.markForCheck();
  }

  closeTestAccountModal(): void {
    if (this.submittingTestAccount) return;
    this.showTestAccount = false;
    this.cdr.markForCheck();
  }

  submitTestAccount(): void {
    this.taSubmitAttempt = true;
    const f = this.taForm;
    // Walidacja
    const required = [
      'subdomain','language','partner_currency','country',
      'billing_address','billing_zip','billing_city','billing_country','billing_email_address',
      'admin_first_name','admin_last_name','admin_email',
    ];
    if (required.some(k => !f[k]?.trim())) return;
    if (!this.lead) return;

    this.submittingTestAccount = true;
    this.testAccountError      = '';
    this.cdr.markForCheck();

    this.api.createLeadTestAccount(this.lead.id, { ...f }).subscribe({
      next: result => this.zone.run(() => {
        this.testAccount        = result.record;
        this.submittingTestAccount = false;
        // Po sukcesie modal zostaje otwarty — widać nr konta
        this.cdr.markForCheck();
      }),
      error: (err: any) => this.zone.run(() => {
        // HTTP 422: dane zapisane, ale zewnętrzne API odmówiło
        if (err?.status === 422 && err?.error?.record) {
          this.testAccount = err.error.record;
        }
        this.testAccountError      = err?.error?.error || 'Błąd połączenia z zewnętrznym API';
        this.submittingTestAccount = false;
        this.cdr.markForCheck();
      }),
    });
  }
}
