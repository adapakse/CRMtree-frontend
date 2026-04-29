// src/app/pages/my-settings/my-settings.component.ts
import { Component, OnInit, inject, ChangeDetectorRef, SecurityContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { environment } from '../../../environments/environment';

const BASE = environment.apiUrl;

@Component({
  selector: 'wt-my-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div id="topbar">
  <span class="page-title">Moje ustawienia</span>
</div>

<div id="content" style="padding:24px;max-width:860px">

  <!-- ── Stopka email ───────────────────────────────────────────────────── -->
  <div class="card" style="padding:24px">
    <h2 style="font-family:'Sora',sans-serif;font-size:15px;font-weight:700;color:#18181b;margin:0 0 6px">
      ✉️ Moja stopka email
    </h2>
    <p style="font-size:12.5px;color:#6b7280;margin:0 0 20px;line-height:1.5">
      Wklej poniżej kod HTML swojej stopki. Zostanie ona automatycznie doklejona do każdego maila
      wysłanego z systemu (Leady i Rejestr partnerów). Możesz użyć gotowego HTML z klientem poczty
      lub narzędzia do budowania stopek — np. HubSpot Email Signature Generator.
    </p>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">

      <!-- Edytor HTML -->
      <div>
        <label style="font-size:11px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px">
          Kod HTML stopki
        </label>
        <textarea
          [(ngModel)]="signatureHtml"
          (ngModelChange)="onHtmlChange()"
          placeholder="Wklej tutaj kod HTML stopki…"
          style="width:100%;height:280px;font-family:monospace;font-size:11px;padding:10px;border:1px solid #d1d5db;border-radius:8px;resize:vertical;box-sizing:border-box;color:#374151;line-height:1.5"
        ></textarea>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn btn-p" (click)="save()" [disabled]="saving">
            {{ saving ? '⏳ Zapisywanie…' : '💾 Zapisz stopkę' }}
          </button>
          <button class="btn btn-g btn-sm" (click)="clear()" *ngIf="signatureHtml" [disabled]="saving">
            🗑 Usuń
          </button>
        </div>
        <div *ngIf="saveSuccess" style="margin-top:8px;font-size:12px;color:#16a34a;font-weight:600">
          ✓ Stopka zapisana
        </div>
        <div *ngIf="saveError" style="margin-top:8px;font-size:12px;color:#dc2626">
          {{ saveError }}
        </div>
      </div>

      <!-- Podgląd -->
      <div>
        <label style="font-size:11px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px">
          Podgląd
        </label>
        <div style="border:1px solid #d1d5db;border-radius:8px;padding:16px;background:#fafafa;min-height:280px;overflow:auto">
          <div *ngIf="!signatureHtml" style="color:#9ca3af;font-size:12px;font-style:italic">
            Brak stopki — wklej HTML po lewej
          </div>
          <div *ngIf="signatureHtml" [innerHTML]="safePreview"></div>
        </div>
      </div>

    </div>
  </div>

</div>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; height:100%; }
    #content { flex:1; overflow-y:auto; }
    .card { background:white; border:1px solid #e5e7eb; border-radius:12px; }
    .btn { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; border:none; }
    .btn:disabled { opacity:.5; cursor:not-allowed; }
    .btn-p { background:var(--orange,#f97316); color:white; }
    .btn-g { background:white; border:1px solid #d1d5db; color:#374151; }
    .btn-sm { padding:6px 12px; font-size:12px; }
  `],
})
export class MySettingsComponent implements OnInit {
  private http       = inject(HttpClient);
  private sanitizer  = inject(DomSanitizer);
  private cdr        = inject(ChangeDetectorRef);

  signatureHtml = '';
  safePreview: SafeHtml = '';
  saving      = false;
  saveSuccess = false;
  saveError   = '';

  ngOnInit() {
    this.http.get<{ html: string }>(`${BASE}/profile/signature`).subscribe({
      next: r => { this.signatureHtml = r.html || ''; this.updatePreview(); this.cdr.markForCheck(); },
      error: () => {},
    });
  }

  onHtmlChange() {
    this.saveSuccess = false;
    this.saveError   = '';
    this.updatePreview();
  }

  updatePreview() {
    this.safePreview = this.sanitizer.bypassSecurityTrustHtml(this.signatureHtml);
  }

  save() {
    this.saving     = true;
    this.saveSuccess = false;
    this.saveError   = '';
    this.http.put(`${BASE}/profile/signature`, { html: this.signatureHtml }).subscribe({
      next: () => {
        this.saving = false; this.saveSuccess = true;
        this.cdr.markForCheck();
        setTimeout(() => { this.saveSuccess = false; this.cdr.markForCheck(); }, 3000);
      },
      error: () => {
        this.saving    = false;
        this.saveError = 'Błąd zapisu — spróbuj ponownie';
        this.cdr.markForCheck();
      },
    });
  }

  clear() {
    this.signatureHtml = '';
    this.updatePreview();
  }
}
