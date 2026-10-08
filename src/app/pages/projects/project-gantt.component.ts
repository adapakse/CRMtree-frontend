import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { LocaleService } from '../../core/i18n/locale.service';
import { ProjectFinanceFormatService } from '../../core/services/project-finance-format.service';
import { ProjectTaskRow } from '../../core/services/projects-api.service';
import { ProjectTaskTimelinessComponent } from '../../shared/components/project-deadlines/project-task-timeliness.component';
import {
  GanttProject, GanttTaskRow, MS_PER_DAY, buildGanttRows, ganttRange, toUtcDay, todayIsoDate, utcDayToDate,
} from './project-gantt.util';
import { INDENT_PX_PER_LEVEL } from './project-task-tree.util';

type GanttZoom = 'day' | 'week' | 'month';
type Translate = (key: string, params?: Record<string, unknown>) => string;

const ZOOM_OPTIONS: { value: GanttZoom; labelKey: string; dayWidthPx: number }[] = [
  { value: 'day', labelKey: 'gantt.zoom.day', dayWidthPx: 28 },
  { value: 'week', labelKey: 'gantt.zoom.week', dayWidthPx: 10 },
  { value: 'month', labelKey: 'gantt.zoom.month', dayWidthPx: 4 },
];

interface MonthSegment { label: string; leftPx: number; widthPx: number; }
interface DayTick { label: number; leftPx: number; isWeekend: boolean; }

/**
 * Read-only timeline of tasks, of one project or grouped by project. Tasks
 * without any date have no bar. Besides the bars it shows where a moved end
 * date used to be, each project's end date, and the part of a task that runs
 * past it.
 */
@Component({
  selector: 'wt-project-gantt',
  standalone: true,
  imports: [TranslocoDirective, ProjectTaskTimelinessComponent],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      @if (tasks().length === 0) {
        <div class="empty-state">
          <div class="empty-title">{{ t('gantt.emptyTitle') }}</div>
          {{ emptyMessage() }}
        </div>
      } @else {
        <div class="zoom">
          @for (option of zoomOptions; track option.value) {
            <button class="zoom-btn" [class.active]="zoom() === option.value" (click)="zoom.set(option.value)">{{ t(option.labelKey) }}</button>
          }
          @if (undatedCount() > 0) {
            <span class="undated-note">{{ t('gantt.undatedNote', { count: undatedCount() }) }}</span>
          }
        </div>

        <div class="gantt">
          <div class="names">
            <div class="names-head" [style.height.px]="headerHeightPx()">{{ t('gantt.taskColumn') }}</div>
            @for (row of rows(); track $index) {
              @if (row.kind === 'project') {
                <div class="name-cell project-cell" [title]="row.project.name">
                  <span><span class="mono">{{ row.project.key }}</span> {{ row.project.name }}</span>
                </div>
              } @else {
                <div class="name-cell" (click)="taskOpened.emit(row.task)" [title]="row.task.name">
                  <span class="name" [style.padding-left.px]="row.depth * indentPx" [class.root]="row.task.parent_task_id === null">
                    <span class="mono">{{ row.task.project_key }}-{{ row.task.task_number }}</span> {{ row.task.name }}
                  </span>
                  @if (row.beyondProjectEnd) {
                    <span class="beyond-flag" [title]="t('gantt.beyondProjectEnd')">⚑</span>
                  }
                  <wt-project-task-timeliness [task]="row.task" [isCompact]="true" />
                </div>
              }
            }
          </div>

          <div class="timeline">
            <div class="canvas" [style.width.px]="timelineWidthPx()">
              <div class="months">
                @for (month of months(); track month.leftPx) {
                  <div class="month" [style.left.px]="month.leftPx" [style.width.px]="month.widthPx">{{ month.label }}</div>
                }
              </div>
              @if (zoom() === 'day') {
                <div class="days">
                  @for (day of days(); track day.leftPx) {
                    <div class="day" [class.weekend]="day.isWeekend" [style.left.px]="day.leftPx" [style.width.px]="dayWidthPx()">{{ day.label }}</div>
                  }
                </div>
              }

              <div class="body">
                @for (month of months(); track month.leftPx) {
                  <div class="month-line" [style.left.px]="month.leftPx"></div>
                }
                @if (todayLeftPx() !== null) {
                  <div class="today-line" [style.left.px]="todayLeftPx()" [title]="t('gantt.today')"></div>
                }
                @for (row of rows(); track $index) {
                  <div class="bar-row" [class.project-row]="row.kind === 'project'">
                    @if (row.projectEndLeftPx !== null) {
                      <div class="project-end" [style.left.px]="row.projectEndLeftPx"
                           [title]="t('gantt.projectEndDate', { date: format.date(projectEndDateOf(row.kind === 'project' ? row.project.id : row.task.project_id)) })"></div>
                    }
                    @if (row.kind === 'task') {
                      @if (row.bar; as bar) {
                        <div class="bar" [class.done]="row.task.status_category === 'done'" [class.overdue]="row.task.timeliness === 'overdue'"
                             [class.at-risk]="row.task.timeliness === 'at_risk'" [style.left.px]="bar.leftPx" [style.width.px]="bar.widthPx"
                             [style.background]="row.task.status_color" [title]="barLabel(row, t)" (click)="taskOpened.emit(row.task)"></div>
                      }
                      @if (row.beyondProjectEnd; as segment) {
                        <div class="beyond-end" [style.left.px]="segment.leftPx" [style.width.px]="segment.widthPx"
                             [title]="t('gantt.beyondProjectEnd')" (click)="taskOpened.emit(row.task)"></div>
                      }
                      @if (row.ghost; as ghost) {
                        <div class="ghost" [class.later]="ghost.isLater" [style.left.px]="ghost.leftPx" [style.width.px]="ghost.widthPx"
                             [title]="ghostLabel(row, t)"></div>
                        <div class="original-tick" [style.left.px]="ghost.tickLeftPx" [title]="ghostLabel(row, t)"></div>
                      }
                    }
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      }
    </ng-container>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; gap:10px; }
    .zoom { display:flex; align-items:center; gap:6px; }
    .zoom-btn { border:1.5px solid var(--gray-200); background:white; border-radius:8px; padding:5px 11px; font-size:12.5px; cursor:pointer; color:var(--gray-600); font-family:inherit; }
    .zoom-btn.active { border-color:var(--orange); color:var(--orange-dark); background:var(--orange-pale); font-weight:600; }
    .undated-note { font-size:12px; color:var(--gray-400); margin-left:8px; }

    .gantt { display:flex; background:white; border:1px solid var(--gray-200); border-radius:var(--radius); box-shadow:var(--shadow-sm); overflow:hidden; }
    .names { width:340px; flex-shrink:0; border-right:1px solid var(--gray-200); }
    .names-head { display:flex; align-items:flex-end; padding:0 12px 8px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; color:var(--gray-500); background:var(--gray-50); border-bottom:1px solid var(--gray-200); box-sizing:border-box; }
    .name-cell { height:34px; display:flex; align-items:center; gap:6px; padding:0 12px; font-size:13px; color:var(--gray-800); border-bottom:1px solid var(--gray-100); cursor:pointer; white-space:nowrap; overflow:hidden; box-sizing:border-box; }
    .name-cell > span:first-child { overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; }
    .name-cell:hover { background:var(--gray-50); }
    .name-cell .root { font-weight:600; }
    .name-cell.project-cell { background:var(--gray-100); font-weight:700; cursor:default; }
    .beyond-flag { color:#DC2626; font-size:12px; flex-shrink:0; }
    .mono { font-family:'Sora',monospace; font-size:11px; color:var(--gray-500); font-weight:600; }

    .timeline { flex:1; overflow-x:auto; min-width:0; }
    .canvas { position:relative; }
    .months, .days { position:relative; height:28px; background:var(--gray-50); border-bottom:1px solid var(--gray-200); box-sizing:border-box; }
    .month { position:absolute; top:0; height:100%; display:flex; align-items:center; padding-left:8px; font-size:11.5px; font-weight:600; color:var(--gray-600); border-left:1px solid var(--gray-200); box-sizing:border-box; white-space:nowrap; overflow:hidden; }
    .day { position:absolute; top:0; height:100%; display:flex; align-items:center; justify-content:center; font-size:10.5px; color:var(--gray-500); box-sizing:border-box; }
    .day.weekend { background:var(--gray-100); color:var(--gray-400); }
    .body { position:relative; }
    .month-line { position:absolute; top:0; bottom:0; width:1px; background:var(--gray-200); }
    .today-line { position:absolute; top:0; bottom:0; width:2px; background:#DC2626; opacity:.7; z-index:2; }
    .bar-row { position:relative; height:34px; border-bottom:1px solid var(--gray-100); box-sizing:border-box; }
    .bar-row.project-row { background:var(--gray-100); }
    .bar { position:absolute; top:7px; height:18px; border-radius:5px; cursor:pointer; min-width:6px; z-index:1; box-sizing:border-box; }
    .bar.done { opacity:.55; }
    .bar.overdue { box-shadow:0 0 0 2px #DC2626; }
    .bar.at-risk { box-shadow:0 0 0 2px #F59E0B; }
    .bar:hover { filter:brightness(.92); }
    .beyond-end { position:absolute; top:7px; height:18px; border-radius:0 5px 5px 0; z-index:1; cursor:pointer; opacity:.85; background:repeating-linear-gradient(135deg, #DC2626 0 4px, transparent 4px 8px); }
    /* Moved later: a strip under the bar's tail. Pulled in: a strip from the bar's end to the old date. */
    .ghost { position:absolute; top:27px; height:4px; border-radius:2px; background:var(--gray-400); z-index:1; }
    .ghost:not(.later) { top:14px; }
    .original-tick { position:absolute; top:4px; height:27px; width:2px; margin-left:-2px; background:var(--gray-500); z-index:3; }
    .project-end { position:absolute; top:0; bottom:0; width:0; margin-left:-1px; border-left:2px dashed #7C3AED; z-index:2; }
  `],
})
export class ProjectGanttComponent {
  readonly format = inject(ProjectFinanceFormatService);

  readonly tasks = input.required<ProjectTaskRow[]>();
  /** Projects of the listed tasks; their end dates are drawn as lines. */
  readonly projects = input.required<GanttProject[]>();
  readonly isGroupedByProject = input(false);
  readonly emptyMessage = input('');
  readonly taskOpened = output<ProjectTaskRow>();

  private readonly monthFormatter = new Intl.DateTimeFormat(inject(LocaleService).activeLocale(), { month: 'short', timeZone: 'UTC' });

  readonly zoomOptions = ZOOM_OPTIONS;
  readonly indentPx = INDENT_PX_PER_LEVEL;
  readonly zoom = signal<GanttZoom>('week');

  readonly dayWidthPx = computed(() => ZOOM_OPTIONS.find(option => option.value === this.zoom())!.dayWidthPx);
  readonly headerHeightPx = computed(() => (this.zoom() === 'day' ? 56 : 28));
  readonly undatedCount = computed(() => this.tasks().filter(task => !task.start_date && !task.end_date).length);

  private readonly range = computed(() => ganttRange(this.tasks(), this.projects()));
  private readonly projectEndDateById = computed(() => new Map(this.projects().map(project => [project.id, project.end_date])));

  readonly timelineWidthPx = computed(() => (this.range().endDay - this.range().startDay + 1) * this.dayWidthPx());

  readonly months = computed<MonthSegment[]>(() => {
    const { startDay, endDay } = this.range();
    const segments: MonthSegment[] = [];
    let cursor = utcDayToDate(startDay);
    while (cursor.getTime() / MS_PER_DAY <= endDay) {
      const year = cursor.getUTCFullYear();
      const month = cursor.getUTCMonth();
      const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      segments.push({
        label: `${this.monthFormatter.format(cursor)} ${year}`,
        leftPx: (cursor.getTime() / MS_PER_DAY - startDay) * this.dayWidthPx(),
        widthPx: daysInMonth * this.dayWidthPx(),
      });
      cursor = new Date(Date.UTC(year, month + 1, 1));
    }
    return segments;
  });

  readonly days = computed<DayTick[]>(() => {
    const { startDay, endDay } = this.range();
    const ticks: DayTick[] = [];
    for (let day = startDay; day <= endDay; day++) {
      const date = utcDayToDate(day);
      const weekday = date.getUTCDay();
      ticks.push({
        label: date.getUTCDate(),
        leftPx: (day - startDay) * this.dayWidthPx(),
        isWeekend: weekday === 0 || weekday === 6,
      });
    }
    return ticks;
  });

  readonly todayLeftPx = computed<number | null>(() => {
    const today = toUtcDay(todayIsoDate());
    const { startDay, endDay } = this.range();
    return today >= startDay && today <= endDay ? (today - startDay) * this.dayWidthPx() : null;
  });

  readonly rows = computed(() =>
    buildGanttRows(this.tasks(), this.projects(), this.isGroupedByProject(), this.range(), this.dayWidthPx()));

  projectEndDateOf(projectId: string): string | null {
    return this.projectEndDateById().get(projectId) ?? null;
  }

  barLabel(row: GanttTaskRow, t: Translate): string {
    const parts = [row.task.name, `${this.format.date(row.bar?.startDate)} – ${this.format.date(row.bar?.endDate)}`, row.task.status_name];
    if (row.task.timeliness === 'overdue' && row.task.days_overdue) {
      parts.push(t('deadlines.overdueDays', { days: row.task.days_overdue }));
    }
    return parts.join(' · ');
  }

  ghostLabel(row: GanttTaskRow, t: Translate): string {
    const ghost = row.ghost;
    if (!ghost) return '';
    const slip = t(ghost.isLater ? 'deadlines.slipLater' : 'deadlines.slipEarlier', { days: ghost.days });
    return t('gantt.originalEndDate', { date: this.format.date(ghost.originalEndDate), slip });
  }
}
