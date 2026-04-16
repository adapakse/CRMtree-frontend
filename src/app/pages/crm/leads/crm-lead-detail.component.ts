// src/app/pages/crm/leads/crm-lead-detail.component.ts
import { Component, OnInit, OnDestroy, inject, Input, ChangeDetectorRef, NgZone } from '@angular/core';
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

@Component({
  selector: 'wt-crm-lead-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
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
      <button class="hdr-btn" *ngIf="lead.phone"  (click)="mockCall()"        title="Zadzwoń: {{lead.phone}}">📞</button>
      <button class="hdr-btn" *ngIf="lead.email"  (click)="openEmailModal()"  title="Email: {{lead.email}}">
        ✉️ Email
        <span *ngIf="emailActivityCount>0" class="email-badge">{{emailActivityCount}}</span>
      </button>
      <button class="hdr-btn hdr-btn-edit" (click)="openEdit()">✏️ Edytuj</button>
      <button class="hdr-btn hdr-btn-test" *ngIf="!lead.converted_at" (click)="openTestAccountModal()" title="Załóż konto testowe w systemie zewnętrznym">
        🖥️ Konto testowe
        <span *ngIf="testAccount?.status==='created'" class="ta-badge-ok">✓</span>
        <span *ngIf="testAccount?.status==='error'"   class="ta-badge-err">!</span>
      </button>
      <button class="hdr-btn hdr-btn-primary" *ngIf="!lead.converted_at" (click)="showConvert=true">→ Migruj na Partnera</button>
    </div>
  </div>

  <!-- BODY: 3 kolumny -->
  <div style="flex:1;display:grid;grid-template-columns:280px 1fr 340px;gap:0;overflow:hidden;min-height:0">

    <!-- LEWA: Informacje -->
    <div style="border-right:1px solid #e5e7eb;overflow-y:auto;padding:16px">

      <!-- Kontakt -->
      <div class="info-section">
        <div class="info-section-title">Kontakt</div>
        <div class="info-kv" *ngIf="lead.website"><span class="lbl">WWW</span><span class="val"><a class="link" [href]="'https://'+lead.website" target="_blank">{{lead.website}}</a></span></div>
        <div class="info-kv"><span class="lbl">Firma</span><span class="val fw">{{lead.company}}</span></div>
        <div class="info-kv" *ngIf="lead.contact_name"><span class="lbl">Osoba</span><span class="val">{{lead.contact_name}}<span style="color:#9ca3af" *ngIf="lead.contact_title"> · {{lead.contact_title}}</span></span></div>
        <!-- Dodatkowe kontakty -->
        @for (ec of lead.extra_contacts || []; track ec.id) {
          <div class="info-kv"><span class="lbl">Kontakt</span><span class="val">{{ec.contact_name || '—'}}<span style="color:#9ca3af" *ngIf="ec.contact_title"> · {{ec.contact_title}}</span><span *ngIf="ec.email" style="color:#6b7280;font-size:11px;display:block">{{ec.email}}</span><span *ngIf="ec.phone" style="color:#6b7280;font-size:11px">{{ec.phone}}</span></span></div>
        }
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
            <button style="background:none;border:none;cursor:pointer;font-size:12px;margin-left:4px;opacity:.6" (click)="mockCall()" title="Zadzwoń">📞</button>
          </span>
        </div>
        <div class="info-kv" *ngIf="lead.nip"><span class="lbl">NIP</span><span class="val" style="font-family:monospace">{{lead.nip}}</span></div>
        <div class="info-kv" *ngIf="lead.industry"><span class="lbl">Branża</span><span class="val">{{lead.industry}}</span></div>
        <div class="info-kv" *ngIf="lead.source"><span class="lbl">Źródło</span><span class="val">{{sourceLabel(lead.source)}}</span></div>
      </div>

      <!-- Dane Agenta -->
      <div class="info-section" *ngIf="lead.agent_name || lead.agent_email || lead.agent_phone">
        <div class="info-section-title" style="color:#f97316">🤝 Agent</div>
        <div class="info-kv" *ngIf="lead.agent_name"><span class="lbl">Imię i nazwisko</span><span class="val fw">{{lead.agent_name}}</span></div>
        <div class="info-kv" *ngIf="lead.agent_email">
          <span class="lbl">Email</span>
          <a class="val link" href="mailto:{{lead.agent_email}}">{{lead.agent_email}}</a>
        </div>
        <div class="info-kv" *ngIf="lead.agent_phone"><span class="lbl">Telefon</span><span class="val">{{lead.agent_phone}}</span></div>
      </div>

      <!-- Pipeline -->
      <div class="info-section">
        <div class="info-section-title">Pipeline</div>
        <div class="info-kv"><span class="lbl">Wartość</span><span class="val" style="color:#f97316;font-family:'Sora',sans-serif;font-weight:700">{{(lead.value_pln||0)|number:'1.0-0'}} {{lead.annual_turnover_currency||'PLN'}}</span></div>
        <div class="info-kv"><span class="lbl">Etap</span><span class="val"><span class="stage-badge stage-{{lead.stage}}" style="font-size:10px">{{stageLabel(lead.stage)}}</span></span></div>
        <div class="info-kv"><span class="lbl">Szansa</span><span class="val">{{lead.probability||0}}%</span></div>
        <div class="info-kv" *ngIf="lead.online_pct!=null"><span class="lbl">% Online</span><span class="val">{{lead.online_pct}}%</span></div>
        <div class="info-kv" *ngIf="lead.first_contact_date"><span class="lbl">Pierwszy kont.</span><span class="val">{{lead.first_contact_date|date:'dd.MM.yyyy'}}</span></div>
        <div class="info-kv" *ngIf="lead.close_date"><span class="lbl">Data zamkn.</span><span class="val">{{lead.close_date|date:'dd.MM.yyyy'}}</span></div>
        <div class="info-kv" *ngIf="lead.assigned_to_name"><span class="lbl">Handlowiec</span><span class="val fw">{{lead.assigned_to_name}}</span></div>
      </div>

      <!-- Tagi i notatki -->
      <div class="info-section" *ngIf="lead.tags?.length || lead.notes">
        <div class="info-section-title">Dodatkowe</div>
        <div *ngIf="lead.tags?.length" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
          <span *ngFor="let t of lead.tags" style="background:#eff6ff;color:#1d4ed8;border-radius:12px;padding:1px 8px;font-size:11px">{{t}}</span>
        </div>
        <div *ngIf="lead.notes" style="font-size:12px;color:#6b7280;white-space:pre-line;line-height:1.5">{{lead.notes}}</div>
      </div>

      <!-- Powiązane dokumenty -->
      <div class="info-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div class="info-section-title" style="margin-bottom:0">📎 Dokumenty ({{linkedDocs.length}})</div>
          <button class="btn-sm" (click)="showDocPicker=true" style="font-size:10px">+ Dodaj</button>
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
    </div>

    <!-- ŚRODEK: Aktywności (tabs: Aktywności | Historia) -->
    <div style="display:flex;flex-direction:column;overflow:hidden;min-height:0">
      <div style="display:flex;align-items:center;border-bottom:1px solid #e5e7eb;padding:0 16px;background:white;flex-shrink:0;gap:0">
        <button class="tab-btn" [class.active]="midTab==='activities'" (click)="midTab='activities'">
          Aktywności
          <span *ngIf="lead.activities?.length" style="background:#f3f4f6;border-radius:10px;padding:1px 6px;font-size:10px;margin-left:4px">{{lead.activities!.length}}</span>
        </button>
        <button class="tab-btn" [class.active]="midTab==='emails'" (click)="midTab='emails'">
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
          <button class="btn-sm primary" (click)="showNewActivity=!showNewActivity">+ Dodaj aktywność</button>
        </div>

        <!-- Nowa aktywność form -->
        <div *ngIf="showNewActivity" style="background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin-bottom:12px;display:flex;flex-direction:column;gap:8px">
          <select [(ngModel)]="actForm.type" class="act-sel" (ngModelChange)="onActTypeChange()">
            <option value="call">📞 Połączenie</option>
            <option value="email">📧 Email</option>
            <option value="meeting">🤝 Spotkanie</option>
            <option value="note">📝 Notatka</option>
            <option value="doc_sent">📄 Dokument</option>
          </select>
          <input [(ngModel)]="actForm.title" placeholder="Tytuł *" class="act-input">
          <ng-container *ngIf="actForm.type==='meeting'">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">Data i czas<input type="datetime-local" [(ngModel)]="actForm.activity_at" class="act-input" style="font-size:11px"></label>
              <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">Czas trwania (min)<input type="number" min="0" [(ngModel)]="actForm.duration_min" placeholder="60" class="act-input" style="font-size:11px"></label>
            </div>
            <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">Miejsce spotkania<input [(ngModel)]="actForm.meeting_location" placeholder="np. Sala konferencyjna A" class="act-input" style="font-size:11px"></label>
            <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">
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
          <textarea [(ngModel)]="actForm.body" placeholder="Treść…" rows="2" class="act-input"></textarea>
          <div style="display:flex;gap:6px;justify-content:flex-end">
            <button class="btn-sm" (click)="showNewActivity=false">Anuluj</button>
            <button class="btn-sm primary" (click)="addActivity()" [disabled]="!actForm.title||savingActivity">{{savingActivity?'…':'Zapisz'}}</button>
          </div>
        </div>

        <!-- Lista aktywności -->
        <div *ngFor="let a of lead.activities||[]" class="act-item">
          <span class="act-type-icon">{{actIcon(a.type)}}</span>
          <div class="act-body" *ngIf="editingActId!==a.id">
            <strong>{{a.title}}</strong>
            <div class="act-meta">{{a.activity_at|date:'dd.MM.yyyy HH:mm'}} · {{a.created_by_name}}</div>
            <div *ngIf="a.meeting_location" class="act-text">📍 {{a.meeting_location}}</div>
            <div *ngIf="a.participants" class="act-text">👥 {{a.participants}}</div>
            <div class="act-text" *ngIf="a.body">{{a.body}}</div>
            <!-- Link do wątku Gmail -->
            <div *ngIf="a.type==='email' && a.gmail_thread_id" style="margin-top:4px">
              <button class="btn-sm" style="font-size:10px;padding:2px 8px" (click)="openThread(a.gmail_thread_id)">
                📧 Pokaż wątek
              </button>
            </div>
          </div>
          <div class="act-body act-edit-form" *ngIf="editingActId===a.id">
            <select [(ngModel)]="actEditForm.type" class="act-sel"><option value="call">📞 Połączenie</option><option value="email">📧 Email</option><option value="meeting">🤝 Spotkanie</option><option value="note">📝 Notatka</option><option value="doc_sent">📄 Dokument</option></select>
            <input [(ngModel)]="actEditForm.title" placeholder="Tytuł *" class="act-input">
            <ng-container *ngIf="actEditForm.type==='meeting'"><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">Data i czas<input type="datetime-local" [(ngModel)]="actEditForm.activity_at" class="act-input" style="font-size:11px"></label><label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:2px">Czas trwania (min)<input type="number" min="0" [(ngModel)]="actEditForm.duration_min" placeholder="60" class="act-input" style="font-size:11px"></label></div><input [(ngModel)]="actEditForm.meeting_location" placeholder="Miejsce spotkania" class="act-input"><input [(ngModel)]="actEditForm.participants" placeholder="Uczestnicy" class="act-input"></ng-container>
            <textarea [(ngModel)]="actEditForm.body" placeholder="Treść…" rows="2" class="act-input"></textarea>
            <div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn-sm" (click)="cancelEditActivity()">Anuluj</button><button class="btn-sm primary" (click)="saveEditActivity(a)" [disabled]="!actEditForm.title||savingActivity">{{savingActivity?'…':'Zapisz'}}</button></div>
          </div>
          <div class="act-controls" *ngIf="editingActId!==a.id&&canEditActivity(a)">
            <button class="act-ctrl-btn" (click)="startEditActivity(a)" title="Edytuj">✏️</button>
            <button class="act-ctrl-btn del" (click)="deleteActivity(a)" title="Usuń">🗑️</button>
          </div>
        </div>
        <div *ngIf="!(lead.activities?.length)" class="empty-act">Brak aktywności. Dodaj pierwszą powyżej.</div>
      </div>

      <!-- Emaile tab -->
      <div *ngIf="midTab==='emails'" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:0">
        <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
          <button class="btn-sm primary" (click)="openEmailModal()">+ Nowy email</button>
        </div>
        <div *ngIf="emailActivities.length===0" class="empty-act">Brak wysłanych emaili.</div>
        <!-- Aktywności email -->
        <div *ngFor="let a of emailActivities" class="act-item" style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:8px;border-left:3px solid #dbeafe">
          <span class="act-type-icon">📧</span>
          <div class="act-body" style="flex:1">
            <strong>{{a.title}}</strong>
            <div class="act-meta">{{a.activity_at|date:'dd.MM.yyyy HH:mm'}} · {{a.created_by_name}}</div>
            <div class="act-text" *ngIf="a.body" style="margin-top:4px;white-space:pre-line">{{a.body}}</div>
            <div style="margin-top:6px;display:flex;gap:6px">
              <button *ngIf="a.gmail_thread_id" class="btn-sm" style="font-size:10px" (click)="openThread(a.gmail_thread_id)">
                💬 Pokaż wątek
              </button>
              <button *ngIf="a.gmail_thread_id" class="btn-sm primary" style="font-size:10px" (click)="replyToThread(a)">
                ↩ Odpowiedz
              </button>
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
        </div>
      </div>

      <!-- Historia tab -->
      <div *ngIf="midTab==='history'" style="flex:1;overflow-y:auto;padding:16px">
        <div *ngIf="historyLoading" style="text-align:center;color:#9ca3af;padding:20px;font-size:12px">Ładowanie historii…</div>
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
        <button class="comm-btn" (click)="mockCall()" [disabled]="!lead.phone">
          <span style="font-size:16px">📞</span>
          <div style="flex:1;text-align:left">
            <div style="font-size:12px;font-weight:600">Zadzwoń</div>
            <div style="font-size:10px;color:#9ca3af">{{lead.phone||'Brak numeru'}}</div>
          </div>
        </button>
        <button class="comm-btn" (click)="openEmailModal()" [disabled]="!lead.email" style="margin-top:6px">
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

      <!-- Status leada quick-change -->
      <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:14px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;margin-bottom:10px">Etap sprzedaży</div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <button *ngFor="let s of stageOptions" class="stage-btn"
                  [class.active]="lead.stage===s.key"
                  (click)="quickChangeStage(s.key)"
                  [disabled]="lead.stage===s.key">
            <span class="stage-dot stage-dot-{{s.key}}"></span>
            {{s.label}}
            <span *ngIf="lead.stage===s.key" style="margin-left:auto;font-size:10px;opacity:.7">✓ aktualny</span>
          </button>
        </div>
      </div>

      <!-- Konwersja -->
      <div *ngIf="!lead.converted_at" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#c2410c;margin-bottom:8px">→ Migracja</div>
        <div style="font-size:12px;color:#9a3412;margin-bottom:10px">Przekształć lead w Partnera gdy jest gotowy do podpisania umowy.</div>
        <button class="hdr-btn hdr-btn-primary" style="width:100%;justify-content:center" (click)="showConvert=true">Migruj na Partnera →</button>
      </div>
      <div *ngIf="lead.converted_at" style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:14px">
        <div style="font-size:11px;font-weight:700;color:#7C3AED;margin-bottom:4px">✦ Zmigrowany na Partnera</div>
        <div style="font-size:11px;color:#9ca3af;margin-bottom:8px">{{lead.converted_at|date:'dd.MM.yyyy'}}</div>
        <a *ngIf="lead.converted_partner_id" [routerLink]="['/crm/onboarding']" [queryParams]="{partner: lead.converted_partner_id}"
           style="display:block;text-align:center;background:#7C3AED;color:white;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;text-decoration:none">
          Przejdź do Partnera →
        </a>
      </div>
    </div>
  </div>
</div>

<div *ngIf="!lead&&!loading" style="padding:40px;text-align:center;color:#9ca3af">
  {{ loadError ? 'Błąd ładowania leada.' : 'Lead nie znaleziony.' }}
</div>
<div *ngIf="loading" style="padding:40px;text-align:center;color:#9ca3af">Ładowanie…</div>

<!-- ── Gmail Compose Modal ─────────────────────────────────────────────────── -->
<div class="modal-overlay" *ngIf="showEmailModal" (click)="showEmailModal=false">
  <div class="modal modal-wide" (click)="$event.stopPropagation()" style="width:min(580px,100%)">
    <div class="modal-header">
      <h3>✉️ Wyślij email</h3>
      <button class="close-btn" (click)="showEmailModal=false">✕</button>
    </div>
    <div class="modal-body" style="gap:10px">
      <!-- Do: -->
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
        <textarea class="act-input" [(ngModel)]="emailForm.body" rows="7" placeholder="Treść wiadomości…"></textarea>
      </label>
      <!-- Załączniki -->
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
      <!-- Error -->
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

<!-- Thread modal -->
<div class="modal-overlay" *ngIf="showThreadModal" (click)="showThreadModal=false">
  <div class="modal modal-wide" (click)="$event.stopPropagation()" style="width:min(640px,100%)">
    <div class="modal-header">
      <h3>💬 Wątek email</h3>
      <button class="close-btn" (click)="showThreadModal=false">✕</button>
    </div>
    <div class="modal-body" style="gap:8px">
      <div *ngIf="loadingThread" style="text-align:center;color:#9ca3af;padding:20px">Ładowanie wątku…</div>
      <div *ngFor="let m of threadMessages"
           style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;font-size:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-weight:600;color:#374151">{{m.from}}</span>
          <span style="color:#9ca3af;font-size:11px">{{m.date|date:'dd.MM.yyyy HH:mm'}}</span>
        </div>
        <div style="color:#6b7280;white-space:pre-line;line-height:1.5">{{m.snippet}}</div>
        <div *ngIf="m.attachments?.length" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">
          <span *ngFor="let att of m.attachments" style="background:#f3f4f6;border-radius:8px;padding:2px 8px;font-size:10px;color:#6b7280">📎 {{att.filename}}</span>
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
          <label>Etap<select [(ngModel)]="editForm.stage"><option *ngFor="let s of stageOptions" [value]="s.key">{{s.label}}</option></select></label>
        </div>
        <div class="edit-row" *ngIf="editForm.stage==='closed_lost'">
          <label class="full" style="color:#991b1b">Powód przegranej *<input [(ngModel)]="editForm.lost_reason" placeholder="np. Cena, Konkurencja…" [style.border-color]="editForm.stage==='closed_lost'&&!editForm.lost_reason?'#ef4444':''"></label>
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
          <label><span style="display:flex;align-items:center;gap:4px">Stanowisko <span *ngIf="requiresFullFields" style="color:#f97316">*</span></span><select [(ngModel)]="editForm.contact_title"
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
        <div class="edit-row">
          <label><span style="display:flex;align-items:center;gap:4px;margin-bottom:4px">NIP <span style="color:#f97316">*</span></span>
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
      <!-- Dodatkowe kontakty -->
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
              <label>Stanowisko<select [(ngModel)]="ec.contact_title"><option value="">— brak —</option><option *ngFor="let t of dictTitles" [value]="t">{{t}}</option></select></label>
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
        <div *ngFor="let doc of docResults" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer" [style.background]="isLinked(doc.id)?'#f0fdf4':'white'" (click)="toggleLinkDoc(doc)">
          <span style="font-size:16px">📄</span>
          <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{doc.name}}</div><div style="font-size:10px;color:#9ca3af"><span *ngIf="doc.doc_number">#{{doc.doc_number}} · </span>{{doc.doc_type}}</div></div>
          <span *ngIf="isLinked(doc.id)" style="font-size:11px;font-weight:700;color:#16a34a">✓ Dodano</span>
          <span *ngIf="!isLinked(doc.id)" style="font-size:11px;color:#9ca3af">Dodaj</span>
        </div>
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
        <div>
          <div style="font-size:12px;font-weight:700;color:#15803d">Konto testowe założone</div>
          <div style="font-size:12px;color:#16a34a;font-family:monospace;margin-top:2px">Nr: {{testAccount!.test_account_number}}</div>
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
              <option *ngFor="let l of dictPartnerLanguages" [value]="l">{{l}}</option>
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
              <option *ngFor="let c of dictPartnerCountries" [value]="c">{{c}}</option>
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
              <option *ngFor="let c of dictPartnerCountries" [value]="c">{{c}}</option>
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

<!-- Convert dialog -->
<div class="modal-overlay" *ngIf="showConvert" (click)="showConvert=false">
  <div class="modal" (click)="$event.stopPropagation()">
    <h3>Migruj lead na Partnera</h3>
    <p>Firma <strong>{{lead?.company}}</strong> zostanie przeniesiona do rejestru partnerów. Lead pozostanie w rejestrze ze statusem <strong>Won</strong>.</p>
    <label>Wartość kontraktu (PLN)<input [(ngModel)]="convertForm.contract_value" type="number" min="0"></label>
    <label>Data podpisania<input [(ngModel)]="convertForm.contract_signed" type="date"></label>
    <div class="modal-actions">
      <button class="btn-outline" (click)="showConvert=false">Anuluj</button>
      <button class="btn-primary" (click)="convertLead()" [disabled]="converting">{{converting?'…':'Migruj na Partnera →'}}</button>
    </div>
  </div>
</div>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; flex:1; overflow:hidden; height:100%; }
    .hdr-btn { background:white; border:1px solid #e5e7eb; border-radius:8px; padding:5px 12px; font-size:12px; cursor:pointer; display:flex; align-items:center; gap:4px; position:relative; }
    .hdr-btn:hover { background:#f9fafb; }
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
    .act-item { display:flex; gap:10px; padding:10px 0; border-bottom:1px solid #f4f4f5; }
    .act-item:last-child { border-bottom:none; }
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
    .participant-chips { display:flex;flex-wrap:wrap;gap:4px;align-items:center;border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;min-height:32px;background:white; }
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
  `],
})
export class CrmLeadDetailComponent implements OnInit {
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
    if (!this.requiresFullFields) return [];
    const f = this.editForm;
    const errs: string[] = [];
    if (!f.website)            errs.push('Strona WWW');
    if (!f.contact_name)       errs.push('Imię i Nazwisko');
    if (!f.contact_title)      errs.push('Stanowisko');
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
    // Załaduj dodatkowe kontakty
    this.extraContacts = ((this.lead as any).extra_contacts || []).map((ec: any) => ({
      id: ec.id,
      contact_name:  ec.contact_name  || null,
      contact_title: ec.contact_title || null,
      email:         ec.email         || null,
      phone:         ec.phone         || null,
    }));
    if (this.extraContacts.length === 0) this.addExtraContact(); // pusty wiersz na start
  }
  detailEnriching   = false;
  detailEnrichDone  = false;
  actForm: any   = { type: 'note', title: '', body: '', activity_at: '', duration_min: null, meeting_location: '', participantList: [] as string[] };
  actEditForm: any = { type: 'note', title: '', body: '', activity_at: '', duration_min: null, meeting_location: '', participants: '' };
  editingActId: number | null = null;
  allSuggestions: { email: string; name: string }[] = [];
  filteredSuggestions: { email: string; name: string }[] = [];
  participantQuery = '';
  convertForm    = { contract_value: null as number | null, contract_signed: '' };

  crmUsers: CrmUser[] = [];
  get stageOptions() { return this.dictStages.map(s => ({ key: s.value as LeadStage, label: s.label })); }
  leadSources: LeadSource[] = LEAD_SOURCES;

  sourcesWithoutGroup(): LeadSource[] { return this.leadSources.filter(s => !s.group); }
  sourceGroups(): string[] { return [...new Set(this.leadSources.filter(s => s.group).map(s => s.group!))]; }
  sourcesInGroup(g: string): LeadSource[] { return this.leadSources.filter(s => s.group === g); }

  // Powiązane dokumenty
  linkedDocs: LinkedDocument[]  = [];
  showDocPicker = false;
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
  showEmailModal  = false;
  sendingEmail    = false;
  emailError      = '';
  emailForm: any  = { recipientList: [] as string[], subject: '', body: '', threadId: '' };
  recipientQuery  = '';
  emailAttachments: File[] = [];

  // Thread viewer
  showThreadModal = false;
  loadingThread   = false;
  threadMessages: any[] = [];
  openThreadId    = '';
  private currentThreadActivity: any = null;

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
    return (this.lead?.activities || []).filter(a => a.type === 'email');
  }

  get emailActivityCount(): number {
    return this.emailActivities.length;
  }

  get isManager() {
    const u = this.auth.user();
    return u?.is_admin || u?.crm_role === 'sales_manager';
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
  }

  loadLead(numId?: number) {
    const id = numId ?? parseInt(this.id, 10);
    if (!id || isNaN(id)) return;
    this.loading = true;
    this.loadError = false;
    this.lead = null;
    this.api.getLead(id).pipe(
      finalize(() => { this.zone.run(() => { this.loading = false; this.cdr.markForCheck(); }); })
    ).subscribe({
      next: l  => { this.zone.run(() => { this.lead = l; this.historyLoaded = false; this.loadLogoSas(); this.cdr.markForCheck(); }); },
      error: () => { this.zone.run(() => { this.loadError = true; this.cdr.markForCheck(); }); },
    });
  }

  // ── Gmail ────────────────────────────────────────────────────────────────────
  openEmailModal(prefillThreadId?: string): void {
    this.emailForm = {
      recipientList: this.lead?.email ? [this.lead.email] : [],
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
    if (files) {
      this.emailAttachments = [...this.emailAttachments, ...Array.from(files)];
    }
    this.cdr.markForCheck();
  }

  removeAttachment(idx: number): void {
    this.emailAttachments.splice(idx, 1);
    this.cdr.markForCheck();
  }

  sendEmail(): void {
    if (!this.lead || !this.emailForm.recipientList?.length || !this.emailForm.subject) return;
    this.sendingEmail = true;
    this.emailError   = '';

    const fd = new FormData();
    fd.append('to', this.emailForm.recipientList.join(','));
    fd.append('subject', this.emailForm.subject);
    fd.append('body', this.emailForm.body || '');
    if (this.emailForm.threadId) fd.append('threadId', this.emailForm.threadId);
    this.emailAttachments.forEach(f => fd.append('attachments', f, f.name));

    this.api.sendLeadEmail(this.lead.id, fd).subscribe({
      next: (result: GmailSendResult) => {
        this.zone.run(() => {
          // Dodaj aktywność email lokalnie (backend też ją stworzył — odśwież lub dodaj)
          if (this.lead) {
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
            this.lead = { ...this.lead, activities: [newAct, ...(this.lead.activities || [])] };
          }
          this.sendingEmail   = false;
          this.showEmailModal = false;
          this.midTab         = 'emails'; // przełącz na tab emaili
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
      next: msgs => this.zone.run(() => { this.threadMessages = msgs; this.cdr.markForCheck(); }),
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
    this.openEmailModal(a.gmail_thread_id);
    const m = this.threadMessages[0];
    if (m && !this.emailForm.subject) {
      this.emailForm.subject = m.subject?.startsWith('Re:') ? m.subject : `Re: ${m.subject || a.title}`;
    }
  }

  replyToCurrentThread(): void {
    this.showThreadModal = false;
    const m = this.threadMessages[0];
    this.openEmailModal(m?.threadId || '');
    if (m) this.emailForm.subject = m.subject?.startsWith('Re:') ? m.subject : `Re: ${m.subject}`;
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
      close_date:   this.lead.close_date || '',
      first_contact_date: this.lead.first_contact_date ? String(this.lead.first_contact_date).slice(0,10) : '',
      source:       this.lead.source || '',
      industry:     this.lead.industry || '',
      assigned_to:  this.lead.assigned_to || '',
      tagsStr:      (this.lead.tags || []).join(', '),
      notes:        this.lead.notes || '',
      agent_name:   (this.lead as any).agent_name || '',
      agent_email:  (this.lead as any).agent_email || '',
      agent_phone:  (this.lead as any).agent_phone || '',
      website:      (this.lead as any).website || '',
    };
    this.editNipError = '';
    this.detailEnrichDone = false;
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
          this.api.saveLeadContacts(this.lead!.id, nonEmpty).subscribe({
            next: contacts => { (this.lead as any).extra_contacts = contacts; this.cdr.markForCheck(); },
            error: () => {},
          });
          this.saving = false;
          this.showEdit = false;
          if (updated.logo_url && !this.logoSasUrl) this.loadLogoSas();
          this.cdr.markForCheck();
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
    };
  }

  cancelEditActivity(): void { this.editingActId = null; }

  saveEditActivity(a: any): void {
    if (!this.actEditForm.title || !this.lead) return;
    this.savingActivity = true;
    const payload: any = {
      type:  this.actEditForm.type,
      title: this.actEditForm.title,
      body:  this.actEditForm.body || null,
    };
    if (this.actEditForm.type === 'meeting') {
      if (this.actEditForm.activity_at)      payload.activity_at      = this.actEditForm.activity_at;
      if (this.actEditForm.duration_min !== '') payload.duration_min   = +this.actEditForm.duration_min;
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

  addActivity() {
    if (!this.actForm.title || !this.lead) return;
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
    this.api.createLeadActivity(this.lead.id, payload).subscribe({
      next: newAct => {
        this.zone.run(() => {
          if (this.lead) {
            this.lead = { ...this.lead, activities: [newAct, ...(this.lead.activities || [])] };
          }
          this.actForm = { type: 'note', title: '', body: '', activity_at: '', duration_min: null, meeting_location: '', participantList: [] };
          this.participantQuery = '';
          this.showNewActivity  = false;
          this.savingActivity   = false;
          this.cdr.markForCheck();
        });
      },
      error: () => { this.zone.run(() => { this.savingActivity = false; this.cdr.markForCheck(); }); },
    });
  }

  convertLead() {
    if (!this.lead) return;
    this.converting = true;
    this.api.convertLead(this.lead.id, this.convertForm).subscribe({
      next: r => {
        this.converting = false;
        this.showConvert = false;
        // Przeładuj leada — pokaże partner link i status Won
        this.lead = {
          ...this.lead!,
          stage: 'closed_won' as any,
          converted_at: new Date().toISOString(),
          converted_partner_id: r.partner.id,
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
      if (changed.length === 1) return `Zmieniono: ${this.fieldLabel(changed[0])}`;
      if (changed.length > 1)  return `Zmieniono pola: ${changed.map(k => this.fieldLabel(k)).join(', ')}`;
      return 'Zaktualizowano lead';
    }
    return a.replace(/_/g, ' ');
  }

  private fieldLabel(key: string): string {
    const MAP: Record<string, string> = {
      company: 'Firma', stage: 'Etap', hot: 'Gorący', contact_name: 'Kontakt',
      email: 'Email', phone: 'Telefon', value_pln: 'Wartość', source: 'Źródło',
      assigned_to: 'Handlowiec', close_date: 'Data zamk.', notes: 'Notatki',
      probability: 'Szansa', industry: 'Branża', lost_reason: 'Powód przegranej',
      agent_name: 'Agent', annual_turnover_currency: 'Waluta', tags: 'Tagi',
    };
    return MAP[key] || key;
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
    if (this.isLinked(doc.id)) {
      this.api.unlinkLeadDocument(this.lead.id, doc.id).subscribe({
        next: () => this.zone.run(() => {
          this.linkedDocs = this.linkedDocs.filter(d => d.document_id !== doc.id);
          this.cdr.markForCheck();
        }),
        error: () => {},
      });
    } else {
      this.api.linkLeadDocument(this.lead.id, doc.id).subscribe({
        next: linked => this.zone.run(() => {
          this.linkedDocs = [...this.linkedDocs, { ...linked, document_title: doc.name, doc_number: doc.doc_number, doc_type: doc.doc_type }];
          this.cdr.markForCheck();
        }),
        error: () => {},
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
    return { call:'📞', email:'📧', meeting:'🤝', note:'📝', doc_sent:'📄' }[type] || '💬';
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
