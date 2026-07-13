import { ChangeDetectionStrategy, Component, Input, OnChanges, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Meta } from '@angular/platform-browser';
import { PublicBlogService, BlogPost } from '../../../core/services/public-blog.service';
import { SeoService } from '../../../core/services/seo.service';

@Component({
  selector: 'wt-blog-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    @if (post(); as p) {
      <article class="blog-post">
        <span class="post-category">{{ p.category }}</span>
        <h1>{{ p.title }}</h1>
        <time>{{ p.published_at | date:'longDate':'':'pl' }}</time>
        @for (paragraph of bodyParagraphs(); track $index) {
          <p>{{ paragraph }}</p>
        }
      </article>
    } @else if (notFound()) {
      <div class="not-found">
        <h1>Nie znaleziono wpisu</h1>
        <p>Ten wpis nie istnieje albo został usunięty.</p>
      </div>
    }
  `,
  styles: [`
    .blog-post { max-width:680px; margin:0 auto; padding:3rem 1.5rem 5rem; }
    .post-category {
      font-size:0.72rem; text-transform:uppercase; letter-spacing:.05em;
      color:var(--orange-dark); font-weight:700;
    }
    .blog-post h1 { font-size:1.9rem; margin:0.4rem 0 0.4rem; line-height:1.25; }
    .blog-post time { color:var(--gray-500); font-size:0.85rem; }
    .blog-post p { margin:1.2rem 0 0; line-height:1.7; color:var(--gray-800); }
    .not-found { max-width:680px; margin:0 auto; padding:4rem 1.5rem; text-align:center; }
  `],
})
export class BlogDetailComponent implements OnChanges {
  @Input() slug!: string;

  private blogService = inject(PublicBlogService);
  private seo = inject(SeoService);
  private metaService = inject(Meta);

  readonly post = signal<BlogPost | null>(null);
  readonly notFound = signal(false);
  readonly bodyParagraphs = signal<string[]>([]);

  ngOnChanges(): void {
    if (!this.slug) return;
    this.blogService.bySlug(this.slug, 'pl').subscribe({
      next: (post) => {
        this.post.set(post);
        this.bodyParagraphs.set(post.body.split(/\n\n+/));
        this.seo.setPage({
          title: post.title,
          description: post.meta_description,
          path: `/blog/${post.slug}`,
          type: 'article',
          image: post.header_image_url ?? undefined,
        });
        this.seo.setJsonLd('ld-article', {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.meta_description,
          datePublished: post.published_at,
          publisher: { '@type': 'Organization', name: 'CRMtree' },
        });
      },
      error: () => {
        this.notFound.set(true);
        // Real 404 without an SSR-level status hook (not available in this Angular/SSR version) —
        // at minimum keep it out of the index via robots noindex.
        this.metaService.updateTag({ name: 'robots', content: 'noindex' });
        this.seo.setPage({
          title: 'Nie znaleziono wpisu',
          description: 'Ten wpis nie istnieje.',
          path: `/blog/${this.slug}`,
        });
      },
    });
  }
}
