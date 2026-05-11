import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'wt-change-password',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div id="login-screen">
      <div class="login-card">
        <div class="login-top">
          <img class="login-logo-img" src="assets/crmtree-logo.png" alt="CRMtree">
          <div class="login-sub">Platforma CRM</div>
        </div>
        <div class="login-body">
          <div class="cp-title">Ustaw nowe hasło</div>
          <p class="cp-hint">Twoje hasło tymczasowe wygasło. Ustaw własne hasło przed kontynuowaniem.</p>
          <form (ngSubmit)="submit()">
            <div class="field">
              <label>Nowe hasło</label>
              <input [type]="show() ? 'text' : 'password'" [(ngModel)]="newPass" name="newPass"
                     placeholder="min. 8 znaków" autocomplete="new-password">
              <button type="button" class="pass-toggle" (click)="show.set(!show())">{{ show() ? 'Ukryj' : 'Pokaż' }}</button>
            </div>
            <div class="field">
              <label>Powtórz hasło</label>
              <input [type]="show() ? 'text' : 'password'" [(ngModel)]="confirmPass" name="confirmPass"
                     placeholder="••••••••" autocomplete="new-password">
            </div>
            @if (errorMsg()) { <div class="l-error">{{ errorMsg() }}</div> }
            <button class="lbtn" type="submit" [disabled]="loading() || !newPass || !confirmPass">
              @if (loading()) { <span class="spinner"></span> Zapisuję… }
              @else { Ustaw hasło i zaloguj }
            </button>
          </form>
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
    .login-body { padding:24px 32px 28px; }
    .cp-title { font-size:17px; font-weight:600; color:var(--gray-900); margin-bottom:6px; }
    .cp-hint  { font-size:13px; color:var(--gray-500); margin:0 0 18px; line-height:1.6; }
    .field { display:flex; flex-direction:column; gap:5px; margin-bottom:14px; position:relative; }
    .field label { font-size:12px; font-weight:600; color:var(--gray-600); }
    .field input { padding:9px 12px; border:1px solid var(--gray-300); border-radius:8px; font-size:14px; outline:none; transition:border-color .12s; }
    .field input:focus { border-color:var(--orange); box-shadow:0 0 0 3px rgba(59,170,93,.12); }
    .pass-toggle { position:absolute; right:10px; bottom:9px; background:none; border:none; font-size:12px; color:var(--gray-400); cursor:pointer; }
    .lbtn { width:100%; background:var(--orange); color:white; border:none; border-radius:8px; padding:12px; font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; transition:background .15s; margin-top:4px; }
    .lbtn:hover:not(:disabled) { background:var(--orange-dark); }
    .lbtn:disabled { opacity:.6; cursor:not-allowed; }
    .l-error { background:#fef2f2; border:1px solid #fecaca; border-radius:7px; padding:9px 12px; font-size:13px; color:#dc2626; margin-bottom:12px; }
    .spinner { width:16px; height:16px; border:2px solid rgba(255,255,255,.3); border-top-color:white; border-radius:50%; animation:spin .7s linear infinite; display:inline-block; }
    @keyframes spin { to { transform:rotate(360deg); } }
  `],
})
export class ChangePasswordComponent {
  private auth   = inject(AuthService);
  private router = inject(Router);

  loading     = signal(false);
  show        = signal(false);
  errorMsg    = signal('');
  newPass     = '';
  confirmPass = '';

  submit(): void {
    this.errorMsg.set('');
    if (this.newPass.length < 8)            { this.errorMsg.set('Hasło musi mieć minimum 8 znaków'); return; }
    if (this.newPass !== this.confirmPass)   { this.errorMsg.set('Hasła nie są identyczne'); return; }

    this.loading.set(true);
    this.auth.changePassword(null, this.newPass).subscribe({
      next: () => {
        this.auth.loadCurrentUser().subscribe({
          next: user => {
            this.loading.set(false);
            const dest = (user.crm_role === 'salesperson' || user.crm_role === 'sales_manager')
              ? '/crm/dashboard' : '/dashboard';
            this.router.navigate([dest]);
          },
          error: () => { this.loading.set(false); this.router.navigate(['/dashboard']); },
        });
      },
      error: err => { this.loading.set(false); this.errorMsg.set(err?.error?.error ?? 'Błąd zmiany hasła'); },
    });
  }
}
