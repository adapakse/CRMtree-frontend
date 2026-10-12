import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoService } from '@jsverse/transloco';
import { ToastService } from '../../../core/services/toast.service';
import {
  AiConfig, AiConfigService, AiModelOption, AiProviderOption, AiPurpose,
} from '../../../core/services/ai-config.service';

const CUSTOM_MODEL = '__custom__';

/** A provider the tenant already set up somewhere, offered as a one-click reuse. */
export interface SavedProvider {
  provider: string;
  hint: string;
}

/**
 * One AI feature: its provider, key and model, saved independently of the rest.
 * A tenant can run enrichment at a cheap provider and competitor discovery at
 * another, each billed to its own account.
 *
 * DWIE RZECZY, KTÓRE ŁATWO ZEPSUĆ PRZY PORZĄDKACH W TYM UKŁADZIE:
 *
 * 1. Zapisany klucz pokazujemy jako PLAKIETKĘ z czterema znakami, nie jako puste
 *    pole hasła z długim placeholderem — pole, które wygląda na niewypełnione,
 *    sugeruje, że klucza nie ma.
 * 2. Nie ma osobnego „Sprawdź połączenie". Zapis weryfikuje konfigurację u
 *    dostawcy i nie wymaga ponownego wklejania klucza, więc po doładowaniu
 *    konta wystarczy kliknąć Zapisz.
 *
 * Nie ma wyboru dostawcy z listy: rozpoznajemy go z samego klucza (potwierdzone
 * odpytaniem dostawcy, nie zgadywane z prefiksu — klucze OpenAI i DeepSeeka
 * zaczynają się tak samo od `sk-`). Lista pojawia się tylko wtedy, gdy
 * rozpoznanie zawiedzie, czyli w jedynym przypadku, w którym admin musi nam
 * powiedzieć sam.
 */
@Component({
  selector: 'app-ai-purpose-row',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pr">
      <div class="pr-head">
        <span class="pr-name">{{ t('settings.ai.purpose.' + purpose().key) }}</span>
        @if (config(); as c) {
          @if (c.status === 'active') {
            <span class="badge ok">✓ {{ t('settings.ai.statusActive') }}</span>
          } @else if (c.status === 'invalid') {
            <span class="badge bad">✗ {{ t('settings.ai.statusInvalid') }}</span>
          } @else {
            <span class="badge warn">! {{ t('settings.ai.statusError') }}</span>
          }
        } @else {
          <span class="badge off">{{ t('settings.ai.statusMissing') }}</span>
        }
      </div>

      @if (!supportedProviders().length) {
        <div class="pr-note">🔒 {{ unsupportedReason() }}</div>
      } @else {
        <!-- Jedna linia z wielokropkiem, całość w tooltipie: ten sam komunikat
             dostawcy potrafi powtórzyć się przy kilku funkcjach naraz i rozlany
             na trzy wiersze zamienia kartę w ścianę czerwieni. -->
        @if (config()?.last_error; as err) {
          <div class="pr-error" [title]="err">{{ err }}</div>
        }

        <div class="pr-grid">
          <label class="lbl">{{ t('settings.ai.provider') }}</label>
          <div class="cell">
            @if (detectFailed()) {
              <select class="fsel" [(ngModel)]="draftProvider" (ngModelChange)="onManualProvider()"
                      [disabled]="busy()">
                <option value="">{{ t('settings.ai.provider') }}…</option>
                @for (p of supportedProviders(); track p.key) {
                  <option [value]="p.key">{{ p.label }}</option>
                }
              </select>
              <span class="note warn-text">{{ t('settings.ai.detectFailed') }}</span>
            } @else if (detecting()) {
              <span class="note">{{ t('settings.ai.detecting') }}</span>
            } @else if (effectiveProvider(); as p) {
              <span class="prov">{{ providerLabel(p) }}</span>
              @if (detectedProvider()) {
                <span class="note ok-text">✓ {{ t('settings.ai.detectedShort') }}</span>
              }
            } @else {
              <span class="note">{{ t('settings.ai.detectHint') }}</span>
            }
          </div>

          <label class="lbl">{{ t('settings.ai.apiKey') }}</label>
          <div class="cell">
            @if (settledProvider() && !keyEditing()) {
              <span class="keychip">🔑 ····{{ settledHint() }}</span>
              <button type="button" class="linkbtn" [disabled]="busy()" (click)="startKeyEdit()">
                {{ t('settings.ai.changeKey') }}
              </button>
            } @else {
              <input class="fin key" type="password" autocomplete="off"
                     [(ngModel)]="draftKey" (ngModelChange)="onKeyChange()" [disabled]="busy()"
                     [placeholder]="t('settings.ai.apiKeyPlaceholder')">
              @if (settledProvider()) {
                <button type="button" class="linkbtn" [disabled]="busy()" (click)="cancelKeyEdit()">
                  {{ t('settings.ai.cancel') }}
                </button>
              }
            }
          </div>

          <!-- Dostawcy skonfigurowani już przy innej funkcji: klucz jest zapisany,
               więc wystarczy kliknięcie, zamiast wklejać go drugi raz. -->
          @if (!settledProvider() && !effectiveProvider() && reusableProviders().length) {
            <label class="lbl"></label>
            <div class="cell">
              <span class="note">{{ t('settings.ai.useSaved') }}</span>
              @for (s of reusableProviders(); track s.provider) {
                <button type="button" class="chip" [disabled]="busy()" (click)="useSaved(s.provider)">
                  {{ providerLabel(s.provider) }} ····{{ s.hint }}
                </button>
              }
            </div>
          }

          @if (effectiveProvider()) {
            <label class="lbl">{{ t('settings.ai.model') }}</label>
            <div class="cell">
              @if (models().length && !customModel()) {
                <select class="fsel" [(ngModel)]="draftModel" [disabled]="busy()">
                  <option value="">{{ t('settings.ai.modelDefaultOption', { model: defaultModel() }) }}</option>
                  @for (m of models(); track m.id) {
                    <option [value]="m.id">{{ m.label }}</option>
                  }
                  <!-- Model zapisany wcześniej, a wycofany przez dostawcę, musi
                       zostać widoczny — inaczej lista po cichu podmieniłaby go. -->
                  @if (draftModel && !modelIds().has(draftModel)) {
                    <option [value]="draftModel">{{ draftModel }}</option>
                  }
                  <option [value]="CUSTOM_MODEL">{{ t('settings.ai.modelCustom') }}</option>
                </select>
              } @else {
                <input class="fin" [(ngModel)]="draftModel" [disabled]="busy()"
                       [placeholder]="defaultModel()">
              }
              @if (modelsLoading()) { <span class="note">{{ t('settings.ai.modelsLoading') }}</span> }
            </div>
          }
        </div>

        <!-- Bez osobnego „Sprawdź połączenie": zapis i tak weryfikuje
             konfigurację u dostawcy i działa bez ponownego wklejania klucza, więc
             po doładowaniu konta wystarczy kliknąć Zapisz. Dwa przyciski robiące
             to samo tylko zaśmiecały kartę przy siedmiu funkcjach. -->
        <div class="pr-actions">
          <button class="btn btn-p" [disabled]="busy() || !canSave()" (click)="save()">
            {{ busy() ? t('settings.ai.verifying') : t('settings.ai.saveAndVerify') }}
          </button>
          @if (config()) {
            <button class="btn btn-g" [disabled]="busy()" (click)="remove()">
              {{ t('settings.ai.remove') }}
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .pr { padding:14px 0; border-top:1px solid var(--gray-100); }
    .pr:first-of-type { border-top:0; }
    .pr-head { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    .pr-name { font-size:13.5px; font-weight:600; color:var(--gray-800); }
    .badge { font-size:11px; padding:2px 8px; border-radius:999px; font-weight:600; }
    .badge.ok   { background:#DCFCE7; color:#166534; }
    .badge.bad  { background:#FEE2E2; color:#991B1B; }
    .badge.warn { background:#FEF3C7; color:#92400E; }
    .badge.off  { background:var(--gray-100); color:var(--gray-500); }

    .pr-grid {
      display:grid; grid-template-columns:110px minmax(0,1fr); gap:8px 12px; align-items:center;
    }
    .lbl { font-size:12.5px; color:var(--gray-600); }
    .cell { display:flex; align-items:center; gap:10px; min-width:0; flex-wrap:wrap; }
    .cell .fin, .cell .fsel { flex:1; min-width:200px; max-width:420px; }
    .prov { font-size:13px; font-weight:600; color:var(--gray-800); }

    /* Zapisany klucz jako plakietka, nie puste pole hasła z placeholderem —
       pole wyglądające na niewypełnione sugeruje, że klucza nie ma. */
    .keychip {
      font-size:12px; color:var(--gray-700); background:var(--gray-50);
      border:1px solid var(--gray-200); border-radius:999px; padding:4px 12px;
      font-family:ui-monospace, monospace; letter-spacing:.04em;
    }
    .chip {
      font-size:12px; padding:4px 10px; border-radius:999px; cursor:pointer;
      border:1px solid var(--gray-200); background:white; color:var(--gray-700);
    }
    .chip:hover:not(:disabled) { border-color:var(--orange); color:var(--orange-dark); }
    .linkbtn {
      border:0; background:none; padding:0; cursor:pointer; white-space:nowrap;
      font-size:12px; color:var(--orange-dark); text-decoration:underline;
    }
    .linkbtn:disabled { color:var(--gray-400); cursor:default; }

    .note { font-size:11.5px; color:var(--gray-400); }
    .ok-text { color:#166534; }
    .warn-text { color:#92400E; }
    .pr-note {
      font-size:12px; color:var(--gray-500); background:var(--gray-50);
      border:1px dashed var(--gray-200); border-radius:8px; padding:8px 10px;
    }
    .pr-error {
      font-size:11.5px; color:#B91C1C; background:#FEF2F2; border:1px solid #FECACA;
      border-radius:8px; padding:7px 10px; margin-bottom:10px;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:help;
    }
    /* Przyciski biorą globalny system aplikacji (.btn + .btn-p / .btn-g ze
       styles/global.scss), a nie własne klasy. Wcześniej stały tu nazwy
       „btn-primary" i „btn-danger-sm", które istnieją WYŁĄCZNIE wewnątrz
       komponentu ustawień — w osobnym komponencie nie dosięgały ich żadne style
       i przyciski wyglądały jak surowe, systemowe. */
    .pr-actions { display:flex; gap:8px; margin-top:14px; flex-wrap:wrap; }
    @media (max-width: 720px) { .pr-grid { grid-template-columns:1fr; } }
  `],
})
export class AiPurposeRowComponent {
  private readonly api = inject(AiConfigService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly CUSTOM_MODEL = CUSTOM_MODEL;

  readonly purpose = input.required<AiPurpose>();
  readonly providers = input.required<AiProviderOption[]>();
  readonly config = input.required<AiConfig | null>();
  /** Providers already configured on another feature — their key is stored. */
  readonly savedProviders = input<SavedProvider[]>([]);
  readonly changed = output<void>();

  busy = signal(false);
  models = signal<AiModelOption[]>([]);
  modelsLoading = signal(false);
  customModel = signal(false);
  detecting = signal(false);
  detectFailed = signal(false);
  detectedProvider = signal<string | null>(null);
  keyEditing = signal(false);

  draftKey = '';
  draftModel = '';
  /** Only used on the manual fallback, when recognition could not decide. */
  draftProvider = '';

  private initialisedFor: string | null = null;
  private detectTimer: ReturnType<typeof setTimeout> | null = null;

  modelIds = computed(() => new Set(this.models().map(m => m.id)));

  supportedProviders = computed(() =>
    this.providers().filter(p => !p.unsupported_purposes.includes(this.purpose().key)));

  /** Saved elsewhere AND able to serve this feature. */
  reusableProviders = computed(() => {
    const allowed = new Set(this.supportedProviders().map(p => p.key));
    return this.savedProviders().filter(s => allowed.has(s.provider));
  });

  settledProvider = computed(() => this.config()?.provider ?? null);
  settledHint = computed(() => this.config()?.api_key_hint ?? '');

  /** The provider the save will use: recognised, manually picked, or saved. */
  effectiveProvider = computed(() =>
    this.detectedProvider() ?? (this.draftProvider || null) ?? this.settledProvider());

  statusKind = computed(() => {
    const status = this.config()?.status;
    if (!status) return 'off';
    if (status === 'active') return 'ok';
    return status === 'invalid' ? 'bad' : 'warn';
  });

  constructor() {
    // Wartości startowe pól biorą się z zapisanej konfiguracji; leniwie, bo
    // input() nie jest dostępny w inicjalizatorze pola klasy.
    queueMicrotask(() => this.syncDraft());
  }

  t(key: string, params?: Record<string, unknown>): string {
    return this.transloco.translate(`admin.${key}`, params);
  }

  private syncDraft(): void {
    const key = this.purpose().key;
    if (this.initialisedFor === key) return;
    this.initialisedFor = key;
    this.draftModel = this.config()?.model ?? '';
    const provider = this.settledProvider();
    if (provider) this.loadModelsFor(provider);
  }

  providerLabel(key: string): string {
    return this.providers().find(p => p.key === key)?.label ?? key;
  }

  defaultModel(): string {
    const provider = this.effectiveProvider();
    if (!provider) return '';
    return this.providers().find(p => p.key === provider)?.default_models?.[this.purpose().key] ?? '';
  }

  /** Why no provider can serve this feature — names the missing capability. */
  unsupportedReason(): string {
    const requires = this.purpose().requires;
    const key = requires === 'webSearch' ? 'settings.ai.needsWebSearch' : 'settings.ai.needsStructuredOutput';
    const providers = this.purpose().supported_by.map(k => this.providerLabel(k)).join(', ');
    return this.t(key, { providers });
  }

  canSave(): boolean {
    return Boolean(this.effectiveProvider()) || this.draftKey.trim().length > 20;
  }

  startKeyEdit(): void {
    this.keyEditing.set(true);
    this.draftKey = '';
    this.detectedProvider.set(null);
    this.detectFailed.set(false);
  }

  cancelKeyEdit(): void {
    this.keyEditing.set(false);
    this.draftKey = '';
    this.detectedProvider.set(null);
    this.detectFailed.set(false);
  }

  /**
   * Rozpoznanie jedzie do backendu, który potwierdza je u dostawcy — dlatego
   * czekamy, aż admin skończy wklejać, zamiast strzelać przy każdym znaku.
   */
  onKeyChange(): void {
    this.detectedProvider.set(null);
    this.detectFailed.set(false);
    if (this.detectTimer) clearTimeout(this.detectTimer);
    if (this.draftKey.trim().length <= 20) return;
    this.detectTimer = setTimeout(() => this.detect(), 400);
  }

  private detect(): void {
    const key = this.draftKey.trim();
    if (!key) return;
    this.detecting.set(true);
    // Bez `provider` backend rozpoznaje go z klucza i od razu oddaje modele —
    // jedno żądanie zamiast dwóch.
    this.api.models({ api_key: key }).subscribe({
      next: res => {
        this.detecting.set(false);
        this.detectedProvider.set(res.provider);
        this.models.set(res.models);
        this.draftModel = '';
        this.customModel.set(false);
      },
      error: () => {
        this.detecting.set(false);
        this.detectFailed.set(true);
        this.models.set([]);
      },
    });
  }

  /** Manual fallback: the admin named the provider we could not recognise. */
  onManualProvider(): void {
    if (this.draftProvider) this.loadModelsFor(this.draftProvider);
  }

  useSaved(provider: string): void {
    this.draftProvider = provider;
    this.detectedProvider.set(provider);
    this.loadModelsFor(provider);
  }

  private loadModelsFor(provider: string): void {
    this.modelsLoading.set(true);
    this.api.models({ provider, api_key: this.draftKey.trim() || null }).subscribe({
      next: res => {
        this.models.set(res.models);
        this.modelsLoading.set(false);
      },
      // Lista to udogodnienie, nie warunek działania — bez niej pole modelu
      // wraca do wpisywania ręcznego, zamiast blokować konfigurację.
      error: () => {
        this.models.set([]);
        this.modelsLoading.set(false);
      },
    });
  }

  save(): void {
    if (this.draftModel === CUSTOM_MODEL) {
      this.customModel.set(true);
      this.draftModel = '';
      return;
    }
    this.busy.set(true);
    this.api.save(this.purpose().key, {
      // Pusty dostawca = backend rozpozna go z klucza.
      provider: this.detectedProvider() ?? this.draftProvider ?? null,
      api_key: this.draftKey.trim() || null,
      model: this.draftModel.trim() || null,
    }).subscribe({
      next: () => {
        this.busy.set(false);
        this.draftKey = '';
        this.keyEditing.set(false);
        this.detectedProvider.set(null);
        this.changed.emit();
      },
      error: err => {
        this.busy.set(false);
        this.toast.error(err?.error?.error ?? this.t('settings.ai.saveFailed'));
      },
    });
  }

  remove(): void {
    if (!confirm(this.t('settings.ai.confirmRemove'))) return;
    this.busy.set(true);
    this.api.remove(this.purpose().key).subscribe({
      next: () => {
        this.busy.set(false);
        this.initialisedFor = null;
        this.keyEditing.set(false);
        this.changed.emit();
      },
      error: err => {
        this.busy.set(false);
        this.toast.error(err?.error?.error ?? this.t('settings.ai.saveFailed'));
      },
    });
  }
}
