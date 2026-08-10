// src/app/core/services/email-oauth-listener.service.ts
//
// Listens for the OAuth-result signal that crm/{gmail,outlook,zoho}/callback
// pages broadcast after Google/Microsoft/Zoho redirects back from the
// provider's consent screen. Three delivery mechanisms are raced because no
// single one is reliable across browsers/redirect flows: BroadcastChannel,
// a `storage` event on a `<provider>_oauth_connected` localStorage key, and
// `window.postMessage` to the opener.
//
// Provide this per-component (not providedIn: 'root') so each consumer gets
// its own listeners, torn down automatically via ngOnDestroy when the
// component is destroyed.

import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';

const OAUTH_CHANNEL_NAMES = ['gmail-oauth', 'outlook-oauth', 'zoho-oauth'];

@Injectable()
export class EmailOauthListenerService implements OnDestroy {
  private channels: BroadcastChannel[] = [];
  private resultSubject = new Subject<string>();
  readonly result$ = this.resultSubject.asObservable();

  private storageHandler = (e: StorageEvent): void => {
    if (e.key?.endsWith('_oauth_connected') && e.newValue) {
      localStorage.removeItem(e.key);
      this.resultSubject.next('connected');
    }
  };

  private messageHandler = (e: MessageEvent): void => {
    if (e.origin !== window.location.origin) return;
    if (typeof e.data?.type === 'string' && e.data.type.endsWith('-oauth-result')) {
      this.resultSubject.next(e.data.status);
    }
  };

  constructor() {
    for (const name of OAUTH_CHANNEL_NAMES) {
      try {
        const bc = new BroadcastChannel(name);
        bc.onmessage = (e) => {
          if (typeof e.data?.type === 'string' && e.data.type.endsWith('-oauth-result')) {
            this.resultSubject.next(e.data.status);
          }
        };
        this.channels.push(bc);
      } catch (_) { /* BroadcastChannel unsupported — storage/message fallbacks still work */ }
    }
    window.addEventListener('storage', this.storageHandler);
    window.addEventListener('message', this.messageHandler);
  }

  ngOnDestroy(): void {
    this.channels.forEach(bc => bc.close());
    this.channels = [];
    window.removeEventListener('storage', this.storageHandler);
    window.removeEventListener('message', this.messageHandler);
    this.resultSubject.complete();
  }
}
