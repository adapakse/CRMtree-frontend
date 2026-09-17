import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AbsenceReason = 'vacation' | 'sick_leave' | 'other';

export interface Absence {
  id: string;
  absent_user_id: string;
  substitute_user_id: string;
  absent_user_name: string | null;
  substitute_user_name: string | null;
  created_by: string;
  created_by_name: string | null;
  starts_on: string;
  ends_on: string;
  reason: AbsenceReason;
  note: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface CreateAbsencePayload {
  substitute_user_id: string;
  absent_user_id?: string;
  starts_on: string;
  ends_on: string;
  reason: AbsenceReason;
  note?: string | null;
}

export interface CrmUserOption {
  id: string;
  display_name: string;
  email: string;
  crm_role: string | null;
}

export interface CrmGroupOption {
  id: string;
  name: string;
  user_ids: string[];
}

const BASE = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class SubstitutionsService {
  private http = inject(HttpClient);

  list(): Observable<Absence[]> {
    return this.http.get<Absence[]>(`${BASE}/crm/substitutions`);
  }

  create(payload: CreateAbsencePayload): Observable<Absence> {
    return this.http.post<Absence>(`${BASE}/crm/substitutions`, payload);
  }

  /** Soft-cancel — existing DELETE, backend sets cancelled_at. */
  cancel(id: string): Observable<Absence> {
    return this.http.delete<Absence>(`${BASE}/crm/substitutions/${id}`);
  }

  crmUsers(): Observable<CrmUserOption[]> {
    return this.http.get<CrmUserOption[]>(`${BASE}/crm/leads/users`);
  }

  crmGroups(): Observable<CrmGroupOption[]> {
    return this.http.get<CrmGroupOption[]>(`${BASE}/crm/leads/groups`);
  }
}
