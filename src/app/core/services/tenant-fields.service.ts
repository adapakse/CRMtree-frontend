import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/** The three forms a tenant admin can add custom fields to. */
export type TenantFieldEntity = 'lead' | 'partner' | 'document';

/** Same set as the Projects module's custom fields — deliberately not a superset. */
export type TenantFieldType = 'text' | 'number' | 'list' | 'date' | 'money';

export interface TenantFieldDefinition {
  id: string;
  entity: TenantFieldEntity;
  name: string;
  field_type: TenantFieldType;
  /** Allowed values of a `list` field; empty for every other type. */
  options: string[];
  sort_order: number;
  is_active: boolean;
}

/** A definition together with the value held by one record. */
export interface TenantFieldValue extends TenantFieldDefinition {
  value: string | number | { amount: number; currency: string } | null;
}

export type TenantFieldDefinitions = Record<TenantFieldEntity, TenantFieldDefinition[]>;

export interface TenantFieldsResponse {
  definitions: TenantFieldDefinitions;
  entities: TenantFieldEntity[];
  field_types: TenantFieldType[];
}

const BASE = `${environment.apiUrl}/admin/field-definitions`;

/**
 * Tenant-admin custom fields for the lead, partner and document forms.
 *
 * Every mutation answers with the full, fresh set of definitions, so the
 * settings screen never has to refetch — the same contract the Projects module
 * uses for its own field definitions.
 */
@Injectable({ providedIn: 'root' })
export class TenantFieldsService {
  private http = inject(HttpClient);

  get() {
    return this.http.get<TenantFieldsResponse>(BASE);
  }

  create(payload: {
    entity: TenantFieldEntity;
    name: string;
    field_type: TenantFieldType;
    options?: string[];
  }) {
    return this.http.post<{ definitions: TenantFieldDefinitions }>(BASE, payload);
  }

  /** `field_type` is absent on purpose — it is immutable once values exist. */
  update(id: string, changes: { name?: string; options?: string[]; is_active?: boolean }) {
    return this.http.patch<{ definitions: TenantFieldDefinitions }>(`${BASE}/${id}`, changes);
  }

  reorder(entity: TenantFieldEntity, ids: string[]) {
    return this.http.put<{ definitions: TenantFieldDefinitions }>(`${BASE}/${entity}/order`, { ids });
  }
}
