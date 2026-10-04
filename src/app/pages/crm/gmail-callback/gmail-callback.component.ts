// src/app/pages/crm/gmail-callback/gmail-callback.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';

@Component({
  selector: 'wt-gmail-callback',
  standalone: true,
  imports: [CommonModule, TranslocoDirective],
  providers: [provideTranslocoScope('crm')],
  template: `
<ng-container *transloco="let t; prefix: 'crm'">
<div style="position:fixed;inset:0;background:#f9fafb;display:flex;align-items:center;justify-content:center;padding:24px">
  <div style="background:white;border-radius:16px;padding:40px 48px;max-width:480px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)">

    <!-- Success -->
    <ng-container *ngIf="status === 'connected'">
      <div style="font-size:48px;margin-bottom:16px">✅</div>
      <div style="font-size:20px;font-weight:800;color:#111827;margin-bottom:8px">{{ t('mailCallback.connectedTitle', { provider: provider }) }}</div>
      <div style="font-size:14px;color:#6b7280;margin-bottom:28px;line-height:1.6">
        {{ t('mailCallback.connectedBody', { provider: provider }) }}<br>
        {{ t('mailCallback.closeHint') }}
      </div>
      <button (click)="close()"
              style="background:var(--orange);color:white;border:none;border-radius:8px;padding:10px 28px;font-size:14px;font-weight:600;cursor:pointer">
        {{ t('mailCallback.closeWindow') }}
      </button>
    </ng-container>

    <!-- Error -->
    <ng-container *ngIf="status === 'error'">
      <div style="font-size:48px;margin-bottom:16px">❌</div>
      <div style="font-size:20px;font-weight:800;color:#111827;margin-bottom:8px">{{ t('mailCallback.errorTitle') }}</div>
      <div style="font-size:14px;color:#6b7280;margin-bottom:8px;line-height:1.6">
        {{ t('mailCallback.errorBody', { provider: provider }) }}
      </div>
      <div *ngIf="reasonLabelKey || reason" style="font-size:13px;color:#374151;background:#f3f4f6;border-radius:6px;padding:8px 12px;margin-bottom:24px;line-height:1.5">
        {{ reasonLabelKey ? t(reasonLabelKey) : reason }}
      </div>
      <button (click)="close()"
              style="background:#6b7280;color:white;border:none;border-radius:8px;padding:10px 28px;font-size:14px;font-weight:600;cursor:pointer">
        {{ t('mailCallback.closeWindow') }}
      </button>
    </ng-container>

    <!-- Unknown state -->
    <ng-container *ngIf="status !== 'connected' && status !== 'error'">
      <div style="font-size:48px;margin-bottom:16px">⏳</div>
      <div style="font-size:14px;color:#6b7280">{{ t('mailCallback.processing') }}</div>
    </ng-container>

  </div>
</div>
</ng-container>
  `,
})
export class GmailCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);

  readonly provider = 'Gmail';

  private static readonly REASON_LABEL_KEYS: Record<string, string> = {
    email_already_connected: 'mailCallback.reasons.email_already_connected',
  };

  status = '';
  reason = '';
  reasonLabelKey = '';

  ngOnInit(): void {
    this.status = this.route.snapshot.queryParamMap.get('status') ?? '';
    this.reason = this.route.snapshot.queryParamMap.get('reason') ?? '';
    this.reasonLabelKey = GmailCallbackComponent.REASON_LABEL_KEYS[this.reason] ?? '';

    if (this.status === 'connected') {
      // localStorage storage-event — jedyna metoda działająca przez redirecty Google
      // (storage event odpala się we WSZYSTKICH innych kartach/oknach tej samej domeny)
      localStorage.setItem('gmail_oauth_connected', String(Date.now()));
    }

    // Fallback 1: BroadcastChannel
    try {
      const bc = new BroadcastChannel('gmail-oauth');
      bc.postMessage({ type: 'gmail-oauth-result', status: this.status });
      bc.close();
    } catch (_) {}

    // Fallback 2: postMessage (gdy opener nie jest nullowany przez COOP)
    if (window.opener) {
      try {
        window.opener.postMessage({ type: 'gmail-oauth-result', status: this.status }, window.location.origin);
      } catch (_) {}
    }
  }

  close(): void {
    window.close();
  }
}
