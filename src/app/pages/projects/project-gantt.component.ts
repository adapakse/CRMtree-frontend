import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { LocaleService } from '../../core/i18n/locale.service';
import { ProjectConfig, ProjectTask } from '../../core/services/projects-api.service';
import { INDENT_PX_PER_LEVEL, buildTaskRows } from './project-task-tree.util';

type GanttZoom = 'day' | 'week' | 'month';

const ZOOM_OPTIONS: { value: GanttZoom; labelKey: string; dayWidthPx: number }[] = [
  { value: 'day', labelKey: 'gantt.zoom.day', dayWidthPx: 28 },
  { value: 'week', labelKey: 'gantt.zoom.week', dayWidthPx: 10 },
  { value: 'month', labelKey: 'gantt.zoom.month', dayWidthPx: 4 },
];

const MS_PER_DAY = 86_400_000;
const FALLBACK_BAR_COLOR = '#6B7280';

interface MonthSegment { label: string; leftPx: number; widthPx: number; }
interface DayTick { label: number; leftPx: number; isWeekend: boolean; }
interface GanttBar { leftPx: number; widthPx: number; color: string; isDone: boolean; label: string; }
interface GanttRow { task: ProjectTask; depth: number; bar: GanttBar | null; }

// Dates are plain "YYYY-MM-DD" strings; all arithmetic is done in UTC so a
// local timezone or DST change never shifts a bar by a day.
const toUtcDay = (isoDate: string): number => Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / MS_PER_DAY);
const todayIsoDate = (): string => new Date().toISOString().slice(0, 10);

/** Read-only timeline of the project's tasks. Tasks without any date have no bar. */
@Component({
  selector: 'wt-project-gantt',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      @if (rows().length === 0) {
        <div class="empty-state"><div class="empty-title">{{ t('gantt.emptyTitle') }}</div></div>
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
            @for (row of rows(); track row.task.id) {
              <div class="name-cell" (click)="taskOpened.emit(row.task.id)" [title]="row.task.name">
                <span [style.padding-left.px]="row.depth * indentPx" [class.root]="row.task.parent_task_id === null">
                  <span class="mono">{{ projectKey() }}-{{ row.task.task_number }}</span> {{ row.task.name }}
                </span>
              </div>
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
                @for (row of rows(); track row.task.id) {
                  <div class="bar-row">
                    @if (row.bar; as bar) {
                      <div class="bar" [class.done]="bar.isDone" [style.left.px]="bar.leftPx" [style.width.px]="bar.widthPx"
                           [style.background]="bar.color" [title]="bar.label" (click)="taskOpened.emit(row.task.id)"></div>
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
    .names { width:320px; flex-shrink:0; border-right:1px solid var(--gray-200); }
    .names-head { display:flex; align-items:flex-end; padding:0 12px 8px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; color:var(--gray-500); background:var(--gray-50); border-bottom:1px solid var(--gray-200); box-sizing:border-box; }
    .name-cell { height:34px; display:flex; align-items:center; padding:0 12px; font-size:13px; color:var(--gray-800); border-bottom:1px solid var(--gray-100); cursor:pointer; white-space:nowrap; overflow:hidden; }
    .name-cell > span { overflow:hidden; text-overflow:ellipsis; }
    .name-cell:hover { background:var(--gray-50); }
    .name-cell .root { font-weight:600; }
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
    .bar { position:absolute; top:8px; height:18px; border-radius:5px; cursor:pointer; min-width:6px; z-index:1; }
    .bar.done { opacity:.55; }
    .bar:hover { filter:brightness(.92); }
  `],
})
export class ProjectGanttComponent {
  readonly tasks = input.required<ProjectTask[]>();
  readonly config = input.required<ProjectConfig>();
  readonly projectKey = input.required<string>();
  readonly taskOpened = output<string>();

  private readonly monthFormatter = new Intl.DateTimeFormat(inject(LocaleService).activeLocale(), { month: 'short', timeZone: 'UTC' });

  readonly zoomOptions = ZOOM_OPTIONS;
  readonly indentPx = INDENT_PX_PER_LEVEL;
  readonly zoom = signal<GanttZoom>('week');

  readonly dayWidthPx = computed(() => ZOOM_OPTIONS.find(option => option.value === this.zoom())!.dayWidthPx);
  readonly headerHeightPx = computed(() => (this.zoom() === 'day' ? 56 : 28));
  readonly undatedCount = computed(() => this.tasks().filter(task => !task.start_date && !task.end_date).length);

  // Whole months around the dated tasks, as [first UTC day, last UTC day].
  private readonly range = computed(() => {
    const dates = this.tasks().flatMap(task => [task.start_date, task.end_date]).filter((date): date is string => !!date);
    const sorted = (dates.length ? dates : [todayIsoDate()]).sort();
    const first = new Date(`${sorted[0]}T00:00:00Z`);
    const last = new Date(`${sorted[sorted.length - 1]}T00:00:00Z`);
    const startDay = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1) / MS_PER_DAY;
    const endDay = Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0) / MS_PER_DAY;
    return { startDay, endDay };
  });

  readonly timelineWidthPx = computed(() => (this.range().endDay - this.range().startDay + 1) * this.dayWidthPx());

  readonly months = computed<MonthSegment[]>(() => {
    const { startDay, endDay } = this.range();
    const segments: MonthSegment[] = [];
    let cursor = new Date(startDay * MS_PER_DAY);
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
      const date = new Date(day * MS_PER_DAY);
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

  readonly rows = computed<GanttRow[]>(() => {
    const statusById = new Map(this.config().statuses.map(status => [status.id, status]));
    const { startDay } = this.range();
    return buildTaskRows(this.tasks()).map(({ task, depth }) => {
      // A task with a single date is drawn as a one-day bar on that date.
      const startDate = task.start_date ?? task.end_date;
      const endDate = task.end_date ?? task.start_date;
      if (!startDate || !endDate) return { task, depth, bar: null };
      const status = statusById.get(task.status_id);
      const bar: GanttBar = {
        leftPx: (toUtcDay(startDate) - startDay) * this.dayWidthPx(),
        widthPx: (toUtcDay(endDate) - toUtcDay(startDate) + 1) * this.dayWidthPx(),
        color: status?.color ?? FALLBACK_BAR_COLOR,
        isDone: status?.category === 'done',
        label: `${task.name} · ${startDate} – ${endDate} · ${status?.name ?? ''}`,
      };
      return { task, depth, bar };
    });
  });
}
