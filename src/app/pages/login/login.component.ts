import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'wt-login',
  standalone: true,
  template: `
    <div id="login-screen">
      <div class="login-card">
        <div class="login-top">
          <img class="login-logo-img" src="assets/crmtree-logo.png" alt="CRMtree">
          <div class="login-sub">Platforma CRM</div>
        </div>
        <div class="login-body">
          <p style="font-size:13px;color:var(--gray-500);margin-bottom:20px;text-align:center;line-height:1.6">
            Zaloguj się kontem Google Workspace swojej organizacji.
          </p>
          <button class="lbtn" (click)="login()" [disabled]="loading">
            @if (loading) {
              <span class="spinner" style="width:16px;height:16px;border-width:2px;border-top-color:white;display:inline-block"></span>
              Redirecting…
            } @else {
              <svg viewBox="0 0 24 24" width="18" height="18" style="vertical-align:middle;margin-right:6px"><path fill="#fff" d="M21.35 11.1H12v2.8h5.35c-.23 1.25-.97 2.3-2.07 3v2.5h3.35c1.96-1.8 3.1-4.47 3.1-7.6 0-.52-.05-1.03-.13-1.53-.01-.05-.02-.1-.03-.15-.07-.35-.17-.69-.3-1.02z"/><path fill="#fff" d="M12 22c2.7 0 4.96-.89 6.62-2.4l-3.35-2.5c-.89.6-2.03.95-3.27.95-2.51 0-4.64-1.7-5.4-3.98H3.18v2.57A9.99 9.99 0 0 0 12 22z"/><path fill="#fff" d="M6.6 14.07A5.97 5.97 0 0 1 6.28 12c0-.72.12-1.41.32-2.07V7.36H3.18A10.03 10.03 0 0 0 2 12c0 1.62.39 3.15 1.18 4.48l3.42-2.41z"/><path fill="#fff" d="M12 6.02c1.42 0 2.69.49 3.69 1.44l2.77-2.77C16.96 3.15 14.7 2.25 12 2.25A9.99 9.99 0 0 0 3.18 7.36l3.42 2.57C7.36 7.72 9.49 6.02 12 6.02z"/></svg>
              Sign in with Google Workspace SSO
            }
          </button>
          <div class="login-note">🔒 Logowanie przez <b>SAML 2.0</b> · Google Workspace</div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    #login-screen { position: fixed; inset: 0; background: var(--gray-900); display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 16px; }
    .login-card { background: white; border-radius: 16px; width: 440px; overflow: hidden; box-shadow: var(--shadow-lg); }
    .login-top { background: #292A2D; padding: 24px 32px 20px; text-align: center; }
    .login-logo-img { width: 374px; height: auto; display: block; margin: 0 auto 4px; }
    .login-sub { font-size: 13px; color: #888; margin-top: 0; }
    .login-body { padding: 28px 32px 32px; }
    .lbtn { width: 100%; background: var(--orange); color: white; border: none; border-radius: 8px; padding: 12px; font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; transition: background .15s; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .lbtn:hover { background: var(--orange-dark); }
    .lbtn:disabled { opacity: .7; cursor: not-allowed; }
    .login-note { font-size: 11px; color: #666; text-align: center; margin-top: 12px; }
    .login-note b { color: var(--orange); }
  `],
})
export class LoginComponent implements OnInit {
  auth    = inject(AuthService);
  router  = inject(Router);
  loading = false;

  ngOnInit(): void {
    if (this.auth.isLoggedIn()) {
      this.router.navigate(['/dashboard']);
    }
  }

  login(): void {
    this.loading = true;
    this.auth.loginWithSaml();
  }
}