// src/app/pages/crm/groups/crm-groups.component.ts
import { Component, OnInit, inject, NgZone, ChangeDetectorRef} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CrmApiService, PartnerGroup } from '../../../core/services/crm-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';

@Component({
  selector: 'wt-crm-groups',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('crm')],
  template: `
<ng-container *transloco="let t; prefix: 'crm'">
<div class="page">
  <div class="topbar">
    <h1>{{ t('partnerGroups.title') }}</h1>
    <button class="btn btn-p" *ngIf="isManager" (click)="openCreate()">+ {{ t('partnerGroups.newGroup') }}</button>
  </div>

  <div *ngIf="loading" class="loading">{{ 'states.loading' | transloco }}</div>

  <div *ngIf="!loading" class="groups-grid">
    <div *ngFor="let g of groups" class="group-card"
         [class.highlighted]="g.id === highlightedId"
         (click)="viewGroup(g)">
      <div class="gc-header">
        <div class="gc-icon">🏢</div>
        <div class="gc-title">
          <div class="gc-name">{{g.name}}
            <span *ngIf="g.source==='dwh'" class="dwh-tag">DWH</span>
          </div>
          <div class="gc-industry" *ngIf="g.industry">{{g.industry}}</div>
        </div>
        <div class="gc-actions" *ngIf="isManager && g.source !== 'dwh'" (click)="$event.stopPropagation()">
          <button class="icon-btn" (click)="editGroup(g)">✏️</button>
        </div>
      </div>
      <div class="gc-stats">
        <span class="gc-stat"><strong>{{g.partner_count}}</strong> {{ t('partnerGroups.card.partnersNoun', { count: g.partner_count }) }}</span>
        <span class="gc-stat accent"><strong>{{(g.total_arr || 0) | number:'1.0-0'}} PLN</strong> ARR</span>
      </div>
      <div class="gc-mgr" *ngIf="g.manager_name">👤 {{g.manager_name}}</div>
      <div class="gc-desc" *ngIf="g.description">{{g.description}}</div>
      <div class="gc-partners">
        <span class="partner-chip" *ngFor="let p of g.partners.slice(0,4)">
          {{p.company}}
        </span>
        <span class="partner-chip more" *ngIf="g.partners.length > 4">{{ t('partnerGroups.card.morePartners', { count: g.partners.length - 4 }) }}</span>
      </div>
    </div>
    <div class="no-groups" *ngIf="groups.length === 0">{{ t('partnerGroups.empty') }}</div>
  </div>

  <!-- ── Panel szczegółów grupy ── -->
  <div class="side-panel" *ngIf="viewingGroup" (click)="closeViewPanel()">
    <div class="side-panel-inner view-panel" (click)="$event.stopPropagation()">
      <div class="vp-header">
        <div>
          <div class="vp-title">🏢 {{viewingGroup.name}}</div>
          <div class="vp-sub" *ngIf="viewingGroup.industry">{{viewingGroup.industry}}</div>
        </div>
        <div class="vp-header-actions">
          <span *ngIf="viewingGroup.source==='dwh'" class="dwh-tag">DWH</span>
          <button class="icon-btn" *ngIf="isManager && viewingGroup.source !== 'dwh'" (click)="editGroup(viewingGroup)">✏️</button>
          <button class="close-btn" (click)="closeViewPanel()">✕</button>
        </div>
      </div>

      <div class="vp-stats">
        <div class="vp-stat">
          <div class="vp-stat-val">{{viewingGroup.partner_count}}</div>
          <div class="vp-stat-lbl">{{ t('partnerGroups.details.partnersStat') }}</div>
        </div>
        <div class="vp-stat">
          <div class="vp-stat-val accent">{{(viewingGroup.total_arr || 0) | number:'1.0-0'}}</div>
          <div class="vp-stat-lbl">PLN ARR</div>
        </div>
      </div>

      <div *ngIf="viewingGroup.manager_name" class="vp-mgr">👤 {{ t('partnerGroups.details.manager') }} <strong>{{viewingGroup.manager_name}}</strong></div>
      <div *ngIf="viewingGroup.description" class="vp-desc">{{viewingGroup.description}}</div>

      <div class="vp-partners-section">
        <div class="vp-section-title">{{ t('partnerGroups.details.partnersInGroup', { count: viewingGroup.partners.length }) }}</div>
        <div *ngIf="viewingGroup.partners.length === 0" class="vp-empty">{{ t('partnerGroups.details.empty') }}</div>
        <div *ngFor="let p of viewingGroup.partners" class="vp-partner-row" (click)="goToPartner(p.id!)">
          <div class="vp-partner-name">{{p.company}}</div>
          <svg class="vp-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9,18 15,12 9,6"/>
          </svg>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Panel tworzenia/edycji grupy ── -->
  <div class="side-panel" *ngIf="showCreate || editingGroup" (click)="closePanel()">
    <div class="side-panel-inner" (click)="$event.stopPropagation()">
      <h3>{{editingGroup ? t('partnerGroups.form.editTitle') : t('partnerGroups.newGroup')}}</h3>
      <label>{{ t('partnerGroups.form.name') }} *<input class="fi" [(ngModel)]="form.name" [placeholder]="t('partnerGroups.form.namePlaceholder')"></label>
      <label>{{ t('partnerGroups.form.industry') }}<input class="fi" [(ngModel)]="form.industry"></label>
      <label>{{ t('partnerGroups.form.description') }}<textarea class="fta" [(ngModel)]="form.description" rows="3"></textarea></label>
      <div class="panel-actions">
        <button class="btn btn-g" (click)="closePanel()">{{ 'actions.cancel' | transloco }}</button>
        <button class="btn btn-p" (click)="saveGroup()" [disabled]="!form.name || saving">
          {{saving ? '…' : (editingGroup ? ('actions.save' | transloco) : t('partnerGroups.form.create'))}}
        </button>
        <button class="btn btn-d" *ngIf="editingGroup" (click)="deleteGroup()" [disabled]="saving">{{ t('partnerGroups.form.delete') }}</button>
      </div>
    </div>
  </div>
</div>
</ng-container>
  `,
  styles: [`
    .page { display:flex; flex-direction:column; height:100%; overflow:hidden; }
    .topbar { display:flex; align-items:center; gap:12px; height:60px; padding:0 24px; background:var(--surface); border-bottom:1px solid var(--gray-200); flex-shrink:0; }
    .topbar h1 { font-family:'Sora',sans-serif; font-size:18px; font-weight:700; color:var(--gray-900); margin:0; flex:1; }
    .dwh-tag { font-size:10px; font-weight:700; background:color-mix(in srgb, #dbeafe var(--tint-mix), var(--surface)); color:color-mix(in srgb, #1d4ed8 var(--tint-text-mix), #FFFFFF); border-radius:999px; padding:2px 8px; margin-left:8px; vertical-align:middle; }
    .loading { padding:40px; text-align:center; color:var(--gray-400); }
    .groups-grid { flex:1; overflow:auto; display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:16px; padding:20px 24px 24px; align-content:start; }
    .group-card { background:var(--surface); border-radius:12px; padding:16px; cursor:pointer; box-shadow:var(--shadow-sm); transition:box-shadow .15s, transform .15s; }
    .group-card:hover { box-shadow:var(--shadow); transform:translateY(-2px); }
    .group-card.highlighted { box-shadow:0 0 0 2px var(--orange), var(--shadow-sm); }
    .gc-header { display:flex; align-items:flex-start; gap:12px; margin-bottom:12px; }
    .gc-icon { width:40px; height:40px; border-radius:12px; background:var(--orange-pale); color:var(--orange-dark); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .gc-icon svg.ic { width:20px; height:20px; }
    .gc-title { flex:1; }
    .gc-name { font-weight:700; font-size:16px; }
    .gc-industry { font-size:12px; color:var(--gray-400); }
    .gc-actions { }
    .icon-btn { width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center; background:none; border:none; border-radius:999px; cursor:pointer; color:var(--gray-500); }
    .icon-btn:hover { background:var(--gray-100); color:var(--orange-dark); }
    .gc-stats { display:flex; gap:12px; margin-bottom:8px; }
    .gc-stat { font-size:12px; color:var(--gray-500); }
    .gc-stat.accent strong { color: var(--orange-text); }
    .gc-mgr { display:flex; align-items:center; gap:4px; font-size:12px; color:var(--gray-400); margin-bottom:8px; }
    .gc-desc { font-size:12px; color:var(--gray-500); margin-bottom:8px; }
    .gc-partners { display:flex; flex-wrap:wrap; gap:4px; }
    .partner-chip { background:var(--gray-100); border-radius:999px; padding:2px 8px; font-size:10px; }
    .partner-chip.more { color:var(--gray-400); }
    .no-groups { grid-column:1/-1; text-align:center; color:var(--gray-400); padding:32px; }
    /* Side panels */
    .side-panel { position:fixed; inset:0; background:rgba(0,0,0,.3); z-index:100; display:flex; justify-content:flex-end; }
    .side-panel-inner { background:var(--surface); width:380px; height:100%; overflow-y:auto; padding:24px; display:flex; flex-direction:column; gap:12px; box-shadow:var(--shadow-lg); }
    .side-panel-inner h3 { margin:0; font-size:16px; font-weight:700; }
    .side-panel-inner label { display:flex; flex-direction:column; gap:4px; font-size:12px; font-weight:600; }
    .panel-actions { display:flex; gap:8px; margin-top:8px; flex-wrap:wrap; }
    /* View panel */
    .view-panel { gap:0; padding:0; }
    .vp-header { display:flex; align-items:flex-start; justify-content:space-between; padding:20px 20px 16px; border-bottom:1px solid var(--gray-100); }
    .vp-title { display:flex; align-items:center; gap:8px; font-family:'Sora',sans-serif; font-size:16px; font-weight:700; }
    .vp-sub { font-size:12px; color:var(--gray-400); margin-top:2px; }
    .vp-header-actions { display:flex; gap:8px; align-items:center; }
    .close-btn { background:none; border:none; font-size:18px; color:var(--gray-400); cursor:pointer; line-height:1; }
    .vp-stats { display:flex; gap:0; border-bottom:1px solid var(--gray-100); }
    .vp-stat { flex:1; padding:14px 20px; text-align:center; }
    .vp-stat:not(:last-child) { border-right:1px solid var(--gray-100); }
    .vp-stat-val { font-size:20px; font-weight:800; }
    .vp-stat-val.accent { color: var(--orange-text); }
    .vp-stat-lbl { font-size:12px; color:var(--gray-400); margin-top:2px; }
    .vp-mgr { display:flex; align-items:center; gap:4px; font-size:12px; color:var(--gray-500); padding:12px 20px 0; }
    .vp-desc { font-size:12px; color:var(--gray-500); padding:8px 20px 0; white-space:pre-line; }
    .vp-partners-section { padding:16px 20px; flex:1; }
    .vp-section-title { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:var(--gray-400); margin-bottom:10px; }
    .vp-empty { font-size:14px; color:var(--gray-400); text-align:center; padding:20px; }
    .vp-partner-row { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:12px; cursor:pointer; transition:.12s; }
    .vp-partner-row:hover { background:var(--orange-pale); }
    .vp-partner-name { font-size:14px; font-weight:600; }
    .vp-chev { width:16px; height:16px; color:#d1d5db; flex-shrink:0; }
    .vp-partner-row:hover .vp-chev { color: var(--orange-text); }
  `],
})
export class CrmGroupsComponent implements OnInit {
  private api   = inject(CrmApiService);
  private zone  = inject(NgZone);
  private cdr   = inject(ChangeDetectorRef);
  private auth  = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);
  private transloco = inject(TranslocoService);

  groups: PartnerGroup[] = [];
  loading = false;
  showCreate = false;
  editingGroup: PartnerGroup | null = null;
  viewingGroup: PartnerGroup | null = null;
  highlightedId: number | null = null;
  saving = false;
  form: { name: string; industry: string; description: string } = { name: '', industry: '', description: '' };

  get isManager() {
    const u = this.auth.user();
    return u?.is_admin || u?.crm_role === 'sales_manager';
  }

  ngOnInit() {
    this.loadGroups(() => {
      // Po załadowaniu sprawdź query param ?group=ID
      const gid = this.route.snapshot.queryParamMap.get('group');
      if (gid) {
        const id = parseInt(gid, 10);
        const found = this.groups.find(g => g.id === id);
        if (found) {
          this.highlightedId = id;
          this.viewingGroup = found;
          this.cdr.markForCheck();
        }
      }
    });
  }

  loadGroups(callback?: () => void) {
    this.loading = true;
    this.api.getGroups().subscribe({
      next: r => {
        this.groups = r;
        this.zone.run(() => { this.loading = false; });
        this.cdr.markForCheck();
        if (callback) callback();
      },
      error: () => { this.zone.run(() => { this.loading = false; }); this.cdr.markForCheck(); }
    });
  }

  viewGroup(g: PartnerGroup) {
    this.viewingGroup = g;
    this.highlightedId = g.id;
    this.cdr.markForCheck();
  }

  closeViewPanel() {
    this.viewingGroup = null;
    this.highlightedId = null;
    this.cdr.markForCheck();
  }

  goToPartner(id: number) {
    this.router.navigate(['/crm/partners', id]);
  }

  openCreate() {
    this.form = { name: '', industry: '', description: '' };
    this.showCreate = true;
  }

  editGroup(g: PartnerGroup) {
    this.viewingGroup = null;
    this.editingGroup = g;
    this.form = { name: g.name, industry: g.industry || '', description: g.description || '' };
  }

  closePanel() { this.showCreate = false; this.editingGroup = null; this.form = { name: '', industry: '', description: '' }; }

  saveGroup() {
    if (!this.form.name) return;
    this.saving = true;
    const data = { name: this.form.name, industry: this.form.industry || null, description: this.form.description || null };
    const obs = this.editingGroup
      ? this.api.updateGroup(this.editingGroup.id!, data)
      : this.api.createGroup(data);
    obs.subscribe({ next: () => { this.saving = false; this.closePanel(); this.loadGroups(); }, error: () => { this.saving = false; this.toast.error(this.transloco.translate('crm.partnerGroups.messages.saveFailed')); } });
  }

  deleteGroup() {
    if (!this.editingGroup) return;
    if (!confirm(this.transloco.translate('crm.partnerGroups.messages.deleteConfirm', { name: this.editingGroup.name }))) return;
    this.saving = true;
    this.api.deleteGroup(this.editingGroup.id!).subscribe({ next: () => { this.saving = false; this.closePanel(); this.loadGroups(); }, error: () => { this.saving = false; this.toast.error(this.transloco.translate('crm.partnerGroups.messages.deleteFailed')); } });
  }
}
