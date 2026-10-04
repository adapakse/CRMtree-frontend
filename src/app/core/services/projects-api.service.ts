import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ProjectRole = 'pm' | 'internal_participant' | 'external_participant' | 'controller';
export type ProjectAccessLevel = 'full' | 'read';
export type ProjectStatus = 'open' | 'closed';
export type ProjectStatusFilter = ProjectStatus | 'all';
export type TaskStatusCategory = 'todo' | 'in_progress' | 'done';
export type ProjectFieldType = 'text' | 'number' | 'list' | 'date' | 'money';
export type ProjectDictionary = 'statuses' | 'types' | 'priorities';

export interface ProjectDictionaryItem {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_active: boolean;
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
}

export interface Project {
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
export interface ProjectTaskSummary {
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

export interface LinkedProject {
  id: string;
  key: string;
  name: string;
  status: ProjectStatus;
  created_at: string;
  closed_at: string | null;
  /** False for a viewer who is not a project member: they see the tasks but cannot enter the project. */
  can_open: boolean;
  tasks: ProjectTaskSummary[];
}

export interface ProjectListItem extends Project {
  my_role: ProjectRole | null;
  my_access_level: ProjectAccessLevel | null;
  member_count: number;
  task_count: number;
  my_open_task_count: number;
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

export interface ProjectTask {
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
}

export interface ProjectTaskHistoryEntry {
  id: string;
  user_name: string | null;
  action: 'project_task_created' | 'project_task_updated';
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
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

  listProjects(status: ProjectStatusFilter): Observable<{ projects: ProjectListItem[]; can_create: boolean }> {
    return this.http.get<{ projects: ProjectListItem[]; can_create: boolean }>(this.base, { params: { status } });
  }

  createProject(payload: { name: string; description: string | null }): Observable<Project> {
    return this.http.post<Project>(this.base, payload);
  }

  getProject(projectId: string): Observable<ProjectDetail> {
    return this.http.get<ProjectDetail>(`${this.base}/${projectId}`);
  }

  updateProject(projectId: string, payload: { name?: string; description?: string | null }): Observable<Project> {
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

  createDictionaryItem(dictionary: ProjectDictionary, payload: { name: string; color: string; category?: TaskStatusCategory }): Observable<ProjectConfig> {
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
