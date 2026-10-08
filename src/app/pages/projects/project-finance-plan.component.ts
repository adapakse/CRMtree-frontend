import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { ToastService } from '../../core/services/toast.service';
import {
  ProjectFinanceApiService, ProjectFinancePlanPayload, ProjectFinanceSummary,
} from '../../core/services/project-finance-api.service';
import { PROJECT_CURRENCIES, ProjectFinanceFormatService } from '../../core/services/project-finance-format.service';
import { PROJECT_FINANCE_STYLES, parseMoneyInput } from './project-finance.styles';

/**
 * Plan of the project finance: currency, planned revenue and whether
 * participants may add costs. Every change is saved at once.
 */
@Component({
  selector: 'wt-project-finance-plan',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card block" *transloco="let t; prefix: 'projects'">
      <div class="sec-title">{{ t('finance.plan.title') }}</div>
      <div class="plan-grid">
        <div class="fg">
          <label class="fl">{{ t('finance.plan.currency') }}</label>
          <select class="fsel" [disabled]="!canWrite() || summary().is_currency_locked" (change)="changeCurrency($event)">
            @for (currency of currencies(); track currency) {
              <option [value]="currency" [selected]="currency === summary().currency">{{ currency }}</option>
            }
          </select>
          @if (summary().is_currency_locked) { <p class="hint">{{ t('finance.plan.currencyLockedHint') }}</p> }
        </div>

        <div class="fg">
          <label class="fl">{{ t('finance.plan.plannedRevenue', { currency: summary().currency }) }}</label>
          <input class="fi" type="number" min="0" step="0.01" [disabled]="!canWrite()"
                 [value]="summary().revenue.planned ?? ''" (change)="changePlannedRevenue($event)">
          @if (canWrite() && summary().suggested_planned_revenue !== null) {
            <button class="link" (click)="save({ planned_revenue: summary().suggested_planned_revenue })">
              {{ t('finance.plan.useSuggested', { amount: format.money(summary().suggested_planned_revenue, summary().currency) }) }}
            </button>
            <p class="hint">{{ t('finance.plan.suggestedHint') }}</p>
          }
        </div>
      </div>

      <label class="toggle">
        <input type="checkbox" [checked]="summary().participants_can_add_costs" [disabled]="!canWrite()"
               (change)="changeParticipantCosts($event)">
        {{ t('finance.plan.participantsCanAddCosts') }}
      </label>
      <p class="hint">{{ t('finance.plan.participantsCanAddCostsHint') }}</p>
    </section>
  `,
  styles: [PROJECT_FINANCE_STYLES, `
    .plan-grid { display:grid; grid-template-columns:200px minmax(220px, 320px); gap:16px; align-items:start; }
    .toggle { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--gray-700); cursor:pointer; }
    @media (max-width: 700px) { .plan-grid { grid-template-columns:1fr; } }
  `],
})
export class ProjectFinancePlanComponent {
  private readonly api = inject(ProjectFinanceApiService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  readonly format = inject(ProjectFinanceFormatService);

  readonly projectId = input.required<string>();
  readonly summary = input.required<ProjectFinanceSummary>();
  readonly canWrite = input(false);
  /** The API answers every plan change with the recalculated summary. */
  readonly saved = output<ProjectFinanceSummary>();

  // A currency set outside the common list stays selectable.
  readonly currencies = computed(() =>
    PROJECT_CURRENCIES.includes(this.summary().currency) ? PROJECT_CURRENCIES : [this.summary().currency, ...PROJECT_CURRENCIES]);

  changeCurrency(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.save({ currency: select.value }, () => { select.value = this.summary().currency; });
  }

  changePlannedRevenue(event: Event): void {
    const input = event.target as HTMLInputElement;
    const restore = () => { input.value = String(this.summary().revenue.planned ?? ''); };
    const amount = parseMoneyInput(input.value);
    if (Number.isNaN(amount)) {
      restore();
      return;
    }
    this.save({ planned_revenue: amount }, restore);
  }

  changeParticipantCosts(event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    this.save({ participants_can_add_costs: checkbox.checked }, () => {
      checkbox.checked = this.summary().participants_can_add_costs;
    });
  }

  /** `restore` puts the control back to the stored value when the save is refused. */
  save(payload: ProjectFinancePlanPayload, restore?: () => void): void {
    this.api.updatePlan(this.projectId(), payload).subscribe({
      next: summary => this.saved.emit(summary),
      error: err => {
        restore?.();
        this.toast.error(err?.error?.error ?? this.transloco.translate('projects.finance.plan.saveFailed'));
      },
    });
  }
}
