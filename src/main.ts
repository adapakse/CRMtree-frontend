import { registerLocaleData } from '@angular/common';
import localePl from '@angular/common/locales/pl';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

registerLocaleData(localePl, 'pl');

bootstrapApplication(AppComponent, appConfig).catch(console.error);
