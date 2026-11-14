import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { localizedApiErrorMessage } from '../../core/services/api-error.util';

@Component({
  selector: 'wt-change-password',
  standalone: true,
  imports: [FormsModule, TranslocoDirective],
  providers: [provideTranslocoScope('auth')],
  template: `
    <div id="login-screen" *transloco="let t; prefix: 'auth'">
      <div class="login-card">
        <div class="login-top">
          <img class="login-logo-img" src="assets/crmtree-logo.png" alt="CRMtree">
          <div class="login-sub">{{ t('login.platformName') }}</div>
        </div>
        <div class="login-body">
          <div class="cp-title">{{ t('changePassword.title') }}</div>
          <p class="cp-hint">{{ t('changePassword.hint') }}</p>
          <form (ngSubmit)="submit()">
            <div class="field">
              <label>{{ t('changePassword.newPassword') }}</label>
              <div class="pw-wrap">
                <input [type]="show() ? 'text' : 'password'" [(ngModel)]="newPass" name="newPass"
                       [placeholder]="t('changePassword.newPasswordPlaceholder')" autocomplete="new-password">
                <button type="button" class="pw-eye" (click)="show.set(!show())"
                        [attr.aria-label]="t(show() ? 'login.hidePassword' : 'login.showPassword')"
                        [title]="t(show() ? 'login.hidePassword' : 'login.showPassword')">
                  @if (show()) { <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg> } @else { <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> }
                </button>
              </div>
            </div>
            <div class="field">
              <label>{{ t('changePassword.repeatPassword') }}</label>
              <input [type]="show() ? 'text' : 'password'" [(ngModel)]="confirmPass" name="confirmPass"
                     placeholder="••••••••" autocomplete="new-password">
            </div>
            @if (errorMsg()) { <div class="l-error">{{ errorMsg() }}</div> }
            <button class="lbtn" type="submit" [disabled]="loading() || !newPass || !confirmPass">
              @if (loading()) { <span class="spinner"></span> {{ t('changePassword.submitting') }} }
              @else { {{ t('changePassword.submit') }} }
            </button>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [`
    #login-screen { position:fixed; top:var(--test-banner-height, 0px); right:0; bottom:0; left:0; background:radial-gradient(circle at 20% 10%, var(--orange-pale), var(--gray-50) 60%); display:flex; align-items:center; justify-content:center; }
    .login-card { background:var(--surface); border-radius:16px; width:420px; max-width:95vw; overflow:hidden; box-shadow:var(--shadow-lg); }
    .login-top { background:#292A2D; padding:28px 32px 24px; text-align:center; }
    .login-logo-img { width:340px; max-width:100%; height:auto; display:block; margin:0 auto 4px; }
    .login-sub { font-size:14px; color:var(--gray-400); }
    .login-body { padding:28px 32px 32px; }
    .cp-title { font-family:'Sora',sans-serif; font-size:18px; font-weight:700; color:var(--gray-900); margin-bottom:6px; }
    .cp-hint  { font-size:14px; color:var(--gray-500); margin:0 0 18px; line-height:1.6; }
    .field { display:flex; flex-direction:column; gap:6px; margin-bottom:16px; position:relative; }
    .field label { font-size:12px; font-weight:500; color:var(--gray-600); }
    .field input { padding:12px 14px; border:1px solid var(--gray-200); border-radius:12px; font-size:14px; outline:none; background:var(--surface); transition:border-color .12s, box-shadow .12s; }
    .field input:focus { border-color:var(--orange); box-shadow:0 0 0 3px rgba(59,170,93,.15); }
    .pw-wrap { position:relative; }
    .pw-wrap input { width:100%; box-sizing:border-box; padding-right:44px !important; }
    .pw-eye { position:absolute; right:4px; top:50%; transform:translateY(-50%); width:32px; height:32px; padding:0; border:none; border-radius:50%; background:none; display:flex; align-items:center; justify-content:center; color:var(--gray-400); cursor:pointer; transition:background .15s, color .15s; }
    .pw-eye:hover { background:var(--gray-100); color:var(--gray-700); }
    .lbtn { width:100%; background:var(--green-gradient); color:white; border:none; border-radius:12px; padding:12px; font-size:14px; font-weight:500; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:var(--shadow-sm); transition:filter .15s, box-shadow .15s; margin-top:4px; }
    .lbtn:hover:not(:disabled) { filter:brightness(.95); box-shadow:var(--shadow); }
    .lbtn:disabled { opacity:.6; cursor:not-allowed; }
    .l-error { background:var(--gray-50); border:1px solid color-mix(in srgb, #fecaca var(--tint-mix), var(--surface)); border-radius:12px; padding:8px 12px; font-size:14px; color:oklch(from #dc2626 max(l, var(--text-min-l)) c h); margin-bottom:12px; }
    .spinner { width:16px; height:16px; border:2px solid rgba(255,255,255,.3); border-top-color:var(--surface); border-radius:50%; animation:spin .7s linear infinite; display:inline-block; }
    @keyframes spin { to { transform:rotate(360deg); } }
  `],
})
export class ChangePasswordComponent {
  private auth   = inject(AuthService);
  private router = inject(Router);
  private transloco = inject(TranslocoService);

  loading     = signal(false);
  show        = signal(false);
  errorMsg    = signal('');
  newPass     = '';
  confirmPass = '';

  submit(): void {
    this.errorMsg.set('');
    if (this.newPass.length < 8)            { this.errorMsg.set(this.transloco.translate('auth.changePassword.errors.tooShort')); return; }
    if (this.newPass !== this.confirmPass)   { this.errorMsg.set(this.transloco.translate('auth.changePassword.errors.mismatch')); return; }

    this.loading.set(true);
    this.auth.changePassword(null, this.newPass).subscribe({
      next: () => {
        this.auth.loadCurrentUser().subscribe({
          next: user => {
            this.loading.set(false);
            this.router.navigateByUrl(this.auth.landingUrl(user));
          },
          error: () => { this.loading.set(false); this.router.navigate(['/dashboard']); },
        });
      },
      error: err => { this.loading.set(false); this.errorMsg.set(localizedApiErrorMessage(err?.error?.error, this.transloco) ?? this.transloco.translate('auth.changePassword.errors.failed')); },
    });
  }
}
