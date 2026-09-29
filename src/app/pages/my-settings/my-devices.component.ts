import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../core/services/toast.service';

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
  imports: [DatePipe],
  template: `
    <div class="card devices-card">
      <h2>📱 Zalogowane telefony</h2>
      <p class="hint">
        Telefony, na których jesteś zalogowany w aplikacji mobilnej CRMtree. Jeśli zgubisz telefon albo go wymienisz,
        wyloguj go tutaj — aplikacja na nim straci dostęp najpóźniej po kilkunastu minutach.
      </p>
      @if (loading()) {
        <p class="hint">Ładowanie…</p>
      } @else if (devices().length === 0) {
        <p class="empty">Brak zalogowanych telefonów.</p>
      } @else {
        <ul class="device-list">
          @for (d of devices(); track d.device_id) {
            <li class="device-row">
              <div class="device-info">
                <span class="device-name">{{ d.device_name || 'Nieznane urządzenie' }}</span>
                <span class="device-meta">
                  ostatnia aktywność {{ d.last_active_at | date:'d MMM y, HH:mm':'':'pl' }} ·
                  zalogowany od {{ d.first_seen_at | date:'d MMM y':'':'pl' }}
                </span>
              </div>
              <button type="button" class="btn-signout" (click)="signOut(d)" [disabled]="signingOut() === d.device_id">
                @if (signingOut() === d.device_id) { Wylogowuję… } @else { Wyloguj }
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
    const name = device.device_name || 'to urządzenie';
    if (!confirm(`Wylogować ${name} z aplikacji CRMtree?`)) return;
    this.signingOut.set(device.device_id);
    this.http.delete<void>(`${this.api}/${encodeURIComponent(device.device_id)}`).subscribe({
      next: () => {
        this.devices.update((list) => list.filter((d) => d.device_id !== device.device_id));
        this.signingOut.set(null);
        this.toast.success(`Wylogowano ${name}.`);
      },
      error: () => {
        this.signingOut.set(null);
        this.toast.error('Nie udało się wylogować urządzenia.');
      },
    });
  }
}
