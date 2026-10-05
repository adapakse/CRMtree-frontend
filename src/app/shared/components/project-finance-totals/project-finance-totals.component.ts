import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { ProjectFinanceFormatService } from '../../../core/services/project-finance-format.service';
import { ProjectFinanceTotals } from '../../../core/services/projects-api.service';

/**
 * One compact line with a project's revenue, cost and margin — for places that
 * list projects (the project list, lead and partner cards).
 */
@Component({
  selector: 'wt-project-finance-totals',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      <span class="figure" [title]="t('finance.totals.actualOfPlannedHint')">
        <span class="label">{{ t('finance.totals.revenue') }}</span>
        <strong>{{ money(totals().revenue.actual) }}</strong>
        <span class="planned">/ {{ money(totals().revenue.planned) }}</span>
      </span>
      <span class="figure" [title]="t('finance.totals.actualOfPlannedHint')">
        <span class="label">{{ t('finance.totals.cost') }}</span>
        <strong [class.danger]="isCostOverBudget()">{{ money(totals().cost.actual) }}</strong>
        <span class="planned">/ {{ money(totals().cost.planned) }}</span>
      </span>
      <span class="figure" [title]="t('finance.totals.marginHint')">
        <span class="label">{{ t('finance.totals.margin') }}</span>
        <strong [class.danger]="isMarginNegative()">{{ money(totals().margin.actual.amount) }}</strong>
        @if (totals().margin.actual.percent !== null) {
          <span class="planned" [class.danger]="isMarginNegative()">({{ format.percent(totals().margin.actual.percent) }})</span>
        }
      </span>
    </ng-container>
  `,
  styles: [`
    :host { display:flex; flex-wrap:wrap; gap:4px 16px; font-size:12px; color:#6b7280; }
    .figure { display:inline-flex; align-items:baseline; gap:5px; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .label { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; color:#9ca3af; }
    strong { color:#111827; font-weight:600; }
    .danger, strong.danger { color:#DC2626; }
  `],
})
export class ProjectFinanceTotalsComponent {
  readonly format = inject(ProjectFinanceFormatService);

  readonly totals = input.required<ProjectFinanceTotals>();

  readonly isCostOverBudget = computed(() => this.totals().cost.actual > this.totals().cost.planned);
  readonly isMarginNegative = computed(() => (this.totals().margin.actual.amount ?? 0) < 0);

  money(amount: number | null): string {
    return this.format.money(amount, this.totals().currency);
  }
}
