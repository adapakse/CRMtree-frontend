import { registerLocaleData } from '@angular/common';
import localePl from '@angular/common/locales/pl';
import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

registerLocaleData(localePl, 'pl');

const bootstrap = (context: BootstrapContext) =>
    bootstrapApplication(AppComponent, config, context);

export default bootstrap;
