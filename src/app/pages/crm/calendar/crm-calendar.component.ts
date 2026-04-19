// src/app/pages/crm/calendar/crm-calendar.component.ts
import { Observable } from 'rxjs';
import { Component, OnInit, inject, ChangeDetectorRef, NgZone, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CrmApiService, CalendarMeeting, ActivityTask, CrmUser, CrmGroup } from '../../../core/services/crm-api.service';
import { AuthService } from '../../../core/auth/auth.service';

type ViewMode = 'month' | 'week' | 'day' | 'tasks';

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  meetings: CalendarMeeting[];
}

@Component({
  selector: 'wt-crm-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">

<!-- TOPBAR -->
<div style="height:60px;background:white;border-bottom:1px solid #e4e4e7;display:flex;align-items:center;gap:10px;padding:0 20px;flex-shrink:0">
  <span style="font-family:'Sora',sans-serif;font-size:17px;font-weight:700;color:#18181b">Kalendarz działań</span>
  <span style="flex:1"></span>

  <!-- Filtr handlowca (manager) -->
  <select class="ctl" *ngIf="isManager" [(ngModel)]="filterRep" (ngModelChange)="onFilterRepChange()">
    <option value="">Wszyscy handlowcy</option>
    <optgroup label="── Handlowcy ──" *ngIf="crmUsers.length > 0">
      <option *ngFor="let u of crmUsers" [value]="u.id">{{ u.display_name }}</option>
    </optgroup>
    <optgroup label="── Grupy ──" *ngIf="crmGroups.length > 0">
      <option *ngFor="let g of crmGroups" [value]="'__group__' + g.id">📂 {{ g.name }}</option>
    </optgroup>
  </select>

  <!-- Filtr typu aktywności (zadania) -->
  <select class="ctl" *ngIf="view === 'tasks'" [(ngModel)]="filterActivityType" (ngModelChange)="loadTasks()">
    <option value="">Wszystkie typy</option>
    <option value="call">Połączenie</option>
    <option value="meeting">Spotkanie</option>
    <option value="note">Notatka</option>
    <option value="doc_sent">Dokument</option>
    <option value="training">Szkolenie</option>
    <option value="qbr">QBR</option>
    <option value="opportunity">Szansa</option>
  </select>

  <!-- Pokaż zamknięte (zadania) -->
  <label *ngIf="view === 'tasks'" style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;color:#374151">
    <input type="checkbox" [(ngModel)]="showClosedTasks" (ngModelChange)="loadTasks()">
    pokaż zamknięte
  </label>

  <!-- Nawigacja (tylko dla widoków kalendarza) -->
  <ng-container *ngIf="view !== 'tasks'">
    <button class="nav-btn" (click)="prev()">‹</button>
    <span style="font-family:'Sora',sans-serif;font-weight:700;font-size:15px;min-width:200px;text-align:center">{{ periodLabel }}</span>
    <button class="nav-btn" (click)="next()">›</button>
    <button class="nav-btn" (click)="today()" style="font-size:12px;padding:5px 12px">Dziś</button>
  </ng-container>

  <!-- Przełącznik widoku -->
  <div class="view-switch">
    <button [class.active]="view === 'tasks'" (click)="setView('tasks')">Zadania</button>
    <button [class.active]="view === 'day'"   (click)="setView('day')">Dzień</button>
    <button [class.active]="view === 'week'"  (click)="setView('week')">Tydzień</button>
    <button [class.active]="view === 'month'" (click)="setView('month')">Miesiąc</button>
  </div>

  <button class="nav-btn" (click)="view === 'tasks' ? loadTasks() : load()" style="font-size:12px">↻</button>
</div>

<!-- CONTENT -->
<div style="flex:1;overflow:hidden;display:flex;flex-direction:column">
  <div *ngIf="loading" style="height:3px;background:#f97316;flex-shrink:0"></div>

  <!-- ══ WIDOK MIESIĄCA ══ -->
  <div *ngIf="view === 'month'" style="flex:1;overflow:auto;padding:0">
    <div class="month-grid">
      <div *ngFor="let d of dayNames" class="month-dayname">{{ d }}</div>
      <div *ngFor="let day of monthDays" class="month-cell"
           [class.other-month]="!day.isCurrentMonth"
           [class.today]="day.isToday">
        <div class="day-num">{{ day.date.getDate() }}</div>
        <div class="day-events">
          <div *ngFor="let m of day.meetings.slice(0,3)" class="event-chip"
               [class.lead-chip]="m.source_type === 'lead'"
               [class.partner-chip]="m.source_type === 'partner'"
               (click)="openMeeting(m)">
            <span class="event-time">{{ m.activity_at | date:'HH:mm' }}</span>
            <span class="event-title">{{ m.title }}</span>
          </div>
          <div *ngIf="day.meetings.length > 3" class="event-more"
               (click)="setView('day'); jumpToDate(day.date)">
            +{{ day.meetings.length - 3 }} więcej
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ══ WIDOK TYGODNIA ══ -->
  <div *ngIf="view === 'week'" style="flex:1;overflow:auto">
    <div class="week-grid">
      <!-- Header -->
      <div class="wh-time"></div>
      <div *ngFor="let day of weekDays" class="wh-day" [class.today]="day.isToday">
        <div class="wh-dayname">{{ DAY_SHORT[day.date.getDay()] }}</div>
        <div class="wh-daynum" [class.today-circle]="day.isToday">{{ day.date.getDate() }}</div>
      </div>
      <!-- Time slots -->
      <ng-container *ngFor="let h of hours">
        <div class="wt-hour">{{ h }}:00</div>
        <div *ngFor="let day of weekDays" class="wt-cell"
             [class.today-col]="day.isToday">
          <div *ngFor="let m of getMeetingsAtHour(day, h)" class="week-event"
               [class.lead-event]="m.source_type === 'lead'"
               [class.partner-event]="m.source_type === 'partner'"
               (click)="openMeeting(m)">
            <div class="we-time">{{ m.activity_at | date:'HH:mm' }}</div>
            <div class="we-title">{{ m.title }}</div>
            <div class="we-source">{{ m.source_name }}</div>
          </div>
        </div>
      </ng-container>
    </div>
  </div>

  <!-- ══ WIDOK DNIA ══ -->
  <div *ngIf="view === 'day'" style="flex:1;overflow:auto">
    <div class="day-view">
      <div *ngFor="let h of hours" class="day-slot">
        <div class="ds-hour">{{ h }}:00</div>
        <div class="ds-events">
          <div *ngFor="let m of getMeetingsOnDayAtHour(currentDate, h)" class="day-event"
               [class.lead-event]="m.source_type === 'lead'"
               [class.partner-event]="m.source_type === 'partner'"
               (click)="openMeeting(m)">
            <div class="de-header">
              <span class="de-time">{{ m.activity_at | date:'HH:mm' }}
                <span *ngIf="m.duration_min"> ({{ m.duration_min }} min)</span>
              </span>
              <span class="de-badge" [class.lead-badge]="m.source_type==='lead'" [class.partner-badge]="m.source_type==='partner'">
                {{ m.source_type === 'lead' ? 'Lead' : 'Partner' }}
              </span>
            </div>
            <div class="de-title">{{ m.title }}</div>
            <div class="de-source">{{ m.source_name }}
              <span *ngIf="m.assigned_to_name"> · {{ m.assigned_to_name }}</span>
            </div>
            <div *ngIf="m.meeting_location" class="de-meta">📍 {{ m.meeting_location }}</div>
            <div *ngIf="m.participants" class="de-meta">👥 {{ m.participants }}</div>
          </div>
          <div class="ds-line"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- ══ WIDOK ZADANIA ══ -->
  <div *ngIf="view === 'tasks'" style="flex:1;overflow-y:auto;padding:16px">
    <div *ngIf="tasksLoading" style="text-align:center;padding:30px;color:#9ca3af;font-size:13px">Ładowanie zadań…</div>
    <div *ngIf="!tasksLoading && !activities.length" style="text-align:center;padding:40px;color:#9ca3af;font-size:13px">Brak zadań do wyświetlenia.</div>
    <div *ngFor="let t of activities" class="task-item"
         [class.task-today]="t.activity_at && isTaskToday(t.activity_at)"
         [class.task-overdue]="t.status !== 'closed' && t.activity_at && isTaskOverdue(t.activity_at)"
         [class.task-closed]="t.status === 'closed'"
         [class.task-readonly]="isTaskReadOnly(t)"
         (click)="openTask(t)" style="cursor:pointer">
      <div style="display:flex;align-items:stretch;gap:0">
        <!-- Kolumna daty (lewa) -->
        <div class="task-date-col">
          <ng-container *ngIf="t.activity_at; else noDate">
            <span class="task-date-day">{{t.activity_at | date:'d'}}</span>
            <span class="task-date-mon">{{t.activity_at | date:'MMM'}}</span>
            <span class="task-date-time">{{t.activity_at | date:'HH:mm'}}</span>
          </ng-container>
          <ng-template #noDate><span class="task-date-none">brak daty</span></ng-template>
        </div>
        <!-- Treść zadania -->
        <div style="flex:1;min-width:0;padding-left:12px">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span class="task-type-icon">{{taskIcon(t.type)}}</span>
            <strong style="font-size:13px;color:#18181b">{{t.title}}</strong>
            <span class="task-status-badge task-st-{{t.status}}">{{taskStatusLabel(t.status)}}</span>
            <span class="task-source-badge task-src-{{t.source_type}}">{{t.source_type === 'lead' ? 'Lead' : 'Partner'}}</span>
            <span *ngIf="isTaskReadOnly(t)" style="font-size:9px;color:#9ca3af;font-style:italic">tylko odczyt</span>
          </div>
          <div style="font-size:11px;color:#9ca3af;margin-top:2px">
            <a *ngIf="t.source_type === 'lead'"    [routerLink]="['/crm/leads', t.source_id]"    class="task-link" (click)="$event.stopPropagation()">{{t.source_name}}</a>
            <a *ngIf="t.source_type === 'partner'" [routerLink]="['/crm/partners', t.source_id]" class="task-link" (click)="$event.stopPropagation()">{{t.source_name}}</a>
            <span *ngIf="t.act_assigned_to_name"> → {{t.act_assigned_to_name}}</span>
            <span *ngIf="!t.act_assigned_to_name && t.assigned_to_name"> → {{t.assigned_to_name}}</span>
          </div>
          <div *ngIf="t.body" style="font-size:12px;color:#6b7280;margin-top:3px;white-space:pre-line">{{t.body}}</div>
          <div *ngIf="t.close_comment" style="font-size:11px;color:#6b7280;font-style:italic;margin-top:2px">💬 {{t.close_comment}}</div>
          <!-- Formularz zamknięcia -->
          <div *ngIf="closingTaskId === t.id" style="margin-top:8px;display:flex;flex-direction:column;gap:6px" (click)="$event.stopPropagation()">
            <textarea [(ngModel)]="taskCloseComment" placeholder="Komentarz zamknięcia *" rows="2"
                      style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:12px;font-family:inherit;resize:vertical;width:100%;box-sizing:border-box"></textarea>
            <div style="display:flex;gap:6px;justify-content:flex-end">
              <button class="nav-btn" style="font-size:12px" (click)="cancelCloseTask()">Anuluj</button>
              <button class="nav-btn" style="font-size:12px;background:#f97316;color:white;border-color:#f97316" (click)="confirmCloseTask(t)" [disabled]="!taskCloseComment.trim() || saving">{{saving ? '…' : 'Zamknij'}}</button>
            </div>
          </div>
        </div>
        <!-- Akcje -->
        <div *ngIf="closingTaskId !== t.id && t.status !== 'closed' && !isTaskReadOnly(t)" style="display:flex;gap:4px;flex-shrink:0;align-items:flex-start;padding-left:8px" (click)="$event.stopPropagation()">
          <button class="nav-btn" style="font-size:11px;padding:3px 8px" (click)="startCloseTask(t)">✓ Zamknij</button>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ══ PANEL SZCZEGÓŁÓW SPOTKANIA ══ -->
<div class="detail-overlay" *ngIf="selectedMeeting" (click)="closeMeeting()">
  <div class="detail-panel" (click)="$event.stopPropagation()">
    <div class="dp-header">
      <span class="dp-badge" [class.lead-badge]="selectedMeeting.source_type==='lead'" [class.partner-badge]="selectedMeeting.source_type==='partner'">
        {{ selectedMeeting.source_type === 'lead' ? '🎯 Lead' : '🤝 Partner' }}
      </span>
      <span style="flex:1"></span>
      <button class="dp-edit-btn" (click)="startEdit()" *ngIf="!editMode && canEdit(selectedMeeting)">✏️ Edytuj</button>
      <button class="dp-close" (click)="closeMeeting()">✕</button>
    </div>

    <!-- Tryb widoku -->
    <div *ngIf="!editMode" class="dp-body">
      <div class="dp-title">{{ selectedMeeting.title }}</div>
      <div class="dp-source">
        <a *ngIf="selectedMeeting.source_type === 'lead'"    [routerLink]="['/crm/leads',    selectedMeeting.source_id]" class="dp-link">{{ selectedMeeting.source_name }}</a>
        <a *ngIf="selectedMeeting.source_type === 'partner'" [routerLink]="['/crm/partners', selectedMeeting.source_id]" class="dp-link">{{ selectedMeeting.source_name }}</a>
      </div>
      <div class="dp-row"><span class="dp-lbl">📅 Data i czas</span><span>{{ selectedMeeting.activity_at | date:'dd.MM.yyyy HH:mm' }}</span></div>
      <div class="dp-row" *ngIf="selectedMeeting.duration_min"><span class="dp-lbl">⏱ Czas trwania</span><span>{{ selectedMeeting.duration_min }} min</span></div>
      <div class="dp-row" *ngIf="selectedMeeting.meeting_location"><span class="dp-lbl">📍 Miejsce</span><span>{{ selectedMeeting.meeting_location }}</span></div>
      <div class="dp-row" *ngIf="selectedMeeting.participants"><span class="dp-lbl">👥 Uczestnicy</span><span style="word-break:break-all">{{ selectedMeeting.participants }}</span></div>
      <div class="dp-row" *ngIf="selectedMeeting.body"><span class="dp-lbl">📝 Notatki</span><span>{{ selectedMeeting.body }}</span></div>
      <div class="dp-row"><span class="dp-lbl">👤 Dodał</span><span>{{ selectedMeeting.created_by_name }}</span></div>
      <div class="dp-row" *ngIf="selectedMeeting.assigned_to_name"><span class="dp-lbl">🙋 Handlowiec</span><span>{{ selectedMeeting.assigned_to_name }}</span></div>
    </div>

    <!-- Tryb edycji -->
    <div *ngIf="editMode" class="dp-body">
      <div class="ef-row">
        <label class="ef-lbl">Tytuł *</label>
        <input class="ef-input" [(ngModel)]="editForm.title">
      </div>
      <div class="ef-row">
        <label class="ef-lbl">Data i czas</label>
        <input class="ef-input" type="datetime-local" [(ngModel)]="editForm.activity_at">
      </div>
      <div class="ef-row">
        <label class="ef-lbl">Czas trwania (min)</label>
        <input class="ef-input" type="number" min="0" [(ngModel)]="editForm.duration_min" placeholder="60">
      </div>
      <div class="ef-row">
        <label class="ef-lbl">Miejsce</label>
        <input class="ef-input" [(ngModel)]="editForm.meeting_location" placeholder="Sala A, Warszawa">
      </div>
      <div class="ef-row">
        <label class="ef-lbl">Uczestnicy</label>
        <input class="ef-input" [(ngModel)]="editForm.participants" placeholder="email1@firma.pl, email2@firma.pl">
      </div>
      <div class="ef-row">
        <label class="ef-lbl">Notatki</label>
        <textarea class="ef-input" rows="3" [(ngModel)]="editForm.body" style="resize:vertical"></textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="dp-btn-g" (click)="editMode = false">Anuluj</button>
        <button class="dp-btn-p" (click)="saveEdit()" [disabled]="saving">{{ saving ? '…' : 'Zapisz' }}</button>
      </div>
    </div>
  </div>
</div>

<!-- ══ PANEL SZCZEGÓŁÓW ZADANIA ══ -->
<div class="detail-overlay" *ngIf="selectedTask" (click)="closeTask()">
  <div class="detail-panel" (click)="$event.stopPropagation()">
    <div class="dp-header">
      <span class="task-type-icon">{{taskIcon(selectedTask.type)}}</span>
      <span class="task-status-badge task-st-{{selectedTask.status}}" style="margin-left:4px">{{taskStatusLabel(selectedTask.status)}}</span>
      <span class="task-source-badge task-src-{{selectedTask.source_type}}" style="margin-left:4px">{{selectedTask.source_type === 'lead' ? 'Lead' : 'Partner'}}</span>
      <span style="flex:1"></span>
      <button class="dp-edit-btn" (click)="startEditTask()" *ngIf="!taskEditMode && canEditTask(selectedTask)">✏️ Edytuj</button>
      <button class="dp-close" (click)="closeTask()">✕</button>
    </div>

    <!-- Widok -->
    <div *ngIf="!taskEditMode" class="dp-body">
      <div class="dp-title">{{selectedTask.title}}</div>
      <div class="dp-source">
        <a *ngIf="selectedTask.source_type === 'lead'"    [routerLink]="['/crm/leads',    selectedTask.source_id]" class="dp-link" (click)="closeTask()">{{selectedTask.source_name}}</a>
        <a *ngIf="selectedTask.source_type === 'partner'" [routerLink]="['/crm/partners', selectedTask.source_id]" class="dp-link" (click)="closeTask()">{{selectedTask.source_name}}</a>
      </div>
      <div class="dp-row" *ngIf="selectedTask.activity_at"><span class="dp-lbl">📅 Data i czas</span><span>{{selectedTask.activity_at | date:'dd.MM.yyyy HH:mm'}}</span></div>
      <div class="dp-row" *ngIf="selectedTask.body"><span class="dp-lbl">📝 Opis</span><span style="white-space:pre-line">{{selectedTask.body}}</span></div>
      <div class="dp-row" *ngIf="selectedTask.created_by_name"><span class="dp-lbl">👤 Dodał</span><span>{{selectedTask.created_by_name}}</span></div>
      <div class="dp-row" *ngIf="selectedTask.act_assigned_to_name || selectedTask.assigned_to_name"><span class="dp-lbl">🙋 Przypisano do</span><span>{{selectedTask.act_assigned_to_name || selectedTask.assigned_to_name}}</span></div>
      <div class="dp-row" *ngIf="selectedTask.close_comment"><span class="dp-lbl">💬 Komentarz</span><span style="font-style:italic">{{selectedTask.close_comment}}</span></div>
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end" *ngIf="selectedTask.status !== 'closed' && canEditTask(selectedTask)">
        <button class="dp-btn-p" (click)="startCloseTaskFromModal()">✓ Zamknij zadanie</button>
      </div>
      <!-- Inline close form in modal -->
      <div *ngIf="closingTaskId === selectedTask.id" style="margin-top:10px;display:flex;flex-direction:column;gap:6px">
        <textarea [(ngModel)]="taskCloseComment" placeholder="Komentarz zamknięcia *" rows="3"
                  style="border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;font-family:inherit;resize:vertical;width:100%;box-sizing:border-box"></textarea>
        <div style="display:flex;gap:6px;justify-content:flex-end">
          <button class="dp-btn-g" (click)="cancelCloseTask()">Anuluj</button>
          <button class="dp-btn-p" (click)="confirmCloseTask(selectedTask)" [disabled]="!taskCloseComment.trim() || saving">{{saving ? '…' : 'Zamknij'}}</button>
        </div>
      </div>
    </div>

    <!-- Edycja -->
    <div *ngIf="taskEditMode" class="dp-body">
      <div class="ef-row">
        <label class="ef-lbl">Tytuł *</label>
        <input class="ef-input" [(ngModel)]="taskEditForm.title">
      </div>
      <div class="ef-row">
        <label class="ef-lbl">Data i czas</label>
        <input class="ef-input" type="datetime-local" [(ngModel)]="taskEditForm.activity_at">
      </div>
      <div class="ef-row">
        <label class="ef-lbl">Opis</label>
        <textarea class="ef-input" rows="3" [(ngModel)]="taskEditForm.body" style="resize:vertical"></textarea>
      </div>
      <div class="ef-row" *ngIf="crmUsers.length > 0">
        <label class="ef-lbl">Przypisz do</label>
        <select class="ef-input" [(ngModel)]="taskEditForm.assigned_to">
          <option value="">— bez przypisania —</option>
          <option *ngFor="let u of crmUsers" [value]="u.id">{{u.display_name}}</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="dp-btn-g" (click)="taskEditMode = false">Anuluj</button>
        <button class="dp-btn-p" (click)="saveEditTask()" [disabled]="saving">{{saving ? '…' : 'Zapisz'}}</button>
      </div>
    </div>
  </div>
</div>
  `,
  styles: [`
    :host { display:flex;flex-direction:column;height:100%;overflow:hidden; }
    .ctl { background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:5px 10px;font-size:12px;outline:none;cursor:pointer;font-family:inherit }
    .ctl:focus { border-color:#f97316 }
    .nav-btn { background:white;border:1px solid #e4e4e7;border-radius:8px;padding:5px 10px;font-size:15px;cursor:pointer;transition:background .1s }
    .nav-btn:hover { background:#f9fafb }
    .view-switch { display:flex;background:#f4f4f5;border-radius:8px;padding:2px;gap:2px }
    .view-switch button { background:none;border:none;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:500;color:#71717a;cursor:pointer;font-family:inherit }
    .view-switch button.active { background:white;color:#f97316;font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,.08) }

    /* Month */
    .month-grid { display:grid;grid-template-columns:repeat(7,1fr);border-left:1px solid #e4e4e7;border-top:1px solid #e4e4e7 }
    .month-dayname { padding:6px;font-size:11px;font-weight:700;text-transform:uppercase;color:#a1a1aa;text-align:center;border-right:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;background:#fafafa }
    .month-cell { min-height:100px;padding:6px;border-right:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;background:white;vertical-align:top }
    .month-cell.other-month { background:#fafafa }
    .month-cell.today { background:#fff7ed }
    .day-num { font-size:12px;font-weight:700;color:#18181b;margin-bottom:4px }
    .month-cell.today .day-num { width:22px;height:22px;background:#f97316;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center }
    .month-cell.other-month .day-num { color:#d1d5db }
    .day-events { display:flex;flex-direction:column;gap:2px }
    .event-chip { display:flex;gap:4px;align-items:center;border-radius:4px;padding:2px 5px;font-size:10px;cursor:pointer;overflow:hidden }
    .lead-chip { background:#eff6ff;color:#1d4ed8 }
    .partner-chip { background:#fff7ed;color:#c2410c }
    .event-chip:hover { opacity:.8 }
    .event-time { font-weight:700;flex-shrink:0 }
    .event-title { overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
    .event-more { font-size:10px;color:#a1a1aa;cursor:pointer;padding:1px 4px }
    .event-more:hover { color:#f97316 }

    /* Week */
    .week-grid { display:grid;grid-template-columns:50px repeat(7,1fr);border-left:1px solid #e4e4e7 }
    .wh-time { background:#fafafa;border-right:1px solid #e4e4e7;border-bottom:2px solid #e4e4e7 }
    .wh-day { padding:6px;text-align:center;border-right:1px solid #e4e4e7;border-bottom:2px solid #e4e4e7;background:#fafafa }
    .wh-day.today { background:#fff7ed }
    .wh-dayname { font-size:10px;font-weight:700;color:#a1a1aa;text-transform:uppercase }
    .wh-daynum { font-size:18px;font-weight:700;color:#18181b;margin-top:2px }
    .today-circle { width:32px;height:32px;background:#f97316;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto;font-size:15px }
    .wt-hour { padding:8px 4px;font-size:10px;color:#a1a1aa;text-align:right;border-right:1px solid #e4e4e7;border-bottom:1px solid #f4f4f5;min-height:60px;background:#fafafa }
    .wt-cell { border-right:1px solid #e4e4e7;border-bottom:1px solid #f4f4f5;min-height:60px;padding:2px;position:relative }
    .wt-cell.today-col { background:#fffbf5 }
    .week-event { border-radius:6px;padding:4px 7px;margin-bottom:2px;cursor:pointer;font-size:11px }
    .lead-event { background:#eff6ff;border-left:3px solid #3b82f6 }
    .partner-event { background:#fff7ed;border-left:3px solid #f97316 }
    .week-event:hover { opacity:.85 }
    .we-time { font-weight:700;font-size:10px }
    .we-title { font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
    .we-source { font-size:10px;color:#71717a }

    /* Day */
    .day-view { display:flex;flex-direction:column }
    .day-slot { display:grid;grid-template-columns:60px 1fr;min-height:60px;border-bottom:1px solid #f4f4f5 }
    .ds-hour { padding:8px;font-size:11px;color:#a1a1aa;text-align:right;border-right:1px solid #e4e4e7;background:#fafafa }
    .ds-events { padding:4px 8px;display:flex;flex-direction:column;gap:4px;position:relative }
    .ds-line { position:absolute;bottom:0;left:0;right:0;height:1px;background:#f4f4f5 }
    .day-event { border-radius:8px;padding:8px 12px;cursor:pointer }
    .day-event.lead-event { background:#eff6ff;border-left:4px solid #3b82f6 }
    .day-event.partner-event { background:#fff7ed;border-left:4px solid #f97316 }
    .day-event:hover { opacity:.85 }
    .de-header { display:flex;align-items:center;justify-content:space-between;margin-bottom:2px }
    .de-time { font-size:11px;font-weight:700;color:#374151 }
    .de-badge { font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px }
    .lead-badge { background:#dbeafe;color:#1d4ed8 }
    .partner-badge { background:#ffedd5;color:#c2410c }
    .de-title { font-size:13px;font-weight:700;color:#18181b }
    .de-source { font-size:11px;color:#71717a;margin-top:1px }
    .de-meta { font-size:11px;color:#6b7280;margin-top:3px }

    /* Detail panel */
    .detail-overlay { position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px }
    .detail-panel { background:white;border-radius:14px;width:min(480px,100%);max-height:85vh;overflow-y:auto;box-shadow:0 12px 32px rgba(0,0,0,.15);display:flex;flex-direction:column }
    .dp-header { padding:16px 20px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;gap:10px;position:sticky;top:0;background:white;z-index:1 }
    .dp-badge { font-size:12px;font-weight:700;padding:3px 10px;border-radius:10px }
    .dp-close { background:none;border:none;font-size:18px;color:#9ca3af;cursor:pointer;margin-left:4px }
    .dp-edit-btn { background:#fff7ed;border:1px solid #fed7aa;color:#c2410c;border-radius:8px;padding:4px 12px;font-size:12px;cursor:pointer;font-weight:600 }
    .dp-body { padding:18px 20px;display:flex;flex-direction:column;gap:10px }
    .dp-title { font-family:'Sora',sans-serif;font-size:16px;font-weight:700;color:#18181b }
    .dp-source { font-size:13px;color:#f97316 }
    .dp-link { color:#f97316;font-weight:600;text-decoration:none }
    .dp-link:hover { text-decoration:underline }
    .dp-row { display:flex;gap:12px;font-size:13px;align-items:flex-start }
    .dp-lbl { color:#9ca3af;font-size:12px;min-width:100px;flex-shrink:0 }
    /* Edit form */
    .ef-row { display:flex;flex-direction:column;gap:4px }
    .ef-lbl { font-size:11px;font-weight:600;color:#6b7280 }
    .ef-input { border:1px solid #d1d5db;border-radius:7px;padding:7px 10px;font-size:13px;outline:none;font-family:inherit;background:white }
    .ef-input:focus { border-color:#f97316 }
    .dp-btn-p { background:#f97316;color:white;border:none;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer }
    .dp-btn-p:disabled { opacity:.6 }
    .dp-btn-g { background:white;color:#374151;border:1px solid #d1d5db;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer }

    /* Tasks view */
    .task-item { border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-bottom:8px;background:white;border-left:4px solid #e5e7eb;transition:box-shadow .15s; }
    .task-item:hover { box-shadow:0 2px 8px rgba(0,0,0,.07); }
    .task-item.task-today { background:#eff6ff;border-left-color:#3b82f6; }
    .task-item.task-overdue { background:#fef2f2;border-left-color:#dc2626; }
    .task-item.task-closed { opacity:.6;background:#f9fafb; }
    .task-item.task-readonly { opacity:.55;background:#f9fafb;cursor:default; }
    .task-date-col { display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:52px;padding-right:12px;border-right:1px solid #e5e7eb;flex-shrink:0;text-align:center; }
    .task-date-day { font-size:22px;font-weight:800;color:#18181b;line-height:1; }
    .task-date-mon { font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-top:1px; }
    .task-date-time { font-size:12px;font-weight:700;color:#f97316;margin-top:4px; }
    .task-date-none { font-size:10px;color:#d1d5db;font-style:italic;text-align:center; }
    .task-status-badge { font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:.04em; }
    .task-st-new { background:#f3f4f6;color:#6b7280; }
    .task-st-open { background:#dbeafe;color:#1d4ed8; }
    .task-st-closed { background:#d1fae5;color:#065f46; }
    .task-source-badge { font-size:9px;font-weight:600;padding:1px 6px;border-radius:4px; }
    .task-src-lead { background:#fff7ed;color:#c2410c; }
    .task-src-partner { background:#f0fdf4;color:#166534; }
    .task-link { color:#f97316;font-weight:600;text-decoration:none; }
    .task-link:hover { text-decoration:underline; }
  `],
})
export class CrmCalendarComponent implements OnInit {
  private api  = inject(CrmApiService);
  private auth = inject(AuthService);
  private cdr  = inject(ChangeDetectorRef);
  private zone = inject(NgZone);

  loading  = false;
  saving   = false;
  view: ViewMode = 'month';
  currentDate = new Date();
  filterRep = '';
  crmUsers: CrmUser[] = [];
  crmGroups: CrmGroup[] = [];
  meetings: CalendarMeeting[] = [];

  // Zadania
  activities: ActivityTask[] = [];
  tasksLoading = false;
  showClosedTasks = false;
  filterActivityType = '';
  closingTaskId: number | null = null;
  taskCloseComment = '';

  selectedMeeting: CalendarMeeting | null = null;
  editMode = false;
  editForm: any = {};

  selectedTask: ActivityTask | null = null;
  taskEditMode = false;
  taskEditForm: any = {};

  readonly DAY_SHORT = ['Nd','Pn','Wt','Śr','Cz','Pt','Sb'];
  readonly dayNames  = ['Pn','Wt','Śr','Cz','Pt','Sb','Nd'];
  readonly hours     = Array.from({ length: 16 }, (_, i) => i + 7); // 7–22

  get isManager() { const u = this.auth.user(); return u?.is_admin || u?.crm_role === 'sales_manager'; }

  get periodLabel(): string {
    const d = this.currentDate;
    if (this.view === 'day')
      return d.toLocaleDateString('pl-PL', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    if (this.view === 'week') {
      const start = this.weekStart(d);
      const end   = new Date(start); end.setDate(end.getDate() + 6);
      return `${start.getDate()} — ${end.getDate()} ${end.toLocaleDateString('pl-PL', { month:'long', year:'numeric' })}`;
    }
    return d.toLocaleDateString('pl-PL', { month:'long', year:'numeric' });
  }

  ngOnInit(): void {
    if (this.isManager) {
      this.api.getCrmUsers().subscribe({ next: u => { this.crmUsers = u; this.cdr.markForCheck(); }, error: () => {} });
      this.api.getCrmGroups().subscribe({ next: g => { this.crmGroups = g; this.cdr.markForCheck(); }, error: () => {} });
    }
    this.load();
  }

  load(): void {
    const { from, to } = this.getDateRange();
    this.loading = true;
    const p: any = { date_from: from, date_to: to };
    if (this.filterRep && this.isManager) p.assigned_to = this.filterRep;
    this.api.getCalendarMeetings(p).subscribe({
      next: m => { this.zone.run(() => { this.meetings = m; this.loading = false; this.cdr.markForCheck(); }); },
      error: () => { this.zone.run(() => { this.loading = false; this.cdr.markForCheck(); }); },
    });
  }

  private getDateRange(): { from: string; to: string } {
    const d = this.currentDate;
    if (this.view === 'day') {
      const s = this.fmt(d);
      return { from: s, to: s };
    }
    if (this.view === 'week') {
      const start = this.weekStart(d);
      const end   = new Date(start); end.setDate(end.getDate() + 6);
      return { from: this.fmt(start), to: this.fmt(end) };
    }
    // month — load full grid (prev/next month days included)
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { from: this.fmt(new Date(start.getFullYear(), start.getMonth(), start.getDate() - start.getDay() + 1)), to: this.fmt(new Date(end.getFullYear(), end.getMonth(), end.getDate() + (7 - end.getDay()))) };
  }

  // ── Navigation ────────────────────────────────────────────
  prev(): void {
    const d = new Date(this.currentDate);
    if (this.view === 'day')   d.setDate(d.getDate() - 1);
    if (this.view === 'week')  d.setDate(d.getDate() - 7);
    if (this.view === 'month') d.setMonth(d.getMonth() - 1);
    this.currentDate = d;
    this.load();
  }
  next(): void {
    const d = new Date(this.currentDate);
    if (this.view === 'day')   d.setDate(d.getDate() + 1);
    if (this.view === 'week')  d.setDate(d.getDate() + 7);
    if (this.view === 'month') d.setMonth(d.getMonth() + 1);
    this.currentDate = d;
    this.load();
  }
  today(): void { this.currentDate = new Date(); this.load(); }
  setView(v: ViewMode): void {
    this.view = v;
    if (v === 'tasks') { this.loadTasks(); } else { this.load(); }
  }

  loadTasks(): void {
    this.tasksLoading = true;
    this.cdr.markForCheck();
    const p: any = { include_closed: this.showClosedTasks };
    if (this.filterRep && this.isManager) {
      if (this.filterRep.startsWith('__group__')) {
        const groupId = this.filterRep.replace('__group__', '');
        const group = this.crmGroups.find(g => g.id === groupId);
        if (group && group.user_ids.length > 0) p.assigned_to = group.user_ids.join(',');
      } else {
        p.assigned_to = this.filterRep;
      }
    }
    if (this.filterActivityType) p.type = this.filterActivityType;
    this.api.getActivityTasks(p).subscribe({
      next: tasks => this.zone.run(() => {
        this.activities = tasks;
        this.tasksLoading = false;
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => { this.tasksLoading = false; this.cdr.markForCheck(); }),
    });
  }

  jumpToDate(d: Date): void { this.currentDate = new Date(d); }

  startCloseTask(t: ActivityTask): void {
    this.closingTaskId = t.id;
    this.taskCloseComment = t.close_comment || '';
  }

  cancelCloseTask(): void {
    this.closingTaskId = null;
    this.taskCloseComment = '';
  }

  confirmCloseTask(t: ActivityTask): void {
    if (!this.taskCloseComment.trim()) return;
    this.saving = true;
    this.cdr.markForCheck();
    const updateCall: Observable<any> = t.source_type === 'lead'
      ? this.api.updateLeadActivity(t.source_id, t.id, { status: 'closed', close_comment: this.taskCloseComment })
      : this.api.updatePartnerActivity(t.source_id, t.id, { status: 'closed', close_comment: this.taskCloseComment });
    updateCall.subscribe({
      next: () => this.zone.run(() => {
        this.activities = this.activities.map(a => a.id === t.id && a.source_type === t.source_type
          ? { ...a, status: 'closed' as const, close_comment: this.taskCloseComment }
          : a
        );
        if (this.selectedTask?.id === t.id && this.selectedTask?.source_type === t.source_type) {
          this.selectedTask = { ...this.selectedTask, status: 'closed', close_comment: this.taskCloseComment };
        }
        this.closingTaskId    = null;
        this.taskCloseComment = '';
        this.saving = false;
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => { this.saving = false; this.cdr.markForCheck(); }),
    });
  }

  taskIcon(type: string): string {
    const icons: Record<string, string> = { call:'📞', email:'📧', meeting:'🤝', note:'📝', doc_sent:'📄', training:'🎓', qbr:'📊', opportunity:'💡' };
    return icons[type] || '📌';
  }

  taskStatusLabel(s: string): string {
    return s === 'closed' ? 'zamknięta' : s === 'open' ? 'otwarta' : 'nowa';
  }

  isTaskToday(activityAt: string): boolean {
    const d = new Date(activityAt);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }

  isTaskOverdue(activityAt: string): boolean {
    return new Date(activityAt) < new Date(new Date().toDateString());
  }

  openTask(t: ActivityTask): void {
    this.selectedTask = t;
    this.taskEditMode = false;
    this.closingTaskId = null;
    this.taskCloseComment = '';
    this.cdr.markForCheck();
  }

  closeTask(): void {
    this.selectedTask = null;
    this.taskEditMode = false;
    this.closingTaskId = null;
    this.taskCloseComment = '';
    this.cdr.markForCheck();
  }

  isTaskReadOnly(t: ActivityTask): boolean {
    const u = this.auth.user();
    if (!u) return true;
    if (u.is_admin) return false;
    if (t.created_by === u.id) return false;
    // Efektywny przypisany użytkownik aktywności
    const targetId = t.act_assigned_to_id || t.assigned_to_id;
    if (!targetId || targetId === u.id) return false;
    // Sprawdź uprawnienia do grupy CRM, do której należy ten user
    const group = this.crmGroups.find(g => g.user_ids.includes(targetId));
    if (!group) return false;
    const role = u.roles?.find(r => r.group_id === group.id);
    if (!role) return false;
    return role.access_level !== 'full';
  }

  canEditTask(t: ActivityTask): boolean {
    const u = this.auth.user();
    if (!u) return false;
    if (u.is_admin) return true;
    if (t.created_by === u.id) return true;
    return !this.isTaskReadOnly(t);
  }

  startEditTask(): void {
    if (!this.selectedTask) return;
    const t = this.selectedTask;
    this.taskEditForm = {
      title:       t.title,
      body:        t.body || '',
      activity_at: t.activity_at ? t.activity_at.substring(0, 16) : '',
      assigned_to: t.act_assigned_to_id || '',
    };
    if (!this.crmUsers.length) {
      this.api.getCrmUsers().subscribe({ next: u => { this.zone.run(() => { this.crmUsers = u; this.cdr.markForCheck(); }); }, error: () => {} });
    }
    this.taskEditMode = true;
  }

  saveEditTask(): void {
    if (!this.selectedTask || !this.taskEditForm.title) return;
    this.saving = true;
    const payload: any = {
      title:       this.taskEditForm.title,
      body:        this.taskEditForm.body || null,
      activity_at: this.taskEditForm.activity_at || null,
      assigned_to: this.taskEditForm.assigned_to || null,
    };
    const t = this.selectedTask;
    const obs: Observable<any> = t.source_type === 'lead'
      ? this.api.updateLeadActivity(t.source_id, t.id, payload)
      : this.api.updatePartnerActivity(t.source_id, t.id, payload);
    obs.subscribe({
      next: (updated: any) => this.zone.run(() => {
        this.activities = this.activities.map(a =>
          a.id === t.id && a.source_type === t.source_type ? { ...a, ...updated } : a
        );
        this.selectedTask = { ...t, ...updated };
        this.taskEditMode = false;
        this.saving = false;
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => { this.saving = false; this.cdr.markForCheck(); }),
    });
  }

  startCloseTaskFromModal(): void {
    if (!this.selectedTask) return;
    this.closingTaskId = this.selectedTask.id;
    this.taskCloseComment = this.selectedTask.close_comment || '';
    this.cdr.markForCheck();
  }

  onFilterRepChange(): void {
    if (this.view === 'tasks') this.loadTasks(); else this.load();
  }

  // ── Month grid ────────────────────────────────────────────
  get monthDays(): CalendarDay[] {
    const d = this.currentDate;
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const today = new Date(); today.setHours(0,0,0,0);
    // Start from Monday
    let start = new Date(first);
    const dow = (first.getDay() + 6) % 7; // 0=Mon
    start.setDate(start.getDate() - dow);

    const days: CalendarDay[] = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(start); date.setDate(start.getDate() + i);
      const dt = new Date(date); dt.setHours(0,0,0,0);
      days.push({
        date,
        isCurrentMonth: date.getMonth() === d.getMonth(),
        isToday: dt.getTime() === today.getTime(),
        meetings: this.meetingsOnDay(date),
      });
    }
    return days;
  }

  // ── Week grid ─────────────────────────────────────────────
  get weekDays(): CalendarDay[] {
    const start = this.weekStart(this.currentDate);
    const today = new Date(); today.setHours(0,0,0,0);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(start); date.setDate(start.getDate() + i);
      const dt = new Date(date); dt.setHours(0,0,0,0);
      return { date, isCurrentMonth: true, isToday: dt.getTime() === today.getTime(), meetings: this.meetingsOnDay(date) };
    });
  }

  getMeetingsAtHour(day: CalendarDay, h: number): CalendarMeeting[] {
    return day.meetings.filter(m => new Date(m.activity_at).getHours() === h);
  }
  getMeetingsOnDayAtHour(date: Date, h: number): CalendarMeeting[] {
    return this.meetingsOnDay(date).filter(m => new Date(m.activity_at).getHours() === h);
  }
  private meetingsOnDay(date: Date): CalendarMeeting[] {
    const d = this.localDateStr(date);
    return this.meetings.filter(m => this.localDateStr(new Date(m.activity_at)) === d)
      .sort((a, b) => a.activity_at.localeCompare(b.activity_at));
  }

  // Returns YYYY-MM-DD in local timezone (not UTC)
  private localDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ── Detail / Edit ─────────────────────────────────────────
  openMeeting(m: CalendarMeeting): void {
    this.selectedMeeting = m;
    this.editMode = false;
    this.cdr.markForCheck();
  }
  closeMeeting(): void { this.selectedMeeting = null; this.editMode = false; this.cdr.markForCheck(); }

  canEdit(m: CalendarMeeting): boolean {
    const u = this.auth.user();
    return !!(u?.is_admin || u?.crm_role === 'sales_manager' || m.created_by === u?.id);
  }

  startEdit(): void {
    if (!this.selectedMeeting) return;
    const m = this.selectedMeeting;
    this.editForm = {
      title:            m.title,
      body:             m.body || '',
      activity_at:      m.activity_at ? m.activity_at.substring(0, 16) : '',
      duration_min:     m.duration_min ?? '',
      meeting_location: m.meeting_location || '',
      participants:     m.participants || '',
    };
    this.editMode = true;
  }

  saveEdit(): void {
    if (!this.selectedMeeting || !this.editForm.title) return;
    this.saving = true;
    const payload: any = {
      title:            this.editForm.title,
      body:             this.editForm.body || null,
      activity_at:      this.editForm.activity_at || undefined,
      duration_min:     this.editForm.duration_min !== '' ? +this.editForm.duration_min : null,
      meeting_location: this.editForm.meeting_location || null,
      participants:     this.editForm.participants || null,
    };
    const m = this.selectedMeeting;
    const obs: Observable<any> = m.source_type === 'lead'
      ? this.api.updateLeadActivity(m.source_id, m.id, payload)
      : this.api.updatePartnerActivity(m.source_id, m.id, payload);

    obs.subscribe({
      next: (updated: any) => {
        this.zone.run(() => {
          // Update local meetings array
          const idx = this.meetings.findIndex(x => x.id === m.id && x.source_type === m.source_type);
          if (idx >= 0) this.meetings[idx] = { ...this.meetings[idx], ...payload };
          this.selectedMeeting = { ...m, ...payload };
          this.editMode = false;
          this.saving   = false;
          this.cdr.markForCheck();
        });
      },
      error: () => { this.zone.run(() => { this.saving = false; this.cdr.markForCheck(); }); },
    });
  }

  // ── Helpers ───────────────────────────────────────────────
  private weekStart(d: Date): Date {
    const s = new Date(d);
    const dow = (d.getDay() + 6) % 7; // Mon=0
    s.setDate(d.getDate() - dow);
    s.setHours(0, 0, 0, 0);
    return s;
  }
  // Returns YYYY-MM-DD in local timezone for API queries
  private fmt(d: Date): string {
    return this.localDateStr(d);
  }
}
