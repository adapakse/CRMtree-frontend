import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { SeoService } from '../../../core/services/seo.service';

@Component({
  selector: 'wt-public-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoDirective],
  template: `
    <ng-container *transloco="let t; prefix: 'public.home'">
    <section class="hero">
      <h1>{{ t('title') }}</h1>
      <p class="hero-sub">{{ t('subtitle') }}</p>
      <a routerLink="/login" class="hero-cta">{{ t('cta') }}</a>
    </section>

    <section class="features">
      <div class="feature">
        <h2>{{ t('features.sales.title') }}</h2>
        <p>{{ t('features.sales.text') }}</p>
      </div>
      <div class="feature">
        <h2>{{ t('features.funnel.title') }}</h2>
        <p>{{ t('features.funnel.text') }}</p>
      </div>
      <div class="feature">
        <h2>{{ t('features.upsell.title') }}</h2>
        <p>{{ t('features.upsell.text') }}</p>
      </div>
    </section>

    <section class="blog-teaser">
      <h2>{{ t('blogTitle') }}</h2>
      <a routerLink="/blog" class="blog-teaser-link">{{ t('blogLink') }}</a>
    </section>
    </ng-container>
  `,
  styles: [`
    .hero { text-align:center; padding:5rem 1.5rem 4rem; max-width:760px; margin:0 auto; }
    .hero h1 { font-size:clamp(1.9rem, 4vw, 2.6rem); font-weight:700; line-height:1.2; margin:0 0 1rem; color:var(--gray-900); }
    .hero-sub { font-size:1.1rem; color:var(--gray-600); margin:0 0 2rem; }
    .hero-cta {
      display:inline-block; background:var(--orange); color:#fff; text-decoration:none;
      padding:0.85rem 1.8rem; border-radius:var(--radius); font-weight:600;
    }
    .features {
      display:grid; grid-template-columns:repeat(3, 1fr); gap:1.5rem;
      max-width:1000px; margin:0 auto; padding:0 1.5rem 4rem;
    }
    @media (max-width:760px) { .features { grid-template-columns:1fr; } }
    .feature { background:var(--orange-pale); border-radius:var(--radius); padding:1.5rem; }
    .feature h2 { font-size:1.1rem; margin:0 0 0.5rem; color:var(--gray-900); }
    .feature p { margin:0; color:var(--gray-600); font-size:0.92rem; }
    .blog-teaser { text-align:center; padding:2rem 1.5rem 5rem; }
    .blog-teaser h2 { font-size:1.3rem; margin:0 0 0.8rem; }
    .blog-teaser-link { color:var(--orange-dark); text-decoration:none; font-weight:600; }
  `],
})
export class HomeComponent implements OnInit {
  private seo = inject(SeoService);
  private transloco = inject(TranslocoService);

  ngOnInit(): void {
    this.seo.setPage({
      title: this.transloco.translate('public.home.seoTitle'),
      description: this.transloco.translate('public.home.seoDescription'),
      path: '/',
    });
    this.seo.setJsonLd('ld-organization', {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'CRMtree',
      url: 'https://crmtree.pl',
      logo: 'https://crmtree.pl/assets/crmtree-logo.png',
    });
  }
}
