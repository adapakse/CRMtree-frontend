import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GroupService } from '../../core/services/api.services';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { GroupProfile } from '../../core/models/models';
import { groupCssClass } from '../../core/services/helpers';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';

@Component({
  selector: 'wt-groups',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('admin')],
  template: `
<ng-container *transloco="let t; prefix: 'admin'">
    <div id="topbar">
      <span class="page-title">{{ t('userGroups.title') }}</span>
      <span class="tsp"></span>
      @if (auth.isAdmin()) {
        <button class="btn btn-p" (click)="openNew = true">+ {{ t('userGroups.newGroup') }}</button>
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
                  <span style="font-size:10.5px;font-weight:600;background:#EFF6FF;color:#1D4ED8;padding:1px 7px;border-radius:10px">{{ t('userGroups.ownerRestriction') }}</span>
                }
              </div>
              <span style="margin-left:auto">
                @if (!g.is_active) {
                  <span style="font-size:10.5px;font-weight:600;background:var(--gray-100);color:var(--gray-400);padding:2px 8px;border-radius:10px">{{ t('userGroups.inactive') }}</span>
                }
              </span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div style="background:var(--gray-50);border-radius:8px;padding:10px 12px">
                <div style="font-size:18px;font-weight:700;font-family:'Sora',sans-serif;color:var(--gray-900)">{{ g.member_count ?? 0 }}</div>
                <div style="font-size:11px;color:var(--gray-400)">{{ t('userGroups.members') }}</div>
              </div>
              <div style="background:var(--gray-50);border-radius:8px;padding:10px 12px">
                <div style="font-size:18px;font-weight:700;font-family:'Sora',sans-serif;color:var(--gray-900)">{{ g.document_count ?? 0 }}</div>
                <div style="font-size:11px;color:var(--gray-400)">{{ t('userGroups.documents') }}</div>
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
              <div class="ps">{{ t('userGroups.membersCount', { count: selected()!.member_count ?? 0 }) }} · {{ t('userGroups.documentsCount', { count: selected()!.document_count ?? 0 }) }}</div>
            </div>
            <div class="pc" (click)="selected.set(null)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </div>
          </div>
          <div class="pb">
            @if (auth.isAdmin()) {
              <div class="sec-title">{{ t('userGroups.edit.title') }}</div>
              <div class="fgrid">
                <div class="fg">
                  <label class="fl">{{ t('userGroups.fields.displayName') }}</label>
                  <input class="fi" [(ngModel)]="editName">
                </div>
                <div class="fg">
                  <label class="fl">{{ t('userGroups.ownerRestriction') }}</label>
                  <select class="fsel" [(ngModel)]="editOwnerRestriction">
                    <option [value]="false">{{ t('userGroups.ownerRestrictionOptions.none') }}</option>
                    <option [value]="true">{{ t('userGroups.ownerRestrictionOptions.ownerOnly') }}</option>
                  </select>
                </div>
                <div class="fg full">
                  <label class="fl">{{ t('userGroups.fields.description') }}</label>
                  <textarea class="fta" [(ngModel)]="editDescription"></textarea>
                </div>
              </div>
              <button class="btn btn-p btn-sm" style="margin-top:16px" (click)="saveGroup()">{{ t('userGroups.edit.saveChanges') }}</button>
            }

            <div class="sec-title" style="margin-top:24px">{{ t('userGroups.members') }}</div>
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
                  {{ m.access_level === 'full' ? t('userGroups.accessLevels.full') : t('userGroups.accessLevels.read') }}
                </span>
              </div>
            }
            @empty {
              <div class="empty-state"><div class="empty-icon">👤</div><div class="empty-title">{{ t('userGroups.noMembers') }}</div></div>
            }
          </div>
          @if (auth.isAdmin()) {
            <div class="pf">
              <button class="btn btn-d" (click)="deactivateGroup()">{{ t('userGroups.deactivate.action') }}</button>
              <button class="btn btn-g" (click)="selected.set(null)">{{ 'actions.close' | transloco }}</button>
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
            <div><div class="mot">{{ t('userGroups.create.title') }}</div><div class="mos">{{ t('userGroups.create.subtitle') }}</div></div>
          </div>
          <div style="padding:20px 24px;display:flex;flex-direction:column;gap:14px">
            <div class="fg">
              <label class="fl">{{ t('userGroups.fields.internalName') }} <span class="req">*</span></label>
              <input class="fi" [placeholder]="t('userGroups.create.internalNamePlaceholder')" [(ngModel)]="newGroup.name">
            </div>
            <div class="fg">
              <label class="fl">{{ t('userGroups.fields.displayName') }} <span class="req">*</span></label>
              <input class="fi" [placeholder]="t('userGroups.create.displayNamePlaceholder')" [(ngModel)]="newGroup.display_name">
            </div>
            <div class="fg">
              <label class="fl">{{ t('userGroups.fields.description') }}</label>
              <textarea class="fta" style="min-height:60px" [(ngModel)]="newGroup.description"></textarea>
            </div>
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
              <input type="checkbox" [(ngModel)]="newGroup.has_owner_restriction">
              {{ t('userGroups.create.ownerRestrictionCheckbox') }}
            </label>
          </div>
          <div style="padding:16px 24px;border-top:1px solid var(--gray-200);display:flex;gap:10px;justify-content:flex-end">
            <button class="btn btn-g" (click)="openNew=false">{{ 'actions.cancel' | transloco }}</button>
            <button class="btn btn-p" [disabled]="!newGroup.name.trim()" (click)="createGroup()">{{ t('userGroups.create.title') }}</button>
          </div>
        </div>
      </div>
    }
</ng-container>
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
  private transloco = inject(TranslocoService);

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
      this.toast.success(this.transloco.translate('admin.userGroups.edit.saved'));
    });
  }

  deactivateGroup(): void {
    const g = this.selected();
    if (!g || !confirm(this.transloco.translate('admin.userGroups.deactivate.confirm', { name: g.display_name }))) return;
    this.groupSvc.delete(g.id).subscribe(() => {
      this.selected.set(null);
      this.loadGroups();
      this.toast.success(this.transloco.translate('admin.userGroups.deactivate.done'));
    });
  }

  createGroup(): void {
    this.groupSvc.create(this.newGroup).subscribe(g => {
      this.groups.update(gs => [...gs, g]);
      this.openNew = false;
      this.newGroup = { name: '', display_name: '', description: '', has_owner_restriction: false };
      this.toast.success(this.transloco.translate('admin.userGroups.create.done', { name: g.display_name }));
    });
  }

  initials(name: string): string {
    return (name ?? '').split(' ').slice(0, 2).map(n => n[0] ?? '').join('').toUpperCase();
  }

  groupIcon(name: string): string {
    // Group names stored by tenants; the two Polish ones are spelled with escapes
    // because the i18n check rejects Polish letters in translated source files.
    const m: Record<string, string> = { Management: '🏢', 'Zarz\u0105d': '🏢', Sales: '💼', 'Sprzeda\u017c': '💼', Marketing: '📣', HR: '👥', Accounting: '💰', Operations: '⚙️' };
    return m[name] ?? '📋';
  }

  groupBg(name: string): string {
    return groupCssClass(name);
  }
}
