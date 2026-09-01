import { Component, OnDestroy, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  Subscription, timer, interval, of,
  switchMap, filter, take, map, catchError, retry, startWith, timeout, tap,
  firstValueFrom,
} from 'rxjs';
import { PbxService, ActiveCall } from '../../../core/services/pbx.service';
import { CrmApiService } from '../../../core/services/crm-api.service';
import { AuthService } from '../../../core/auth/auth.service';

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

@Component({
  selector: 'app-softphone-overlay',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<!-- ── Błąd mikrofonu ────────────────────────────────────── -->
<div *ngIf="micErrorMsg"
     style="position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:10000;
            background:#dc2626;color:#fff;border-radius:10px;padding:12px 20px;
            font-size:13px;font-weight:600;max-width:360px;text-align:center;
            box-shadow:0 4px 16px rgba(0,0,0,.3)">
  🎙️ {{micErrorMsg}}
</div>

<!-- ── Dialog potwierdzenia ─────────────────────────────── -->
<div *ngIf="pending" class="sp-backdrop" (click)="cancelPending()">
  <div class="sp-card sp-confirm" (click)="$event.stopPropagation()">
    <div class="sp-title">Zadzwonić?</div>
    <select *ngIf="pending.availableNumbers && pending.availableNumbers.length > 1"
            class="sp-number-input" style="margin-bottom:6px"
            [ngModel]="editNumber" (ngModelChange)="editNumber = $event">
      <option *ngFor="let n of pending.availableNumbers" [value]="n.number">{{ n.label }}</option>
    </select>
    <input class="sp-number-input" [(ngModel)]="editNumber" placeholder="+48 600 000 000" (keydown.enter)="confirm()">
    <div class="sp-row" style="gap:8px;margin-top:4px">
      <button class="sp-btn sp-btn-call" (click)="confirm()">📞 Zadzwoń</button>
      <button class="sp-btn sp-btn-cancel" (click)="cancelPending()">Anuluj</button>
    </div>
  </div>
</div>

<!-- ── Overlay aktywnej rozmowy / po zakończeniu ─────────── -->
<div *ngIf="call" class="sp-widget" [class.sp-widget-wide]="call.phase === 'post-call'">

  <!-- Połączenie przychodzące -->
  <ng-container *ngIf="call.phase === 'incoming'">
    <div class="sp-phase-label sp-label-incoming">📲 Połączenie przychodzące</div>
    <div class="sp-caller">{{ call.displayName }}</div>

    <!-- Spinner lookup -->
    <div *ngIf="call.contextLoading"
         style="display:flex;align-items:center;gap:5px;font-size:11px;color:#9ca3af;margin-top:5px">
      <span class="sp-spinner"></span> Szukam kontaktu…
    </div>

    <!-- Znaleziono Lead / Partner -->
    <button *ngIf="!call.contextLoading && call.context.entityType"
            (click)="goToEntity()"
            style="display:block;width:100%;text-align:left;background:#374151;
                   border:1px solid #3BAA5D;border-radius:6px;padding:7px 10px;
                   margin-top:6px;cursor:pointer;color:#4ade80;font-size:12px;
                   font-weight:600;font-family:inherit">
      🔗 {{ call.context.entityType === 'lead' ? 'Lead' : 'Partner' }}: {{ call.context.companyName || call.displayName }}
    </button>

    <!-- Nie znaleziono -->
    <div *ngIf="!call.contextLoading && !call.context.entityType"
         style="font-size:11px;color:#6b7280;margin-top:4px">
      Numer nieznany
    </div>

    <div class="sp-row" style="gap:8px;margin-top:8px">
      <button class="sp-btn sp-btn-call" [disabled]="answering" (click)="answer()">
        {{ answering ? 'Odbieranie…' : 'Odbierz' }}
      </button>
      <button class="sp-btn sp-btn-hangup" [disabled]="answering" (click)="hangup()">Odrzuć</button>
    </div>
  </ng-container>

  <!-- Dzwoni / Wybieranie / Odbieranie -->
  <ng-container *ngIf="call.phase === 'dialing' || call.phase === 'ringing'">
    <div class="sp-phase-label">
      {{ call.phase === 'ringing' && call.direction === 'inbound'
           ? '🟢 Odbieranie…'
           : call.phase === 'ringing' ? '🔔 Dzwoni…' : '📡 Wybieranie…' }}
    </div>
    <div class="sp-caller">{{ call.displayName }}</div>
    <button class="sp-btn sp-btn-hangup" style="margin-top:8px" (click)="hangup()">Rozłącz</button>
  </ng-container>

  <!-- Aktywna rozmowa -->
  <ng-container *ngIf="call.phase === 'active'">
    <div class="sp-phase-label sp-label-active">🟢 Rozmowa</div>
    <div class="sp-caller">{{ call.displayName }}</div>

    <div *ngIf="call.contextLoading"
         style="display:flex;align-items:center;gap:5px;font-size:11px;color:#9ca3af;margin-top:4px">
      <span class="sp-spinner"></span> Szukam kontaktu…
    </div>
    <button *ngIf="!call.contextLoading && call.context.entityType"
            (click)="goToEntity()"
            style="display:block;width:100%;text-align:left;background:#374151;
                   border:1px solid #3BAA5D;border-radius:6px;padding:7px 10px;
                   margin-top:6px;cursor:pointer;color:#4ade80;font-size:12px;
                   font-weight:600;font-family:inherit">
      🔗 {{ call.context.entityType === 'lead' ? 'Lead' : 'Partner' }}: {{ call.context.companyName || call.displayName }}
    </button>

    <div class="sp-duration">{{ fmtDuration(call.durationSec) }}</div>

    <!-- Wyświetlacz wpisanych cyfr DTMF -->
    <div class="sp-dtmf-display">{{ call.dtmfBuffer || '&nbsp;' }}</div>

    <!-- Klawiatura DTMF (IVR) — zawsze widoczna podczas aktywnej rozmowy -->
    <div class="sp-dtmf-grid">
      <button *ngFor="let key of dtmfKeys" class="sp-dtmf-key" (click)="sendDtmf(key)">{{ key }}</button>
    </div>

    <div class="sp-row" style="gap:8px;margin-top:8px">
      <button class="sp-btn sp-btn-mute" [class.muted]="call.muted" (click)="toggleMute()">
        {{ call.muted ? '🔇 Wyciszono' : '🎤 Wycisz' }}
      </button>
      <button class="sp-btn sp-btn-hangup" (click)="hangup()">Rozłącz</button>
    </div>
  </ng-container>

  <!-- Formularz notatki po zakończeniu -->
  <ng-container *ngIf="call.phase === 'post-call'">
    <div class="sp-phase-label">📞 Rozmowa zakończona</div>
    <div class="sp-caller" style="font-size:13px">
      {{ call.displayName }}
      <span *ngIf="call.durationSec > 0" style="color:#9ca3af;font-weight:400"> · {{ fmtDuration(call.durationSec) }}</span>
    </div>
    <div *ngIf="call.context.entityType" style="font-size:11px;color:#6b7280;margin-top:2px">
      Aktywność zostanie zapisana na poziomie {{ call.context.entityType === 'lead' ? 'Leada' : 'Partnera' }}
    </div>

    <!-- Status transkrypcji -->
    <div *ngIf="transcriptionState === 'loading'"
         style="font-size:11px;color:#9ca3af;margin-top:6px;display:flex;align-items:center;gap:4px">
      <span class="sp-spinner"></span> Pobieranie transkrypcji…
    </div>
    <div *ngIf="transcriptionState === 'loaded'"
         style="font-size:11px;color:#4ade80;margin-top:6px">
      ✓ Transkrypcja załadowana — możesz edytować
    </div>
    <div *ngIf="transcriptionState === 'unavailable'"
         style="font-size:11px;color:#9ca3af;margin-top:6px">
      Transkrypcja niedostępna — wpisz notatkę ręcznie
    </div>

    <textarea class="sp-note" [(ngModel)]="noteText"
      placeholder="Notatka z rozmowy (opcjonalnie)…"
      rows="6"></textarea>
    <div *ngIf="saveError" class="sp-error">Błąd zapisu — spróbuj ponownie</div>
    <div class="sp-row" style="gap:8px;margin-top:8px">
      <button class="sp-btn sp-btn-cancel"
              [disabled]="saving"
              (click)="saveActivity(false)"
              style="flex:0 0 auto;padding:9px 10px;font-size:12px">
        Bez notatki
      </button>
      <button class="sp-btn sp-btn-save" [disabled]="saving" (click)="saveActivity(true)">
        {{ saving ? 'Zapisuję…' : 'Zapisz z notatką' }}
      </button>
    </div>
  </ng-container>
</div>
  `,
  styles: [`
.sp-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,.35);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999;
}
.sp-card {
  background: #fff; border-radius: 14px; padding: 24px 28px;
  box-shadow: 0 8px 32px rgba(0,0,0,.22); min-width: 280px;
}
.sp-confirm .sp-title {
  font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 14px;
}
.sp-number-input {
  width: 100%; box-sizing: border-box;
  border: 1.5px solid #d1d5db; border-radius: 8px;
  padding: 9px 12px; font-size: 15px; outline: none;
}
.sp-number-input:focus { border-color: #3BAA5D; }

.sp-widget {
  position: fixed; bottom: 24px; right: 24px; z-index: 9998;
  background: #1f2937; color: #f9fafb;
  border-radius: 14px; padding: 18px 20px; min-width: 240px;
  box-shadow: 0 8px 32px rgba(0,0,0,.35);
  transition: min-width .2s ease;
}
.sp-widget-wide { min-width: 360px; }

.sp-phase-label {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .6px; color: #9ca3af; margin-bottom: 6px;
}
.sp-label-active  { color: #4ade80; }
.sp-label-incoming { color: #60a5fa; }
.sp-caller {
  font-size: 15px; font-weight: 600; color: #f9fafb;
  margin-bottom: 2px;
}
.sp-duration {
  font-size: 22px; font-weight: 700; color: #f9fafb;
  font-variant-numeric: tabular-nums; margin: 4px 0;
}
.sp-row { display: flex; align-items: center; }
.sp-btn {
  flex: 1; padding: 9px 12px; border-radius: 8px;
  font-size: 13px; font-weight: 600; border: none; cursor: pointer;
  transition: opacity .15s;
}
.sp-btn:hover:not(:disabled) { opacity: .85; }
.sp-btn:disabled { opacity: .5; cursor: default; }
.sp-btn-call   { background: #22c55e; color: #fff; }
.sp-btn-hangup { background: #ef4444; color: #fff; }
.sp-btn-cancel { background: #4b5563; color: #f9fafb; }
.sp-btn-mute   { background: #374151; color: #f9fafb; }
.sp-btn-mute.muted { background: #3BAA5D; color: #fff; }
.sp-btn-save   { background: #3BAA5D; color: #fff; flex: 2; }
.sp-note {
  width: 100%; box-sizing: border-box; margin-top: 10px;
  background: #374151; color: #f9fafb; border: 1.5px solid #4b5563;
  border-radius: 8px; padding: 10px 12px; font-size: 13px;
  resize: vertical; outline: none; font-family: inherit; line-height: 1.5;
}
.sp-note::placeholder { color: #6b7280; }
.sp-note:focus { border-color: #3BAA5D; }
.sp-note:disabled { opacity: .6; cursor: wait; }
.sp-error {
  font-size: 11px; color: #f87171; margin-top: 6px;
}
.sp-spinner {
  display: inline-block; width: 10px; height: 10px;
  border: 2px solid #4b5563; border-top-color: #9ca3af;
  border-radius: 50%; animation: sp-spin .8s linear infinite;
}
@keyframes sp-spin { to { transform: rotate(360deg); } }
.sp-dtmf-display {
  background: #111827; border: 1px solid #374151; border-radius: 6px;
  padding: 5px 10px; margin: 8px 0 4px;
  font-size: 15px; font-weight: 700; letter-spacing: 3px;
  color: #f9fafb; text-align: right; min-height: 28px;
  font-variant-numeric: tabular-nums; font-family: monospace;
}
.sp-dtmf-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 5px; margin: 0 0 4px;
}
.sp-dtmf-key {
  background: #374151; color: #f9fafb;
  border: 1px solid #4b5563; border-radius: 8px;
  font-size: 16px; font-weight: 700; padding: 10px 0;
  cursor: pointer; font-family: inherit;
  transition: background .1s;
}
.sp-dtmf-key:hover  { background: #4b5563; }
.sp-dtmf-key:active { background: #3BAA5D; color: #fff; }
  `],
})
export class SoftphoneOverlayComponent implements OnInit, OnDestroy {
  private pbx    = inject(PbxService);
  private crmApi = inject(CrmApiService);
  private auth   = inject(AuthService);
  private cdr    = inject(ChangeDetectorRef);
  private router = inject(Router);

  call:      ActiveCall | null = null;
  pending:   { number: string; context: any; availableNumbers?: { label: string; number: string }[] } | null = null;
  editNumber = '';
  noteText   = '';
  saving     = false;
  saveError  = false;
  micErrorMsg = '';

  transcriptionState: 'idle' | 'loading' | 'loaded' | 'unavailable' = 'idle';
  answering = false; // true między kliknięciem "Odbierz" a fazą active

  fmtDuration = fmtDuration;

  private subs              = new Subscription();
  private transcriptionSub: Subscription | null = null;

  ngOnInit(): void {
    this.subs.add(this.pbx.activeCall$.subscribe(c => {
      const prevPhase = this.call?.phase;
      this.call = c;

      if (!c) {
        this.cancelTranscriptionFetch();
        this.noteText           = '';
        this.saving             = false;
        this.saveError          = false;
        this.answering          = false;
        this.transcriptionState = 'idle';
      } else {
        if (c.phase === 'active') this.answering = false;
        if (prevPhase !== 'post-call' && c.phase === 'post-call') {
          this.startTranscriptionFetch(c);
        }
      }

      this.cdr.markForCheck();
    }));

    this.subs.add(this.pbx.pendingCall$.subscribe(p => {
      this.pending = p;
      this.editNumber = p?.number ?? '';
      this.micErrorMsg = '';
      this.cdr.markForCheck();
    }));

    this.subs.add(this.pbx.micError$.subscribe(msg => {
      this.micErrorMsg = msg;
      this.cdr.markForCheck();
      setTimeout(() => { this.micErrorMsg = ''; this.cdr.markForCheck(); }, 8000);
    }));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.transcriptionSub?.unsubscribe();
  }

  confirm(): void {
    const num = this.editNumber.trim();
    if (!num) return;
    void this.pbx.confirmCall(num, this.pending?.context ?? {});
  }

  cancelPending(): void { this.pbx.cancelPending(); }

  answer(): void {
    if (this.answering) return;
    this.answering = true;
    this.cdr.markForCheck();
    void this.pbx.answer();
  }

  hangup(): void { void this.pbx.hangup(); }

  goToEntity(): void {
    const { entityType, entityId } = this.call?.context ?? {};
    if (!entityType || !entityId) return;
    const detailPath = entityType === 'lead' ? `/crm/leads/${entityId}` : `/crm/partners/${entityId}`;
    const listPath   = entityType === 'lead' ? '/crm/leads' : '/crm/partners';

    // lead-detail i partner-detail używają snapshot.paramMap (nie reaktywnie).
    // Angular reużywa komponent przy nawigacji leads/100 → leads/200 bez restartu ngOnInit.
    // Obejście: przejdź przez list (inny komponent) → detail — tworzy świeży egzemplarz.
    if (this.router.url.startsWith(listPath + '/')) {
      void this.router.navigateByUrl(listPath, { skipLocationChange: true })
        .then(() => this.router.navigate([detailPath]));
    } else {
      void this.router.navigate([detailPath]);
    }
  }

  toggleMute(): void {
    if (this.call) this.pbx.setMuted(!this.call.muted);
  }

  readonly dtmfKeys = ['1','2','3','4','5','6','7','8','9','*','0','#'];

  sendDtmf(tone: string): void {
    this.pbx.sendDtmf(tone);
  }

  /** withNote=true → zapisuje aktywność z notatką; withNote=false → zamknij bez zapisu */
  async saveActivity(withNote: boolean): Promise<void> {
    if (!this.call || this.saving) return;

    if (!withNote) {
      this.pbx.clearCall();
      return;
    }

    const { context, durationSec, startedAt, direction, number } = this.call;

    if (!context.entityType || !context.entityId) {
      this.pbx.clearCall();
      return;
    }

    this.saving    = true;
    this.saveError = false;
    this.cdr.markForCheck();

    const durationMin = durationSec > 0 ? Math.max(1, Math.round(durationSec / 60)) : null;
    const title = direction === 'inbound' ? `Połączenie przychodzące od ${number}` : `Połączenie wychodzące do ${number}`;
    const note  = withNote ? this.noteText.trim() : '';

    const data = {
      type:         'note' as const,
      title,
      body:         note || null,
      duration_min: durationMin,
      activity_at:  null,
      assigned_to:  this.auth.currentUser?.id ?? null,
      direction,
    };

    try {
      if (context.entityType === 'lead') {
        await firstValueFrom(this.crmApi.createLeadActivity(context.entityId as number, data));
      } else if (context.entityType === 'partner') {
        await firstValueFrom(this.crmApi.createPartnerActivity(context.entityId, data));
      }

      // Auto-upsert do Analizatora Rozmów — tylko gdy notatka niepusta i NIP znany
      if (note && context.nip) {
        const nip = context.nip.replace(/\D/g, '');
        if (nip.length === 10) {
          this.crmApi.upsertCallNote({
            nip,
            company_name:     context.companyName ?? null,
            city:             context.city ?? null,
            salesperson:      this.auth.currentUser?.display_name ?? null,
            salesperson_id:   this.auth.currentUser?.id ?? null,
            salesperson_name: this.auth.currentUser?.display_name ?? null,
            note,
            call_date:        (startedAt ?? new Date()).toISOString().slice(0, 16).replace('T', ' '),
          }).subscribe({
            error: e => console.warn('[PBX] Call-analysis upsert failed:', e.status, e.error?.error),
          });
        }
      }

      this.pbx.notifyActivitySaved(context);
      this.pbx.clearCall();
    } catch (e) {
      console.error('[PBX] Błąd zapisu aktywności', e);
      this.saving    = false;
      this.saveError = true;
      this.cdr.markForCheck();
    }
  }

  // ─── Transcription ────────────────────────────────────────────────────────

  private startTranscriptionFetch(call: ActiveCall): void {
    if ((call.durationSec ?? 0) < 5) {
      this.transcriptionState = 'unavailable';
      this.cdr.markForCheck();
      return;
    }

    this.transcriptionState = 'loading';
    this.cdr.markForCheck();

    const number    = call.number;
    const startedAt = (call.startedAt ?? new Date()).toISOString();
    const direction = call.direction;

    console.log('[PBX transcript] starting — direction:', direction, 'callId:', call.callId, 'number:', number, 'duration:', call.durationSec);

    const POLL_INTERVAL = 5_000;
    const INITIAL_DELAY = 5_000;

    const MAX_404      = 6;      // po 6 kolejnych 404 (~30s) rezygnujemy
    const POLL_TIMEOUT = 45_000; // timeout całej sesji pollingu

    const pollTranscription = (callId: string, pollDir: 'inbound' | 'outbound' = direction) => {
      let notFoundCount = 0;
      return interval(POLL_INTERVAL).pipe(
        startWith(0),
        switchMap(() => this.crmApi.getPbxTranscription(callId, pollDir).pipe(
          tap(() => { notFoundCount = 0; }),
          tap(d => console.log('[PBX transcript] poll:', d.agent_status, d.client_status)),
          catchError(e => {
            if (e.status === 404) {
              notFoundCount++;
              console.log('[PBX transcript] 404 —', notFoundCount, '/', MAX_404);
              if (notFoundCount >= MAX_404) {
                console.warn('[PBX transcript] transkrypcja niedostępna po', MAX_404, 'próbach 404');
                throw e; // propaguj → catchError wyżej → 'unavailable'
              }
              return of(null);
            }
            throw e;
          }),
        )),
        filter((data): data is NonNullable<typeof data> => {
          if (!data) return false;
          const done = (s: string) => s === 'finished' || s === 'failed';
          return done(data.agent_status) && done(data.client_status);
        }),
        take(1),
        timeout(POLL_TIMEOUT),
      );
    };

    const findAndPoll = (initialDelay = INITIAL_DELAY, dir: 'inbound' | 'outbound' = direction) =>
      timer(initialDelay).pipe(
        switchMap(() => {
          console.log('[PBX transcript] findPbxCall:', number, 'dir:', dir);
          return this.crmApi.findPbxCall(number, startedAt, dir).pipe(
            tap(r  => console.log('[PBX transcript] findPbxCall OK:', r)),
            tap({ error: e => console.warn('[PBX transcript] findPbxCall error:', e.status, e.error) }),
            retry({ count: 5, delay: 3_000 }),
          );
        }),
        switchMap(({ call_id }) => {
          console.log('[PBX transcript] polling call_id:', call_id, 'dir:', dir);
          return pollTranscription(call_id, dir);
        }),
      );

    // Outbound: X-CoreTel-Call-ID (5s) → fallback findPbxCall
    // Inbound z callId: X-CoreTel-Call-ID z INVITE → fallback findPbxCall
    // Inbound bez callId: bezpośrednio findPbxCall
    let source$;
    if (call.callId) {
      const callId = call.callId;
      source$ = timer(INITIAL_DELAY).pipe(
        tap(() => console.log('[PBX transcript]', direction, '— X-CoreTel-Call-ID:', callId)),
        switchMap(() => pollTranscription(callId, direction).pipe(
          catchError(e => {
            console.warn('[PBX transcript] X-CoreTel-Call-ID failed (', e.status, ') — fallback findPbxCall');
            return findAndPoll(2_000, direction);
          }),
        )),
      );
    } else {
      source$ = findAndPoll();
    }

    this.transcriptionSub = source$.pipe(
      take(1),
      map(data => this.assembleTranscription(data)),
      catchError(e => { console.error('[PBX transcript] chain error:', e); return of(null); }),
    ).subscribe(text => {
      if (text) {
        // Nie nadpisuj notatki jeśli user już coś wpisał
        if (!this.noteText.trim()) this.noteText = text;
        this.transcriptionState = 'loaded';
      } else {
        this.transcriptionState = 'unavailable';
      }
      this.cdr.markForCheck();
    });
  }

  private cancelTranscriptionFetch(): void {
    this.transcriptionSub?.unsubscribe();
    this.transcriptionSub = null;
  }

  private assembleTranscription(data: {
    agent_segments:  { start: number; end: number; text: string }[];
    client_segments: { start: number; end: number; text: string }[];
  }): string {
    type Seg = { start: number; end: number; text: string; speaker: 'agent' | 'client' };
    // Sort by `end`, not `start`: when a leg was silent before an utterance, the
    // PBX ASR pads that segment's `start` backwards into the silence (seen: a
    // 2-word reply tagged start=0 end=12), which sorts it far too early. `end`
    // marks when the phrase actually finished and stays reliable across both legs.
    const segs: Seg[] = [
      ...(data.agent_segments  ?? []).map(s => ({ ...s, speaker: 'agent'  as const })),
      ...(data.client_segments ?? []).map(s => ({ ...s, speaker: 'client' as const })),
    ].sort((a, b) => (a.end - b.end) || (a.start - b.start));

    if (!segs.length) return '';
    const agentLabel = this.auth.currentUser?.display_name ?? 'Handlowiec';
    return segs.map(s =>
      `[${s.speaker === 'agent' ? agentLabel : 'Klient'}] ${s.text}`
    ).join('\n');
  }
}
