import { ChangeDetectionStrategy, Component, inject, model, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ToastService } from '../../../core/services/toast.service';
import { ATTACHMENT_ACCEPTED_EXTENSIONS, ATTACHMENT_MAX_SIZE_MB, formatAttachmentSize } from './attachment-files';

/** Files picked in a form for a record that does not exist yet; the parent uploads them after saving. */
@Component({
  selector: 'wt-pending-attachments',
  standalone: true,
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chips" *transloco="let t; prefix: 'attachments'" [class.drop-active]="isDragOver()"
         (dragover)="onDragOver($event)" (dragleave)="isDragOver.set(false)" (drop)="onDrop($event)">
      @for (file of files(); track $index) {
        <span class="chip">
          <span class="chip-name" [attr.title]="file.name">{{ file.name }}</span>
          <span class="chip-size">{{ formatSize(file.size) }}</span>
          <button type="button" class="chip-remove" (click)="removeAt($index)" [attr.aria-label]="t('delete') + ': ' + file.name" [attr.title]="t('delete')">×</button>
        </span>
      }
      <label class="chip add" [attr.title]="t('dropHint')">
        + {{ t('add') }}
        <input type="file" multiple [accept]="acceptedExtensions" (change)="pick($event)" [attr.aria-label]="t('add')">
      </label>
    </div>
  `,
  styles: [`
    .chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;border-radius:8px;border:1px dashed transparent;font-size:12px}.chips.drop-active{border-color:var(--orange,#3BAA5D);background:var(--orange-pale,#E6F4EA);padding:6px}
    .chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;min-width:0;height:28px;padding:0 4px 0 10px;border:1px solid #e5e7eb;border-radius:999px;background:#fff}
    .chip-name{color:var(--gray-800,#1f2937);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px}
    .chip-size{color:#9ca3af;font-size:11px;white-space:nowrap}.chip-remove{font:inherit;border:0;background:none;color:#9ca3af;cursor:pointer;width:20px;height:20px;border-radius:50%;line-height:1;font-size:15px;padding:0}.chip-remove:hover{background:#fee2e2;color:#b91c1c}
    .chip.add{color:var(--orange-dark,#2F8F4D);border-style:dashed;padding:0 10px;cursor:pointer;position:relative;overflow:hidden}.chip.add:hover{background:var(--orange-pale,#E6F4EA)}.chip.add input{position:absolute;inset:0;opacity:0;width:100%;cursor:pointer}.chip.add:focus-within{outline:2px solid var(--orange,#3BAA5D);outline-offset:2px}
  `],
})
export class PendingAttachmentsComponent {
  readonly files = model<File[]>([]);
  readonly isDragOver = signal(false);
  readonly acceptedExtensions = ATTACHMENT_ACCEPTED_EXTENSIONS;
  readonly formatSize = (bytes: number) => formatAttachmentSize(bytes, this.transloco.getActiveLang());
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.add(Array.from(input.files ?? []));
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDrop(event: DragEvent): void {
    this.isDragOver.set(false);
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault();
    this.add(Array.from(event.dataTransfer.files));
  }

  removeAt(index: number): void {
    this.files.update(files => files.filter((_, position) => position !== index));
  }

  private add(picked: File[]): void {
    const accepted = picked.filter(file => {
      if (file.size <= ATTACHMENT_MAX_SIZE_MB * 1024 * 1024) return true;
      this.toast.error(this.transloco.translate('attachments.tooLarge', { name: file.name, max: ATTACHMENT_MAX_SIZE_MB }));
      return false;
    });
    if (accepted.length) this.files.update(files => [...files, ...accepted]);
  }
}
