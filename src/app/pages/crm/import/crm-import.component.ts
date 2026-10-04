// src/app/pages/crm/import/crm-import.component.ts
import { Component, OnInit, inject, NgZone, ChangeDetectorRef} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CrmApiService, ImportResult, ImportLog, SalesImportResult, SalesImportLog } from '../../../core/services/crm-api.service';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';

@Component({
  selector: 'wt-crm-import',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoDirective],
  providers: [provideTranslocoScope('crm')],
  template: `
<ng-container *transloco="let t; prefix: 'crm'">
<div class="import-page">
  <div class="import-header">
    <h1>{{ t('csvImport.title') }}</h1>
    <p class="sub">{{ t('csvImport.subtitle') }}</p>
  </div>

  <div class="import-cards">
    <!-- Leads -->
    <div class="import-card">
      <div class="card-icon">👤</div>
      <h2>{{ t('csvImport.cards.leads.title') }}</h2>
      <div class="field-list">
        <span class="required">company*</span>
        <span>contact_name</span><span>contact_title</span>
        <span>email</span><span>phone</span>
        <span title="strona_www|polecenie|cold_call|linkedin|targi|partner|agent|kampania|inbound|inne" class="hint">source 🔤</span>
        <span title="new|qualification|presentation|offer|negotiation|closed_won|closed_lost" class="hint">stage 🔤</span>
        <span>value_pln</span>
        <span title="PLN|EUR|USD|GBP|CHF" class="hint">annual_turnover_currency 🔤</span>
        <span>probability</span><span>close_date</span>
        <span>industry</span><span>assigned_to_email</span>
        <span>notes</span><span>hot</span><span>tags</span>
        <span>agent_name</span><span>agent_email</span><span>agent_phone</span>
        <span>online_pct</span>
      </div>
      <div class="field-hint">🔤 = {{ t('csvImport.hints.dictionaryValuesTooltip') }} · <strong>agent_*</strong>: {{ t('csvImport.hints.agentFields') }}</div>
      <div style="display:flex;gap:8px">
        <button class="btn-outline" (click)="downloadTemplate('leads')">⬇ {{ t('csvImport.actions.downloadTemplate') }}</button>
        <button class="btn-outline btn-export" (click)="exportData('leads')" [disabled]="exportingType==='leads'">
          {{ exportingType==='leads' ? '⏳…' : '📤 ' + t('csvImport.actions.exportData') }}
        </button>
      </div>
      <div class="drop-zone"
           [class.drag-over]="isDraggingLeads"
           [class.uploading]="uploadingLeads"
           (dragover)="$event.preventDefault(); isDraggingLeads = true"
           (dragleave)="isDraggingLeads = false"
           (drop)="onDrop($event, 'leads')"
           (click)="leadsInput.click()">
        <input #leadsInput type="file" accept=".csv,.txt" hidden (change)="onFileChange($event, 'leads')">
        <span *ngIf="!uploadingLeads">📂 {{ t('csvImport.dropZone.prompt') }}</span>
        <span *ngIf="uploadingLeads">⏳ {{ t('csvImport.dropZone.importing') }}</span>
      </div>
      <div *ngIf="leadsResult" class="result-panel">
        <div class="result-stats">
          <span class="stat green">✓ {{ t('csvImport.result.imported', { count: leadsResult.imported }) }}</span>
          <span class="stat gray">⤳ {{ t('csvImport.result.skipped', { count: leadsResult.skipped }) }}</span>
          <span class="stat red" *ngIf="leadsResult.errors_count">✗ {{ t('csvImport.result.errors', { count: leadsResult.errors_count }) }}</span>
          <span class="stat muted">{{ t('csvImport.result.total', { count: leadsResult.rows_total }) }}</span>
        </div>
        <table class="errors-table" *ngIf="leadsResult.errors.length">
          <thead><tr><th>{{ t('csvImport.errorsTable.row') }}</th><th>{{ t('csvImport.errorsTable.company') }}</th><th>{{ t('csvImport.errorsTable.field') }}</th><th>{{ t('csvImport.errorsTable.error') }}</th></tr></thead>
          <tbody>
            <tr *ngFor="let e of leadsResult.errors">
              <td>{{e.row}}</td><td>{{e.company || '—'}}</td>
              <td>{{e.field || '—'}}</td><td class="err-msg">{{e.error}}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Partners -->
    <div class="import-card">
      <div class="card-icon">🤝</div>
      <h2>{{ t('csvImport.cards.partners.title') }}</h2>
      <div class="field-list">
        <span class="required">company*</span>
        <span class="key">partner_number</span>
        <span>nip</span><span>address</span>
        <span>contact_name</span><span>contact_title</span><span>email</span><span>phone</span>
        <span>billing_contact_name</span><span>billing_contact_title</span><span>billing_email</span><span>billing_phone</span>
        <span>industry</span><span>group_name</span><span>manager_email</span>
        <span>contract_signed</span><span>contract_expires</span><span>contract_value</span>
        <span title="onboarding|active|inactive|churned" class="hint">status 🔤</span>
        <span>notes</span>
        <span title="PLN|EUR|USD|GBP|CHF" class="hint">annual_turnover_currency 🔤</span>
        <span>online_pct</span><span>tags</span>
        <span>credit_limit_value</span>
        <span title="PLN|EUR|USD|GBP" class="hint">credit_limit_currency 🔤</span>
        <span>deposit_value</span><span>deposit_currency</span><span>deposit_date_in</span><span>deposit_date_out</span>
        <span>commission_value</span>
        <span title="nie_dotyczy|segmenty|rezerwacje|progi_obrotowe" class="hint">commission_basis 🔤</span>
        <span>agent_name</span><span>agent_email</span><span>agent_phone</span>
      </div>
      <div class="field-hint">🔤 = {{ t('csvImport.hints.dictionaryValuesHover') }} · <strong>partner_number</strong>: {{ t('csvImport.hints.partnerNumber') }} · <strong>tags</strong>: {{ t('csvImport.hints.tagsSeparator') }} <code>|</code></div>
      <div style="display:flex;gap:8px">
        <button class="btn-outline" (click)="downloadTemplate('partners')">⬇ {{ t('csvImport.actions.downloadTemplate') }}</button>
        <button class="btn-outline btn-export" (click)="exportData('partners')" [disabled]="exportingType==='partners'">
          {{ exportingType==='partners' ? '⏳…' : '📤 ' + t('csvImport.actions.exportData') }}
        </button>
      </div>
      <div class="drop-zone"
           [class.drag-over]="isDraggingPartners"
           [class.uploading]="uploadingPartners"
           (dragover)="$event.preventDefault(); isDraggingPartners = true"
           (dragleave)="isDraggingPartners = false"
           (drop)="onDrop($event, 'partners')"
           (click)="partnersInput.click()">
        <input #partnersInput type="file" accept=".csv,.txt" hidden (change)="onFileChange($event, 'partners')">
        <span *ngIf="!uploadingPartners">📂 {{ t('csvImport.dropZone.prompt') }}</span>
        <span *ngIf="uploadingPartners">⏳ {{ t('csvImport.dropZone.importing') }}</span>
      </div>
      <div *ngIf="partnersResult" class="result-panel">
        <div class="result-stats">
          <span class="stat green">✓ {{ t('csvImport.result.imported', { count: partnersResult.imported }) }}</span>
          <span class="stat gray">⤳ {{ t('csvImport.result.skipped', { count: partnersResult.skipped }) }}</span>
          <span class="stat red" *ngIf="partnersResult.errors_count">✗ {{ t('csvImport.result.errors', { count: partnersResult.errors_count }) }}</span>
          <span class="stat muted">{{ t('csvImport.result.total', { count: partnersResult.rows_total }) }}</span>
        </div>
        <table class="errors-table" *ngIf="partnersResult.errors.length">
          <thead><tr><th>{{ t('csvImport.errorsTable.row') }}</th><th>{{ t('csvImport.errorsTable.company') }}</th><th>{{ t('csvImport.errorsTable.field') }}</th><th>{{ t('csvImport.errorsTable.error') }}</th></tr></thead>
          <tbody>
            <tr *ngFor="let e of partnersResult.errors">
              <td>{{e.row}}</td><td>{{e.company || '—'}}</td>
              <td>{{e.field || '—'}}</td><td class="err-msg">{{e.error}}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Dokumenty -->
    <div class="import-card">
      <div class="card-icon">📄</div>
      <h2>{{ t('csvImport.cards.documents.title') }}</h2>
      <p class="card-desc">{{ t('csvImport.cards.documents.description') }}</p>
      <div class="field-list">
        <span class="required">name*</span>
        <span title="partner_agreement|nda|it_supplier_agreement|employee_agreement" class="hint">doc_type 🔤</span>
        <span title="no_gdpr|data_processing_entrustment|data_administration" class="hint">gdpr_type 🔤</span>
        <span title="new|being_edited|being_approved|being_signed|signed|completed|rejected" class="hint">status 🔤</span>
        <span [title]="t('csvImport.dictionaries.documentGroups')" class="hint">group_name 🔤</span>
        <span>entity_1</span><span>entity_2</span>
        <span>creation_date</span><span>signing_date</span><span>expiration_date</span>
      </div>
      <div class="field-hint">🔤 = {{ t('csvImport.hints.dictionaryValues') }} · <strong>entities</strong>: {{ t('csvImport.hints.entitiesSeparator') }} <code>|</code> ({{ t('csvImport.hints.example') }} "{{ t('csvImport.hints.entitiesExample') }}") · <strong>group_name</strong>: {{ t('csvImport.hints.documentGroupName') }}</div>
      <div style="display:flex;gap:8px">
        <button class="btn-outline" (click)="downloadTemplate('documents')">⬇ {{ t('csvImport.actions.downloadTemplate') }}</button>
        <button class="btn-outline btn-export" (click)="exportData('documents')" [disabled]="exportingType==='documents'">
          {{ exportingType==='documents' ? '⏳…' : '📤 ' + t('csvImport.actions.exportData') }}
        </button>
      </div>
      <div class="drop-zone"
           [class.drag-over]="isDraggingDocs"
           [class.uploading]="uploadingDocs"
           (dragover)="$event.preventDefault(); isDraggingDocs = true"
           (dragleave)="isDraggingDocs = false"
           (drop)="onDrop($event, 'documents')"
           (click)="docsInput.click()">
        <input #docsInput type="file" accept=".csv,.txt" hidden (change)="onFileChange($event, 'documents')">
        <span *ngIf="!uploadingDocs">📂 {{ t('csvImport.dropZone.prompt') }}</span>
        <span *ngIf="uploadingDocs">⏳ {{ t('csvImport.dropZone.importing') }}</span>
      </div>
      <div *ngIf="docsResult" class="result-panel">
        <div class="result-stats">
          <span class="stat green">✓ {{ t('csvImport.result.imported', { count: docsResult.imported }) }}</span>
          <span class="stat gray">⤳ {{ t('csvImport.result.skipped', { count: docsResult.skipped }) }}</span>
          <span class="stat red" *ngIf="docsResult.errors_count">✗ {{ t('csvImport.result.errors', { count: docsResult.errors_count }) }}</span>
          <span class="stat muted">{{ t('csvImport.result.total', { count: docsResult.rows_total }) }}</span>
        </div>
        <table class="errors-table" *ngIf="docsResult.errors.length">
          <thead><tr><th>{{ t('csvImport.errorsTable.row') }}</th><th>{{ t('csvImport.errorsTable.name') }}</th><th>{{ t('csvImport.errorsTable.field') }}</th><th>{{ t('csvImport.errorsTable.error') }}</th></tr></thead>
          <tbody>
            <tr *ngFor="let e of docsResult.errors">
              <td>{{e.row}}</td><td>{{e.company || '—'}}</td>
              <td>{{e.field || '—'}}</td><td class="err-msg">{{e.error}}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Dane sprzedażowe -->
    <div class="import-card">
      <div class="card-icon">📊</div>
      <h2>{{ t('csvImport.cards.sales.title') }}</h2>
      <p class="card-desc">{{ t('csvImport.cards.sales.description') }}</p>
      <div class="field-list">
        <span class="required">okres*</span>
        <span class="required">numer_partnera*</span>
        <span>partner</span>
        <span>produkt</span>
        <span>obrot_brutto_pln</span>
        <span>obrot_netto_pln</span>
        <span>fees_pln</span>
        <span>przychod_pln</span>
        <span>liczba_transakcji</span>
        <span>liczba_pasazerow</span>
        <span>uwagi</span>
      </div>
      <div class="field-hint">
        <strong>numer_partnera</strong>: {{ t('csvImport.hints.salesPartnerNumber') }} ({{ t('csvImport.hints.example') }} <code>P-0001</code>) &nbsp;·&nbsp;
        <strong>produkt</strong>: hotel | transport_flight | car_rental | transfer | visa | {{ t('csvImport.hints.otherProducts') }}
      </div>
      <button class="btn-outline" (click)="downloadSalesTemplate()">⬇ {{ t('csvImport.actions.downloadTemplate') }}</button>
      <div class="drop-zone"
           [class.drag-over]="isDraggingSales"
           [class.uploading]="uploadingSales"
           (dragover)="$event.preventDefault(); isDraggingSales = true"
           (dragleave)="isDraggingSales = false"
           (drop)="onDropSales($event)"
           (click)="salesInput.click()">
        <input #salesInput type="file" accept=".csv,.txt" hidden (change)="onSalesFileChange($event)">
        <span *ngIf="!uploadingSales">📂 {{ t('csvImport.dropZone.prompt') }}</span>
        <span *ngIf="uploadingSales">⏳ {{ t('csvImport.dropZone.importing') }}</span>
      </div>
      <div *ngIf="salesResult" class="result-panel">
        <div class="result-stats">
          <span class="stat green">✓ {{ t('csvImport.result.imported', { count: salesResult.rows_imported }) }}</span>
          <span class="stat gray">⤳ {{ t('csvImport.result.skipped', { count: salesResult.rows_skipped }) }}</span>
          <span class="stat red" *ngIf="salesResult.rows_error">✗ {{ t('csvImport.result.errors', { count: salesResult.rows_error }) }}</span>
          <span class="stat muted">{{ t('csvImport.result.total', { count: salesResult.rows_total }) }}</span>
        </div>
        <table class="errors-table" *ngIf="salesResult.errors.length">
          <thead><tr><th>{{ t('csvImport.errorsTable.row') }}</th><th>{{ t('csvImport.errorsTable.error') }}</th></tr></thead>
          <tbody>
            <tr *ngFor="let e of salesResult.errors">
              <td>{{e.line}}</td><td class="err-msg">{{e.reason}}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Import history -->
  <div class="history-section">
    <h3>{{ t('csvImport.history.title') }}</h3>
    <table class="history-table" *ngIf="logs.length; else noLogs">
      <thead>
        <tr><th>{{ t('csvImport.history.type') }}</th><th>{{ t('csvImport.history.file') }}</th><th>{{ t('csvImport.history.imported') }}</th><th>{{ t('csvImport.history.errors') }}</th><th>{{ t('csvImport.history.status') }}</th><th>{{ t('csvImport.history.importedBy') }}</th><th>{{ t('csvImport.history.date') }}</th></tr>
      </thead>
      <tbody>
        <tr *ngFor="let log of logs">
          <td><span class="type-badge" [class.type-leads]="log.import_type==='leads'"
                   [class.type-partners]="log.import_type==='partners'"
                   [class.type-sales]="log.import_type==='sales'" [class.type-docs]="isDocImport(log.import_type)">{{log.import_type}}</span></td>
          <td class="filename">{{log.filename}}</td>
          <td class="num">{{log.rows_imported}} / {{log.rows_total}}</td>
          <td class="num" [class.has-errors]="log.rows_error > 0">{{log.rows_error}}</td>
          <td><span class="status-dot" [class.done]="log.status==='done'" [class.error]="log.status==='error'">
            {{log.status}}</span></td>
          <td>{{log.imported_by_name}}</td>
          <td class="muted">{{log.started_at | date:'dd.MM.yyyy HH:mm'}}</td>
        </tr>
      </tbody>
    </table>
    <ng-template #noLogs><div class="empty">{{ t('csvImport.history.empty') }}</div></ng-template>
  </div>
</div>
</ng-container>
  `,
  styles: [`
    .import-page { padding:20px; max-width:1100px; height:100%; overflow-y:auto; box-sizing:border-box; }
    .import-header { margin-bottom:24px; }
    .import-header h1 { font-size:20px; font-weight:700; margin:0 0 4px; }
    .sub { color:#6b7280; font-size:13px; margin:0; }
    .import-cards { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:32px; }
    .field-list span.hint { background:#fef9c3; color:#713f12; cursor:help; border:1px dashed #fcd34d; }
    @media(max-width:720px) { .import-cards { grid-template-columns:1fr; } }
    .import-card { border:1px solid #e5e7eb; border-radius:12px; padding:20px; display:flex; flex-direction:column; gap:12px; }
    .card-icon { font-size:28px; }
    .import-card h2 { font-size:16px; font-weight:700; margin:0; }
    .card-desc { font-size:12px; color:#6b7280; margin:0; line-height:1.5; }
    .field-hint { font-size:11.5px; color:#6b7280; background:#f9fafb; border-radius:6px; padding:6px 10px; } .field-hint code { font-family:monospace; background:#f3f4f6; padding:1px 4px; border-radius:3px; }
    .field-list { display:flex; flex-wrap:wrap; gap:4px; }
    .field-list span { background:#f3f4f6; border-radius:6px; padding:2px 8px; font-size:11px; font-family:monospace; }
    .field-list span.required { background:#fef3c7; color:#92400e; font-weight:700; }
    .field-list span.key { background:#dbeafe; color:#1e40af; font-weight:700; }
    .btn-outline { display:inline-block; border:1px solid #d1d5db; border-radius:8px; padding:7px 14px; font-size:13px; text-decoration:none; color:#374151; text-align:center; cursor:pointer; }
    .btn-export { border-color:var(--orange); color:var(--orange); }
    .btn-export:hover:not(:disabled) { background:var(--orange-pale); }
    .btn-export:disabled { opacity:.6; cursor:not-allowed; }
    .btn-outline:hover { border-color:var(--orange); color:var(--orange); }
    .drop-zone { border:2px dashed #d1d5db; border-radius:10px; padding:28px; text-align:center; cursor:pointer; font-size:13px; color:#9ca3af; transition:.2s; }
    .drop-zone:hover, .drop-zone.drag-over { border-color:var(--orange); color:var(--orange); background:var(--orange-pale); }
    .drop-zone.uploading { border-color:var(--orange); background:var(--orange-pale); color:var(--orange); }
    .result-panel { border:1px solid #e5e7eb; border-radius:8px; padding:12px; }
    .result-stats { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px; }
    .stat { font-size:12px; font-weight:700; padding:3px 10px; border-radius:8px; }
    .stat.green { background:#dcfce7; color:#166534; }
    .stat.gray { background:#f3f4f6; color:#374151; }
    .stat.red { background:#fee2e2; color:#991b1b; }
    .stat.muted { background:#f9fafb; color:#6b7280; }
    .errors-table { width:100%; border-collapse:collapse; font-size:12px; }
    .errors-table th { text-align:left; padding:4px 8px; color:#9ca3af; font-weight:600; border-bottom:1px solid #f3f4f6; }
    .errors-table td { padding:4px 8px; border-bottom:1px solid #f9fafb; vertical-align:top; }
    .err-msg { color:#dc2626; }
    .history-section { margin-top:8px; }
    .history-section h3 { font-size:15px; font-weight:700; margin:0 0 12px; }
    .history-table { width:100%; border-collapse:collapse; font-size:13px; }
    .history-table th { text-align:left; padding:8px 12px; font-size:11px; color:#6b7280; border-bottom:2px solid #f3f4f6; white-space:nowrap; }
    .history-table td { padding:8px 12px; border-bottom:1px solid #f3f4f6; vertical-align:middle; }
    .type-badge { padding:2px 8px; border-radius:8px; font-size:11px; font-weight:700; }
    .type-leads { background:#dbeafe; color:#1e40af; }
    .type-partners { background:#dcfce7; color:#166534; }
    .type-sales { background:#fef3c7; color:#92400e; }
    .type-docs { background:#f3e8ff; color:#6b21a8; }
    .filename { font-size:12px; color:#374151; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .num { text-align:right; }
    .has-errors { color:#dc2626; font-weight:700; }
    .status-dot { font-size:11px; font-weight:600; }
    .status-dot.done { color:#16a34a; }
    .status-dot.error { color:#dc2626; }
    .muted { color:#9ca3af; font-size:12px; }
    .empty { color:#9ca3af; padding:20px; text-align:center; }
  `],
})
export class CrmImportComponent implements OnInit {
  private api  = inject(CrmApiService);
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private zone = inject(NgZone);
  private cdr  = inject(ChangeDetectorRef);
  private toast = inject(ToastService);
  private transloco = inject(TranslocoService);

  leadsResult:    ImportResult | null = null;
  partnersResult: ImportResult | null = null;
  salesResult:    SalesImportResult | null = null;
  logs: ImportLog[] = [];
  isDraggingLeads    = false;
  isDraggingPartners = false;
  isDraggingSales    = false;
  isDraggingDocs     = false;
  uploadingLeads    = false;
  uploadingPartners = false;
  uploadingSales    = false;
  uploadingDocs     = false;
  docsResult: ImportResult | null = null;

  downloadTemplate(type: 'leads' | 'partners' | 'documents') {
    const token = this.auth.getAccessToken();
    const headers = token ? new HttpHeaders({ Authorization: 'Bearer ' + token }) : new HttpHeaders();
    this.http.get(`/api/crm/import/template/${type}`, { headers, responseType: 'blob' }).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.transloco.translate('crm.csvImport.files.template', { type });
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.toast.error(this.transloco.translate('crm.csvImport.messages.templateDownloadFailed')),
    });
  }

  exportingType = '';

  exportData(type: 'leads' | 'partners' | 'documents') {
    this.exportingType = type;
    this.cdr.markForCheck();
    const token = this.auth.getAccessToken();
    const headers = token ? new HttpHeaders({ Authorization: 'Bearer ' + token }) : new HttpHeaders();
    this.http.get(`/api/crm/import/export/${type}`, { headers, responseType: 'blob' }).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().slice(0, 10);
        a.download = `export_${type}_${date}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.exportingType = '';
        this.cdr.markForCheck();
      },
      error: () => { this.exportingType = ''; this.toast.error(this.transloco.translate('crm.csvImport.messages.exportFailed')); this.cdr.markForCheck(); },
    });
  }

  downloadSalesTemplate() {
    const token = this.auth.getAccessToken();
    const headers = token ? new HttpHeaders({ Authorization: 'Bearer ' + token }) : new HttpHeaders();
    this.http.get('/api/crm/sales-data/template', { headers, responseType: 'blob' }).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.transloco.translate('crm.csvImport.files.salesTemplate');
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.toast.error(this.transloco.translate('crm.csvImport.messages.templateDownloadFailed')),
    });
  }

  isDocImport(t: string): boolean { return t === 'documents'; }
  ngOnInit() { this.loadLogs(); }

  loadLogs() {
    this.api.getImportLogs().subscribe({
      next: r => this.zone.run(() => { this.logs = r; this.cdr.markForCheck(); }),
      error: () => {},
    });
  }

  onDrop(event: DragEvent, type: 'leads' | 'partners' | 'documents') {
    event.preventDefault();
    if (type === 'leads') this.isDraggingLeads = false;
    else if (type === 'partners') this.isDraggingPartners = false;
    else this.isDraggingDocs = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) this.uploadFile(file, type);
  }

  onDropSales(event: DragEvent) {
    event.preventDefault();
    this.isDraggingSales = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) this.uploadSalesFile(file);
  }

  onFileChange(event: Event, type: 'leads' | 'partners' | 'documents') {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.uploadFile(file, type);
  }

  onSalesFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.uploadSalesFile(file);
  }

  uploadFile(file: File, type: 'leads' | 'partners' | 'documents') {
    if (type === 'leads') {
      this.uploadingLeads = true; this.leadsResult = null;
      this.api.importLeadsCsv(file).subscribe({
        next: r => this.zone.run(() => { this.uploadingLeads = false; this.leadsResult = r; this.loadLogs(); this.cdr.markForCheck(); }),
        error: () => this.zone.run(() => { this.uploadingLeads = false; this.cdr.markForCheck(); }),
      });
    } else if (type === 'partners') {
      this.uploadingPartners = true; this.partnersResult = null;
      this.api.importPartnersCsv(file).subscribe({
        next: r => this.zone.run(() => { this.uploadingPartners = false; this.partnersResult = r; this.loadLogs(); this.cdr.markForCheck(); }),
        error: () => this.zone.run(() => { this.uploadingPartners = false; this.cdr.markForCheck(); }),
      });
    } else {
      this.uploadingDocs = true; this.docsResult = null; this.cdr.markForCheck();
      this.api.importDocumentsCsv(file).subscribe({
        next: (r: any) => this.zone.run(() => { this.uploadingDocs = false; this.docsResult = r; this.loadLogs(); this.cdr.markForCheck(); }),
        error: (err: any) => this.zone.run(() => {
          this.uploadingDocs = false;
          this.docsResult = { import_id: 0, filename: file.name, rows_total: 0, imported: 0, skipped: 0, errors_count: 1, errors: [{ row: 0, error: err?.error?.error || this.transloco.translate('crm.csvImport.messages.serverError') }] } as any;
          this.cdr.markForCheck();
        }),
      });
    }
  }

  uploadSalesFile(file: File) {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      this.toast.error(this.transloco.translate('crm.csvImport.messages.csvRequired'));
      return;
    }
    this.uploadingSales  = true;
    this.salesResult     = null;
    this.cdr.markForCheck();
    this.api.importSalesDataCsv(file).subscribe({
      next: r => this.zone.run(() => {
        this.uploadingSales = false;
        this.salesResult    = r;
        this.loadLogs();
        this.cdr.markForCheck();
      }),
      error: err => this.zone.run(() => {
        this.uploadingSales = false;
        this.salesResult    = { rows_total: 0, rows_imported: 0, rows_skipped: 0, rows_error: 1, errors: [{ line: 0, reason: err?.error?.error || this.transloco.translate('crm.csvImport.messages.serverError') }] };
        this.cdr.markForCheck();
      }),
    });
  }
}
