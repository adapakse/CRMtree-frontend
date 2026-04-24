// src/app/pages/crm/groups/crm-groups.component.ts
import { Component, OnInit, inject, NgZone, ChangeDetectorRef} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CrmApiService, PartnerGroup } from '../../../core/services/crm-api.service';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'wt-crm-groups',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
<div class="page">
  <div class="topbar">
    <h1>Grupy partnerskie</h1>
    <button class="btn-primary" *ngIf="isManager" (click)="openCreate()">+ Nowa grupa</button>
  </div>

  <div *ngIf="loading" class="loading">Ładowanie…</div>

  <div *ngIf="!loading" class="groups-grid">
    <div *ngFor="let g of groups" class="group-card"
         [class.highlighted]="g.id === highlightedId"
         (click)="viewGroup(g)">
      <div class="gc-header">
        <div class="gc-icon">🏢</div>
        <div class="gc-title">
          <div class="gc-name">{{g.name}}
            <span *ngIf="g.source==='dwh'" style="font-size:10px;font-weight:700;background:#dbeafe;color:#1d4ed8;border-radius:4px;padding:1px 6px;margin-left:6px;vertical-align:middle">DWH</span>
          </div>
          <div class="gc-industry" *ngIf="g.industry">{{g.industry}}</div>
        </div>
        <div class="gc-actions" *ngIf="isManager && g.source !== 'dwh'" (click)="$event.stopPropagation()">
          <button class="icon-btn" (click)="editGroup(g)">✏️</button>
        </div>
      </div>
      <div class="gc-stats">
        <span class="gc-stat"><strong>{{g.partner_count}}</strong> partnerów</span>
        <span class="gc-stat accent"><strong>{{(g.total_arr || 0) | number:'1.0-0'}} PLN</strong> ARR</span>
      </div>
      <div class="gc-mgr" *ngIf="g.manager_name">👤 {{g.manager_name}}</div>
      <div class="gc-desc" *ngIf="g.description">{{g.description}}</div>
      <div class="gc-partners">
        <span class="partner-chip" *ngFor="let p of g.partners.slice(0,4)">
          {{p.company}}
        </span>
        <span class="partner-chip more" *ngIf="g.partners.length > 4">+{{g.partners.length - 4}} więcej</span>
      </div>
    </div>
    <div class="no-groups" *ngIf="groups.length === 0">Brak grup partnerskich.</div>
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
          <span *ngIf="viewingGroup.source==='dwh'" style="font-size:10px;font-weight:700;background:#dbeafe;color:#1d4ed8;border-radius:4px;padding:2px 8px;margin-right:4px">DWH</span>
          <button class="icon-btn" *ngIf="isManager && viewingGroup.source !== 'dwh'" (click)="editGroup(viewingGroup)">✏️</button>
          <button class="close-btn" (click)="closeViewPanel()">✕</button>
        </div>
      </div>

      <div class="vp-stats">
        <div class="vp-stat">
          <div class="vp-stat-val">{{viewingGroup.partner_count}}</div>
          <div class="vp-stat-lbl">Partnerów</div>
        </div>
        <div class="vp-stat">
          <div class="vp-stat-val accent">{{(viewingGroup.total_arr || 0) | number:'1.0-0'}}</div>
          <div class="vp-stat-lbl">PLN ARR</div>
        </div>
      </div>

      <div *ngIf="viewingGroup.manager_name" class="vp-mgr">👤 Opiekun: <strong>{{viewingGroup.manager_name}}</strong></div>
      <div *ngIf="viewingGroup.description" class="vp-desc">{{viewingGroup.description}}</div>

      <div class="vp-partners-section">
        <div class="vp-section-title">Partnerzy w grupie ({{viewingGroup.partners.length}})</div>
        <div *ngIf="viewingGroup.partners.length === 0" class="vp-empty">Brak partnerów w tej grupie.</div>
        <div *ngFor="let p of viewingGroup.partners" class="vp-partner-row" (click)="goToPartner(p.id!)">
          <div class="vp-partner-name">{{p.company}}</div>
          <svg class="vp-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9,18 15,12 9,6"/>
          </svg>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Panel tworzenia/edycji grupy ── -->
  <div class="side-panel" *ngIf="showCreate || editingGroup" (click)="closePanel()">
    <div class="side-panel-inner" (click)="$event.stopPropagation()">
      <h3>{{editingGroup ? 'Edytuj grupę' : 'Nowa grupa'}}</h3>
      <label>Nazwa *<input [(ngModel)]="form.name" placeholder="Nazwa grupy"></label>
      <label>Branża<input [(ngModel)]="form.industry"></label>
      <label>Opis<textarea [(ngModel)]="form.description" rows="3"></textarea></label>
      <div class="panel-actions">
        <button class="btn-outline" (click)="closePanel()">Anuluj</button>
        <button class="btn-primary" (click)="saveGroup()" [disabled]="!form.name || saving">
          {{saving ? '…' : (editingGroup ? 'Zapisz' : 'Utwórz')}}
        </button>
        <button class="btn-danger" *ngIf="editingGroup" (click)="deleteGroup()" [disabled]="saving">Usuń</button>
      </div>
    </div>
  </div>
</div>
  `,
  styles: [`
    .page { display:flex; flex-direction:column; height:100%; overflow:hidden; }
    .topbar { display:flex; align-items:center; padding:14px 20px; border-bottom:1px solid #e5e7eb; flex-shrink:0; }
    .topbar h1 { font-size:18px; font-weight:700; margin:0; flex:1; }
    .btn-primary { background:#f97316; color:white; border:none; border-radius:8px; padding:7px 14px; font-size:13px; font-weight:600; cursor:pointer; }
    .btn-outline { background:white; color:#374151; border:1px solid #d1d5db; border-radius:8px; padding:7px 14px; font-size:13px; cursor:pointer; }
    .btn-danger { background:#fee2e2; color:#991b1b; border:1px solid #fecaca; border-radius:8px; padding:7px 14px; font-size:13px; cursor:pointer; }
    .loading { padding:40px; text-align:center; color:#9ca3af; }
    .groups-grid { flex:1; overflow:auto; display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:14px; padding:16px 20px; align-content:start; }
    .group-card { background:white; border:1px solid #e5e7eb; border-radius:12px; padding:16px; cursor:pointer; transition:box-shadow .15s, border-color .15s; }
    .group-card:hover { box-shadow:0 4px 14px rgba(0,0,0,.08); border-color:#fed7aa; }
    .group-card.highlighted { border-color:#f97316; box-shadow:0 0 0 3px rgba(249,115,22,.15); }
    .gc-header { display:flex; align-items:flex-start; gap:10px; margin-bottom:10px; }
    .gc-icon { font-size:24px; }
    .gc-title { flex:1; }
    .gc-name { font-weight:700; font-size:15px; }
    .gc-industry { font-size:11px; color:#9ca3af; }
    .gc-actions { }
    .icon-btn { background:none; border:none; cursor:pointer; font-size:14px; opacity:.5; }
    .icon-btn:hover { opacity:1; }
    .gc-stats { display:flex; gap:12px; margin-bottom:6px; }
    .gc-stat { font-size:12px; color:#6b7280; }
    .gc-stat.accent strong { color:#f97316; }
    .gc-mgr { font-size:11px; color:#9ca3af; margin-bottom:6px; }
    .gc-desc { font-size:11px; color:#6b7280; margin-bottom:8px; }
    .gc-partners { display:flex; flex-wrap:wrap; gap:4px; }
    .partner-chip { background:#f3f4f6; border-radius:8px; padding:2px 8px; font-size:10px; }
    .partner-chip.more { color:#9ca3af; }
    .no-groups { grid-column:1/-1; text-align:center; color:#9ca3af; padding:32px; }
    /* Side panels */
    .side-panel { position:fixed; inset:0; background:rgba(0,0,0,.3); z-index:100; display:flex; justify-content:flex-end; }
    .side-panel-inner { background:white; width:380px; height:100%; overflow-y:auto; padding:24px; display:flex; flex-direction:column; gap:12px; }
    .side-panel-inner h3 { margin:0; font-size:16px; font-weight:700; }
    .side-panel-inner label { display:flex; flex-direction:column; gap:4px; font-size:12px; font-weight:600; }
    .side-panel-inner input, .side-panel-inner textarea { border:1px solid #d1d5db; border-radius:6px; padding:7px 10px; font-size:13px; outline:none; font-family:inherit; resize:vertical; }
    .panel-actions { display:flex; gap:8px; margin-top:8px; flex-wrap:wrap; }
    /* View panel */
    .view-panel { gap:0; padding:0; }
    .vp-header { display:flex; align-items:flex-start; justify-content:space-between; padding:20px 20px 16px; border-bottom:1px solid #f3f4f6; }
    .vp-title { font-size:17px; font-weight:800; }
    .vp-sub { font-size:12px; color:#9ca3af; margin-top:2px; }
    .vp-header-actions { display:flex; gap:6px; align-items:center; }
    .close-btn { background:none; border:none; font-size:18px; color:#9ca3af; cursor:pointer; line-height:1; }
    .vp-stats { display:flex; gap:0; border-bottom:1px solid #f3f4f6; }
    .vp-stat { flex:1; padding:14px 20px; text-align:center; }
    .vp-stat:not(:last-child) { border-right:1px solid #f3f4f6; }
    .vp-stat-val { font-size:20px; font-weight:800; }
    .vp-stat-val.accent { color:#f97316; }
    .vp-stat-lbl { font-size:11px; color:#9ca3af; margin-top:2px; }
    .vp-mgr { font-size:12px; color:#6b7280; padding:12px 20px 0; }
    .vp-desc { font-size:12px; color:#6b7280; padding:8px 20px 0; white-space:pre-line; }
    .vp-partners-section { padding:16px 20px; flex:1; }
    .vp-section-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:#9ca3af; margin-bottom:10px; }
    .vp-empty { font-size:13px; color:#9ca3af; text-align:center; padding:20px; }
    .vp-partner-row { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:8px; cursor:pointer; transition:.12s; }
    .vp-partner-row:hover { background:#fff7ed; }
    .vp-partner-name { font-size:13px; font-weight:600; }
    .vp-arrow { width:16px; height:16px; color:#d1d5db; flex-shrink:0; }
    .vp-partner-row:hover .vp-arrow { color:#f97316; }
  `],
})
export class CrmGroupsComponent implements OnInit {
  private api   = inject(CrmApiService);
  private zone  = inject(NgZone);
  private cdr   = inject(ChangeDetectorRef);
  private auth  = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

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
      ? this.api.updateGroup(this.editingGroup.id, data)
      : this.api.createGroup(data);
    obs.subscribe({ next: () => { this.saving = false; this.closePanel(); this.loadGroups(); }, error: () => { this.saving = false; } });
  }

  deleteGroup() {
    if (!this.editingGroup) return;
    if (!confirm(`Usunąć grupę "${this.editingGroup.name}"? Partnerzy zostaną odłączeni.`)) return;
    this.saving = true;
    this.api.deleteGroup(this.editingGroup.id).subscribe({ next: () => { this.saving = false; this.closePanel(); this.loadGroups(); }, error: () => { this.saving = false; } });
  }
}
