import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { CrmApiService, WhatsappTemplate, WhatsappTemplateSelection } from '../../../core/services/crm-api.service';

const PLACEHOLDER_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
// Meta rejects template variables containing new lines, tabs or more than
// 4 consecutive spaces — mirrored here so the send button stays disabled.
const INVALID_VARIABLE_RE = /[\n\t]| {5,}/;

/**
 * Picks an approved WhatsApp message template and fills in its variables —
 * the only kind of message Meta delivers to a customer who hasn't written in
 * the last 24 hours. Templates themselves are created and approved in Meta's
 * WhatsApp Manager, not here.
 */
@Component({
  selector: 'wt-whatsapp-template-picker',
  standalone: true,
  imports: [FormsModule, TranslocoDirective],
  providers: [provideTranslocoScope('crm')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'crm'">
      @if (isLoading()) {
        <div class="hint">{{ t('whatsapp.template.loading') }}</div>
      } @else if (hasLoadError()) {
        <div class="error">⚠️ {{ isTokenInvalid() ? t('whatsapp.tokenInvalid') : t('whatsapp.template.loadFailed') }}
          <button type="button" class="link" (click)="load()">{{ t('whatsapp.template.retry') }}</button>
        </div>
      } @else if (supportedTemplates().length === 0) {
        <div class="hint">{{ t('whatsapp.template.none') }}</div>
      } @else {
        <label class="field">{{ t('whatsapp.template.label') }}
          <select [disabled]="disabled()" [ngModel]="selectedKey()" (ngModelChange)="selectTemplate($event)">
            <option value="">{{ t('whatsapp.template.choose') }}</option>
            @for (template of supportedTemplates(); track templateKey(template)) {
              <option [value]="templateKey(template)">{{ template.name }} · {{ template.language }}</option>
            }
          </select>
        </label>

        @if (selected(); as template) {
          @for (variable of template.variables; track variable.key) {
            <label class="field">{{ t('whatsapp.template.variable', { key: variable.key }) }}
              <input type="text" [disabled]="disabled()" [placeholder]="variable.example ?? ''"
                     [ngModel]="params()[variable.key] ?? ''" (ngModelChange)="setParam(variable.key, $event)">
            </label>
            @if (isInvalidVariable(params()[variable.key])) {
              <div class="warn">{{ t('whatsapp.template.invalidVariable') }}</div>
            }
          }

          <div class="preview-label">{{ t('whatsapp.template.preview') }}</div>
          <div class="preview">
            @if (template.header_text) { <strong>{{ template.header_text }}</strong> }
            <div>{{ previewBody() }}</div>
            @if (template.footer_text) { <div class="footer">{{ template.footer_text }}</div> }
            @if (template.buttons.length) {
              <div class="buttons">
                @for (button of template.buttons; track $index) { <span>{{ button }}</span> }
              </div>
            }
          </div>
        }
      }
      @if (unsupportedCount() > 0) {
        <div class="hint">{{ t('whatsapp.template.unsupported', { count: unsupportedCount() }) }}</div>
      }
    </ng-container>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; gap: 8px; }
    .field { font-size: 12px; font-weight: 600; display: flex; flex-direction: column; gap: 3px; }
    select, input { border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 10px; font-size: 12px; font-family: inherit; outline: none; background: white; }
    .hint { font-size: 11.5px; color: #6b7280; }
    .warn { font-size: 11.5px; color: #b45309; }
    .error { font-size: 12px; color: #ef4444; background: #fef2f2; border-radius: 6px; padding: 6px 10px; }
    .link { background: none; border: none; color: #3BAA5D; font-weight: 600; cursor: pointer; padding: 0 0 0 6px; font-size: 12px; }
    .preview-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #6b7280; }
    .preview { background: #E6F4EA; border-radius: 8px; padding: 10px; font-size: 12px; line-height: 1.6; color: #374151; white-space: pre-wrap; display: flex; flex-direction: column; gap: 4px; }
    .footer { font-size: 11px; color: #6b7280; }
    .buttons { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .buttons span { background: white; border: 1px solid #d1d5db; border-radius: 6px; padding: 2px 8px; font-size: 11px; color: #3BAA5D; }
  `],
})
export class WhatsappTemplatePickerComponent implements OnInit {
  private api = inject(CrmApiService);

  readonly disabled = input(false);
  readonly selectionChange = output<WhatsappTemplateSelection | null>();

  readonly templates = signal<WhatsappTemplate[]>([]);
  readonly isLoading = signal(false);
  readonly hasLoadError = signal(false);
  readonly isTokenInvalid = signal(false);
  readonly selectedKey = signal('');
  readonly params = signal<Record<string, string>>({});

  readonly supportedTemplates = computed(() => this.templates().filter(template => template.supported));
  readonly unsupportedCount = computed(() => this.templates().length - this.supportedTemplates().length);
  readonly selected = computed(() =>
    this.supportedTemplates().find(template => this.templateKey(template) === this.selectedKey()) ?? null);
  readonly previewBody = computed(() => {
    const template = this.selected();
    if (!template) return '';
    const params = this.params();
    return template.body_text.replace(PLACEHOLDER_RE, (whole, key) => params[key]?.trim() || whole);
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.hasLoadError.set(false);
    this.isTokenInvalid.set(false);
    this.api.getWhatsappTemplates().subscribe({
      next: templates => {
        this.templates.set(templates);
        this.isLoading.set(false);
      },
      error: (err: any) => {
        this.hasLoadError.set(true);
        this.isTokenInvalid.set(err?.error?.code === 'WHATSAPP_TOKEN_INVALID');
        this.isLoading.set(false);
      },
    });
  }

  reset(): void {
    this.selectedKey.set('');
    this.params.set({});
    this.selectionChange.emit(null);
  }

  templateKey(template: WhatsappTemplate): string {
    return `${template.name}|${template.language}`;
  }

  isInvalidVariable(value: string | undefined): boolean {
    return !!value && INVALID_VARIABLE_RE.test(value);
  }

  selectTemplate(key: string): void {
    this.selectedKey.set(key);
    this.params.set({});
    this.emitSelection();
  }

  setParam(key: string, value: string): void {
    this.params.update(params => ({ ...params, [key]: value }));
    this.emitSelection();
  }

  private emitSelection(): void {
    const template = this.selected();
    if (!template) {
      this.selectionChange.emit(null);
      return;
    }
    const params = this.params();
    const isComplete = template.variables.every(({ key }) => {
      const value = params[key]?.trim();
      return !!value && !INVALID_VARIABLE_RE.test(value);
    });
    this.selectionChange.emit({ name: template.name, language: template.language, params, isComplete });
  }
}
