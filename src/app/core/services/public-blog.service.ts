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
  header_image_url: string | null;
  published_at: string;
  reading_minutes: number;
}

export interface BlogPost extends BlogPostSummary {
  body: string;
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
}
