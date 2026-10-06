import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { ProjectAssigneeSummary, ProjectsApiService, TaskCountsByDeadline } from '../../core/services/projects-api.service';
import { ListQueryState } from '../../shared/list/list-query';
import { UNASSIGNED } from './project-list-filters.service';

type CountKind = 'open' | 'overdue' | 'at_risk';

interface SummaryEntry {
  assignee: string;
  /** Null for the "unassigned" entry, which gets a translated label. */
  displayName: string | null;
  counts: TaskCountsByDeadline;
}

const OPEN_STATUS_CATEGORIES = 'todo,in_progress';

/**
 * Who has how much on their plate in one project: open, overdue and at-risk
 * tasks per person. Clicking a person or a number sets the matching filters
 * of the task list. Only PM, tenant admin and controller get the data; for
 * anyone else the strip stays empty and takes no space.
 */
@Component({
  selector: 'wt-project-assignee-summary',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (entries().length > 0) {
      <div class="strip" *transloco="let t; prefix: 'projects'">
        @for (entry of entries(); track entry.assignee) {
          <div class="person" [class.active]="query().value('assignee') === entry.assignee">
            <button type="button" class="name" (click)="filterBy(entry.assignee, null)">
              {{ entry.displayName ?? t('filters.unassigned') }}
            </button>
            <button type="button" class="count" [title]="t('assigneeSummary.open')" (click)="filterBy(entry.assignee, 'open')">
              {{ entry.counts.open_task_count }}
            </button>
            <button type="button" class="count overdue" [class.zero]="entry.counts.overdue_task_count === 0"
                    [title]="t('assigneeSummary.overdue')" (click)="filterBy(entry.assignee, 'overdue')">
              {{ entry.counts.overdue_task_count }}
            </button>
            <button type="button" class="count at-risk" [class.zero]="entry.counts.at_risk_task_count === 0"
                    [title]="t('assigneeSummary.atRisk')" (click)="filterBy(entry.assignee, 'at_risk')">
              {{ entry.counts.at_risk_task_count }}
            </button>
          </div>
        }
        <span class="key">{{ t('assigneeSummary.key') }}</span>
      </div>
    }
  `,
  styles: [`
    :host { display:block; }
    .strip { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
    .person { display:inline-flex; align-items:center; gap:4px; padding:4px 6px 4px 10px; background:white; border:1px solid var(--gray-200); border-radius:9px; }
    .person.active { border-color:var(--orange); background:var(--orange-pale); }
    button { border:none; background:none; cursor:pointer; font-family:inherit; }
    .name { padding:0 4px 0 0; font-size:12.5px; font-weight:600; color:var(--gray-800); }
    .name:hover { color:var(--orange-dark); }
    .count { min-width:22px; padding:1px 6px; border-radius:8px; font-size:11.5px; font-weight:700; font-variant-numeric:tabular-nums; background:var(--gray-100); color:var(--gray-700); }
    .count:hover { filter:brightness(.95); }
    .count.overdue { background:#FEE2E2; color:#B91C1C; }
    .count.at-risk { background:#FEF3C7; color:#92400E; }
    .count.zero { background:var(--gray-50); color:var(--gray-300); }
    .key { font-size:11.5px; color:var(--gray-400); }
  `],
})
export class ProjectAssigneeSummaryComponent implements OnInit {
  private readonly api = inject(ProjectsApiService);

  readonly projectId = input.required<string>();
  readonly query = input.required<ListQueryState>();

  private readonly summary = signal<ProjectAssigneeSummary | null>(null);

  readonly entries = computed<SummaryEntry[]>(() => {
    const summary = this.summary();
    if (!summary) return [];
    const people = summary.people.map(person => ({ assignee: person.user_id, displayName: person.display_name, counts: person }));
    const hasUnassignedTasks = summary.unassigned.open_task_count > 0;
    return hasUnassignedTasks ? [...people, { assignee: UNASSIGNED, displayName: null, counts: summary.unassigned }] : people;
  });

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    // A refusal (the viewer's role changed meanwhile) simply hides the strip.
    this.api.getAssigneeSummary(this.projectId()).subscribe({
      next: summary => this.summary.set(summary),
      error: () => this.summary.set(null),
    });
  }

  /** `kind` null filters by the person alone; a count narrows to the tasks it counted. */
  filterBy(assignee: string, kind: CountKind | null): void {
    this.query().setValues({
      assignee,
      status_category: kind === 'open' ? OPEN_STATUS_CATEGORIES : '',
      timeliness: kind === 'overdue' || kind === 'at_risk' ? kind : '',
    });
  }
}
