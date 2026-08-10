// src/app/pages/crm/zoho-callback/zoho-callback.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'wt-zoho-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
<div style="position:fixed;inset:0;background:#f9fafb;display:flex;align-items:center;justify-content:center;padding:24px">
  <div style="background:white;border-radius:16px;padding:40px 48px;max-width:480px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)">

    <!-- Success -->
    <ng-container *ngIf="status === 'connected'">
      <div style="font-size:48px;margin-bottom:16px">✅</div>
      <div style="font-size:20px;font-weight:800;color:#111827;margin-bottom:8px">Zoho Mail połączony!</div>
      <div style="font-size:14px;color:#6b7280;margin-bottom:28px;line-height:1.6">
        Twoje konto Zoho Mail zostało pomyślnie połączone z aplikacją.<br>
        Możesz zamknąć to okno i wrócić do pracy w CRM.
      </div>
      <button (click)="close()"
              style="background:#E42527;color:white;border:none;border-radius:8px;padding:10px 28px;font-size:14px;font-weight:600;cursor:pointer">
        Zamknij okno
      </button>
    </ng-container>

    <!-- Error -->
    <ng-container *ngIf="status === 'error'">
      <div style="font-size:48px;margin-bottom:16px">❌</div>
      <div style="font-size:20px;font-weight:800;color:#111827;margin-bottom:8px">Błąd połączenia</div>
      <div style="font-size:14px;color:#6b7280;margin-bottom:8px;line-height:1.6">
        Nie udało się połączyć konta Zoho Mail.
      </div>
      <div *ngIf="reason" style="font-size:12px;color:#9ca3af;background:#f3f4f6;border-radius:6px;padding:6px 12px;margin-bottom:24px;font-family:monospace">
        {{reason}}
      </div>
      <button (click)="close()"
              style="background:#6b7280;color:white;border:none;border-radius:8px;padding:10px 28px;font-size:14px;font-weight:600;cursor:pointer">
        Zamknij okno
      </button>
    </ng-container>

    <!-- Loading / unknown state -->
    <ng-container *ngIf="status !== 'connected' && status !== 'error'">
      <div style="font-size:48px;margin-bottom:16px">⏳</div>
      <div style="font-size:14px;color:#6b7280">Przetwarzanie…</div>
    </ng-container>

  </div>
</div>
  `,
})
export class ZohoCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);

  status = '';
  reason = '';

  ngOnInit(): void {
    this.status = this.route.snapshot.queryParamMap.get('status') ?? '';
    this.reason = this.route.snapshot.queryParamMap.get('reason') ?? '';

    if (this.status === 'connected') {
      // localStorage storage-event — same cross-tab communication pattern as Gmail/Outlook callback
      localStorage.setItem('zoho_oauth_connected', String(Date.now()));
    }

    // BroadcastChannel — primary mechanism
    try {
      const bc = new BroadcastChannel('zoho-oauth');
      bc.postMessage({ type: 'zoho-oauth-result', status: this.status });
      bc.close();
    } catch (_) {}

    // Fallback: postMessage when opener is not null
    if (window.opener) {
      try {
        window.opener.postMessage({ type: 'zoho-oauth-result', status: this.status }, window.location.origin);
      } catch (_) {}
    }
  }

  close(): void {
    window.close();
  }
}
