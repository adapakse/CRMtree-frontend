import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProjectFinanceMargin } from './projects-api.service';

export type ProjectCostStatus = 'planned' | 'incurred';
export type ProjectRevenueStatus = 'planned' | 'invoiced' | 'paid';

export interface ProjectFinanceCategoryRow {
  category_id: string;
  name: string;
  is_active: boolean;
  budget: number;
  incurred: number;
  planned: number;
  variance: number;
  is_over_budget: boolean;
}

export interface ProjectFinanceTaskRow {
  task_id: string;
  task_number: number;
  name: string;
  parent_task_id: string | null;
  planned_cost: number | null;
  own_incurred: number;
  own_planned: number;
  /** Own items plus those of every descendant task. */
  total_incurred: number;
  total_planned: number;
}

export interface ProjectFinanceSummary {
  currency: string;
  /** True once the project has any cost or revenue item; the currency can no longer change. */
  is_currency_locked: boolean;
  participants_can_add_costs: boolean;
  revenue: { planned: number | null; actual: number; by_status: Record<ProjectRevenueStatus, number> };
  /** Value of the linked won lead in project currency, offered only while planned revenue is empty. */
  suggested_planned_revenue: number | null;
  cost: { planned: number; actual: number; planned_items: number; task_planned_total: number };
  margin: { planned: ProjectFinanceMargin; actual: ProjectFinanceMargin };
  remaining_budget: number;
  categories: ProjectFinanceCategoryRow[];
  tasks: ProjectFinanceTaskRow[];
}

export interface ProjectCategoryBudget {
  category_id: string;
  planned_cost: number;
}

export interface ProjectFinancePlanPayload {
  currency?: string;
  planned_revenue?: number | null;
  participants_can_add_costs?: boolean;
  /** Replaces the whole list. */
  category_budgets?: ProjectCategoryBudget[];
}

export interface ProjectCostItem {
  id: string;
  project_id: string;
  date: string;
  amount: number;
  category_id: string;
  category_name: string;
  description: string | null;
  task_id: string | null;
  task_number: number | null;
  task_name: string | null;
  supplier_name: string | null;
  document_number: string | null;
  status: ProjectCostStatus;
  original_amount: number | null;
  original_currency: string | null;
  exchange_rate: number | null;
  exchange_rate_date: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectCostItemPayload {
  date?: string;
  category_id?: string;
  /** In project currency; when given it wins over the original amount. */
  amount?: number | null;
  original_amount?: number | null;
  original_currency?: string | null;
  task_id?: string | null;
  status?: ProjectCostStatus;
  description?: string | null;
  supplier_name?: string | null;
  document_number?: string | null;
}

export interface ProjectRevenueItem {
  id: string;
  project_id: string;
  date: string;
  amount: number;
  description: string | null;
  status: ProjectRevenueStatus;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRevenueItemPayload {
  date?: string;
  amount?: number;
  status?: ProjectRevenueStatus;
  description?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ProjectFinanceApiService {
  private readonly http = inject(HttpClient);

  getSummary(projectId: string): Observable<ProjectFinanceSummary> {
    return this.http.get<ProjectFinanceSummary>(this.url(projectId));
  }

  updatePlan(projectId: string, payload: ProjectFinancePlanPayload): Observable<ProjectFinanceSummary> {
    return this.http.patch<ProjectFinanceSummary>(this.url(projectId), payload);
  }

  setTaskPlannedCost(projectId: string, taskId: string, plannedCost: number | null): Observable<{ task_id: string; planned_cost: number | null }> {
    return this.http.put<{ task_id: string; planned_cost: number | null }>(
      this.url(projectId, `/tasks/${taskId}/planned-cost`), { planned_cost: plannedCost },
    );
  }

  /** A participant without read rights receives only the items they created. */
  listCosts(projectId: string, taskId?: string): Observable<ProjectCostItem[]> {
    const params: Record<string, string> = {};
    if (taskId) params['task_id'] = taskId;
    return this.http.get<ProjectCostItem[]>(this.url(projectId, '/costs'), { params });
  }

  createCost(projectId: string, payload: ProjectCostItemPayload): Observable<ProjectCostItem> {
    return this.http.post<ProjectCostItem>(this.url(projectId, '/costs'), payload);
  }

  updateCost(projectId: string, itemId: string, payload: ProjectCostItemPayload): Observable<ProjectCostItem> {
    return this.http.patch<ProjectCostItem>(this.url(projectId, `/costs/${itemId}`), payload);
  }

  deleteCost(projectId: string, itemId: string): Observable<void> {
    return this.http.delete<void>(this.url(projectId, `/costs/${itemId}`));
  }

  listRevenues(projectId: string): Observable<ProjectRevenueItem[]> {
    return this.http.get<ProjectRevenueItem[]>(this.url(projectId, '/revenues'));
  }

  createRevenue(projectId: string, payload: ProjectRevenueItemPayload): Observable<ProjectRevenueItem> {
    return this.http.post<ProjectRevenueItem>(this.url(projectId, '/revenues'), payload);
  }

  updateRevenue(projectId: string, itemId: string, payload: ProjectRevenueItemPayload): Observable<ProjectRevenueItem> {
    return this.http.patch<ProjectRevenueItem>(this.url(projectId, `/revenues/${itemId}`), payload);
  }

  deleteRevenue(projectId: string, itemId: string): Observable<void> {
    return this.http.delete<void>(this.url(projectId, `/revenues/${itemId}`));
  }

  private url(projectId: string, suffix = ''): string {
    return `${environment.apiUrl}/projects/${projectId}/finance${suffix}`;
  }
}
