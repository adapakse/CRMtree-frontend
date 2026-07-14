import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { SeoService } from '../../../core/services/seo.service';

@Component({
  selector: 'wt-terms',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="legal">
      <h1>Regulamin</h1>
      <p>
        Pełny regulamin świadczenia usług CRMtree zostanie tu opublikowany przed uruchomieniem
        publicznej sprzedaży modułów płatnych.
      </p>
    </article>
  `,
  styles: [`.legal { max-width:680px; margin:0 auto; padding:3rem 1.5rem 5rem; line-height:1.7; }`],
})
export class TermsComponent implements OnInit {
  private seo = inject(SeoService);
  ngOnInit(): void {
    this.seo.setPage({
      title: 'Regulamin',
      description: 'Regulamin świadczenia usług CRMtree.',
      path: '/regulamin',
    });
  }
}
