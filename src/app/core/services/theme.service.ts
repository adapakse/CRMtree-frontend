import { Injectable, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'theme_mode';

export function readStoredThemeMode(): ThemeMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Light or dark theme, applied as <html data-theme="…"> and kept in this browser. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);

  readonly mode = signal<ThemeMode>(readStoredThemeMode());

  constructor() {
    effect(() => this.doc.documentElement.setAttribute('data-theme', this.mode()));
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch { /* storage blocked: the choice lasts only for this page view */ }
  }
}
