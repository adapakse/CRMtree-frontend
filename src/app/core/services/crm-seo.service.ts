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

  update(id: number, patch: Partial<Pick<SeoContent, 'title' | 'body' | 'meta_description' | 'header_image_url'>>): Observable<SeoContent> {
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
}
