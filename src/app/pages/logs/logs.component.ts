import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditService } from '../../core/services/api.services';
import { AuditLog } from '../../core/models/models';

const ACTION_ICONS: Record<string, string> = {
  document_created:   '📄', document_viewed:    '👁', document_downloaded: '⬇',
  document_deleted:   '🗑', metadata_updated:   '✏', status_changed:     '🔄',
  version_uploaded:   '📎', tag_added:          '🏷', tag_removed:        '🏷',
  workflow_task_created: '📋', workflow_task_completed: '✅', workflow_task_cancelled: '❌',
  signing_initiated:  '✍', signing_completed:  '🔏',
  user_login:         '🔑', user_logout:        '🚪',
  role_assigned:      '👥', role_removed:       '👥',
  group_created:      '🏢', group_updated:      '🏢',
};

@Component({
  selector: 'wt-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div id="topbar">
      <span class="page-title">Audit Logs</span>
      <span class="tsp"></span>
      <div class="srch-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input class="srch" type="search" placeholder="Search user, document…"
               [(ngModel)]="filters.search" (ngModelChange)="onSearch()">
      </div>
    </div>

    <div id="content">
      <!-- Filters bar -->
      <div class="toolbar" style="flex-wrap:wrap;gap:10px">
        <div class="fg" style="min-width:140px">
          <label class="fl">Date from</label>
          <input class="fi" type="date" [(ngModel)]="filters.date_from" (change)="load()" style="padding:5px 8px">
        </div>
        <div class="fg" style="min-width:140px">
          <label class="fl">Date to</label>
          <input class="fi" type="date" [(ngModel)]="filters.date_to" (change)="load()" style="padding:5px 8px">
        </div>
        <div class="fg" style="min-width:160px">
          <label class="fl">Action type</label>
          <select class="sel" [(ngModel)]="filters.action" (change)="load()">
            <option value="">All actions</option>
            @for (a of actions(); track a) { <option [value]="a">{{ a }}</option> }
          </select>
        </div>
        <div class="fg" style="min-width:160px">
          <label class="fl">User email</label>
          <input class="fi" type="text" [(ngModel)]="filters.user_email" (blur)="load()" placeholder="user@worktrips.com" style="padding:5px 8px">
        </div>
        <div style="margin-top:auto">
          <button class="btn btn-g btn-sm" (click)="clearFilters()">Clear filters</button>
        </div>
        <span style="flex:1"></span>
        <span style="font-size:12px;color:var(--gray-400);margin-top:auto">{{ total() }} entries</span>
      </div>

      <!-- Log table -->
      <div class="tw">
        <div class="thead" style="grid-template-columns:160px 100px 1fr 180px 120px">
          <div class="th">Timestamp</div>
          <div class="th">Action</div>
          <div class="th">Details</div>
          <div class="th">User</div>
          <div class="th">Document</div>
        </div>

        @if (loading()) {
          <div class="loading-overlay"><div class="spinner"></div></div>
        }

        @for (log of logs(); track log.id) {
          <div class="tr" style="grid-template-columns:160px 100px 1fr 180px 120px" (click)="openLog(log)">
            <div class="td" style="font-size:11.5px;color:var(--gray-500);font-family:'Sora',monospace">
              {{ log.created_at | date:'dd.MM.yy HH:mm:ss' }}
            </div>
            <div class="td">
              <span style="font-size:13px">{{ actionIcon(log.action) }}</span>
              <span style="font-size:10.5px;font-weight:600;color:var(--gray-600);margin-left:4px">
                {{ formatAction(log.action) }}
              </span>
            </div>
            <div class="td" style="font-size:12.5px;color:var(--gray-700)">
              {{ describeLog(log) }}
            </div>
            <div class="td">
              <div style="font-size:12.5px;font-weight:500;color:var(--gray-800)">{{ log.user_name }}</div>
              <div style="font-size:11px;color:var(--gray-400)">{{ log.user_email }}</div>
            </div>
            <div class="td" style="font-size:11px;color:var(--gray-500);font-family:'Sora',monospace">
              {{ log.document_number ?? '—' }}
            </div>
          </div>
        }
        @empty {
          @if (!loading()) {
            <div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No log entries found</div></div>
          }
        }
      </div>

      <!-- Pagination -->
      @if (totalPages() > 1) {
        <div style="display:flex;align-items:center;gap:8px;margin-top:16px;justify-content:flex-end">
          <button class="btn btn-g btn-sm" [disabled]="page() === 1" (click)="setPage(page()-1)">← Prev</button>
          <span style="font-size:12.5px;color:var(--gray-500)">Page {{ page() }} of {{ totalPages() }}</span>
          <button class="btn btn-g btn-sm" [disabled]="page() === totalPages()" (click)="setPage(page()+1)">Next →</button>
        </div>
      }
    </div>

    <!-- Log detail modal -->
    @if (selectedLog()) {
      <div class="mol open" (click)="selectedLog.set(null)">
        <div class="mo" (click)="$event.stopPropagation()">
          <div class="moh">
            <div class="moico" style="background:var(--gray-100);font-size:20px">{{ actionIcon(selectedLog()!.action) }}</div>
            <div>
              <div class="mot">{{ formatAction(selectedLog()!.action) }}</div>
              <div class="mos">{{ selectedLog()!.created_at | date:'dd.MM.yyyy HH:mm:ss' }} · {{ selectedLog()!.user_email }}</div>
            </div>
          </div>
          <div style="padding:20px 24px;font-size:13px;line-height:1.7">
            @if (selectedLog()!.document_name) {
              <div><strong>Document:</strong> {{ selectedLog()!.document_number }} — {{ selectedLog()!.document_name }}</div>
            }
            @if (selectedLog()!.before_state) {
              <div style="margin-top:10px"><strong>Before:</strong>
                <pre style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:6px;padding:8px;font-size:11px;margin-top:4px;overflow:auto;max-height:120px">{{ selectedLog()!.before_state | json }}</pre>
              </div>
            }
            @if (selectedLog()!.after_state) {
              <div style="margin-top:10px"><strong>After:</strong>
                <pre style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:6px;padding:8px;font-size:11px;margin-top:4px;overflow:auto;max-height:120px">{{ selectedLog()!.after_state | json }}</pre>
              </div>
            }
            @if (selectedLog()!.ip_address) {
              <div style="margin-top:10px;font-size:11.5px;color:var(--gray-400)">IP: {{ selectedLog()!.ip_address }}</div>
            }
          </div>
          <div style="padding:14px 24px;border-top:1px solid var(--gray-200);display:flex;justify-content:flex-end">
            <button class="btn btn-g" (click)="selectedLog.set(null)">Close</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    #topbar { height:60px;background:white;border-bottom:1px solid var(--gray-200);display:flex;align-items:center;gap:12px;padding:0 24px;flex-shrink:0; }
    .page-title { font-family:'Sora',sans-serif;font-size:17px;font-weight:700;color:var(--gray-900); }
    .tsp { flex:1; }
    .srch-wrap { position:relative;display:flex;align-items:center; }
    .srch-wrap svg { position:absolute;left:10px;width:15px;height:15px;color:var(--gray-400);pointer-events:none; }
    .srch { background:var(--gray-100);border:1px solid var(--gray-200);border-radius:8px;padding:7px 14px 7px 34px;font-size:13px;width:240px;outline:none;font-family:inherit; }
    .srch:focus { border-color:var(--orange);background:white; }
    #content { flex:1;overflow-y:auto;padding:24px; }
    .toolbar { background:white;border:1px solid var(--gray-200);border-radius:var(--radius);padding:12px 16px;margin-bottom:16px;display:flex;align-items:flex-end;gap:10px;box-shadow:var(--shadow-sm); }
    .thead { display:grid;background:var(--gray-50);border-bottom:1px solid var(--gray-200);padding:0 16px; }
    .th { padding:10px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500);display:flex;align-items:center; }
    .tr { display:grid;padding:0 16px;border-bottom:1px solid var(--gray-100);cursor:pointer;transition:background .1s;align-items:center; }
    .tr:hover { background:var(--gray-50); }
    .td { padding:10px 8px;font-size:13px;color:var(--gray-700);overflow:hidden; }
    .mol { position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px); }
    .mo { background:white;border-radius:14px;width:500px;max-width:95vw;box-shadow:var(--shadow-lg);overflow:hidden; }
    .moh { padding:20px 24px 16px;border-bottom:1px solid var(--gray-200);display:flex;align-items:center;gap:12px; }
    .moico { width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
    .mot { font-family:'Sora',sans-serif;font-size:15px;font-weight:700;color:var(--gray-900); }
    .mos { font-size:12px;color:var(--gray-500);margin-top:2px; }
  `],
})
export class LogsComponent implements OnInit {
  private auditSvc = inject(AuditService);

  logs       = signal<AuditLog[]>([]);
  actions    = signal<string[]>([]);
  loading    = signal(true);
  total      = signal(0);
  page       = signal(1);
  totalPages = signal(1);
  selectedLog = signal<AuditLog | null>(null);

  filters = { search: '', date_from: '', date_to: '', action: '', user_email: '' };
  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.auditSvc.getActions().subscribe(a => this.actions.set(a));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.auditSvc.list({ ...this.filters, page: this.page(), limit: 50 }).subscribe(res => {
      this.logs.set(res.data);
      this.total.set(res.total);
      this.totalPages.set(res.pages);
      this.loading.set(false);
    });
  }

  onSearch(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.page.set(1); this.load(); }, 350);
  }

  setPage(p: number): void { this.page.set(p); this.load(); }

  clearFilters(): void {
    this.filters = { search: '', date_from: '', date_to: '', action: '', user_email: '' };
    this.page.set(1);
    this.load();
  }

  openLog(log: AuditLog): void { this.selectedLog.set(log); }

  actionIcon(action: string): string { return ACTION_ICONS[action] ?? '📌'; }

  formatAction(action: string): string {
    return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  describeLog(log: AuditLog): string {
    if (log.document_name) return log.document_name;
    if (log.after_state) return JSON.stringify(log.after_state).slice(0, 80);
    return log.action;
  }
}
