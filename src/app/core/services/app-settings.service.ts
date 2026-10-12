import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { firstValueFrom } from 'rxjs';

export interface AppSettingsMeta {
  key: string;
  value: string;
  label: string;
  description: string;
  value_type: 'number' | 'boolean' | 'string' | 'json';
  category: string;
  updated_at: string;
  updated_by_name: string | null;
}

/**
 * One configurable lead stage of the tenant (backend: tenant_lead_stages).
 * `key` is immutable and is what sits in the lead's `stage` field; `label` is
 * the tenant's own name for it, or null when the built-in translation
 * (`crm.labels.stages.<key>`) should be used. Resolve labels through
 * LeadStagesService, never by reading `label` directly.
 */
export interface LeadStageConfig {
  id: string | null;
  key: string;
  label: string | null;
  /**
   * What the stage IS, not whether it may be changed — there are no "system"
   * stages. `open` is a funnel step, `won`/`lost` are closings (both fully
   * removable), `converted`/`archived` are states the app writes itself
   * (converting a lead to a partner, archiving it) and so cannot be removed,
   * though they can be renamed.
   */
  kind: 'open' | 'won' | 'lost' | 'converted' | 'archived';
  probability: number | null;
  color: string | null;
  active: boolean;
  sort_order: number;
  lead_count?: number;
  /** Stage the leads of this stage move to if it gets removed (server-computed). */
  delete_target_key?: string | null;
}

export interface AppSettings {
  expiration_red_days:            number;
  expiration_soon_days:           number;
  kanban_refresh_interval_sec:    number;
  default_page_size:              number;
  roles_preview_count:            number;
  lead_attachments_folder_url:    string;
  crm_training_mode:              boolean;
  'prospect.icp_blacklist_keywords': string;   // JSON array of strings (value_type 'json' — GET zwraca surowy string)
  'prospect.icp_blacklist_penalty':  number;
  [key: string]: number | boolean | string;
}

const DEFAULTS: AppSettings = {
  expiration_red_days:            90,
  expiration_soon_days:           30,
  kanban_refresh_interval_sec:    0,
  default_page_size:              50,
  roles_preview_count:            3,
  lead_attachments_folder_url:    '',
  crm_training_mode:              false,
  'prospect.icp_blacklist_keywords': '["hurtow","sprzedaż hurtowa","handel hurtowy","dystrybucja hurtowa"]',
  'prospect.icp_blacklist_penalty':  15,
};

@Injectable({ providedIn: 'root' })
export class AppSettingsService {
  private http = inject(HttpClient);

  /** Reactive flat settings map — components can read directly */
  readonly settings = signal<AppSettings>({ ...DEFAULTS });

  /** Full meta rows — used by the admin settings panel */
  readonly meta = signal<AppSettingsMeta[]>([]);

  /**
   * Configurable lead stages of the tenant, ordered. Rides along with the
   * settings payload because every CRM screen needs stage names, and this is
   * the one request the app already makes for every signed-in user. Read it
   * through LeadStagesService.
   */
  readonly leadStages = signal<LeadStageConfig[]>([]);

  private loaded = false;

  /** Called once during app initialisation (see app.config.ts) */
  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const res = await firstValueFrom(
        this.http.get<{ settings: AppSettings; meta: AppSettingsMeta[]; lead_stages?: LeadStageConfig[] }>(
          `${environment.apiUrl}/admin/settings`
        )
      );
      this.settings.set({ ...DEFAULTS, ...res.settings });
      this.meta.set(res.meta);
      if (res.lead_stages) this.leadStages.set(res.lead_stages);
      this.loaded = true;
    } catch {
      // Non-fatal — fall back to defaults (e.g. before login)
    }
  }

  /** Reload after save */
  async reload(): Promise<void> {
    this.loaded = false;
    await this.load();
  }

  /** Convenience getter — always returns a safe value */
  get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.settings()[key] ?? (DEFAULTS[key] as AppSettings[K]);
  }

  /** Save one or more settings. Returns updated settings. Admin only. */
  save(updates: Partial<AppSettings>) {
    return this.http.put<{ settings: AppSettings; meta: AppSettingsMeta[] }>(
      `${environment.apiUrl}/admin/settings`,
      updates
    );
  }

  // ── Helpers used across components ──────────────────────────────────────

  /**
   * Returns CSS color string for a given expiration date:
   *   > expiration_red_days away   → '' (inherit / black)
   *   ≤ expiration_red_days away   → '#DC2626' (red)
   *   already expired              → '#DC2626' (red)
   */
  expirationColor(dateStr?: string | null): string {
    if (!dateStr) return '';
    const daysLeft = (new Date(dateStr).getTime() - Date.now()) / 86_400_000;
    const threshold = this.get('expiration_red_days');
    return daysLeft <= threshold ? '#DC2626' : '';
  }

  /**
   * True when document is expiring soon (within expiration_soon_days).
   */
  isExpiringSoon(dateStr?: string | null): boolean {
    if (!dateStr) return false;
    const daysLeft = (new Date(dateStr).getTime() - Date.now()) / 86_400_000;
    return daysLeft >= 0 && daysLeft <= this.get('expiration_soon_days');
  }

  isExpired(dateStr?: string | null): boolean {
    if (!dateStr) return false;
    return new Date(dateStr).getTime() < Date.now();
  }
}
