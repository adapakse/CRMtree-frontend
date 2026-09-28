import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface BlogPostSummary {
  id: number;
  title: string;
  slug: string;
  meta_description: string;
  category: string | null;
  pillar_slug: string | null;
  header_image_url: string | null;
  published_at: string;
  reading_minutes: number;
  author_name: string | null;
  author_job_title: string | null;
  author_photo_url: string | null;
}

export interface BlogFaqItem {
  question: string;
  answer: string;
}

export interface BlogPost extends BlogPostSummary {
  body: string;
  updated_at: string;
  faq: BlogFaqItem[] | null;
  author_bio: string | null;
  author_linkedin_url: string | null;
}

export interface BlogPillarSummary {
  id: number;
  name: string;
  description: string;
  slug: string;
  article_count: number;
}

export interface BlogPillarDetail extends BlogPillarSummary {
  articles: BlogPostSummary[];
}

@Injectable({ providedIn: 'root' })
export class PublicBlogService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  list(locale: 'pl' | 'en' = 'pl'): Observable<BlogPostSummary[]> {
    return this.http.get<BlogPostSummary[]>(`${this.api}/public/blog`, { params: { locale } });
  }

  bySlug(slug: string, locale: 'pl' | 'en' = 'pl'): Observable<BlogPost> {
    return this.http.get<BlogPost>(`${this.api}/public/blog/${slug}`, { params: { locale } });
  }

  pillars(locale: 'pl' | 'en' = 'pl'): Observable<BlogPillarSummary[]> {
    return this.http.get<BlogPillarSummary[]>(`${this.api}/public/blog/pillars`, { params: { locale } });
  }

  pillarBySlug(slug: string, locale: 'pl' | 'en' = 'pl'): Observable<BlogPillarDetail> {
    return this.http.get<BlogPillarDetail>(`${this.api}/public/blog/pillar/${slug}`, { params: { locale } });
  }
}
