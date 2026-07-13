import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { SeoService } from '../../../core/services/seo.service';

@Component({
  selector: 'wt-privacy-policy',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="legal">
      <h1>Polityka prywatności</h1>
      <p>
        Ta strona wykorzystuje pliki cookie do analizy ruchu. Szczegółowy dokument polityki
        prywatności (zakres przetwarzanych danych, podstawy prawne, prawa użytkownika) zostanie
        tu opublikowany przed uruchomieniem analityki na produkcji.
      </p>
    </article>
  `,
  styles: [`.legal { max-width:680px; margin:0 auto; padding:3rem 1.5rem 5rem; line-height:1.7; }`],
})
export class PrivacyPolicyComponent implements OnInit {
  private seo = inject(SeoService);
  ngOnInit(): void {
    this.seo.setPage({
      title: 'Polityka prywatności',
      description: 'Polityka prywatności CRMtree.',
      path: '/polityka-prywatnosci',
    });
  }
}
