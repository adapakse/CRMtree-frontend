import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { ProjectFinanceSummary } from '../../core/services/project-finance-api.service';
import { ProjectFinanceFormatService } from '../../core/services/project-finance-format.service';

/** Headline tiles of the Finance tab: revenue, cost, margin and what is left of the budget. */
@Component({
  selector: 'wt-project-finance-summary',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      <div class="card tile">
        <div class="tile-label">{{ t('finance.summary.revenue') }}</div>
        <div class="tile-value">{{ money(summary().revenue.actual) }}</div>
        <div class="tile-line">{{ t('finance.summary.plan') }} <strong>{{ money(summary().revenue.planned) }}</strong></div>
      </div>

      <div class="card tile">
        <div class="tile-label">{{ t('finance.summary.cost') }}</div>
        <div class="tile-value" [class.danger]="summary().remaining_budget < 0">{{ money(summary().cost.actual) }}</div>
        <div class="tile-line">{{ t('finance.summary.budget') }} <strong>{{ money(summary().cost.planned) }}</strong></div>
        <div class="tile-line minor">{{ t('finance.summary.plannedItems') }} <strong>{{ money(summary().cost.planned_items) }}</strong></div>
      </div>

      <div class="card tile">
        <div class="tile-label">{{ t('finance.summary.margin') }}</div>
        <div class="tile-value" [class.danger]="isNegative(summary().margin.actual.amount)">
          {{ money(summary().margin.actual.amount) }}
          @if (summary().margin.actual.percent !== null) {
            <span class="tile-percent">{{ format.percent(summary().margin.actual.percent) }}</span>
          }
        </div>
        <div class="tile-line">
          {{ t('finance.summary.plan') }}
          <strong [class.danger]="isNegative(summary().margin.planned.amount)">
            {{ money(summary().margin.planned.amount) }}
            @if (summary().margin.planned.percent !== null) { ({{ format.percent(summary().margin.planned.percent) }}) }
          </strong>
        </div>
      </div>

      <div class="card tile">
        <div class="tile-label">{{ t('finance.summary.remainingBudget') }}</div>
        <div class="tile-value" [class.danger]="summary().remaining_budget < 0">{{ money(summary().remaining_budget) }}</div>
        <div class="tile-line minor">{{ t('finance.summary.remainingBudgetHint') }}</div>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px; }
    .tile { padding:14px 16px; display:flex; flex-direction:column; gap:4px; }
    .tile-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; color:var(--gray-500); }
    .tile-value { font-family:'Sora',sans-serif; font-size:20px; font-weight:700; color:var(--gray-900); font-variant-numeric:tabular-nums; }
    .tile-percent { font-size:13px; font-weight:600; margin-left:4px; }
    .tile-line { font-size:12.5px; color:var(--gray-500); font-variant-numeric:tabular-nums; }
    .tile-line strong { color:var(--gray-800); font-weight:600; }
    .tile-line.minor { font-size:11.5px; }
    .danger, .tile-line strong.danger { color:#DC2626; }
  `],
})
export class ProjectFinanceSummaryComponent {
  readonly format = inject(ProjectFinanceFormatService);

  readonly summary = input.required<ProjectFinanceSummary>();

  money(amount: number | null): string {
    return this.format.money(amount, this.summary().currency);
  }

  isNegative(amount: number | null): boolean {
    return amount !== null && amount < 0;
  }
}
