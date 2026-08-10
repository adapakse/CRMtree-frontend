import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { PublicBlogService, BlogPostSummary } from '../../../core/services/public-blog.service';
import { SeoService } from '../../../core/services/seo.service';

@Component({
  selector: 'wt-blog-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe],
  template: `
    <section class="blog-page">
      <header class="blog-header">
        <span class="eyebrow">Blog</span>
        <h1>Sprzedaż, dokumenty i dane w jednym miejscu</h1>
        <p class="blog-subtitle">Praktyczne artykuły o zarządzaniu sprzedażą, lejkiem, dokumentami i relacjami z klientami w CRM.</p>
      </header>

      @if (posts().length === 0) {
        <p class="empty">Brak wpisów.</p>
      }

      <div class="post-grid">
        @for (post of posts(); track post.id) {
          <a class="post-card" [routerLink]="['/blog', post.slug]">
            @if (post.header_image_url) {
              <div class="post-image-wrap">
                <img class="post-image" [src]="post.header_image_url" alt="" loading="lazy">
              </div>
            }
            <div class="post-body">
              <span class="post-category">{{ post.category }}</span>
              <h2>{{ post.title }}</h2>
              <p class="post-excerpt">{{ post.meta_description }}</p>
              <div class="post-meta">
                <time>{{ post.published_at | date:'d MMM y':'':'pl' }}</time>
                <span class="meta-dot">·</span>
                <span>{{ post.reading_minutes }} min czytania</span>
              </div>
            </div>
          </a>
        }
      </div>
    </section>
  `,
  styles: [`
    .blog-page { max-width:1080px; margin:0 auto; padding:3.5rem 1.5rem 6rem; }
    .blog-header { max-width:640px; margin:0 auto 3rem; text-align:center; }
    .eyebrow {
      display:inline-block; font-size:0.78rem; font-weight:700; text-transform:uppercase;
      letter-spacing:.06em; color:var(--orange-dark); margin-bottom:0.6rem;
    }
    .blog-header h1 {
      font-family:'Sora', sans-serif; font-size:clamp(1.7rem, 3.4vw, 2.3rem); font-weight:700;
      line-height:1.25; margin:0 0 0.75rem; color:var(--gray-900);
    }
    .blog-subtitle { font-size:1.02rem; color:var(--gray-600); margin:0; line-height:1.6; }
    .empty { color:var(--gray-500); text-align:center; padding:2rem 0; }

    .post-grid {
      display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:1.5rem;
    }
    .post-card {
      display:flex; flex-direction:column; text-decoration:none;
      background:#fff; border:1px solid var(--gray-200); border-radius:var(--radius);
      overflow:hidden; box-shadow:var(--shadow-sm);
      transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease;
    }
    .post-card:hover {
      transform:translateY(-3px); box-shadow:var(--shadow-lg); border-color:var(--orange-muted);
    }
    .post-image-wrap { aspect-ratio:16/9; overflow:hidden; background:var(--gray-100); }
    .post-image { width:100%; height:100%; object-fit:cover; display:block; }
    .post-body { padding:1.25rem 1.4rem 1.5rem; display:flex; flex-direction:column; flex:1; }
    .post-category {
      font-size:0.72rem; text-transform:uppercase; letter-spacing:.05em;
      color:var(--orange-dark); font-weight:700;
    }
    .post-card h2 {
      font-family:'Sora', sans-serif; margin:0.5rem 0 0.5rem; font-size:1.1rem; line-height:1.35;
      color:var(--gray-900); font-weight:600;
    }
    .post-excerpt { margin:0; color:var(--gray-600); font-size:0.9rem; line-height:1.55; flex:1; }
    .post-meta {
      display:flex; align-items:center; gap:0.4rem; margin-top:1rem;
      font-size:0.78rem; color:var(--gray-500);
    }
    .meta-dot { color:var(--gray-300); }
  `],
})
export class BlogListComponent implements OnInit {
  private blogService = inject(PublicBlogService);
  private seo = inject(SeoService);

  readonly posts = signal<BlogPostSummary[]>([]);

  ngOnInit(): void {
    this.seo.setPage({
      title: 'Blog',
      description: 'Praktyczne artykuły o zarządzaniu sprzedażą, lejkiem i relacjami z klientami w CRM.',
      path: '/blog',
    });
    this.blogService.list('pl').subscribe(posts => this.posts.set(posts));
  }
}
