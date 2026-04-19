// src/app/pages/crm/gmail-callback/gmail-callback.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'wt-gmail-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
<div style="position:fixed;inset:0;background:#f9fafb;display:flex;align-items:center;justify-content:center;padding:24px">
  <div style="background:white;border-radius:16px;padding:40px 48px;max-width:480px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)">

    <!-- Success -->
    <ng-container *ngIf="status === 'connected'">
      <div style="font-size:48px;margin-bottom:16px">✅</div>
      <div style="font-size:20px;font-weight:800;color:#111827;margin-bottom:8px">Gmail połączony!</div>
      <div style="font-size:14px;color:#6b7280;margin-bottom:28px;line-height:1.6">
        Twoje konto Gmail zostało pomyślnie połączone z aplikacją.<br>
        Możesz zamknąć to okno i wrócić do pracy w CRM.
      </div>
      <button (click)="close()"
              style="background:#f97316;color:white;border:none;border-radius:8px;padding:10px 28px;font-size:14px;font-weight:600;cursor:pointer">
        Zamknij okno
      </button>
    </ng-container>

    <!-- Error -->
    <ng-container *ngIf="status === 'error'">
      <div style="font-size:48px;margin-bottom:16px">❌</div>
      <div style="font-size:20px;font-weight:800;color:#111827;margin-bottom:8px">Błąd połączenia</div>
      <div style="font-size:14px;color:#6b7280;margin-bottom:8px;line-height:1.6">
        Nie udało się połączyć konta Gmail.
      </div>
      <div *ngIf="reason" style="font-size:12px;color:#9ca3af;background:#f3f4f6;border-radius:6px;padding:6px 12px;margin-bottom:24px;font-family:monospace">
        {{reason}}
      </div>
      <button (click)="close()"
              style="background:#6b7280;color:white;border:none;border-radius:8px;padding:10px 28px;font-size:14px;font-weight:600;cursor:pointer">
        Zamknij okno
      </button>
    </ng-container>

    <!-- Unknown state -->
    <ng-container *ngIf="status !== 'connected' && status !== 'error'">
      <div style="font-size:48px;margin-bottom:16px">⏳</div>
      <div style="font-size:14px;color:#6b7280">Przetwarzanie…</div>
    </ng-container>

  </div>
</div>
  `,
})
export class GmailCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);

  status = '';
  reason = '';

  ngOnInit(): void {
    this.status = this.route.snapshot.queryParamMap.get('status') ?? '';
    this.reason = this.route.snapshot.queryParamMap.get('reason') ?? '';

    // Powiadom okno rodzica (CRM tab) — odświeży status Gmail bez przeładowania strony
    if (window.opener) {
      window.opener.postMessage({ type: 'gmail-oauth-result', status: this.status }, window.location.origin);
    }
  }

  close(): void {
    window.close();
  }
}
