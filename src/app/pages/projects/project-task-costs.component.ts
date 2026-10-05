import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { ToastService } from '../../core/services/toast.service';
import { ProjectCostItem, ProjectFinanceApiService } from '../../core/services/project-finance-api.service';
import { ProjectFinanceFormatService } from '../../core/services/project-finance-format.service';
import { ProjectCostCategory, ProjectFinanceAccess, ProjectTask } from '../../core/services/projects-api.service';
import { ProjectCostFormComponent } from './project-cost-form.component';
import { PROJECT_FINANCE_STYLES } from './project-finance.styles';

/**
 * "Costs" section of the task panel. Someone with finance read rights sees
 * every cost item of the task; a participant allowed to add own costs sees and
 * manages only the items they created (the API filters the list).
 */
@Component({
  selector: 'wt-project-task-costs',
  standalone: true,
  imports: [TranslocoDirective, ProjectCostFormComponent],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      <div class="block-head">
        <div class="sec-title">{{ t('panel.costs.title') }}</div>
        @if (canEdit()) {
          <button class="btn btn-g btn-sm" (click)="openForm(null)">+ {{ t('panel.costs.add') }}</button>
        }
      </div>
      @if (!access().can_read) { <p class="hint">{{ t('panel.costs.ownOnlyHint') }}</p> }

      @if (costs().length === 0) {
        <p class="hint">{{ t('panel.costs.empty') }}</p>
      } @else {
        <ul class="items">
          @for (item of costs(); track item.id) {
            <li class="item">
              <span class="date">{{ format.date(item.date) }}</span>
              <span class="what">
                {{ item.category_name }}
                @if (item.status === 'planned') { <span class="pill status-pill">{{ t('finance.costStatuses.planned') }}</span> }
                @if (details(item); as text) { <span class="secondary">{{ text }}</span> }
              </span>
              <span class="amount">
                {{ format.money(item.amount, access().currency) }}
                @if (item.original_amount !== null && item.original_currency) {
                  <span class="secondary">{{ format.money(item.original_amount, item.original_currency) }}</span>
                }
              </span>
              @if (canEdit()) {
                <span class="row-action">
                  <button class="link" (click)="openForm(item)">{{ t('finance.edit') }}</button>
                  <button class="link-danger" (click)="remove(item)">{{ t('finance.delete') }}</button>
                </span>
              }
            </li>
          }
        </ul>
        <div class="total">
          <span>{{ t('panel.costs.totalIncurred') }}</span>
          <strong>{{ format.money(incurredTotal(), access().currency) }}</strong>
        </div>
      }

      @if (isFormOpen()) {
        <wt-project-cost-form
          [projectId]="projectId()" [projectKey]="projectKey()" [projectCurrency]="access().currency"
          [categories]="categories()" [tasks]="tasks()" [item]="editedItem()"
          [taskId]="taskId()" [isTaskLocked]="!access().can_write"
          (closed)="isFormOpen.set(false)" (saved)="onSaved()" />
      }
    </ng-container>
  `,
  styles: [PROJECT_FINANCE_STYLES, `
    :host { display:flex; flex-direction:column; gap:8px; }
    .items { list-style:none; margin:0; padding:0; border:1px solid var(--gray-200); border-radius:9px; }
    .item { display:grid; grid-template-columns:82px 1fr auto auto; gap:10px; align-items:baseline; padding:8px 12px; font-size:13px; color:var(--gray-800); }
    .item + .item { border-top:1px solid var(--gray-100); }
    .date { font-size:12.5px; color:var(--gray-600); white-space:nowrap; }
    .what { overflow-wrap:anywhere; }
    .total { display:flex; justify-content:flex-end; gap:10px; font-size:13px; color:var(--gray-600); font-variant-numeric:tabular-nums; }
    .total strong { color:var(--gray-900); }
  `],
})
export class ProjectTaskCostsComponent implements OnInit {
  private readonly api = inject(ProjectFinanceApiService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  readonly format = inject(ProjectFinanceFormatService);

  readonly projectId = input.required<string>();
  readonly projectKey = input.required<string>();
  readonly taskId = input.required<string>();
  readonly access = input.required<ProjectFinanceAccess>();
  readonly categories = input.required<ProjectCostCategory[]>();
  readonly tasks = input.required<ProjectTask[]>();

  /** Emitted after a cost item was added, changed or deleted, so the Finance tab can refresh. */
  readonly costsChanged = output<void>();

  readonly costs = signal<ProjectCostItem[]>([]);
  readonly isFormOpen = signal(false);
  readonly editedItem = signal<ProjectCostItem | null>(null);

  readonly canEdit = computed(() => this.access().can_write || this.access().can_add_own_costs);
  readonly incurredTotal = computed(() =>
    this.costs().filter(item => item.status === 'incurred').reduce((total, item) => total + item.amount, 0));

  ngOnInit(): void {
    this.loadCosts();
  }

  details(item: ProjectCostItem): string {
    return [item.description, item.supplier_name, item.document_number].filter(Boolean).join(' · ');
  }

  openForm(item: ProjectCostItem | null): void {
    this.editedItem.set(item);
    this.isFormOpen.set(true);
  }

  onSaved(): void {
    this.isFormOpen.set(false);
    this.loadCosts();
    this.costsChanged.emit();
  }

  remove(item: ProjectCostItem): void {
    const label = `${this.format.date(item.date)}, ${this.format.money(item.amount, this.access().currency)}`;
    if (!confirm(this.transloco.translate('projects.finance.costs.deleteConfirm', { item: label }))) return;
    this.api.deleteCost(this.projectId(), item.id).subscribe({
      next: () => { this.loadCosts(); this.costsChanged.emit(); },
      error: err => this.toast.error(err?.error?.error ?? this.transloco.translate('projects.finance.costs.deleteFailed')),
    });
  }

  private loadCosts(): void {
    this.api.listCosts(this.projectId(), this.taskId()).subscribe({
      next: costs => this.costs.set(costs),
      error: err => this.toast.error(err?.error?.error ?? this.transloco.translate('projects.panel.costs.loadFailed')),
    });
  }
}
