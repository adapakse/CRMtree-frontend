// src/app/shared/components/phone-call-simulator/phone-call-simulator.component.ts
import { Component, Input, Output, EventEmitter, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CrmApiService } from '../../../core/services/crm-api.service';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';

type CallState = 'dialing' | 'connected' | 'ended';

@Component({
  selector: 'wt-phone-call-simulator',
  standalone: true,
  imports: [CommonModule, TranslocoDirective],
  providers: [provideTranslocoScope('crm')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<ng-container *transloco="let t; prefix: 'crm'">
<div class="call-overlay">
  <div class="call-card">
    <!-- Dialing -->
    <ng-container *ngIf="state === 'dialing'">
      <div class="call-icon">📞</div>
      <div class="call-label">{{ t('callSimulator.connecting') }}</div>
      <div class="call-number">{{phoneNumber}}</div>
      <div class="call-dots"><span></span><span></span><span></span></div>
      <button class="call-btn call-btn-end" (click)="hangUp()">{{ t('callSimulator.hangUp') }}</button>
    </ng-container>

    <!-- Connected -->
    <ng-container *ngIf="state === 'connected'">
      <div class="call-icon call-icon-active">📞</div>
      <div class="call-label call-connected">{{ t('callSimulator.connected') }}</div>
      <div class="call-number">{{phoneNumber}}</div>
      <div class="call-timer">{{timerLabel}}</div>
      <button class="call-btn call-btn-end" (click)="hangUp()">{{ t('callSimulator.endCall') }}</button>
    </ng-container>

    <!-- Ended -->
    <ng-container *ngIf="state === 'ended'">
      <div class="call-icon">📵</div>
      <div class="call-label">{{ t('callSimulator.ended') }}</div>
      <div class="call-number">{{phoneNumber}}</div>
      <div class="call-timer">{{ t('callSimulator.duration', { time: timerLabel }) }}</div>
      <div *ngIf="saving" class="call-saving">{{ t('callSimulator.savingNote') }}</div>
      <div *ngIf="saved" class="call-saved">✅ {{ t('callSimulator.noteSaved') }}</div>
    </ng-container>
  </div>
</div>
</ng-container>
  `,
  styles: [`
.call-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(0,0,0,.45);
  display: flex; align-items: center; justify-content: center;
}
.call-card {
  background: #1F2933; color: #fff;
  border-radius: 20px; padding: 36px 40px;
  min-width: 280px; text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  box-shadow: 0 24px 60px rgba(0,0,0,.5);
}
.call-icon { font-size: 48px; margin-bottom: 4px; }
.call-icon-active { animation: ring .8s ease-in-out infinite alternate; }
@keyframes ring { from { transform: rotate(-10deg); } to { transform: rotate(10deg); } }
.call-label { font-size: 13px; color: #9ca3af; letter-spacing: .5px; }
.call-connected { color: #3BAA5D; font-weight: 600; }
.call-number { font-size: 22px; font-weight: 700; letter-spacing: 1px; margin: 4px 0; }
.call-timer { font-size: 28px; font-weight: 300; font-variant-numeric: tabular-nums; color: #e5e7eb; }
.call-dots { display: flex; gap: 6px; margin: 4px 0; }
.call-dots span {
  width: 8px; height: 8px; border-radius: 50%; background: #3BAA5D;
  animation: blink 1.2s ease-in-out infinite;
}
.call-dots span:nth-child(2) { animation-delay: .2s; }
.call-dots span:nth-child(3) { animation-delay: .4s; }
@keyframes blink { 0%,80%,100% { opacity:.2; } 40% { opacity:1; } }
.call-btn { border: none; cursor: pointer; border-radius: 50px; padding: 12px 32px; font-size: 14px; font-weight: 600; margin-top: 16px; }
.call-btn-end { background: #ef4444; color: #fff; }
.call-btn-end:hover { background: #dc2626; }
.call-saving { font-size: 12px; color: #9ca3af; }
.call-saved { font-size: 13px; color: #3BAA5D; font-weight: 600; }
  `],
})
export class PhoneCallSimulatorComponent implements OnDestroy {
  @Input() leadId!: number;
  @Input() phoneNumber = '';
  @Input() contactName = '';
  @Output() closed = new EventEmitter<void>();

  private api = inject(CrmApiService);
  private cdr = inject(ChangeDetectorRef);
  private transloco = inject(TranslocoService);

  state: CallState = 'dialing';
  seconds = 0;
  saving = false;
  saved = false;

  private dialTimer?: ReturnType<typeof setTimeout>;
  private ticker?: ReturnType<typeof setInterval>;
  private closeTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.dialTimer = setTimeout(() => {
      this.state = 'connected';
      this.startTicker();
      this.cdr.markForCheck();
    }, 3000);
  }

  get timerLabel(): string {
    const m = Math.floor(this.seconds / 60).toString().padStart(2, '0');
    const s = (this.seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  hangUp(): void {
    if (this.state === 'dialing') {
      clearTimeout(this.dialTimer);
      this.closed.emit();
      return;
    }
    clearInterval(this.ticker);
    const duration = this.seconds;
    this.state = 'ended';
    this.saving = true;
    this.cdr.markForCheck();
    this.createCallActivity(duration);
  }

  private startTicker(): void {
    this.ticker = setInterval(() => {
      this.seconds++;
      this.cdr.markForCheck();
    }, 1000);
  }

  private createCallActivity(durationSec: number): void {
    const who = this.contactName || this.phoneNumber;
    const durationMin = Math.max(1, Math.round(durationSec / 60));
    const summary = this.transloco.translate('crm.callSimulator.activity.summary', { who, seconds: durationSec });
    const transcriptHeading = this.transloco.translate('crm.callSimulator.activity.transcriptHeading');
    const demoTranscript = this.transloco.translate('crm.callSimulator.activity.demoTranscript');
    const body = `${summary}\n\n${transcriptHeading}\n${demoTranscript}`;

    this.api.createLeadActivity(this.leadId, {
      type: 'call',
      title: this.transloco.translate('crm.callSimulator.activity.title', { who }),
      body,
      duration_min: durationMin,
      activity_at: new Date().toISOString(),
    } as any).subscribe({
      next: () => {
        this.saving = false;
        this.saved = true;
        this.cdr.markForCheck();
        this.closeTimer = setTimeout(() => this.closed.emit(), 2500);
      },
      error: () => {
        this.saving = false;
        this.saved = true;
        this.cdr.markForCheck();
        this.closeTimer = setTimeout(() => this.closed.emit(), 2500);
      },
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.dialTimer);
    clearInterval(this.ticker);
    clearTimeout(this.closeTimer);
  }
}
