import { Injectable, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TranslocoService } from '@jsverse/transloco';
import { environment } from '../../../environments/environment';
import { AppSettingsService, LeadStageConfig } from './app-settings.service';

/**
 * Lead stages of the current tenant — the single place the UI asks "what stages
 * exist, what are they called, what colour and probability do they have".
 *
 * Stages used to be hardcoded in every component (KANBAN_STAGES, PROB_MAP,
 * literal <option> lists, `.stage-*` CSS classes). They are now configurable per
 * tenant, so a component must never list them itself.
 *
 * Label resolution, in order:
 *   1. the tenant's own name (`label`) — wins in EVERY language, because tenant
 *      data is not translated;
 *   2. the built-in translation `crm.labels.stages.<key>`, for stages the tenant
 *      has not renamed;
 *   3. the raw key, so an unknown stage still renders as something.
 */
@Injectable({ providedIn: 'root' })
export class LeadStagesService {
  private http = inject(HttpClient);
  private transloco = inject(TranslocoService);
  private appSettings = inject(AppSettingsService);

  /** Every stage of the tenant, ordered — including inactive ones, because a lead may still sit on one. */
  readonly all = computed(() => this.appSettings.leadStages());

  /** Funnel stages — the kanban columns. */
  readonly funnel = computed(() => this.all().filter(s => s.active && s.kind === 'open'));

  /** Stages a user can pick by hand: funnel + won + lost (no conversion/archive states). */
  readonly selectable = computed(() =>
    this.all().filter(s => s.active && (s.kind === 'open' || s.kind === 'won' || s.kind === 'lost')),
  );

  /** Stages offered when creating a lead — closing a brand-new lead makes no sense. */
  readonly creatable = computed(() => this.funnel());

  /**
   * Key of the won / lost stage, or null when the tenant removed it. There is no
   * fallback to 'closed_won' on purpose: a tenant that does not settle deals has
   * no such stage, and pretending otherwise would make every won-based number
   * read as zero instead of "not tracked here". Callers must handle null —
   * typically by hiding the tile, column or button rather than showing 0.
   */
  readonly wonKey = computed(() => this.all().find(s => s.kind === 'won')?.key ?? null);
  readonly lostKey = computed(() => this.all().find(s => s.kind === 'lost')?.key ?? null);

  /** True when the tenant settles deals at all — gates every won/lost-based view. */
  readonly tracksOutcome = computed(() => !!this.wonKey() || !!this.lostKey());

  private stage(key: string | null | undefined): LeadStageConfig | undefined {
    if (!key) return undefined;
    return this.all().find(s => s.key === key);
  }

  /**
   * The tenant's own name for a stage, or null when it has not renamed it.
   * Only for screens that have their own wording for a stage and need to know
   * whether the tenant has overridden it — otherwise use `label()`.
   */
  customLabel(key: string | null | undefined): string | null {
    return this.stage(key)?.label ?? null;
  }

  /** Display name of a stage. */
  label(key: string | null | undefined): string {
    if (!key) return '';
    const own = this.stage(key)?.label;
    if (own) return own;
    const translated = this.transloco.translate(`crm.labels.stages.${key}`);
    // Transloco echoes the key back when it has no entry — that happens for a
    // stage the tenant added, which simply has no built-in translation.
    return translated === `crm.labels.stages.${key}` ? key : translated;
  }

  /** Default win probability of a stage, used for the pipeline bar and weighted value. */
  probability(key: string | null | undefined): number {
    return this.stage(key)?.probability ?? 10;
  }

  color(key: string | null | undefined): string {
    return this.stage(key)?.color ?? '#94A3B8';
  }

  /** Background for a stage pill/badge — the stage colour at low opacity. */
  pillBackground(key: string | null | undefined): string {
    return `${this.color(key)}22`;
  }

  isWon(key: string | null | undefined): boolean {
    return !!key && this.stage(key)?.kind === 'won';
  }

  isLost(key: string | null | undefined): boolean {
    return !!key && this.stage(key)?.kind === 'lost';
  }

  isClosed(key: string | null | undefined): boolean {
    return this.isWon(key) || this.isLost(key);
  }

  // ── Admin panel (Ustawienia → Etapy leada) ──────────────────────────────

  /** Stages with lead counts — the panel needs them to explain what cannot be removed. */
  list() {
    return this.http.get<{ stages: LeadStageConfig[]; max_open_stages: number }>(
      `${environment.apiUrl}/admin/settings/lead-stages`,
    );
  }

  create(payload: { label: string; probability?: number | null; color?: string | null }) {
    return this.http.post<{ stage: LeadStageConfig }>(
      `${environment.apiUrl}/admin/settings/lead-stages`, payload,
    );
  }

  update(id: string, patch: Partial<Pick<LeadStageConfig, 'label' | 'probability' | 'color' | 'active'>>) {
    return this.http.patch<{ stage: LeadStageConfig }>(
      `${environment.apiUrl}/admin/settings/lead-stages/${id}`, patch,
    );
  }

  /**
   * Remove a stage. `moveLeadsTo` is required when leads still sit on it — the
   * backend moves them in the same transaction and refuses with 409 otherwise,
   * naming how many leads are in the way.
   */
  remove(id: string, moveLeadsTo?: string | null) {
    return this.http.delete<{ deleted: boolean; key: string; movedLeads: number; movedTo: string | null }>(
      `${environment.apiUrl}/admin/settings/lead-stages/${id}`,
      { body: moveLeadsTo ? { move_leads_to: moveLeadsTo } : {} },
    );
  }

  /** Push a fresh config into the app-wide signal so every screen picks it up without a reload. */
  applyToApp(stages: LeadStageConfig[]): void {
    this.appSettings.leadStages.set(stages);
  }
}
