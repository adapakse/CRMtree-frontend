import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * One AI provider the tenant can pick, as the backend registry describes it.
 * `unsupported_purposes` lets the panel grey a provider out for a function it
 * cannot serve, without asking the backend again.
 */
export interface AiProviderOption {
  key: string;
  label: string;
  keys_url: string;
  /** Default model per function — the placeholder shown when none is chosen. */
  default_models: Record<string, string>;
  unsupported_purposes: string[];
}

/**
 * One AI feature. `requires` names the provider capability it needs
 * (`webSearch` or `structuredOutput`), or null when any provider will do.
 */
export interface AiPurpose {
  key: string;
  requires: 'webSearch' | 'structuredOutput' | null;
  supported_by: string[];
}

/**
 * The saved configuration of ONE function. The API key itself is never
 * returned — only `api_key_hint` (its last 4 characters), so the admin can tell
 * a saved key from none and recognise which key it is.
 */
export interface AiConfig {
  purpose: string;
  provider: string;
  api_key_hint: string;
  /** null = the provider's default model for this function is used. */
  model: string | null;
  base_url: string | null;
  status: 'active' | 'invalid' | 'error';
  last_error: string | null;
  last_checked_at: string | null;
  updated_at: string;
  updated_by_name: string | null;
}

/** One model available on the tenant's account at a given provider. */
export interface AiModelOption {
  id: string;
  label: string;
}

export interface AiConfigResponse {
  /** Function → its configuration. A missing entry means that function is off. */
  config: Record<string, AiConfig>;
  providers: AiProviderOption[];
  purposes: AiPurpose[];
}

const BASE = `${environment.apiUrl}/admin/settings/ai`;

/**
 * Per-function AI configuration: every feature has its own provider, key and
 * model, so a tenant can run enrichment on a cheap provider and competitor
 * discovery on another.
 */
@Injectable({ providedIn: 'root' })
export class AiConfigService {
  private http = inject(HttpClient);

  get() {
    return this.http.get<AiConfigResponse>(BASE);
  }

  /**
   * Saves one function. `api_key` may be omitted when that provider already has
   * a key saved under any function — the backend reuses it. The key and the
   * model are verified against the provider before anything is written.
   */
  save(purpose: string, payload: {
    provider?: string | null;
    api_key?: string | null;
    model?: string | null;
    base_url?: string | null;
  }) {
    return this.http.put<{ config: AiConfig }>(`${BASE}/${purpose}`, payload);
  }

  /**
   * The models available on the tenant's account. With no `provider` the
   * backend recognises it from the key — confirmed against the provider, not
   * guessed from a prefix — and returns both, so pasting a key costs one call.
   * POST, not GET: the body may carry a freshly pasted key that must not end up
   * in a URL, access log or browser history.
   */
  models(payload: { provider?: string | null; api_key?: string | null; base_url?: string | null }) {
    return this.http.post<{ provider: string; models: AiModelOption[] }>(`${BASE}/models`, payload);
  }

  /** Turns one function off; the others keep working. */
  remove(purpose: string) {
    return this.http.delete<{ deleted: boolean; purpose: string }>(`${BASE}/${purpose}`);
  }
}
