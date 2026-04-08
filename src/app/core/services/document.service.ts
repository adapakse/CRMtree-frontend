import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import {
  Document, DocumentListResponse, DocumentFilters,
  CreateDocumentPayload, DocumentTag, DocumentVersion,
  SigningInitResponse, SigningSignatory
} from '../models/models';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly base = `${environment.apiUrl}/documents`;

  constructor(private http: HttpClient) {}

  // ── List ───────────────────────────────────────────────
  list(filters: DocumentFilters = {}): Observable<DocumentListResponse> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params = params.set(k, String(v));
      }
    });
    return this.http.get<DocumentListResponse>(this.base, { params });
  }

  // ── Get by id ──────────────────────────────────────────
  get(id: string): Observable<Document> {
    return this.http.get<Document>(`${this.base}/${id}`);
  }

  // ── Create (multipart — includes file) ────────────────
  create(payload: CreateDocumentPayload): Observable<Document> {
    const fd = new FormData();
    fd.append('name', payload.name);
    fd.append('doc_type', payload.doc_type);
    fd.append('gdpr_type', payload.gdpr_type);
    fd.append('group_id', payload.group_id);
    if (payload.owner_id)          fd.append('owner_id', payload.owner_id);
    if (payload.document_group_id) fd.append('document_group_id', payload.document_group_id);
    if (payload.expiration_date)   fd.append('expiration_date', payload.expiration_date);
    if (payload.signing_date)      fd.append('signing_date', payload.signing_date);
    if (payload.nip)               fd.append('nip', payload.nip);
    if (payload.country)           fd.append('country', payload.country);
    if (payload.contract_subject)  fd.append('contract_subject', payload.contract_subject);
    if (payload.contact_name)      fd.append('contact_name', payload.contact_name);
    if (payload.contact_email)     fd.append('contact_email', payload.contact_email);
    if (payload.contact_phone)     fd.append('contact_phone', payload.contact_phone);
    (payload.entities ?? []).forEach(e => fd.append('entities[]', e));
    (payload.tags ?? []).forEach((t, i) => {
      fd.append(`tags[${i}][key]`, t.key);
      fd.append(`tags[${i}][value]`, t.value);
    });
    if (payload.file) fd.append('file', payload.file);
    return this.http.post<Document>(this.base, fd);
  }

  // ── Update metadata ────────────────────────────────────
  update(id: string, data: Partial<Document>): Observable<Document> {
    return this.http.patch<Document>(`${this.base}/${id}`, data);
  }

  // ── Delete ─────────────────────────────────────────────
  delete(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }

  // ── Upload new file version ────────────────────────────
  uploadFile(id: string, file: File, label?: string): Observable<{ version: number }> {
    const fd = new FormData();
    fd.append('file', file);
    if (label) fd.append('label', label);
    return this.http.post<{ version: number }>(`${this.base}/${id}/file`, fd);
  }

  // ── Preview (returns blob URL) ─────────────────────────
  previewUrl(id: string): string {
    return `${this.base}/${id}/preview`;
  }

  versionPreviewUrl(docId: string, versionId: string): string {
    return `${this.base}/${docId}/versions/${versionId}/preview`;
  }

  // ── Download ───────────────────────────────────────────
  download(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/download`, { responseType: 'blob' });
  }

  downloadVersion(docId: string, versionId: string): Observable<Blob> {
    return this.http.get(`${this.base}/${docId}/versions/${versionId}/download`, { responseType: 'blob' });
  }

  // ── Tags ───────────────────────────────────────────────
  getTags(docId: string): Observable<DocumentTag[]> {
    return this.http.get<DocumentTag[]>(`${this.base}/${docId}/tags`);
  }

  addTag(docId: string, key: string, value: string): Observable<DocumentTag> {
    return this.http.post<DocumentTag>(`${this.base}/${docId}/tags`, { key, value });
  }

  updateTag(docId: string, tagId: string, value: string): Observable<DocumentTag> {
    return this.http.patch<DocumentTag>(`${this.base}/${docId}/tags/${tagId}`, { value });
  }

  deleteTag(docId: string, tagId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${docId}/tags/${tagId}`);
  }

  // ── Document new version ─────────────────────────────────
  uploadNewVersion(id: string, file: File, label?: string): Observable<{ version: number }> {
    const fd = new FormData();
    fd.append('file', file);
    if (label) fd.append('label', label);
    return this.http.post<{ version: number }>(`${this.base}/${id}/file`, fd);
  }

  // ── Attachments ────────────────────────────────────────
  getAttachments(docId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/${docId}/attachments`);
  }

  uploadAttachment(docId: string, file: File, name?: string): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    if (name) fd.append('name', name);
    return this.http.post<any>(`${this.base}/${docId}/attachments`, fd);
  }

  uploadAttachmentVersion(docId: string, attId: string, file: File, label?: string): Observable<{ version: number }> {
    const fd = new FormData();
    fd.append('file', file);
    if (label) fd.append('label', label);
    return this.http.post<{ version: number }>(`${this.base}/${docId}/attachments/${attId}/versions`, fd);
  }

  downloadAttachment(docId: string, attId: string): Observable<Blob> {
    return this.http.get(`${this.base}/${docId}/attachments/${attId}/download`, { responseType: 'blob' });
  }

  downloadAttachmentVersion(docId: string, attId: string, verId: string): Observable<Blob> {
    return this.http.get(`${this.base}/${docId}/attachments/${attId}/versions/${verId}/download`, { responseType: 'blob' });
  }

  deleteAttachment(docId: string, attId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${docId}/attachments/${attId}`);
  }

  // ── Signing ────────────────────────────────────────────
  initiateSigning(docId: string, signatories: SigningSignatory[]): Observable<SigningInitResponse> {
    return this.http.post<SigningInitResponse>(`${environment.apiUrl}/documents/${docId}/sign/initiate`, { signatories });
  }


  // History (audit log)
  getHistory(docId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/${docId}/history`);
  }

}