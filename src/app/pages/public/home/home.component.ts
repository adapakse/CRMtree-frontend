import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../../core/services/seo.service';

@Component({
  selector: 'wt-public-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section class="hero">
      <h1>CRM dla firm, które nie chcą tracić leadów</h1>
      <p class="hero-sub">
        CRMtree porządkuje pracę handlowców, lejek sprzedażowy oraz upsell i cross-sell
        w jednym miejscu — niezależnie od branży, w której działasz.
      </p>
      <a routerLink="/login" class="hero-cta">Zaloguj się do CRMtree</a>
    </section>

    <section class="features">
      <div class="feature">
        <h2>Dynamiczna praca handlowców</h2>
        <p>Leady, zadania i kalendarz w jednym miejscu — zespół sprzedaży widzi, co wymaga uwagi teraz.</p>
      </div>
      <div class="feature">
        <h2>Przejrzysty lejek sprzedażowy</h2>
        <p>Każdy etap — od pierwszego kontaktu po zamknięcie — widoczny i mierzalny.</p>
      </div>
      <div class="feature">
        <h2>Upsell i cross-sell</h2>
        <p>Historia klienta w jednym miejscu ułatwia rozpoznanie momentu na dosprzedaż.</p>
      </div>
    </section>

    <section class="blog-teaser">
      <h2>Ostatnio na blogu</h2>
      <a routerLink="/blog" class="blog-teaser-link">Zobacz wszystkie wpisy →</a>
    </section>
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

  ngOnInit(): void {
    this.seo.setPage({
      title: 'CRM dla dynamicznej sprzedaży',
      description: 'CRMtree porządkuje pracę handlowców, lejek sprzedażowy oraz upsell i cross-sell — dla firm z dowolnej branży.',
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
