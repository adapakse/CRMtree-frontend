import { ChangeDetectionStrategy, Component, Input, OnChanges, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { DomSanitizer, Meta, SafeHtml } from '@angular/platform-browser';
import { PublicBlogService, BlogPost } from '../../../core/services/public-blog.service';
import { SeoService } from '../../../core/services/seo.service';

// Body is stored as a small, fixed markdown subset (## / ### headings, "- " lists,
// **bold**, [text](url) links) — see CRMtree-backend's seoContentService.renderBody.
// Text is HTML-escaped before any tag is added, so this only ever emits the
// whitelisted tags below, never markup coming straight from the source text.
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderInline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Only relative (/blog/...) or https:// links are honored — anything else stays plain text.
  out = out.replace(/\[([^\]]+)\]\((\/[^)\s]*|https:\/\/[^)\s]*)\)/g, (_m, label, href) => `<a href="${href}">${label}</a>`);
  return out;
}

function renderBodyHtml(body: string): string {
  return body
    .split(/\n\n+/)
    .map((block) => {
      const trimmed = block.trim();
      if (trimmed.startsWith('### ')) return `<h3>${renderInline(trimmed.slice(4))}</h3>`;
      if (trimmed.startsWith('## ')) return `<h2>${renderInline(trimmed.slice(3))}</h2>`;
      const lines = trimmed.split('\n');
      if (lines.length && lines.every((l) => l.startsWith('- '))) {
        return `<ul>${lines.map((l) => `<li>${renderInline(l.slice(2))}</li>`).join('')}</ul>`;
      }
      return `<p>${renderInline(trimmed)}</p>`;
    })
    .join('');
}

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
        @if (p.header_image_url) {
          <img class="post-hero-image" [src]="p.header_image_url" alt="">
        }
        <div [innerHTML]="bodyHtml()"></div>
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
    .post-hero-image { width:100%; max-height:360px; object-fit:cover; border-radius:var(--radius); margin-top:1.4rem; }
    .blog-post p { margin:1.2rem 0 0; line-height:1.7; color:var(--gray-800); }
    .blog-post h2 { font-size:1.4rem; margin:2rem 0 0.6rem; line-height:1.3; }
    .blog-post h3 { font-size:1.15rem; margin:1.6rem 0 0.5rem; line-height:1.3; }
    .blog-post ul { margin:1.2rem 0 0; padding-left:1.4rem; line-height:1.7; color:var(--gray-800); }
    .blog-post a { color:var(--orange-dark); }
    .not-found { max-width:680px; margin:0 auto; padding:4rem 1.5rem; text-align:center; }
  `],
})
export class BlogDetailComponent implements OnChanges {
  @Input() slug!: string;

  private blogService = inject(PublicBlogService);
  private seo = inject(SeoService);
  private metaService = inject(Meta);
  private sanitizer = inject(DomSanitizer);

  readonly post = signal<BlogPost | null>(null);
  readonly notFound = signal(false);
  readonly bodyHtml = signal<SafeHtml>('');

  ngOnChanges(): void {
    if (!this.slug) return;
    this.blogService.bySlug(this.slug, 'pl').subscribe({
      next: (post) => {
        this.post.set(post);
        this.bodyHtml.set(this.sanitizer.bypassSecurityTrustHtml(renderBodyHtml(post.body)));
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
