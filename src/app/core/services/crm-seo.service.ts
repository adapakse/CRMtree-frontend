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
  author_id: number | null;
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

export interface SeoAuthor {
  id: number;
  full_name: string;
  job_title: string | null;
  bio: string | null;
  photo_url: string | null;
  linkedin_url: string | null;
  is_active: boolean;
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

export type SocialPlatform = 'linkedin' | 'facebook' | 'instagram' | 'wordpress';

export interface SocialAccount {
  platform: SocialPlatform;
  account_name: string | null;
  connected_at: string;
}

export interface SocialPost {
  platform: SocialPlatform;
  status: 'draft' | 'queued' | 'published' | 'failed';
  body: string | null;
  remote_url: string | null;
  error_message: string | null;
  published_at: string | null;
}

export interface TenantSettings {
  business_description: string | null;
  industry_vertical: string | null;
  seo_gsc_site_url: string | null;
}

export interface TenantSettingsResponse extends TenantSettings {
  /** Read-only — the connected WordPress site's URL, used only as a prefill suggestion. */
  wordpress_site_url: string | null;
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

  update(id: number, patch: Partial<Pick<SeoContent, 'title' | 'body' | 'meta_description' | 'header_image_url' | 'scheduled_at' | 'author_id'>>): Observable<SeoContent> {
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

  addPillar(name: string, description: string, targetKeywordTheme: string): Observable<SeoPillar> {
    return this.http.post<SeoPillar>(`${this.api}/pillars`, { name, description, target_keyword_theme: targetKeywordTheme });
  }

  updatePillar(id: number, patch: Partial<Pick<SeoPillar, 'name' | 'description' | 'target_keyword_theme'>>): Observable<SeoPillar> {
    return this.http.patch<SeoPillar>(`${this.api}/pillars/${id}`, patch);
  }

  deletePillar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/pillars/${id}`);
  }

  authors(): Observable<SeoAuthor[]> {
    return this.http.get<SeoAuthor[]>(`${this.api}/authors`);
  }

  addAuthor(author: Pick<SeoAuthor, 'full_name' | 'job_title' | 'bio' | 'photo_url' | 'linkedin_url'>): Observable<SeoAuthor> {
    return this.http.post<SeoAuthor>(`${this.api}/authors`, author);
  }

  updateAuthor(id: number, patch: Partial<Pick<SeoAuthor, 'full_name' | 'job_title' | 'bio' | 'photo_url' | 'linkedin_url' | 'is_active'>>): Observable<SeoAuthor> {
    return this.http.patch<SeoAuthor>(`${this.api}/authors/${id}`, patch);
  }

  deleteAuthor(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/authors/${id}`);
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

  socialAccounts(): Observable<SocialAccount[]> {
    return this.http.get<SocialAccount[]>(`${this.api}/social/accounts`);
  }

  disconnectSocialAccount(platform: SocialPlatform): Observable<void> {
    return this.http.delete<void>(`${this.api}/social/accounts/${platform}`);
  }

  linkedinAuthUrl(): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.api}/social/linkedin/oauth/url`);
  }

  facebookAuthUrl(): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.api}/social/facebook/oauth/url`);
  }

  articleSocialPosts(id: number): Observable<SocialPost[]> {
    return this.http.get<SocialPost[]>(`${this.api}/content/${id}/social-posts`);
  }

  updateSocialPost(id: number, platform: SocialPlatform, body: string): Observable<SocialPost> {
    return this.http.patch<SocialPost>(`${this.api}/content/${id}/social-posts/${platform}`, { body });
  }

  retrySocialPost(id: number, platform: SocialPlatform): Observable<SocialPost> {
    return this.http.post<SocialPost>(`${this.api}/content/${id}/social-posts/${platform}/retry`, {});
  }

  connectWordpress(siteUrl: string, username: string, appPassword: string): Observable<{ connected: boolean }> {
    return this.http.post<{ connected: boolean }>(`${this.api}/social/wordpress/connect`, { site_url: siteUrl, username, app_password: appPassword });
  }

  tenantSettings(): Observable<TenantSettingsResponse> {
    return this.http.get<TenantSettingsResponse>(`${this.api}/tenant-settings`);
  }

  updateTenantSettings(patch: Partial<TenantSettings>): Observable<TenantSettings> {
    return this.http.patch<TenantSettings>(`${this.api}/tenant-settings`, patch);
  }

  wordpressPublishMode(): Observable<{ wordpress_publish_mode: 'draft' | 'publish' }> {
    return this.http.get<{ wordpress_publish_mode: 'draft' | 'publish' }>(`${this.api}/tenant-settings/wordpress-publish-mode`);
  }

  setWordpressPublishMode(mode: 'draft' | 'publish'): Observable<{ wordpress_publish_mode: 'draft' | 'publish' }> {
    return this.http.patch<{ wordpress_publish_mode: 'draft' | 'publish' }>(`${this.api}/tenant-settings/wordpress-publish-mode`, { wordpress_publish_mode: mode });
  }
}
