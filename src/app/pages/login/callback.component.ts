import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'wt-callback',
  standalone: true,
  template: `
    <div style="position:fixed;inset:0;background:var(--gray-900);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;color:white">
      <div class="spinner" style="width:40px;height:40px;border-width:3px"></div>
      <p style="font-size:14px;color:var(--gray-400)">Signing you in…</p>
    </div>
  `,
})
export class CallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private auth  = inject(AuthService);

  ngOnInit(): void {
    const access_token  = this.route.snapshot.queryParamMap.get('access_token')  ?? '';
    const refresh_token = this.route.snapshot.queryParamMap.get('refresh_token') ?? '';
    if (access_token && refresh_token) {
      this.auth.handleCallback(access_token, refresh_token);
    } else {
      this.auth.logout();
    }
  }
}
