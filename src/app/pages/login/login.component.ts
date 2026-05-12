import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';

type Tab = 'sso' | 'password';

@Component({
  selector: 'wt-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div id="login-screen">
      <div class="login-card">

        <div class="login-top">
          <img class="login-logo-img" src="assets/crmtree-logo.png" alt="CRMtree">
          <div class="login-sub">Platforma CRM</div>
        </div>

        <!-- Tabs -->
        <div class="l-tabs">
          <button class="l-tab" [class.active]="tab() === 'sso'"      (click)="tab.set('sso')">Google Workspace SSO</button>
          <button class="l-tab" [class.active]="tab() === 'password'" (click)="tab.set('password')">Email i hasło</button>
        </div>

        <div class="login-body">

          <!-- SSO tab -->
          @if (tab() === 'sso') {
            <p class="login-hint">Zaloguj się kontem Google Workspace swojej organizacji.</p>
            <button class="lbtn" (click)="loginSso()" [disabled]="loading()">
              @if (loading()) {
                <span class="spinner"></span> Redirecting…
              } @else {
                <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#fff" d="M21.35 11.1H12v2.8h5.35c-.23 1.25-.97 2.3-2.07 3v2.5h3.35c1.96-1.8 3.1-4.47 3.1-7.6 0-.52-.05-1.03-.13-1.53-.01-.05-.02-.1-.03-.15-.07-.35-.17-.69-.3-1.02z"/><path fill="#fff" d="M12 22c2.7 0 4.96-.89 6.62-2.4l-3.35-2.5c-.89.6-2.03.95-3.27.95-2.51 0-4.64-1.7-5.4-3.98H3.18v2.57A9.99 9.99 0 0 0 12 22z"/><path fill="#fff" d="M6.6 14.07A5.97 5.97 0 0 1 6.28 12c0-.72.12-1.41.32-2.07V7.36H3.18A10.03 10.03 0 0 0 2 12c0 1.62.39 3.15 1.18 4.48l3.42-2.41z"/><path fill="#fff" d="M12 6.02c1.42 0 2.69.49 3.69 1.44l2.77-2.77C16.96 3.15 14.7 2.25 12 2.25A9.99 9.99 0 0 0 3.18 7.36l3.42 2.57C7.36 7.72 9.49 6.02 12 6.02z"/></svg>
                Sign in with Google Workspace SSO
              }
            </button>
            <div class="login-note">🔒 <b>SAML 2.0</b> · Google Workspace</div>
          }

          <!-- Password tab -->
          @if (tab() === 'password') {
            <form (ngSubmit)="loginPassword()" #f="ngForm">
              <div class="field">
                <label>Email</label>
                <input type="email" [(ngModel)]="email" name="email" placeholder="jan@firma.pl" autocomplete="email" required>
              </div>
              <div class="field">
                <label>Hasło</label>
                <input [type]="showPass() ? 'text' : 'password'" [(ngModel)]="password" name="password"
                       placeholder="••••••••" autocomplete="current-password" required>
                <button type="button" class="pass-toggle" (click)="showPass.set(!showPass())">
                  {{ showPass() ? 'Ukryj' : 'Pokaż' }}
                </button>
              </div>
              @if (errorMsg()) {
                <div class="l-error">{{ errorMsg() }}</div>
              }
              <button class="lbtn" type="submit" [disabled]="loading() || !email || !password">
                @if (loading()) { <span class="spinner"></span> Loguję… }
                @else { Zaloguj się }
              </button>
            </form>
          }

        </div>
      </div>
    </div>
  `,
  styles: [`
    #login-screen { position:fixed; inset:0; background:var(--gray-900); display:flex; align-items:center; justify-content:center; }
    .login-card { background:white; border-radius:16px; width:420px; max-width:95vw; overflow:hidden; box-shadow:0 24px 60px rgba(0,0,0,.4); }
    .login-top { background:#292A2D; padding:24px 32px 20px; text-align:center; }
    .login-logo-img { width:340px; max-width:100%; height:auto; display:block; margin:0 auto 4px; }
    .login-sub { font-size:13px; color:#888; }

    .l-tabs { display:flex; border-bottom:1px solid var(--gray-200); }
    .l-tab {
      flex:1; padding:11px 8px; font-size:13px; font-weight:500; color:var(--gray-500);
      background:none; border:none; border-bottom:2px solid transparent;
      cursor:pointer; transition:color .12s, border-color .12s; margin-bottom:-1px;
    }
    .l-tab:hover { color:var(--gray-700); }
    .l-tab.active { color:var(--orange); border-bottom-color:var(--orange); }

    .login-body { padding:24px 32px 28px; }
    .login-hint { font-size:13px; color:var(--gray-500); margin:0 0 18px; text-align:center; line-height:1.6; }

    .field { display:flex; flex-direction:column; gap:5px; margin-bottom:14px; position:relative; }
    .field label { font-size:12px; font-weight:600; color:var(--gray-600); }
    .field input { padding:9px 12px; border:1px solid var(--gray-300); border-radius:8px; font-size:14px; outline:none; transition:border-color .12s; }
    .field input:focus { border-color:var(--orange); box-shadow:0 0 0 3px rgba(59,170,93,.12); }
    .pass-toggle { position:absolute; right:10px; bottom:9px; background:none; border:none; font-size:12px; color:var(--gray-400); cursor:pointer; }

    .lbtn {
      width:100%; background:var(--orange); color:white; border:none; border-radius:8px;
      padding:12px; font-size:14px; font-weight:600; cursor:pointer;
      display:flex; align-items:center; justify-content:center; gap:8px;
      transition:background .15s; margin-top:4px;
    }
    .lbtn:hover:not(:disabled) { background:var(--orange-dark); }
    .lbtn:disabled { opacity:.6; cursor:not-allowed; }

    .l-error { background:#fef2f2; border:1px solid #fecaca; border-radius:7px; padding:9px 12px; font-size:13px; color:#dc2626; margin-bottom:12px; }
    .login-note { font-size:11px; color:#888; text-align:center; margin-top:12px; }
    .login-note b { color:var(--orange); }

    .spinner { width:16px; height:16px; border:2px solid rgba(255,255,255,.3); border-top-color:white; border-radius:50%; animation:spin .7s linear infinite; display:inline-block; }
    @keyframes spin { to { transform:rotate(360deg); } }
  `],
})
export class LoginComponent implements OnInit {
  private auth   = inject(AuthService);
  private router = inject(Router);
  private route  = inject(ActivatedRoute);

  tab      = signal<Tab>('sso');
  loading  = signal(false);
  showPass = signal(false);
  errorMsg = signal('');

  email    = '';
  password = '';

  ngOnInit(): void {
    if (this.auth.isLoggedIn()) { this.router.navigate(['/dashboard']); return; }
    const err = this.route.snapshot.queryParamMap.get('error');
    if (err === 'saml_failed') this.errorMsg.set('Logowanie SSO nie powiodło się. Spróbuj ponownie.');
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
            if (tokens.must_change_password) {
              this.router.navigate(['/change-password']);
            } else {
              const dest = (user.crm_role === 'salesperson' || user.crm_role === 'sales_manager')
                ? '/crm/dashboard' : '/dashboard';
              this.router.navigate([dest]);
            }
          },
          error: () => { this.loading.set(false); this.errorMsg.set('Błąd ładowania profilu'); },
        });
      },
      error: err => {
        this.loading.set(false);
        this.errorMsg.set(err?.error?.error ?? 'Błąd logowania');
      },
    });
  }
}
