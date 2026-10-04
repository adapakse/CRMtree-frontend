import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../core/services/toast.service';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';

interface SignedInDevice {
  device_id: string;
  device_name: string | null;
  first_seen_at: string;
  last_active_at: string;
}

// Phones signed in to this account through the mobile app (ADR 001 §4) — lets
// the user cut off a lost or replaced company phone without asking an admin.
@Component({
  selector: 'wt-my-devices',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('account')],
  template: `
    <div class="card devices-card" *transloco="let t; prefix: 'account'">
      <h2>📱 {{ t('myDevices.title') }}</h2>
      <p class="hint">
        {{ t('myDevices.hint') }}
      </p>
      @if (loading()) {
        <p class="hint">{{ 'states.loading' | transloco }}</p>
      } @else if (devices().length === 0) {
        <p class="empty">{{ t('myDevices.empty') }}</p>
      } @else {
        <ul class="device-list">
          @for (d of devices(); track d.device_id) {
            <li class="device-row">
              <div class="device-info">
                <span class="device-name">{{ d.device_name || t('myDevices.unknownDevice') }}</span>
                <span class="device-meta">
                  {{ t('myDevices.lastActive', { date: (d.last_active_at | date:'d MMM y, HH:mm') }) }} ·
                  {{ t('myDevices.signedInSince', { date: (d.first_seen_at | date:'d MMM y') }) }}
                </span>
              </div>
              <button type="button" class="btn-signout" (click)="signOut(d)" [disabled]="signingOut() === d.device_id">
                @if (signingOut() === d.device_id) { {{ t('myDevices.signingOut') }} } @else { {{ t('myDevices.signOut') }} }
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: [`
    .devices-card { padding: 24px; }
    h2 { font-family: 'Sora', sans-serif; font-size: 15px; font-weight: 700; color: #18181b; margin: 0 0 6px; }
    .hint { font-size: 12px; color: #71717a; margin: 0 0 14px; line-height: 1.5; }
    .empty { font-size: 13px; color: #71717a; margin: 0; }
    .device-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .device-row {
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px;
    }
    .device-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .device-name { font-size: 13px; font-weight: 600; color: #18181b; }
    .device-meta { font-size: 12px; color: #71717a; }
    .btn-signout {
      border: none; border-radius: 8px; background: #FEE2E2; color: #991B1B;
      font-weight: 600; font-size: 12px; padding: 7px 12px; cursor: pointer;
    }
    .btn-signout:disabled { opacity: 0.6; cursor: not-allowed; }
  `],
})
export class MyDevicesComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private transloco = inject(TranslocoService);
  private readonly api = `${environment.apiUrl}/auth/devices`;

  readonly devices = signal<SignedInDevice[]>([]);
  readonly loading = signal(true);
  readonly signingOut = signal<string | null>(null);

  ngOnInit(): void {
    this.http.get<SignedInDevice[]>(this.api).subscribe({
      next: (list) => { this.devices.set(list); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  signOut(device: SignedInDevice): void {
    const name = device.device_name || this.transloco.translate('account.myDevices.thisDevice');
    if (!confirm(this.transloco.translate('account.myDevices.signOutConfirm', { name }))) return;
    this.signingOut.set(device.device_id);
    this.http.delete<void>(`${this.api}/${encodeURIComponent(device.device_id)}`).subscribe({
      next: () => {
        this.devices.update((list) => list.filter((d) => d.device_id !== device.device_id));
        this.signingOut.set(null);
        this.toast.success(this.transloco.translate('account.myDevices.signedOut', { name }));
      },
      error: () => {
        this.signingOut.set(null);
        this.toast.error(this.transloco.translate('account.myDevices.signOutFailed'));
      },
    });
  }
}
