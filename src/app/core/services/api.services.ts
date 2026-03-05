import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  GroupProfile, User, UserRole, WorkflowTask,
  AuditLog, AuditLogFilters, DocumentGroup,
  PaginatedResponse
} from '../models/models';

// ── Groups ────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class GroupService {
  private base = `${environment.apiUrl}/groups`;
  constructor(private http: HttpClient) {}

  list(includeInactive = false): Observable<GroupProfile[]> {
    const params = includeInactive ? new HttpParams().set('include_inactive', 'true') : new HttpParams();
    return this.http.get<GroupProfile[]>(this.base, { params });
  }

  get(id: string): Observable<GroupProfile> {
    return this.http.get<GroupProfile>(`${this.base}/${id}`);
  }

  create(data: Partial<GroupProfile>): Observable<GroupProfile> {
    return this.http.post<GroupProfile>(this.base, data);
  }

  update(id: string, data: Partial<GroupProfile>): Observable<GroupProfile> {
    return this.http.patch<GroupProfile>(`${this.base}/${id}`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}

// ── Users (Admin) ─────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class UserService {
  private base = `${environment.apiUrl}/admin/users`;
  constructor(private http: HttpClient) {}

  list(params: Record<string, string | number> = {}): Observable<PaginatedResponse<User>> {
    let httpParams = new HttpParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) httpParams = httpParams.set(k, String(v)); });
    return this.http.get<PaginatedResponse<User>>(this.base, { params: httpParams });
  }

  get(id: string): Observable<User> {
    return this.http.get<User>(`${this.base}/${id}`);
  }

  search(query: string): Observable<User[]> {
    return this.http.get<any>(`${this.base}?search=${encodeURIComponent(query)}&limit=10`).pipe(
      map((res: any) => res.data ?? [])
    );
  }

  create(data: { first_name: string; last_name: string; email: string; is_active: boolean; is_admin: boolean }): Observable<User> {
    return this.http.post<User>(this.base, data);
  }

  update(id: string, data: Partial<User>): Observable<User> {
    return this.http.patch<User>(`${this.base}/${id}`, data);
  }

  assignRole(userId: string, groupId: string, accessLevel: 'read' | 'full'): Observable<UserRole> {
    return this.http.post<UserRole>(`${this.base}/${userId}/roles`, { group_id: groupId, access_level: accessLevel });
  }

  removeRole(userId: string, roleId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${userId}/roles/${roleId}`);
  }
}

// ── Workflow ──────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class WorkflowService {
  private base = `${environment.apiUrl}`;
  constructor(private http: HttpClient) {}

  getTasks(docId: string): Observable<WorkflowTask[]> {
    return this.http.get<WorkflowTask[]>(`${this.base}/documents/${docId}/workflow`);
  }

  assignTask(docId: string, data: { assigned_to: string; task_type: string; message?: string; due_date?: string }): Observable<WorkflowTask> {
    return this.http.post<WorkflowTask>(`${this.base}/documents/${docId}/workflow`, data);
  }

  updateTask(docId: string, taskId: string, data: Partial<WorkflowTask>): Observable<WorkflowTask> {
    return this.http.patch<WorkflowTask>(`${this.base}/documents/${docId}/workflow/${taskId}`, data);
  }

  cancelTask(docId: string, taskId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/documents/${docId}/workflow/${taskId}`);
  }

  getMyTasks(): Observable<WorkflowTask[]> {
    return this.http.get<WorkflowTask[]>(`${this.base}/workflow/my-tasks`);
  }

  getAllTasks(): Observable<WorkflowTask[]> {
    return this.http.get<WorkflowTask[]>(`${this.base}/workflow/all-tasks`);
  }
}

// ── Document Groups ───────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class DocumentGroupService {
  private base = `${environment.apiUrl}/document-groups`;
  constructor(private http: HttpClient) {}

  list(): Observable<DocumentGroup[]> {
    return this.http.get<DocumentGroup[]>(this.base);
  }

  get(id: string): Observable<DocumentGroup> {
    return this.http.get<DocumentGroup>(`${this.base}/${id}`);
  }

  create(data: Partial<DocumentGroup>): Observable<DocumentGroup> {
    return this.http.post<DocumentGroup>(this.base, data);
  }

  update(id: string, data: Partial<DocumentGroup>): Observable<DocumentGroup> {
    return this.http.patch<DocumentGroup>(`${this.base}/${id}`, data);
  }

  addDocument(groupId: string, documentId: string): Observable<void> {
    return this.http.post<void>(`${this.base}/${groupId}/documents`, { document_id: documentId });
  }

  removeDocument(groupId: string, documentId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${groupId}/documents/${documentId}`);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}

// ── Audit Logs ────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class AuditService {
  private base = `${environment.apiUrl}/admin/logs`;
  constructor(private http: HttpClient) {}

  list(filters: AuditLogFilters = {}): Observable<PaginatedResponse<AuditLog>> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    });
    return this.http.get<PaginatedResponse<AuditLog>>(this.base, { params });
  }

  getActions(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/actions`);
  }
}
