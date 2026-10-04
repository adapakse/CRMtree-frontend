import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import {
  CrmSeoService, SeoContent, SeoEnrichmentSlot, SeoScreenshot, SeoSlotType, SeoSlotValue,
} from '../../../core/services/crm-seo.service';
import { ToastService } from '../../../core/services/toast.service';

const SLOT_TYPE_LABELS: Record<SeoSlotType, string> = {
  expert_comment: 'crm.seo.contentSlots.types.expert_comment',
  quote: 'crm.seo.contentSlots.types.quote',
  screenshot: 'crm.seo.contentSlots.types.screenshot',
};

// Each generated article asks for an expert comment, attributed quotes and
// screenshots at specific places ([[SLOT:id]] markers in the body). The
// backend blocks approval until every one is filled or removed.
@Component({
  selector: 'wt-seo-content-slots',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('crm')],
  template: `
    <ng-container *transloco="let t; prefix: 'crm'">
    @if (visibleSlots().length) {
      <div class="slots-box">
        <h3>{{ t('seo.contentSlots.title') }}</h3>
        <p class="hint">
          {{ t('seo.contentSlots.hint') }}
        </p>
        @for (slot of visibleSlots(); track slot.id) {
          <div class="slot-card" [class.done]="slot.status !== 'pending'">
            <div class="slot-head">
              <span class="slot-type">{{ typeLabel(slot.type) }}</span>
              @if (slot.status === 'filled') { <span class="slot-status filled">{{ t('seo.contentSlots.statuses.filled') }}</span> }
              @if (slot.status === 'removed') { <span class="slot-status removed">{{ t('seo.contentSlots.statuses.removed') }}</span> }
            </div>
            <p class="slot-brief">{{ slot.brief }}</p>

            @if (slot.status === 'pending' && editable()) {
              @if (activeSlotId() === slot.id) {
                @switch (slot.type) {
                  @case ('expert_comment') {
                    <label class="field-label" [for]="slot.id + '-text'">{{ t('seo.contentSlots.fields.comment') }}</label>
                    <textarea class="field-input" [id]="slot.id + '-text'" rows="4" [(ngModel)]="text"></textarea>
                    <div class="field-row">
                      <div>
                        <label class="field-label" [for]="slot.id + '-author'">{{ t('seo.contentSlots.fields.fullName') }}</label>
                        <input class="field-input" [id]="slot.id + '-author'" [(ngModel)]="author">
                      </div>
                      <div>
                        <label class="field-label" [for]="slot.id + '-role'">{{ t('seo.contentSlots.fields.roleCompany') }}</label>
                        <input class="field-input" [id]="slot.id + '-role'" [(ngModel)]="authorRole" [placeholder]="t('seo.contentSlots.placeholders.roleCompany')">
                      </div>
                    </div>
                  }
                  @case ('quote') {
                    @if (slot.suggestion; as s) {
                      <div class="suggestion">
                        <span class="suggestion-label">{{ t('seo.contentSlots.suggestion.label') }}</span>
                        <p class="suggestion-quote">„{{ s.quote }}”</p>
                        <p class="suggestion-source">
                          — {{ s.author }}{{ s.author_role ? ', ' + s.author_role : '' }} ·
                          <a [href]="s.source_url" target="_blank" rel="noopener noreferrer">{{ s.source_title || s.source_url }}</a>
                        </p>
                        <button type="button" class="btn-ghost btn-sm" (click)="useSuggestion(slot)">{{ t('seo.contentSlots.suggestion.use') }}</button>
                      </div>
                    }
                    <label class="field-label" [for]="slot.id + '-text'">{{ t('seo.contentSlots.fields.quote') }}</label>
                    <textarea class="field-input" [id]="slot.id + '-text'" rows="3" [(ngModel)]="text"></textarea>
                    <div class="field-row">
                      <div>
                        <label class="field-label" [for]="slot.id + '-author'">{{ t('seo.contentSlots.fields.quoteAuthor') }}</label>
                        <input class="field-input" [id]="slot.id + '-author'" [(ngModel)]="author">
                      </div>
                      <div>
                        <label class="field-label" [for]="slot.id + '-role'">{{ t('seo.contentSlots.fields.role') }}</label>
                        <input class="field-input" [id]="slot.id + '-role'" [(ngModel)]="authorRole">
                      </div>
                    </div>
                    <div class="field-row">
                      <div>
                        <label class="field-label" [for]="slot.id + '-source'">{{ t('seo.contentSlots.fields.sourceTitle') }}</label>
                        <input class="field-input" [id]="slot.id + '-source'" [(ngModel)]="sourceTitle">
                      </div>
                      <div>
                        <label class="field-label" [for]="slot.id + '-url'">{{ t('seo.contentSlots.fields.sourceUrl') }}</label>
                        <input class="field-input" [id]="slot.id + '-url'" [(ngModel)]="sourceUrl">
                      </div>
                    </div>
                  }
                  @case ('screenshot') {
                    @if (screenshots().length) {
                      <div class="shot-picker">
                        @for (shot of sortedScreenshots(slot); track shot.id) {
                          <button type="button" class="shot-option" [class.selected]="screenshotId === shot.id" (click)="screenshotId = shot.id">
                            <img [src]="seoService.screenshotSrc(shot.id)" [alt]="shot.caption" loading="lazy">
                            <span>{{ shot.feature_tag }} · {{ shot.caption }}</span>
                          </button>
                        }
                      </div>
                    } @else {
                      <p class="hint">{{ t('seo.contentSlots.screenshots.emptyLibrary') }}</p>
                    }
                    <details class="upload-new">
                      <summary>{{ t('seo.contentSlots.screenshots.uploadNew') }}</summary>
                      <input #fileInput type="file" accept="image/png,image/jpeg,image/webp" (change)="newFile = fileInput.files?.[0] ?? null">
                      <label class="field-label" [for]="slot.id + '-caption'">{{ t('seo.contentSlots.fields.caption') }}</label>
                      <input class="field-input" [id]="slot.id + '-caption'" [(ngModel)]="newCaption">
                      <button type="button" class="btn-ghost btn-sm" (click)="uploadAndSelect(slot)" [disabled]="!newFile || !newCaption.trim() || busy()">{{ t('seo.contentSlots.screenshots.uploadToLibrary') }}</button>
                    </details>
                  }
                }
                <div class="slot-actions">
                  <button type="button" class="btn-accent btn-sm" (click)="fill(slot)" [disabled]="busy()">{{ t('seo.contentSlots.actions.insert') }}</button>
                  <button type="button" class="btn-ghost btn-sm" (click)="activeSlotId.set(null)">{{ 'actions.cancel' | transloco }}</button>
                </div>
              } @else {
                <div class="slot-actions">
                  <button type="button" class="btn-accent btn-sm" (click)="open(slot)">{{ t('seo.contentSlots.actions.fill') }}</button>
                  <button type="button" class="btn-reject btn-sm" (click)="remove(slot)" [disabled]="busy()">{{ t('seo.contentSlots.actions.remove') }}</button>
                </div>
              }
            }
          </div>
        }
      </div>
    }
    </ng-container>
  `,
  styles: [`
    .slots-box { border: 1px solid #FCD34D; background: #FFFBEB; border-radius: var(--radius); padding: 0.9rem 1rem; margin-top: 0.9rem; }
    .slots-box h3 { font-size: 0.95rem; margin: 0 0 0.25rem; }
    .hint { font-size: 0.78rem; color: var(--gray-600); margin: 0 0 0.6rem; }
    .slot-card { background: #fff; border: 1px solid var(--gray-200); border-radius: 8px; padding: 0.7rem 0.8rem; margin-top: 0.5rem; }
    .slot-card.done { opacity: 0.7; }
    .slot-head { display: flex; align-items: center; gap: 0.5rem; }
    .slot-type { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: var(--orange-dark); }
    .slot-status { font-size: 0.68rem; font-weight: 700; padding: 0.1em 0.5em; border-radius: 999px; }
    .slot-status.filled { background: var(--orange-pale); color: var(--orange-dark); }
    .slot-status.removed { background: var(--gray-100); color: var(--gray-600); }
    .slot-brief { font-size: 0.85rem; color: var(--gray-800); margin: 0.3rem 0 0; }
    .field-label { display: block; font-size: 0.72rem; font-weight: 600; color: var(--gray-700); margin: 0.55rem 0 0.2rem; }
    .field-input { width: 100%; border: 1px solid var(--gray-200); border-radius: 8px; padding: 0.45rem 0.6rem; font-family: inherit; font-size: 0.82rem; }
    .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
    @media (max-width: 640px) { .field-row { grid-template-columns: 1fr; } }
    .suggestion { border-left: 3px solid var(--orange); background: var(--orange-pale); padding: 0.55rem 0.7rem; border-radius: 0 6px 6px 0; margin-top: 0.55rem; }
    .suggestion-label { font-size: 0.72rem; font-weight: 600; color: var(--gray-700); }
    .suggestion-quote { font-style: italic; font-size: 0.85rem; margin: 0.3rem 0 0; }
    .suggestion-source { font-size: 0.78rem; color: var(--gray-600); margin: 0.25rem 0 0.4rem; }
    .shot-picker { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.5rem; margin-top: 0.55rem; }
    .shot-option { border: 2px solid var(--gray-200); border-radius: 8px; background: #fff; padding: 0.3rem; cursor: pointer; text-align: left; font-size: 0.72rem; color: var(--gray-700); }
    .shot-option.selected { border-color: var(--orange); }
    .shot-option img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 4px; margin-bottom: 0.25rem; }
    .upload-new { margin-top: 0.6rem; font-size: 0.8rem; }
    .upload-new summary { cursor: pointer; color: var(--gray-700); font-weight: 600; }
    .upload-new input[type="file"] { margin-top: 0.4rem; font-size: 0.75rem; }
    .slot-actions { display: flex; gap: 0.4rem; margin-top: 0.6rem; }
    .btn-sm { padding: 0.45rem 0.8rem; font-size: 0.8rem; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
    .btn-accent { background: var(--orange); color: #fff; }
    .btn-ghost { background: var(--gray-100); color: var(--gray-800); }
    .btn-reject { background: #FEE2E2; color: #991B1B; }
  `],
})
export class SeoContentSlotsComponent {
  readonly content = input.required<SeoContent>();
  readonly editable = input(false);
  readonly screenshots = input<SeoScreenshot[]>([]);
  readonly contentChanged = output<SeoContent>();
  readonly screenshotAdded = output<void>();

  readonly seoService = inject(CrmSeoService);
  private toast = inject(ToastService);
  private transloco = inject(TranslocoService);

  readonly activeSlotId = signal<string | null>(null);
  readonly busy = signal(false);
  readonly visibleSlots = computed(() => this.content().enrichment_slots ?? []);

  text = '';
  author = '';
  authorRole = '';
  sourceTitle = '';
  sourceUrl = '';
  screenshotId: number | null = null;
  newFile: File | null = null;
  newCaption = '';

  typeLabel(type: SeoSlotType): string {
    return this.transloco.translate(SLOT_TYPE_LABELS[type]);
  }

  // Screenshots tagged with the slot's feature come first.
  sortedScreenshots(slot: SeoEnrichmentSlot): SeoScreenshot[] {
    const tag = (slot.feature_tag ?? '').toLowerCase();
    const matches = (s: SeoScreenshot) => !!tag && s.feature_tag.toLowerCase().includes(tag);
    return [...this.screenshots()].sort((a, b) => Number(matches(b)) - Number(matches(a)));
  }

  open(slot: SeoEnrichmentSlot): void {
    this.text = '';
    this.author = '';
    this.authorRole = '';
    this.sourceTitle = '';
    this.sourceUrl = '';
    this.screenshotId = null;
    this.newFile = null;
    this.newCaption = '';
    this.activeSlotId.set(slot.id);
  }

  useSuggestion(slot: SeoEnrichmentSlot): void {
    const s = slot.suggestion;
    if (!s) return;
    this.text = s.quote;
    this.author = s.author;
    this.authorRole = s.author_role ?? '';
    this.sourceTitle = s.source_title ?? '';
    this.sourceUrl = s.source_url;
  }

  uploadAndSelect(slot: SeoEnrichmentSlot): void {
    if (!this.newFile) return;
    this.busy.set(true);
    this.seoService.uploadScreenshot(this.newFile, slot.feature_tag || 'Produkt', this.newCaption.trim()).subscribe({
      next: (shot) => {
        this.screenshotId = shot.id;
        this.newFile = null;
        this.busy.set(false);
        this.screenshotAdded.emit();
        this.toast.success(this.transloco.translate('crm.seo.contentSlots.toasts.screenshotUploaded'));
      },
      error: (err) => { this.busy.set(false); this.toast.error(err?.error?.error ?? this.transloco.translate('crm.seo.contentSlots.toasts.screenshotUploadFailed')); },
    });
  }

  fill(slot: SeoEnrichmentSlot): void {
    const value = this.buildValue(slot.type);
    if (!value) return;
    this.busy.set(true);
    this.seoService.fillSlot(this.content().id, slot.id, value).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.activeSlotId.set(null);
        this.toast.success(this.transloco.translate('crm.seo.contentSlots.toasts.inserted'));
        this.contentChanged.emit(updated);
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error(err?.error?.details?.[0]?.field
          ? this.transloco.translate('crm.seo.contentSlots.toasts.checkField', { field: err.error.details[0].field })
          : err?.error?.error ?? this.transloco.translate('crm.seo.contentSlots.toasts.insertFailed'));
      },
    });
  }

  remove(slot: SeoEnrichmentSlot): void {
    if (!confirm(this.transloco.translate('crm.seo.contentSlots.removeConfirm'))) return;
    this.busy.set(true);
    this.seoService.removeSlot(this.content().id, slot.id).subscribe({
      next: (updated) => { this.busy.set(false); this.contentChanged.emit(updated); },
      error: (err) => { this.busy.set(false); this.toast.error(err?.error?.error ?? this.transloco.translate('crm.seo.contentSlots.toasts.removeFailed')); },
    });
  }

  private buildValue(type: SeoSlotType): SeoSlotValue | null {
    if (type === 'screenshot') {
      if (this.screenshotId == null) { this.toast.error(this.transloco.translate('crm.seo.contentSlots.toasts.chooseScreenshot')); return null; }
      return { screenshot_id: this.screenshotId };
    }
    if (!this.text.trim() || !this.author.trim()) { this.toast.error(this.transloco.translate('crm.seo.contentSlots.toasts.textAndAuthorRequired')); return null; }
    if (type === 'expert_comment') {
      return { text: this.text.trim(), author_name: this.author.trim(), author_role: this.authorRole.trim() || null };
    }
    return {
      text: this.text.trim(),
      author: this.author.trim(),
      author_role: this.authorRole.trim() || null,
      source_title: this.sourceTitle.trim() || null,
      source_url: this.sourceUrl.trim() || null,
    };
  }
}
