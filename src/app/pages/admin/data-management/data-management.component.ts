// src/app/pages/admin/data-management/data-management.component.ts
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { localizedApiErrorMessage } from '../../../core/services/api-error.util';

const BASE      = '/api/admin/data';
const API_DOCS  = '/api/documents';
const API_LEADS = '/api/crm/leads';
const API_PTNR  = '/api/crm/partners';

interface SearchResult { id: string | number; label: string; sublabel?: string; }

@Component({
  selector: 'wt-data-management',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('admin')],
  template: `
<ng-container *transloco="let t; prefix: 'admin'">
<div class="dm-page">
  <div class="dm-header">
    <h1>🗄️ {{ t('dataManagement.title') }}</h1>
  </div>
  <div class="dm-body">
    <p class="sub">{{ t('dataManagement.subtitle') }}</p>

  <!-- ── Sekcja 1: Kasowanie pojedynczych elementów ── -->
  <div class="dm-section">
    <div class="section-head">
      <div class="section-icon danger">🗑️</div>
      <div>
        <div class="section-title">{{ t('dataManagement.delete.title') }}</div>
        <div class="section-sub">{{ t('dataManagement.delete.subtitle') }}</div>
      </div>
    </div>

    <div class="delete-grid">

      <!-- Dokument -->
      <div class="delete-card">
        <div class="dc-head">
          <span class="dc-icon">📄</span>
          <div>
            <div class="dc-title">{{ t('dataManagement.delete.document.title') }}</div>
            <div class="dc-desc">{{ t('dataManagement.delete.document.description') }}</div>
          </div>
        </div>
        <div class="search-wrap">
          <input class="dm-input" [(ngModel)]="docSearch" (ngModelChange)="onDocSearch($event)"
                 [placeholder]="t('dataManagement.delete.document.searchPlaceholder')" autocomplete="off">
          <div class="suggestions" *ngIf="docSuggestions.length && !docSelected">
            <div *ngFor="let s of docSuggestions" class="suggestion-item" (mousedown)="selectDoc(s)">
              <span class="sug-label">{{ s.label }}</span>
              <span class="sug-sub" *ngIf="s.sublabel">{{ s.sublabel }}</span>
            </div>
          </div>
        </div>
        <div *ngIf="docSelected" class="selected-badge">
          <span class="sel-name">📄 {{ docSelected.label }}</span>
          <button class="sel-clear" (click)="clearDocSel()">✕</button>
        </div>
        <button class="btn btn-d" (click)="deleteDocument()" [disabled]="!docSelected || deleting() === 'doc'">
          {{ deleting() === 'doc' ? '⏳ ' + t('dataManagement.delete.inProgress') : '🗑️ ' + t('dataManagement.delete.document.action') }}
        </button>
        <div *ngIf="deleteDocResult" class="result-ok">✓ {{ t('dataManagement.delete.deleted', { name: deleteDocResult }) }}</div>
      </div>

      <!-- Lead -->
      <div class="delete-card">
        <div class="dc-head">
          <span class="dc-icon">👤</span>
          <div>
            <div class="dc-title">{{ t('dataManagement.delete.lead.title') }}</div>
            <div class="dc-desc">{{ t('dataManagement.delete.lead.description') }}</div>
          </div>
        </div>
        <div class="search-wrap">
          <input class="dm-input" [(ngModel)]="leadSearch" (ngModelChange)="onLeadSearch($event)"
                 [placeholder]="t('dataManagement.delete.lead.searchPlaceholder')" autocomplete="off">
          <div class="suggestions" *ngIf="leadSuggestions.length && !leadSelected">
            <div *ngFor="let s of leadSuggestions" class="suggestion-item" (mousedown)="selectLead(s)">
              <span class="sug-label">{{ s.label }}</span>
              <span class="sug-sub" *ngIf="s.sublabel">{{ s.sublabel }}</span>
            </div>
          </div>
        </div>
        <div *ngIf="leadSelected" class="selected-badge">
          <span class="sel-name">👤 {{ leadSelected.label }}</span>
          <button class="sel-clear" (click)="clearLeadSel()">✕</button>
        </div>
        <button class="btn btn-d" (click)="deleteLead()" [disabled]="!leadSelected || deleting() === 'lead'">
          {{ deleting() === 'lead' ? '⏳ ' + t('dataManagement.delete.inProgress') : '🗑️ ' + t('dataManagement.delete.lead.action') }}
        </button>
        <div *ngIf="deleteLeadResult" class="result-ok">✓ {{ t('dataManagement.delete.deleted', { name: deleteLeadResult }) }}</div>
      </div>

      <!-- Partner -->
      <div class="delete-card">
        <div class="dc-head">
          <span class="dc-icon">🤝</span>
          <div>
            <div class="dc-title">{{ t('dataManagement.delete.partner.title') }}</div>
            <div class="dc-desc">{{ t('dataManagement.delete.partner.description') }}</div>
          </div>
        </div>
        <div class="search-wrap">
          <input class="dm-input" [(ngModel)]="partnerSearch" (ngModelChange)="onPartnerSearch($event)"
                 [placeholder]="t('dataManagement.delete.partner.searchPlaceholder')" autocomplete="off">
          <div class="suggestions" *ngIf="partnerSuggestions.length && !partnerSelected">
            <div *ngFor="let s of partnerSuggestions" class="suggestion-item" (mousedown)="selectPartner(s)">
              <span class="sug-label">{{ s.label }}</span>
              <span class="sug-sub" *ngIf="s.sublabel">{{ s.sublabel }}</span>
            </div>
          </div>
        </div>
        <div *ngIf="partnerSelected" class="selected-badge">
          <span class="sel-name">🤝 {{ partnerSelected.label }}</span>
          <button class="sel-clear" (click)="clearPartnerSel()">✕</button>
        </div>
        <button class="btn btn-d" (click)="deletePartner()" [disabled]="!partnerSelected || deleting() === 'partner'">
          {{ deleting() === 'partner' ? '⏳ ' + t('dataManagement.delete.inProgress') : '🗑️ ' + t('dataManagement.delete.partner.action') }}
        </button>
        <div *ngIf="deletePartnerResult" class="result-ok">✓ {{ t('dataManagement.delete.deleted', { name: deletePartnerResult }) }}</div>
      </div>

    </div>
    <div *ngIf="deleteError" class="result-err mt-2">✗ {{ deleteError }}</div>
  </div>

  <!-- ── Sekcja 2: Czyszczenie grup danych ── -->
  <div class="dm-section">
    <div class="section-head">
      <div class="section-icon danger">⚠️</div>
      <div>
        <div class="section-title">{{ t('dataManagement.purge.title') }}</div>
        <div class="section-sub">{{ t('dataManagement.purge.subtitle') }}</div>
      </div>
    </div>

    <div class="purge-grid">

      <!-- Purge Documents -->
      <div class="purge-card">
        <div class="purge-card-head">
          <span class="dc-icon">📄</span>
          <div>
            <div class="purge-card-title">{{ t('dataManagement.purge.docs.title') }}</div>
            <div class="purge-card-desc">{{ t('dataManagement.purge.docs.description') }}</div>
          </div>
        </div>
        <div *ngIf="purgeConfirming !== 'docs'" class="purge-act">
          <button class="btn btn-d" (click)="purgeConfirming='docs'">🗑️ {{ t('dataManagement.purge.docs.action') }}</button>
        </div>
        <div *ngIf="purgeConfirming === 'docs'" class="inline-confirm">
          <input class="dm-input" [(ngModel)]="purgeTexts.docs" [placeholder]="t('dataManagement.purge.typePhrase', { phrase: t('dataManagement.purge.docs.confirmPhrase') })">
          <div class="confirm-actions">
            <button class="btn btn-g btn-sm" (click)="purgeConfirming=''">{{ 'actions.cancel' | transloco }}</button>
            <button class="btn btn-d btn-sm" (click)="purgeCategory('docs')"
                    [disabled]="purgeTexts.docs !== t('dataManagement.purge.docs.confirmPhrase') || purging() === 'docs'">
              {{ purging() === 'docs' ? '⏳…' : t('dataManagement.purge.confirm') }}
            </button>
          </div>
        </div>
        <div *ngIf="purgeResults.docs" class="result-ok mt-2">✓ {{ purgeResults.docs }}</div>
      </div>

      <!-- Purge Leads -->
      <div class="purge-card">
        <div class="purge-card-head">
          <span class="dc-icon">👤</span>
          <div>
            <div class="purge-card-title">{{ t('dataManagement.purge.leads.title') }}</div>
            <div class="purge-card-desc">{{ t('dataManagement.purge.leads.description') }}</div>
          </div>
        </div>
        <div *ngIf="purgeConfirming !== 'leads'" class="purge-act">
          <button class="btn btn-d" (click)="purgeConfirming='leads'">🗑️ {{ t('dataManagement.purge.leads.action') }}</button>
        </div>
        <div *ngIf="purgeConfirming === 'leads'" class="inline-confirm">
          <input class="dm-input" [(ngModel)]="purgeTexts.leads" [placeholder]="t('dataManagement.purge.typePhrase', { phrase: t('dataManagement.purge.leads.confirmPhrase') })">
          <div class="confirm-actions">
            <button class="btn btn-g btn-sm" (click)="purgeConfirming=''">{{ 'actions.cancel' | transloco }}</button>
            <button class="btn btn-d btn-sm" (click)="purgeCategory('leads')"
                    [disabled]="purgeTexts.leads !== t('dataManagement.purge.leads.confirmPhrase') || purging() === 'leads'">
              {{ purging() === 'leads' ? '⏳…' : t('dataManagement.purge.confirm') }}
            </button>
          </div>
        </div>
        <div *ngIf="purgeResults.leads" class="result-ok mt-2">✓ {{ purgeResults.leads }}</div>
      </div>

      <!-- Purge Partners -->
      <div class="purge-card">
        <div class="purge-card-head">
          <span class="dc-icon">🤝</span>
          <div>
            <div class="purge-card-title">{{ t('dataManagement.purge.partners.title') }}</div>
            <div class="purge-card-desc">{{ t('dataManagement.purge.partners.description') }}</div>
          </div>
        </div>
        <div *ngIf="purgeConfirming !== 'partners'" class="purge-act">
          <button class="btn btn-d" (click)="purgeConfirming='partners'">🗑️ {{ t('dataManagement.purge.partners.action') }}</button>
        </div>
        <div *ngIf="purgeConfirming === 'partners'" class="inline-confirm">
          <input class="dm-input" [(ngModel)]="purgeTexts.partners" [placeholder]="t('dataManagement.purge.typePhrase', { phrase: t('dataManagement.purge.partners.confirmPhrase') })">
          <div class="confirm-actions">
            <button class="btn btn-g btn-sm" (click)="purgeConfirming=''">{{ 'actions.cancel' | transloco }}</button>
            <button class="btn btn-d btn-sm" (click)="purgeCategory('partners')"
                    [disabled]="purgeTexts.partners !== t('dataManagement.purge.partners.confirmPhrase') || purging() === 'partners'">
              {{ purging() === 'partners' ? '⏳…' : t('dataManagement.purge.confirm') }}
            </button>
          </div>
        </div>
        <div *ngIf="purgeResults.partners" class="result-ok mt-2">✓ {{ purgeResults.partners }}</div>
      </div>

    </div>
    <div *ngIf="purgeError" class="result-err mt-12">✗ {{ purgeError }}</div>
  </div>

  <!-- ── Sekcja 3: Eksport / Import ustawień ── -->
  <div class="dm-section">
    <div class="section-head">
      <div class="section-icon">📦</div>
      <div>
        <div class="section-title">{{ t('dataManagement.settings.title') }}</div>
        <div class="section-sub">{{ t('dataManagement.settings.subtitle') }}</div>
      </div>
    </div>

    <div class="export-import-grid">
      <div class="ei-card">
        <div class="ei-title">📥 {{ t('dataManagement.settings.export.title') }}</div>
        <div class="ei-desc">{{ t('dataManagement.settings.export.description') }}</div>
        <div class="mt-12">
          <button class="btn btn-p" (click)="exportSettings()" [disabled]="exporting()">
            {{ exporting() ? '⏳ ' + t('dataManagement.settings.export.generating') : '📥 ' + t('dataManagement.settings.export.download') }}
          </button>
        </div>
      </div>

      <div class="ei-card">
        <div class="ei-title">📤 {{ t('dataManagement.settings.import.title') }}</div>
        <div class="ei-desc">{{ t('dataManagement.settings.import.description') }}</div>
        <div class="mt-12 import-col">
          <div class="drop-zone" [class.drag-over]="isDragging"
               (dragover)="$event.preventDefault(); isDragging=true"
               (dragleave)="isDragging=false" (drop)="onDrop($event)" (click)="fileInput.click()">
            <input #fileInput type="file" accept=".json" hidden (change)="onFileChange($event)">
            <span *ngIf="!selectedFile && !importing()">📂 {{ t('dataManagement.settings.import.dropHint') }}</span>
            <span *ngIf="selectedFile && !importing()">📄 {{ selectedFile.name }}</span>
            <span *ngIf="importing()">⏳ {{ t('dataManagement.settings.import.inProgress') }}</span>
          </div>
          <button class="btn btn-p" (click)="importSettings()" [disabled]="!selectedFile || importing()">
            {{ importing() ? '⏳ ' + t('dataManagement.settings.import.inProgress') : '📤 ' + t('dataManagement.settings.import.action') }}
          </button>
        </div>
        <div *ngIf="importResult" class="result-ok mt-2">
          ✓ {{ t('dataManagement.settings.import.result', { settingsUpdated: importResult.settingsUpdated, groupsUpdated: importResult.groupsUpdated }) }}
        </div>
        <div *ngIf="importError" class="result-err mt-2">✗ {{ importError }}</div>
      </div>
    </div>
  </div>
  </div>
</div>
</ng-container>
  `,
  styles: [`
    .dm-page { display:flex; flex-direction:column; height:100%; overflow:hidden; }
    .dm-header { height:60px; padding:0 24px; display:flex; align-items:center; gap:12px; background:var(--surface); border-bottom:1px solid var(--gray-200); flex-shrink:0; }
    .dm-header h1 { font-family:'Sora',sans-serif; font-size:18px; font-weight:700; color:var(--gray-900); margin:0; display:flex; align-items:center; gap:8px; }
    .dm-body { flex:1; overflow-y:auto; padding:20px 24px 24px; box-sizing:border-box; }
    .dm-body > * { max-width:1000px; }
    .sub { color:var(--gray-500); font-size:12px; margin:0 0 16px; }
    .dm-section { background:var(--surface); border-radius:12px; box-shadow:var(--shadow-sm); padding:20px; margin-bottom:16px; }
    .section-head { display:flex; gap:12px; align-items:flex-start; margin-bottom:16px; }
    .section-icon { width:40px; height:40px; border-radius:10px; background:var(--gray-50); display:flex; align-items:center; justify-content:center; font-size:20px; line-height:1; flex-shrink:0; }
    .section-title { font-size:16px; font-weight:700; color:var(--gray-800); }
    .section-sub { font-size:12px; color:var(--gray-500); margin-top:4px; line-height:1.5; }
    .delete-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; }
    @media(max-width:800px) { .delete-grid { grid-template-columns:1fr; } }
    .delete-card { background:var(--gray-50); border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:12px; }
    .dc-head { display:flex; gap:12px; align-items:flex-start; }
    .dc-icon { width:40px; height:40px; border-radius:10px; background:var(--surface); display:flex; align-items:center; justify-content:center; font-size:20px; line-height:1; flex-shrink:0; }
    .dc-title { font-size:14px; font-weight:700; color:var(--gray-800); }
    .dc-desc { font-size:12px; color:var(--gray-400); line-height:1.5; margin-top:2px; }
    .search-wrap { position:relative; }
    .suggestions { position:absolute; top:100%; left:0; right:0; z-index:100; background:var(--surface); border-radius:12px; box-shadow:var(--shadow-lg); max-height:200px; overflow-y:auto; margin-top:4px; padding:4px; }
    .suggestion-item { padding:8px 12px; border-radius:8px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; font-size:12px; }
    .suggestion-item:hover { background:var(--orange-pale); }
    .sug-label { font-weight:600; color:var(--gray-800); }
    .sug-sub { color:var(--gray-400); font-size:12px; }
    .selected-badge { display:flex; align-items:center; justify-content:space-between; gap:8px; background:var(--gray-50); border:1px solid color-mix(in srgb, #bbf7d0 var(--tint-mix), var(--surface)); border-radius:10px; padding:8px 12px; font-size:12px; }
    .sel-name { display:flex; align-items:center; gap:6px; min-width:0; color:color-mix(in srgb, #15803d var(--tint-text-mix), #FFFFFF); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .sel-clear { display:inline-flex; background:none; border:none; cursor:pointer; color:var(--gray-400); padding:0; flex-shrink:0; }
    .sel-clear:hover { color:color-mix(in srgb, #ef4444 var(--tint-text-mix), #FFFFFF); }
    .dm-input { height:36px; border:1px solid var(--gray-200); border-radius:10px; padding:0 12px; font-size:14px; outline:none; font-family:inherit; width:100%; box-sizing:border-box; background:var(--surface); }
    .dm-input:focus { border-color:var(--orange); }
    .mt-12 { margin-top:12px; }
    .result-ok, .result-err { display:flex; align-items:center; gap:8px; border-radius:10px; padding:8px 12px; font-size:12px; }
    .result-ok { color:color-mix(in srgb, #15803d var(--tint-text-mix), #FFFFFF); background:var(--gray-50); border:1px solid color-mix(in srgb, #bbf7d0 var(--tint-mix), var(--surface)); }
    .result-err { color:color-mix(in srgb, #dc2626 var(--tint-text-mix), #FFFFFF); background:var(--gray-50); border:1px solid color-mix(in srgb, #fecaca var(--tint-mix), var(--surface)); }
    .purge-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; }
    @media(max-width:800px) { .purge-grid { grid-template-columns:1fr; } }
    .purge-card { background:var(--gray-50); border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:8px; }
    .purge-card-head { display:flex; gap:12px; align-items:flex-start; }
    .purge-card-title { font-size:14px; font-weight:700; color:color-mix(in srgb, #991b1b var(--tint-text-mix), #FFFFFF); }
    .purge-card-desc { font-size:12px; color:var(--gray-400); line-height:1.5; margin-top:2px; }
    .purge-act { display:flex; justify-content:center; margin-top:8px; }
    .inline-confirm { background:var(--surface); border-radius:12px; box-shadow:var(--shadow-sm); padding:12px; margin-top:4px; }
    .confirm-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:8px; }
    .export-import-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    @media(max-width:600px) { .export-import-grid { grid-template-columns:1fr; } }
    .ei-card { background:var(--gray-50); border-radius:12px; padding:16px; }
    .ei-title { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:700; margin-bottom:8px; }
    .ei-desc { font-size:12px; color:var(--gray-500); line-height:1.5; }
    .import-col { display:flex; flex-direction:column; align-items:flex-start; gap:8px; }
    .import-col .drop-zone { align-self:stretch; }
    .drop-zone { display:flex; align-items:center; justify-content:center; gap:8px; border:2px dashed var(--gray-300); border-radius:12px; padding:20px; background:var(--surface); text-align:center; cursor:pointer; font-size:12px; color:var(--gray-400); transition:.2s; }
    .drop-zone span { display:inline-flex; align-items:center; gap:8px; }
    .drop-zone:hover, .drop-zone.drag-over { border-color:var(--orange); color: var(--orange-text); background:var(--orange-pale); }
  `],
})
export class DataManagementComponent {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private transloco = inject(TranslocoService);

  // ── Search state ──────────────────────────────────────────────
  docSearch       = ''; docSuggestions:  SearchResult[] = []; docSelected:  SearchResult | null = null;
  leadSearch      = ''; leadSuggestions: SearchResult[] = []; leadSelected: SearchResult | null = null;
  partnerSearch   = ''; partnerSuggestions: SearchResult[] = []; partnerSelected: SearchResult | null = null;
  private searchTimer: any;

  // ── Delete result state ───────────────────────────────────────
  deleteDocResult     = '';
  deleteLeadResult    = '';
  deletePartnerResult = '';
  deleteError         = '';
  deleting            = signal('');

  // ── Purge state ───────────────────────────────────────────────
  purgeConfirming = '';
  purgeTexts      = { docs: '', leads: '', partners: '' };
  purgeResults    = { docs: '', leads: '', partners: '' };
  purging         = signal('');
  purgeError      = '';

  // ── Export/Import state ───────────────────────────────────────
  exporting       = signal(false);
  importing       = signal(false);
  isDragging      = false;
  selectedFile: File | null = null;
  importResult: any = null;
  importError     = '';

  private hdrs(): HttpHeaders {
    const t = this.auth.getAccessToken();
    return t ? new HttpHeaders({ Authorization: 'Bearer ' + t }) : new HttpHeaders();
  }

  // ── Search helpers ────────────────────────────────────────────
  private debounce(fn: () => void) {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(fn, 300);
  }

  onDocSearch(q: string) {
    this.docSelected = null;
    if (q.length < 2) { this.docSuggestions = []; return; }
    this.debounce(() => {
      this.http.get<any>(`${API_DOCS}?search=${encodeURIComponent(q)}&limit=8`, { headers: this.hdrs() }).subscribe({
        next: r => {
          this.docSuggestions = (r.data || []).map((d: any) => ({
            id: d.id, label: d.name || d.doc_number, sublabel: d.doc_number
          }));
        },
        error: () => {}
      });
    });
  }

  onLeadSearch(q: string) {
    this.leadSelected = null;
    if (q.length < 2) { this.leadSuggestions = []; return; }
    this.debounce(() => {
      this.http.get<any>(`${API_LEADS}?search=${encodeURIComponent(q)}&limit=8`, { headers: this.hdrs() }).subscribe({
        next: r => {
          this.leadSuggestions = (r.data || []).map((l: any) => ({
            id: l.id, label: l.company, sublabel: l.contact_name || ''
          }));
        },
        error: () => {}
      });
    });
  }

  onPartnerSearch(q: string) {
    this.partnerSelected = null;
    if (q.length < 2) { this.partnerSuggestions = []; return; }
    this.debounce(() => {
      this.http.get<any>(`${API_PTNR}?search=${encodeURIComponent(q)}&limit=8`, { headers: this.hdrs() }).subscribe({
        next: r => {
          this.partnerSuggestions = (r.data || []).map((p: any) => ({
            id: p.id, label: p.company, sublabel: p.nip || ''
          }));
        },
        error: () => {}
      });
    });
  }

  selectDoc(s: SearchResult)     { this.docSelected = s;     this.docSearch = s.label;     this.docSuggestions = []; }
  selectLead(s: SearchResult)    { this.leadSelected = s;    this.leadSearch = s.label;    this.leadSuggestions = []; }
  selectPartner(s: SearchResult) { this.partnerSelected = s; this.partnerSearch = s.label; this.partnerSuggestions = []; }

  clearDocSel()     { this.docSelected = null;     this.docSearch = '';     this.docSuggestions = []; }
  clearLeadSel()    { this.leadSelected = null;    this.leadSearch = '';    this.leadSuggestions = []; }
  clearPartnerSel() { this.partnerSelected = null; this.partnerSearch = ''; this.partnerSuggestions = []; }

  // ── Delete single ─────────────────────────────────────────────
  deleteDocument() {
    if (!this.docSelected) return;
    this.deleting.set('doc'); this.deleteDocResult = ''; this.deleteError = '';
    this.http.delete<any>(`${BASE}/documents/${this.docSelected.id}`, { headers: this.hdrs() }).subscribe({
      next: r => { this.deleting.set(''); this.deleteDocResult = r.name || String(r.id); this.clearDocSel(); },
      error: e => { this.deleting.set(''); this.deleteError = localizedApiErrorMessage(e?.error?.error, this.transloco) || this.transloco.translate('admin.dataManagement.delete.document.failed'); },
    });
  }

  deleteLead() {
    if (!this.leadSelected) return;
    this.deleting.set('lead'); this.deleteLeadResult = ''; this.deleteError = '';
    this.http.delete<any>(`${BASE}/leads/${this.leadSelected.id}`, { headers: this.hdrs() }).subscribe({
      next: r => { this.deleting.set(''); this.deleteLeadResult = r.company || String(r.id); this.clearLeadSel(); },
      error: e => { this.deleting.set(''); this.deleteError = localizedApiErrorMessage(e?.error?.error, this.transloco) || this.transloco.translate('admin.dataManagement.delete.lead.failed'); },
    });
  }

  deletePartner() {
    if (!this.partnerSelected) return;
    this.deleting.set('partner'); this.deletePartnerResult = ''; this.deleteError = '';
    this.http.delete<any>(`${BASE}/partners/${this.partnerSelected.id}`, { headers: this.hdrs() }).subscribe({
      next: r => { this.deleting.set(''); this.deletePartnerResult = r.company || String(r.id); this.clearPartnerSel(); },
      error: e => { this.deleting.set(''); this.deleteError = localizedApiErrorMessage(e?.error?.error, this.transloco) || this.transloco.translate('admin.dataManagement.delete.partner.failed'); },
    });
  }

  // ── Purge category ────────────────────────────────────────────
  purgeCategory(cat: string) {
    const confirmPhrase = this.transloco.translate('admin.dataManagement.purge.' + cat + '.confirmPhrase');
    if ((this.purgeTexts as any)[cat] !== confirmPhrase) return;
    this.purging.set(cat);
    this.purgeError = '';
    this.http.post<any>(`${BASE}/purge-category`, { category: cat }, { headers: this.hdrs() }).subscribe({
      next: r => {
        this.purging.set('');
        (this.purgeResults as any)[cat] = this.transloco.translate('admin.dataManagement.purge.result', { deleted: r.deleted, blobsDeleted: r.blobsDeleted });
        this.purgeConfirming = '';
        (this.purgeTexts as any)[cat] = '';
      },
      error: e => { this.purging.set(''); this.purgeError = localizedApiErrorMessage(e?.error?.error, this.transloco) || this.transloco.translate('admin.dataManagement.purge.failed'); },
    });
  }

  // ── Export / Import ───────────────────────────────────────────
  exportSettings() {
    this.exporting.set(true);
    this.http.get(`${BASE}/export-settings`, { headers: this.hdrs(), responseType: 'blob' }).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `crmtree-settings-${new Date().toISOString().slice(0,10)}.json`;
        a.click(); URL.revokeObjectURL(url);
        this.exporting.set(false);
      },
      error: () => this.exporting.set(false),
    });
  }

  onDrop(e: DragEvent) {
    e.preventDefault(); this.isDragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (file?.name.endsWith('.json')) { this.selectedFile = file; this.importResult = null; this.importError = ''; }
  }

  onFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) { this.selectedFile = file; this.importResult = null; this.importError = ''; }
  }

  importSettings() {
    if (!this.selectedFile) return;
    this.importing.set(true); this.importResult = null; this.importError = '';
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result as string);
        this.http.post<any>(`${BASE}/import-settings`, payload, { headers: this.hdrs() }).subscribe({
          next: r => { this.importing.set(false); this.importResult = r; this.selectedFile = null; },
          error: e => { this.importing.set(false); this.importError = localizedApiErrorMessage(e?.error?.error, this.transloco) || this.transloco.translate('admin.dataManagement.settings.import.failed'); },
        });
      } catch { this.importing.set(false); this.importError = this.transloco.translate('admin.dataManagement.settings.import.invalidFile'); }
    };
    reader.readAsText(this.selectedFile);
  }
}
