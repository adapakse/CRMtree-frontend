// src/app/pages/my-settings/my-settings.component.ts
import { Component, OnInit, inject, signal, computed, ChangeDetectorRef } from '@angular/core';
import { LanguagePickerComponent } from '../../shared/components/language-picker/language-picker.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { sanitizeEmailHtml } from '../../shared/utils/email-html.util';
import { QuillModule } from 'ngx-quill';
import { environment } from '../../../environments/environment';
import { CrmApiService, EmailTemplate } from '../../core/services/crm-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { CrmSubstitutionsComponent } from '../crm/substitutions/crm-substitutions.component';
import { MyProjectNotificationsComponent } from './my-project-notifications.component';
import { MyDevicesComponent } from './my-devices.component';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { LocaleService } from '../../core/i18n/locale.service';
import { localizedApiErrorMessage } from '../../core/services/api-error.util';

const BASE = environment.apiUrl;

@Component({
  selector: 'wt-my-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, QuillModule, CrmSubstitutionsComponent, MyDevicesComponent, MyProjectNotificationsComponent, LanguagePickerComponent, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('account')],
  template: `
<ng-container *transloco="let t; prefix: 'account'">
<div id="topbar">
  <span class="page-title">{{ t('mySettings.title') }}</span>
</div>

<div id="content" style="padding:24px;max-width:860px;display:flex;flex-direction:column;gap:24px">

  <div class="card settings-head">
    <wt-language-picker mode="user" />
    <div class="manual-entry">
      <div class="manual-title">📘 {{ t('mySettings.manual.title') }}</div>
      <p class="manual-hint">{{ t('mySettings.manual.hint') }}</p>
      <a class="btn btn-p" [href]="manualUrl()" target="_blank" rel="noopener">{{ t('mySettings.manual.open') }}</a>
    </div>
  </div>

  <!-- ── Zmiana hasła ───────────────────────────────────────────────────── -->
  <div class="card" style="padding:24px">
    <h2 style="font-family:'Sora',sans-serif;font-size:16px;font-weight:700;color:#333333;margin:0 0 4px;display:flex;align-items:center;gap:8px">
      🔑 {{ t('mySettings.password.title') }}
    </h2>
    <p style="font-size:12px;color:#6b7280;margin:0 0 20px;line-height:1.5">
      {{ t('mySettings.password.hint') }}
    </p>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:end">
      <div>
        <label class="fl" style="display:block;margin-bottom:8px">
          {{ t('mySettings.password.current') }}
        </label>
        <div class="pw-wrap">
          <input class="fi" [type]="isPasswordShown('current') ? 'text' : 'password'" [(ngModel)]="pwdCurrent" autocomplete="current-password">
          <ng-container *ngTemplateOutlet="pwdEye; context: { $implicit: 'current' }" />
        </div>
      </div>
      <div>
        <label class="fl" style="display:block;margin-bottom:8px">
          {{ t('mySettings.password.new') }}
        </label>
        <div class="pw-wrap">
          <input class="fi" [type]="isPasswordShown('new') ? 'text' : 'password'" [(ngModel)]="pwdNew" autocomplete="new-password">
          <ng-container *ngTemplateOutlet="pwdEye; context: { $implicit: 'new' }" />
        </div>
      </div>
      <div>
        <label class="fl" style="display:block;margin-bottom:8px">
          {{ t('mySettings.password.repeat') }}
        </label>
        <div class="pw-wrap">
          <input class="fi" [type]="isPasswordShown('repeat') ? 'text' : 'password'" [(ngModel)]="pwdRepeat" autocomplete="new-password">
          <ng-container *ngTemplateOutlet="pwdEye; context: { $implicit: 'repeat' }" />
        </div>
      </div>
    </div>

    <ng-template #pwdEye let-field>
      <button type="button" class="pw-eye" (click)="togglePasswordShown(field)"
              [attr.aria-label]="t(isPasswordShown(field) ? 'mySettings.password.hide' : 'mySettings.password.show')"
              [title]="t(isPasswordShown(field) ? 'mySettings.password.hide' : 'mySettings.password.show')">
        @if (isPasswordShown(field)) { <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg> } @else { <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> }
      </button>
    </ng-template>

    @if (pwdError) {
      <div style="font-size:12px;color:#991B1B;margin-top:8px">{{ pwdError }}</div>
    }
    <div style="margin-top:20px">
      <button class="btn btn-p" [disabled]="pwdSaving()" (click)="changePassword()">
        {{ pwdSaving() ? t('mySettings.password.saving') : t('mySettings.password.submit') }}
      </button>
    </div>
  </div>

  <!-- ── Stopka email ───────────────────────────────────────────────────── -->
  <div class="card" style="padding:24px">
    <h2 style="font-family:'Sora',sans-serif;font-size:16px;font-weight:700;color:#333333;margin:0 0 4px;display:flex;align-items:center;gap:8px">
      ✉️ {{ t('mySettings.signature.title') }}
    </h2>
    <p style="font-size:12px;color:#6b7280;margin:0 0 20px;line-height:1.5">
      {{ t('mySettings.signature.hint') }}
    </p>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start">

      <!-- Edytor HTML -->
      <div>
        <label class="fl" style="display:block;margin-bottom:8px">
          {{ t('mySettings.signature.htmlLabel') }}
        </label>
        <textarea
          [(ngModel)]="signatureHtml"
          (ngModelChange)="onHtmlChange()"
          [placeholder]="t('mySettings.signature.htmlPlaceholder')"
          class="fta"
          style="height:280px;resize:vertical;box-sizing:border-box;line-height:1.5"
        ></textarea>
        <div style="display:flex;gap:8px;margin-top:20px">
          <button class="btn btn-p" (click)="save()" [disabled]="saving">
            {{ saving ? '⏳ ' + t('mySettings.saving') : '💾 ' + t('mySettings.signature.save') }}
          </button>
          <button class="btn btn-d" (click)="clear()" *ngIf="signatureHtml" [disabled]="saving">
            🗑 {{ t('mySettings.delete') }}
          </button>
        </div>
        <div *ngIf="saveSuccess" style="margin-top:8px;font-size:12px;color:#16a34a;font-weight:600">
          ✓ {{ t('mySettings.signature.saved') }}
        </div>
        <div *ngIf="saveError" style="margin-top:8px;font-size:12px;color:#dc2626">
          {{ saveError }}
        </div>
      </div>

      <!-- Podgląd -->
      <div>
        <label class="fl" style="display:block;margin-bottom:8px">
          {{ t('mySettings.signature.preview') }}
        </label>
        <div style="border:1.5px solid var(--gray-200);border-radius:10px;padding:16px;background:var(--gray-50);min-height:280px;overflow:auto">
          <div *ngIf="!signatureHtml" style="color:#9ca3af;font-size:12px;font-style:italic">
            {{ t('mySettings.signature.empty') }}
          </div>
          <div *ngIf="signatureHtml" [innerHTML]="safePreview"></div>
        </div>
      </div>

    </div>
  </div>

  <!-- ── Szablony emaili ────────────────────────────────────────────────── -->
  <div class="card" style="padding:24px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">
      <h2 style="font-family:'Sora',sans-serif;font-size:16px;font-weight:700;color:#333333;margin:0;flex:1;display:flex;align-items:center;gap:8px">
        📋 {{ t('mySettings.templates.title') }}
      </h2>
      <button class="btn btn-p" (click)="openTplForm()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> {{ t('mySettings.templates.new') }}</button>
    </div>
    <p style="font-size:12px;color:#6b7280;margin:0 0 16px;line-height:1.5">
      {{ t('mySettings.templates.hint') }}
    </p>

    <!-- Lista szablonów -->
    <div *ngIf="templates.length === 0 && !tplFormVisible" style="color:#9ca3af;font-size:14px;font-style:italic;text-align:center;padding:16px">
      {{ t('mySettings.templates.empty') }}
    </div>
    <div *ngFor="let tpl of templates" style="background:var(--gray-50);border-radius:12px;padding:12px 16px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:14px;font-weight:700;color:#333333;flex:1">{{tpl.name}}</span>
        <button class="btn btn-g btn-sm" (click)="editTpl(tpl)">✏️ {{ t('mySettings.templates.edit') }}</button>
        <button class="btn btn-d btn-sm" (click)="deleteTpl(tpl)" [disabled]="tplSaving">🗑</button>
      </div>
      <div *ngIf="tpl.body" style="font-size:12px;color:#6b7280;margin-top:8px;max-height:48px;overflow:hidden;line-height:1.5"
           [innerHTML]="tplPreview(tpl.body)"></div>
    </div>

    <!-- Formularz dodawania/edycji -->
    <div *ngIf="tplFormVisible" style="border:1.5px solid var(--orange);border-radius:14px;padding:16px;margin-top:8px">
      <h3 style="font-size:14px;font-weight:700;margin:0 0 16px;color:#333333">
        {{ tplEditingId ? t('mySettings.templates.editTitle') : t('mySettings.templates.new') }}
      </h3>
      <label class="fl" style="display:block;margin-bottom:8px">{{ t('mySettings.templates.nameLabel') }} *</label>
      <input [(ngModel)]="tplForm.name" [placeholder]="t('mySettings.templates.namePlaceholder')"
             class="fi" style="margin-bottom:16px">
      <label class="fl" style="display:block;margin-bottom:8px">{{ t('mySettings.templates.bodyLabel') }} *</label>
      <quill-editor [(ngModel)]="tplForm.body" [modules]="quillModules"
                    style="background:white"
                    [placeholder]="t('mySettings.templates.bodyPlaceholder')"></quill-editor>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
        <button class="btn btn-g" (click)="cancelTplForm()">{{ 'actions.cancel' | transloco }}</button>
        <button class="btn btn-p" (click)="saveTpl()" [disabled]="!tplForm.name || tplSaving">
          {{ tplSaving ? '⏳ ' + t('mySettings.saving') : '💾 ' + ('actions.save' | transloco) }}
        </button>
      </div>
      <div *ngIf="tplError" style="margin-top:8px;font-size:12px;color:#dc2626">{{tplError}}</div>
    </div>
  </div>

  <wt-my-devices />

  <!-- ── Softphone PBX ──────────────────────────────────────────────────── -->
  <div class="card" style="padding:24px" *ngIf="auth.hasFeature('pbx')">
    <h2 style="font-family:'Sora',sans-serif;font-size:16px;font-weight:700;color:#333333;margin:0 0 4px;display:flex;align-items:center;gap:8px">
      📞 {{ t('mySettings.pbx.title') }}
    </h2>
    <p style="font-size:12px;color:#6b7280;margin:0 0 20px;line-height:1.5">
      {{ t('mySettings.pbx.hint') }}
    </p>

    <!-- Status -->
    <div *ngIf="pbxLoading" style="font-size:14px;color:#6b7280">{{ 'states.loading' | transloco }}</div>

    <div *ngIf="!pbxLoading">
      <!-- Skonfigurowany -->
      <div *ngIf="pbxConfigured"
           style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:#f0fdf4;border-radius:12px;margin-bottom:16px">
        <span style="font-size:18px;flex-shrink:0">✅</span>
        <div>
          <div style="font-size:14px;font-weight:600;color:#166534">{{ t('mySettings.pbx.configured') }}</div>
          <div *ngIf="pbxDirectPhone" style="font-size:12px;color:#166534;margin-top:1px">
            {{ t('mySettings.pbx.directPhone') }} <strong>{{pbxDirectPhone}}</strong>
          </div>
          <div *ngIf="!pbxDirectPhone" style="font-size:12px;color:#6b7280;margin-top:1px">
            {{ t('mySettings.pbx.noDirectPhone') }}
          </div>
        </div>
      </div>

      <!-- Nieskonfigurowany -->
      <div *ngIf="!pbxConfigured"
           style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:#fefce8;border-radius:12px;margin-bottom:16px">
        <span style="font-size:18px;flex-shrink:0">⚠️</span>
        <div style="font-size:14px;color:#854d0e">{{ t('mySettings.pbx.notConfigured') }}</div>
      </div>

      <!-- Formularz tokenu -->
      <div>
        <label class="fl" style="display:block;margin-bottom:8px">
          Personal Access Token (PAT)
        </label>
        <div style="display:flex;gap:8px;align-items:center">
          <input
            [type]="pbxShowToken ? 'text' : 'password'"
            [(ngModel)]="pbxToken"
            [placeholder]="t('mySettings.pbx.tokenPlaceholder')"
            autocomplete="off"
            class="fi"
            style="flex:1;min-width:0"
          />
          <button class="btn btn-g" type="button" (click)="pbxShowToken = !pbxShowToken">
            {{ pbxShowToken ? t('mySettings.pbx.hideToken') : t('mySettings.pbx.showToken') }}
          </button>
        </div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;line-height:1.5">
          {{ t('mySettings.pbx.tokenHelpStart') }} → <em>API Tokens (PAT)</em> → Create token → {{ t('mySettings.pbx.tokenHelpEnd') }}
        </div>
      </div>

      <div style="display:flex;gap:8px;align-items:center;margin-top:20px">
        <button class="btn btn-p" (click)="savePbxToken()" [disabled]="pbxSaving || !pbxToken.trim()">
          {{ pbxSaving ? t('mySettings.saving') : t('mySettings.pbx.saveToken') }}
        </button>
        <button *ngIf="pbxConfigured" class="btn btn-d" (click)="deletePbxToken()"
                [disabled]="pbxSaving">
          {{ t('mySettings.delete') }}
        </button>
      </div>

      <div *ngIf="pbxSaveOk" style="margin-top:8px;font-size:12px;color:#16a34a;font-weight:600">
        ✓ {{ pbxDirectPhone ? t('mySettings.pbx.tokenSavedWithPhone', { phone: pbxDirectPhone }) : t('mySettings.pbx.tokenSaved') }}
      </div>
      <div *ngIf="pbxSaveErr" style="margin-top:8px;font-size:12px;color:#dc2626">
        {{pbxSaveErr}}
      </div>

      <!-- Powiadomienia systemowe o połączeniach przychodzących -->
      <div style="margin-top:24px;padding-top:24px;border-top:1px solid var(--gray-100)">
        <div style="font-size:14px;font-weight:600;color:#333333;margin-bottom:4px">
          {{ t('mySettings.pbx.notifications.title') }}
        </div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:12px">
          {{ t('mySettings.pbx.notifications.hint') }}
        </div>

        <ng-container [ngSwitch]="notifBrowserPerm">
          <div *ngSwitchCase="'granted'"
               style="font-size:12px;color:#16a34a;font-weight:600">
            ✓ {{ t('mySettings.pbx.notifications.enabled') }}
          </div>
          <div *ngSwitchCase="'denied'"
               style="font-size:12px;color:#dc2626">
            ✗ {{ t('mySettings.pbx.notifications.blocked') }}<br>
            <span style="color:#6b7280">{{ t('mySettings.pbx.notifications.unblockPath') }}</span>
          </div>
          <div *ngSwitchDefault style="display:flex;align-items:center;gap:12px">
            <button class="btn btn-p" (click)="enableNotifications()">
              {{ t('mySettings.pbx.notifications.enable') }}
            </button>
            <span style="font-size:12px;color:#9ca3af">{{ t('mySettings.pbx.notifications.permissionHint') }}</span>
          </div>
        </ng-container>
      </div>
    </div>
  </div>

  <div *ngIf="auth.hasFeature('projects')">
    <wt-my-project-notifications></wt-my-project-notifications>
  </div>

  <!-- ── Zastępstwa podczas nieobecności ─────────────────────────────────── -->
  <div *ngIf="canSeeSubstitutions">
    <wt-crm-substitutions></wt-crm-substitutions>
  </div>

</div>
</ng-container>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; height:100%; }
    #topbar { height:60px; background:white; border-bottom:1px solid var(--gray-200); display:flex; align-items:center; gap:12px; padding:0 24px; flex-shrink:0; }
    .page-title { font-family:'Sora',sans-serif; font-size:18px; font-weight:700; color:var(--gray-900); }
    #content { flex:1; overflow-y:auto; }
    .settings-head { padding:24px; display:flex; flex-wrap:wrap; gap:24px; align-items:flex-start; }
    .settings-head > wt-language-picker { flex:1 1 320px; }
    .manual-entry { flex:0 1 280px; border-left:1px solid #e5e7eb; padding-left:24px; }
    .manual-title { font-size:14px; font-weight:600; color:#333333; }
    .manual-hint { font-size:12px; color:#6b7280; margin:6px 0 12px; }
    a.btn { text-decoration:none; }
    .pw-wrap { position:relative; }
    .pw-wrap input { width:100%; box-sizing:border-box; padding-right:44px !important; }
    .pw-eye { position:absolute; right:4px; top:50%; transform:translateY(-50%); width:32px; height:32px; padding:0; border:none; border-radius:50%; background:none; display:flex; align-items:center; justify-content:center; color:var(--gray-400); cursor:pointer; transition:background .15s, color .15s; }
    .pw-eye:hover { background:var(--gray-100); color:var(--gray-700); }
  `],
})
export class MySettingsComponent implements OnInit {
  private http       = inject(HttpClient);
  private sanitizer  = inject(DomSanitizer);
  private cdr        = inject(ChangeDetectorRef);
  private api        = inject(CrmApiService);
  auth               = inject(AuthService);
  private transloco  = inject(TranslocoService);
  private locale     = inject(LocaleService);

  // src/assets/manual has a page for every interface language.
  readonly manualUrl = computed(() => `/assets/manual/${this.locale.activeLocale()}.html`);

  /** Substitutions panel — same scope as crmGuard: admin | salesperson | sales_manager. */
  get canSeeSubstitutions(): boolean {
    const role = this.auth.currentUser?.crm_role;
    return this.auth.isAdmin() || role === 'salesperson' || role === 'sales_manager';
  }

  // ── Zmiana hasła ────────────────────────────────────────────────────────────
  // Ekran /change-password jest wymuszany po pierwszym logowaniu; stąd user nie
  // miał gdzie zmienić hasła z własnej woli. Endpoint istniał od dawna i sam
  // wymaga starego hasła, więc wystarczyło dać do niego wejście.
  pwdCurrent = '';
  pwdNew     = '';
  pwdRepeat  = '';
  pwdError   = '';
  pwdSaving  = signal(false);
  private readonly shownPasswords = signal<ReadonlySet<string>>(new Set());

  isPasswordShown(field: string): boolean { return this.shownPasswords().has(field); }

  togglePasswordShown(field: string): void {
    const next = new Set(this.shownPasswords());
    if (!next.delete(field)) next.add(field);
    this.shownPasswords.set(next);
  }

  changePassword(): void {
    this.pwdError = '';
    if (this.pwdNew.length < 8) {
      this.pwdError = this.transloco.translate('account.mySettings.password.tooShort');
      return;
    }
    if (this.pwdNew !== this.pwdRepeat) {
      this.pwdError = this.transloco.translate('account.mySettings.password.mismatch');
      return;
    }
    this.pwdSaving.set(true);
    this.auth.changePassword(this.pwdCurrent || null, this.pwdNew).subscribe({
      next: () => {
        this.pwdSaving.set(false);
        this.pwdCurrent = ''; this.pwdNew = ''; this.pwdRepeat = '';
        this.pwdError = '';
        alert(this.transloco.translate('account.mySettings.password.saved'));
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.pwdSaving.set(false);
        // Backend zwraca tu czytelny powód (złe aktualne hasło, za krótkie).
        this.pwdError = localizedApiErrorMessage(err?.error?.error, this.transloco) ?? this.transloco.translate('account.mySettings.password.saveFailed');
        this.cdr.markForCheck();
      },
    });
  }

  // ── Stopka ──────────────────────────────────────────────────────────────────
  signatureHtml = '';
  safePreview: SafeHtml = '';
  saving      = false;
  saveSuccess = false;
  saveError   = '';

  // ── Szablony emaili ─────────────────────────────────────────────────────────
  templates: EmailTemplate[] = [];
  tplFormVisible = false;
  tplEditingId: string | null = null;
  tplForm = { name: '', body: '' };
  tplSaving = false;
  tplError  = '';

  readonly quillModules = {
    toolbar: [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link'], ['clean']],
  };

  // ── Softphone PBX (self-service PAT) ──────────────────────────────────────────
  pbxLoading     = true;
  pbxConfigured  = false;
  pbxDirectPhone = '';
  pbxToken       = '';
  pbxShowToken   = false;
  pbxSaving      = false;
  pbxSaveOk      = false;
  pbxSaveErr     = '';

  notifBrowserPerm: NotificationPermission = ('Notification' in window)
    ? Notification.permission
    : 'denied';

  async enableNotifications(): Promise<void> {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    this.notifBrowserPerm = result;
    this.cdr.markForCheck();
  }

  ngOnInit() {
    this.http.get<{ html: string }>(`${BASE}/profile/signature`).subscribe({
      next: r => { this.signatureHtml = r.html || ''; this.updatePreview(); this.cdr.markForCheck(); },
      error: () => {},
    });
    this.loadTemplates();
    if (this.auth.hasFeature('pbx')) this.loadPbxStatus();
  }

  loadPbxStatus() {
    this.pbxLoading = true;
    this.http.get<any>(`${BASE}/pbx/my-pat`).subscribe({
      next: r => {
        this.pbxConfigured  = r.configured;
        this.pbxDirectPhone = r.direct_phone ?? '';
        this.pbxLoading     = false;
        this.cdr.markForCheck();
      },
      error: () => { this.pbxLoading = false; this.cdr.markForCheck(); },
    });
  }

  savePbxToken() {
    const pat = this.pbxToken.trim();
    if (!pat) return;
    this.pbxSaving  = true;
    this.pbxSaveOk  = false;
    this.pbxSaveErr = '';
    this.http.put<any>(`${BASE}/pbx/my-pat`, { pat_token: pat }).subscribe({
      next: r => {
        this.pbxSaving      = false;
        this.pbxSaveOk      = true;
        this.pbxConfigured  = true;
        this.pbxDirectPhone = r.direct_phone ?? '';
        this.pbxToken       = '';
        this.pbxShowToken   = false;
        this.cdr.markForCheck();
        setTimeout(() => { this.pbxSaveOk = false; this.cdr.markForCheck(); }, 4000);
      },
      error: err => {
        this.pbxSaving  = false;
        this.pbxSaveErr = localizedApiErrorMessage(err.error?.error, this.transloco) ?? this.transloco.translate('account.mySettings.saveFailed');
        this.cdr.markForCheck();
      },
    });
  }

  deletePbxToken() {
    this.pbxSaving  = true;
    this.pbxSaveErr = '';
    this.http.delete(`${BASE}/pbx/my-pat`).subscribe({
      next: () => {
        this.pbxSaving      = false;
        this.pbxConfigured  = false;
        this.pbxDirectPhone = '';
        this.cdr.markForCheck();
      },
      error: () => { this.pbxSaving = false; this.cdr.markForCheck(); },
    });
  }

  // ── Stopka ──────────────────────────────────────────────────────────────────

  onHtmlChange() {
    this.saveSuccess = false;
    this.saveError   = '';
    this.updatePreview();
  }

  updatePreview() {
    this.safePreview = this.sanitizer.bypassSecurityTrustHtml(sanitizeEmailHtml(this.signatureHtml));
  }

  save() {
    this.saving     = true;
    this.saveSuccess = false;
    this.saveError   = '';
    this.http.put(`${BASE}/profile/signature`, { html: this.signatureHtml }).subscribe({
      next: () => {
        this.saving = false; this.saveSuccess = true;
        this.cdr.markForCheck();
        setTimeout(() => { this.saveSuccess = false; this.cdr.markForCheck(); }, 3000);
      },
      error: () => {
        this.saving    = false;
        this.saveError = this.transloco.translate('account.mySettings.saveFailed');
        this.cdr.markForCheck();
      },
    });
  }

  clear() {
    if (!confirm(this.transloco.translate('account.mySettings.signature.deleteConfirm'))) return;
    this.signatureHtml = '';
    this.updatePreview();
    this.save();
  }

  // ── Szablony emaili ─────────────────────────────────────────────────────────

  loadTemplates() {
    this.api.getEmailTemplates().subscribe({
      next: r => { this.templates = r; this.cdr.markForCheck(); },
      error: () => {},
    });
  }

  openTplForm() {
    this.tplEditingId   = null;
    this.tplForm        = { name: '', body: '' };
    this.tplError       = '';
    this.tplFormVisible = true;
  }

  editTpl(t: EmailTemplate) {
    this.tplEditingId   = t.id;
    this.tplForm        = { name: t.name, body: t.body };
    this.tplError       = '';
    this.tplFormVisible = true;
  }

  cancelTplForm() {
    this.tplFormVisible = false;
    this.tplEditingId   = null;
  }

  saveTpl() {
    if (!this.tplForm.name.trim()) return;
    this.tplSaving = true;
    this.tplError  = '';
    const data = { name: this.tplForm.name.trim(), body: this.tplForm.body };
    const req = this.tplEditingId
      ? this.api.updateEmailTemplate(this.tplEditingId, data)
      : this.api.createEmailTemplate(data);

    req.subscribe({
      next: () => {
        this.tplSaving = false;
        this.tplFormVisible = false;
        this.tplEditingId = null;
        this.loadTemplates();
        this.cdr.markForCheck();
      },
      error: () => {
        this.tplSaving = false;
        this.tplError  = this.transloco.translate('account.mySettings.saveFailed');
        this.cdr.markForCheck();
      },
    });
  }

  deleteTpl(t: EmailTemplate) {
    if (!confirm(this.transloco.translate('account.mySettings.templates.deleteConfirm', { name: t.name }))) return;
    this.tplSaving = true;
    this.api.deleteEmailTemplate(t.id).subscribe({
      next: () => {
        this.tplSaving = false;
        this.loadTemplates();
        this.cdr.markForCheck();
      },
      error: () => {
        this.tplSaving = false;
        this.cdr.markForCheck();
      },
    });
  }

  tplPreview(body: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(sanitizeEmailHtml(body));
  }
}
