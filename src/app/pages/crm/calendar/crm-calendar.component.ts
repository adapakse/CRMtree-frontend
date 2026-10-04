// src/app/pages/crm/calendar/crm-calendar.component.ts
import { Observable } from 'rxjs';
import { Component, OnInit, inject, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { CrmApiService, CalendarMeeting, ActivityTask, CrmUser, CrmGroup } from '../../../core/services/crm-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { AddToCalendarComponent } from '../../../shared/components/add-to-calendar/add-to-calendar.component';
import { CalendarEntry, activityCalendarEntry } from '../../../shared/utils/calendar-export.util';
import { ProjectTaskNavigationService } from '../../../core/services/project-task-navigation.service';
import { LocaleService } from '../../../core/i18n/locale.service';

type ViewMode = 'month' | 'week' | 'day' | 'tasks';

const KNOWN_ACTIVITY_TYPES = ['task', 'call', 'email', 'meeting', 'note', 'doc_sent', 'training', 'qbr', 'opportunity'];
const KNOWN_PRIORITIES = ['asap', 'important', 'medium', 'low'];

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  meetings: CalendarMeeting[];
}

@Component({
  selector: 'wt-crm-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, AddToCalendarComponent, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('crm')],
  template: `
<ng-container *transloco="let t; prefix: 'crm'">
<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">

<!-- TOPBAR -->
<div style="height:60px;background:white;border-bottom:1px solid #e4e4e7;display:flex;align-items:center;gap:10px;padding:0 20px;flex-shrink:0">
  <span style="font-family:'Sora',sans-serif;font-size:17px;font-weight:700;color:#18181b">{{ t('calendar.title') }}</span>
  <span style="flex:1"></span>

  <!-- Filtr handlowca (manager) -->
  <select class="ctl" *ngIf="isManager" [(ngModel)]="filterRep" (ngModelChange)="onFilterRepChange()">
    <option value="">{{ t('calendar.filters.allReps') }}</option>
    <optgroup [label]="'── ' + t('calendar.filters.repsGroup') + ' ──'" *ngIf="crmUsers.length > 0">
      <option *ngFor="let u of crmUsers" [value]="u.id">{{ u.display_name }}</option>
    </optgroup>
    <optgroup [label]="'── ' + t('calendar.filters.groupsGroup') + ' ──'" *ngIf="crmGroups.length > 0">
      <option *ngFor="let g of crmGroups" [value]="'__group__' + g.id">📂 {{ g.name }}</option>
    </optgroup>
  </select>

  <!-- Filtr typu aktywności (zadania) -->
  <select class="ctl" *ngIf="view === 'tasks'" [(ngModel)]="filterActivityType" (ngModelChange)="loadTasks()">
    <option value="">{{ t('calendar.filters.allTypes') }}</option>
    <option value="task">{{ t('labels.activityTypes.task') }}</option>
    <option value="call">{{ t('labels.activityTypes.call') }}</option>
    <option value="meeting">{{ t('labels.activityTypes.meeting') }}</option>
    <option value="note">{{ t('labels.activityTypes.note') }}</option>
    <option value="doc_sent">{{ t('labels.activityTypes.doc_sent') }}</option>
    <option value="training">{{ t('labels.activityTypes.training') }}</option>
    <option value="qbr">{{ t('labels.activityTypes.qbr') }}</option>
    <option value="opportunity">{{ t('labels.activityTypes.opportunity') }}</option>
  </select>

  <!-- Filtr priorytetu (zadania) -->
  <select class="ctl" *ngIf="view === 'tasks'" [(ngModel)]="filterPriority" (ngModelChange)="loadTasks()">
    <option value="">{{ t('calendar.filters.allPriorities') }}</option>
    <option value="asap">{{ t('labels.priorities.asap') }}</option>
    <option value="important">{{ t('labels.priorities.important') }}</option>
    <option value="medium">{{ t('labels.priorities.medium') }}</option>
    <option value="low">{{ t('labels.priorities.low') }}</option>
  </select>

  <!-- Pokaż zamknięte (zadania) -->
  <label *ngIf="view === 'tasks'" style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;color:#374151">
    <input type="checkbox" [(ngModel)]="showClosedTasks" (ngModelChange)="loadTasks()">
    {{ t('calendar.filters.showClosed') }}
  </label>
  <!-- Pokaż bez daty (zadania) -->
  <label *ngIf="view === 'tasks'" style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;color:#374151">
    <input type="checkbox" [(ngModel)]="showNoDateTasks" (ngModelChange)="loadTasks()">
    {{ t('calendar.filters.showNoDate') }}
  </label>

  <!-- Nawigacja (tylko dla widoków kalendarza) -->
  <ng-container *ngIf="view !== 'tasks'">
    <button class="nav-btn" (click)="prev()">‹</button>
    <span style="font-family:'Sora',sans-serif;font-weight:700;font-size:15px;min-width:200px;text-align:center">{{ periodLabel }}</span>
    <button class="nav-btn" (click)="next()">›</button>
    <button class="nav-btn" (click)="today()" style="font-size:12px;padding:5px 12px">{{ t('calendar.nav.today') }}</button>
  </ng-container>

  <!-- Przełącznik widoku -->
  <div class="view-switch">
    <button [class.active]="view === 'tasks'" [class.tasks-btn]="view !== 'tasks'" (click)="setView('tasks')">
      {{ t('calendar.views.tasks') }}<span *ngIf="myTasksCount > 0" class="tasks-badge">{{myTasksCount}}</span>
    </button>
    <button [class.active]="view === 'day'"   (click)="setView('day')">{{ t('calendar.views.day') }}</button>
    <button [class.active]="view === 'week'"  (click)="setView('week')">{{ t('calendar.views.week') }}</button>
    <button [class.active]="view === 'month'" (click)="setView('month')">{{ t('calendar.views.month') }}</button>
  </div>

  <button class="nav-btn" (click)="view === 'tasks' ? loadTasks() : load()" style="font-size:12px">↻</button>
</div>

<!-- CONTENT -->
<div style="flex:1;overflow:hidden;display:flex;flex-direction:column">
  <div *ngIf="loading" style="height:3px;background:#3BAA5D;flex-shrink:0"></div>

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
               [class.project-chip]="m.source_type === 'project'"
               (click)="openMeeting(m)">
            <span class="event-time">{{ m.all_day ? t('calendar.allDay') : (m.activity_at | date:'HH:mm') }}</span>
            <span class="event-title">{{ m.title }}</span>
          </div>
          <div *ngIf="day.meetings.length > 3" class="event-more"
               (click)="setView('day'); jumpToDate(day.date)">
            {{ t('calendar.month.more', { count: day.meetings.length - 3 }) }}
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
               [class.project-event]="m.source_type === 'project'"
               (click)="openMeeting(m)">
            <div class="we-time">{{ m.all_day ? t('calendar.allDay') : (m.activity_at | date:'HH:mm') }}</div>
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
               [class.project-event]="m.source_type === 'project'"
               (click)="openMeeting(m)">
            <div class="de-header">
              <span class="de-time">{{ m.all_day ? t('calendar.allDay') : (m.activity_at | date:'HH:mm') }}
                <span *ngIf="m.duration_min"> ({{ t('calendar.durationMinutes', { minutes: m.duration_min }) }})</span>
              </span>
              <span class="de-badge" [class.lead-badge]="m.source_type==='lead'" [class.partner-badge]="m.source_type==='partner'"
                    [class.project-badge]="m.source_type==='project'">
                {{ sourceLabel(m.source_type) }}
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

    <!-- Toolbar: masowe zamykanie -->
    <div *ngIf="!tasksLoading && activities.length" style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <span style="font-size:12px;color:#6b7280">{{ t('calendar.tasks.count', { count: activities.length }) }}</span>
      <span style="flex:1"></span>
      <ng-container *ngIf="!bulkSelectMode">
        <button class="nav-btn" style="font-size:11px;padding:4px 12px" (click)="enterBulkSelect()">
          ☑ {{ t('calendar.tasks.bulk.selectOverdue') }}
        </button>
      </ng-container>
      <ng-container *ngIf="bulkSelectMode">
        <span style="font-size:12px;color:#374151;font-weight:600">{{ t('calendar.tasks.bulk.selectedCount', { count: selectedTaskKeys.size }) }}</span>
        <button class="nav-btn" style="font-size:11px;padding:4px 14px;background:#3BAA5D;color:white;border-color:#3BAA5D"
                (click)="bulkClose()" [disabled]="!selectedTaskKeys.size || saving">
          {{saving ? '…' : t('calendar.tasks.bulk.closeSelected')}}
        </button>
        <button class="nav-btn" style="font-size:11px;padding:4px 12px" (click)="exitBulkSelect()">{{ 'actions.cancel' | transloco }}</button>
      </ng-container>
    </div>

    <div *ngIf="tasksLoading" style="text-align:center;padding:30px;color:#9ca3af;font-size:13px">{{ t('calendar.tasks.loading') }}</div>
    <div *ngIf="!tasksLoading && !activities.length" style="text-align:center;padding:40px;color:#9ca3af;font-size:13px">{{ t('calendar.tasks.empty') }}</div>

    <div *ngFor="let task of activities" class="task-item"
         [class.task-today]="task.activity_at && isTaskToday(task.activity_at)"
         [class.task-overdue]="task.status !== 'closed' && task.activity_at && isTaskOverdue(task.activity_at)"
         [class.task-closed]="task.status === 'closed'"
         [class.task-readonly]="task.source_type !== 'project' && isTaskReadOnly(task)"
         [class.task-expanded]="isExpanded(task)"
         (click)="onTaskClick(task)" style="cursor:pointer">

      <!-- Główny wiersz -->
      <div style="display:flex;align-items:stretch;gap:0">
        <!-- Checkbox (tryb masowy, tylko dla zadań) -->
        <div *ngIf="bulkSelectMode && task.type==='task' && task.source_type !== 'project'"
             style="display:flex;align-items:center;padding-right:10px;flex-shrink:0"
             (click)="$event.stopPropagation()">
          <input type="checkbox" style="width:16px;height:16px;cursor:pointer;accent-color:#3BAA5D"
                 [checked]="selectedTaskKeys.has(taskKey(task))"
                 (change)="toggleTaskSelect(task)">
        </div>

        <!-- Kolumna daty -->
        <div class="task-date-col">
          <ng-container *ngIf="task.activity_at; else noDate">
            <span class="task-date-day">{{task.activity_at | date:'d'}}</span>
            <span class="task-date-mon">{{task.activity_at | date:'MMM'}}</span>
            <span class="task-date-time" *ngIf="!task.all_day">{{task.activity_at | date:'HH:mm'}}</span>
          </ng-container>
          <ng-template #noDate><span class="task-date-none">{{ t('calendar.tasks.noDate') }}</span></ng-template>
        </div>

        <!-- Treść -->
        <div style="flex:1;min-width:0;padding-left:12px">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <strong style="font-size:13px;color:#18181b">
              <span style="color:#6b7280;font-weight:500">{{taskTypeName(task.type)}}:</span> {{task.title}}
            </strong>
            <span class="task-status-badge task-st-{{task.status}}">{{task.status_label || taskStatusLabel(task.status)}}</span>
            <span *ngIf="task.priority" class="priority-badge priority-{{task.priority}}">{{priorityLabel(task.priority)}}</span>
            <span class="task-source-badge task-src-{{task.source_type}}">{{sourceLabel(task.source_type)}}</span>
            <wt-add-to-calendar [entry]="calendarEntryOf(task)" (click)="$event.stopPropagation()"></wt-add-to-calendar>
            <span *ngIf="task.source_type !== 'project' && isTaskReadOnly(task)" style="font-size:9px;color:#9ca3af;font-style:italic">{{ t('calendar.tasks.readOnly') }}</span>
          </div>
          <div style="font-size:11px;color:#9ca3af;margin-top:2px">
            <a *ngIf="task.source_type === 'lead'"    [routerLink]="['/crm/leads', task.source_id]"    class="task-link" (click)="$event.stopPropagation()">{{task.source_name}}</a>
            <a *ngIf="task.source_type === 'partner'" [routerLink]="['/crm/partners', task.source_id]" class="task-link" (click)="$event.stopPropagation()">{{task.source_name}}</a>
            <span *ngIf="task.source_type === 'project'" class="task-link">{{task.source_name}}</span>
            <span *ngIf="task.act_assigned_to_name"> → {{task.act_assigned_to_name}}</span>
            <span *ngIf="!task.act_assigned_to_name && task.assigned_to_name"> → {{task.assigned_to_name}}</span>
          </div>
          <div *ngIf="task.body && !isExpanded(task)"
               style="font-size:12px;color:#6b7280;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:600px">
            {{stripHtml(task.body)}}
          </div>
          <span *ngIf="isExpanded(task)" style="font-size:11px;color:#3BAA5D;margin-top:2px;display:block">✎ {{ t('calendar.tasks.editMode') }}</span>
        </div>

        <!-- Przyciski akcji (tylko dla zadań) -->
        <div *ngIf="task.type === 'task' && task.source_type !== 'project' && !isTaskReadOnly(task)"
             style="display:flex;gap:4px;flex-shrink:0;align-items:flex-start;padding-left:8px"
             (click)="$event.stopPropagation()">
          <button *ngIf="task.status !== 'closed'" class="nav-btn"
                  style="font-size:11px;padding:3px 10px;white-space:nowrap"
                  (click)="closeTaskDirect(task)" [disabled]="saving">✓ {{ t('calendar.tasks.close') }}</button>
          <button *ngIf="task.status === 'closed'" class="nav-btn"
                  style="font-size:11px;padding:3px 10px;white-space:nowrap;color:#3BAA5D;border-color:#3BAA5D"
                  (click)="reopenTaskDirect(task)" [disabled]="saving">↩ {{ t('calendar.tasks.reopen') }}</button>
        </div>
      </div>

      <!-- Formularz edycji (inline) -->
      <div *ngIf="isExpanded(task)"
           style="margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;display:flex;flex-direction:column;gap:8px"
           (click)="$event.stopPropagation()">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:11px;font-weight:600;color:#374151">{{ t('activity.modal.title') }} *</label>
            <input [(ngModel)]="inlineEditForm.title" class="ef-input" [placeholder]="t('calendar.tasks.form.titlePlaceholder')">
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:11px;font-weight:600;color:#374151">{{ t('activity.form.dateTime') }}</label>
            <input type="datetime-local" [(ngModel)]="inlineEditForm.activity_at" class="ef-input">
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:11px;font-weight:600;color:#374151">{{ t('activity.modal.descriptionNotes') }}</label>
          <textarea [(ngModel)]="inlineEditForm.body" rows="2" class="ef-input" style="resize:vertical" [placeholder]="t('calendar.tasks.form.descriptionPlaceholder')"></textarea>
        </div>
        <div *ngIf="crmUsers.length" style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:11px;font-weight:600;color:#374151">{{ t('calendar.tasks.form.assignTo') }}</label>
          <select [(ngModel)]="inlineEditForm.assigned_to" class="ef-input">
            <option value="">{{ t('activity.modal.unassigned') }}</option>
            <option *ngFor="let u of crmUsers" [value]="u.id">{{u.display_name}}</option>
          </select>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="dp-btn-g" (click)="cancelInlineEdit()">{{ 'actions.cancel' | transloco }}</button>
          <button class="dp-btn-p" (click)="saveInlineEdit(task)" [disabled]="!inlineEditForm.title?.trim() || saving">
            {{saving ? '…' : ('actions.save' | transloco)}}
          </button>
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
        {{ selectedMeeting.source_type === 'lead' ? '🎯 ' + t('labels.sourceTypes.lead') : '🤝 ' + t('labels.sourceTypes.partner') }}
      </span>
      <span style="flex:1"></span>
      <button class="dp-edit-btn" (click)="startEdit()" *ngIf="!editMode && canEdit(selectedMeeting)">✏️ {{ t('activity.modal.edit') }}</button>
      <button class="dp-close" (click)="closeMeeting()">✕</button>
    </div>

    <!-- Tryb widoku -->
    <div *ngIf="!editMode" class="dp-body">
      <div class="dp-title">{{ selectedMeeting.title }}</div>
      <div class="dp-source">
        <a *ngIf="selectedMeeting.source_type === 'lead'"    [routerLink]="['/crm/leads',    selectedMeeting.source_id]" class="dp-link">{{ selectedMeeting.source_name }}</a>
        <a *ngIf="selectedMeeting.source_type === 'partner'" [routerLink]="['/crm/partners', selectedMeeting.source_id]" class="dp-link">{{ selectedMeeting.source_name }}</a>
      </div>
      <div class="dp-row"><span class="dp-lbl">📅 {{ t('activity.modal.dateTime') }}</span><span>{{ selectedMeeting.activity_at | date:'dd.MM.yyyy HH:mm' }}</span></div>
      <div class="dp-row" *ngIf="selectedMeeting.duration_min"><span class="dp-lbl">⏱ {{ t('calendar.meeting.duration') }}</span><span>{{ t('calendar.durationMinutes', { minutes: selectedMeeting.duration_min }) }}</span></div>
      <div class="dp-row" *ngIf="selectedMeeting.meeting_location"><span class="dp-lbl">📍 {{ t('meetings.location') }}</span><span>{{ selectedMeeting.meeting_location }}</span></div>
      <div class="dp-row" *ngIf="selectedMeeting.participants"><span class="dp-lbl">👥 {{ t('meetings.participants') }}</span><span style="word-break:break-all">{{ selectedMeeting.participants }}</span></div>
      <div class="dp-row" *ngIf="selectedMeeting.body"><span class="dp-lbl">📝 {{ t('calendar.meeting.notes') }}</span><span>{{ selectedMeeting.body }}</span></div>
      <div class="dp-row"><span class="dp-lbl">👤 {{ t('activity.modal.addedBy') }}</span><span>{{ selectedMeeting.created_by_name }}</span></div>
      <div class="dp-row" *ngIf="selectedMeeting.assigned_to_name"><span class="dp-lbl">🙋 {{ t('calendar.meeting.salesperson') }}</span><span>{{ selectedMeeting.assigned_to_name }}</span></div>
    </div>

    <!-- Tryb edycji -->
    <div *ngIf="editMode" class="dp-body">
      <div class="ef-row">
        <label class="ef-lbl">{{ t('activity.modal.title') }} *</label>
        <input class="ef-input" [(ngModel)]="editForm.title">
      </div>
      <div class="ef-row">
        <label class="ef-lbl">{{ t('activity.modal.dateTime') }}</label>
        <input class="ef-input" type="datetime-local" [(ngModel)]="editForm.activity_at">
      </div>
      <div class="ef-row">
        <label class="ef-lbl">{{ t('meetings.durationMin') }}</label>
        <input class="ef-input" type="number" min="0" [(ngModel)]="editForm.duration_min" placeholder="60">
      </div>
      <div class="ef-row">
        <label class="ef-lbl">{{ t('meetings.location') }}</label>
        <input class="ef-input" [(ngModel)]="editForm.meeting_location" [placeholder]="t('calendar.meeting.locationPlaceholder')">
      </div>
      <div class="ef-row">
        <label class="ef-lbl">{{ t('meetings.participants') }}</label>
        <input class="ef-input" [(ngModel)]="editForm.participants" [placeholder]="t('calendar.meeting.participantsPlaceholder')">
      </div>
      <div class="ef-row">
        <label class="ef-lbl">{{ t('calendar.meeting.notes') }}</label>
        <textarea class="ef-input" rows="3" [(ngModel)]="editForm.body" style="resize:vertical"></textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="dp-btn-g" (click)="editMode = false">{{ 'actions.cancel' | transloco }}</button>
        <button class="dp-btn-p" (click)="saveEdit()" [disabled]="saving">{{ saving ? '…' : ('actions.save' | transloco) }}</button>
      </div>
    </div>
  </div>
</div>

</div>
</ng-container>
  `,
  styles: [`
    :host { display:flex;flex-direction:column;height:100%;overflow:hidden; }
    .ctl { background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:5px 10px;font-size:12px;outline:none;cursor:pointer;font-family:inherit }
    .ctl:focus { border-color:#3BAA5D }
    .nav-btn { background:white;border:1px solid #e4e4e7;border-radius:8px;padding:5px 10px;font-size:15px;cursor:pointer;transition:background .1s }
    .nav-btn:hover { background:#f9fafb }
    .nav-btn:disabled { opacity:.5;cursor:not-allowed }
    .view-switch { display:flex;background:#f4f4f5;border-radius:8px;padding:2px;gap:2px }
    .view-switch button { background:none;border:none;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:500;color:#71717a;cursor:pointer;font-family:inherit }
    .view-switch button.active { background:white;color:#3BAA5D;font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,.08) }
    .view-switch button.tasks-btn { color:#2F8F4D;font-weight:700 }
    .tasks-badge { display:inline-flex;min-width:16px;height:16px;background:#dc2626;color:white;border-radius:10px;font-size:9px;font-weight:700;align-items:center;justify-content:center;padding:0 4px;line-height:1;margin-left:4px;vertical-align:middle }

    /* Month */
    .month-grid { display:grid;grid-template-columns:repeat(7,1fr);border-left:1px solid #e4e4e7;border-top:1px solid #e4e4e7 }
    .month-dayname { padding:6px;font-size:11px;font-weight:700;text-transform:uppercase;color:#a1a1aa;text-align:center;border-right:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;background:#fafafa }
    .month-cell { min-height:100px;padding:6px;border-right:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;background:white;vertical-align:top }
    .month-cell.other-month { background:#fafafa }
    .month-cell.today { background:#E6F4EA }
    .day-num { font-size:12px;font-weight:700;color:#18181b;margin-bottom:4px }
    .month-cell.today .day-num { width:22px;height:22px;background:#3BAA5D;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center }
    .month-cell.other-month .day-num { color:#d1d5db }
    .day-events { display:flex;flex-direction:column;gap:2px }
    .event-chip { display:flex;gap:4px;align-items:center;border-radius:4px;padding:2px 5px;font-size:10px;cursor:pointer;overflow:hidden }
    .lead-chip { background:#eff6ff;color:#1d4ed8 }
    .partner-chip { background:#E6F4EA;color:#166534 }
    .event-chip:hover { opacity:.8 }
    .event-time { font-weight:700;flex-shrink:0 }
    .event-title { overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
    .event-more { font-size:10px;color:#a1a1aa;cursor:pointer;padding:1px 4px }
    .event-more:hover { color:#3BAA5D }

    /* Week */
    .week-grid { display:grid;grid-template-columns:50px repeat(7,1fr);border-left:1px solid #e4e4e7 }
    .wh-time { background:#fafafa;border-right:1px solid #e4e4e7;border-bottom:2px solid #e4e4e7 }
    .wh-day { padding:6px;text-align:center;border-right:1px solid #e4e4e7;border-bottom:2px solid #e4e4e7;background:#fafafa }
    .wh-day.today { background:#E6F4EA }
    .wh-dayname { font-size:10px;font-weight:700;color:#a1a1aa;text-transform:uppercase }
    .wh-daynum { font-size:18px;font-weight:700;color:#18181b;margin-top:2px }
    .today-circle { width:32px;height:32px;background:#3BAA5D;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto;font-size:15px }
    .wt-hour { padding:8px 4px;font-size:10px;color:#a1a1aa;text-align:right;border-right:1px solid #e4e4e7;border-bottom:1px solid #f4f4f5;min-height:60px;background:#fafafa }
    .wt-cell { border-right:1px solid #e4e4e7;border-bottom:1px solid #f4f4f5;min-height:60px;padding:2px;position:relative }
    .wt-cell.today-col { background:#f0fdf4 }
    .week-event { border-radius:6px;padding:4px 7px;margin-bottom:2px;cursor:pointer;font-size:11px }
    .lead-event { background:#eff6ff;border-left:3px solid #3b82f6 }
    .partner-event { background:#E6F4EA;border-left:3px solid #3BAA5D }
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
    .day-event.partner-event { background:#E6F4EA;border-left:4px solid #3BAA5D }
    .day-event:hover { opacity:.85 }
    .de-header { display:flex;align-items:center;justify-content:space-between;margin-bottom:2px }
    .de-time { font-size:11px;font-weight:700;color:#374151 }
    .de-badge { font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px }
    .lead-badge { background:#dbeafe;color:#1d4ed8 }
    .partner-badge { background:#E6F4EA;color:#166534 }
    .de-title { font-size:13px;font-weight:700;color:#18181b }
    .de-source { font-size:11px;color:#71717a;margin-top:1px }
    .de-meta { font-size:11px;color:#6b7280;margin-top:3px }

    /* Detail panel (meetings) */
    .detail-overlay { position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px }
    .detail-panel { background:white;border-radius:14px;width:min(480px,100%);max-height:85vh;overflow-y:auto;box-shadow:0 12px 32px rgba(0,0,0,.15);display:flex;flex-direction:column }
    .dp-header { padding:16px 20px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;gap:10px;position:sticky;top:0;background:white;z-index:1 }
    .dp-badge { font-size:12px;font-weight:700;padding:3px 10px;border-radius:10px }
    .dp-close { background:none;border:none;font-size:18px;color:#9ca3af;cursor:pointer;margin-left:4px }
    .dp-edit-btn { background:#E6F4EA;border:1px solid #a7d7b5;color:#166534;border-radius:8px;padding:4px 12px;font-size:12px;cursor:pointer;font-weight:600 }
    .dp-body { padding:18px 20px;display:flex;flex-direction:column;gap:12px }
    .dp-title { font-family:'Sora',sans-serif;font-size:16px;font-weight:700;color:#18181b }
    .dp-source { font-size:13px;color:#3BAA5D }
    .dp-link { color:#3BAA5D;font-weight:600;text-decoration:none }
    .dp-link:hover { text-decoration:underline }
    .dp-row { display:flex;gap:12px;font-size:13px;align-items:flex-start }
    .dp-lbl { color:#9ca3af;font-size:12px;min-width:100px;flex-shrink:0 }
    .ef-row { display:flex;flex-direction:column;gap:4px }
    .ef-lbl { font-size:11px;font-weight:600;color:#6b7280 }
    .ef-input { border:1px solid #d1d5db;border-radius:7px;padding:7px 10px;font-size:13px;outline:none;font-family:inherit;background:white;width:100%;box-sizing:border-box }
    .ef-input:focus { border-color:#3BAA5D }
    .dp-btn-p { background:#3BAA5D;color:white;border:none;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer }
    .dp-btn-p:disabled { opacity:.6;cursor:not-allowed }
    .dp-btn-g { background:white;color:#374151;border:1px solid #d1d5db;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer }

    /* Tasks view */
    .task-item { border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-bottom:8px;background:white;border-left:4px solid #e5e7eb;transition:box-shadow .15s; }
    .task-item:hover { box-shadow:0 2px 8px rgba(0,0,0,.07); }
    .task-item.task-today { background:#eff6ff;border-left-color:#3b82f6; }
    .project-chip, .project-event { background:#f5f3ff !important; border-left-color:#8b5cf6 !important; color:#5b21b6 !important; }
    .project-badge, .task-src-project { background:#ede9fe; color:#5b21b6; }
    .task-item.task-overdue { background:#fef2f2;border-left-color:#dc2626; }
    .task-item.task-closed { opacity:.6;background:#f9fafb; }
    .task-item.task-readonly { opacity:.55;background:#f9fafb;cursor:default; }
    .task-item.task-expanded { border-left-color:#3BAA5D;box-shadow:0 2px 12px rgba(59,170,93,.12); }
    .task-date-col { display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:52px;padding-right:12px;border-right:1px solid #e5e7eb;flex-shrink:0;text-align:center; }
    .task-date-day { font-size:22px;font-weight:800;color:#18181b;line-height:1; }
    .task-date-mon { font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-top:1px; }
    .task-date-time { font-size:12px;font-weight:700;color:#3BAA5D;margin-top:4px; }
    .task-date-none { font-size:10px;color:#d1d5db;font-style:italic;text-align:center; }
    .task-status-badge { font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:.04em; }
    .task-st-new { background:#f3f4f6;color:#6b7280; }
    .task-st-open { background:#dbeafe;color:#1d4ed8; }
    .task-st-closed { background:#d1fae5;color:#065f46; }
    .task-source-badge { font-size:9px;font-weight:600;padding:1px 6px;border-radius:4px; }
    .task-src-lead { background:#fff7ed;color:#c2410c; }
    .task-src-partner { background:#f0fdf4;color:#166534; }
    .priority-badge { font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:.04em; }
    .priority-asap { background:#fee2e2;color:#991b1b; }
    .priority-important { background:#ffedd5;color:#c2410c; }
    .priority-medium { background:#fef9c3;color:#854d0e; }
    .priority-low { background:#dbeafe;color:#1e40af; }
    .task-link { color:#3BAA5D;font-weight:600;text-decoration:none; }
    .task-link:hover { text-decoration:underline; }
  `],
})
export class CrmCalendarComponent implements OnInit {
  private api  = inject(CrmApiService);
  private auth = inject(AuthService);
  private cdr  = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  private toast = inject(ToastService);
  private projectTaskNavigation = inject(ProjectTaskNavigationService);
  private transloco = inject(TranslocoService);
  private locale = inject(LocaleService);

  loading  = false;
  saving   = false;
  view: ViewMode = 'month';
  currentDate = new Date();
  filterRep = '';
  crmUsers: CrmUser[] = [];
  crmGroups: CrmGroup[] = [];
  meetings: CalendarMeeting[] = [];

  // Aktywności (widok zadania)
  activities: ActivityTask[] = [];
  tasksLoading = false;
  showClosedTasks = false;
  showNoDateTasks = false;
  myTasksCount = 0;
  filterActivityType = '';
  filterPriority = '';

  // Inline edit
  expandedTaskKey: string | null = null;
  inlineEditForm: any = {};

  // Masowe zamykanie
  bulkSelectMode = false;
  selectedTaskKeys = new Set<string>();

  // Spotkanie modal
  selectedMeeting: CalendarMeeting | null = null;
  editMode = false;
  editForm: any = {};

  // DAY_SHORT is indexed by Date.getDay() (Sunday first); dayNames starts on Monday like the month grid.
  readonly DAY_SHORT = this.buildWeekdayShortNames();
  readonly dayNames  = [...this.DAY_SHORT.slice(1), this.DAY_SHORT[0]];
  readonly hours     = Array.from({ length: 16 }, (_, i) => i + 7);

  get isManager() { const u = this.auth.user(); return u?.is_admin || u?.crm_role === 'sales_manager'; }

  get periodLabel(): string {
    const d = this.currentDate;
    if (this.view === 'day')
      return d.toLocaleDateString(this.locale.activeLocale(), { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    if (this.view === 'week') {
      const start = this.weekStart(d);
      const end   = new Date(start); end.setDate(end.getDate() + 6);
      return `${start.getDate()} — ${end.getDate()} ${end.toLocaleDateString(this.locale.activeLocale(), { month:'long', year:'numeric' })}`;
    }
    return d.toLocaleDateString(this.locale.activeLocale(), { month:'long', year:'numeric' });
  }

  ngOnInit(): void {
    if (this.isManager) {
      this.api.getCrmUsers().subscribe({ next: u => { this.crmUsers = u; this.cdr.markForCheck(); }, error: () => {} });
      this.api.getCrmGroups().subscribe({ next: g => { this.crmGroups = g; this.cdr.markForCheck(); }, error: () => {} });
    }
    this.loadTaskBadge();
    this.load();
  }

  loadTaskBadge(): void {
    const u = this.auth.user();
    if (!u) return;
    this.api.getActivityTasks({ assigned_to: u.id, include_closed: false }).subscribe({
      next: tasks => this.zone.run(() => { this.myTasksCount = tasks.filter(t => t.status === 'new').length; this.cdr.markForCheck(); }),
      error: () => {},
    });
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
    if (this.view === 'day') { const s = this.fmt(d); return { from: s, to: s }; }
    if (this.view === 'week') {
      const start = this.weekStart(d);
      const end   = new Date(start); end.setDate(end.getDate() + 6);
      return { from: this.fmt(start), to: this.fmt(end) };
    }
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { from: this.fmt(new Date(start.getFullYear(), start.getMonth(), start.getDate() - start.getDay() + 1)), to: this.fmt(new Date(end.getFullYear(), end.getMonth(), end.getDate() + (7 - end.getDay()))) };
  }

  prev(): void {
    const d = new Date(this.currentDate);
    if (this.view === 'day')   d.setDate(d.getDate() - 1);
    if (this.view === 'week')  d.setDate(d.getDate() - 7);
    if (this.view === 'month') d.setMonth(d.getMonth() - 1);
    this.currentDate = d; this.load();
  }
  next(): void {
    const d = new Date(this.currentDate);
    if (this.view === 'day')   d.setDate(d.getDate() + 1);
    if (this.view === 'week')  d.setDate(d.getDate() + 7);
    if (this.view === 'month') d.setMonth(d.getMonth() + 1);
    this.currentDate = d; this.load();
  }
  today(): void { this.currentDate = new Date(); this.load(); }
  setView(v: ViewMode): void { this.view = v; if (v === 'tasks') { this.loadTasks(); } else { this.load(); } }

  loadTasks(): void {
    this.tasksLoading = true;
    this.expandedTaskKey = null;
    this.cdr.markForCheck();
    const p: any = { include_closed: this.showClosedTasks, include_no_date: this.showNoDateTasks };
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
    if (this.filterPriority) p.priority = this.filterPriority;
    this.api.getActivityTasks(p).subscribe({
      next: tasks => this.zone.run(() => { this.activities = tasks; this.tasksLoading = false; this.cdr.markForCheck(); }),
      error: () => this.zone.run(() => { this.tasksLoading = false; this.cdr.markForCheck(); }),
    });
  }

  jumpToDate(d: Date): void { this.currentDate = new Date(d); }

  // ── Klucz zadania ─────────────────────────────────────────
  taskKey(t: ActivityTask): string { return `${t.id}_${t.source_type}`; }
  isExpanded(t: ActivityTask): boolean { return this.expandedTaskKey === this.taskKey(t); }

  // ── Inline edit ───────────────────────────────────────────
  calendarEntryOf(task: ActivityTask): CalendarEntry | null {
    return activityCalendarEntry(task);
  }

  sourceLabel(sourceType: string): string {
    const knownType = sourceType === 'lead' || sourceType === 'project' ? sourceType : 'partner';
    return this.transloco.translate('crm.labels.sourceTypes.' + knownType);
  }

  // Project tasks are view-only here: a click opens them in the Projects module.
  private openProjectTask(task: { source_id: number | string; project_task_id?: string }): void {
    this.projectTaskNavigation.open(String(task.source_id), task.project_task_id ?? null, {
      label: this.transloco.translate('crm.calendar.breadcrumb'), route: ['/crm/calendar'],
    });
  }

  onTaskClick(t: ActivityTask): void {
    if (t.source_type === 'project') { this.openProjectTask(t); return; }
    if (isTaskReadOnly(this, t)) return;
    const key = this.taskKey(t);

    // Kliknięcie na już otwarte zadanie — zamknij
    if (this.expandedTaskKey === key) {
      this.expandedTaskKey = null;
      this.cdr.markForCheck();
      return;
    }

    // Jeśli edytujemy inne zadanie — auto-zapisz
    if (this.expandedTaskKey) {
      const current = this.activities.find(a => this.taskKey(a) === this.expandedTaskKey);
      if (current && this.inlineEditForm.title?.trim()) {
        this.saveInlineEdit(current, true);
      }
    }

    // Otwórz nowe zadanie
    this.expandedTaskKey = key;
    this.inlineEditForm = {
      title:       t.title,
      body:        t.body || '',
      activity_at: t.activity_at ? this.toLocalDT(t.activity_at) : '',
      assigned_to: t.act_assigned_to_id || '',
    };
    if (!this.crmUsers.length) {
      this.api.getCrmUsers().subscribe({ next: u => this.zone.run(() => { this.crmUsers = u; this.cdr.markForCheck(); }), error: () => {} });
    }
    this.cdr.markForCheck();
  }

  cancelInlineEdit(): void { this.expandedTaskKey = null; this.cdr.markForCheck(); }

  saveInlineEdit(t: ActivityTask, silent = false): void {
    if (!this.inlineEditForm.title?.trim()) return;
    if (!silent) { this.saving = true; this.cdr.markForCheck(); }
    const payload: any = {
      title:       this.inlineEditForm.title.trim(),
      body:        this.inlineEditForm.body || null,
      activity_at: this.inlineEditForm.activity_at ? new Date(this.inlineEditForm.activity_at).toISOString() : null,
      assigned_to: this.inlineEditForm.assigned_to || null,
    };
    const obs: Observable<any> = t.source_type === 'lead'
      ? this.api.updateLeadActivity(+t.source_id, t.id, payload)
      : this.api.updatePartnerActivity(+t.source_id, t.id, payload);
    obs.subscribe({
      next: (updated: any) => this.zone.run(() => {
        const patch = { ...updated, act_assigned_to_id: updated.assigned_to ?? null, act_assigned_to_name: updated.assigned_to_name ?? null };
        this.activities = this.activities.map(a =>
          a.id === t.id && a.source_type === t.source_type ? { ...a, ...patch } : a
        );
        if (!silent) { this.expandedTaskKey = null; this.saving = false; }
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => {
        if (!silent) this.saving = false;
        this.toast.error(this.transloco.translate('crm.calendar.tasks.saveFailed'));
        this.cdr.markForCheck();
      }),
    });
  }

  // ── Zamykanie / wznawianie zadań ──────────────────────────
  closeTaskDirect(t: ActivityTask): void {
    const prevStatus = t.status;
    // Optimistic update – działa synchronicznie w obrębie obsługi kliknięcia
    this.activities = this.activities.map(a =>
      a.id === t.id && a.source_type === t.source_type ? { ...a, status: 'closed' as const } : a
    );
    const obs: Observable<any> = t.source_type === 'lead'
      ? this.api.updateLeadActivity(+t.source_id, t.id, { status: 'closed' })
      : this.api.updatePartnerActivity(+t.source_id, t.id, { status: 'closed' });
    obs.subscribe({
      next: () => {},
      error: () => this.zone.run(() => {
        this.activities = this.activities.map(a =>
          a.id === t.id && a.source_type === t.source_type ? { ...a, status: prevStatus } : a
        );
        this.cdr.markForCheck();
      }),
    });
  }

  reopenTaskDirect(t: ActivityTask): void {
    const prevStatus = t.status;
    // Optimistic update
    this.activities = this.activities.map(a =>
      a.id === t.id && a.source_type === t.source_type ? { ...a, status: 'open' as const } : a
    );
    const obs: Observable<any> = t.source_type === 'lead'
      ? this.api.updateLeadActivity(+t.source_id, t.id, { status: 'open' })
      : this.api.updatePartnerActivity(+t.source_id, t.id, { status: 'open' });
    obs.subscribe({
      next: () => {},
      error: () => this.zone.run(() => {
        this.activities = this.activities.map(a =>
          a.id === t.id && a.source_type === t.source_type ? { ...a, status: prevStatus } : a
        );
        this.cdr.markForCheck();
      }),
    });
  }

  // ── Masowe zamykanie ──────────────────────────────────────
  enterBulkSelect(): void {
    this.bulkSelectMode = true;
    this.selectedTaskKeys = new Set(
      this.activities
        .filter(t => t.type === 'task' && t.source_type !== 'project' && t.status !== 'closed' && t.activity_at && this.isTaskOverdue(t.activity_at))
        .map(t => this.taskKey(t))
    );
    this.cdr.markForCheck();
  }

  exitBulkSelect(): void {
    this.bulkSelectMode = false;
    this.selectedTaskKeys = new Set();
    this.cdr.markForCheck();
  }

  toggleTaskSelect(t: ActivityTask): void {
    const key = this.taskKey(t);
    if (this.selectedTaskKeys.has(key)) this.selectedTaskKeys.delete(key);
    else this.selectedTaskKeys.add(key);
    this.cdr.markForCheck();
  }

  bulkClose(): void {
    if (!this.selectedTaskKeys.size) return;
    this.saving = true;
    this.cdr.markForCheck();
    const toClose = this.activities.filter(t => this.selectedTaskKeys.has(this.taskKey(t)));
    let remaining = toClose.length;
    const done = () => {
      remaining--;
      if (remaining === 0) {
        this.saving = false;
        this.bulkSelectMode = false;
        this.selectedTaskKeys = new Set();
        this.cdr.markForCheck();
      }
    };
    for (const t of toClose) {
      const obs: Observable<any> = t.source_type === 'lead'
        ? this.api.updateLeadActivity(+t.source_id, t.id, { status: 'closed' })
        : this.api.updatePartnerActivity(+t.source_id, t.id, { status: 'closed' });
      obs.subscribe({
        next: () => this.zone.run(() => {
          this.activities = this.activities.map(a =>
            a.id === t.id && a.source_type === t.source_type ? { ...a, status: 'closed' as const } : a
          );
          done();
        }),
        error: () => this.zone.run(() => done()),
      });
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  taskTypeName(type: string): string {
    return KNOWN_ACTIVITY_TYPES.includes(type) ? this.transloco.translate('crm.labels.activityTypes.' + type) : type;
  }

  taskStatusLabel(s: string): string {
    const knownStatus = s === 'closed' || s === 'open' ? s : 'new';
    return this.transloco.translate('crm.labels.activityStatuses.' + knownStatus);
  }

  priorityLabel(p: string): string {
    return KNOWN_PRIORITIES.includes(p) ? this.transloco.translate('crm.labels.priorities.' + p) : p;
  }

  isTaskToday(activityAt: string): boolean {
    const d = new Date(activityAt), now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }

  isTaskOverdue(activityAt: string): boolean {
    return new Date(activityAt) < new Date(new Date().toDateString());
  }

  isTaskReadOnly(t: ActivityTask): boolean {
    const u = this.auth.user();
    if (!u) return true;
    if (u.is_admin) return false;
    if (t.created_by === u.id) return false;
    const targetId = t.act_assigned_to_id || t.assigned_to_id;
    if (!targetId || targetId === u.id) return false;
    const group = this.crmGroups.find(g => g.user_ids.includes(targetId));
    if (!group) return true;
    const role = u.roles?.find(r => r.group_id === group.id);
    if (!role) return true;
    return role.access_level !== 'full';
  }

  canEditTask(t: ActivityTask): boolean {
    const u = this.auth.user();
    if (!u) return false;
    if (u.is_admin) return true;
    if (t.created_by === u.id) return true;
    return !this.isTaskReadOnly(t);
  }

  stripHtml(html: string): string {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private toLocalDT(utcIso: string): string {
    if (!utcIso) return '';
    const d = new Date(utcIso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  onFilterRepChange(): void {
    if (this.view === 'tasks') this.loadTasks(); else this.load();
  }

  // ── Month grid ────────────────────────────────────────────
  get monthDays(): CalendarDay[] {
    const d = this.currentDate;
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const today = new Date(); today.setHours(0,0,0,0);
    let start = new Date(first);
    const dow = (first.getDay() + 6) % 7;
    start.setDate(start.getDate() - dow);
    const days: CalendarDay[] = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(start); date.setDate(start.getDate() + i);
      const dt = new Date(date); dt.setHours(0,0,0,0);
      days.push({ date, isCurrentMonth: date.getMonth() === d.getMonth(), isToday: dt.getTime() === today.getTime(), meetings: this.meetingsOnDay(date) });
    }
    return days;
  }

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
  private localDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  // ── Meeting detail / edit ─────────────────────────────────
  openMeeting(m: CalendarMeeting): void {
    if (m.source_type === 'project') { this.openProjectTask(m); return; }
    this.selectedMeeting = m; this.editMode = false; this.cdr.markForCheck();
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
      title: m.title, body: m.body || '',
      activity_at: m.activity_at ? this.toLocalDT(m.activity_at) : '',
      duration_min: m.duration_min ?? '',
      meeting_location: m.meeting_location || '',
      participants: m.participants || '',
    };
    this.editMode = true;
  }

  saveEdit(): void {
    if (!this.selectedMeeting || !this.editForm.title) return;
    this.saving = true;
    const payload: any = {
      title:            this.editForm.title,
      body:             this.editForm.body || null,
      activity_at:      this.editForm.activity_at ? new Date(this.editForm.activity_at).toISOString() : undefined,
      duration_min:     this.editForm.duration_min !== '' ? +this.editForm.duration_min : null,
      meeting_location: this.editForm.meeting_location || null,
      participants:     this.editForm.participants || null,
    };
    const m = this.selectedMeeting;
    const obs: Observable<any> = m.source_type === 'lead'
      ? this.api.updateLeadActivity(+m.source_id, m.id, payload)
      : this.api.updatePartnerActivity(+m.source_id, m.id, payload);
    obs.subscribe({
      next: () => this.zone.run(() => {
        const idx = this.meetings.findIndex(x => x.id === m.id && x.source_type === m.source_type);
        if (idx >= 0) this.meetings[idx] = { ...this.meetings[idx], ...payload };
        this.selectedMeeting = { ...m, ...payload };
        this.editMode = false; this.saving = false;
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => { this.saving = false; this.cdr.markForCheck(); }),
    });
  }

  private weekStart(d: Date): Date {
    const s = new Date(d);
    const dow = (d.getDay() + 6) % 7;
    s.setDate(d.getDate() - dow); s.setHours(0, 0, 0, 0);
    return s;
  }
  private fmt(d: Date): string { return this.localDateStr(d); }

  private buildWeekdayShortNames(): string[] {
    const formatter = new Intl.DateTimeFormat(this.locale.activeLocale(), { weekday: 'short' });
    // 2024-01-07 is a Sunday.
    return Array.from({ length: 7 }, (_, dayIndex) => formatter.format(new Date(2024, 0, 7 + dayIndex)));
  }
}

function isTaskReadOnly(self: CrmCalendarComponent, t: ActivityTask): boolean {
  return self.isTaskReadOnly(t);
}
