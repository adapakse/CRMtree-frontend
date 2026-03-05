import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DocumentService } from '../../core/services/document.service';
import { WorkflowService } from '../../core/services/api.services';
import { AuthService } from '../../core/auth/auth.service';
import { Document, WorkflowTask } from '../../core/models/models';
import { StatusBadgeComponent, TypeBadgeComponent, GroupPillComponent, TaskBadgeComponent, AvatarComponent } from '../../shared/components/badges.components';
import { isExpiringSoon } from '../../core/services/helpers';

@Component({
  selector: 'wt-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, StatusBadgeComponent, TypeBadgeComponent, GroupPillComponent, TaskBadgeComponent, AvatarComponent],
  template: `
    <div id="topbar">
      <span class="page-title">Dashboard</span>
      <span class="tsp"></span>
      <span style="font-size:12px;color:var(--gray-400)">{{ today }}</span>
    </div>

    <div id="content">
      <!-- Stats -->
      <div class="stats-bar">
        <div class="stat-card">
          <div class="stat-ico ico-or">📄</div>
          <div class="stat-lbl">Total Documents</div>
          <div class="stat-val">{{ stats().total }}</div>
          <div class="stat-sub">All accessible</div>
        </div>
        <div class="stat-card">
          <div class="stat-ico ico-bl">⚡</div>
          <div class="stat-lbl">In Workflow</div>
          <div class="stat-val">{{ stats().inWorkflow }}</div>
          <div class="stat-sub">Active tasks</div>
        </div>
        <div class="stat-card">
          <div class="stat-ico ico-gr">✔</div>
          <div class="stat-lbl">Signed / Done</div>
          <div class="stat-val">{{ stats().signed }}</div>
          <div class="stat-sub">Signed + Completed</div>
        </div>
        <div class="stat-card">
          <div class="stat-ico ico-re">⚠</div>
          <div class="stat-lbl">Expiring 30d</div>
          <div class="stat-val">{{ stats().expiring }}</div>
          <div class="stat-sub">Require attention</div>
        </div>
        <div class="stat-card">
          <div class="stat-ico ico-pu">📋</div>
          <div class="stat-lbl">My Tasks</div>
          <div class="stat-val">{{ myTasks().length }}</div>
          <div class="stat-sub">Pending action</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 340px;gap:20px;align-items:start">

        <!-- Recent Documents -->
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <h3 style="font-family:'Sora',sans-serif;font-size:14px;font-weight:700;color:var(--gray-900)">Recent Documents</h3>
            <a routerLink="/documents" class="btn btn-g btn-sm">View all</a>
          </div>
          @if (loading()) {
            <div class="loading-overlay"><div class="spinner"></div></div>
          } @else {
            <div class="tw">
              <div class="thead" style="grid-template-columns:130px 1fr 130px 110px 80px">
                <div class="th">Number</div>
                <div class="th">Name</div>
                <div class="th">Group</div>
                <div class="th">Status</div>
                <div class="th">Expiry</div>
              </div>
              @for (doc of recentDocs(); track doc.id) {
                <div class="tr" style="grid-template-columns:130px 1fr 130px 110px 80px"
                     [routerLink]="['/documents']" [queryParams]="{ open: doc.id }">
                  <div class="td td-num">{{ doc.doc_number }}</div>
                  <div class="td td-n">{{ doc.name }}</div>
                  <div class="td"><wt-group-pill [name]="doc.group_display ?? doc.group_name ?? ''" /></div>
                  <div class="td"><wt-status-badge [status]="doc.status" /></div>
                  <div class="td" [class.text-red]="isExpiring(doc.expiration_date)">
                    <span [style.color]="isExpiring(doc.expiration_date) ? '#DC2626' : ''">
                      {{ doc.expiration_date ? (doc.expiration_date | date:'dd.MM.yy') : '—' }}
                    </span>
                  </div>
                </div>
              }
              @empty {
                <div class="empty-state"><div class="empty-icon">📁</div><div class="empty-title">No documents yet</div></div>
              }
            </div>
          }
        </div>

        <!-- My Tasks -->
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <h3 style="font-family:'Sora',sans-serif;font-size:14px;font-weight:700;color:var(--gray-900)">My Tasks</h3>
            <a routerLink="/workflow" class="btn btn-g btn-sm">View all</a>
          </div>
          <div class="tw">
            @for (task of myTasks(); track task.id) {
              <div style="padding:12px 16px;border-bottom:1px solid var(--gray-100);cursor:pointer"
                   [routerLink]="['/documents']" [queryParams]="{ open: task.document_id }">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  <wt-task-badge [taskType]="task.task_type" />
                  <span style="font-size:11px;color:var(--gray-400)">{{ task.created_at | date:'dd.MM' }}</span>
                </div>
                <div style="font-size:13px;font-weight:500;color:var(--gray-900);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                  {{ task.document_name }}
                </div>
                <div style="font-size:11px;color:var(--gray-400);margin-top:2px">
                  From: {{ task.assigner_name }}
                </div>
              </div>
            }
            @empty {
              <div class="empty-state" style="padding:28px 16px">
                <div class="empty-icon">✅</div>
                <div class="empty-title">No pending tasks</div>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    #topbar { height: 60px; background: white; border-bottom: 1px solid var(--gray-200); display: flex; align-items: center; gap: 12px; padding: 0 24px; flex-shrink: 0; }
    .page-title { font-family: 'Sora', sans-serif; font-size: 17px; font-weight: 700; color: var(--gray-900); }
    .tsp { flex: 1; }
    #content { flex: 1; overflow-y: auto; padding: 24px; }
    .stats-bar { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; margin-bottom: 24px; }
    .stat-card { background: white; border-radius: var(--radius); padding: 16px 18px; border: 1px solid var(--gray-200); box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 4px; transition: box-shadow .15s; }
    .stat-card:hover { box-shadow: var(--shadow); }
    .stat-lbl { font-size: 11.5px; font-weight: 500; color: var(--gray-500); text-transform: uppercase; letter-spacing: .4px; }
    .stat-val { font-family: 'Sora', sans-serif; font-size: 26px; font-weight: 700; color: var(--gray-900); line-height: 1; }
    .stat-sub { font-size: 11.5px; color: var(--gray-400); }
    .stat-ico { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-bottom: 6px; font-size: 16px; }
    .ico-or { background: var(--orange-pale); } .ico-bl { background: #EFF6FF; } .ico-gr { background: #F0FDF4; } .ico-pu { background: #F5F3FF; } .ico-re { background: #FEF2F2; }
    .thead { display: grid; background: var(--gray-50); border-bottom: 1px solid var(--gray-200); padding: 0 16px; }
    .th { padding: 10px 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--gray-500); display: flex; align-items: center; }
    .tr { display: grid; padding: 0 16px; border-bottom: 1px solid var(--gray-100); cursor: pointer; transition: background .1s; align-items: center; }
    .tr:last-child { border-bottom: none; }
    .tr:hover { background: var(--gray-50); }
    .td { padding: 11px 8px; font-size: 13px; color: var(--gray-700); overflow: hidden; }
    .td-n { font-weight: 500; color: var(--gray-900); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .td-num { font-family: 'Sora', monospace; font-size: 11px; color: var(--gray-500); font-weight: 600; }
  `],
})
export class DashboardComponent implements OnInit {
  private docSvc = inject(DocumentService);
  private wfSvc  = inject(WorkflowService);

  loading    = signal(true);
  recentDocs = signal<Document[]>([]);
  myTasks    = signal<WorkflowTask[]>([]);
  stats      = signal({ total: 0, inWorkflow: 0, signed: 0, expiring: 0 });
  today      = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  isExpiring = (d?: string) => isExpiringSoon(d, 30);

  ngOnInit(): void {
    this.docSvc.list({ limit: 6, sort: 'created_at', order: 'desc' }).subscribe(res => {
      this.recentDocs.set(res.data);
      const exp = res.data.filter(d => isExpiringSoon(d.expiration_date)).length;
      const signed = res.data.filter(d => ['signed','completed'].includes(d.status)).length;
      const wf     = res.data.filter(d => ['being_edited','being_signed'].includes(d.status)).length;
      this.stats.set({ total: res.total, inWorkflow: wf, signed, expiring: exp });
      this.loading.set(false);
    });
    this.wfSvc.getMyTasks().subscribe(tasks => this.myTasks.set(tasks));
  }
}
