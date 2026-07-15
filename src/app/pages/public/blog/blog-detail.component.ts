import { ChangeDetectionStrategy, Component, Input, OnChanges, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
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
  imports: [DatePipe, RouterLink],
  template: `
    @if (post(); as p) {
      <article class="blog-post">
        <div class="post-container">
          <a routerLink="/blog" class="back-link">&larr; Wszystkie wpisy</a>
          <span class="post-category">{{ p.category }}</span>
          <h1>{{ p.title }}</h1>
          <div class="post-meta">
            <time>{{ p.published_at | date:'d MMMM y':'':'pl' }}</time>
            <span class="meta-dot">·</span>
            <span>{{ p.reading_minutes }} min czytania</span>
          </div>
        </div>

        @if (p.header_image_url) {
          <div class="hero-wrap">
            <img class="post-hero-image" [src]="p.header_image_url" alt="">
          </div>
        }

        <div class="post-container">
          <div class="post-content" [innerHTML]="bodyHtml()"></div>
          <a routerLink="/blog" class="back-link back-link-bottom">&larr; Wszystkie wpisy</a>
        </div>
      </article>
    } @else if (notFound()) {
      <div class="not-found">
        <h1>Nie znaleziono wpisu</h1>
        <p>Ten wpis nie istnieje albo został usunięty.</p>
        <a routerLink="/blog" class="back-link">&larr; Wszystkie wpisy</a>
      </div>
    }
  `,
  styles: [`
    .blog-post { padding:2.5rem 1.5rem 6rem; }
    .post-container { max-width:680px; margin:0 auto; }
    .back-link {
      display:inline-block; font-size:0.85rem; font-weight:600; color:var(--gray-500);
      text-decoration:none; margin-bottom:1.5rem;
    }
    .back-link:hover { color:var(--orange-dark); }
    .back-link-bottom { margin-top:3rem; margin-bottom:0; }
    .post-category {
      font-size:0.72rem; text-transform:uppercase; letter-spacing:.05em;
      color:var(--orange-dark); font-weight:700;
    }
    .blog-post h1 {
      font-family:'Sora', sans-serif; font-size:clamp(1.7rem, 3.6vw, 2.4rem);
      margin:0.5rem 0 0.6rem; line-height:1.2; font-weight:700; color:var(--gray-900);
    }
    .post-meta { display:flex; align-items:center; gap:0.4rem; font-size:0.85rem; color:var(--gray-500); }
    .meta-dot { color:var(--gray-300); }

    .hero-wrap { max-width:920px; margin:2rem auto 0; padding:0 1.5rem; }
    .post-hero-image { width:100%; max-height:420px; object-fit:cover; border-radius:var(--radius); display:block; }

    .post-content { margin-top:2.2rem; font-size:1.05rem; line-height:1.8; color:var(--gray-800); }
    .post-content p { margin:1.3rem 0 0; }
    .post-content h2 { font-family:'Sora', sans-serif; font-size:1.4rem; font-weight:700; margin:2.4rem 0 0.7rem; line-height:1.3; color:var(--gray-900); }
    .post-content h3 { font-family:'Sora', sans-serif; font-size:1.15rem; font-weight:600; margin:1.8rem 0 0.5rem; line-height:1.3; color:var(--gray-900); }
    .post-content ul { margin:1.3rem 0 0; padding-left:1.4rem; }
    .post-content li { margin-top:0.4rem; }
    .post-content strong { color:var(--gray-900); }
    .post-content a { color:var(--orange-dark); text-decoration-color:var(--orange-muted); }

    .not-found { max-width:680px; margin:0 auto; padding:4rem 1.5rem; text-align:center; }
    .not-found h1 { font-family:'Sora', sans-serif; margin-bottom:0.5rem; }
    .not-found p { color:var(--gray-600); margin-bottom:1.5rem; }
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
