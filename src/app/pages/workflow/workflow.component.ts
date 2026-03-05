import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { WorkflowService } from '../../core/services/api.services';
import { WorkflowTask, TaskStatus, DocStatus } from '../../core/models/models';
import { StatusBadgeComponent, TaskBadgeComponent, AvatarComponent } from '../../shared/components/badges.components';
import { ToastService } from '../../core/services/toast.service';
import { AppSettingsService } from '../../core/services/app-settings.service';
import { environment } from '../../../environments/environment';

// Mapowanie statusu dokumentu → kolumna kanbana
const STATUS_COLUMN: Record<string, 'pending' | 'in_progress' | 'completed' | 'cancelled'> = {
  new:             'pending',
  being_edited:    'in_progress',
  being_signed:    'in_progress',
  being_approved:  'in_progress',
  signed:          'completed',
  completed:       'completed',
  hold:            'cancelled',
  rejected:        'cancelled',
};

const COLUMNS: { id: 'pending'|'in_progress'|'completed'|'cancelled'; label: string }[] = [
  { id: 'pending',     label: 'Pending' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed',   label: 'Completed' },
  { id: 'cancelled',   label: 'Cancelled' },
];

@Component({
  selector: 'wt-workflow',
  standalone: true,
  imports: [CommonModule, RouterLink, StatusBadgeComponent, TaskBadgeComponent, AvatarComponent],
  template: `
    <div id="topbar">
      <span class="page-title">Workflow</span>
      <span class="tsp"></span>
      @if (view === 'kanban' && refreshIntervalSec() > 0) {
        <span style="font-size:11.5px;color:var(--gray-400);margin-right:4px">
          Auto-refresh: {{ refreshIntervalSec() }}s
        </span>
      }
      <div class="tabs" style="margin-bottom:0;width:320px">
        <button class="tab-btn" [class.active]="view==='mine'"   (click)="switchView('mine')">My Tasks</button>
        <button class="tab-btn" [class.active]="view==='kanban'" (click)="switchView('kanban')">Kanban Board</button>
      </div>
    </div>

    <div id="content">
      @if (loading()) {
        <div class="loading-overlay"><div class="spinner"></div></div>
      }

      <!-- MY TASKS -->
      @if (view === 'mine') {
        @if (myTasks().length === 0 && !loading()) {
          <div class="empty-state" style="margin-top:48px">
            <div class="empty-icon">&#9989;</div>
            <div class="empty-title">No pending tasks</div>
            <div>You're all caught up!</div>
          </div>
        }
        <div style="display:flex;flex-direction:column;gap:10px">
          @for (task of myTasks(); track task.id) {
            <div class="card" style="padding:16px 20px;display:flex;align-items:center;gap:14px">
              <wt-task-badge [taskType]="task.task_type" />
              <div style="flex:1;min-width:0">
                <div style="font-size:13.5px;font-weight:600;color:var(--gray-900);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                  {{ task.document_name }}
                </div>
                <div style="font-size:12px;color:var(--gray-400);display:flex;align-items:center;gap:8px">
                  <span class="mono">{{ task.doc_number }}</span>
                  <span>·</span>
                  <span>From: {{ task.assigner_name }}</span>
                  @if (task.group_name) { <span>· {{ task.group_name }}</span> }
                  @if (task.due_date) { <span style="color:#DC2626">· Due: {{ task.due_date | date:'dd.MM.yy' }}</span> }
                </div>
                @if (task.message) {
                  <div style="font-size:12px;color:var(--gray-500);margin-top:4px;font-style:italic">"{{ task.message }}"</div>
                }
              </div>
              <div style="display:flex;gap:8px;flex-shrink:0">
                @if (task.task_status === 'pending') {
                  <button class="btn btn-g btn-sm" (click)="setStatus(task, 'in_progress')">Start</button>
                }
                <button class="btn btn-p btn-sm" (click)="setStatus(task, 'completed')">Complete</button>
                <a class="btn btn-g btn-sm" [routerLink]="['/documents']" [queryParams]="{open: task.document_id}">Open Doc</a>
              </div>
            </div>
          }
        </div>
      }

      <!-- KANBAN BOARD -->
      @if (view === 'kanban') {
        @if (kanbanDocs().length === 0 && !loading()) {
          <div class="empty-state" style="margin-top:48px">
            <div class="empty-icon">&#128203;</div>
            <div class="empty-title">No documents yet</div>
            <div>Documents will appear here once created</div>
          </div>
        }
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;align-items:start">
          @for (col of columns; track col.id) {
            <div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
                <div class="coldot" [class]="'dot-' + col.id"></div>
                <span style="font-size:12px;font-weight:700;color:var(--gray-600);text-transform:uppercase;letter-spacing:.5px">{{ col.label }}</span>
                <span style="margin-left:auto;background:var(--gray-100);border-radius:10px;padding:1px 7px;font-size:11px;font-weight:600;color:var(--gray-500)">
                  {{ docsByColumn(col.id).length }}
                </span>
              </div>
              <div style="display:flex;flex-direction:column;gap:8px">
                @for (doc of docsByColumn(col.id); track doc.id) {
                  <div class="card" style="padding:12px 14px;cursor:pointer"
                       [routerLink]="['/documents']" [queryParams]="{open: doc.id}">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                      <wt-status-badge [status]="doc.status" />
                      <span style="flex:1"></span>
                      @if (doc.active_task_count > 0) {
                        <span style="font-size:10px;background:var(--orange-pale);color:var(--orange-dark);border-radius:8px;padding:1px 6px;font-weight:600">
                          {{ doc.active_task_count }} task{{ doc.active_task_count > 1 ? 's' : '' }}
                        </span>
                      }
                    </div>
                    <div style="font-size:13px;font-weight:600;color:var(--gray-900);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                      {{ doc.name }}
                    </div>
                    <div style="font-size:11px;color:var(--gray-400);margin-bottom:6px">{{ doc.doc_number }}</div>
                    <div style="display:flex;align-items:center;gap:6px">
                      <wt-avatar [name]="doc.owner_name ?? ''" [size]="18" />
                      <span style="font-size:11.5px;color:var(--gray-500)">{{ doc.owner_name }}</span>
                      @if (doc.group_display ?? doc.group_name) {
                        <span style="margin-left:auto;font-size:10.5px;color:var(--gray-400)">{{ doc.group_display ?? doc.group_name }}</span>
                      }
                    </div>

                    <!-- ── Expiration date z dynamicznym kolorem ── -->
                    @if (doc.expiration_date) {
                      <div style="font-size:11px;margin-top:4px;display:flex;align-items:center;gap:4px"
                           [style.color]="expirationColor(doc.expiration_date)">
                        @if (isExpired(doc.expiration_date)) {
                          <span title="Expired">⚠️</span>
                        }
                        Expires {{ doc.expiration_date | date:'dd.MM.yy' }}
                        @if (isExpiringSoon(doc.expiration_date) && !isExpired(doc.expiration_date)) {
                          <span style="font-size:9px;background:#FEF3C7;color:#92400E;border-radius:4px;padding:1px 4px;font-weight:600">SOON</span>
                        }
                      </div>
                    }

                    <!-- Active tasks badges -->
                    @if (doc.active_tasks?.length > 0) {
                      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
                        @for (t of doc.active_tasks; track t.id) {
                          <wt-task-badge [taskType]="t.task_type" />
                        }
                      </div>
                    }
                  </div>
                }
                @if (docsByColumn(col.id).length === 0) {
                  <div style="padding:20px;text-align:center;color:var(--gray-300);font-size:12px;border:1.5px dashed var(--gray-200);border-radius:8px">
                    Empty
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    #topbar { height:60px;background:white;border-bottom:1px solid var(--gray-200);display:flex;align-items:center;gap:12px;padding:0 24px;flex-shrink:0; }
    .page-title { font-family:'Sora',sans-serif;font-size:17px;font-weight:700;color:var(--gray-900); }
    .tsp { flex:1; }
    #content { flex:1;overflow-y:auto;padding:24px; }
    .coldot { width:8px;height:8px;border-radius:50%; }
    .dot-pending     { background:#F59E0B; }
    .dot-in_progress { background:#3B82F6; }
    .dot-completed   { background:#10B981; }
    .dot-cancelled   { background:#9CA3AF; }
  `],
})
export class WorkflowComponent implements OnInit, OnDestroy {
  private wfSvc       = inject(WorkflowService);
  private http        = inject(HttpClient);
  private toast       = inject(ToastService);
  private appSettings = inject(AppSettingsService);

  loading    = signal(true);
  myTasks    = signal<WorkflowTask[]>([]);
  kanbanDocs = signal<any[]>([]);
  view       = 'mine';
  columns    = COLUMNS;

  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  // Computed helpers that re-read settings on each call (settings are reactive signals)
  expirationColor(dateStr?: string): string {
    return this.appSettings.expirationColor(dateStr);
  }

  isExpiringSoon(dateStr?: string): boolean {
    return this.appSettings.isExpiringSoon(dateStr);
  }

  isExpired(dateStr?: string): boolean {
    return this.appSettings.isExpired(dateStr);
  }

  refreshIntervalSec(): number {
    return this.appSettings.get('kanban_refresh_interval_sec');
  }

  docsByColumn(colId: 'pending'|'in_progress'|'completed'|'cancelled'): any[] {
    return this.kanbanDocs().filter(d => STATUS_COLUMN[d.status] === colId);
  }

  ngOnInit(): void {
    this.loadMyTasks();
  }

  ngOnDestroy(): void {
    this.clearRefreshTimer();
  }

  switchView(v: string): void {
    this.view = v;
    if (v === 'kanban') {
      if (this.kanbanDocs().length === 0) {
        this.loadKanbanDocs();
      }
      this.startRefreshTimer();
    } else {
      this.clearRefreshTimer();
    }
  }

  private startRefreshTimer(): void {
    this.clearRefreshTimer();
    const interval = this.appSettings.get('kanban_refresh_interval_sec');
    if (interval <= 0) return;
    this.refreshTimer = setInterval(() => this.loadKanbanDocs(), interval * 1000);
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  loadMyTasks(): void {
    this.loading.set(true);
    this.wfSvc.getMyTasks().subscribe({
      next: tasks => { this.myTasks.set(Array.isArray(tasks) ? tasks : []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadKanbanDocs(): void {
    this.loading.set(true);
    this.http.get<any[]>(`${environment.apiUrl}/workflow/kanban-docs`).subscribe({
      next: docs => {
        this.kanbanDocs.set(docs.map(d => ({
          ...d,
          active_task_count: parseInt(d.active_task_count ?? '0'),
          active_tasks: d.active_tasks ?? [],
        })));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  setStatus(task: WorkflowTask, status: TaskStatus): void {
    this.wfSvc.updateTask(task.document_id, task.id, { task_status: status }).subscribe(updated => {
      this.myTasks.update(tasks => tasks.map(t => t.id === updated.id ? updated : t));
      if (status === 'completed') this.toast.success('Task marked as completed');
    });
  }
}
