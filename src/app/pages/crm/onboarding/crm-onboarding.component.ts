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

const STEP_LABELS = ['Podpisanie umowy', 'Konfiguracja', 'Szkolenie', 'Uruchomienie'];
const STEP_ICONS  = ['📝', '⚙️', '🎓', '🚀'];
const TYPE_ICONS: Record<string, string> = {
  task:'✅', call:'📞', email:'📧', meeting:'🤝', note:'📝',
  doc_sent:'📄', training:'🎓',
};
const TYPE_LABELS: Record<string, string> = {
  task:'Zadanie', call:'Telefon', email:'Email', meeting:'Spotkanie',
  note:'Notatka', doc_sent:'Dokument', training:'Szkolenie',
};

@Component({
  selector: 'wt-crm-onboarding',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
<div id="topbar">
  <span class="page-title">🚀 Onboarding partnerów</span>
  <span class="tsp"></span>
  <!-- Filtry globalne -->
  <input class="srch" type="search" placeholder="Szukaj partnera, NIP…"
         [ngModel]="search()" (ngModelChange)="search.set($event); onFilterChange()">
  <select class="sel" [ngModel]="filterPartner()" (ngModelChange)="filterPartner.set($event); onFilterChange()">
    <option value="">Wszyscy partnerzy</option>
    @for (p of partners(); track p.id) {
      <option [value]="p.id">{{ p.company }}</option>
    }
  </select>
  <select class="sel" [ngModel]="filterUser()" (ngModelChange)="filterUser.set($event); onFilterChange()" *ngIf="isManager">
    <option value="">Wszyscy przypisani</option>
    @for (u of crmUsers; track u.id) {
      <option [value]="u.id">{{ u.display_name }}</option>
    }
  </select>
  <div class="view-tabs">
    <button [class.active]="view==='partners'" (click)="view='partners'">🏢 Partnerzy</button>
    <button [class.active]="view==='kanban'"   (click)="view='kanban'">📋 Kanban</button>
    <button [class.active]="view==='timeline'" (click)="view='timeline'">📅 Timeline</button>
    <button [class.active]="view==='calendar'" (click)="view='calendar'">🗓 Kalendarz</button>
  </div>
</div>

<div id="content">

  <!-- ════ PARTNERS LIST ════ -->
  @if (view === 'partners') {
    <div class="partners-grid">
      @if (loadingPartners()) {
        <div class="loading-state"><div class="spinner"></div></div>
      } @else if (filteredPartners().length === 0) {
        <div class="empty-state">
          <div style="font-size:48px">🎉</div>
          <div style="font-weight:600;margin-top:8px">Brak partnerów w procesie wdrożenia</div>
          <div style="font-size:12px;color:var(--gray-400);margin-top:4px">Partnerzy trafiają tutaj po migracji z leada</div>
        </div>
      } @else {
        @for (p of filteredPartners(); track p.id) {
          <div class="partner-card" (click)="selectPartner(p)">
            <div class="pc-header">
              <div class="pc-icon">🤝</div>
              <div style="flex:1;min-width:0">
                <div class="pc-name">{{ p.company }}</div>
                @if (p.nip) { <div class="pc-nip">NIP: {{ p.nip }}</div> }
              </div>
              <span class="step-badge">Krok {{ p.onboarding_step + 1 }}/4</span>
            </div>
            <!-- Progress bar -->
            <div class="pc-progress">
              @for (s of [0,1,2,3]; track s) {
                <div class="pc-step" [class.done]="s < p.onboarding_step" [class.active]="s === p.onboarding_step">
                  <span>{{ STEP_ICONS[s] }}</span>
                  <span class="pc-step-lbl">{{ STEP_LABELS[s] }}</span>
                </div>
              }
            </div>
            <!-- Task progress -->
            <div class="pc-tasks">
              <div class="pc-task-bar">
                <div class="pc-task-fill"
                     [style.width.%]="p.task_count ? (p.done_count / p.task_count * 100) : 0">
                </div>
              </div>
              <span class="pc-task-text">{{ p.done_count }}/{{ p.task_count }} zadań</span>
            </div>
            @if (p.manager_name) {
              <div class="pc-mgr">👤 {{ p.manager_name }}</div>
            }
            <div style="margin-top:10px;display:flex;justify-content:flex-end">
              <button class="launch-btn"
                      [class.launch-ready]="p.task_count > 0 && p.done_count === p.task_count"
                      [disabled]="p.task_count === 0 || p.done_count < p.task_count || launching() === p.id"
                      (click)="$event.stopPropagation(); launchPartner(p)"
                      [title]="p.task_count === 0 ? 'Brak zadań' : p.done_count < p.task_count ? 'Pozostało ' + (p.task_count - p.done_count) + ' nieukończonych zadań' : 'Przenieś do Rejestru Partnerów'">
                @if (launching() === p.id) {
                  ⏳ Uruchamianie…
                } @else if (p.task_count > 0 && p.done_count === p.task_count) {
                  🚀 Uruchomienie
                } @else {
                  🔒 Uruchomienie ({{ p.done_count }}/{{ p.task_count }})
                }
              </button>
            </div>
          </div>
        }
      }
    </div>
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
              <span class="kb-title">{{ STEP_LABELS[step] }}</span>
              <span class="kb-cnt">{{ tasksForStep(step).length }}</span>
            </div>
            <div class="kb-cards">
              @for (t of tasksForStep(step); track t.id) {
                <div class="kb-card" [class.done]="t.done" (click)="openTask(t)">
                  <div class="kb-card-top">
                    <span class="type-icon">{{ TYPE_ICONS[t.type] }}</span>
                    <span class="kb-partner">{{ t.partner_name }}</span>
                    @if (t.done) { <span class="done-badge">✓</span> }
                  </div>
                  <div class="kb-card-title">{{ t.title }}</div>
                  @if (t.due_date) {
                    <div class="kb-due" [class.overdue]="isOverdue(t)">
                      📅 {{ t.due_date | date:'dd.MM' }}
                      @if (t.due_time) { {{ t.due_time.slice(0,5) }} }
                      @else { 09:00 }
                    </div>
                  }
                  @if (t.assigned_to_name) {
                    <div class="kb-assignee">👤 {{ t.assigned_to_name }}</div>
                  }
                  <div class="kb-card-actions">
                    <button class="kb-del-btn" (click)="$event.stopPropagation(); quickDeleteTask(t)"
                            title="Usuń zadanie">🗑</button>
                  </div>
                </div>
              }
              @if (tasksForStep(step).length === 0) {
                <div class="kb-empty">Brak zadań</div>
              }
              <!-- Dodaj zadanie -->
              @if (filterPartner()) {
                <button class="kb-add" (click)="openNewTask(step)">+ Dodaj zadanie</button>
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
            <div style="margin-top:8px;font-weight:600">Brak zadań z datą wykonania</div>
          </div>
        }
        @for (g of timelineGroups(); track g.date) {
          <div class="tl-group">
            <div class="tl-date-label" [class.tl-today]="g.isToday" [class.tl-past]="g.isPast">
              <span class="tl-dot"></span>
              {{ g.label }}
              @if (g.isToday) { <span class="today-tag">DZIŚ</span> }
            </div>
            @for (t of g.tasks; track t.id) {
              <div class="tl-item" [class.tl-done]="t.done" (click)="openTask(t)">
                <div class="tl-time">
                  {{ t.due_time ? t.due_time.slice(0,5) : '09:00' }}
                </div>
                <div class="tl-content">
                  <div class="tl-top">
                    <span>{{ TYPE_ICONS[t.type] }} {{ t.title }}</span>
                    @if (t.done) { <span class="done-badge">✓</span> }
                  </div>
                  <div class="tl-meta">
                    <span class="tl-partner">🤝 {{ t.partner_name }}</span>
                    @if (t.assigned_to_name) { <span>· 👤 {{ t.assigned_to_name }}</span> }
                    <span>· {{ STEP_LABELS[t.step] }}</span>
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
          @for (d of ['Pn','Wt','Śr','Cz','Pt','Sb','Nd']; track d) {
            <div class="cal-dow">{{ d }}</div>
          }
          @for (cell of calCells(); track cell.key) {
            <div class="cal-cell" [class.cal-other]="!cell.inMonth"
                 [class.cal-today]="cell.isToday">
              <div class="cal-day-num">{{ cell.day }}</div>
              @for (t of cell.tasks; track t.id) {
                <div class="cal-event" [class.cal-done]="t.done"
                     [class]="'cal-step-'+t.step"
                     (click)="openTask(t)"
                     [title]="t.partner_name + ': ' + t.title">
                  {{ TYPE_ICONS[t.type] }} {{ t.title | slice:0:18 }}
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
            {{ editingTask ? TYPE_ICONS[editingTask.type] + ' ' + editingTask.title : 'Nowe zadanie' }}
          </div>
          @if (editingTask?.partner_name) {
            <div style="font-size:12px;color:var(--gray-400)">🤝 {{ editingTask!.partner_name }} · {{ STEP_LABELS[editingTask!.step] }}</div>
          }
        </div>
        <button class="dp-close" (click)="closeTaskModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="fgrid2">
          <!-- Tytuł -->
          <div class="fg full">
            <label class="fl">Tytuł zadania</label>
            <input class="fi" [(ngModel)]="taskForm.title" placeholder="Nazwa zadania">
          </div>
          <!-- Typ -->
          <div class="fg">
            <label class="fl">Typ</label>
            <select class="fsel" [(ngModel)]="taskForm.type">
              @for (t of taskTypes; track t.value) {
                <option [value]="t.value">{{ t.icon }} {{ t.label }}</option>
              }
            </select>
          </div>
          <!-- Krok -->
          <div class="fg">
            <label class="fl">Krok procesu</label>
            <select class="fsel" [(ngModel)]="taskForm.step">
              @for (s of [0,1,2,3]; track s) {
                <option [value]="s">{{ STEP_ICONS[s] }} {{ STEP_LABELS[s] }}</option>
              }
            </select>
          </div>
          <!-- Data + godzina -->
          <div class="fg">
            <label class="fl">Data wykonania</label>
            <input class="fi" type="date" [(ngModel)]="taskForm.due_date">
          </div>
          <div class="fg">
            <label class="fl">Godzina <span style="color:var(--gray-400);font-size:10px">(opcjonalna, def. 09:00)</span></label>
            <input class="fi" type="time" [(ngModel)]="taskForm.due_time">
          </div>
          <!-- Przypisany -->
          <div class="fg full">
            <label class="fl">Przypisany do <span style="color:var(--orange)">*</span></label>
            <select class="fsel" [(ngModel)]="taskForm.assigned_to">
              <option value="">— wybierz osobę —</option>
              @for (u of crmUsers; track u.id) {
                <option [value]="u.id">{{ u.display_name }}</option>
              }
            </select>
          </div>
          <!-- Notatka -->
          <div class="fg full">
            <label class="fl">Notatka</label>
            <textarea class="fta" [(ngModel)]="taskForm.body" rows="2" placeholder="Dodatkowe informacje…"></textarea>
          </div>
          <!-- Status -->
          @if (editingTask) {
            <div class="fg full">
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
                <input type="checkbox" [(ngModel)]="taskForm.done" style="width:auto">
                ✅ Zadanie wykonane
              </label>
            </div>
          }
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-g" (click)="closeTaskModal()">Anuluj</button>
        @if (editingTask) {
          <button class="btn btn-d btn-sm" (click)="deleteTask()">🗑 Usuń</button>
        }
        <button class="btn btn-p" [disabled]="!taskForm.title || saving()"
                (click)="saveTask()">
          {{ saving() ? 'Zapisywanie…' : (editingTask ? 'Zapisz zmiany' : 'Utwórz zadanie') }}
        </button>
      </div>
    </div>
  </div>
}
  `,
  styles: [`
    #topbar { display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--gray-200);flex-shrink:0;flex-wrap:wrap }
    .page-title { font-size:16px;font-weight:700;color:var(--gray-900);white-space:nowrap }
    .tsp { flex:1 }
    .srch { border:1px solid var(--gray-200);border-radius:8px;padding:6px 10px;font-size:12.5px;outline:none;width:180px }
    .sel  { border:1px solid var(--gray-200);border-radius:8px;padding:6px 10px;font-size:12.5px;outline:none }
    .view-tabs { display:flex;border:1px solid var(--gray-200);border-radius:8px;overflow:hidden }
    .view-tabs button { padding:6px 12px;border:none;background:white;font-size:12px;cursor:pointer;color:var(--gray-600) }
    .view-tabs button.active { background:var(--orange);color:white;font-weight:600 }

    #content { flex:1;overflow:auto;padding:16px }
    .loading-state { display:flex;align-items:center;gap:10px;padding:40px;color:var(--gray-400);justify-content:center }
    .empty-state { text-align:center;padding:60px;color:var(--gray-400) }

    /* Partners Grid */
    .partners-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px }
    .partner-card { background:white;border:1px solid var(--gray-200);border-radius:12px;padding:16px;cursor:pointer;transition:box-shadow .15s,border-color .15s }
    .partner-card:hover { box-shadow:0 4px 14px rgba(0,0,0,.08);border-color:#fed7aa }
    .pc-header { display:flex;align-items:flex-start;gap:10px;margin-bottom:12px }
    .pc-icon { font-size:24px }
    .pc-name { font-weight:700;font-size:15px }
    .pc-nip  { font-size:11px;color:var(--gray-400);font-family:monospace }
    .step-badge { background:#fff7ed;color:#f97316;border:1px solid #fed7aa;border-radius:8px;padding:2px 8px;font-size:11px;font-weight:700;white-space:nowrap }
    .pc-progress { display:flex;gap:4px;margin-bottom:10px }
    .pc-step { flex:1;text-align:center;padding:6px 2px;border-radius:6px;background:var(--gray-100);font-size:10px;color:var(--gray-500) }
    .pc-step.done   { background:#dcfce7;color:#166534 }
    .pc-step.active { background:#fff7ed;color:#f97316;font-weight:700;border:1px solid #fed7aa }
    .pc-step-lbl { display:block;font-size:9px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
    .pc-tasks { display:flex;align-items:center;gap:8px;margin-bottom:6px }
    .pc-task-bar { flex:1;height:6px;background:var(--gray-200);border-radius:3px;overflow:hidden }
    .pc-task-fill { height:100%;background:#22c55e;border-radius:3px;transition:width .3s }
    .pc-task-text { font-size:11px;color:var(--gray-500);white-space:nowrap }
    .pc-mgr { font-size:11px;color:var(--gray-400) }
    .launch-btn { border:1px solid var(--gray-300);background:var(--gray-100);color:var(--gray-400);border-radius:8px;padding:6px 14px;font-size:12px;font-weight:600;cursor:not-allowed;transition:all .15s }
    .launch-btn.launch-ready { background:#f97316;border-color:#f97316;color:white;cursor:pointer }
    .launch-btn.launch-ready:hover { background:#ea6c0a }
    .launch-btn:disabled:not(.launch-ready) { opacity:.6 }

    /* Kanban */
    .kanban-wrap { display:flex;gap:12px;height:calc(100vh - 140px);overflow-x:auto }
    .kb-col { width:260px;flex-shrink:0;display:flex;flex-direction:column;background:var(--gray-50);border-radius:10px;overflow:hidden }
    .kb-head { display:flex;align-items:center;gap:6px;padding:10px 12px;background:white;border-bottom:1px solid var(--gray-200);font-weight:600;font-size:13px }
    .kb-icon { font-size:16px }
    .kb-title { flex:1 }
    .kb-cnt { background:var(--gray-200);border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700 }
    .kb-cards { flex:1;overflow-y:auto;padding:8px }
    .kb-card { background:white;border:1px solid var(--gray-200);border-radius:8px;padding:10px;margin-bottom:8px;cursor:pointer;transition:box-shadow .12s }
    .kb-card:hover { box-shadow:0 2px 8px rgba(0,0,0,.08);border-color:#fed7aa }
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
    .kb-add:hover { border-color:#f97316;color:#f97316 }
    .done-badge { background:#dcfce7;color:#166534;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700 }

    /* Timeline */
    .timeline-wrap { max-width:720px;margin:0 auto;padding-bottom:40px }
    .tl-group { margin-bottom:24px }
    .tl-date-label { display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px }
    .tl-date-label.tl-today { color:#f97316 }
    .tl-date-label.tl-past  { color:var(--gray-300) }
    .tl-dot { width:10px;height:10px;border-radius:50%;background:var(--gray-300);flex-shrink:0 }
    .tl-today .tl-dot { background:#f97316 }
    .today-tag { background:#f97316;color:white;border-radius:4px;padding:1px 6px;font-size:10px }
    .tl-item { display:flex;gap:12px;padding:10px 12px;background:white;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:6px;cursor:pointer;transition:border-color .12s }
    .tl-item:hover { border-color:#fed7aa }
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
    .cal-cell.cal-today { background:#fff7ed }
    .cal-day-num { font-size:11px;font-weight:600;color:var(--gray-400);margin-bottom:3px }
    .cal-today .cal-day-num { color:#f97316;font-weight:700 }
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
    .btn-p:hover { background:#ea6c0a }
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

  readonly STEP_LABELS = STEP_LABELS;
  readonly STEP_ICONS  = STEP_ICONS;
  readonly TYPE_ICONS  = TYPE_ICONS;

  // ── State ──────────────────────────────────────────────────────────────────
  view: 'partners' | 'kanban' | 'timeline' | 'calendar' = 'partners';
  partners        = signal<OnboardingPartner[]>([]);
  allTasks        = signal<OnboardingTask[]>([]);
  crmUsers: CrmUser[] = [];
  loadingPartners = signal(true);
  loadingTasks    = signal(false);
  saving          = signal(false);
  launching       = signal<number | null>(null);

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
    if (fp) list = list.filter(p => p.id === +fp);
    return list;
  });

  filteredTasks = computed(() => {
    let list = this.allTasks();
    const fp = this.filterPartner();
    const fu = this.filterUser();
    if (fp) list = list.filter(t => t.partner_id === +fp);
    if (fu) list = list.filter(t => t.assigned_to === fu);
    return list;
  });

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
          label: d.toLocaleDateString('pl-PL', { weekday:'long', day:'numeric', month:'long' }),
          isToday, isPast,
          tasks: tasks.sort((a, b) => (a.due_time || '09:00').localeCompare(b.due_time || '09:00')),
        };
      });
  });

  calMonthLabel = computed(() => {
    return new Date(this.calYear(), this.calMonth(), 1)
      .toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  });

  calCells = computed(() => {
    const tasks = this.filteredTasks().filter(t => t.due_date);
    const taskMap = new Map<string, OnboardingTask[]>();
    for (const t of tasks) {
      const key = String(t.due_date!).slice(0, 10); // normalize ISO to YYYY-MM-DD
      if (!taskMap.has(key)) taskMap.set(key, []);
      taskMap.get(key)!.push(t);
    }

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
      const key = d.toISOString().slice(0,10);
      cells.push({ key, day: d.getDate(), inMonth: false, isToday: false, tasks: taskMap.get(key) || [] });
    }
    // Current month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date   = new Date(this.calYear(), this.calMonth(), d);
      const key    = date.toISOString().slice(0,10);
      const isToday = date.getTime() === today.getTime();
      cells.push({ key, day: d, inMonth: true, isToday, tasks: taskMap.get(key) || [] });
    }
    // Next month fill to complete 6 rows
    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(lastDay); d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0,10);
      cells.push({ key, day: d.getDate(), inMonth: false, isToday: false, tasks: taskMap.get(key) || [] });
    }
    return cells;
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  ngOnInit(): void {
    // Check query param for pre-selected partner (from partner migration)
    const pid = this.route.snapshot.queryParamMap.get('partner');
    if (pid) {
      this.filterPartner.set(+pid);
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

    const partnerId = this.editingTask?.partner_id || +this.filterPartner();
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
        this.toast.success(this.editingTask ? 'Zadanie zaktualizowane' : 'Zadanie dodane');
      }),
      error: () => this.zone.run(() => {
        this.saving.set(false);
        this.toast.error('Błąd zapisu zadania');
        this.cdr.markForCheck();
      }),
    });
  }

  deleteTask(): void {
    if (!this.editingTask) return;
    this.quickDeleteTask(this.editingTask, () => this.closeTaskModal());
  }

  launchPartner(p: OnboardingPartner): void {
    if (p.task_count === 0 || p.done_count < p.task_count) return;
    if (!confirm(`Uruchomić partnera "${p.company}"? Partner zostanie przeniesiony do statusu Aktywny i będzie widoczny w Rejestrze Partnerów.`)) return;
    this.launching.set(p.id);
    this.api.updatePartner(p.id, { status: 'active' } as any).subscribe({
      next: () => this.zone.run(() => {
        this.launching.set(null);
        this.toast.success(`${p.company} jest teraz aktywnym partnerem 🎉`);
        this.loadPartners();
        this.loadTasks();
      }),
      error: (err: any) => this.zone.run(() => {
        this.launching.set(null);
        this.toast.error(err?.error?.error ?? 'Błąd uruchamiania partnera');
        this.cdr.markForCheck();
      }),
    });
  }

  quickDeleteTask(t: OnboardingTask, onDone?: () => void): void {
    if (!confirm(`Usunąć zadanie "${t.title}"?`)) return;
    this.api.deleteOnboardingTask(t.partner_id, t.id).subscribe({
      next: () => this.zone.run(() => {
        if (onDone) onDone();
        this.loadTasks();
        this.toast.success('Zadanie usunięte');
      }),
      error: () => this.toast.error('Błąd usuwania zadania'),
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
