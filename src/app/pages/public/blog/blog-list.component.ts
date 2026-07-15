import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicBlogService, BlogPostSummary } from '../../../core/services/public-blog.service';
import { SeoService } from '../../../core/services/seo.service';

@Component({
  selector: 'wt-blog-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section class="blog-list">
      <h1>Blog CRMtree</h1>
      @if (posts().length === 0) {
        <p class="empty">Brak wpisów.</p>
      }
      <div class="posts">
        @for (post of posts(); track post.id) {
          <a class="post-card" [routerLink]="['/blog', post.slug]">
            @if (post.header_image_url) {
              <img class="post-image" [src]="post.header_image_url" alt="" loading="lazy">
            }
            <span class="post-category">{{ post.category }}</span>
            <h2>{{ post.title }}</h2>
            <p>{{ post.meta_description }}</p>
          </a>
        }
      </div>
    </section>
  `,
  styles: [`
    .blog-list { max-width:760px; margin:0 auto; padding:3rem 1.5rem 5rem; }
    .blog-list h1 { font-size:2rem; margin:0 0 2rem; }
    .empty { color:var(--gray-500); }
    .posts { display:flex; flex-direction:column; gap:1.25rem; }
    .post-card {
      display:block; text-decoration:none; padding:1.25rem 1.5rem;
      border:1px solid var(--gray-200); border-radius:var(--radius);
      transition:border-color .15s;
    }
    .post-card:hover { border-color:var(--orange); }
    .post-image { width:100%; height:160px; object-fit:cover; border-radius:calc(var(--radius) - 4px); margin-bottom:0.9rem; }
    .post-category {
      font-size:0.72rem; text-transform:uppercase; letter-spacing:.05em;
      color:var(--orange-dark); font-weight:700;
    }
    .post-card h2 { margin:0.4rem 0 0.4rem; font-size:1.15rem; color:var(--gray-900); }
    .post-card p { margin:0; color:var(--gray-600); font-size:0.92rem; }
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
