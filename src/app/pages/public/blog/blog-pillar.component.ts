import { ChangeDetectionStrategy, Component, Input, OnChanges, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { PublicBlogService, BlogPillarDetail } from '../../../core/services/public-blog.service';
import { SeoService, SITE_URL } from '../../../core/services/seo.service';

@Component({
  selector: 'wt-blog-pillar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe],
  template: `
    @if (pillar(); as p) {
      <section class="pillar-page">
        <header class="pillar-header">
          <a routerLink="/blog" class="back-link">&larr; Wszystkie wpisy</a>
          <span class="eyebrow">Temat</span>
          <h1>{{ p.name }}</h1>
          <p class="pillar-description">{{ p.description }}</p>
        </header>

        @if (p.articles.length === 0) {
          <p class="empty">Brak jeszcze artykułów w tym temacie.</p>
        }

        <div class="post-grid">
          @for (article of p.articles; track article.id) {
            <a class="post-card" [routerLink]="['/blog', article.slug]">
              @if (article.header_image_url) {
                <div class="post-image-wrap">
                  <img class="post-image" [src]="article.header_image_url" [alt]="article.title" loading="lazy">
                </div>
              }
              <div class="post-body">
                <h2>{{ article.title }}</h2>
                <p class="post-excerpt">{{ article.meta_description }}</p>
                <div class="post-meta">
                  <time>{{ article.published_at | date:'d MMM y':'':'pl' }}</time>
                  <span class="meta-dot">·</span>
                  <span>{{ article.reading_minutes }} min czytania</span>
                </div>
              </div>
            </a>
          }
        </div>
      </section>
    } @else if (notFound()) {
      <div class="not-found">
        <h1>Nie znaleziono tematu</h1>
        <p>Ten temat nie istnieje albo nie ma jeszcze opublikowanych artykułów.</p>
        <a routerLink="/blog" class="back-link">&larr; Wszystkie wpisy</a>
      </div>
    }
  `,
  styles: [`
    .pillar-page { max-width:1080px; margin:0 auto; padding:2.5rem 1.5rem 6rem; }
    .pillar-header { max-width:680px; margin:0 auto 3rem; }
    .back-link {
      display:inline-block; font-size:0.85rem; font-weight:600; color:var(--gray-500);
      text-decoration:none; margin-bottom:1.5rem;
    }
    .back-link:hover { color:var(--orange-dark); }
    .eyebrow {
      display:block; font-size:0.78rem; font-weight:700; text-transform:uppercase;
      letter-spacing:.06em; color:var(--orange-dark); margin-bottom:0.5rem;
    }
    .pillar-header h1 {
      font-family:'Sora', sans-serif; font-size:clamp(1.7rem, 3.4vw, 2.3rem); font-weight:700;
      line-height:1.25; margin:0 0 0.75rem; color:var(--gray-900);
    }
    .pillar-description { font-size:1.02rem; color:var(--gray-600); margin:0; line-height:1.6; }
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
    .post-card h2 {
      font-family:'Sora', sans-serif; margin:0 0 0.5rem; font-size:1.1rem; line-height:1.35;
      color:var(--gray-900); font-weight:600;
    }
    .post-excerpt { margin:0; color:var(--gray-600); font-size:0.9rem; line-height:1.55; flex:1; }
    .post-meta {
      display:flex; align-items:center; gap:0.4rem; margin-top:1rem;
      font-size:0.78rem; color:var(--gray-500);
    }
    .meta-dot { color:var(--gray-300); }

    .not-found { max-width:680px; margin:0 auto; padding:4rem 1.5rem; text-align:center; }
    .not-found h1 { font-family:'Sora', sans-serif; margin-bottom:0.5rem; }
    .not-found p { color:var(--gray-600); margin-bottom:1.5rem; }
  `],
})
export class BlogPillarComponent implements OnChanges {
  @Input() slug!: string;

  private blogService = inject(PublicBlogService);
  private seo = inject(SeoService);

  readonly pillar = signal<BlogPillarDetail | null>(null);
  readonly notFound = signal(false);

  ngOnChanges(): void {
    if (!this.slug) return;
    this.blogService.pillarBySlug(this.slug, 'pl').subscribe({
      next: (pillar) => {
        this.pillar.set(pillar);
        this.seo.setPage({
          title: pillar.name,
          description: pillar.description,
          path: `/blog/temat/${pillar.slug}`,
        });
        this.seo.setJsonLd('ld-pillar', {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: pillar.name,
          description: pillar.description,
          url: `${SITE_URL}/blog/temat/${pillar.slug}`,
        });
      },
      error: () => {
        this.notFound.set(true);
        this.seo.removeJsonLd('ld-pillar');
        this.seo.setPage({
          title: 'Nie znaleziono tematu',
          description: 'Ten temat nie istnieje.',
          path: `/blog/temat/${this.slug}`,
        });
      },
    });
  }
}
