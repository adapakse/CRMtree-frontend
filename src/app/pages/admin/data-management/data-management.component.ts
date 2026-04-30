// src/app/pages/admin/data-management/data-management.component.ts
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../../core/auth/auth.service';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

const BASE      = '/api/admin/data';
const API_DOCS  = '/api/documents';
const API_LEADS = '/api/crm/leads';
const API_PTNR  = '/api/crm/partners';

interface SearchResult { id: string | number; label: string; sublabel?: string; }

@Component({
  selector: 'wt-data-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="dm-page">
  <div class="dm-header">
    <h1>🗄️ Zarządzanie danymi</h1>
    <p class="sub">Operacje administracyjne: usuwanie rekordów, czyszczenie środowiska, eksport/import ustawień. Dostępne tylko dla administratorów.</p>
  </div>

  <!-- ── Sekcja 1: Kasowanie pojedynczych elementów ── -->
  <div class="dm-section">
    <div class="section-head">
      <div class="section-icon danger">🗑️</div>
      <div>
        <div class="section-title">Kasowanie rekordów</div>
        <div class="section-sub">Trwałe usunięcie dokumentu, leada lub partnera wraz ze wszystkimi powiązanymi danymi i logami.</div>
      </div>
    </div>

    <div class="delete-grid">

      <!-- Dokument -->
      <div class="delete-card">
        <div class="dc-head">
          <span class="dc-icon">📄</span>
          <div>
            <div class="dc-title">Dokument</div>
            <div class="dc-desc">Usuwa: metadane, wszystkie wersje + pliki z Blob, tagi, zadania workflow, powiązania CRM, logi audytu</div>
          </div>
        </div>
        <div class="search-wrap">
          <input class="dm-input" [(ngModel)]="docSearch" (ngModelChange)="onDocSearch($event)"
                 placeholder="Wpisz nazwę lub numer dokumentu (min. 2 znaki)…" autocomplete="off">
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
        <button class="btn-danger" (click)="deleteDocument()" [disabled]="!docSelected || deleting() === 'doc'">
          {{ deleting() === 'doc' ? '⏳ Usuwanie…' : '🗑️ Usuń dokument' }}
        </button>
        <div *ngIf="deleteDocResult" class="result-ok">✓ Usunięto: {{ deleteDocResult }}</div>
      </div>

      <!-- Lead -->
      <div class="delete-card">
        <div class="dc-head">
          <span class="dc-icon">👤</span>
          <div>
            <div class="dc-title">Lead</div>
            <div class="dc-desc">Usuwa: lead, aktywności, powiązania dokumentów, historię. Nie usuwa partnera z konwersji.</div>
          </div>
        </div>
        <div class="search-wrap">
          <input class="dm-input" [(ngModel)]="leadSearch" (ngModelChange)="onLeadSearch($event)"
                 placeholder="Wpisz nazwę firmy lub kontakt (min. 2 znaki)…" autocomplete="off">
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
        <button class="btn-danger" (click)="deleteLead()" [disabled]="!leadSelected || deleting() === 'lead'">
          {{ deleting() === 'lead' ? '⏳ Usuwanie…' : '🗑️ Usuń lead' }}
        </button>
        <div *ngIf="deleteLeadResult" class="result-ok">✓ Usunięto: {{ deleteLeadResult }}</div>
      </div>

      <!-- Partner -->
      <div class="delete-card">
        <div class="dc-head">
          <span class="dc-icon">🤝</span>
          <div>
            <div class="dc-title">Partner</div>
            <div class="dc-desc">Usuwa: partnera, aktywności, powiązania dokumentów, dane sprzedażowe, historię.</div>
          </div>
        </div>
        <div class="search-wrap">
          <input class="dm-input" [(ngModel)]="partnerSearch" (ngModelChange)="onPartnerSearch($event)"
                 placeholder="Wpisz nazwę firmy lub NIP (min. 2 znaki)…" autocomplete="off">
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
        <button class="btn-danger" (click)="deletePartner()" [disabled]="!partnerSelected || deleting() === 'partner'">
          {{ deleting() === 'partner' ? '⏳ Usuwanie…' : '🗑️ Usuń partnera' }}
        </button>
        <div *ngIf="deletePartnerResult" class="result-ok">✓ Usunięto: {{ deletePartnerResult }}</div>
      </div>

    </div>
    <div *ngIf="deleteError" class="result-err" style="margin-top:8px">✗ {{ deleteError }}</div>
  </div>

  <!-- ── Sekcja 2: Czyszczenie grup danych ── -->
  <div class="dm-section">
    <div class="section-head">
      <div class="section-icon danger">⚠️</div>
      <div>
        <div class="section-title">Czyszczenie środowiska testowego</div>
        <div class="section-sub">Usuń wszystkie rekordy wybranej kategorii. Zachowuje: użytkowników, role, profile grup, grupy partnerów, ustawienia aplikacji.</div>
      </div>
    </div>

    <div class="purge-grid">

      <!-- Purge Documents -->
      <div class="purge-card">
        <div class="purge-card-head">
          <span style="font-size:22px">📄</span>
          <div>
            <div class="purge-card-title">Wszystkie dokumenty</div>
            <div class="purge-card-desc">Usuwa: dokumenty, wersje, pliki z Blob, tagi, grupy dokumentów, zadania workflow, logi audytu dokumentów</div>
          </div>
        </div>
        <div *ngIf="purgeConfirming !== 'docs'" style="text-align:center;margin-top:8px">
          <button class="btn-danger" (click)="purgeConfirming='docs'">🗑️ Usuń wszystkie dokumenty</button>
        </div>
        <div *ngIf="purgeConfirming === 'docs'" class="inline-confirm">
          <input class="dm-input" [(ngModel)]="purgeTexts.docs" placeholder="Wpisz: USUŃ DOKUMENTY">
          <div style="display:flex;gap:6px;margin-top:6px">
            <button class="btn-danger" (click)="purgeCategory('docs')"
                    [disabled]="purgeTexts.docs !== 'USUŃ DOKUMENTY' || purging() === 'docs'">
              {{ purging() === 'docs' ? '⏳…' : 'Potwierdź' }}
            </button>
            <button class="btn-cancel" (click)="purgeConfirming=''">Anuluj</button>
          </div>
        </div>
        <div *ngIf="purgeResults.docs" class="result-ok" style="margin-top:8px">✓ {{ purgeResults.docs }}</div>
      </div>

      <!-- Purge Leads -->
      <div class="purge-card">
        <div class="purge-card-head">
          <span style="font-size:22px">👤</span>
          <div>
            <div class="purge-card-title">Wszystkie leady</div>
            <div class="purge-card-desc">Usuwa: leady, aktywności leadów, powiązania dokumentów leadów, historię importów leadów, logi audytu leadów</div>
          </div>
        </div>
        <div *ngIf="purgeConfirming !== 'leads'" style="text-align:center;margin-top:8px">
          <button class="btn-danger" (click)="purgeConfirming='leads'">🗑️ Usuń wszystkie leady</button>
        </div>
        <div *ngIf="purgeConfirming === 'leads'" class="inline-confirm">
          <input class="dm-input" [(ngModel)]="purgeTexts.leads" placeholder="Wpisz: USUŃ LEADY">
          <div style="display:flex;gap:6px;margin-top:6px">
            <button class="btn-danger" (click)="purgeCategory('leads')"
                    [disabled]="purgeTexts.leads !== 'USUŃ LEADY' || purging() === 'leads'">
              {{ purging() === 'leads' ? '⏳…' : 'Potwierdź' }}
            </button>
            <button class="btn-cancel" (click)="purgeConfirming=''">Anuluj</button>
          </div>
        </div>
        <div *ngIf="purgeResults.leads" class="result-ok" style="margin-top:8px">✓ {{ purgeResults.leads }}</div>
      </div>

      <!-- Purge Partners -->
      <div class="purge-card">
        <div class="purge-card-head">
          <span style="font-size:22px">🤝</span>
          <div>
            <div class="purge-card-title">Wszystkich partnerów</div>
            <div class="purge-card-desc">Usuwa: partnerów, aktywności partnerów, powiązania dokumentów, dane sprzedażowe, budżety, logi audytu partnerów</div>
          </div>
        </div>
        <div *ngIf="purgeConfirming !== 'partners'" style="text-align:center;margin-top:8px">
          <button class="btn-danger" (click)="purgeConfirming='partners'">🗑️ Usuń wszystkich partnerów</button>
        </div>
        <div *ngIf="purgeConfirming === 'partners'" class="inline-confirm">
          <input class="dm-input" [(ngModel)]="purgeTexts.partners" placeholder="Wpisz: USUŃ PARTNERÓW">
          <div style="display:flex;gap:6px;margin-top:6px">
            <button class="btn-danger" (click)="purgeCategory('partners')"
                    [disabled]="purgeTexts.partners !== 'USUŃ PARTNERÓW' || purging() === 'partners'">
              {{ purging() === 'partners' ? '⏳…' : 'Potwierdź' }}
            </button>
            <button class="btn-cancel" (click)="purgeConfirming=''">Anuluj</button>
          </div>
        </div>
        <div *ngIf="purgeResults.partners" class="result-ok" style="margin-top:8px">✓ {{ purgeResults.partners }}</div>
      </div>

    </div>
    <div *ngIf="purgeError" class="result-err" style="margin-top:12px">✗ {{ purgeError }}</div>
  </div>

  <!-- ── Sekcja 3: Eksport / Import ustawień ── -->
  <div class="dm-section">
    <div class="section-head">
      <div class="section-icon">📦</div>
      <div>
        <div class="section-title">Eksport / Import ustawień</div>
        <div class="section-sub">Przenoszenie konfiguracji między środowiskami. Eksport pobiera plik JSON z app_settings i group_profiles. Import nadpisuje istniejące wartości.</div>
      </div>
    </div>

    <div class="export-import-grid">
      <div class="ei-card">
        <div class="ei-title">📥 Eksport ustawień</div>
        <div class="ei-desc">Pobierz plik JSON ze wszystkimi słownikami, parametrami aplikacji i profilami grup dokumentowych.</div>
        <div style="margin-top:12px">
          <button class="btn-primary" (click)="exportSettings()" [disabled]="exporting()">
            {{ exporting() ? '⏳ Generowanie…' : '📥 Pobierz settings.json' }}
          </button>
        </div>
      </div>

      <div class="ei-card">
        <div class="ei-title">📤 Import ustawień</div>
        <div class="ei-desc">Wgraj plik JSON pobrany z innego środowiska. Istniejące ustawienia zostaną nadpisane. Nowe klucze zostaną dodane.</div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
          <div class="drop-zone" [class.drag-over]="isDragging"
               (dragover)="$event.preventDefault(); isDragging=true"
               (dragleave)="isDragging=false" (drop)="onDrop($event)" (click)="fileInput.click()">
            <input #fileInput type="file" accept=".json" hidden (change)="onFileChange($event)">
            <span *ngIf="!selectedFile && !importing()">📂 Przeciągnij plik JSON lub kliknij</span>
            <span *ngIf="selectedFile && !importing()">📄 {{ selectedFile.name }}</span>
            <span *ngIf="importing()">⏳ Importowanie…</span>
          </div>
          <button class="btn-primary" (click)="importSettings()" [disabled]="!selectedFile || importing()">
            {{ importing() ? '⏳ Importowanie…' : '📤 Importuj ustawienia' }}
          </button>
        </div>
        <div *ngIf="importResult" class="result-ok" style="margin-top:8px">
          ✓ Zaimportowano: {{ importResult.settingsUpdated }} ustawień, {{ importResult.groupsUpdated }} profili grup
        </div>
        <div *ngIf="importError" class="result-err" style="margin-top:8px">✗ {{ importError }}</div>
      </div>
    </div>
  </div>
</div>
  `,
  styles: [`
    .dm-page { padding:24px; max-width:1000px; overflow-y:auto; height:100%; box-sizing:border-box; }
    .dm-header { margin-bottom:28px; }
    .dm-header h1 { font-size:20px; font-weight:700; margin:0 0 6px; }
    .sub { color:#6b7280; font-size:13px; margin:0; }
    .dm-section { background:white; border:1px solid #e5e7eb; border-radius:12px; padding:20px; margin-bottom:20px; }
    .section-head { display:flex; gap:14px; align-items:flex-start; margin-bottom:18px; }
    .section-icon { width:40px;height:40px;border-radius:10px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0; }
    .section-icon.danger { background:#fee2e2; }
    .section-title { font-size:15px; font-weight:700; color:#111827; }
    .section-sub { font-size:12.5px; color:#6b7280; margin-top:3px; line-height:1.5; }
    .delete-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; }
    @media(max-width:800px) { .delete-grid { grid-template-columns:1fr; } }
    .delete-card { border:1px solid #e5e7eb; border-radius:10px; padding:14px; display:flex; flex-direction:column; gap:10px; }
    .dc-head { display:flex; gap:10px; align-items:flex-start; }
    .dc-icon { font-size:22px; flex-shrink:0; }
    .dc-title { font-size:13px; font-weight:700; color:#111827; }
    .dc-desc { font-size:11px; color:#9ca3af; line-height:1.5; margin-top:2px; }
    .search-wrap { position:relative; }
    .suggestions { position:absolute; top:100%; left:0; right:0; z-index:100; background:white; border:1px solid #e5e7eb; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,.1); max-height:200px; overflow-y:auto; margin-top:2px; }
    .suggestion-item { padding:8px 12px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; font-size:12px; }
    .suggestion-item:hover { background:#f9fafb; }
    .sug-label { font-weight:600; color:#111827; }
    .sug-sub { color:#9ca3af; font-size:11px; }
    .selected-badge { display:flex; align-items:center; justify-content:space-between; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:6px 10px; font-size:12px; }
    .sel-name { color:#15803d; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .sel-clear { background:none; border:none; cursor:pointer; color:#9ca3af; font-size:14px; padding:0 2px; flex-shrink:0; }
    .sel-clear:hover { color:#ef4444; }
    .dm-input { border:1px solid #d1d5db; border-radius:6px; padding:7px 10px; font-size:13px; outline:none; font-family:inherit; width:100%; box-sizing:border-box; }
    .dm-input:focus { border-color:#f97316; }
    .btn-danger { background:#ef4444; color:white; border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap; }
    .btn-danger:hover:not(:disabled) { background:#dc2626; }
    .btn-danger:disabled { opacity:.6; cursor:not-allowed; }
    .btn-primary { background:#f97316; color:white; border:none; border-radius:7px; padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; }
    .btn-primary:hover:not(:disabled) { background:#ea6a0a; }
    .btn-primary:disabled { opacity:.6; cursor:not-allowed; }
    .btn-cancel { background:white; color:#374151; border:1px solid #d1d5db; border-radius:7px; padding:7px 14px; font-size:12px; cursor:pointer; }
    .result-ok { color:#15803d; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:8px 12px; font-size:12px; }
    .result-err { color:#dc2626; background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:8px 12px; font-size:12px; }
    .purge-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; }
    @media(max-width:800px) { .purge-grid { grid-template-columns:1fr; } }
    .purge-card { border:2px solid #fee2e2; border-radius:10px; padding:14px; display:flex; flex-direction:column; gap:8px; }
    .purge-card-head { display:flex; gap:10px; align-items:flex-start; }
    .purge-card-title { font-size:13px; font-weight:700; color:#991b1b; }
    .purge-card-desc { font-size:11px; color:#9ca3af; line-height:1.5; margin-top:2px; }
    .inline-confirm { background:#fef2f2; border-radius:8px; padding:10px; margin-top:4px; }
    .export-import-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    @media(max-width:600px) { .export-import-grid { grid-template-columns:1fr; } }
    .ei-card { border:1px solid #e5e7eb; border-radius:10px; padding:16px; }
    .ei-title { font-size:14px; font-weight:700; margin-bottom:6px; }
    .ei-desc { font-size:12px; color:#6b7280; line-height:1.5; }
    .drop-zone { border:2px dashed #d1d5db; border-radius:8px; padding:20px; text-align:center; cursor:pointer; font-size:13px; color:#9ca3af; transition:.2s; }
    .drop-zone:hover, .drop-zone.drag-over { border-color:#f97316; color:#f97316; background:#fff7ed; }
  `],
})
export class DataManagementComponent {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

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
      error: e => { this.deleting.set(''); this.deleteError = e?.error?.error || 'Błąd usuwania dokumentu'; },
    });
  }

  deleteLead() {
    if (!this.leadSelected) return;
    this.deleting.set('lead'); this.deleteLeadResult = ''; this.deleteError = '';
    this.http.delete<any>(`${BASE}/leads/${this.leadSelected.id}`, { headers: this.hdrs() }).subscribe({
      next: r => { this.deleting.set(''); this.deleteLeadResult = r.company || String(r.id); this.clearLeadSel(); },
      error: e => { this.deleting.set(''); this.deleteError = e?.error?.error || 'Błąd usuwania leada'; },
    });
  }

  deletePartner() {
    if (!this.partnerSelected) return;
    this.deleting.set('partner'); this.deletePartnerResult = ''; this.deleteError = '';
    this.http.delete<any>(`${BASE}/partners/${this.partnerSelected.id}`, { headers: this.hdrs() }).subscribe({
      next: r => { this.deleting.set(''); this.deletePartnerResult = r.company || String(r.id); this.clearPartnerSel(); },
      error: e => { this.deleting.set(''); this.deleteError = e?.error?.error || 'Błąd usuwania partnera'; },
    });
  }

  // ── Purge category ────────────────────────────────────────────
  purgeCategory(cat: string) {
    const confirmMap: Record<string, string> = {
      docs: 'USUŃ DOKUMENTY', leads: 'USUŃ LEADY', partners: 'USUŃ PARTNERÓW'
    };
    if ((this.purgeTexts as any)[cat] !== confirmMap[cat]) return;
    this.purging.set(cat);
    this.purgeError = '';
    this.http.post<any>(`${BASE}/purge-category`, { category: cat }, { headers: this.hdrs() }).subscribe({
      next: r => {
        this.purging.set('');
        (this.purgeResults as any)[cat] = `Usunięto ${r.deleted} rekordów, ${r.blobsDeleted} plików z Blob`;
        this.purgeConfirming = '';
        (this.purgeTexts as any)[cat] = '';
      },
      error: e => { this.purging.set(''); this.purgeError = e?.error?.error || 'Błąd czyszczenia'; },
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
          error: e => { this.importing.set(false); this.importError = e?.error?.error || 'Błąd importu'; },
        });
      } catch { this.importing.set(false); this.importError = 'Nieprawidłowy plik JSON'; }
    };
    reader.readAsText(this.selectedFile);
  }
}
