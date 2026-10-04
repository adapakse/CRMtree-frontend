import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { Observable } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import {
  ProjectConfig, ProjectDictionary, ProjectDictionaryItem, ProjectTaskStatus, ProjectsApiService, TaskStatusCategory,
} from '../../../core/services/projects-api.service';

const DEFAULT_COLOR = '#6B7280';

/**
 * Editor of one task dictionary (statuses, types or priorities). Every change
 * is saved at once; the API answers with the whole configuration, which is
 * passed up so sibling editors stay in sync.
 */
@Component({
  selector: 'wt-project-dictionary-editor',
  standalone: true,
  imports: [FormsModule, TranslocoDirective],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      <div class="rows">
        @for (item of items(); track item.id; let index = $index; let isFirst = $first; let isLast = $last) {
          <div class="row" [class.inactive]="!item.is_active">
            <div class="order">
              <button class="order-btn" [disabled]="isFirst" (click)="move(index, -1)" [title]="t('settings.dictionary.moveUp')">▲</button>
              <button class="order-btn" [disabled]="isLast" (click)="move(index, 1)" [title]="t('settings.dictionary.moveDown')">▼</button>
            </div>
            <input type="color" class="color" [ngModel]="item.color" (change)="update(item, { color: colorOf($event) })">
            <input class="fi name" [ngModel]="item.name" maxlength="80" (change)="rename(item, $event)">
            @if (hasCategory()) {
              <select class="fsel category" [ngModel]="categoryOf(item)" (ngModelChange)="update(item, { category: $event })">
                @for (category of categories; track category) {
                  <option [ngValue]="category">{{ t('labels.statusCategories.' + category) }}</option>
                }
              </select>
            }
            <label class="active-toggle">
              <input type="checkbox" [checked]="item.is_active" (change)="update(item, { is_active: !item.is_active })"> {{ t('settings.dictionary.active') }}
            </label>
          </div>
        }
      </div>

      <div class="row add">
        <input type="color" class="color" [(ngModel)]="newColor">
        <input class="fi name" [(ngModel)]="newName" maxlength="80" [placeholder]="t('settings.dictionary.newItemPlaceholder')" (keyup.enter)="add()">
        @if (hasCategory()) {
          <select class="fsel category" [(ngModel)]="newCategory">
            @for (category of categories; track category) {
              <option [ngValue]="category">{{ t('labels.statusCategories.' + category) }}</option>
            }
          </select>
        }
        <button class="btn btn-p btn-sm" [disabled]="!newName.trim()" (click)="add()">{{ t('settings.dictionary.addButton') }}</button>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; gap:8px; }
    .rows { display:flex; flex-direction:column; gap:6px; }
    .row { display:flex; align-items:center; gap:8px; }
    .row.inactive .name { opacity:.55; text-decoration:line-through; }
    .row.add { padding-top:8px; border-top:1px dashed var(--gray-200); padding-left:30px; }
    .order { display:flex; flex-direction:column; width:22px; }
    .order-btn { border:none; background:none; font-size:8px; line-height:1; padding:2px; color:var(--gray-400); cursor:pointer; }
    .order-btn:disabled { opacity:.25; cursor:default; }
    .color { width:34px; height:34px; padding:2px; border:1.5px solid var(--gray-200); border-radius:8px; background:white; cursor:pointer; flex-shrink:0; }
    .name { flex:1; }
    .category { width:160px; flex-shrink:0; }
    .active-toggle { display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--gray-600); white-space:nowrap; }
  `],
})
export class ProjectDictionaryEditorComponent {
  private readonly api = inject(ProjectsApiService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly dictionary = input.required<ProjectDictionary>();
  readonly items = input.required<ProjectDictionaryItem[]>();
  readonly configChanged = output<ProjectConfig>();

  readonly categories: TaskStatusCategory[] = ['todo', 'in_progress', 'done'];
  readonly hasCategory = computed(() => this.dictionary() === 'statuses');

  newName = '';
  newColor = DEFAULT_COLOR;
  newCategory: TaskStatusCategory = 'todo';

  categoryOf(item: ProjectDictionaryItem): TaskStatusCategory {
    return (item as ProjectTaskStatus).category;
  }

  colorOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  rename(item: ProjectDictionaryItem, event: Event): void {
    const input = event.target as HTMLInputElement;
    const name = input.value.trim();
    if (!name) {
      input.value = item.name;
      return;
    }
    if (name !== item.name) this.update(item, { name });
  }

  update(item: ProjectDictionaryItem, changes: { name?: string; color?: string; category?: TaskStatusCategory; is_active?: boolean }): void {
    this.save(this.api.updateDictionaryItem(this.dictionary(), item.id, changes));
  }

  move(index: number, offset: -1 | 1): void {
    const ids = this.items().map(item => item.id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    this.save(this.api.reorderDictionary(this.dictionary(), ids));
  }

  add(): void {
    const name = this.newName.trim();
    if (!name) return;
    const payload = this.hasCategory()
      ? { name, color: this.newColor, category: this.newCategory }
      : { name, color: this.newColor };
    this.save(this.api.createDictionaryItem(this.dictionary(), payload), () => {
      this.newName = '';
      this.newColor = DEFAULT_COLOR;
    });
  }

  private save(request: Observable<ProjectConfig>, onSuccess?: () => void): void {
    request.subscribe({
      next: config => {
        onSuccess?.();
        this.configChanged.emit(config);
      },
      error: err => this.toast.error(err?.error?.error ?? this.transloco.translate('projects.settings.dictionary.saveFailed')),
    });
  }
}
