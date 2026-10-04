import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import {
  ProjectConfig, ProjectFieldDefinition, ProjectFieldType, ProjectsApiService,
} from '../../../core/services/projects-api.service';

const FIELD_TYPE_OPTIONS: { value: ProjectFieldType; label: string }[] = [
  { value: 'text', label: 'Tekst' },
  { value: 'number', label: 'Liczba' },
  { value: 'list', label: 'Lista wartości' },
  { value: 'date', label: 'Data' },
  { value: 'money', label: 'Kwota z walutą' },
];

const OPTION_SEPARATOR = ',';

function parseOptions(text: string): string[] {
  return text.split(OPTION_SEPARATOR).map(option => option.trim()).filter(Boolean);
}

/** Tenant-level definitions of custom task fields; a PM later attaches them to a project. */
@Component({
  selector: 'wt-project-fields-editor',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="hint">
      Pola zdefiniowane tutaj PM może dodać do swojego projektu (Karta projektu → Pola dodatkowe zadań) i zdecydować,
      czy są wymagane. Typu pola nie można zmienić po utworzeniu.
    </p>

    @for (definition of definitions(); track definition.id) {
      <div class="row" [class.inactive]="!definition.is_active">
        <input class="fi name" [ngModel]="definition.name" maxlength="120" (change)="rename(definition, $event)">
        <span class="type">{{ typeLabel(definition.field_type) }}</span>
        @if (definition.field_type === 'list') {
          <input class="fi options" [ngModel]="definition.options.join(', ')" placeholder="Wartości po przecinku"
                 (change)="changeOptions(definition, $event)">
        } @else { <span class="options"></span> }
        <label class="active-toggle">
          <input type="checkbox" [checked]="definition.is_active"
                 (change)="update(definition, { is_active: !definition.is_active })"> aktywne
        </label>
      </div>
    } @empty {
      <p class="muted">Brak zdefiniowanych pól.</p>
    }

    <div class="row add">
      <input class="fi name" [(ngModel)]="newName" maxlength="120" placeholder="Nazwa nowego pola…">
      <select class="fsel type-select" [(ngModel)]="newType">
        @for (option of typeOptions; track option.value) { <option [ngValue]="option.value">{{ option.label }}</option> }
      </select>
      @if (newType === 'list') {
        <input class="fi options" [(ngModel)]="newOptions" placeholder="Wartości po przecinku">
      } @else { <span class="options"></span> }
      <button class="btn btn-p btn-sm" [disabled]="!canAdd()" (click)="add()">Dodaj pole</button>
    </div>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; gap:8px; }
    .hint { margin:0 0 4px; font-size:12.5px; color:var(--gray-500); line-height:1.6; }
    .muted { margin:0; font-size:13px; color:var(--gray-400); }
    .row { display:flex; align-items:center; gap:8px; }
    .row.inactive .name { opacity:.55; text-decoration:line-through; }
    .row.add { padding-top:8px; border-top:1px dashed var(--gray-200); }
    .name { flex:1; min-width:0; }
    .type { width:130px; font-size:12.5px; color:var(--gray-600); flex-shrink:0; }
    .type-select { width:160px; flex-shrink:0; }
    .options { flex:1.4; min-width:0; }
    .active-toggle { display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--gray-600); white-space:nowrap; }
  `],
})
export class ProjectFieldsEditorComponent {
  private readonly api = inject(ProjectsApiService);
  private readonly toast = inject(ToastService);

  readonly definitions = input.required<ProjectFieldDefinition[]>();
  readonly configChanged = output<ProjectConfig>();

  readonly typeOptions = FIELD_TYPE_OPTIONS;

  newName = '';
  newType: ProjectFieldType = 'text';
  newOptions = '';

  typeLabel(fieldType: ProjectFieldType): string {
    return FIELD_TYPE_OPTIONS.find(option => option.value === fieldType)?.label ?? fieldType;
  }

  canAdd(): boolean {
    if (!this.newName.trim()) return false;
    return this.newType !== 'list' || parseOptions(this.newOptions).length > 0;
  }

  rename(definition: ProjectFieldDefinition, event: Event): void {
    const input = event.target as HTMLInputElement;
    const name = input.value.trim();
    if (!name) {
      input.value = definition.name;
      return;
    }
    if (name !== definition.name) this.update(definition, { name });
  }

  changeOptions(definition: ProjectFieldDefinition, event: Event): void {
    const input = event.target as HTMLInputElement;
    const options = parseOptions(input.value);
    if (!options.length) {
      input.value = definition.options.join(', ');
      this.toast.error('Lista musi mieć co najmniej jedną wartość');
      return;
    }
    this.update(definition, { options });
  }

  update(definition: ProjectFieldDefinition, changes: { name?: string; options?: string[]; is_active?: boolean }): void {
    this.save(this.api.updateFieldDefinition(definition.id, changes));
  }

  add(): void {
    const payload = {
      name: this.newName.trim(),
      field_type: this.newType,
      ...(this.newType === 'list' ? { options: parseOptions(this.newOptions) } : {}),
    };
    this.save(this.api.createFieldDefinition(payload), () => {
      this.newName = '';
      this.newOptions = '';
    });
  }

  private save(request: Observable<ProjectConfig>, onSuccess?: () => void): void {
    request.subscribe({
      next: config => {
        onSuccess?.();
        this.configChanged.emit(config);
      },
      error: err => this.toast.error(err?.error?.error ?? 'Nie udało się zapisać pola'),
    });
  }
}
