// src/app/pages/my-settings/my-settings.component.ts
import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { QuillModule } from 'ngx-quill';
import { environment } from '../../../environments/environment';
import { CrmApiService, EmailTemplate } from '../../core/services/crm-api.service';
import { AuthService } from '../../core/auth/auth.service';

const BASE = environment.apiUrl;

@Component({
  selector: 'wt-my-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, QuillModule],
  template: `
<div id="topbar">
  <span class="page-title">Moje ustawienia</span>
</div>

<div id="content" style="padding:24px;max-width:860px;display:flex;flex-direction:column;gap:20px">

  <!-- ── Stopka email ───────────────────────────────────────────────────── -->
  <div class="card" style="padding:24px">
    <h2 style="font-family:'Sora',sans-serif;font-size:15px;font-weight:700;color:#18181b;margin:0 0 6px">
      ✉️ Moja stopka email
    </h2>
    <p style="font-size:12.5px;color:#6b7280;margin:0 0 20px;line-height:1.5">
      Wklej poniżej kod HTML swojej stopki. Zostanie ona automatycznie doklejona do każdego maila
      wysłanego z systemu (Leady i Rejestr partnerów). Możesz użyć gotowego HTML z klientem poczty
      lub narzędzia do budowania stopek — np. HubSpot Email Signature Generator.
    </p>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">

      <!-- Edytor HTML -->
      <div>
        <label style="font-size:11px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px">
          Kod HTML stopki
        </label>
        <textarea
          [(ngModel)]="signatureHtml"
          (ngModelChange)="onHtmlChange()"
          placeholder="Wklej tutaj kod HTML stopki…"
          style="width:100%;height:280px;font-family:monospace;font-size:11px;padding:10px;border:1px solid #d1d5db;border-radius:8px;resize:vertical;box-sizing:border-box;color:#374151;line-height:1.5"
        ></textarea>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn btn-p" (click)="save()" [disabled]="saving">
            {{ saving ? '⏳ Zapisywanie…' : '💾 Zapisz stopkę' }}
          </button>
          <button class="btn btn-g btn-sm" (click)="clear()" *ngIf="signatureHtml" [disabled]="saving">
            🗑 Usuń
          </button>
        </div>
        <div *ngIf="saveSuccess" style="margin-top:8px;font-size:12px;color:#16a34a;font-weight:600">
          ✓ Stopka zapisana
        </div>
        <div *ngIf="saveError" style="margin-top:8px;font-size:12px;color:#dc2626">
          {{ saveError }}
        </div>
      </div>

      <!-- Podgląd -->
      <div>
        <label style="font-size:11px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px">
          Podgląd
        </label>
        <div style="border:1px solid #d1d5db;border-radius:8px;padding:16px;background:#fafafa;min-height:280px;overflow:auto">
          <div *ngIf="!signatureHtml" style="color:#9ca3af;font-size:12px;font-style:italic">
            Brak stopki — wklej HTML po lewej
          </div>
          <div *ngIf="signatureHtml" [innerHTML]="safePreview"></div>
        </div>
      </div>

    </div>
  </div>

  <!-- ── Szablony emaili ────────────────────────────────────────────────── -->
  <div class="card" style="padding:24px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <h2 style="font-family:'Sora',sans-serif;font-size:15px;font-weight:700;color:#18181b;margin:0;flex:1">
        📋 Szablony emaili
      </h2>
      <button class="btn btn-p btn-sm" (click)="openTplForm()">+ Nowy szablon</button>
    </div>
    <p style="font-size:12.5px;color:#6b7280;margin:0 0 16px;line-height:1.5">
      Zapisz gotowe treści wiadomości, które możesz szybko wstawić podczas pisania emaila do leada lub partnera.
    </p>

    <!-- Lista szablonów -->
    <div *ngIf="templates.length === 0 && !tplFormVisible" style="color:#9ca3af;font-size:13px;font-style:italic;text-align:center;padding:16px">
      Brak szablonów. Kliknij „+ Nowy szablon", aby dodać pierwszy.
    </div>
    <div *ngFor="let t of templates" style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:13px;font-weight:700;color:#18181b;flex:1">{{t.name}}</span>
        <button class="btn btn-g btn-sm" (click)="editTpl(t)">✏️ Edytuj</button>
        <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:none" (click)="deleteTpl(t)" [disabled]="tplSaving">🗑</button>
      </div>
      <div *ngIf="t.body" style="font-size:11px;color:#6b7280;margin-top:6px;max-height:48px;overflow:hidden;line-height:1.5"
           [innerHTML]="tplPreview(t.body)"></div>
    </div>

    <!-- Formularz dodawania/edycji -->
    <div *ngIf="tplFormVisible" style="border:1px solid #3BAA5D;border-radius:10px;padding:16px;margin-top:8px">
      <h3 style="font-size:13px;font-weight:700;margin:0 0 12px;color:#18181b">
        {{tplEditingId ? 'Edycja szablonu' : 'Nowy szablon'}}
      </h3>
      <label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Nazwa szablonu *</label>
      <input [(ngModel)]="tplForm.name" placeholder="np. Intro spotkanie, Follow-up po demo…"
             style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;box-sizing:border-box;margin-bottom:12px;outline:none">
      <label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Treść *</label>
      <quill-editor [(ngModel)]="tplForm.body" [modules]="quillModules"
                    style="background:white;margin-bottom:12px"
                    placeholder="Treść szablonu…"></quill-editor>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button class="btn btn-g btn-sm" (click)="cancelTplForm()">Anuluj</button>
        <button class="btn btn-p btn-sm" (click)="saveTpl()" [disabled]="!tplForm.name || tplSaving">
          {{tplSaving ? '⏳ Zapisywanie…' : '💾 Zapisz'}}
        </button>
      </div>
      <div *ngIf="tplError" style="margin-top:8px;font-size:12px;color:#dc2626">{{tplError}}</div>
    </div>
  </div>

  <!-- ── Softphone PBX ──────────────────────────────────────────────────── -->
  <div class="card" style="padding:24px" *ngIf="auth.hasFeature('pbx')">
    <h2 style="font-family:'Sora',sans-serif;font-size:15px;font-weight:700;color:#18181b;margin:0 0 6px">
      📞 Softphone — token PBX
    </h2>
    <p style="font-size:12.5px;color:#6b7280;margin:0 0 20px;line-height:1.5">
      Aby korzystać z wbudowanego telefonu, wklej swój Personal Access Token z panelu ip-pbx.eu.
      Token umożliwia aplikacji pobranie Twoich danych SIP. Klienci widzący Twój numer bezpośredni
      mogą oddzwonić prosto do Ciebie.
    </p>

    <!-- Status -->
    <div *ngIf="pbxLoading" style="font-size:13px;color:#6b7280">Ładowanie…</div>

    <div *ngIf="!pbxLoading">
      <!-- Skonfigurowany -->
      <div *ngIf="pbxConfigured"
           style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:16px">
        <span style="font-size:18px">✅</span>
        <div>
          <div style="font-size:13px;font-weight:600;color:#166534">Token skonfigurowany</div>
          <div *ngIf="pbxDirectPhone" style="font-size:12px;color:#166534;margin-top:1px">
            Twój numer bezpośredni: <strong>{{pbxDirectPhone}}</strong>
          </div>
          <div *ngIf="!pbxDirectPhone" style="font-size:12px;color:#6b7280;margin-top:1px">
            Numer bezpośredni nie jest przypisany w PBX
          </div>
        </div>
      </div>

      <!-- Nieskonfigurowany -->
      <div *ngIf="!pbxConfigured"
           style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:#fefce8;border:1px solid #fde68a;border-radius:8px;margin-bottom:16px">
        <span style="font-size:18px">⚠️</span>
        <div style="font-size:13px;color:#854d0e">Brak tokenu — softphone nie będzie działał.</div>
      </div>

      <!-- Formularz tokenu -->
      <div style="margin-bottom:10px">
        <label style="font-size:11px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px">
          Personal Access Token (PAT)
        </label>
        <div style="display:flex;gap:8px;align-items:center">
          <input
            [type]="pbxShowToken ? 'text' : 'password'"
            [(ngModel)]="pbxToken"
            placeholder="Wklej token z ip-pbx.eu…"
            autocomplete="off"
            style="flex:1;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-family:monospace;color:#111827;outline:none"
          />
          <button class="btn btn-g btn-sm" type="button" (click)="pbxShowToken = !pbxShowToken">
            {{pbxShowToken ? 'Ukryj' : 'Pokaż'}}
          </button>
        </div>
        <div style="font-size:11px;color:#9ca3af;margin-top:5px;line-height:1.5">
          Panel ip-pbx.eu → kliknij swoje imię (prawy górny róg) → <em>API Tokens (PAT)</em> → Create token → skopiuj i wklej tutaj.
        </div>
      </div>

      <div style="display:flex;gap:8px;align-items:center;margin-top:14px">
        <button class="btn btn-p" (click)="savePbxToken()" [disabled]="pbxSaving || !pbxToken.trim()">
          {{pbxSaving ? 'Zapisywanie…' : 'Zapisz token'}}
        </button>
        <button *ngIf="pbxConfigured" class="btn btn-g btn-sm" (click)="deletePbxToken()"
                [disabled]="pbxSaving" style="color:#dc2626">
          Usuń
        </button>
      </div>

      <div *ngIf="pbxSaveOk" style="margin-top:8px;font-size:12px;color:#16a34a;font-weight:600">
        ✓ Token zapisany{{pbxDirectPhone ? ' — numer: ' + pbxDirectPhone : ''}}
      </div>
      <div *ngIf="pbxSaveErr" style="margin-top:8px;font-size:12px;color:#dc2626">
        {{pbxSaveErr}}
      </div>

      <!-- Powiadomienia systemowe o połączeniach przychodzących -->
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid #f3f4f6">
        <div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:6px">
          Powiadomienia o połączeniach
        </div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:10px">
          Wyświetla powiadomienie systemowe gdy dzwoni klient — nawet gdy przeglądarka jest w tle lub pracujesz w innym programie.
        </div>

        <ng-container [ngSwitch]="notifBrowserPerm">
          <div *ngSwitchCase="'granted'"
               style="font-size:12px;color:#16a34a;font-weight:600">
            ✓ Powiadomienia włączone
          </div>
          <div *ngSwitchCase="'denied'"
               style="font-size:12px;color:#dc2626">
            ✗ Powiadomienia zablokowane — odblokuj ręcznie w ustawieniach przeglądarki:<br>
            <span style="color:#6b7280">Kłódka przy adresie strony → Powiadomienia → Zezwalaj</span>
          </div>
          <div *ngSwitchDefault style="display:flex;align-items:center;gap:10px">
            <button class="btn btn-p btn-sm" (click)="enableNotifications()">
              Włącz powiadomienia
            </button>
            <span style="font-size:11px;color:#9ca3af">Przeglądarka zapyta o zgodę</span>
          </div>
        </ng-container>
      </div>
    </div>
  </div>

</div>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; height:100%; }
    #content { flex:1; overflow-y:auto; }
    .card { background:white; border:1px solid #e5e7eb; border-radius:12px; }
    .btn { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; border:none; }
    .btn:disabled { opacity:.5; cursor:not-allowed; }
    .btn-p { background:#3BAA5D; color:white; }
    .btn-g { background:white; border:1px solid #d1d5db; color:#374151; }
    .btn-sm { padding:6px 12px; font-size:12px; }
  `],
})
export class MySettingsComponent implements OnInit {
  private http       = inject(HttpClient);
  private sanitizer  = inject(DomSanitizer);
  private cdr        = inject(ChangeDetectorRef);
  private api        = inject(CrmApiService);
  auth               = inject(AuthService);

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
        this.pbxSaveErr = err.error?.error ?? 'Błąd zapisu — spróbuj ponownie';
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
    this.safePreview = this.sanitizer.bypassSecurityTrustHtml(this.signatureHtml);
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
        this.saveError = 'Błąd zapisu — spróbuj ponownie';
        this.cdr.markForCheck();
      },
    });
  }

  clear() {
    this.signatureHtml = '';
    this.updatePreview();
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
        this.tplError  = 'Błąd zapisu — spróbuj ponownie';
        this.cdr.markForCheck();
      },
    });
  }

  deleteTpl(t: EmailTemplate) {
    if (!confirm(`Usunąć szablon „${t.name}"?`)) return;
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
    return this.sanitizer.bypassSecurityTrustHtml(body);
  }
}
