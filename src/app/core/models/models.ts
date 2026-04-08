// ── User ──────────────────────────────────────────────────
export interface UserRole {
  role_id: string;
  group_id: string;
  group_name: string;
  group_display: string;
  access_level: 'read' | 'full';
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  is_admin: boolean;
  is_active: boolean;
  crm_role?: 'salesperson' | 'sales_manager' | null;
  last_login_at?: string;
  created_at?: string;
  roles?: UserRole[];
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

// ── Group ─────────────────────────────────────────────────
export interface GroupProfile {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  has_owner_restriction: boolean;
  is_active: boolean;
  member_count?: number;
  document_count?: number;
  members?: GroupMember[];
}

export interface GroupMember {
  user_id: string;
  email: string;
  display_name: string;
  access_level: 'read' | 'full';
}

// ── Document ──────────────────────────────────────────────
export type DocStatus    = 'new'|'being_edited'|'being_signed'|'being_approved'|'signed'|'hold'|'completed'|'rejected';
export type DocType      = 'partner_agreement'|'it_supplier_agreement'|'employee_agreement'|'nda'|'operator_agreement';
export type GdprType     = 'data_processing_entrustment'|'data_administration'|'no_gdpr';
export type AccessLevel  = 'read' | 'full';

export interface DocumentTag {
  id: string;
  key: string;
  value: string;
  created_at?: string;
}

export interface DocumentVersion {
  id: string;
  version_number: number;
  label: string;
  is_signed: boolean;
  blob_size_bytes?: number;
  mime_type?: string;
  signatory_name?: string;
  signatory_email?: string;
  created_at: string;
}

// ── Active Task Info (for list views) ─────────────────────
export interface ActiveTaskInfo {
  id: string;
  task_type: TaskType;
  task_status: TaskStatus;
  assigned_to: string;
  assignee_name: string;
  assigner_name: string;
  due_date?: string;
  message?: string;
}

export interface Document {
  id: string;
  doc_number: string;
  name: string;
  doc_type: DocType;
  gdpr_type: GdprType;
  status: DocStatus;
  entities: string[];
  owner_id?: string;
  owner_name?: string;
  owner_email?: string;
  group_id?: string;
  group_name?: string;
  group_display?: string;
  has_owner_restriction?: boolean;
  document_group_id?: string;
  document_group_name?: string;
  creation_date?: string;
  signing_date?: string;
  expiration_date?: string;
  nip?: string;
  country?: string;
  contract_subject?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  blob_name?: string;
  blob_size_bytes?: number;
  signus_envelope_id?: string;
  tags?: DocumentTag[];
  versions?: DocumentVersion[];
  workflow_tasks?: WorkflowTask[];
  /** Count of active tasks (list view) */
  active_tasks?: number;
  /** Full active task details (list view) — includes assignee, assigner, due_date */
  active_task_details?: ActiveTaskInfo[];
  version_count?: number;
  created_at: string;
  updated_at: string;
  _access?: AccessLevel;
  /** True if user can see this doc only because of an active task (not group membership) */
  _task_access?: boolean;
}

export interface DocumentListResponse {
  data: Document[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface CreateDocumentPayload {
  name: string;
  doc_type: DocType;
  gdpr_type: GdprType;
  group_id: string;
  entities?: string[];
  owner_id?: string;
  document_group_id?: string;
  expiration_date?: string;
  signing_date?: string;
  nip?: string;
  country?: string;
  contract_subject?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  tags?: { key: string; value: string }[];
  file?: File;
}

export interface DocumentFilters {
  search?: string;
  status?: DocStatus;
  doc_type?: DocType;
  group_id?: string;
  gdpr_type?: GdprType;
  owner_id?: string;
  document_group_id?: string;
  expiry_before?: string;
  expiry_after?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

// ── Workflow ──────────────────────────────────────────────
export type TaskType   = 'read'|'edit'|'approve'|'sign';
export type TaskStatus = 'pending'|'in_progress'|'completed'|'cancelled';

export interface WorkflowTask {
  id: string;
  document_id: string;
  doc_number?: string;
  document_name?: string;
  document_status?: DocStatus;
  assigned_by?: string;
  assigner_name?: string;
  assigned_to: string;
  assignee_name?: string;
  assignee_email?: string;
  task_type: TaskType;
  task_status: TaskStatus;
  message?: string;
  due_date?: string;
  created_at: string;
  completed_at?: string;
  group_name?: string;
}

// ── Document Group ────────────────────────────────────────
export interface DocumentGroup {
  id: string;
  name: string;
  description?: string;
  document_count?: number;
  documents?: Pick<Document, 'id'|'doc_number'|'name'|'status'>[];
  created_at?: string;
}

// ── Audit ─────────────────────────────────────────────────
export interface AuditLog {
  id: string;
  user_id?: string;
  user_email?: string;
  user_name?: string;
  document_id?: string;
  document_number?: string;
  document_name?: string;
  action: string;
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}

export interface AuditLogFilters {
  date_from?: string;
  date_to?: string;
  user_id?: string;
  user_email?: string;
  document_id?: string;
  document_name?: string;
  action?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ── Signus ────────────────────────────────────────────────
export interface SigningSignatory {
  email: string;
  name?: string;
}

export interface SigningInitResponse {
  envelopeId: string;
  redirectUrl: string;
}
