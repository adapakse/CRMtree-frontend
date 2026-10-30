import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, concatMap, from, map, of, toArray } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ListParams, PagedResult } from '../../shared/list/list-query';

export type AttachmentSource = 'lead' | 'partner' | 'lead-activity' | 'partner-activity' | 'project' | 'project-task';

export interface EntityAttachment {
  id: string;
  filename: string;
  mime_type: string;
  file_size: number;
  created_at: string;
  author_name: string | null;
  source_type: AttachmentSource;
  source_id: string;
  source_category: string;
  source_name: string;
  project_id: string | null;
  project_name: string | null;
}

export interface AttachmentList extends PagedResult<EntityAttachment> {
  can_write: boolean;
  filter_options: {
    authors: { id: string; name: string | null }[];
    places: { key: string; category: string; label: string }[];
  };
}

@Injectable({ providedIn: 'root' })
export class EntityAttachmentsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/entity-attachments`;

  private sourceUrl(type: AttachmentSource, id: string | number): string {
    return `${this.base}/${type}/${encodeURIComponent(id)}`;
  }

  list(type: AttachmentSource, id: string | number, params: ListParams) {
    return this.http.get<AttachmentList>(this.sourceUrl(type, id), { params });
  }

  upload(type: AttachmentSource, id: string | number, file: File) {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.http.post(this.sourceUrl(type, id), body);
  }

  /** Uploads the files one after another and emits the names of those that failed. */
  uploadAll(type: AttachmentSource, id: string | number, files: File[]): Observable<string[]> {
    return from(files).pipe(
      concatMap(file => this.upload(type, id, file).pipe(map(() => null), catchError(() => of(file.name)))),
      toArray(),
      map(names => names.filter((name): name is string => name !== null)),
    );
  }

  download(attachment: EntityAttachment) {
    return this.http.get(`${this.sourceUrl(attachment.source_type, attachment.source_id)}/${attachment.id}/download`, { responseType: 'blob' });
  }

  delete(attachment: EntityAttachment) {
    return this.http.delete(`${this.sourceUrl(attachment.source_type, attachment.source_id)}/${attachment.id}`);
  }
}
