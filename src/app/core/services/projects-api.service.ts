import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ListParams, PagedResult } from '../../shared/list/list-query';

export type ProjectRole = 'pm' | 'internal_participant' | 'external_participant' | 'controller';
export type ProjectAccessLevel = 'full' | 'read';
export type ProjectStatus = 'open' | 'closed';
export type ProjectStatusFilter = ProjectStatus | 'all';
export type TaskStatusCategory = 'todo' | 'in_progress' | 'done';
export type ProjectFieldType = 'text' | 'number' | 'list' | 'date' | 'money';
export type ProjectDictionary = 'statuses' | 'types' | 'priorities' | 'cost-categories';

/** What every tenant dictionary shares; cost categories are exactly this. */
export interface ProjectDictionaryEntry {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface ProjectDictionaryItem extends ProjectDictionaryEntry {
  color: string;
}

export type ProjectCostCategory = ProjectDictionaryEntry;

export interface ProjectFinanceMargin {
  amount: number | null;
  percent: number | null;
}

/** Headline figures of one project, as shown on the project list and on lead / partner cards. */
export interface ProjectFinanceTotals {
  currency: string;
  revenue: { planned: number | null; actual: number };
  cost: { planned: number; actual: number };
  margin: { planned: ProjectFinanceMargin; actual: ProjectFinanceMargin };
}

/** What the signed-in user may do with the finance of one project. */
export interface ProjectFinanceAccess {
  currency: string;
  can_read: boolean;
  can_write: boolean;
  can_add_own_costs: boolean;
}

export interface ProjectTaskStatus extends ProjectDictionaryItem {
  category: TaskStatusCategory;
}

export interface ProjectStatusTransition {
  role: Exclude<ProjectRole, 'pm'>;
  from_status_id: string;
  to_status_id: string;
}

export interface ProjectFieldDefinition {
  id: string;
  name: string;
  field_type: ProjectFieldType;
  options: string[];
  sort_order: number;
  is_active: boolean;
}

export interface ProjectConfig {
  statuses: ProjectTaskStatus[];
  types: ProjectDictionaryItem[];
  priorities: ProjectDictionaryItem[];
  transitions: ProjectStatusTransition[];
  field_definitions: ProjectFieldDefinition[];
  finance_enabled: boolean;
  /** Empty while project finance is switched off. */
  cost_categories: ProjectCostCategory[];
  /** A to-do task ending within this many days (today included) is "at risk". */
  at_risk_threshold_days: number;
  /** True for a tenant admin and for anyone who is PM or controller of an open project. */
  has_cross_project_view: boolean;
}

export type TaskTimeliness = 'overdue' | 'at_risk' | 'on_time';

/** Deadline facts the server computes for every task, wherever a task is listed. */
export interface TaskDeadlineInfo {
  /** The end date the task was first given; null while it never had one. */
  original_end_date: string | null;
  completed_at: string | null;
  /** End date minus original end date in days; null when equal or a date is missing, negative when pulled in. */
  slip_days: number | null;
  /** Null for a done task and for a task without an end date. */
  timeliness: TaskTimeliness | null;
  days_overdue: number | null;
  is_completed_late: boolean;
  has_overdue_subtasks: boolean;
}

export type ProjectDelayReason = 'task_after_end' | 'end_passed';

export interface ProjectDelayDetails {
  open_task_count: number;
  tasks_after_end_count: number;
  latest_task_end_date: string | null;
  days_after_end: number | null;
  days_past_end: number | null;
}

/** Planned dates of a project and whether it runs late; a closed or undated project is never delayed. */
export interface ProjectSchedule {
  start_date: string | null;
  end_date: string | null;
  is_delayed: boolean;
  delay_reasons: ProjectDelayReason[];
  delay_details: ProjectDelayDetails;
}

export interface Project extends ProjectSchedule {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  partner_id: string | null;
  partner_name: string | null;
  lead_id: number | null;
  lead_name: string | null;
  created_at: string;
  closed_at: string | null;
}

export type ProjectReminderType = 'at_due' | '1d_before' | '2d_before' | '3d_before' | 'custom';

/** A task as shown outside its project: on a lead / partner card or in "my tasks". */
export interface ProjectTaskSummary extends TaskDeadlineInfo {
  id: string;
  task_number: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  parent_task_id: string | null;
  status_id: string;
  status_name: string;
  status_color: string;
  status_category: TaskStatusCategory;
  priority_name: string | null;
  priority_color: string | null;
  assignees: ProjectTaskAssignee[];
}

export interface AssignedProjectTask extends ProjectTaskSummary {
  project_id: string;
  project_key: string;
  project_name: string;
  reminder_type: ProjectReminderType | null;
  reminder_at: string | null;
  updated_at: string;
}

export interface LinkedProject extends ProjectSchedule {
  id: string;
  key: string;
  name: string;
  status: ProjectStatus;
  created_at: string;
  closed_at: string | null;
  /** False for a viewer who is not a project member: they see the tasks but cannot enter the project. */
  can_open: boolean;
  tasks: ProjectTaskSummary[];
  /** Shown to everyone who sees the card, member or not; null while finance is switched off. */
  finance: ProjectFinanceTotals | null;
}

export interface ProjectListItem extends Project {
  my_role: ProjectRole | null;
  my_access_level: ProjectAccessLevel | null;
  member_count: number;
  task_count: number;
  done_task_count: number;
  /** Share of done tasks, 0–100, as the server counts it (its progress filter and sort use the same number). */
  progress_percent: number;
  overdue_task_count: number;
  at_risk_task_count: number;
  my_open_task_count: number;
  project_managers: ProjectTaskAssignee[];
  /** Null unless the viewer is tenant admin, PM or controller of the project. */
  finance: ProjectFinanceTotals | null;
}

/** A page of projects; `can_filter_finance` tells whether the viewer may filter and sort by cost and revenue. */
export interface ProjectPage extends PagedResult<ProjectListItem> {
  can_filter_finance: boolean;
}

export interface ProjectListPage extends ProjectPage {
  can_create: boolean;
}

/** A project of the cross-project scope, as offered in the project filter and drawn on the timeline. */
export interface PortfolioProjectOption {
  id: string;
  key: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
}

/** Lookup lists are not paged; past the limit the server cuts them and says so. */
export interface PortfolioProjectOptions {
  projects: PortfolioProjectOption[];
  truncated: boolean;
  limit: number;
}

export interface PortfolioPeople {
  people: ProjectTaskAssignee[];
  truncated: boolean;
  limit: number;
}

export interface ProjectPayload {
  name?: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

export interface ProjectMember {
  user_id: string;
  role: ProjectRole;
  access_level: ProjectAccessLevel;
  display_name: string;
  email: string;
  phone: string | null;
  company: string | null;
  department: string | null;
  is_external: boolean;
  is_active: boolean;
}

export interface ProjectField {
  field_definition_id: string;
  is_required: boolean;
  sort_order: number;
  name: string;
  field_type: ProjectFieldType;
  options: string[];
  is_active: boolean;
}

export interface ProjectDetail {
  project: Project;
  members: ProjectMember[];
  fields: ProjectField[];
  my_role: ProjectRole | null;
  my_access_level: ProjectAccessLevel | null;
  can_manage: boolean;
  /** Null when finance is switched off or the viewer has no finance rights in this project. */
  finance: ProjectFinanceAccess | null;
}

export interface ProjectMemberCandidate {
  id: string;
  display_name: string;
  email: string;
  company: string | null;
  department: string | null;
  is_external: boolean;
}

export interface MoneyValue {
  amount: number;
  currency: string;
}

export type ProjectCustomValue = string | number | MoneyValue | null;

export interface ProjectTaskAssignee {
  user_id: string;
  display_name: string;
}

export interface ProjectTask extends TaskDeadlineInfo {
  id: string;
  project_id: string;
  task_number: number;
  name: string;
  description: string | null;
  type_id: string | null;
  status_id: string;
  priority_id: string | null;
  start_date: string | null;
  end_date: string | null;
  parent_task_id: string | null;
  custom_values: Record<string, ProjectCustomValue>;
  assignees: ProjectTaskAssignee[];
  reminder_type: ProjectReminderType | null;
  reminder_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A task as the filtered lists and timelines return it: flat, with its project,
 * parent and dictionary labels resolved, without the description and custom values.
 */
export interface ProjectTaskRow extends TaskDeadlineInfo {
  id: string;
  project_id: string;
  project_key: string;
  project_name: string;
  task_number: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  parent_task_id: string | null;
  parent_task_number: number | null;
  parent_task_name: string | null;
  status_id: string;
  status_name: string;
  status_category: TaskStatusCategory;
  status_color: string;
  priority_id: string | null;
  priority_name: string | null;
  priority_color: string | null;
  type_id: string | null;
  type_name: string | null;
  type_color: string | null;
  /** The task's own cost items in the project's currency; null unless the viewer may read that project's finance. */
  cost_total: number | null;
  cost_currency: string | null;
  assignees: ProjectTaskAssignee[];
}

/** A timeline is not paged; past the limit the server cuts the list and says so. */
export interface ProjectGanttResult {
  items: ProjectTaskRow[];
  truncated: boolean;
  limit: number;
}

export interface TaskCountsByDeadline {
  open_task_count: number;
  overdue_task_count: number;
  at_risk_task_count: number;
}

export interface AssigneeTaskCounts extends TaskCountsByDeadline {
  user_id: string;
  display_name: string;
}

export interface ProjectAssigneeSummary {
  people: AssigneeTaskCounts[];
  unassigned: TaskCountsByDeadline;
}

export interface ProjectTaskPermissions {
  can_edit_content: boolean;
  can_edit_structure: boolean;
  allowed_status_ids: string[];
}

export interface ProjectTaskDetail extends ProjectTask {
  permissions: ProjectTaskPermissions;
}

export interface ProjectTaskPayload {
  name?: string;
  description?: string | null;
  type_id?: string | null;
  status_id?: string;
  priority_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  parent_task_id?: string | null;
  assignee_ids?: string[];
  custom_values?: Record<string, ProjectCustomValue>;
  reminder_type?: ProjectReminderType | null;
  reminder_at?: string | null;
  /** Stored by the server only when the end date really changes. */
  end_date_change_reason?: string | null;
}

export interface ProjectTaskHistoryEntry {
  id: string;
  user_name: string | null;
  action: 'project_task_created' | 'project_task_updated';
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  end_date_change_reason: string | null;
  created_at: string;
}

export interface ProjectMessage {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  author_name: string | null;
}

@Injectable({ providedIn: 'root' })
export class ProjectsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/projects`;
  private readonly adminBase = `${environment.apiUrl}/admin/project-config`;

  getConfig(): Observable<ProjectConfig> {
    return this.http.get<ProjectConfig>(`${this.base}/config`);
  }

  listProjects(params: ListParams): Observable<ProjectListPage> {
    return this.http.get<ProjectListPage>(this.base, { params });
  }

  createProject(payload: ProjectPayload & { name: string }): Observable<Project> {
    return this.http.post<Project>(this.base, payload);
  }

  getProject(projectId: string): Observable<ProjectDetail> {
    return this.http.get<ProjectDetail>(`${this.base}/${projectId}`);
  }

  updateProject(projectId: string, payload: ProjectPayload): Observable<Project> {
    return this.http.patch<Project>(`${this.base}/${projectId}`, payload);
  }

  closeProject(projectId: string): Observable<Project> {
    return this.http.post<Project>(`${this.base}/${projectId}/close`, {});
  }

  reopenProject(projectId: string): Observable<Project> {
    return this.http.post<Project>(`${this.base}/${projectId}/reopen`, {});
  }

  listMemberCandidates(projectId: string, search: string): Observable<ProjectMemberCandidate[]> {
    return this.http.get<ProjectMemberCandidate[]>(`${this.base}/${projectId}/member-candidates`, { params: { search } });
  }

  addMember(projectId: string, payload: { user_id: string; role: ProjectRole; access_level: ProjectAccessLevel }): Observable<ProjectMember[]> {
    return this.http.post<ProjectMember[]>(`${this.base}/${projectId}/members`, payload);
  }

  updateMember(projectId: string, userId: string, payload: { role?: ProjectRole; access_level?: ProjectAccessLevel }): Observable<ProjectMember[]> {
    return this.http.patch<ProjectMember[]>(`${this.base}/${projectId}/members/${userId}`, payload);
  }

  removeMember(projectId: string, userId: string): Observable<ProjectMember[]> {
    return this.http.delete<ProjectMember[]>(`${this.base}/${projectId}/members/${userId}`);
  }

  replaceProjectFields(projectId: string, fields: { field_definition_id: string; is_required: boolean }[]): Observable<ProjectField[]> {
    return this.http.put<ProjectField[]>(`${this.base}/${projectId}/fields`, { fields });
  }

  listTasks(projectId: string, onlyMine: boolean): Observable<ProjectTask[]> {
    return this.http.get<ProjectTask[]>(`${this.base}/${projectId}/tasks`, { params: { mine: onlyMine } });
  }

  /** The filtered, sorted and paged flat list of a project's tasks. */
  searchTasks(projectId: string, params: ListParams): Observable<PagedResult<ProjectTaskRow>> {
    return this.http.get<PagedResult<ProjectTaskRow>>(`${this.base}/${projectId}/tasks/search`, { params });
  }

  getProjectGantt(projectId: string, params: ListParams): Observable<ProjectGanttResult> {
    return this.http.get<ProjectGanttResult>(`${this.base}/${projectId}/tasks/gantt`, { params });
  }

  /** Only PM, tenant admin and controller may ask; everyone else gets 403. */
  getAssigneeSummary(projectId: string): Observable<ProjectAssigneeSummary> {
    return this.http.get<ProjectAssigneeSummary>(`${this.base}/${projectId}/tasks/assignee-summary`);
  }

  /** Tasks of open projects assigned to the signed-in user. */
  listMyTasks(params: ListParams): Observable<PagedResult<ProjectTaskRow>> {
    return this.http.get<PagedResult<ProjectTaskRow>>(`${this.base}/my-tasks`, { params });
  }

  /** Cross-project view: open projects the caller is PM or controller of (all of them for a tenant admin). */
  listPortfolioProjects(params: ListParams): Observable<ProjectPage> {
    return this.http.get<ProjectPage>(`${this.base}/portfolio/projects`, { params });
  }

  /** Every project of the caller's cross-project scope: the project filter and the timeline's end-date lines. */
  listPortfolioProjectOptions(): Observable<PortfolioProjectOptions> {
    return this.http.get<PortfolioProjectOptions>(`${this.base}/portfolio/project-options`);
  }

  /** Everyone who is a member of, or assigned to a task in, a project of the caller's cross-project scope. */
  listPortfolioPeople(): Observable<PortfolioPeople> {
    return this.http.get<PortfolioPeople>(`${this.base}/portfolio/people`);
  }

  listPortfolioTasks(params: ListParams): Observable<PagedResult<ProjectTaskRow>> {
    return this.http.get<PagedResult<ProjectTaskRow>>(`${this.base}/portfolio/tasks`, { params });
  }

  getPortfolioGantt(params: ListParams): Observable<ProjectGanttResult> {
    return this.http.get<ProjectGanttResult>(`${this.base}/portfolio/gantt`, { params });
  }

  getTask(projectId: string, taskId: string): Observable<ProjectTaskDetail> {
    return this.http.get<ProjectTaskDetail>(`${this.base}/${projectId}/tasks/${taskId}`);
  }

  createTask(projectId: string, payload: ProjectTaskPayload): Observable<ProjectTask> {
    return this.http.post<ProjectTask>(`${this.base}/${projectId}/tasks`, payload);
  }

  updateTask(projectId: string, taskId: string, payload: ProjectTaskPayload): Observable<ProjectTaskDetail> {
    return this.http.patch<ProjectTaskDetail>(`${this.base}/${projectId}/tasks/${taskId}`, payload);
  }

  listTaskHistory(projectId: string, taskId: string): Observable<ProjectTaskHistoryEntry[]> {
    return this.http.get<ProjectTaskHistoryEntry[]>(`${this.base}/${projectId}/tasks/${taskId}/history`);
  }

  /** Links the project to one lead or one partner; an empty payload removes the link. */
  setCrmLink(projectId: string, link: { lead_id?: number; partner_ref?: string }): Observable<unknown> {
    return this.http.put(`${this.base}/${projectId}/crm-link`, link);
  }

  /** Open project tasks assigned to the given people (default: the signed-in user). */
  listAssignedTasks(options: { assignedTo?: string; includeDone?: boolean } = {}): Observable<AssignedProjectTask[]> {
    const params: Record<string, string> = {};
    if (options.assignedTo) params['assigned_to'] = options.assignedTo;
    if (options.includeDone) params['include_done'] = 'true';
    return this.http.get<AssignedProjectTask[]>(`${this.base}/assigned-tasks`, { params });
  }

  listLeadProjects(leadId: number | string): Observable<LinkedProject[]> {
    return this.http.get<LinkedProject[]>(`${environment.apiUrl}/crm/leads/${leadId}/projects`);
  }

  listPartnerProjects(partnerId: number | string): Observable<LinkedProject[]> {
    return this.http.get<LinkedProject[]>(`${environment.apiUrl}/crm/partners/${partnerId}/projects`);
  }

  /** taskId = null addresses the general project thread. */
  listMessages(projectId: string, taskId: string | null): Observable<ProjectMessage[]> {
    return this.http.get<ProjectMessage[]>(this.messagesUrl(projectId, taskId));
  }

  postMessage(projectId: string, taskId: string | null, body: string): Observable<ProjectMessage> {
    return this.http.post<ProjectMessage>(this.messagesUrl(projectId, taskId), { body });
  }

  private messagesUrl(projectId: string, taskId: string | null): string {
    return taskId === null
      ? `${this.base}/${projectId}/messages`
      : `${this.base}/${projectId}/tasks/${taskId}/messages`;
  }

  createDictionaryItem(dictionary: ProjectDictionary, payload: { name: string; color?: string; category?: TaskStatusCategory }): Observable<ProjectConfig> {
    return this.http.post<ProjectConfig>(`${this.adminBase}/dictionaries/${dictionary}`, payload);
  }

  updateDictionaryItem(
    dictionary: ProjectDictionary,
    itemId: string,
    payload: { name?: string; color?: string; category?: TaskStatusCategory; is_active?: boolean },
  ): Observable<ProjectConfig> {
    return this.http.patch<ProjectConfig>(`${this.adminBase}/dictionaries/${dictionary}/${itemId}`, payload);
  }

  reorderDictionary(dictionary: ProjectDictionary, ids: string[]): Observable<ProjectConfig> {
    return this.http.put<ProjectConfig>(`${this.adminBase}/dictionaries/${dictionary}/order`, { ids });
  }

  setFinanceEnabled(isEnabled: boolean): Observable<ProjectConfig> {
    return this.http.put<ProjectConfig>(`${this.adminBase}/finance`, { is_enabled: isEnabled });
  }

  setAtRiskThreshold(days: number): Observable<ProjectConfig> {
    return this.http.put<ProjectConfig>(`${this.adminBase}/deadlines`, { at_risk_threshold_days: days });
  }

  /** The signed-in user's own switch for e-mails about project deadlines. */
  setDeadlineNotificationsEnabled(isEnabled: boolean): Observable<{ project_deadline_notifications_enabled: boolean }> {
    return this.http.put<{ project_deadline_notifications_enabled: boolean }>(
      `${environment.apiUrl}/profile/project-deadline-notifications`, { is_enabled: isEnabled },
    );
  }

  replaceRoleTransitions(
    role: Exclude<ProjectRole, 'pm'>,
    transitions: { from_status_id: string; to_status_id: string }[],
  ): Observable<ProjectConfig> {
    return this.http.put<ProjectConfig>(`${this.adminBase}/transitions/${role}`, { transitions });
  }

  createFieldDefinition(payload: { name: string; field_type: ProjectFieldType; options?: string[] }): Observable<ProjectConfig> {
    return this.http.post<ProjectConfig>(`${this.adminBase}/fields`, payload);
  }

  updateFieldDefinition(fieldId: string, payload: { name?: string; options?: string[]; is_active?: boolean }): Observable<ProjectConfig> {
    return this.http.patch<ProjectConfig>(`${this.adminBase}/fields/${fieldId}`, payload);
  }
}
