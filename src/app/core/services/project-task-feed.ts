import type { ActivityTask, CalendarMeeting } from './crm-api.service';
import type { AssignedProjectTask } from './projects-api.service';

// A project task has a due date but no due time. In the CRM calendar grid and
// task lists it is placed at this local hour and flagged `all_day`, so views
// can show "termin" instead of a clock time.
const ALL_DAY_ANCHOR_TIME = '09:00:00';

function dueDateAsIso(endDate: string): string {
  return new Date(`${endDate}T${ALL_DAY_ANCHOR_TIME}`).toISOString();
}

// CRM task lists key their rows by a numeric id; project tasks have UUIDs.
// The first 13 hex digits fit a safe integer and are unique enough for a row key.
function numericKeyOf(taskId: string): number {
  return parseInt(taskId.replace(/-/g, '').slice(0, 13), 16);
}

function titleOf(task: AssignedProjectTask): string {
  return `${task.project_key}-${task.task_number} ${task.name}`;
}

function assigneeNamesOf(task: AssignedProjectTask): string | null {
  return task.assignees.map(assignee => assignee.display_name).join(', ') || null;
}

export function projectTaskToActivityTask(task: AssignedProjectTask): ActivityTask {
  return {
    uid: `project-${task.id}`,
    id: numericKeyOf(task.id),
    type: 'task',
    title: titleOf(task),
    body: null,
    activity_at: task.end_date ? dueDateAsIso(task.end_date) : null,
    all_day: true,
    duration_min: null,
    participants: null,
    meeting_location: null,
    created_by: null,
    created_by_name: null,
    status: task.status_category === 'done' ? 'closed' : 'open',
    status_label: task.status_name,
    close_comment: null,
    created_at: task.updated_at,
    updated_at: task.updated_at,
    source_type: 'project',
    source_id: task.project_id,
    source_name: task.project_name,
    assigned_to_name: assigneeNamesOf(task),
    assigned_to_id: null,
    act_assigned_to_name: assigneeNamesOf(task),
    act_assigned_to_id: null,
    priority: null,
    project_task_id: task.id,
  };
}

/** Only tasks with a due date can be placed on a calendar. */
export function projectTaskToCalendarMeeting(task: AssignedProjectTask & { end_date: string }): CalendarMeeting {
  return {
    id: numericKeyOf(task.id),
    type: 'task',
    title: titleOf(task),
    body: null,
    activity_at: dueDateAsIso(task.end_date),
    all_day: true,
    duration_min: null,
    participants: null,
    meeting_location: null,
    created_by_name: null,
    created_by: '',
    status: task.status_category === 'done' ? 'closed' : 'open',
    close_comment: null,
    source_type: 'project',
    source_id: task.project_id,
    source_name: task.project_name,
    assigned_to_name: assigneeNamesOf(task),
    assigned_to_id: null,
    act_assigned_to_name: assigneeNamesOf(task),
    act_assigned_to_id: null,
    project_task_id: task.id,
  };
}

export function hasDueDate(task: AssignedProjectTask): task is AssignedProjectTask & { end_date: string } {
  return task.end_date !== null;
}
