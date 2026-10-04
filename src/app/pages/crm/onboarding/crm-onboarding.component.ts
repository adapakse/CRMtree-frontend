// src/app/pages/crm/onboarding/crm-onboarding.component.ts
import {
  Component, OnInit, inject, signal, computed,
  ChangeDetectionStrategy, ChangeDetectorRef, NgZone,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import {
  CrmApiService, OnboardingTask, OnboardingPartner, OnboardingTaskTemplate, CrmUser,
} from '../../../core/services/crm-api.service';
import { AppSettingsService } from '../../../core/services/app-settings.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { AddToCalendarComponent } from '../../../shared/components/add-to-calendar/add-to-calendar.component';
import { CalendarEntry, dueDateCalendarEntry } from '../../../shared/utils/calendar-export.util';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { LocaleService } from '../../../core/i18n/locale.service';

// Translation keys relative to the `crm` scope.
const STEP_LABELS = [
  'onboardingBoard.steps.contractSigning',
  'onboardingBoard.steps.configuration',
  'onboardingBoard.steps.training',
  'onboardingBoard.steps.launch',
];
const STEP_ICONS  = ['📝', '⚙️', '🎓', '🚀'];
const TYPE_ICONS: Record<string, string> = {
  task:'✅', call:'📞', email:'📧', meeting:'🤝', note:'📝',
  doc_sent:'📄', training:'🎓',
};
// Translation keys relative to the `crm` scope.
const TYPE_LABELS: Record<string, string> = {
  task:'labels.activityTypes.task', call:'onboardingBoard.taskTypes.call', email:'labels.activityTypes.email',
  meeting:'labels.activityTypes.meeting', note:'labels.activityTypes.note',
  doc_sent:'labels.activityTypes.doc_sent', training:'labels.activityTypes.training',
};

@Component({
  selector: 'wt-crm-onboarding',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterModule, AddToCalendarComponent, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('crm')],
  template: `
<ng-container *transloco="let t; prefix: 'crm'">
<div id="topbar">
  <span class="page-title">🚀 {{ t('onboardingBoard.title') }}</span>
  <span class="tsp"></span>
  <!-- Filtry globalne -->
  <input class="srch" type="search" [placeholder]="t('onboardingBoard.filters.searchPlaceholder')"
         [ngModel]="search()" (ngModelChange)="search.set($event); onFilterChange()">
  <select class="sel" [ngModel]="filterPartner()" (ngModelChange)="filterPartner.set($event); onFilterChange()">
    <option value="">{{ t('onboardingBoard.filters.allPartners') }}</option>
    @for (p of partners(); track p.id) {
      <option [value]="p.id">{{ p.company }}</option>
    }
  </select>
  <select class="sel" [ngModel]="filterUser()" (ngModelChange)="filterUser.set($event); onFilterChange()" *ngIf="isManager">
    <option value="">{{ t('onboardingBoard.filters.allAssignees') }}</option>
    @for (u of crmUsers; track u.id) {
      <option [value]="u.id">{{ u.display_name }}</option>
    }
  </select>
  <div class="view-tabs">
    <button [class.active]="view==='partners'" (click)="view='partners'">🏢 {{ t('onboardingBoard.views.partners') }}</button>
    <button [class.active]="view==='kanban'"   (click)="view='kanban'">📋 {{ t('leadsList.view.kanban') }}</button>
    <button [class.active]="view==='timeline'" (click)="view='timeline'">📅 {{ t('onboardingBoard.views.timeline') }}</button>
    <button [class.active]="view==='calendar'" (click)="view='calendar'">🗓 {{ t('onboardingBoard.views.calendar') }}</button>
  </div>
</div>

<div id="content">

  <!-- Launch success banner -->
  @if (launchResult()) {
    <div style="background:#dcfce7;border:1px solid #86efac;border-radius:10px;padding:14px 18px;margin-bottom:14px;display:flex;align-items:center;gap:12px">
      <span style="font-size:22px">🎉</span>
      <div style="flex:1">
        <div style="font-weight:700;color:#166534;font-size:14px">{{ t('onboardingBoard.launch.successTitle', { company: launchResult()!.company }) }}</div>
        <div style="font-size:12px;color:#4ade80;margin-top:2px">{{ t('onboardingBoard.launch.successHint') }}</div>
      </div>
      <a [routerLink]="['/crm/partners', launchResult()!.id]" style="background:#3BAA5D;color:white;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:600;text-decoration:none">
        → {{ t('onboardingBoard.launch.partnerProfile') }}
      </a>
      <button (click)="launchResult.set(null)" style="background:none;border:none;color:#166534;font-size:18px;cursor:pointer;line-height:1">✕</button>
    </div>
  }

  <!-- ════ PARTNERS LIST ════ -->
  @if (view === 'partners') {
    <!-- sub-toolbar: view toggle -->
    <div class="partners-toolbar">
      <button class="btn-view" [class.active]="partnersView==='cards'" (click)="partnersView='cards'">⊞ {{ t('partnersList.view.cards') }}</button>
      <button class="btn-view" [class.active]="partnersView==='table'" (click)="partnersView='table'">☰ {{ t('partnersList.view.table') }}</button>
    </div>

    @if (loadingPartners()) {
      <div class="loading-state"><div class="spinner"></div></div>
    } @else if (filteredPartners().length === 0) {
      <div class="empty-state">
        <div style="font-size:48px">🎉</div>
        <div style="font-weight:600;margin-top:8px">{{ t('onboardingBoard.partners.empty') }}</div>
        <div style="font-size:12px;color:var(--gray-400);margin-top:4px">{{ t('onboardingBoard.partners.emptyHint') }}</div>
      </div>

    } @else if (partnersView === 'cards') {
      <div class="partners-grid">
        @for (p of filteredPartners(); track p.id) {
          <div class="partner-card" (click)="selectPartner(p)">
            <div class="pc-header">
              <div class="pc-icon">🤝</div>
              <div style="flex:1;min-width:0">
                <div class="pc-name">{{ p.company }}</div>
                @if (p.nip) { <div class="pc-nip">{{ t('partnersList.fields.taxId') }}: {{ p.nip }}</div> }
              </div>
              <span class="step-badge">{{ t('onboardingBoard.partners.stepBadge', { step: p.onboarding_step + 1, total: 4 }) }}</span>
            </div>
            <div class="pc-progress">
              @for (s of [0,1,2,3]; track s) {
                <div class="pc-step" [class.done]="s < p.onboarding_step" [class.active]="s === p.onboarding_step">
                  <span>{{ STEP_ICONS[s] }}</span>
                  <span class="pc-step-lbl">{{ t(STEP_LABELS[s]) }}</span>
                </div>
              }
            </div>
            <div class="pc-tasks">
              <div class="pc-task-bar">
                <div class="pc-task-fill" [style.width.%]="p.task_count ? (p.done_count / p.task_count * 100) : 100"></div>
              </div>
              <span class="pc-task-text">{{ p.task_count === 0 ? t('onboardingBoard.tasks.empty') : t('onboardingBoard.partners.taskProgress', { done: p.done_count, total: p.task_count }) }}</span>
            </div>
            @if (p.manager_name) { <div class="pc-mgr">👤 {{ p.manager_name }}</div> }
            <div style="margin-top:10px;display:flex;align-items:center;gap:8px;justify-content:flex-end">
              @if (p.lead_id) {
                <a [routerLink]="['/crm/leads', p.lead_id]" (click)="$event.stopPropagation()"
                   style="font-size:11px;color:#3b82f6;font-weight:600;text-decoration:none;border:1px solid #bfdbfe;border-radius:6px;padding:3px 8px;background:#eff6ff">
                  🎯 {{ t('onboardingBoard.partners.leadData') }}
                </a>
              }
              <button class="launch-btn"
                      [class.launch-ready]="p.done_count >= p.task_count"
                      [disabled]="p.done_count < p.task_count || launching() === p.id"
                      (click)="$event.stopPropagation(); launchPartner(p)"
                      [title]="p.done_count < p.task_count ? t('onboardingBoard.launch.remainingTasks', { count: p.task_count - p.done_count }) : t('onboardingBoard.launch.moveToRegistry')">
                @if (launching() === p.id) { ⏳ {{ t('onboardingBoard.launch.inProgress') }}
                } @else if (p.done_count >= p.task_count) { 🚀 {{ t('onboardingBoard.launch.action') }}
                } @else { 🔒 {{ t('onboardingBoard.launch.action') }} ({{ p.done_count }}/{{ p.task_count }}) }
              </button>
            </div>
          </div>
        }
      </div>

    } @else {
      <!-- TABLE VIEW -->
      <div class="pt-wrap">
        <div class="pt-head">
          <div class="pt-th sortable" (click)="sortPartnersBy('company')">{{ t('partnersList.fields.company') }} <span class="si">{{ partnerSortIcon('company') }}</span></div>
          <div class="pt-th sortable" (click)="sortPartnersBy('nip')">{{ t('partnersList.fields.taxId') }} <span class="si">{{ partnerSortIcon('nip') }}</span></div>
          <div class="pt-th sortable" (click)="sortPartnersBy('onboarding_step')">{{ t('onboardingBoard.table.step') }} <span class="si">{{ partnerSortIcon('onboarding_step') }}</span></div>
          <div class="pt-th">{{ t('onboardingBoard.table.taskProgress') }}</div>
          <div class="pt-th sortable" (click)="sortPartnersBy('manager_name')">{{ t('partnersList.fields.salesRep') }} <span class="si">{{ partnerSortIcon('manager_name') }}</span></div>
          <div class="pt-th sortable" (click)="sortPartnersBy('created_at')">{{ t('onboardingBoard.table.addedOn') }} <span class="si">{{ partnerSortIcon('created_at') }}</span></div>
          <div class="pt-th">{{ t('onboardingBoard.table.action') }}</div>
        </div>
        @for (p of sortedPartners(); track p.id) {
          <div class="pt-row" (click)="selectPartner(p)">
            <!-- Firma -->
            <div class="pt-td">
              <span class="pt-company">{{ p.company }}</span>
              @if (p.nip) { <span class="pt-nip">{{ p.nip }}</span> }
            </div>
            <!-- NIP (osobna kolumna) -->
            <div class="pt-td pt-mono">{{ p.nip || '—' }}</div>
            <!-- Krok -->
            <div class="pt-td">
              <span class="step-badge">{{ STEP_ICONS[p.onboarding_step] }} {{ t('onboardingBoard.partners.stepBadge', { step: p.onboarding_step + 1, total: 4 }) }}</span>
              <span class="pt-step-name">{{ t(STEP_LABELS[p.onboarding_step]) }}</span>
            </div>
            <!-- Postęp -->
            <div class="pt-td pt-progress-cell">
              <div class="pt-bar"><div class="pt-fill" [style.width.%]="p.task_count ? (p.done_count / p.task_count * 100) : 100"></div></div>
              <span class="pt-prog-txt">{{ p.task_count === 0 ? '—' : (p.done_count + '/' + p.task_count) }}</span>
            </div>
            <!-- Handlowiec -->
            <div class="pt-td">{{ p.manager_name || '—' }}</div>
            <!-- Dodano -->
            <div class="pt-td pt-date">{{ p.created_at | date:'dd.MM.yy' }}</div>
            <!-- Akcja -->
            <div class="pt-td" (click)="$event.stopPropagation()">
              <button class="launch-btn"
                      [class.launch-ready]="p.done_count >= p.task_count"
                      [disabled]="p.done_count < p.task_count || launching() === p.id"
                      (click)="launchPartner(p)"
                      [title]="p.done_count < p.task_count ? t('onboardingBoard.launch.remainingTasks', { count: p.task_count - p.done_count }) : t('onboardingBoard.launch.moveToRegistry')">
                @if (launching() === p.id) { ⏳
                } @else if (p.done_count >= p.task_count) { 🚀 {{ t('onboardingBoard.launch.actionShort') }}
                } @else { 🔒 ({{ p.done_count }}/{{ p.task_count }}) }
              </button>
            </div>
          </div>
        }
      </div>
    }
  }

  <!-- ════ KANBAN ════ -->
  @if (view === 'kanban') {
    @if (loadingTasks()) {
      <div class="loading-state"><div class="spinner"></div></div>
    } @else {
      <div class="kanban-wrap">
        @for (step of [0,1,2,3]; track step) {
          <div class="kb-col">
            <div class="kb-head">
              <span class="kb-icon">{{ STEP_ICONS[step] }}</span>
              <span class="kb-title">{{ t(STEP_LABELS[step]) }}</span>
              <span class="kb-cnt">{{ tasksForStep(step).length }}</span>
            </div>
            <div class="kb-cards">
              @for (task of tasksForStep(step); track task.id) {
                <div class="kb-card" [class.done]="task.done" (click)="openTask(task)">
                  <div class="kb-card-top">
                    <span class="type-icon">{{ TYPE_ICONS[task.type] }}</span>
                    <span class="kb-partner">{{ task.partner_name }}</span>
                    @if (task.done) { <span class="done-badge">✓</span> }
                  </div>
                  <div class="kb-card-title">{{ task.title }}</div>
                  @if (task.due_date) {
                    <div class="kb-due" [class.overdue]="isOverdue(task)">
                      📅 {{ task.due_date | date:'dd.MM' }}
                      @if (task.due_time) { {{ task.due_time.slice(0,5) }} }
                      @else { 09:00 }
                      <wt-add-to-calendar [entry]="calendarEntryOf(task)" (click)="$event.stopPropagation()" />
                    </div>
                  }
                  @if (task.assigned_to_name) {
                    <div class="kb-assignee">👤 {{ task.assigned_to_name }}</div>
                  }
                  <div class="kb-card-actions">
                    <button class="kb-del-btn" (click)="$event.stopPropagation(); quickDeleteTask(task)"
                            [title]="t('onboardingBoard.tasks.delete')">🗑</button>
                  </div>
                </div>
              }
              @if (tasksForStep(step).length === 0) {
                <div class="kb-empty">{{ t('onboardingBoard.tasks.empty') }}</div>
              }
              <!-- Dodaj zadanie -->
              @if (filterPartner()) {
                <button class="kb-add" (click)="openNewTask(step)">+ {{ t('partnerDetail.onboarding.addTask') }}</button>
              }
            </div>
          </div>
        }
      </div>
    }
  }

  <!-- ════ TIMELINE ════ -->
  @if (view === 'timeline') {
    @if (loadingTasks()) {
      <div class="loading-state"><div class="spinner"></div></div>
    } @else {
      <div class="timeline-wrap">
        @if (timelineGroups().length === 0) {
          <div class="empty-state">
            <div style="font-size:36px">📅</div>
            <div style="margin-top:8px;font-weight:600">{{ t('onboardingBoard.timeline.empty') }}</div>
          </div>
        }
        @for (g of timelineGroups(); track g.date) {
          <div class="tl-group">
            <div class="tl-date-label" [class.tl-today]="g.isToday" [class.tl-past]="g.isPast">
              <span class="tl-dot"></span>
              {{ g.label }}
              @if (g.isToday) { <span class="today-tag">{{ t('leadsList.timeline.todayTag') }}</span> }
            </div>
            @for (task of g.tasks; track task.id) {
              <div class="tl-item" [class.tl-done]="task.done" (click)="openTask(task)">
                <div class="tl-time">
                  {{ task.due_time ? task.due_time.slice(0,5) : '09:00' }}
                </div>
                <div class="tl-content">
                  <div class="tl-top">
                    <span>{{ TYPE_ICONS[task.type] }} {{ task.title }}</span>
                    @if (task.done) { <span class="done-badge">✓</span> }
                  </div>
                  <div class="tl-meta">
                    <span class="tl-partner">🤝 {{ task.partner_name }}</span>
                    @if (task.assigned_to_name) { <span>· 👤 {{ task.assigned_to_name }}</span> }
                    <span>· {{ t(STEP_LABELS[task.step]) }}</span>
                  </div>
                </div>
              </div>
            }
          </div>
        }
      </div>
    }
  }

  <!-- ════ CALENDAR ════ -->
  @if (view === 'calendar') {
    @if (loadingTasks()) {
      <div class="loading-state"><div class="spinner"></div></div>
    } @else {
      <div class="cal-wrap">
        <div class="cal-nav">
          <button class="btn btn-g btn-sm" (click)="prevMonth()">‹</button>
          <span class="cal-month-label">{{ calMonthLabel() }}</span>
          <button class="btn btn-g btn-sm" (click)="nextMonth()">›</button>
        </div>
        <div class="cal-grid">
          @for (d of weekdayLabels; track $index) {
            <div class="cal-dow">{{ d }}</div>
          }
          @for (cell of calCells(); track cell.key) {
            <div class="cal-cell" [class.cal-other]="!cell.inMonth"
                 [class.cal-today]="cell.isToday">
              <div class="cal-day-num">{{ cell.day }}</div>
              @for (task of cell.tasks; track task.id) {
                <div class="cal-event" [class.cal-done]="task.done"
                     [class]="'cal-step-'+task.step"
                     (click)="openTask(task)"
                     [title]="task.partner_name + ': ' + task.title">
                  {{ TYPE_ICONS[task.type] }} {{ task.title | slice:0:18 }}
                </div>
              }
            </div>
          }
        </div>
      </div>
    }
  }

</div>

<!-- ════ TASK MODAL ════ -->
@if (showTaskModal) {
  <div class="overlay" (click)="closeTaskModal()">
    <div class="modal" (click)="$event.stopPropagation()">
      <div class="modal-head">
        <div>
          <div class="modal-title">
            {{ editingTask ? TYPE_ICONS[editingTask.type] + ' ' + editingTask.title : t('onboardingBoard.taskForm.newTask') }}
          </div>
          @if (editingTask?.partner_name) {
            <div style="font-size:12px;color:var(--gray-400)">🤝 {{ editingTask!.partner_name }} · {{ t(STEP_LABELS[editingTask!.step]) }}</div>
          }
        </div>
        <button class="dp-close" (click)="closeTaskModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="fgrid2">
          <!-- Tytuł -->
          <div class="fg full">
            <label class="fl">{{ t('onboardingBoard.taskForm.title') }}</label>
            <input class="fi" [(ngModel)]="taskForm.title" [placeholder]="t('onboardingBoard.taskForm.titlePlaceholder')">
          </div>
          <!-- Typ -->
          <div class="fg">
            <label class="fl">{{ t('activity.modal.type') }}</label>
            <select class="fsel" [(ngModel)]="taskForm.type">
              @for (taskType of taskTypes; track taskType.value) {
                <option [value]="taskType.value">{{ taskType.icon }} {{ t(taskType.label) }}</option>
              }
            </select>
          </div>
          <!-- Krok -->
          <div class="fg">
            <label class="fl">{{ t('onboardingBoard.taskForm.step') }}</label>
            <select class="fsel" [(ngModel)]="taskForm.step">
              @for (s of [0,1,2,3]; track s) {
                <option [value]="s">{{ STEP_ICONS[s] }} {{ t(STEP_LABELS[s]) }}</option>
              }
            </select>
          </div>
          <!-- Data + godzina -->
          <div class="fg">
            <label class="fl">{{ t('onboardingBoard.taskForm.dueDate') }}</label>
            <input class="fi" type="date" [(ngModel)]="taskForm.due_date">
          </div>
          <div class="fg">
            <label class="fl">{{ t('onboardingBoard.taskForm.time') }} <span style="color:var(--gray-400);font-size:10px">{{ t('onboardingBoard.taskForm.timeHint') }}</span></label>
            <input class="fi" type="time" [(ngModel)]="taskForm.due_time">
          </div>
          <!-- Przypisany -->
          <div class="fg full">
            <label class="fl">{{ t('onboardingBoard.taskForm.assignedTo') }} <span style="color:var(--orange)">*</span></label>
            <select class="fsel" [(ngModel)]="taskForm.assigned_to">
              <option value="">{{ t('onboardingBoard.taskForm.choosePerson') }}</option>
              @for (u of crmUsers; track u.id) {
                <option [value]="u.id">{{ u.display_name }}</option>
              }
            </select>
          </div>
          <!-- Notatka -->
          <div class="fg full">
            <label class="fl">{{ t('onboardingBoard.taskForm.note') }}</label>
            <textarea class="fta" [(ngModel)]="taskForm.body" rows="2" [placeholder]="t('onboardingBoard.taskForm.notePlaceholder')"></textarea>
          </div>
          <!-- Status -->
          @if (editingTask) {
            <div class="fg full">
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
                <input type="checkbox" [(ngModel)]="taskForm.done" style="width:auto">
                ✅ {{ t('onboardingBoard.taskForm.done') }}
              </label>
            </div>
          }
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-g" (click)="closeTaskModal()">{{ 'actions.cancel' | transloco }}</button>
        @if (editingTask) {
          <button class="btn btn-d btn-sm" (click)="deleteTask()">🗑 {{ t('activity.card.delete') }}</button>
        }
        <button class="btn btn-p" [disabled]="!taskForm.title || saving()"
                (click)="saveTask()">
          {{ saving() ? t('leadsList.saving') : (editingTask ? t('activity.modal.saveChanges') : t('onboardingBoard.taskForm.create')) }}
        </button>
      </div>
    </div>
  </div>
}
</ng-container>
  `,
  styles: [`
    #topbar { display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--gray-200);flex-shrink:0;flex-wrap:wrap }
    .page-title { font-size:16px;font-weight:700;color:var(--gray-900);white-space:nowrap }
    .tsp { flex:1 }
    .srch { border:1px solid var(--gray-200);border-radius:8px;padding:6px 10px;font-size:12.5px;outline:none;width:180px }
    .sel { appearance:none; -webkit-appearance:none; background:var(--gray-100) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>") no-repeat right 10px center; border:1px solid var(--gray-200); border-radius:8px; padding:6px 30px 6px 10px; font-size:12.5px; color:var(--gray-700); outline:none; font-family:inherit; cursor:pointer; }
    .sel:focus { border-color:var(--orange); }
    .view-tabs { display:flex;border:1px solid var(--gray-200);border-radius:8px;overflow:hidden }
    .view-tabs button { padding:6px 12px;border:none;background:white;font-size:12px;cursor:pointer;color:var(--gray-600) }
    .view-tabs button.active { background:var(--orange);color:white;font-weight:600 }

    #content { flex:1;overflow:auto;padding:16px }
    .loading-state { display:flex;align-items:center;gap:10px;padding:40px;color:var(--gray-400);justify-content:center }
    .empty-state { text-align:center;padding:60px;color:var(--gray-400) }

    /* Partners Grid */
    .partners-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px }
    .partner-card { background:white;border:1px solid var(--gray-200);border-radius:12px;padding:16px;cursor:pointer;transition:box-shadow .15s,border-color .15s }
    .partner-card:hover { box-shadow:0 4px 14px rgba(0,0,0,.08);border-color:var(--orange-muted) }
    .pc-header { display:flex;align-items:flex-start;gap:10px;margin-bottom:12px }
    .pc-icon { font-size:24px }
    .pc-name { font-weight:700;font-size:15px }
    .pc-nip  { font-size:11px;color:var(--gray-400);font-family:monospace }
    .step-badge { background:var(--orange-pale);color:var(--orange-dark);border:1px solid var(--orange-muted);border-radius:8px;padding:2px 8px;font-size:11px;font-weight:700;white-space:nowrap }
    .pc-progress { display:flex;gap:4px;margin-bottom:10px }
    .pc-step { flex:1;text-align:center;padding:6px 2px;border-radius:6px;background:var(--gray-100);font-size:10px;color:var(--gray-500) }
    .pc-step.done   { background:#dcfce7;color:#166534 }
    .pc-step.active { background:var(--orange-pale);color:var(--orange-dark);font-weight:700;border:1px solid var(--orange) }
    .pc-step-lbl { display:block;font-size:9px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
    .pc-tasks { display:flex;align-items:center;gap:8px;margin-bottom:6px }
    .pc-task-bar { flex:1;height:6px;background:var(--gray-200);border-radius:3px;overflow:hidden }
    .pc-task-fill { height:100%;background:#22c55e;border-radius:3px;transition:width .3s }
    .pc-task-text { font-size:11px;color:var(--gray-500);white-space:nowrap }
    .pc-mgr { font-size:11px;color:var(--gray-400) }
    .launch-btn { border:1px solid var(--gray-300);background:var(--gray-100);color:var(--gray-400);border-radius:8px;padding:6px 14px;font-size:12px;font-weight:600;cursor:not-allowed;transition:all .15s }
    .launch-btn.launch-ready { background:var(--orange);border-color:var(--orange);color:white;cursor:pointer }
    .launch-btn.launch-ready:hover { background:var(--orange-dark) }
    .launch-btn:disabled:not(.launch-ready) { opacity:.6 }

    /* Partners sub-toolbar */
    .partners-toolbar { display:flex;gap:6px;margin-bottom:12px }
    .btn-view { background:none;border:1px solid var(--gray-200);border-radius:7px;padding:5px 12px;font-size:12px;cursor:pointer;color:var(--gray-500) }
    .btn-view.active { background:var(--orange-pale);border-color:var(--orange);color:var(--orange-dark);font-weight:700 }

    /* Partners table */
    .pt-wrap { background:white;border:1px solid var(--gray-200);border-radius:10px;overflow:hidden }
    .pt-head { display:grid;grid-template-columns:2fr 130px 160px 180px 140px 90px 150px;background:var(--gray-50);border-bottom:2px solid var(--gray-200);padding:0 12px }
    .pt-th { padding:9px 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-400);display:flex;align-items:center;gap:4px }
    .pt-th.sortable { cursor:pointer;user-select:none }
    .pt-th.sortable:hover { color:var(--gray-700) }
    .si { font-size:10px;color:var(--gray-300) }
    .pt-row { display:grid;grid-template-columns:2fr 130px 160px 180px 140px 90px 150px;padding:0 12px;border-bottom:1px solid var(--gray-100);cursor:pointer;transition:background .1s }
    .pt-row:last-child { border-bottom:none }
    .pt-row:hover { background:var(--orange-pale) }
    .pt-td { padding:10px 10px;font-size:13px;color:var(--gray-700);display:flex;flex-direction:column;justify-content:center;gap:2px }
    .pt-company { font-weight:600;color:var(--gray-900) }
    .pt-nip { font-size:10px;color:var(--gray-400);font-family:monospace;display:none }
    .pt-mono { font-family:monospace;font-size:12px;color:var(--gray-500) }
    .pt-step-name { font-size:10px;color:var(--gray-400) }
    .pt-progress-cell { flex-direction:row !important;align-items:center;gap:8px }
    .pt-bar { flex:1;height:6px;background:var(--gray-200);border-radius:3px;overflow:hidden }
    .pt-fill { height:100%;background:#22c55e;border-radius:3px;transition:width .3s }
    .pt-prog-txt { font-size:11px;color:var(--gray-500);white-space:nowrap }
    .pt-date { font-size:12px;color:var(--gray-500) }

    /* Kanban */
    .kanban-wrap { display:flex;gap:12px;height:calc(100vh - 140px);overflow-x:auto }
    .kb-col { width:260px;flex-shrink:0;display:flex;flex-direction:column;background:var(--gray-50);border-radius:10px;overflow:hidden }
    .kb-head { display:flex;align-items:center;gap:6px;padding:10px 12px;background:white;border-bottom:1px solid var(--gray-200);font-weight:600;font-size:13px }
    .kb-icon { font-size:16px }
    .kb-title { flex:1 }
    .kb-cnt { background:var(--gray-200);border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700 }
    .kb-cards { flex:1;overflow-y:auto;padding:8px }
    .kb-card { background:white;border:1px solid var(--gray-200);border-radius:8px;padding:10px;margin-bottom:8px;cursor:pointer;transition:box-shadow .12s }
    .kb-card:hover { box-shadow:0 2px 8px rgba(0,0,0,.08);border-color:var(--orange-muted) }
    .kb-card.done { opacity:.6;background:var(--gray-50) }
    .kb-card-top { display:flex;align-items:center;gap:6px;margin-bottom:4px }
    .type-icon { font-size:14px }
    .kb-partner { flex:1;font-size:10px;color:var(--gray-400);overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
    .kb-card-title { font-size:12.5px;font-weight:600;color:var(--gray-800);margin-bottom:4px }
    .kb-due { font-size:11px;color:var(--gray-400) }
    .kb-due.overdue { color:#ef4444;font-weight:600 }
    .kb-assignee { font-size:11px;color:var(--gray-400);margin-top:2px }
    .kb-empty { text-align:center;font-size:12px;color:var(--gray-400);padding:16px }
    .kb-add { width:100%;border:1px dashed var(--gray-300);background:none;border-radius:6px;padding:6px;font-size:12px;color:var(--gray-400);cursor:pointer;margin-top:4px }
    .kb-card-actions { display:flex;justify-content:flex-end;margin-top:4px }
    .kb-del-btn { background:none;border:none;font-size:12px;cursor:pointer;opacity:.3;padding:2px 4px;border-radius:4px }
    .kb-del-btn:hover { opacity:1;background:#fee2e2 }
    .kb-add:hover { border-color:var(--orange);color:var(--orange) }
    .done-badge { background:#dcfce7;color:#166534;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700 }

    /* Timeline */
    .timeline-wrap { max-width:720px;margin:0 auto;padding-bottom:40px }
    .tl-group { margin-bottom:24px }
    .tl-date-label { display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px }
    .tl-date-label.tl-today { color:var(--orange) }
    .tl-date-label.tl-past  { color:var(--gray-300) }
    .tl-dot { width:10px;height:10px;border-radius:50%;background:var(--gray-300);flex-shrink:0 }
    .tl-today .tl-dot { background:var(--orange) }
    .today-tag { background:var(--orange);color:white;border-radius:4px;padding:1px 6px;font-size:10px }
    .tl-item { display:flex;gap:12px;padding:10px 12px;background:white;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:6px;cursor:pointer;transition:border-color .12s }
    .tl-item:hover { border-color:var(--orange-muted) }
    .tl-item.tl-done { opacity:.6 }
    .tl-time { font-size:12px;font-weight:700;color:var(--gray-600);width:44px;flex-shrink:0;padding-top:2px }
    .tl-content { flex:1 }
    .tl-top { display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;margin-bottom:2px }
    .tl-meta { font-size:11px;color:var(--gray-400) }
    .tl-partner { font-weight:600;color:var(--gray-600) }

    /* Calendar */
    .cal-wrap { background:white;border-radius:12px;border:1px solid var(--gray-200);overflow:hidden }
    .cal-nav { display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--gray-200) }
    .cal-month-label { font-size:15px;font-weight:700;flex:1;text-align:center }
    .cal-grid { display:grid;grid-template-columns:repeat(7,1fr) }
    .cal-dow  { text-align:center;padding:8px 4px;font-size:11px;font-weight:600;color:var(--gray-500);border-bottom:1px solid var(--gray-200) }
    .cal-cell { min-height:90px;padding:4px;border-right:1px solid var(--gray-100);border-bottom:1px solid var(--gray-100);overflow:hidden }
    .cal-cell.cal-other { background:var(--gray-50) }
    .cal-cell.cal-today { background:var(--orange-pale) }
    .cal-day-num { font-size:11px;font-weight:600;color:var(--gray-400);margin-bottom:3px }
    .cal-today .cal-day-num { color:var(--orange);font-weight:700 }
    .cal-event { font-size:10px;padding:2px 4px;border-radius:4px;margin-bottom:2px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#eff6ff;color:#1d4ed8 }
    .cal-event.cal-done { opacity:.5;text-decoration:line-through }
    .cal-step-0 { background:#fef3c7;color:#92400e }
    .cal-step-1 { background:#ede9fe;color:#5b21b6 }
    .cal-step-2 { background:#dcfce7;color:#166534 }
    .cal-step-3 { background:#ffedd5;color:#9a3412 }

    /* Modal */
    .overlay { position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:200;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px) }
    .modal { background:white;border-radius:14px;width:520px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2) }
    .modal-head { display:flex;align-items:flex-start;gap:12px;padding:18px 20px;border-bottom:1px solid var(--gray-200) }
    .modal-title { font-size:15px;font-weight:700 }
    .dp-close { background:none;border:none;font-size:18px;color:var(--gray-400);cursor:pointer;margin-left:auto;line-height:1 }
    .modal-body { padding:20px }
    .modal-foot { padding:14px 20px;border-top:1px solid var(--gray-200);display:flex;gap:8px;justify-content:flex-end }
    .fgrid2 { display:grid;grid-template-columns:1fr 1fr;gap:12px }
    .fg { display:flex;flex-direction:column }
    .fg.full { grid-column:1/-1 }
    .fl { font-size:12px;font-weight:600;color:var(--gray-700);margin-bottom:4px }
    .fi  { border:1px solid var(--gray-200);border-radius:6px;padding:7px 10px;font-size:13px;outline:none;font-family:inherit }
    .fsel{ border:1px solid var(--gray-200);border-radius:6px;padding:7px 10px;font-size:13px;outline:none;background:white }
    .fta { border:1px solid var(--gray-200);border-radius:6px;padding:7px 10px;font-size:13px;outline:none;font-family:inherit;resize:vertical }
    .btn { border:none;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer }
    .btn-g { background:var(--gray-100);color:var(--gray-700) }
    .btn-g:hover { background:var(--gray-200) }
    .btn-p { background:var(--orange);color:white }
    .btn-p:hover { background:var(--orange-dark) }
    .btn-p:disabled { opacity:.5;cursor:not-allowed }
    .btn-d { background:#fee2e2;color:#991b1b }
    .btn-sm { padding:5px 10px;font-size:12px }
  `],
})
export class CrmOnboardingComponent implements OnInit {
  private api      = inject(CrmApiService);
  private settings = inject(AppSettingsService);
  private auth     = inject(AuthService);
  private toast    = inject(ToastService);
  private cdr      = inject(ChangeDetectorRef);
  private zone     = inject(NgZone);
  private route    = inject(ActivatedRoute);
  private transloco = inject(TranslocoService);
  private locale   = inject(LocaleService);

  readonly STEP_LABELS = STEP_LABELS;
  readonly STEP_ICONS  = STEP_ICONS;
  readonly TYPE_ICONS  = TYPE_ICONS;

  // 1 January 2024 is a Monday — the calendar grid starts the week on Monday.
  readonly weekdayLabels = Array.from({ length: 7 }, (_, dayOffset) =>
    new Date(2024, 0, 1 + dayOffset).toLocaleDateString(this.locale.activeLocale(), { weekday: 'short' }));

  // ── State ──────────────────────────────────────────────────────────────────
  view: 'partners' | 'kanban' | 'timeline' | 'calendar' = 'partners';
  partnersView: 'cards' | 'table' = 'cards';
  partnerSortCol = signal('company');
  partnerSortDir = signal<'asc' | 'desc'>('asc');
  partners        = signal<OnboardingPartner[]>([]);
  allTasks        = signal<OnboardingTask[]>([]);
  crmUsers: CrmUser[] = [];
  loadingPartners = signal(true);
  loadingTasks    = signal(false);
  saving          = signal(false);
  launching       = signal<string | null>(null);
  launchResult    = signal<{ company: string; id: string } | null>(null);

  // Filters
  search        = signal('');
  filterPartner = signal<any>('');
  filterUser    = signal('');
  private searchTimer: any;

  // Calendar state — signals so calCells computed() reacts
  calYear  = signal(new Date().getFullYear());
  calMonth = signal(new Date().getMonth()); // 0-based

  // Task modal
  showTaskModal = false;
  editingTask: OnboardingTask | null = null;
  newTaskStep  = 0;
  taskForm: any = {};

  readonly taskTypes = Object.entries(TYPE_LABELS).map(([value, label]) => ({
    value, label, icon: TYPE_ICONS[value],
  }));

  get isManager(): boolean {
    const u = this.auth.user() as any;
    return !!(u?.is_admin || u?.crm_role === 'sales_manager');
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  filteredPartners = computed(() => {
    let list = this.partners();
    const q  = this.search().trim().toLowerCase();
    const fp = this.filterPartner();
    if (q.length >= 3) {
      list = list.filter(p =>
        p.company.toLowerCase().includes(q) ||
        (p.nip || '').toLowerCase().includes(q)
      );
    }
    if (fp) list = list.filter(p => String(p.id) === String(fp));
    return list;
  });

  filteredTasks = computed(() => {
    let list = this.allTasks();
    const fp = this.filterPartner();
    const fu = this.filterUser();
    if (fp) list = list.filter(t => String(t.partner_id) === String(fp));
    if (fu) list = list.filter(t => t.assigned_to === fu);
    return list;
  });

  sortedPartners = computed(() => {
    const col = this.partnerSortCol();
    const dir = this.partnerSortDir();
    return [...this.filteredPartners()].sort((a, b) => {
      let va: any = (a as any)[col] ?? '';
      let vb: any = (b as any)[col] ?? '';
      if (col === 'onboarding_step' || col === 'task_count' || col === 'done_count') {
        return dir === 'asc' ? +va - +vb : +vb - +va;
      }
      if (col === 'created_at') {
        return dir === 'asc'
          ? new Date(va).getTime() - new Date(vb).getTime()
          : new Date(vb).getTime() - new Date(va).getTime();
      }
      const cmp = String(va).localeCompare(String(vb), this.locale.activeLocale(), { sensitivity: 'base' });
      return dir === 'asc' ? cmp : -cmp;
    });
  });

  sortPartnersBy(col: string): void {
    if (this.partnerSortCol() === col) {
      this.partnerSortDir.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.partnerSortCol.set(col);
      this.partnerSortDir.set('asc');
    }
  }

  partnerSortIcon(col: string): string {
    if (this.partnerSortCol() !== col) return '↕';
    return this.partnerSortDir() === 'asc' ? '↑' : '↓';
  }

  tasksForStep(step: number): OnboardingTask[] {
    return this.filteredTasks().filter(t => t.step === step);
  }

  timelineGroups = computed(() => {
    const tasks = this.filteredTasks().filter(t => t.due_date);
    const map   = new Map<string, OnboardingTask[]>();
    for (const t of tasks) {
      const key = String(t.due_date!).slice(0, 10); // normalize ISO to YYYY-MM-DD
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    const today = new Date(); today.setHours(0,0,0,0);
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, tasks]) => {
        const d = new Date(date + 'T00:00:00');
        const isToday = d.getTime() === today.getTime();
        const isPast  = d < today;
        return {
          date,
          label: d.toLocaleDateString(this.locale.activeLocale(), { weekday:'long', day:'numeric', month:'long' }),
          isToday, isPast,
          tasks: tasks.sort((a, b) => (a.due_time || '09:00').localeCompare(b.due_time || '09:00')),
        };
      });
  });

  calMonthLabel = computed(() => {
    return new Date(this.calYear(), this.calMonth(), 1)
      .toLocaleDateString(this.locale.activeLocale(), { month: 'long', year: 'numeric' });
  });

  calCells = computed(() => {
    const tasks = this.filteredTasks().filter(t => t.due_date);
    const taskMap = new Map<string, OnboardingTask[]>();
    for (const t of tasks) {
      const key = String(t.due_date!).slice(0, 10); // normalize ISO to YYYY-MM-DD
      if (!taskMap.has(key)) taskMap.set(key, []);
      taskMap.get(key)!.push(t);
    }

    const localKey = (dt: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
    };

    const today    = new Date(); today.setHours(0,0,0,0);
    const firstDay = new Date(this.calYear(), this.calMonth(), 1);
    const lastDay  = new Date(this.calYear(), this.calMonth() + 1, 0);

    // Start on Monday
    let startDow = firstDay.getDay(); // 0=Sun
    startDow = startDow === 0 ? 6 : startDow - 1;

    const cells = [];
    // Prev month fill
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(firstDay); d.setDate(d.getDate() - i - 1);
      const key = localKey(d);
      cells.push({ key, day: d.getDate(), inMonth: false, isToday: false, tasks: taskMap.get(key) || [] });
    }
    // Current month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date   = new Date(this.calYear(), this.calMonth(), d);
      const key    = localKey(date);
      const isToday = date.getTime() === today.getTime();
      cells.push({ key, day: d, inMonth: true, isToday, tasks: taskMap.get(key) || [] });
    }
    // Next month fill to complete 6 rows
    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(lastDay); d.setDate(d.getDate() + i);
      const key = localKey(d);
      cells.push({ key, day: d.getDate(), inMonth: false, isToday: false, tasks: taskMap.get(key) || [] });
    }
    return cells;
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  ngOnInit(): void {
    // Check query param for pre-selected partner (from partner migration)
    const pid = this.route.snapshot.queryParamMap.get('partner');
    if (pid) {
      this.filterPartner.set(pid);
      this.view = 'kanban';
    }

    this.loadPartners();
    this.loadTasks();
    if (this.isManager) {
      this.api.getCrmUsers().subscribe({
        next: u => { this.zone.run(() => { this.crmUsers = u; this.cdr.markForCheck(); }); },
        error: () => {},
      });
    }
  }

  loadPartners(): void {
    this.loadingPartners.set(true);
    this.api.getOnboardingPartners().subscribe({
      next: list => this.zone.run(() => {
        this.partners.set(list);
        this.loadingPartners.set(false);
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => { this.loadingPartners.set(false); this.cdr.markForCheck(); }),
    });
  }

  loadTasks(): void {
    this.loadingTasks.set(true);
    this.api.getOnboardingAllTasks().subscribe({
      next: list => this.zone.run(() => {
        this.allTasks.set(list);
        this.loadingTasks.set(false);
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => { this.loadingTasks.set(false); this.cdr.markForCheck(); }),
    });
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  onSearch(): void { this.cdr.markForCheck(); }
  applyFilters(): void { this.cdr.markForCheck(); }
  onFilterChange(): void { this.cdr.markForCheck(); }

  selectPartner(p: OnboardingPartner): void {
    this.filterPartner.set(p.id);
    this.view = 'kanban';
    this.cdr.markForCheck();
  }

  prevMonth(): void {
    if (this.calMonth() === 0) { this.calMonth.set(11); this.calYear.update(y => y - 1); }
    else this.calMonth.update(m => m - 1);
  }
  nextMonth(): void {
    if (this.calMonth() === 11) { this.calMonth.set(0); this.calYear.update(y => y + 1); }
    else this.calMonth.update(m => m + 1);
  }

  calendarEntryOf(task: OnboardingTask): CalendarEntry | null {
    return dueDateCalendarEntry({
      title: task.partner_name ? `${task.title} — ${task.partner_name}` : task.title,
      description: task.body ?? '',
      path: `/crm/onboarding?partner=${task.partner_id}`,
      dueDate: task.due_date,
      dueTime: task.due_time,
    });
  }

  isOverdue(t: OnboardingTask): boolean {
    if (!t.due_date || t.done) return false;
    return new Date(t.due_date + 'T23:59:59') < new Date();
  }

  openTask(t: OnboardingTask): void {
    this.editingTask = t;
    this.taskForm = {
      title:       t.title,
      type:        t.type,
      step:        t.step,
      due_date:    t.due_date ? String(t.due_date).slice(0, 10) : '',
      due_time:    t.due_time ? String(t.due_time).slice(0, 5) : '',
      assigned_to: t.assigned_to || '',
      body:        t.body || '',
      done:        t.done,
    };
    this.showTaskModal = true;
    this.cdr.markForCheck();
  }

  openNewTask(step: number): void {
    this.editingTask = null;
    this.newTaskStep = step;
    // Try to prefill from templates
    const templates = this.getTemplatesForStep(step);
    this.taskForm = {
      title:       templates[0]?.title || '',
      type:        templates[0]?.type  || 'task',
      step,
      due_date:    '',
      due_time:    '',
      assigned_to: '',
      body:        '',
      done:        false,
    };
    this.showTaskModal = true;
    this.cdr.markForCheck();
  }

  closeTaskModal(): void {
    this.showTaskModal = false;
    this.editingTask   = null;
    this.cdr.markForCheck();
  }

  saveTask(): void {
    if (!this.taskForm.title || this.saving()) return;
    this.saving.set(true);

    const payload: Partial<OnboardingTask> = {
      title:       this.taskForm.title,
      type:        this.taskForm.type,
      step:        +this.taskForm.step,
      due_date:    this.taskForm.due_date || null,
      due_time:    this.taskForm.due_time || null,
      assigned_to: this.taskForm.assigned_to || null,
      body:        this.taskForm.body || null,
      done:        this.taskForm.done,
    };

    const partnerId = this.editingTask?.partner_id || this.filterPartner();
    if (!partnerId) { this.saving.set(false); return; }

    const obs = this.editingTask
      ? this.api.updateOnboardingTask(partnerId, this.editingTask.id, payload)
      : this.api.createOnboardingTask(partnerId, payload);

    obs.subscribe({
      next: () => this.zone.run(() => {
        this.saving.set(false);
        this.closeTaskModal();
        this.loadTasks();
        this.loadPartners();
        this.toast.success(this.transloco.translate(this.editingTask ? 'crm.onboardingBoard.toasts.taskUpdated' : 'crm.onboardingBoard.toasts.taskAdded'));
      }),
      error: () => this.zone.run(() => {
        this.saving.set(false);
        this.toast.error(this.transloco.translate('crm.onboardingBoard.toasts.taskSaveFailed'));
        this.cdr.markForCheck();
      }),
    });
  }

  deleteTask(): void {
    if (!this.editingTask) return;
    this.quickDeleteTask(this.editingTask, () => this.closeTaskModal());
  }

  launchPartner(p: OnboardingPartner): void {
    if (p.done_count < p.task_count) return;
    if (!confirm(this.transloco.translate('crm.onboardingBoard.launch.confirm', { company: p.company }))) return;
    this.launching.set(p.id);
    this.api.updatePartner(p.id, { status: 'active' } as any).subscribe({
      next: () => this.zone.run(() => {
        this.launching.set(null);
        this.launchResult.set({ company: p.company, id: p.id });
        this.loadPartners();
        this.loadTasks();
      }),
      error: (err: any) => this.zone.run(() => {
        this.launching.set(null);
        this.toast.error(err?.error?.error ?? this.transloco.translate('crm.onboardingBoard.launch.failed'));
        this.cdr.markForCheck();
      }),
    });
  }

  quickDeleteTask(t: OnboardingTask, onDone?: () => void): void {
    if (!confirm(this.transloco.translate('crm.partnerDetail.onboarding.deleteTaskConfirm', { title: t.title }))) return;
    this.api.deleteOnboardingTask(t.partner_id, t.id).subscribe({
      next: () => this.zone.run(() => {
        if (onDone) onDone();
        this.loadTasks();
        this.toast.success(this.transloco.translate('crm.onboardingBoard.toasts.taskDeleted'));
      }),
      error: () => this.toast.error(this.transloco.translate('crm.onboardingBoard.toasts.taskDeleteFailed')),
    });
  }

  private getTemplatesForStep(step: number): OnboardingTaskTemplate[] {
    try {
      const raw = this.settings.settings()?.['onboarding_task_templates'];
      if (raw) {
        const all: OnboardingTaskTemplate[] = JSON.parse(String(raw));
        return all.filter(t => t.step === step);
      }
    } catch { }
    return [];
  }
}
