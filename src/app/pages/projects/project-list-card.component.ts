import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { ProjectFinanceFormatService } from '../../core/services/project-finance-format.service';
import { ProjectListItem } from '../../core/services/projects-api.service';
import { ProjectDelayBadgeComponent } from '../../shared/components/project-deadlines/project-delay-badge.component';
import { ProjectFinanceTotalsComponent } from '../../shared/components/project-finance-totals/project-finance-totals.component';

/** One project on the project list: dates, delay, task progress and, for finance readers, the headline figures. */
@Component({
  selector: 'wt-project-list-card',
  standalone: true,
  imports: [TranslocoDirective, ProjectDelayBadgeComponent, ProjectFinanceTotalsComponent],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button class="card project-card" *transloco="let t; prefix: 'projects'" (click)="opened.emit()">
      <div class="project-head">
        <span class="mono">{{ project().key }}</span>
        @if (project().status === 'closed') { <span class="pill closed">{{ t('list.closedBadge') }}</span> }
        @if (project().my_role; as role) { <span class="pill role">{{ t('labels.roles.' + role) }}</span> }
        <wt-project-delay-badge [schedule]="project()" />
      </div>
      <div class="project-name">{{ project().name }}</div>
      @if (project().description) { <div class="project-description">{{ project().description }}</div> }
      @if (project().start_date || project().end_date) {
        <div class="project-dates">{{ format.date(project().start_date) }} – {{ format.date(project().end_date) }}</div>
      }
      <wt-project-delay-badge [schedule]="project()" display="reason" />
      <div class="project-stats">
        <span>
          <strong [title]="t('list.stats.doneOfTotalHint')">{{ project().done_task_count }}/{{ project().task_count }}</strong>
          {{ t('list.stats.tasks', { count: project().task_count }) }}
        </span>
        <span><strong>{{ project().member_count }}</strong> {{ t('list.stats.members', { count: project().member_count }) }}</span>
        @if (project().overdue_task_count > 0) {
          <span class="overdue"><strong>{{ project().overdue_task_count }}</strong> {{ t('list.stats.overdue') }}</span>
        }
        @if (project().at_risk_task_count > 0) {
          <span class="at-risk"><strong>{{ project().at_risk_task_count }}</strong> {{ t('list.stats.atRisk') }}</span>
        }
        @if (project().my_open_task_count > 0) {
          <span class="mine"><strong>{{ project().my_open_task_count }}</strong> {{ t('list.stats.myOpenTasks', { count: project().my_open_task_count }) }}</span>
        }
      </div>
      @if (project().finance; as totals) { <wt-project-finance-totals class="project-finance" [totals]="totals" /> }
    </button>
  `,
  styles: [`
    :host { display:flex; }
    .project-card { flex:1; min-width:0; text-align:left; padding:16px; cursor:pointer; font-family:inherit; display:flex; flex-direction:column; gap:8px; transition:box-shadow .15s, border-color .15s; }
    .project-card:hover { box-shadow:var(--shadow); border-color:var(--orange-muted); }
    .project-head { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
    .project-name { font-size:15px; font-weight:700; color:var(--gray-900); }
    .project-description { font-size:12.5px; color:var(--gray-500); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .project-dates { font-size:12px; color:var(--gray-600); font-variant-numeric:tabular-nums; }
    .project-stats { display:flex; flex-wrap:wrap; gap:4px 14px; font-size:12px; color:var(--gray-500); margin-top:auto; }
    .project-stats .mine strong { color:var(--orange); }
    .project-stats .overdue, .project-stats .overdue strong { color:#B91C1C; }
    .project-stats .at-risk, .project-stats .at-risk strong { color:#92400E; }
    .project-finance { padding-top:8px; border-top:1px solid var(--gray-100); }
    .pill.role { background:var(--orange-pale); color:var(--orange-dark); }
    .pill.closed { background:var(--gray-100); color:var(--gray-500); }
  `],
})
export class ProjectListCardComponent {
  readonly format = inject(ProjectFinanceFormatService);

  readonly project = input.required<ProjectListItem>();
  readonly opened = output<void>();
}
