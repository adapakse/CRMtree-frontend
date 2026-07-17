import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type SeoContentStatus =
  | 'draft' | 'in_review' | 'approved' | 'scheduled' | 'published' | 'needs_update' | 'archived';

export interface SeoContentSummary {
  id: number;
  locale: string;
  title: string;
  slug: string;
  status: SeoContentStatus;
  target_keyword: string | null;
  category: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  clicks_28d: number;
  impressions_28d: number;
  avg_position_28d: number | null;
}

export interface SeoContent extends SeoContentSummary {
  body: string;
  meta_description: string | null;
  header_image_url: string | null;
}

export interface GscStatus {
  connected: boolean;
  site_url?: string;
  connected_at?: string;
}

export interface SeoPillar {
  id: number;
  name: string;
  description: string;
  target_keyword_theme: string;
  priority: number;
  article_count: number;
}

export interface SeoCompetitor {
  id: number;
  url: string;
  notes: string | null;
  created_at: string;
}

export interface SeoInternalLink {
  id: number;
  status: string;
  to_content_id: number;
  to_title: string;
  to_slug: string;
}

export interface SeoBacklink {
  id: number;
  status: 'suggested' | 'accepted' | 'rejected';
  tenant_id: string;
  partner_tenant_id: string;
  created_at: string;
  from_title: string;
  from_slug: string;
  to_title: string;
  to_slug: string;
}

@Injectable({ providedIn: 'root' })
export class CrmSeoService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/crm/seo`;

  list(status?: SeoContentStatus): Observable<SeoContentSummary[]> {
    return this.http.get<SeoContentSummary[]>(`${this.api}/content`, {
      params: status ? { status } : {},
    });
  }

  get(id: number): Observable<SeoContent> {
    return this.http.get<SeoContent>(`${this.api}/content/${id}`);
  }

  update(id: number, patch: Partial<Pick<SeoContent, 'title' | 'body' | 'meta_description' | 'header_image_url' | 'scheduled_at'>>): Observable<SeoContent> {
    return this.http.patch<SeoContent>(`${this.api}/content/${id}`, patch);
  }

  generate(): Observable<SeoContent> {
    return this.http.post<SeoContent>(`${this.api}/content/generate`, {});
  }

  rerollImage(id: number): Observable<SeoContent> {
    return this.http.post<SeoContent>(`${this.api}/content/${id}/reroll-image`, {});
  }

  approve(id: number): Observable<SeoContent> {
    return this.http.post<SeoContent>(`${this.api}/content/${id}/approve`, {});
  }

  reject(id: number, note?: string): Observable<SeoContent> {
    return this.http.post<SeoContent>(`${this.api}/content/${id}/reject`, { note });
  }

  unpublish(id: number): Observable<SeoContent> {
    return this.http.post<SeoContent>(`${this.api}/content/${id}/unpublish`, {});
  }

  pillars(): Observable<SeoPillar[]> {
    return this.http.get<SeoPillar[]>(`${this.api}/pillars`);
  }

  gscStatus(): Observable<GscStatus> {
    return this.http.get<GscStatus>(`${this.api}/gsc/status`);
  }

  gscAuthUrl(): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.api}/gsc/oauth/url`);
  }

  gscSync(): Observable<{ synced: boolean }> {
    return this.http.post<{ synced: boolean }>(`${this.api}/gsc/sync`, {});
  }

  competitors(): Observable<SeoCompetitor[]> {
    return this.http.get<SeoCompetitor[]>(`${this.api}/competitors`);
  }

  addCompetitor(url: string, notes?: string): Observable<SeoCompetitor> {
    return this.http.post<SeoCompetitor>(`${this.api}/competitors`, { url, notes });
  }

  deleteCompetitor(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/competitors/${id}`);
  }

  internalLinks(id: number): Observable<SeoInternalLink[]> {
    return this.http.get<SeoInternalLink[]>(`${this.api}/content/${id}/internal-links`);
  }

  backlinks(): Observable<SeoBacklink[]> {
    return this.http.get<SeoBacklink[]>(`${this.api}/backlinks`);
  }

  backlinksOptIn(): Observable<{ opt_in: boolean }> {
    return this.http.get<{ opt_in: boolean }>(`${this.api}/backlinks/opt-in`);
  }

  setBacklinksOptIn(optIn: boolean): Observable<{ opt_in: boolean }> {
    return this.http.post<{ opt_in: boolean }>(`${this.api}/backlinks/opt-in`, { opt_in: optIn });
  }

  findBacklinkCandidates(): Observable<SeoBacklink[]> {
    return this.http.post<SeoBacklink[]>(`${this.api}/backlinks/find-candidates`, {});
  }

  acceptBacklink(id: number): Observable<SeoBacklink> {
    return this.http.post<SeoBacklink>(`${this.api}/backlinks/${id}/accept`, {});
  }

  rejectBacklink(id: number): Observable<SeoBacklink> {
    return this.http.post<SeoBacklink>(`${this.api}/backlinks/${id}/reject`, {});
  }
}
