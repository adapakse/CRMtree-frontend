import type { ActivityTask, CalendarMeeting } from './crm-api.service';
import type { AssignedProjectTask } from './projects-api.service';

// The hour of a project task is optional. Without one, the task is placed in
// the CRM calendar grid and task lists at this local hour and flagged
// `all_day`, so views can show "termin" instead of a clock time.
const ALL_DAY_ANCHOR_TIME = '09:00';

function dueMomentAsIso(task: { end_date: string; end_time: string | null }): string {
  return new Date(`${task.end_date}T${task.end_time ?? ALL_DAY_ANCHOR_TIME}:00`).toISOString();
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
    activity_at: hasDueDate(task) ? dueMomentAsIso(task) : null,
    all_day: !task.end_time,
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
    attachment_count: task.attachment_count,
  };
}

/** Only tasks with a due date can be placed on a calendar. */
export function projectTaskToCalendarMeeting(task: AssignedProjectTask & { end_date: string }): CalendarMeeting {
  return {
    id: numericKeyOf(task.id),
    type: 'task',
    title: titleOf(task),
    body: null,
    activity_at: dueMomentAsIso(task),
    all_day: !task.end_time,
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
