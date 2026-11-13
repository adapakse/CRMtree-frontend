import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './shared/components/toast/toast-container.component';
import { enableCustomDatePicker } from './shared/date-picker/custom-date-picker';
import { preventBackdropCloseOnDrag } from './shared/utils/backdrop-drag-guard';
import { TestEnvironmentBannerComponent } from './shared/components/test-environment-banner/test-environment-banner.component';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'wt-root',
  standalone: true,
  imports: [RouterOutlet, ToastContainerComponent, TestEnvironmentBannerComponent],
  template: `
    <wt-test-environment-banner />
    <router-outlet />
    <wt-toast-container />
  `,
})
export class AppComponent {
  // Created at start-up so the saved theme applies on every screen.
  private readonly theme = inject(ThemeService);

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const doc = inject(DOCUMENT);
      enableCustomDatePicker(doc);
      preventBackdropCloseOnDrag(doc);
    }
  }
}
