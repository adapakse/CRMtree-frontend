import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { ToastService } from '../../core/services/toast.service';
import {
  ProjectFinanceApiService, ProjectRevenueItem, ProjectRevenueItemPayload, ProjectRevenueStatus,
} from '../../core/services/project-finance-api.service';
import { ProjectFinanceFormatService } from '../../core/services/project-finance-format.service';
import { PROJECTS_SHARED_STYLES } from './projects-shared.styles';
import { PROJECT_FINANCE_STYLES } from './project-finance.styles';

const REVENUE_STATUSES: ProjectRevenueStatus[] = ['planned', 'invoiced', 'paid'];

interface RevenueForm {
  date: string;
  amount: number | null;
  status: ProjectRevenueStatus;
  description: string;
}

/** Revenue items of the project; add / edit / delete for those who may write. */
@Component({
  selector: 'wt-project-finance-revenues',
  standalone: true,
  imports: [FormsModule, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card block" *transloco="let t; prefix: 'projects'">
      <div class="block-head">
        <div class="sec-title">{{ t('finance.revenues.title') }}</div>
        @if (canWrite()) {
          <button class="btn btn-p btn-sm" (click)="openForm(null)">+ {{ t('finance.revenues.add') }}</button>
        }
      </div>

      @if (revenues().length === 0) {
        <p class="hint">{{ t('finance.revenues.empty') }}</p>
      } @else {
        <div class="tw">
          <table class="grid">
            <thead>
              <tr>
                <th>{{ t('finance.revenues.columns.date') }}</th>
                <th>{{ t('finance.revenues.columns.description') }}</th>
                <th>{{ t('finance.revenues.columns.status') }}</th>
                <th class="amount">{{ t('finance.revenues.columns.amount') }}</th>
                @if (canWrite()) { <th></th> }
              </tr>
            </thead>
            <tbody>
              @for (item of revenues(); track item.id) {
                <tr>
                  <td class="nowrap">{{ format.date(item.date) }}</td>
                  <td class="description">{{ item.description }}</td>
                  <td><span class="pill status-pill" [class]="item.status">{{ t('finance.revenueStatuses.' + item.status) }}</span></td>
                  <td class="amount">{{ format.money(item.amount, currency()) }}</td>
                  @if (canWrite()) {
                    <td class="row-action">
                      <button class="link" (click)="openForm(item)">{{ t('finance.edit') }}</button>
                      <button class="link-danger" (click)="remove(item)">{{ t('finance.delete') }}</button>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (isFormOpen()) {
        <div class="mol" (click)="isFormOpen.set(false)">
          <div class="mo" (click)="$event.stopPropagation()">
            <div class="moh">
              <div class="mot">{{ t(editedItem() ? 'finance.revenues.editTitle' : 'finance.revenues.addTitle') }}</div>
              <button class="mox" (click)="isFormOpen.set(false)">✕</button>
            </div>
            <div class="mob">
              <div class="fgrid">
                <div class="fg">
                  <label class="fl">{{ t('finance.revenues.columns.date') }} <span class="req">*</span></label>
                  <input class="fi" type="date" [(ngModel)]="form.date">
                </div>
                <div class="fg">
                  <label class="fl">{{ t('finance.revenues.amountIn', { currency: currency() }) }} <span class="req">*</span></label>
                  <input class="fi" type="number" min="0.01" step="0.01" [(ngModel)]="form.amount">
                </div>
              </div>
              <div class="fg">
                <label class="fl">{{ t('finance.revenues.columns.status') }}</label>
                <select class="fsel" [(ngModel)]="form.status">
                  @for (status of statuses; track status) {
                    <option [ngValue]="status">{{ t('finance.revenueStatuses.' + status) }}</option>
                  }
                </select>
                <p class="hint">{{ t('finance.revenues.statusHint') }}</p>
              </div>
              <div class="fg">
                <label class="fl">{{ t('finance.revenues.columns.description') }}</label>
                <textarea class="fta" rows="3" [(ngModel)]="form.description" maxlength="2000"></textarea>
              </div>
            </div>
            <div class="mof">
              <button class="btn btn-g" (click)="isFormOpen.set(false)">{{ 'actions.cancel' | transloco }}</button>
              <button class="btn btn-p" [disabled]="!isValid() || isSaving()" (click)="save()">
                {{ isSaving() ? t('finance.saving') : ('actions.save' | transloco) }}
              </button>
            </div>
          </div>
        </div>
      }
    </section>
  `,
  styles: [PROJECTS_SHARED_STYLES, PROJECT_FINANCE_STYLES, `
    .description { white-space:pre-wrap; overflow-wrap:anywhere; }
  `],
})
export class ProjectFinanceRevenuesComponent {
  private readonly api = inject(ProjectFinanceApiService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  readonly format = inject(ProjectFinanceFormatService);

  readonly projectId = input.required<string>();
  readonly currency = input.required<string>();
  readonly revenues = input.required<ProjectRevenueItem[]>();
  readonly canWrite = input(false);
  /** Emitted after a revenue item was added, changed or deleted. */
  readonly changed = output<void>();

  readonly statuses = REVENUE_STATUSES;
  readonly isFormOpen = signal(false);
  readonly isSaving = signal(false);
  readonly editedItem = signal<ProjectRevenueItem | null>(null);

  form: RevenueForm = this.emptyForm();

  openForm(item: ProjectRevenueItem | null): void {
    this.editedItem.set(item);
    this.form = item
      ? { date: item.date.slice(0, 10), amount: item.amount, status: item.status, description: item.description ?? '' }
      : this.emptyForm();
    this.isFormOpen.set(true);
  }

  isValid(): boolean {
    return Boolean(this.form.date) && Number(this.form.amount) > 0;
  }

  save(): void {
    const item = this.editedItem();
    const payload: ProjectRevenueItemPayload = {
      date: this.form.date,
      amount: Number(this.form.amount),
      status: this.form.status,
      description: this.form.description.trim() || null,
    };
    const request = item
      ? this.api.updateRevenue(this.projectId(), item.id, payload)
      : this.api.createRevenue(this.projectId(), payload);

    this.isSaving.set(true);
    request.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.isFormOpen.set(false);
        this.toast.success(this.transloco.translate('projects.finance.revenues.saved'));
        this.changed.emit();
      },
      error: err => {
        this.isSaving.set(false);
        this.toast.error(err?.error?.error ?? this.transloco.translate('projects.finance.revenues.saveFailed'));
      },
    });
  }

  remove(item: ProjectRevenueItem): void {
    const label = `${this.format.date(item.date)}, ${this.format.money(item.amount, this.currency())}`;
    if (!confirm(this.transloco.translate('projects.finance.revenues.deleteConfirm', { item: label }))) return;
    this.api.deleteRevenue(this.projectId(), item.id).subscribe({
      next: () => this.changed.emit(),
      error: err => this.toast.error(err?.error?.error ?? this.transloco.translate('projects.finance.revenues.deleteFailed')),
    });
  }

  private emptyForm(): RevenueForm {
    return { date: new Date().toISOString().slice(0, 10), amount: null, status: 'planned', description: '' };
  }
}
