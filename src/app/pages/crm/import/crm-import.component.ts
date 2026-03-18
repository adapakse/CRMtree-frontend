// src/app/pages/crm/import/crm-import.component.ts
import { Component, OnInit, inject, NgZone, ChangeDetectorRef} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CrmApiService, ImportResult, ImportLog, SalesImportResult, SalesImportLog } from '../../../core/services/crm-api.service';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'wt-crm-import',
  standalone: true,
  imports: [CommonModule],
  template: `
<div class="import-page">
  <div class="import-header">
    <h1>Import CSV</h1>
    <p class="sub">Importuj leady, partnerów i dane sprzedażowe zbiorczo z pliku CSV. Pobierz szablon, wypełnij i prześlij.</p>
  </div>

  <div class="import-cards">
    <!-- Leads -->
    <div class="import-card">
      <div class="card-icon">👤</div>
      <h2>Leady sprzedażowe</h2>
      <div class="field-list">
        <span class="required">company*</span>
        <span>contact_name</span><span>email</span><span>phone</span>
        <span>source</span><span>stage</span><span>value_pln</span>
        <span>probability</span><span>close_date</span>
        <span>industry</span><span>notes</span><span>hot</span><span>tags</span>
      </div>
      <button class="btn-outline" (click)="downloadTemplate('leads')">⬇ Pobierz szablon</button>
      <div class="drop-zone"
           [class.drag-over]="isDraggingLeads"
           [class.uploading]="uploadingLeads"
           (dragover)="$event.preventDefault(); isDraggingLeads = true"
           (dragleave)="isDraggingLeads = false"
           (drop)="onDrop($event, 'leads')"
           (click)="leadsInput.click()">
        <input #leadsInput type="file" accept=".csv,.txt" hidden (change)="onFileChange($event, 'leads')">
        <span *ngIf="!uploadingLeads">📂 Przeciągnij plik CSV lub kliknij</span>
        <span *ngIf="uploadingLeads">⏳ Importowanie…</span>
      </div>
      <div *ngIf="leadsResult" class="result-panel">
        <div class="result-stats">
          <span class="stat green">✓ {{leadsResult.imported}} zaimportowanych</span>
          <span class="stat gray">⤳ {{leadsResult.skipped}} pominiętych</span>
          <span class="stat red" *ngIf="leadsResult.errors_count">✗ {{leadsResult.errors_count}} błędów</span>
          <span class="stat muted">Razem: {{leadsResult.rows_total}}</span>
        </div>
        <table class="errors-table" *ngIf="leadsResult.errors.length">
          <thead><tr><th>Wiersz</th><th>Firma</th><th>Pole</th><th>Błąd</th></tr></thead>
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
      <h2>Partnerzy</h2>
      <div class="field-list">
        <span class="required">company*</span>
        <span class="key">numer_partnera</span>
        <span>nip</span><span>address</span><span>contact_name</span><span>email</span>
        <span>phone</span><span>industry</span><span>group_name</span>
        <span>contract_signed</span><span>contract_expires</span>
        <span>contract_value</span><span>status</span><span>notes</span>
        <span class="key">annual_turnover</span>
        <span>annual_turnover_currency</span>
        <span>online_pct</span>
        <span>tags</span>
      </div>
      <div class="field-hint">
        <strong>numer_partnera</strong>: klucz łączący z danymi sprzedażowymi (np. <code>P-0001</code>) &nbsp;·&nbsp;
        <strong>annual_turnover</strong>: obrót roczny &nbsp;·&nbsp;
        <strong>annual_turnover_currency</strong>: waluta (PLN, EUR…) &nbsp;·&nbsp;
        <strong>online_pct</strong>: % online (0,10…100) &nbsp;·&nbsp;
        <strong>tags</strong>: tagi oddzielone <code>|</code>
      </div>
      <button class="btn-outline" (click)="downloadTemplate('partners')">⬇ Pobierz szablon</button>
      <div class="drop-zone"
           [class.drag-over]="isDraggingPartners"
           [class.uploading]="uploadingPartners"
           (dragover)="$event.preventDefault(); isDraggingPartners = true"
           (dragleave)="isDraggingPartners = false"
           (drop)="onDrop($event, 'partners')"
           (click)="partnersInput.click()">
        <input #partnersInput type="file" accept=".csv,.txt" hidden (change)="onFileChange($event, 'partners')">
        <span *ngIf="!uploadingPartners">📂 Przeciągnij plik CSV lub kliknij</span>
        <span *ngIf="uploadingPartners">⏳ Importowanie…</span>
      </div>
      <div *ngIf="partnersResult" class="result-panel">
        <div class="result-stats">
          <span class="stat green">✓ {{partnersResult.imported}} zaimportowanych</span>
          <span class="stat gray">⤳ {{partnersResult.skipped}} pominiętych</span>
          <span class="stat red" *ngIf="partnersResult.errors_count">✗ {{partnersResult.errors_count}} błędów</span>
          <span class="stat muted">Razem: {{partnersResult.rows_total}}</span>
        </div>
        <table class="errors-table" *ngIf="partnersResult.errors.length">
          <thead><tr><th>Wiersz</th><th>Firma</th><th>Pole</th><th>Błąd</th></tr></thead>
          <tbody>
            <tr *ngFor="let e of partnersResult.errors">
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
      <h2>Dane sprzedażowe</h2>
      <p class="card-desc">Dane row-level z zewnętrznego systemu sprzedaży na poziomie Partner × Produkt × Miesiąc. Powiązanie z handlowcem realizowane automatycznie przez CRM (opiekun partnera).</p>
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
        <strong>numer_partnera</strong>: klucz łączący z kartą Partnera w CRM (np. <code>P-0001</code>) &nbsp;·&nbsp;
        <strong>produkt</strong>: hotel | transport_flight | car_rental | transfer | visa | inne…
      </div>
      <button class="btn-outline" (click)="downloadSalesTemplate()">⬇ Pobierz szablon</button>
      <div class="drop-zone"
           [class.drag-over]="isDraggingSales"
           [class.uploading]="uploadingSales"
           (dragover)="$event.preventDefault(); isDraggingSales = true"
           (dragleave)="isDraggingSales = false"
           (drop)="onDropSales($event)"
           (click)="salesInput.click()">
        <input #salesInput type="file" accept=".csv,.txt" hidden (change)="onSalesFileChange($event)">
        <span *ngIf="!uploadingSales">📂 Przeciągnij plik CSV lub kliknij</span>
        <span *ngIf="uploadingSales">⏳ Importowanie…</span>
      </div>
      <div *ngIf="salesResult" class="result-panel">
        <div class="result-stats">
          <span class="stat green">✓ {{salesResult.rows_imported}} zaimportowanych</span>
          <span class="stat gray">⤳ {{salesResult.rows_skipped}} pominiętych</span>
          <span class="stat red" *ngIf="salesResult.rows_error">✗ {{salesResult.rows_error}} błędów</span>
          <span class="stat muted">Razem: {{salesResult.rows_total}}</span>
        </div>
        <table class="errors-table" *ngIf="salesResult.errors.length">
          <thead><tr><th>Wiersz</th><th>Błąd</th></tr></thead>
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
    <h3>Historia importów</h3>
    <table class="history-table" *ngIf="logs.length; else noLogs">
      <thead>
        <tr><th>Typ</th><th>Plik</th><th>Zaimportowano</th><th>Błędy</th><th>Status</th><th>Przez</th><th>Data</th></tr>
      </thead>
      <tbody>
        <tr *ngFor="let log of logs">
          <td><span class="type-badge" [class.type-leads]="log.import_type==='leads'"
                   [class.type-partners]="log.import_type==='partners'"
                   [class.type-sales]="log.import_type==='sales'">{{log.import_type}}</span></td>
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
    <ng-template #noLogs><div class="empty">Brak historii importów.</div></ng-template>
  </div>
</div>
  `,
  styles: [`
    .import-page { padding:20px; max-width:1100px; height:100%; overflow-y:auto; box-sizing:border-box; }
    .import-header { margin-bottom:24px; }
    .import-header h1 { font-size:20px; font-weight:700; margin:0 0 4px; }
    .sub { color:#6b7280; font-size:13px; margin:0; }
    .import-cards { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:32px; }
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
    .btn-outline:hover { border-color:#f97316; color:#f97316; }
    .drop-zone { border:2px dashed #d1d5db; border-radius:10px; padding:28px; text-align:center; cursor:pointer; font-size:13px; color:#9ca3af; transition:.2s; }
    .drop-zone:hover, .drop-zone.drag-over { border-color:#f97316; color:#f97316; background:#fff7ed; }
    .drop-zone.uploading { border-color:#f97316; background:#fff7ed; color:#f97316; }
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

  leadsResult:    ImportResult | null = null;
  partnersResult: ImportResult | null = null;
  salesResult:    SalesImportResult | null = null;
  logs: ImportLog[] = [];
  isDraggingLeads    = false;
  isDraggingPartners = false;
  isDraggingSales    = false;
  uploadingLeads    = false;
  uploadingPartners = false;
  uploadingSales    = false;

  downloadTemplate(type: 'leads' | 'partners') {
    const token = this.auth.getAccessToken();
    const headers = token ? new HttpHeaders({ Authorization: 'Bearer ' + token }) : new HttpHeaders();
    this.http.get(`/api/crm/import/template/${type}`, { headers, responseType: 'blob' }).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `szablon_${type}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => alert('Nie udało się pobrać szablonu.'),
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
        a.download = 'szablon_dane_sprzedazowe.csv';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => alert('Nie udało się pobrać szablonu.'),
    });
  }

  ngOnInit() { this.loadLogs(); }

  loadLogs() {
    this.api.getImportLogs().subscribe({
      next: r => this.zone.run(() => { this.logs = r; this.cdr.markForCheck(); }),
      error: () => {},
    });
  }

  onDrop(event: DragEvent, type: 'leads' | 'partners') {
    event.preventDefault();
    if (type === 'leads') this.isDraggingLeads = false;
    else this.isDraggingPartners = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) this.uploadFile(file, type);
  }

  onDropSales(event: DragEvent) {
    event.preventDefault();
    this.isDraggingSales = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) this.uploadSalesFile(file);
  }

  onFileChange(event: Event, type: 'leads' | 'partners') {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.uploadFile(file, type);
  }

  onSalesFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.uploadSalesFile(file);
  }

  uploadFile(file: File, type: 'leads' | 'partners') {
    if (type === 'leads') {
      this.uploadingLeads = true;
      this.leadsResult = null;
      this.api.importLeadsCsv(file).subscribe({
        next: r => { this.uploadingLeads = false; this.leadsResult = r; this.loadLogs(); },
        error: () => { this.uploadingLeads = false; },
      });
    } else {
      this.uploadingPartners = true;
      this.partnersResult = null;
      this.api.importPartnersCsv(file).subscribe({
        next: r => { this.uploadingPartners = false; this.partnersResult = r; this.loadLogs(); },
        error: () => { this.uploadingPartners = false; },
      });
    }
  }

  uploadSalesFile(file: File) {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      alert('Wybierz plik w formacie CSV.');
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
        this.salesResult    = { rows_total: 0, rows_imported: 0, rows_skipped: 0, rows_error: 1, errors: [{ line: 0, reason: err?.error?.error || 'Błąd serwera' }] };
        this.cdr.markForCheck();
      }),
    });
  }
}
