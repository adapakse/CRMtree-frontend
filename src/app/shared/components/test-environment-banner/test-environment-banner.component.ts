import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TranslocoDirective } from '@jsverse/transloco';
import { EnvironmentBannerService } from '../../../core/services/environment-banner.service';

// Must match --test-banner-height below exactly — shell.component.ts and
// public-layout.component.ts read that CSS var to size their own 100vh
// layouts around this banner instead of getting clipped by it.
const BANNER_HEIGHT = '28px';

@Component({
  selector: 'wt-test-environment-banner',
  standalone: true,
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isTest()) {
      <div class="test-banner" role="status" *transloco="let t">
        {{ t('testEnvironmentBanner.title') }}
      </div>
    }
  `,
  styles: [`
    .test-banner {
      height: 28px;
      background: #F97316;
      color: #fff;
      font-size: 0.82rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      letter-spacing: 0.02em;
    }
  `],
})
export class TestEnvironmentBannerComponent {
  readonly isTest = inject(EnvironmentBannerService).isTestEnvironment;

  constructor() {
    const document = inject(DOCUMENT);
    effect(() => {
      document.documentElement.style.setProperty('--test-banner-height', this.isTest() ? BANNER_HEIGHT : '0px');
    });
  }
}
