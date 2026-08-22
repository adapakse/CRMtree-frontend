import { Injectable, signal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

export interface NavBackContext {
  label: string;
  route: any[];
  queryParams?: Record<string, string>;
  targetUrlPrefix: string;
}

@Injectable({ providedIn: 'root' })
export class NavBackService {
  private _ctx = signal<NavBackContext | null>(null);
  readonly ctx = this._ctx.asReadonly();

  constructor(router: Router) {
    router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((e: any) => {
      const ctx = this._ctx();
      if (ctx && !e.urlAfterRedirects.startsWith(ctx.targetUrlPrefix)) {
        this._ctx.set(null);
      }
    });
  }

  set(ctx: NavBackContext) { this._ctx.set(ctx); }
  clear() { this._ctx.set(null); }
}
