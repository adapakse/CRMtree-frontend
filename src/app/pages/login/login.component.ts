import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { AppSettingsService } from '../../core/services/app-settings.service';
import { EnvironmentBannerService } from '../../core/services/environment-banner.service';
import { TenantContextService } from '../../core/services/tenant-context.service';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { LanguagePickerComponent } from '../../shared/components/language-picker/language-picker.component';
import { localizedApiErrorMessage } from '../../core/services/api-error.util';

@Component({
  selector: 'wt-login',
  standalone: true,
  imports: [FormsModule, TranslocoDirective, LanguagePickerComponent],
  providers: [provideTranslocoScope('auth')],
  template: `
    <div id="login-screen" *transloco="let t; prefix: 'auth.login'">
      <!-- Same layout as the mobile app: a graphite brand band with the logo,
           and the white form card overlapping its rounded bottom edge. -->
      <div class="login-band">
        <img class="login-logo-img" src="assets/crmtree-logo.png" alt="CRMtree">
        @if (tenantContext.tenantName()) {
          <div class="login-sub">{{ tenantContext.tenantName() }}</div>
        }
        @if (tenantContext.isUnknownTenantHost()) {
          <div class="login-tenant-warning">{{ t('unknownTenant') }}</div>
        }
      </div>
      <div class="login-card">
        <form (ngSubmit)="loginPassword()" #f="ngForm">
          <div class="field">
            <label for="login-email">{{ t('email') }}</label>
            <input id="login-email" type="email" [(ngModel)]="email" name="email" [placeholder]="t('emailPlaceholder')" autocomplete="email" required>
          </div>
          <div class="field">
            <label for="login-password">{{ t('password') }}</label>
            <div class="input-wrap">
              <input id="login-password" class="has-toggle" [type]="showPass() ? 'text' : 'password'" [(ngModel)]="password" name="password"
                     placeholder="••••••••" autocomplete="current-password" required>
              <button type="button" class="pass-toggle" (click)="showPass.set(!showPass())"
                      [attr.aria-label]="t(showPass() ? 'hidePassword' : 'showPassword')"
                      [title]="t(showPass() ? 'hidePassword' : 'showPassword')">
                @if (showPass()) {
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>
                } @else {
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>
          @if (errorMsg()) {
            <div class="l-error">{{ errorMsg() }}</div>
          }
          <button class="lbtn" type="submit" [disabled]="loading() || !email || !password">
            @if (loading()) { <span class="spinner"></span> {{ t('submitting') }} }
            @else { {{ t('submit') }} }
          </button>
        </form>

        <!-- SSO is offered only on non-prod deploys -->
        @if (isDevDomain()) {
          <div class="l-divider"><span>{{ t('or') }}</span></div>
          <button type="button" class="lbtn-secondary" (click)="loginSso()" [disabled]="loading()">
            @if (loading()) {
              <span class="spinner spinner-dark"></span> {{ t('redirecting') }}
            } @else {
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              {{ t('ssoSubmit') }}
            }
          </button>
          <div class="login-note">SAML 2.0 · Google Workspace</div>
        }

        <!-- Before signing in nothing tells us the person's language, so they can pick it here. -->
        <div class="login-language"><wt-language-picker mode="compact" /></div>
      </div>
    </div>
  `,
  styles: [`
    #login-screen {
      position:fixed; top:var(--test-banner-height, 0px); right:0; bottom:0; left:0;
      background:var(--page-bg); overflow-y:auto; overflow-x:hidden;
      display:flex; flex-direction:column; align-items:center; padding-bottom:32px;
    }
    /* The band ends in one wide, smooth arc that runs behind the upper half
       of the card; the logo sits in the part above the card. */
    .login-band {
      flex-shrink:0; width:160%; height:calc(30vh + 220px); min-height:440px;
      background:var(--graphite);
      /* Wider than the screen, so only the gentle middle of the ellipse shows. */
      border-radius:0 0 50% 50%;
      display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:8px;
      /* The card overlaps the band by 220px; the logo sits 28px above the card. */
      padding-bottom:248px; box-sizing:border-box;
    }
    /* The PNG has ~25% empty space under the mark; pull it in so the logo sits just above the card. */
    .login-logo-img { width:240px; max-width:70vw; height:auto; display:block; margin-bottom:-20px; }
    .login-sub { font-size:12px; color:rgba(255,255,255,.55); }
    .login-tenant-warning { font-size:12px; color:#FBBF24; }

    .login-card {
      position:relative; margin-top:-220px; width:420px; max-width:calc(100vw - 32px);
      box-sizing:border-box; background:white; border-radius:20px; padding:32px;
      box-shadow:0 16px 40px rgba(0,0,0,.08);
    }

    .field { display:flex; flex-direction:column; gap:8px; margin-bottom:16px; }
    .field label { font-size:14px; font-weight:500; color:var(--gray-600); padding-left:2px; }
    .input-wrap { position:relative; }
    #login-screen .field input {
      width:100%; box-sizing:border-box; height:50px; padding:0 16px;
      border:1px solid #E3E5E9; border-radius:14px; background:white;
      font-size:14px; outline:none; box-shadow:0 6px 18px rgba(0,0,0,.08);
      transition:border-color .15s, box-shadow .15s;
    }
    .field input.has-toggle { padding-right:56px; }
    #login-screen .field input:focus { border-color:var(--orange); box-shadow:0 6px 18px rgba(0,0,0,.08), 0 0 0 4px rgba(59,170,93,.18); }
    .pass-toggle {
      position:absolute; right:8px; top:50%; transform:translateY(-50%);
      width:38px; height:38px; padding:0; border:none; border-radius:50%; background:none;
      display:flex; align-items:center; justify-content:center; color:var(--gray-400); cursor:pointer;
      transition:background .15s, color .15s;
    }
    .pass-toggle:hover { background:var(--gray-100); color:var(--gray-700); }

    .lbtn, .lbtn-secondary {
      width:100%; height:50px; border-radius:14px; cursor:pointer;
      display:flex; align-items:center; justify-content:center; gap:10px;
      transition:background .15s, box-shadow .15s, border-color .15s;
    }
    .lbtn {
      margin-top:24px; background:var(--orange); color:white; border:none;
      font-size:16px; font-weight:600; box-shadow:0 8px 18px rgba(59,170,93,.25);
    }
    .lbtn:hover:not(:disabled) { background:var(--orange-dark); }
    .lbtn:disabled { background:rgba(59,170,93,.6); box-shadow:none; cursor:not-allowed; }
    .lbtn-secondary {
      background:white; color:var(--gray-700); border:1px solid #E3E5E9;
      font-size:14px; font-weight:500; box-shadow:0 4px 12px rgba(0,0,0,.06);
    }
    .lbtn-secondary:hover:not(:disabled) { background:var(--gray-50); border-color:var(--gray-300); }
    .lbtn-secondary:disabled { opacity:.6; cursor:not-allowed; }

    .l-divider { display:flex; align-items:center; gap:12px; margin:20px 0; font-size:14px; color:var(--gray-400); }
    .l-divider::before, .l-divider::after { content:''; flex:1; height:1px; background:var(--gray-200); }

    .l-error { background:#fef2f2; border:1px solid #fecaca; border-radius:12px; padding:10px 16px; font-size:12px; color:#dc2626; }
    .login-note { font-size:12px; color:var(--gray-400); text-align:center; margin-top:12px; }
    .login-language { display:flex; justify-content:center; margin-top:20px; }

    .spinner { width:16px; height:16px; border:2px solid rgba(255,255,255,.3); border-top-color:white; border-radius:50%; animation:spin .7s linear infinite; display:inline-block; }
    .spinner-dark { border-color:var(--gray-200); border-top-color:var(--gray-600); }
    @keyframes spin { to { transform:rotate(360deg); } }

    @media (max-width:480px) {
      .login-card { padding:24px 20px; }
    }
  `],
})
export class LoginComponent implements OnInit {
  private auth      = inject(AuthService);
  private settings  = inject(AppSettingsService);
  private router    = inject(Router);
  private route     = inject(ActivatedRoute);
  private envBanner = inject(EnvironmentBannerService);
  readonly tenantContext = inject(TenantContextService);

  // Non-prod deploys (int/preview) also offer SSO; real production only
  // shows password login. Driven by APP_ENV via EnvironmentBannerService,
  // NOT by hostname — a tenant subdomain (acme.crmtree.pl) is still real
  // production and must not be treated as a dev domain.
  readonly isDevDomain = this.envBanner.isTestEnvironment;
  private readonly transloco = inject(TranslocoService);

  loading  = signal(false);
  showPass = signal(false);
  errorMsg = signal('');

  email    = '';
  password = '';

  ngOnInit(): void {
    if (this.auth.isLoggedIn()) { this.router.navigate(['/dashboard']); return; }
    const err = this.route.snapshot.queryParamMap.get('error');
    if (err === 'saml_failed') this.errorMsg.set(this.transloco.translate('auth.login.ssoFailed'));
    if (err === 'tenant_host_mismatch') this.errorMsg.set(this.transloco.translate('auth.login.tenantHostMismatch'));
  }

  loginSso(): void {
    this.loading.set(true);
    this.auth.loginWithSaml();
  }

  loginPassword(): void {
    this.errorMsg.set('');
    this.loading.set(true);
    this.auth.loginWithPassword(this.email, this.password).subscribe({
      next: tokens => {
        sessionStorage.setItem('wt_access',  tokens.access_token);
        sessionStorage.setItem('wt_refresh', tokens.refresh_token);
        this.auth.loadCurrentUser().subscribe({
          next: user => {
            this.loading.set(false);
            // APP_INITIALIZER skips the settings call for anonymous visitors, and a
            // password login never reloads the page — without this, the whole session
            // runs on defaults, with no tenant lead stages (empty kanban, empty stage
            // filter, won/lost counts stuck at zero). The SSO callback does the same.
            this.settings.reload();
            if (tokens.must_change_password) {
              this.router.navigate(['/change-password']);
            } else {
              this.router.navigateByUrl(this.auth.landingUrl(user));
            }
          },
          error: () => { this.loading.set(false); this.errorMsg.set(this.transloco.translate('auth.login.profileLoadFailed')); },
        });
      },
      error: err => {
        this.loading.set(false);
        this.errorMsg.set(localizedApiErrorMessage(err?.error?.error, this.transloco) ?? this.transloco.translate('auth.login.failed'));
      },
    });
  }
}
