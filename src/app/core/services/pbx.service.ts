import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import {
  Invitation, Inviter, Registerer, RegistererState,
  Session, SessionState, UserAgent, TransportState,
} from 'sip.js';
import { Web } from 'sip.js';
import { CrmApiService } from './crm-api.service';

export type RegState = 'idle' | 'connecting' | 'registered' | 'error';

export type CallUiPhase =
  | 'confirming'   // dialog potwierdzenia przed wybieraniem
  | 'dialing'      // INVITE wysłany, czeka na odpowiedź
  | 'ringing'      // 180 Ringing
  | 'active'       // połączenie zestawione
  | 'incoming'     // przychodzące — czeka na odbierz/odrzuć
  | 'post-call';   // zakończone — formularz notatki

export interface CallContext {
  entityType?:  'lead' | 'partner' | 'prospect';
  entityId?:    number | string;
  nip?:         string | null;
  companyName?: string | null;
  city?:        string | null;
}

export interface ActiveCall {
  session:        Session;
  direction:      'outbound' | 'inbound';
  number:         string;
  displayName:    string;
  phase:          CallUiPhase;
  startedAt:      Date | null;
  muted:          boolean;
  durationSec:    number;
  context:        CallContext;
  callId?:        string;
  contextLoading?: boolean;
  dtmfBuffer?:    string; // klawiatura DTMF: cyfry wciśnięte podczas aktywnej rozmowy
}

@Injectable({ providedIn: 'root' })
export class PbxService {
  private crmApi = inject(CrmApiService);
  private zone   = inject(NgZone);

  readonly regState$    = new BehaviorSubject<RegState>('idle');
  readonly activeCall$  = new BehaviorSubject<ActiveCall | null>(null);
  readonly activitySaved$ = new Subject<CallContext>();
  readonly micError$    = new Subject<string>(); // emituje gdy mikrofon niedostępny

  // Czeka na potwierdzenie przez użytkownika przed wybieraniem
  readonly pendingCall$ = new BehaviorSubject<{
    number:           string;
    context:          CallContext;
    availableNumbers?: { label: string; number: string }[];
  } | null>(null);

  private ua:          UserAgent  | null = null;
  private registerer:  Registerer | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private ringtoneCtx:       AudioContext | null = null;
  private ringtoneNode:      OscillatorNode | null = null;
  private outboundRingbackCtx: AudioContext | null = null;
  private incomingNotif:     Notification | null = null;
  private titleBlinkInterval: ReturnType<typeof setInterval> | null = null;
  private originalTitle      = '';
  private durationInterval:  ReturnType<typeof setInterval> | null = null;
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  private keepaliveTick    = 0;
  private unregisteredSince: number | null = null;
  private sipUri: ReturnType<typeof UserAgent.makeURI>;

  // ─── Publiczne API ─────────────────────────────────────────────────────────

  /** Otwiera dialog potwierdzenia — faktyczne połączenie po confirmCall() */
  initiate(number: string, context: CallContext = {}, availableNumbers?: { label: string; number: string }[]): void {
    this.pendingCall$.next({ number, context, availableNumbers });
  }

  /** Użytkownik kliknął "Zadzwoń" w dialogu */
  async confirmCall(number: string, context: CallContext = {}): Promise<void> {
    this.pendingCall$.next(null);
    if (this.activeCall$.value) return;

    // Sprawdź dostęp do mikrofonu PRZED połączeniem.
    // SIP.js wywołuje getUserMedia wewnętrznie podczas invite(), ale błąd jest cichy —
    // sesja powstaje bez lokalnego tracku audio i PBX kończy rozmowę po ~19s braku RTP.
    // Jawne sprawdzenie pozwala poinformować usera o problemie zanim INVITE zostanie wysłany.
    try {
      const testStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      testStream.getTracks().forEach(t => t.stop()); // zwolnij — SIP.js pobierze mikrofon sam
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError'
        ? 'Brak uprawnień do mikrofonu. Zezwól na dostęp w ustawieniach przeglądarki.'
        : `Mikrofon niedostępny: ${err?.message || err}`;
      console.error('[PBX] Microphone check failed:', err);
      this.micError$.next(msg);
      return;
    }

    if (!this.ua || this.regState$.value !== 'registered') {
      try {
        await this.connect();
        await this.waitForRegistered();
      } catch (err: any) {
        console.error('[PBX] connect/register failed:', err);
        this.zone.run(() => this.micError$.next(
          err?.error?.error ?? err?.message ?? 'Błąd połączenia SIP. Skonfiguruj token PBX w Moich ustawieniach.'
        ));
        this.activeCall$.next(null);
        return;
      }
    }

    const target = this.buildTarget(number);
    if (!target) { console.error('[PBX] Invalid number:', number); return; }

    const customCallId = crypto.randomUUID();

    const inviter = new Inviter(this.ua!, target, {
      extraHeaders: [`X-CoreTel-Call-ID: ${customCallId}`],
      sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } },
    });

    this.activeCall$.next({
      session:     inviter,
      direction:   'outbound',
      number,
      displayName: number,
      phase:       'dialing',
      startedAt:   null,
      muted:       false,
      durationSec: 0,
      context,
      callId:      customCallId,
    });

    inviter.stateChange.addListener((state) => this.zone.run(() => this.onSessionState(inviter, state)));

    await inviter.invite({
      requestDelegate: {
        onProgress: () => this.updatePhase('ringing'),
        onReject: (response) => {
          const code = response.message.statusCode;
          console.warn('[PBX] INVITE rejected:', code, response.message.reasonPhrase);
          if (code === 401 || code === 407) {
            this.zone.run(() => {
              // wymuś reconnect przy następnej próbie — stare UA może mieć złe kredencjale
              if (this.ua) { this.ua.stop().catch(() => {}); this.ua = null; this.registerer = null; }
              this.regState$.next('idle');
              this.micError$.next('Błąd autoryzacji SIP (401). Sprawdź swój token PBX w Moich ustawieniach → Softphone.');
            });
          } else if (code === 486 || code === 600) {
            this.zone.run(() => this.micError$.next('Numer zajęty — spróbuj ponownie za chwilę.'));
          } else if (code === 403 || code === 404) {
            this.zone.run(() => this.micError$.next(`Połączenie odrzucone (${code}). Sprawdź numer.`));
          }
          // SessionState.Terminated wyczyści activeCall$ przez onSessionState
        },
      },
    }).catch((err) => {
      console.error('[PBX] invite() error:', err);
      this.zone.run(() => this.clearCall());
    });
  }

  async hangup(): Promise<void> {
    const call = this.activeCall$.value;
    if (!call) return;
    try {
      if (call.phase === 'active') {
        await call.session.bye();
      } else if (call.session instanceof Inviter) {
        await call.session.cancel();
      } else if (call.session instanceof Invitation) {
        await call.session.reject({ statusCode: 486 });
      }
    } catch { /* ignoruj błędy rozłączania */ }
  }

  async answer(): Promise<void> {
    const call = this.activeCall$.value;
    if (!call || !(call.session instanceof Invitation)) return;
    if (call.session.state !== SessionState.Initial) return;
    await call.session.accept({
      sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } },
    });
  }

  setMuted(muted: boolean): void {
    const call = this.activeCall$.value;
    if (!call || call.phase !== 'active') return;
    const handler = call.session.sessionDescriptionHandler as Web.SessionDescriptionHandler;
    handler?.localMediaStream?.getAudioTracks().forEach(t => { t.enabled = !muted; });
    handler?.peerConnection?.getSenders().forEach(s => {
      if (s.track?.kind === 'audio') s.track.enabled = !muted;
    });
    this.activeCall$.next({ ...call, muted });
  }

  cancelPending(): void {
    this.pendingCall$.next(null);
  }

  /** Wywoływane przez overlay po pomyślnym zapisie aktywności — powiadamia detail-komponenty o odświeżeniu */
  notifyActivitySaved(context: CallContext): void {
    if (context.entityType && context.entityId) {
      this.activitySaved$.next(context);
    }
  }

  /** Wywoływane przez overlay po zapisaniu/pominięciu notatki */
  clearCall(): void {
    this.stopTimer();
    this.clearRemoteAudio();
    this.activeCall$.next(null);
  }

  /** Prosi o uprawnienie do powiadomień systemowych — wywołać przy starcie apki */
  async requestNotificationPermission(): Promise<void> {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }

  /** Cicha rejestracja SIP przy starcie aplikacji — ignoruje błąd gdy brak PAT */
  async autoConnect(): Promise<void> {
    if (this.ua) return;
    try {
      await this.connect();
      this.startKeepalive();
    } catch { /* brak PAT lub brak sieci — ignoruj */ }
  }

  private startKeepalive(): void {
    if (this.keepaliveInterval) return;
    this.keepaliveInterval = setInterval(async () => {
      this.keepaliveTick++;

      // Warstwa 1: sprawdź stan WebSocket niezależnie od regState$.
      // SIP.js może auto-reconnectować transport (reconnectionAttempts:10),
      // ale Registerer nie zawsze re-rejestruje po powrocie — UA staje się zombie.
      if (this.ua) {
        const transport = (this.ua as any).transport;
        const connected  = transport?.isConnected?.() ?? true;
        if (!connected && this.regState$.value === 'registered') {
          console.warn('[PBX keepalive] transport WebSocket down mimo regState=registered — full UA restart');
          try { await this.ua.stop(); } catch {}
          this.ua = null;
          this.registerer = null;
          this.regState$.next('error');
          if (this.unregisteredSince == null) this.unregisteredSince = Date.now();
          try { await this.connect(); } catch {}
          return;
        }
      }

      if (this.regState$.value === 'registered') {
        // Co 5 minut: rewaliduj credentials — jeśli token skasowany (404), wyrejestruj UA.
        if (this.keepaliveTick % 5 === 0) {
          try {
            await this.crmApi.getSipCredentials().toPromise();
          } catch {
            await this.disconnect();
          }
        }
      } else {
        // Warstwa 2: jeśli niezarejestrowany > 10s, próbuj reconnect.
        const elapsed = this.unregisteredSince != null ? Date.now() - this.unregisteredSince : Infinity;
        if (elapsed > 10_000) {
          try { await this.connect(); } catch { /* sieć niedostępna — spróbujemy za minutę */ }
        }
      }
    }, 60_000);
  }

  async connect(): Promise<void> {
    // Jeśli UA istnieje ale nie jest zarejestrowany (np. po rozłączeniu sieci),
    // wyczyść stary UA i zbuduj od nowa.
    if (this.ua && this.regState$.value !== 'registered') {
      try { await this.ua.stop(); } catch { /* ignoruj */ }
      this.ua = null;
      this.registerer = null;
    }
    if (this.ua) return;
    this.regState$.next('connecting');

    const creds = await this.crmApi.getSipCredentials().toPromise();

    const uri = UserAgent.makeURI(creds!.sip_uri);
    if (!uri) throw new Error('[PBX] Invalid sip_uri from API');
    this.sipUri = uri;

    const iceServers: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
    ];
    if (creds!.turn?.urls?.length) {
      iceServers.push({
        urls:       creds!.turn.urls,
        username:   creds!.turn.username,
        credential: creds!.turn.password,
      });
    }

    this.ua = new UserAgent({
      uri,
      authorizationUsername: creds!.username,
      authorizationPassword: creds!.password,
      displayName:           creds!.username,
      transportOptions:      { server: creds!.sip_url, keepAliveInterval: 30 },
      reconnectionAttempts:  10,
      reconnectionDelay:     5,
      sessionDescriptionHandlerFactoryOptions: {
        constraints: { audio: true, video: false },
        iceServers,
      },
    });

    this.ua.delegate = {
      onInvite: (inv) => this.zone.run(() => this.handleIncomingInvite(inv)),
    };

    this.registerer = new Registerer(this.ua);
    this.registerer.stateChange.addListener((state) => this.zone.run(() => {
      switch (state) {
        case RegistererState.Registered:
          this.regState$.next('registered');
          this.unregisteredSince = null;
          break;
        case RegistererState.Unregistered:
          this.regState$.next('idle');
          if (this.unregisteredSince == null) this.unregisteredSince = Date.now();
          break;
        case RegistererState.Terminated:
          this.regState$.next('error');
          if (this.unregisteredSince == null) this.unregisteredSince = Date.now();
          break;
      }
    }));

    await this.ua.start();

    // Listener na zmiany stanu WebSocket — szybsza detekcja niż keepalive (60s tick).
    // SIP.js może auto-reconnectować transport (reconnectionAttempts:10), ale Registerer
    // często nie re-rejestruje po powrocie → UA zombie: regState='registered', ale centrala
    // już nie routuje połączeń przychodzących na ten socket.
    const transport = (this.ua as any)?.transport;
    transport?.stateChange?.addListener((state: TransportState) => {
      this.zone.run(() => {
        if (state === TransportState.Disconnected) {
          console.warn('[PBX] WebSocket rozłączony — keepalive zdecyduje o restarcie po 60s');
          if (this.regState$.value === 'registered' && this.unregisteredSince == null) {
            this.unregisteredSince = Date.now();
          }
        } else if (state === TransportState.Connected && this.registerer) {
          // Transport wrócił (SIP.js auto-reconnect) — wymuś re-rejestrację jeśli potrzebna
          if (this.regState$.value !== 'registered') {
            console.log('[PBX] WebSocket reconnected — próba re-rejestracji');
            this.registerer.register().catch(err =>
              console.warn('[PBX] re-register po reconnect nieudany:', err)
            );
          }
        }
      });
    });

    await this.registerer.register();
  }

  private waitForRegistered(timeoutMs = 12_000): Promise<void> {
    if (this.regState$.value === 'registered') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        sub.unsubscribe();
        reject(new Error('Timeout rejestracji SIP (12s). Sprawdź połączenie i konfigurację PBX.'));
      }, timeoutMs);
      const sub = this.regState$.subscribe(state => {
        if (state === 'registered') {
          clearTimeout(timer); sub.unsubscribe(); resolve();
        } else if (state === 'error') {
          clearTimeout(timer); sub.unsubscribe();
          reject(new Error('Rejestracja SIP nie powiodła się. Sprawdź token PBX.'));
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
    this.keepaliveTick = 0;
    await this.hangup();
    await this.registerer?.unregister();
    await this.ua?.stop();
    this.ua = null;
    this.registerer = null;
    this.regState$.next('idle');
    this.clearCall();
  }

  // ─── Prywatne ──────────────────────────────────────────────────────────────

  private showIncomingAlert(displayName: string, number: string): void {
    this.startRingtone();
    this.startTitleBlink(displayName);

    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    this.incomingNotif?.close();

    const body = `${displayName}${displayName !== number ? ' (' + number + ')' : ''}`;

    // Chrome bez Service Workera nie pokazuje popup'u systemowego przez new Notification().
    // Użyj SW jeśli jest zarejestrowany, w p.p. fallback na new Notification().
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg =>
        reg.showNotification('📲 Połączenie przychodzące', {
          body,
          icon:               '/favicon.ico',
          tag:                'incoming-call',
          requireInteraction: true,
          silent:             true,
        })
      ).catch(err => console.error('[PBX] SW notification failed:', err));
    } else {
      try {
        this.incomingNotif = new Notification('📲 Połączenie przychodzące', {
          body,
          icon:   '/favicon.ico',
          tag:    'incoming-call',
          silent: true,
        });
        this.incomingNotif.onerror = (e) => console.error('[PBX] Notification error:', e);
        this.incomingNotif.onclick = () => {
          window.focus();
          this.incomingNotif?.close();
          this.incomingNotif = null;
        };
      } catch (err) {
        console.error('[PBX] Notification constructor failed:', err);
      }
    }
  }

  private clearIncomingAlert(): void {
    this.stopRingtone();
    this.stopTitleBlink();
    this.incomingNotif?.close();
    this.incomingNotif = null;
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg =>
        reg.getNotifications({ tag: 'incoming-call' })
      ).then(notifs => notifs.forEach(n => n.close())).catch(() => {});
    }
  }

  private startTitleBlink(displayName: string): void {
    this.stopTitleBlink();
    this.originalTitle = document.title;
    let on = true;
    this.titleBlinkInterval = setInterval(() => {
      document.title = on ? `📲 ${displayName} dzwoni...` : this.originalTitle;
      on = !on;
    }, 800);
  }

  private stopTitleBlink(): void {
    if (this.titleBlinkInterval) {
      clearInterval(this.titleBlinkInterval);
      this.titleBlinkInterval = null;
    }
    document.title = this.originalTitle || document.title;
  }

  private startRingtone(): void {
    this.stopRingtone();
    try {
      const ctx = new AudioContext();
      this.ringtoneCtx = ctx;

      // Symuluje dwutonowy dzwonek telefoniczny (440 Hz + 480 Hz) — jak PSTN ring
      const pulse = () => {
        if (!this.ringtoneCtx) return;
        const g = ctx.createGain();
        g.connect(ctx.destination);

        [440, 480].forEach(freq => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = freq;
          osc.connect(g);
          osc.start();
          osc.stop(ctx.currentTime + 2); // 2s dzwoni
        });

        // Envelope: fade in/out żeby uniknąć kliknięć
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
        g.gain.setValueAtTime(0.15, ctx.currentTime + 1.9);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + 2);
      };

      pulse();
      // Powtarzaj co 4s (2s dzwoni, 2s cicho)
      const id = setInterval(() => { if (this.ringtoneCtx) pulse(); else clearInterval(id); }, 4_000);
      // Przechowaj id w ctx żeby móc anulować
      (ctx as any).__ringId = id;
    } catch { /* Web Audio niedostępne — ignoruj */ }
  }

  private stopRingtone(): void {
    if (this.ringtoneCtx) {
      clearInterval((this.ringtoneCtx as any).__ringId);
      this.ringtoneCtx.close().catch(() => {});
      this.ringtoneCtx = null;
    }
    this.ringtoneNode = null;
  }

  private handleIncomingInvite(invitation: Invitation): void {
    const existing = this.activeCall$.value;
    if (existing) {
      if (existing.phase !== 'post-call') {
        // Aktywna rozmowa lub dzwonienie — linia zajęta
        void invitation.reject({ statusCode: 486 });
        return;
      }
      // Post-call (formularz notatki): zwalniamy linię dla nowego połączenia
      this.activeCall$.next(null);
    }
    const user  = invitation.remoteIdentity.uri.user || 'nieznany';
    const dname = invitation.remoteIdentity.displayName?.trim() || user;

    this.showIncomingAlert(dname, user);

    const coreTelCallId = invitation.request.getHeader('X-CoreTel-Call-ID')?.trim() || undefined;

    this.activeCall$.next({
      session:        invitation,
      direction:      'inbound',
      number:         user,
      displayName:    dname,
      phase:          'incoming',
      startedAt:      null,
      muted:          false,
      durationSec:    0,
      context:        {},
      contextLoading: true,
      callId:         coreTelCallId,
    });

    invitation.stateChange.addListener((state) => this.zone.run(() => this.onSessionState(invitation, state)));

    // Szukaj dzwoniącego numeru w leadach i partnerach
    this.crmApi.lookupByPhone(user).subscribe({
      next: (result) => this.zone.run(() => {
        const call = this.activeCall$.value;
        if (!call || call.session !== invitation) return;
        const context: CallContext = result.found ? {
          entityType:  result.type,
          entityId:    result.id,
          companyName: result.company_name ?? null,
          nip:         result.nip ?? null,
          city:        result.city ?? null,
        } : {};
        this.activeCall$.next({ ...call, context, contextLoading: false });
      }),
      error: () => this.zone.run(() => {
        const call = this.activeCall$.value;
        if (call?.session === invitation) {
          this.activeCall$.next({ ...call, contextLoading: false });
        }
      }),
    });
  }

  private onSessionState(session: Session, state: SessionState): void {
    const call = this.activeCall$.value;
    if (!call || call.session !== session) return;

    if (state === SessionState.Establishing) {
      if (session instanceof Invitation) {
        // Połączenie przychodzące zaakceptowane — zamknij alert i przejdź do ringing
        this.clearIncomingAlert();
        this.activeCall$.next({ ...call, phase: 'ringing' });
      } else {
        // Outbound: Establishing strzela gdy INVITE wysłany (przed 183).
        // SIP.js w trybie standardowym ignoruje SDP z 183 (signalingState=HaveLocalOffer).
        // Graj lokalne pseudo-ringback; jeśli addtrack przyjdzie (earlyMedia przez centralkę),
        // zastąp prawdziwym audio z centrali.
        this.startOutboundRingback();
        const handler = session.sessionDescriptionHandler as Web.SessionDescriptionHandler;
        const stream  = handler?.remoteMediaStream;
        if (stream) {
          stream.addEventListener('addtrack', () => {
            this.stopOutboundRingback();
            if (!this.remoteAudio) {
              this.remoteAudio = document.createElement('audio');
              this.remoteAudio.autoplay = true;
              this.remoteAudio.setAttribute('playsinline', 'true');
              document.body.appendChild(this.remoteAudio);
            }
            this.remoteAudio.srcObject = stream;
            void this.remoteAudio.play().catch(err =>
              console.error('[PBX] early media play() odrzucone:', err)
            );
          }, { once: true });
        }
      }
    } else if (state === SessionState.Established) {
      this.clearIncomingAlert();
      this.stopOutboundRingback();
      this.attachRemoteAudio(session);
      this.attachIceListener(session);
      this.startTimer();
      this.activeCall$.next({ ...call, phase: 'active', startedAt: new Date(), dtmfBuffer: '' });
    } else if (state === SessionState.Terminated) {
      this.clearIncomingAlert();
      this.stopOutboundRingback();
      this.stopTimer();
      this.clearRemoteAudio();
      // Formularz notatki tylko gdy połączenie było faktycznie zestawione (startedAt ustawiony w Established).
      // Odrzucone INVITEy (486), anulowane przed odebraniem, odrzucone przychodzące → czyść od razu.
      if (call.startedAt !== null) {
        this.saveCallLog(call, 'answered');
        this.activeCall$.next({ ...call, phase: 'post-call' });
      } else {
        // Określ status dla nieodebranego/odrzuconego
        const unansweredStatus = this.deriveUnansweredStatus(call);
        this.saveCallLog(call, unansweredStatus);
        this.activeCall$.next(null);
      }
    }
  }

  private deriveUnansweredStatus(call: ActiveCall): 'missed' | 'not_answered' | 'rejected' | 'error' {
    if (call.phase === 'incoming') return 'missed';
    if (call.phase === 'dialing' || call.phase === 'ringing') return 'not_answered';
    return 'rejected';
  }

  private saveCallLog(
    call: ActiveCall,
    status: 'answered' | 'missed' | 'not_answered' | 'rejected' | 'error',
  ): void {
    const nip = call.context?.nip ?? null;
    const payload = {
      direction:    call.direction,
      status,
      caller_number: call.direction === 'outbound' ? undefined : call.number,
      callee_number: call.direction === 'outbound' ? call.number : undefined,
      nip,
      duration_sec:  call.durationSec ?? 0,
      started_at:    call.startedAt?.toISOString() ?? new Date().toISOString(),
      ended_at:      new Date().toISOString(),
      lead_id:    call.context?.entityType === 'lead'    ? Number(call.context.entityId) : undefined,
      partner_id: call.context?.entityType === 'partner' ? Number(call.context.entityId) : undefined,
    };
    this.crmApi.postCallLog(payload).subscribe({
      error: err => console.warn('[PBX call-log] zapis nieudany:', err.message),
    });
  }

  private updatePhase(phase: CallUiPhase): void {
    const call = this.activeCall$.value;
    if (call) this.activeCall$.next({ ...call, phase });
  }

  private startTimer(): void {
    this.stopTimer();
    this.durationInterval = setInterval(() => {
      const call = this.activeCall$.value;
      if (call?.phase === 'active') {
        this.activeCall$.next({ ...call, durationSec: call.durationSec + 1 });
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
  }

  private attachIceListener(session: Session): void {
    try {
      const handler = session.sessionDescriptionHandler as Web.SessionDescriptionHandler;
      const pc = handler?.peerConnection;
      if (!pc) return;

      const logIce = () => {
        const ice  = pc.iceConnectionState;
        if (ice === 'failed' || ice === 'disconnected') {
          this.zone.run(() => this.micError$.next('Brak połączenia audio (ICE failed). Sprawdź sieć lub skontaktuj się z administratorem.'));
        }
      };

      pc.addEventListener('iceconnectionstatechange', logIce);
      logIce();
    } catch { /* diagnostic — nie przerywaj rozmowy */ }
  }

  private buildTarget(number: string) {
    if (!this.sipUri) return undefined;
    const hasPlus = number.trimStart().startsWith('+');
    const digits  = number.replace(/\D/g, '');

    let normalized: string;
    if (hasPlus) {
      normalized = '+' + digits;                  // +48600123456 → +48600123456
    } else if (digits.startsWith('00') && digits.length > 11) {
      normalized = '+' + digits.slice(2);         // 0048600123456 → +48600123456
    } else if (digits.length === 9) {
      normalized = '+48' + digits;                // 600123456 → +48600123456
    } else {
      normalized = digits;                        // inne formaty bez zmian
    }

    if (!normalized) return undefined;
    const auth = this.sipUri.port ? `${this.sipUri.host}:${this.sipUri.port}` : this.sipUri.host;
    return UserAgent.makeURI(`sip:${normalized}@${auth}`);
  }

  private attachRemoteAudio(session: Session): void {
    const handler = session.sessionDescriptionHandler as Web.SessionDescriptionHandler;
    const stream  = handler?.remoteMediaStream;
    if (!stream) {
      console.error('[PBX] remoteMediaStream jest null po Established — klient nie będzie słyszany.');
      return;
    }
    if (!this.remoteAudio) {
      this.remoteAudio = document.createElement('audio');
      this.remoteAudio.autoplay = true;
      this.remoteAudio.setAttribute('playsinline', 'true');
      document.body.appendChild(this.remoteAudio);
    }
    this.remoteAudio.srcObject = stream;
    void this.remoteAudio.play().catch((err) => {
      console.error('[PBX] remoteAudio.play() odrzucone przez przeglądarkę:', err);
    });
  }

  private static readonly DTMF_FREQS: Record<string, [number, number]> = {
    '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
    '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
  };

  sendDtmf(tone: string): void {
    const call = this.activeCall$.value;
    if (!call || call.phase !== 'active') return;
    const session = call.session;

    // Lokalny dźwięk DTMF (feedback dla usera — centrala go nie słyszy)
    this.playDtmfTone(tone);

    // Aktualizuj bufor cyfr widoczny w UI
    this.activeCall$.next({ ...call, dtmfBuffer: (call.dtmfBuffer ?? '') + tone });

    // RFC 2833: in-band via WebRTC DTMFSender (Asterisk obsługuje telephone-event/48000)
    try {
      const handler    = session.sessionDescriptionHandler as Web.SessionDescriptionHandler;
      const pc         = handler?.peerConnection;
      const sender     = pc?.getSenders().find(s => s.track?.kind === 'audio');
      const dtmfSender = (sender as any)?.dtmf as RTCDTMFSender | undefined;
      if (dtmfSender) {
        dtmfSender.insertDTMF(tone, 160, 40);
        return;
      }
    } catch { /* fall through */ }

    // Fallback: SIP INFO (RFC 2976)
    session.info({
      requestOptions: {
        body: {
          contentDisposition: 'render',
          contentType: 'application/dtmf-relay',
          content: `Signal=${tone}\r\nDuration=160`,
        },
      },
    }).catch(err => console.error('[PBX DTMF] błąd SIP INFO:', err));
  }

  private playDtmfTone(tone: string): void {
    const freqs = PbxService.DTMF_FREQS[tone];
    if (!freqs) return;
    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.16);
      gain.connect(ctx.destination);
      freqs.forEach(freq => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        osc.start();
        osc.stop(ctx.currentTime + 0.16);
      });
      // zamknij context po zakończeniu tonu
      setTimeout(() => ctx.close().catch(() => {}), 300);
    } catch { /* Web Audio niedostępne */ }
  }

  private startOutboundRingback(): void {
    this.stopOutboundRingback();
    try {
      const ctx = new AudioContext();
      this.outboundRingbackCtx = ctx;
      // Europejski sygnał odgłosu dzwonienia: 425 Hz, 1s ON / 4s OFF
      const pulse = () => {
        if (!this.outboundRingbackCtx) return;
        const g = ctx.createGain();
        g.connect(ctx.destination);
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 425;
        osc.connect(g);
        osc.start();
        osc.stop(ctx.currentTime + 1);
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.02);
        g.gain.setValueAtTime(0.1, ctx.currentTime + 0.95);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
      };
      pulse();
      const id = setInterval(() => { if (this.outboundRingbackCtx) pulse(); else clearInterval(id); }, 5_000);
      (ctx as any).__ringId = id;
    } catch { /* Web Audio niedostępne */ }
  }

  private stopOutboundRingback(): void {
    if (this.outboundRingbackCtx) {
      clearInterval((this.outboundRingbackCtx as any).__ringId);
      try { this.outboundRingbackCtx.close(); } catch {}
      this.outboundRingbackCtx = null;
    }
  }

  private clearRemoteAudio(): void {
    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
    }
  }
}
