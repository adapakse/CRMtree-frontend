import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './shared/components/toast/toast-container.component';
import { TestEnvironmentBannerComponent } from './shared/components/test-environment-banner/test-environment-banner.component';

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
export class AppComponent {}
