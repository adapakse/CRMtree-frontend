// Export of a task to a calendar outside the CRM, as a plain entry — no
// attendees, no invitation. Three targets: an .ics file (any calendar app),
// and "add event" links for Google Calendar and Outlook on the web.

const DEFAULT_DURATION_MIN = 30;
const MS_PER_MINUTE = 60_000;
// Tasks that have a due date but no due time are placed at this local hour,
// the same one the CRM calendar and the reminder emails use.
const DUE_DATE_TIME = '09:00:00';

export interface CalendarEntry {
  title: string;
  description: string;
  /** Link back to the task in the CRM. */
  url: string;
  location?: string;
  start: Date;
  durationMin: number;
}

const pad = (value: number): string => String(value).padStart(2, '0');

// "20261114T090000Z"
function utcStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
    + `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

const endOf = (entry: CalendarEntry): Date => new Date(entry.start.getTime() + entry.durationMin * MS_PER_MINUTE);

const descriptionWithLink = (entry: CalendarEntry): string =>
  [entry.description, entry.url].filter(Boolean).join('\n\n');

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

export function buildIcs(entry: CalendarEntry): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CRMtree//Tasks//PL',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@crmtree`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(entry.start)}`,
    `DTEND:${utcStamp(endOf(entry))}`,
    `SUMMARY:${escapeIcsText(entry.title)}`,
    `DESCRIPTION:${escapeIcsText(descriptionWithLink(entry))}`,
    `URL:${entry.url}`,
    ...(entry.location ? [`LOCATION:${escapeIcsText(entry.location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

export function googleCalendarUrl(entry: CalendarEntry): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: entry.title,
    dates: `${utcStamp(entry.start)}/${utcStamp(endOf(entry))}`,
    details: descriptionWithLink(entry),
  });
  if (entry.location) params.set('location', entry.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(entry: CalendarEntry): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: entry.title,
    body: descriptionWithLink(entry),
    startdt: entry.start.toISOString(),
    enddt: endOf(entry).toISOString(),
  });
  if (entry.location) params.set('location', entry.location);
  return `https://outlook.office.com/calendar/deeplink/compose?${params.toString()}`;
}

export function downloadIcs(entry: CalendarEntry): void {
  const blob = new Blob([buildIcs(entry)], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${entry.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60) || 'zadanie'}.ics`;
  link.click();
  URL.revokeObjectURL(link.href);
}

const absoluteUrl = (path: string): string => `${window.location.origin}${path}`;

/** Local 09:00 on the given day ("YYYY-MM-DD" or a longer ISO string). */
export function dueDateStart(dueDate: string, time: string = DUE_DATE_TIME): Date {
  return new Date(`${dueDate.slice(0, 10)}T${time}`);
}

// ── Entries for each kind of task ──────────────────────────────────────────

function sourcePath(sourceType: string, sourceId: number | string, projectTaskId?: string): string {
  switch (sourceType) {
    case 'partner':    return `/crm/partners/${sourceId}`;
    case 'onboarding': return `/crm/onboarding?partner=${sourceId}`;
    case 'document':   return `/documents/${sourceId}`;
    case 'project':    return `/projects/${sourceId}${projectTaskId ? `?task=${projectTaskId}` : ''}`;
    default:           return `/crm/leads/${sourceId}`;
  }
}

/**
 * Entry for a row of the CRM task feeds (lead, partner, onboarding, document
 * or project task). Returns null without a date.
 */
export function activityCalendarEntry(activity: {
  title: string;
  body?: string | null;
  activity_at: string | null;
  duration_min?: number | null;
  meeting_location?: string | null;
  source_type: string;
  source_id: number | string;
  source_name?: string | null;
  project_task_id?: string;
}): CalendarEntry | null {
  if (!activity.activity_at) return null;
  const isProjectTask = activity.source_type === 'project';
  const plainBody = (activity.body ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    // A project task's title already starts with its number (e.g. "WSC-6 …").
    title: activity.source_name && !isProjectTask ? `${activity.title} — ${activity.source_name}` : activity.title,
    description: isProjectTask ? `Projekt: ${activity.source_name ?? ''}` : plainBody,
    url: absoluteUrl(sourcePath(activity.source_type, activity.source_id, activity.project_task_id)),
    location: activity.meeting_location ?? undefined,
    start: new Date(activity.activity_at),
    durationMin: activity.duration_min || DEFAULT_DURATION_MIN,
  };
}

/** Project task: 09:00 on its due date. Returns null without a due date. */
export function projectTaskCalendarEntry(task: {
  projectId: string;
  projectKey: string;
  projectName: string;
  taskId: string;
  taskNumber: number;
  name: string;
  endDate: string | null;
}): CalendarEntry | null {
  if (!task.endDate) return null;
  return {
    title: `${task.projectKey}-${task.taskNumber} ${task.name}`,
    description: `Projekt: ${task.projectName}`,
    url: absoluteUrl(`/projects/${task.projectId}?task=${task.taskId}`),
    start: dueDateStart(task.endDate),
    durationMin: DEFAULT_DURATION_MIN,
  };
}

/** A task that only has a due date, optionally with its own time ("HH:mm"). */
export function dueDateCalendarEntry(task: {
  title: string;
  description?: string;
  path: string;
  dueDate: string | null;
  dueTime?: string | null;
}): CalendarEntry | null {
  if (!task.dueDate) return null;
  return {
    title: task.title,
    description: task.description ?? '',
    url: absoluteUrl(task.path),
    start: task.dueTime ? dueDateStart(task.dueDate, `${task.dueTime.slice(0, 5)}:00`) : dueDateStart(task.dueDate),
    durationMin: DEFAULT_DURATION_MIN,
  };
}
