import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoService } from '@jsverse/transloco';
import { Observable } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import {
  TenantFieldDefinition, TenantFieldDefinitions, TenantFieldEntity, TenantFieldType,
  TenantFieldsService,
} from '../../../core/services/tenant-fields.service';

const FIELD_TYPE_OPTIONS: { value: TenantFieldType; labelKey: string }[] = [
  { value: 'text', labelKey: 'text' },
  { value: 'number', labelKey: 'number' },
  { value: 'list', labelKey: 'list' },
  { value: 'date', labelKey: 'date' },
  { value: 'money', labelKey: 'money' },
];

const OPTION_SEPARATOR = ',';

function parseOptions(text: string): string[] {
  return text.split(OPTION_SEPARATOR).map(option => option.trim()).filter(Boolean);
}

/**
 * Tenant-admin editor for the custom fields of ONE form (lead, partner or
 * document). Mirrors the Projects module's field editor, including the rules
 * that make it safe: the field type cannot be changed once it exists, and a
 * field is deactivated rather than deleted so values already entered survive.
 */
@Component({
  selector: 'app-tenant-fields-editor',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tfe">
      <p class="hint">{{ t('settings.customFields.hint') }}</p>

      @for (definition of definitions(); track definition.id) {
        <div class="row" [class.inactive]="!definition.is_active">
          <input class="fi name" [ngModel]="definition.name" maxlength="120"
                 [disabled]="saving" (change)="rename(definition, $event)">
          <span class="type">{{ t('settings.customFields.types.' + definition.field_type) }}</span>
          @if (definition.field_type === 'list') {
            <input class="fi options" [ngModel]="definition.options.join(', ')"
                   [disabled]="saving"
                   [placeholder]="t('settings.customFields.optionsPlaceholder')"
                   (change)="changeOptions(definition, $event)">
          } @else {
            <span class="options"></span>
          }
          <label class="active-toggle">
            <input type="checkbox" [checked]="definition.is_active" [disabled]="saving"
                   (change)="update(definition, { is_active: !definition.is_active })">
            {{ t('settings.customFields.active') }}
          </label>
          <button class="del" type="button" [disabled]="saving"
                  [title]="t('settings.customFields.deleteTooltip')"
                  (click)="remove(definition)">✕</button>
        </div>
      } @empty {
        <p class="muted">{{ t('settings.customFields.empty') }}</p>
      }

      <div class="row add">
        <input class="fi name" [(ngModel)]="newName" maxlength="120" [disabled]="saving"
               [placeholder]="t('settings.customFields.newNamePlaceholder')">
        <select class="fsel type-select" [(ngModel)]="newType" [disabled]="saving">
          @for (option of typeOptions; track option.value) {
            <option [ngValue]="option.value">{{ t('settings.customFields.types.' + option.labelKey) }}</option>
          }
        </select>
        @if (newType === 'list') {
          <input class="fi options" [(ngModel)]="newOptions" [disabled]="saving"
                 [placeholder]="t('settings.customFields.optionsPlaceholder')">
        } @else {
          <span class="options"></span>
        }
        <button class="btn btn-p btn-add" [disabled]="saving || !canAdd()" (click)="add()">
          {{ t('settings.customFields.addButton') }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .tfe { display:flex; flex-direction:column; gap:8px; }
    .hint { margin:0 0 4px; font-size:12.5px; color:var(--gray-500); line-height:1.6; }
    .muted { margin:0; font-size:13px; color:var(--gray-400); }

    /* Jedna siatka dla wiersza istniejacego pola i dla wiersza dodawania, zeby
       kolumny trzymaly pion. Wczesniej oba byly osobnymi flexami, a typ mial
       raz 120px (tekst), raz 150px (select) — przez co nic sie nie zgadzalo
       i miedzy typem a przelacznikiem zostawala dziura. */
    .row {
      display:grid; align-items:center; gap:8px;
      grid-template-columns: minmax(0,1fr) 150px minmax(0,1.2fr) auto 28px;
    }
    /* Nieaktywne pole zostaje widoczne i przekreślone — admin musi widzieć, że
       istnieje, bo jego wartości nadal siedzą na rekordach. */
    .row.inactive .name { opacity:.55; text-decoration:line-through; }
    .row.add { padding-top:10px; margin-top:2px; border-top:1px dashed var(--gray-200); }
    .name { min-width:0; }
    .type { font-size:12.5px; color:var(--gray-600); white-space:nowrap; }
    .type-select { min-width:0; }
    .options { min-width:0; }
    .active-toggle {
      display:flex; align-items:center; gap:6px; font-size:12.5px;
      color:var(--gray-600); white-space:nowrap; justify-self:end;
    }
    /* Przycisk dodawania zajmuje dwie ostatnie kolumny, czyli konczy sie tam,
       gdzie w wierszach wyzej konczy sie przycisk usuwania. */
    .row.add .btn-add { grid-column:4 / -1; justify-self:end; }
    /* .btn + .btn-p to globalny system przycisków (styles/global.scss).
       Samo „btn-primary" jest klasą prywatną komponentu ustawień i tutaj nie
       działa — przycisk wyglądałby jak surowy, systemowy. */
    .row .del {
      border:1px solid var(--gray-300); background:white;
      color:var(--gray-400); border-radius:6px; width:26px; height:26px;
      cursor:pointer; font-size:12px; line-height:1;
    }
    .row .del:hover:not(:disabled) { border-color:#fca5a5; color:#dc2626; background:#fef2f2; }
    .row .del:disabled { opacity:.5; cursor:default; }
  `],
})
export class TenantFieldsEditorComponent {
  private readonly api = inject(TenantFieldsService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly entity = input.required<TenantFieldEntity>();
  readonly definitions = input.required<TenantFieldDefinition[]>();
  readonly definitionsChanged = output<TenantFieldDefinitions>();

  readonly typeOptions = FIELD_TYPE_OPTIONS;

  newName = '';
  newType: TenantFieldType = 'text';
  newOptions = '';
  saving = false;

  t(key: string, params?: Record<string, unknown>): string {
    return this.transloco.translate(`admin.${key}`, params);
  }

  canAdd(): boolean {
    if (!this.newName.trim()) return false;
    return this.newType !== 'list' || parseOptions(this.newOptions).length > 0;
  }

  rename(definition: TenantFieldDefinition, event: Event): void {
    const input = event.target as HTMLInputElement;
    const name = input.value.trim();
    if (!name) {
      input.value = definition.name;
      return;
    }
    if (name !== definition.name) this.update(definition, { name });
  }

  changeOptions(definition: TenantFieldDefinition, event: Event): void {
    const input = event.target as HTMLInputElement;
    const options = parseOptions(input.value);
    if (!options.length) {
      input.value = definition.options.join(', ');
      this.toast.error(this.t('settings.customFields.optionsRequired'));
      return;
    }
    this.update(definition, { options });
  }

  update(definition: TenantFieldDefinition, changes: { name?: string; options?: string[]; is_active?: boolean }): void {
    this.save(this.api.update(definition.id, changes));
  }

  /**
   * Usuwa pole. Backend odmowi (409) dla pola, w ktorym ktos juz cos wpisal, i
   * oddaje wtedy komunikat z liczba rekordow — pokazujemy go bez zmian, bo
   * dokladnie tlumaczy, dlaczego nie poszlo i co zrobic zamiast tego.
   */
  remove(definition: TenantFieldDefinition): void {
    const question = this.t('settings.customFields.deleteConfirm', { name: definition.name });
    if (!confirm(question)) return;
    this.save(this.api.remove(definition.id));
  }

  add(): void {
    this.save(this.api.create({
      entity: this.entity(),
      name: this.newName.trim(),
      field_type: this.newType,
      ...(this.newType === 'list' ? { options: parseOptions(this.newOptions) } : {}),
    }), () => {
      this.newName = '';
      this.newOptions = '';
    });
  }

  private save(request: Observable<{ definitions: TenantFieldDefinitions }>, onSuccess?: () => void): void {
    this.saving = true;
    request.subscribe({
      next: res => {
        this.saving = false;
        onSuccess?.();
        this.definitionsChanged.emit(res.definitions);
      },
      error: err => {
        this.saving = false;
        this.toast.error(err?.error?.error ?? this.t('settings.customFields.saveFailed'));
      },
    });
  }
}
