import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { catchError, concatMap, finalize, from, of } from 'rxjs';
import { AttachmentList, AttachmentSource, EntityAttachment, EntityAttachmentsApiService } from '../../../core/services/entity-attachments-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { ListColumnHeaderComponent } from '../../list/list-column-header.component';
import { ListPagerComponent } from '../../list/list-pager.component';
import { ListQueryState, createListLoader } from '../../list/list-query';
import { ATTACHMENT_ACCEPTED_EXTENSIONS, ATTACHMENT_MAX_SIZE_MB, formatAttachmentSize } from './attachment-files';

@Component({
  selector: 'wt-entity-attachments',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink, TranslocoDirective, ListColumnHeaderComponent, ListPagerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section *transloco="let t; prefix: 'attachments'" [class.compact]="compact()" (click)="$event.stopPropagation()">
      @if (compact()) {
        @if (isCompactVisible()) {
          <div class="chips" [class.drop-active]="isDragOver()" (dragover)="onDragOver($event)" (dragleave)="isDragOver.set(false)" (drop)="onDrop($event)">
            @if (isCompactLoaded()) {
              @for (file of list.result()?.items ?? []; track file.id) {
                <span class="chip" [class.busy]="busyIds().includes(file.id)">
                  <span class="file-kind" aria-hidden="true">{{ fileExtension(file.filename) }}</span>
                  <button type="button" class="chip-name" (click)="download(file)" [disabled]="busyIds().includes(file.id)" [attr.title]="file.filename + ' · ' + (file.author_name || '—') + ' · ' + (file.created_at | date:'dd.MM.yyyy HH:mm')">{{ file.filename }}</button>
                  <span class="chip-size">{{ formatSize(file.file_size) }}</span>
                  @if (list.result()?.can_write && canUpload()) {
                    <button type="button" class="chip-remove" (click)="remove(file)" [disabled]="busyIds().includes(file.id)" [attr.aria-label]="t('delete') + ': ' + file.filename" [attr.title]="t('delete')">×</button>
                  }
                </span>
              }
              @if (list.isLoading() && !list.result()) { <span class="chip-state" role="status">{{ t('loading') }}</span> }
              @if (hasLoadError()) { <button type="button" class="chip-state" (click)="list.reload()">{{ t('loadFailed') }} · {{ t('refresh') }}</button> }
            }
            @if (canUpload() && (attachmentCount() === 0 || list.result()?.can_write)) {
              <label class="chip add" [class.disabled]="isUploading()" [attr.title]="t('dropHint')">
                {{ isUploading() ? t('uploading') : '+ ' + t('add') }}
                <input type="file" multiple [accept]="acceptedExtensions" [disabled]="isUploading()" (change)="upload($event)" [attr.aria-label]="t('add')">
              </label>
            }
          </div>
        }
      }
      @if (!compact()) {
        <div class="attachment-head">
          <h3>{{ t('title') }} @if (list.result(); as result) { <span>({{ result.total }})</span> }</h3>
          <button type="button" class="btn btn-g btn-sm" [disabled]="list.isLoading()" (click)="list.reload()">{{ t('refresh') }}</button>
          @if (canUpload() && list.result()?.can_write) {
            <label class="btn btn-p btn-sm upload" [class.disabled]="isUploading()">
              {{ t(isUploading() ? 'uploading' : 'add') }}
              <input type="file" multiple [accept]="acceptedExtensions" [disabled]="isUploading()" (change)="upload($event)" [attr.aria-label]="t('add')">
            </label>
          }
        </div>
        @if (aggregate()) { <p class="hint">{{ t('summaryHint') }}</p> }
        <div class="toolbar">
          <div class="search-wrap srch-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input id="attachments-filter-filename" class="search" type="search" [placeholder]="t('filename')" [attr.aria-label]="t('filename')" maxlength="300"
                   [value]="query.value('filename')" (change)="setFilter('filename', $event)" (keyup.enter)="setFilter('filename', $event)">
          </div>
          @if (aggregate()) {
            <select id="attachments-filter-source" class="sel" [attr.aria-label]="t('source')" (change)="setFilter('source', $event)">
              <option value="">{{ t('allSources') }}</option>
              @for (category of sourceCategories; track category) {
                <option [value]="category" [selected]="query.value('source') === category">{{ t('categories.' + category) }}</option>
              }
            </select>
            <select id="attachments-filter-place" class="sel" [attr.aria-label]="t('place')" (change)="setFilter('place', $event)">
              <option value="">{{ t('allPlaces') }}</option>
              @for (place of filterOptions().places; track place.key) {
                <option [value]="place.key" [selected]="query.value('place') === place.key">{{ t('categories.' + categoryKey(place.category)) }} · {{ place.label }}</option>
              }
            </select>
          }
          <select id="attachments-filter-author" class="sel" [attr.aria-label]="t('author')" (change)="setFilter('author', $event)">
            <option value="">{{ t('allAuthors') }}</option>
            @for (author of filterOptions().authors; track author.id) {
              <option [value]="author.id" [selected]="query.value('author') === author.id">{{ author.name || '—' }}</option>
            }
          </select>
          <div class="date-range" [class.on]="query.value('created_from') || query.value('created_to')">
            <span class="date-range-lbl">{{ t('date') }}:</span>
            <span class="date-range-endpoint">{{ t('from') }}</span>
            <input id="attachments-filter-from" type="date" class="sel" [value]="query.value('created_from')" [max]="query.value('created_to') || null" (change)="setFilter('created_from', $event)" [attr.aria-label]="t('date') + ' ' + t('from')">
            <span class="date-range-endpoint">{{ t('to') }}</span>
            <input id="attachments-filter-to" type="date" class="sel" [value]="query.value('created_to')" [min]="query.value('created_from') || null" (change)="setFilter('created_to', $event)" [attr.aria-label]="t('date') + ' ' + t('to')">
            @if (query.value('created_from') || query.value('created_to')) {
              <button type="button" class="date-range-x" (click)="query.setValues({ created_from: '', created_to: '' })" [attr.title]="t('clearDates')" [attr.aria-label]="t('clearDates')">×</button>
            }
          </div>
        </div>
        @if (list.isLoading()) { <p class="state" role="status">{{ t('loading') }}</p> }
        @else if (hasLoadError()) {
          <p class="state" role="alert">{{ t('loadFailed') }} <button type="button" class="btn btn-g btn-sm" (click)="list.reload()">{{ t('refresh') }}</button></p>
        } @else {
          <div class="table-scroll">
            <table>
              <thead><tr>
                <th [wtListColumn]="t('filename')" [query]="query" sortKey="filename"></th>
                @if (aggregate()) {
                  <th [wtListColumn]="t('source')" [query]="query" sortKey="source"></th>
                  <th [wtListColumn]="t('place')" [query]="query" sortKey="place"></th>
                }
                <th [wtListColumn]="t('author')" [query]="query" sortKey="author"></th>
                <th [wtListColumn]="t('date')" [query]="query" sortKey="created_at"></th>
                <th>{{ t('actions') }}</th>
              </tr></thead>
              <tbody>
                @for (file of list.result()?.items ?? []; track file.id; let index = $index) {
                  @if (aggregate() && !query.sort() && startsGroup(index)) {
                    <tr class="group"><td [attr.colspan]="columnCount()">{{ t('categories.' + category(file)) }} · {{ placeLabel(file) }}</td></tr>
                  }
                  <tr>
                    <td class="file"><button type="button" class="file-link" (click)="download(file)" [disabled]="busyIds().includes(file.id)" [attr.title]="file.filename">{{ file.filename }}</button>
                      <small>{{ file.file_size / 1024 | number:'1.0-1' }} KB</small></td>
                    @if (aggregate()) {
                    <td><span class="badge">{{ t('categories.' + category(file)) }}</span></td>
                    <td>
                      @if (file.project_id) {
                        <a [routerLink]="['/projects', file.project_id]" [queryParams]="file.source_type === 'project-task' ? {task: file.source_id} : {tab: 'attachments'}">{{ file.project_name }}</a>
                        @if (file.source_type === 'project-task') { <small>{{ file.source_name }}</small> }
                      } @else if (aggregate() && (file.source_type === 'lead-activity' || file.source_type === 'partner-activity')) {
                        <button type="button" class="file-link" (click)="sourceOpened.emit(file)">{{ file.source_name }}</button>
                      } @else { {{ file.source_name }} }
                    </td>
                    }
                    <td>{{ file.author_name || '—' }}</td>
                    <td>{{ file.created_at | date:'dd.MM.yyyy HH:mm' }}</td>
                    <td class="actions">
                      <button type="button" class="btn btn-g btn-sm" (click)="download(file)" [disabled]="busyIds().includes(file.id)">{{ t('download') }}</button>
                      @if (file.source_type === sourceType() && file.source_id === '' + sourceId() && canUpload() && list.result()?.can_write) {
                        <button type="button" class="btn btn-d btn-sm" (click)="remove(file)" [disabled]="busyIds().includes(file.id)">{{ t('delete') }}</button>
                      }
                    </td>
                  </tr>
                } @empty { <tr><td [attr.colspan]="columnCount()" class="state">{{ t(query.activeFilterCount() ? 'noMatches' : 'empty') }}</td></tr> }
              </tbody>
            </table>
          </div>
          <wt-list-pager [query]="query" [total]="list.result()?.total ?? 0" />
        }
      }
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0;flex-shrink:0}section{padding:12px;min-width:0;color:var(--gray-700,var(--gray-700));font-size:12px}section.compact{padding:6px 0 0}
    .toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px}
    .search-wrap{position:relative;display:flex;align-items:center}.search-wrap svg{position:absolute;left:10px;width:15px;height:15px;color:var(--gray-400,var(--gray-400));pointer-events:none}
    .search{background:var(--gray-100,var(--gray-100));border:1px solid var(--gray-200,var(--gray-200));border-radius:8px;padding:8px 14px 8px 34px;font-size:14px;width:220px;outline:none;font-family:inherit}.search:focus{border-color:var(--orange,#3BAA5D);background:var(--surface)}
    .sel{appearance:none;-webkit-appearance:none;background:var(--gray-100,var(--gray-100)) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>") no-repeat right 10px center;border:1px solid var(--gray-200,var(--gray-200));border-radius:8px;padding:6px 30px 6px 10px;font-size:12px;color:var(--gray-700,var(--gray-700));outline:none;font-family:inherit;cursor:pointer;max-width:240px}.sel:focus{border-color:var(--orange,#3BAA5D)}
    .toolbar :is(.sel,.search){height:30px !important;min-height:30px !important;padding-top:0 !important;padding-bottom:0 !important;font-size:12px !important;border-radius:8px !important;box-sizing:border-box}
    .toolbar .search{width:200px}
    .toolbar .date-range input.sel[type=date]{width:128px;padding:0 10px !important;font-weight:500}
    .date-range{display:inline-flex;align-items:center;gap:4px}.date-range .sel{padding:4px 6px;width:128px;background-image:none}.date-range.on .sel{border-color:var(--orange,#3BAA5D)}
    .date-range-lbl,.date-range-endpoint{font-size:12px;font-weight:500;color:var(--gray-500,var(--gray-500));white-space:nowrap}
    .date-range-x{font:inherit;border:0;background:none;cursor:pointer;font-size:16px;line-height:1;color:var(--gray-400,var(--gray-400));padding:0 2px}.date-range-x:hover{color:var(--orange,oklch(from #3baa5d max(l, var(--text-min-l)) c h))}
    .attachment-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}h3{font-size:14px;margin:0;flex:1}h3 span{color:var(--gray-500);font-weight:400}
    .hint{color:var(--gray-500);margin:0 0 12px;line-height:1.5}.table-scroll{overflow:auto;margin:12px 0}table{border-collapse:collapse;width:100%;text-align:left}th,td{padding:8px 8px;border-bottom:1px solid var(--gray-200);vertical-align:top}th{font-size:12px;white-space:nowrap;background:var(--gray-50)}
    .file{min-width:140px;max-width:220px}.file .file-link{display:block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}small{display:block;color:var(--gray-500);margin-top:4px}.file-link,a{color:var(--orange-dark,oklch(from #15803d max(l, var(--text-min-l)) c h));text-decoration:none}.file-link{font:inherit;border:0;background:none;cursor:pointer;text-align:left;padding:0;overflow-wrap:anywhere}
    .chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;border-radius:8px;border:1px dashed transparent}.chips.drop-active{border-color:var(--orange,#3BAA5D);background:var(--orange-pale,var(--gray-200));padding:6px}
    .chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;min-width:0;height:30px;padding:0 4px 0 10px;border:1px solid var(--gray-200,var(--gray-200));border-radius:999px;background:var(--gray-50,var(--gray-50));font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,.06);transition:border-color .15s,box-shadow .15s}.chip:hover{border-color:var(--orange,#3BAA5D);box-shadow:0 1px 2px rgba(0,0,0,.06)}.chip.busy{opacity:.6}
    .chip-name{font:inherit;border:0;background:none;padding:0;cursor:pointer;color:var(--gray-800,var(--gray-800));font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px}.chip-name:hover{color:var(--orange-dark,oklch(from #2f8f4d max(l, var(--text-min-l)) c h));text-decoration:underline}
    .chip-size{color:var(--gray-400);font-size:12px;white-space:nowrap}.chip-remove{font:inherit;border:0;background:none;color:var(--gray-400);cursor:pointer;width:20px;height:20px;border-radius:50%;line-height:1;font-size:16px;padding:0}.chip-remove:hover{background:color-mix(in srgb, #fee2e2 var(--tint-mix), var(--surface));color:oklch(from #b91c1c max(l, var(--text-min-l)) c h)}
    .file-kind{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:oklch(from #dc2626 max(l, var(--text-min-l)) c h)}
    .chip.add{font:inherit;font-size:12px;font-weight:500;color:var(--orange-dark,oklch(from #2f8f4d max(l, var(--text-min-l)) c h));border:1px dashed var(--orange,#3BAA5D);background:var(--orange-pale,var(--gray-200));box-shadow:none;padding:0 12px;cursor:pointer;position:relative;overflow:hidden}.chip.add:hover{background:color-mix(in srgb, #d5eedd var(--tint-mix), var(--surface))}.chip.add input{position:absolute;inset:0;opacity:0;width:100%;cursor:pointer}.chip.add:focus-within,.chip.add:focus-visible{outline:2px solid var(--orange,#3BAA5D);outline-offset:2px}
    .chip-state{font:inherit;border:0;background:none;color:var(--gray-500);font-size:12px;padding:0 4px}
    .upload{position:relative;overflow:hidden;cursor:pointer}.upload input{position:absolute;inset:0;opacity:0;width:100%;cursor:pointer}.upload:focus-within{outline:2px solid var(--orange,#3BAA5D);outline-offset:2px}.disabled,button:disabled{opacity:.5;cursor:default}.danger{color:oklch(from #b91c1c max(l, var(--text-min-l)) c h)}.actions{white-space:nowrap}.actions button+button{margin-left:4px}.state{text-align:center;padding:20px;color:var(--gray-500)}.badge{background:var(--gray-100);border-radius:4px;padding:4px 6px;white-space:nowrap}.group td{background:var(--orange-pale,var(--gray-50));font-weight:600;color:var(--orange-dark,oklch(from #15803d max(l, var(--text-min-l)) c h))}
  `],
})
export class EntityAttachmentsComponent {
  readonly sourceType = input.required<AttachmentSource>();
  readonly sourceId = input.required<string | number>();
  readonly aggregate = input(false);
  readonly compact = input(false);
  readonly canUpload = input(true);
  // File count already known from the parent list (null = unknown), so a card without files sends no request.
  readonly attachmentCount = input<number | null>(null);
  readonly isDragOver = signal(false);
  readonly sourceOpened = output<EntityAttachment>();
  // Lets an activity card keep its file count in step after uploads and deletions.
  readonly fileCountChange = output<number>();
  readonly isExpanded = signal(false);
  readonly isUploading = signal(false);
  readonly hasLoadError = signal(false);
  readonly busyIds = signal<string[]>([]);
  readonly query = new ListQueryState();
  private readonly api = inject(EntityAttachmentsApiService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly filterNames = ['filename', 'source', 'place', 'author', 'created_from', 'created_to', 'page', 'sort', 'order'];

  readonly acceptedExtensions = ATTACHMENT_ACCEPTED_EXTENSIONS;
  private readonly maxSizeMb = ATTACHMENT_MAX_SIZE_MB;
  readonly columnCount = computed(() => this.aggregate() ? 6 : 4);
  readonly sourceCategories = ['direct', 'task', 'note', 'project', 'project-task'];

  readonly filterOptions = computed<AttachmentList['filter_options']>(() =>
    this.list.result()?.filter_options ?? { authors: [], places: [] });

  setFilter(param: string, event: Event): void {
    this.query.setValue(param, (event.target as HTMLInputElement | HTMLSelectElement).value.trim());
  }

  placeLabel(file: EntityAttachment): string {
    return file.source_type === 'project-task' ? `${file.project_name} / ${file.source_name}` : file.source_name;
  }
  readonly isCompactLoaded = computed(() => this.isExpanded() || this.attachmentCount() !== 0);
  readonly isCompactVisible = computed(() => this.attachmentCount() !== 0 || this.canUpload() || this.isExpanded());
  readonly requestParams = computed(() => !this.sourceId() || (this.compact() && !this.isCompactLoaded()) ? null : {
    ...this.query.params(), aggregate: String(this.aggregate()), sourceType: this.sourceType(), sourceId: String(this.sourceId()),
  });
  readonly list = createListLoader(this.requestParams, params => {
    const { sourceType, sourceId, ...filters } = params;
    this.hasLoadError.set(false);
    return this.api.list(sourceType as AttachmentSource, sourceId, filters);
  }, () => this.hasLoadError.set(true));

  constructor() {
    effect(() => {
      const result = this.list.result();
      // Deferred: the parent updates its own state from this, which must not happen mid change detection.
      if (result && this.compact()) queueMicrotask(() => this.fileCountChange.emit(result.total));
    });
    effect(() => {
      if (!this.aggregate()) return;
      const values = this.query.queryParams();
      const params: Record<string, string | null> = {};
      for (const name of this.filterNames) params['attachments_' + name] = values[name] ?? null;
      void this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
    });
    const stored: Record<string, string> = {};
    for (const name of this.filterNames) {
      const value = this.route.snapshot.queryParamMap.get('attachments_' + name);
      if (value) stored[name] = value;
    }
    this.query.restore({ keys: Object.keys(stored), get: name => stored[name] ?? null });
  }

  private text(key: string): string { return this.transloco.translate('attachments.' + key); }

  category(file: EntityAttachment): string { return this.categoryKey(file.source_category); }

  categoryKey(sourceCategory: string): string {
    return this.sourceCategories.includes(sourceCategory) ? sourceCategory : 'activity';
  }

  startsGroup(index: number): boolean {
    const items = this.list.result()?.items ?? [];
    const key = (file: EntityAttachment) => `${this.category(file)}|${file.source_type}|${file.source_id}`;
    return index === 0 || key(items[index]) !== key(items[index - 1]);
  }

  fileExtension(filename: string): string {
    const dot = filename.lastIndexOf('.');
    return dot > 0 ? filename.slice(dot + 1, dot + 5) : '?';
  }

  formatSize(bytes: number): string { return formatAttachmentSize(bytes, this.transloco.getActiveLang()); }

  onDragOver(event: DragEvent): void {
    if (!this.canUpload() || !event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDrop(event: DragEvent): void {
    this.isDragOver.set(false);
    if (!this.canUpload() || !event.dataTransfer?.files.length) return;
    event.preventDefault();
    this.uploadFiles(Array.from(event.dataTransfer.files));
  }

  upload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.uploadFiles(files);
  }

  private uploadFiles(files: File[]): void {
    if (!files.length || this.isUploading()) return;
    this.isExpanded.set(true);
    this.isUploading.set(true);
    const sourceType = this.sourceType(), sourceId = this.sourceId();
    from(files).pipe(
      concatMap(file => {
        if (file.size > this.maxSizeMb * 1024 * 1024) {
          this.toast.error(this.transloco.translate('attachments.tooLarge', { name: file.name, max: this.maxSizeMb }));
          return of(null);
        }
        return this.api.upload(sourceType, sourceId, file).pipe(catchError((error: HttpErrorResponse) => {
          const typeRejected = error.status === 400 && error.error?.error === 'Unsupported attachment type';
          this.toast.error(typeRejected
            ? this.transloco.translate('attachments.typeNotAllowed', { name: file.name })
            : this.transloco.translate('attachments.uploadFailed', { name: file.name }));
          return of(null);
        }));
      }),
      finalize(() => { this.isUploading.set(false); this.list.reload(); }),
    ).subscribe();
  }

  download(file: EntityAttachment): void {
    if (this.busyIds().includes(file.id)) return;
    this.busyIds.update(ids => [...ids, file.id]);
    this.api.download(file).pipe(finalize(() => this.busyIds.update(ids => ids.filter(id => id !== file.id)))).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = file.filename; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: () => this.toast.error(this.text('downloadFailed')),
    });
  }

  remove(file: EntityAttachment): void {
    if (!confirm(this.transloco.translate('attachments.deleteConfirm', { name: file.filename }))) return;
    this.busyIds.update(ids => [...ids, file.id]);
    this.api.delete(file).pipe(finalize(() => this.busyIds.update(ids => ids.filter(id => id !== file.id)))).subscribe({
      next: () => this.list.reload(), error: () => this.toast.error(this.text('deleteFailed')),
    });
  }
}
