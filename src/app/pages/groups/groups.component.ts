import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GroupService } from '../../core/services/api.services';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { GroupProfile } from '../../core/models/models';
import { groupCssClass } from '../../core/services/helpers';

@Component({
  selector: 'wt-groups',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div id="topbar">
      <span class="page-title">Groups &amp; Roles</span>
      <span class="tsp"></span>
      @if (auth.isAdmin()) {
        <button class="btn btn-p" (click)="openNew = true">+ New Group</button>
      }
    </div>

    <div id="content">
      @if (loading()) {
        <div class="loading-overlay"><div class="spinner"></div></div>
      }

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
        @for (g of groups(); track g.id) {
          <div class="card" style="padding:20px;cursor:pointer" (click)="select(g)">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
              <div style="width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px"
                   [class]="groupBg(g.name)">
                {{ groupIcon(g.name) }}
              </div>
              <div>
                <div style="font-family:'Sora',sans-serif;font-size:14px;font-weight:700;color:var(--gray-900)">{{ g.display_name }}</div>
                @if (g.has_owner_restriction) {
                  <span style="font-size:10.5px;font-weight:600;background:#EFF6FF;color:#1D4ED8;padding:1px 7px;border-radius:10px">Owner restriction</span>
                }
              </div>
              <span style="margin-left:auto">
                @if (!g.is_active) {
                  <span style="font-size:10.5px;font-weight:600;background:var(--gray-100);color:var(--gray-400);padding:2px 8px;border-radius:10px">Inactive</span>
                }
              </span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div style="background:var(--gray-50);border-radius:8px;padding:10px 12px">
                <div style="font-size:18px;font-weight:700;font-family:'Sora',sans-serif;color:var(--gray-900)">{{ g.member_count ?? 0 }}</div>
                <div style="font-size:11px;color:var(--gray-400)">Members</div>
              </div>
              <div style="background:var(--gray-50);border-radius:8px;padding:10px 12px">
                <div style="font-size:18px;font-weight:700;font-family:'Sora',sans-serif;color:var(--gray-900)">{{ g.document_count ?? 0 }}</div>
                <div style="font-size:11px;color:var(--gray-400)">Documents</div>
              </div>
            </div>
            @if (g.description) {
              <div style="font-size:12px;color:var(--gray-400);margin-top:10px">{{ g.description }}</div>
            }
          </div>
        }
      </div>
    </div>

    <!-- Group Detail Panel -->
    @if (selected()) {
      <div class="overlay open" (click)="selected.set(null)">
        <div class="panel" (click)="$event.stopPropagation()">
          <div class="ph">
            <div>
              <div class="pt">{{ selected()!.display_name }}</div>
              <div class="ps">{{ selected()!.member_count ?? 0 }} members · {{ selected()!.document_count ?? 0 }} documents</div>
            </div>
            <div class="pc" (click)="selected.set(null)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </div>
          </div>
          <div class="pb">
            @if (auth.isAdmin()) {
              <div class="sec-title">Edit Group</div>
              <div class="fgrid">
                <div class="fg">
                  <label class="fl">Display Name</label>
                  <input class="fi" [(ngModel)]="editName">
                </div>
                <div class="fg">
                  <label class="fl">Owner Restriction</label>
                  <select class="fsel" [(ngModel)]="editOwnerRestriction">
                    <option [value]="false">No restriction</option>
                    <option [value]="true">Owner only (Sales)</option>
                  </select>
                </div>
                <div class="fg full">
                  <label class="fl">Description</label>
                  <textarea class="fta" [(ngModel)]="editDescription"></textarea>
                </div>
              </div>
              <button class="btn btn-p btn-sm" (click)="saveGroup()">Save Changes</button>
            }

            <div class="sec-title" style="margin-top:24px">Members</div>
            @for (m of selected()!.members ?? []; track m.user_id) {
              <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--gray-100)">
                <div class="av" style="width:32px;height:32px;font-size:12px">
                  {{ initials(m.display_name) }}
                </div>
                <div style="flex:1">
                  <div style="font-size:13px;font-weight:500;color:var(--gray-900)">{{ m.display_name }}</div>
                  <div style="font-size:11.5px;color:var(--gray-400)">{{ m.email }}</div>
                </div>
                <span class="badge" [class]="m.access_level === 'full' ? 's-signed' : 's-new'">
                  {{ m.access_level === 'full' ? 'Full Access' : 'Read Only' }}
                </span>
              </div>
            }
            @empty {
              <div class="empty-state"><div class="empty-icon">👤</div><div class="empty-title">No members yet</div></div>
            }
          </div>
          @if (auth.isAdmin()) {
            <div class="pf">
              <button class="btn btn-d" (click)="deactivateGroup()">Deactivate Group</button>
              <button class="btn btn-g" (click)="selected.set(null)">Close</button>
            </div>
          }
        </div>
      </div>
    }

    <!-- New Group Modal -->
    @if (openNew) {
      <div class="mol open" (click)="openNew=false">
        <div class="mo" (click)="$event.stopPropagation()">
          <div class="moh">
            <div class="moico" style="background:var(--orange-pale);font-size:18px">👥</div>
            <div><div class="mot">Create Group</div><div class="mos">Add a new role group</div></div>
          </div>
          <div style="padding:20px 24px;display:flex;flex-direction:column;gap:14px">
            <div class="fg">
              <label class="fl">Group Name (internal) <span class="req">*</span></label>
              <input class="fi" placeholder="e.g. Sprzedaz" [(ngModel)]="newGroup.name">
            </div>
            <div class="fg">
              <label class="fl">Display Name <span class="req">*</span></label>
              <input class="fi" placeholder="e.g. Sprzedaż" [(ngModel)]="newGroup.display_name">
            </div>
            <div class="fg">
              <label class="fl">Description</label>
              <textarea class="fta" style="min-height:60px" [(ngModel)]="newGroup.description"></textarea>
            </div>
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
              <input type="checkbox" [(ngModel)]="newGroup.has_owner_restriction">
              Owner restriction (users see only own documents)
            </label>
          </div>
          <div style="padding:16px 24px;border-top:1px solid var(--gray-200);display:flex;gap:10px;justify-content:flex-end">
            <button class="btn btn-g" (click)="openNew=false">Cancel</button>
            <button class="btn btn-p" [disabled]="!newGroup.name.trim()" (click)="createGroup()">Create Group</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    #topbar { height: 60px; background: white; border-bottom: 1px solid var(--gray-200); display: flex; align-items: center; gap: 12px; padding: 0 24px; flex-shrink: 0; }
    .page-title { font-family: 'Sora', sans-serif; font-size: 17px; font-weight: 700; color: var(--gray-900); }
    .tsp { flex: 1; }
    #content { flex: 1; overflow-y: auto; padding: 24px; }
    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 100; backdrop-filter: blur(2px); display: flex; align-items: flex-start; justify-content: flex-end; }
    .panel { width: 520px; height: 100vh; background: white; box-shadow: var(--shadow-lg); overflow-y: auto; display: flex; flex-direction: column; animation: slideIn .2s ease; }
    .ph { padding: 20px 24px; border-bottom: 1px solid var(--gray-200); display: flex; align-items: flex-start; gap: 12px; position: sticky; top: 0; background: white; z-index: 1; }
    .pt { font-family: 'Sora', sans-serif; font-size: 16px; font-weight: 700; color: var(--gray-900); }
    .ps { font-size: 12px; color: var(--gray-500); margin-top: 3px; }
    .pc { margin-left: auto; cursor: pointer; color: var(--gray-400); padding: 4px; border-radius: 6px; }
    .pc:hover { background: var(--gray-100); }
    .pb { padding: 24px; flex: 1; }
    .pf { padding: 16px 24px; border-top: 1px solid var(--gray-200); display: flex; gap: 10px; justify-content: flex-end; background: var(--gray-50); position: sticky; bottom: 0; }
    .mol { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 200; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(3px); }
    .mo { background: white; border-radius: 14px; width: 460px; max-width: 95vw; box-shadow: var(--shadow-lg); overflow: hidden; animation: scaleIn .2s ease; }
    .moh { padding: 20px 24px 16px; border-bottom: 1px solid var(--gray-200); display: flex; align-items: center; gap: 12px; }
    .moico { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .mot { font-family: 'Sora', sans-serif; font-size: 15px; font-weight: 700; color: var(--gray-900); }
    .mos { font-size: 12px; color: var(--gray-500); margin-top: 2px; }
    .av { border-radius: 50%; background: linear-gradient(135deg, var(--orange), var(--orange-dark)); display: flex; align-items: center; justify-content: center; font-weight: 700; color: white; }
  `],
})
export class GroupsComponent implements OnInit {
  private groupSvc = inject(GroupService);
  toast            = inject(ToastService);
  auth             = inject(AuthService);

  loading  = signal(true);
  groups   = signal<GroupProfile[]>([]);
  selected = signal<GroupProfile | null>(null);
  openNew  = false;

  editName             = '';
  editDescription      = '';
  editOwnerRestriction = false;

  newGroup = { name: '', display_name: '', description: '', has_owner_restriction: false };

  ngOnInit(): void {
    this.loadGroups();
  }

  loadGroups(): void {
    this.groupSvc.list(true).subscribe(g => { this.groups.set(g); this.loading.set(false); });
  }

  select(g: GroupProfile): void {
    this.groupSvc.get(g.id).subscribe(full => {
      this.selected.set(full);
      this.editName             = full.display_name;
      this.editDescription      = full.description ?? '';
      this.editOwnerRestriction = full.has_owner_restriction;
    });
  }

  saveGroup(): void {
    const g = this.selected();
    if (!g) return;
    this.groupSvc.update(g.id, { display_name: this.editName, description: this.editDescription, has_owner_restriction: this.editOwnerRestriction }).subscribe(updated => {
      this.groups.update(gs => gs.map(x => x.id === updated.id ? { ...x, ...updated } : x));
      this.selected.set({ ...g, ...updated });
      this.toast.success('Group updated');
    });
  }

  deactivateGroup(): void {
    const g = this.selected();
    if (!g || !confirm(`Deactivate group "${g.display_name}"?`)) return;
    this.groupSvc.delete(g.id).subscribe(() => {
      this.selected.set(null);
      this.loadGroups();
      this.toast.success('Group deactivated');
    });
  }

  createGroup(): void {
    this.groupSvc.create(this.newGroup).subscribe(g => {
      this.groups.update(gs => [...gs, g]);
      this.openNew = false;
      this.newGroup = { name: '', display_name: '', description: '', has_owner_restriction: false };
      this.toast.success(`Group "${g.display_name}" created`);
    });
  }

  initials(name: string): string {
    return (name ?? '').split(' ').slice(0, 2).map(n => n[0] ?? '').join('').toUpperCase();
  }

  groupIcon(name: string): string {
    const m: Record<string, string> = { Management: '🏢', Zarząd: '🏢', Sales: '💼', Sprzedaż: '💼', Marketing: '📣', HR: '👥', Accounting: '💰', Operations: '⚙️' };
    return m[name] ?? '📋';
  }

  groupBg(name: string): string {
    return groupCssClass(name);
  }
}
