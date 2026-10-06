import { ProjectTaskRow } from '../../core/services/projects-api.service';
import { buildTaskRows } from './project-task-tree.util';

export const MS_PER_DAY = 86_400_000;

/** What the timeline needs to know about the project a task belongs to. */
export interface GanttProject {
  id: string;
  key: string;
  name: string;
  end_date: string | null;
}

export interface GanttBar {
  leftPx: number;
  widthPx: number;
  startDate: string;
  endDate: string;
}

/** Where the end date used to be: a grey segment between the original and the current end date, and a tick on the original day. */
export interface GanttGhost {
  leftPx: number;
  widthPx: number;
  tickLeftPx: number;
  isLater: boolean;
  days: number;
  originalEndDate: string;
}

export interface GanttSegment {
  leftPx: number;
  widthPx: number;
}

export interface GanttTaskRow {
  kind: 'task';
  task: ProjectTaskRow;
  depth: number;
  bar: GanttBar | null;
  ghost: GanttGhost | null;
  /** The part of the bar that lies after the project's end date. */
  beyondProjectEnd: GanttSegment | null;
  projectEndLeftPx: number | null;
}

export interface GanttProjectRow {
  kind: 'project';
  project: GanttProject;
  projectEndLeftPx: number | null;
}

export type GanttRow = GanttTaskRow | GanttProjectRow;

export interface GanttRange {
  startDay: number;
  endDay: number;
}

// Dates are plain "YYYY-MM-DD" strings; all arithmetic is done in UTC so a
// local timezone or DST change never shifts a bar by a day.
export const toUtcDay = (isoDate: string): number => Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / MS_PER_DAY);
export const utcDayToDate = (day: number): Date => new Date(day * MS_PER_DAY);
export const todayIsoDate = (): string => new Date().toISOString().slice(0, 10);

/** Whole months around every date the timeline draws, as [first UTC day, last UTC day]. */
export function ganttRange(tasks: ProjectTaskRow[], projects: GanttProject[]): GanttRange {
  const dates = [
    ...tasks.flatMap(task => [task.start_date, task.end_date, task.slip_days === null ? null : task.original_end_date]),
    ...projects.map(project => project.end_date),
  ].filter((date): date is string => !!date);
  const sorted = (dates.length ? dates : [todayIsoDate()]).sort();
  const first = new Date(`${sorted[0]}T00:00:00Z`);
  const last = new Date(`${sorted[sorted.length - 1]}T00:00:00Z`);
  return {
    startDay: Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1) / MS_PER_DAY,
    endDay: Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0) / MS_PER_DAY,
  };
}

/**
 * Rows of the timeline: tasks as a tree, under a header row per project when
 * `isGroupedByProject`. The server sends the tasks flat, ordered by project
 * key and task number; that order is kept for the projects and among
 * siblings. A task of a project missing from `projects` is still drawn,
 * without the project marks.
 */
export function buildGanttRows(
  tasks: ProjectTaskRow[], projects: GanttProject[], isGroupedByProject: boolean, range: GanttRange, dayWidthPx: number,
): GanttRow[] {
  const leftOfDay = (day: number): number => (day - range.startDay) * dayWidthPx;
  const projectById = new Map(projects.map(project => [project.id, project]));
  const tasksByProject = new Map<string, ProjectTaskRow[]>();
  for (const task of tasks) tasksByProject.set(task.project_id, [...(tasksByProject.get(task.project_id) ?? []), task]);

  const rows: GanttRow[] = [];
  for (const [projectId, projectTasks] of tasksByProject) {
    const project = projectById.get(projectId)
      ?? { id: projectId, key: projectTasks[0].project_key, name: projectTasks[0].project_name, end_date: null };
    const projectEndDay = project.end_date ? toUtcDay(project.end_date) : null;
    // The line stands at the end of the project's last day.
    const projectEndLeftPx = projectEndDay === null ? null : leftOfDay(projectEndDay + 1);
    if (isGroupedByProject) rows.push({ kind: 'project', project, projectEndLeftPx });

    for (const { task, depth } of buildTaskRows(projectTasks)) {
      // A task with a single date is drawn as a one-day bar on that date.
      const startDate = task.start_date ?? task.end_date;
      const endDate = task.end_date ?? task.start_date;
      if (!startDate || !endDate) {
        rows.push({ kind: 'task', task, depth, bar: null, ghost: null, beyondProjectEnd: null, projectEndLeftPx });
        continue;
      }
      const startDay = toUtcDay(startDate);
      const endDay = toUtcDay(endDate);
      rows.push({
        kind: 'task', task, depth, projectEndLeftPx,
        bar: { leftPx: leftOfDay(startDay), widthPx: (endDay - startDay + 1) * dayWidthPx, startDate, endDate },
        ghost: ghostOf(task, leftOfDay, dayWidthPx),
        beyondProjectEnd: projectEndDay !== null && endDay > projectEndDay
          ? {
            leftPx: leftOfDay(Math.max(projectEndDay + 1, startDay)),
            widthPx: (endDay - Math.max(projectEndDay, startDay - 1)) * dayWidthPx,
          }
          : null,
      });
    }
  }
  return rows;
}

function ghostOf(task: ProjectTaskRow, leftOfDay: (day: number) => number, dayWidthPx: number): GanttGhost | null {
  if (task.slip_days === null || task.slip_days === 0 || !task.original_end_date || !task.end_date) return null;
  const originalDay = toUtcDay(task.original_end_date);
  const endDay = toUtcDay(task.end_date);
  const earlierDay = Math.min(originalDay, endDay);
  return {
    leftPx: leftOfDay(earlierDay + 1),
    widthPx: Math.abs(endDay - originalDay) * dayWidthPx,
    tickLeftPx: leftOfDay(originalDay + 1),
    isLater: task.slip_days > 0,
    days: Math.abs(task.slip_days),
    originalEndDate: task.original_end_date,
  };
}
