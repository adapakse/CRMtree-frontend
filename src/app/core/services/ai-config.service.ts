import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/** One AI provider the tenant can pick, as the backend registry describes it. */
export interface AiProviderOption {
  key: string;
  label: string;
  suggested_fast: string;
  suggested_quality: string;
  keys_url: string;
}

/**
 * The tenant's saved AI configuration. The API key itself is never returned —
 * only `api_key_hint` (its last 4 characters), so the admin can tell a saved key
 * from none and recognise which key it is.
 */
export interface AiConfig {
  provider: string;
  api_key_hint: string;
  model_fast: string;
  model_quality: string | null;
  base_url: string | null;
  status: 'active' | 'invalid' | 'error';
  last_error: string | null;
  last_checked_at: string | null;
  updated_at: string;
  updated_by_name: string | null;
}

export interface AiConfigResponse {
  /** null = tenant has no AI configured, so every AI feature is off for them. */
  config: AiConfig | null;
  providers: AiProviderOption[];
}

@Injectable({ providedIn: 'root' })
export class AiConfigService {
  private http = inject(HttpClient);

  get() {
    return this.http.get<AiConfigResponse>(`${environment.apiUrl}/admin/settings/ai`);
  }

  /**
   * Saves provider, key and models. `api_key` may be omitted when only the model
   * changes — the backend keeps the stored key (and never hands it back, so the
   * admin could not resend it anyway). The key and both models are verified
   * against the provider before anything is written.
   */
  save(payload: {
    provider: string;
    api_key?: string | null;
    model_fast: string;
    model_quality?: string | null;
    base_url?: string | null;
  }) {
    return this.http.put<{ config: AiConfig }>(`${environment.apiUrl}/admin/settings/ai`, payload);
  }

  /** Re-verifies the stored key against the provider and refreshes `status`. */
  recheck() {
    return this.http.post<{ status: string; last_error: string | null }>(
      `${environment.apiUrl}/admin/settings/ai/recheck`, {},
    );
  }

  /** Removes the configuration — turns every AI feature off for the tenant. */
  remove() {
    return this.http.delete<{ deleted: boolean }>(`${environment.apiUrl}/admin/settings/ai`);
  }
}
