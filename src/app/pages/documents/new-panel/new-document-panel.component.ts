import { Component, inject, Input, Output, EventEmitter, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { DocumentService } from '@core/services/document.service';
import { GroupProfile, Document, DocType, GdprType } from '@core/models/models';
import { ToastService } from '@core/services/toast.service';
import { AppSettingsService } from '@core/services/app-settings.service';
import { CrmApiService } from '../../../core/services/crm-api.service';
import { LocaleService } from '@core/i18n/locale.service';
import { DEFAULT_LOCALE } from '@core/i18n/locales';

// Built-in values have translated names; any other value comes from App
// Settings and is its own display name.
const BUILT_IN_DOC_TYPES = ['partner_agreement', 'it_supplier_agreement', 'employee_agreement', 'nda', 'operator_agreement'];
const BUILT_IN_GDPR_TYPES = ['data_processing_entrustment', 'data_administration', 'no_gdpr'];

// Dictionaries offered when the tenant has not configured its own
// (keys under documents.labels.countries / documents.labels.contractSubjects).
const FALLBACK_COUNTRY_KEYS = ['pl', 'de', 'fr', 'gb', 'cz', 'sk', 'hu', 'ro', 'ua', 'ru', 'at', 'ch'];
const FALLBACK_CONTRACT_SUBJECT_KEYS = ['businessTravel', 'conferences', 'accommodation', 'system', 'other'];

interface SelectOption { value: string; label: string; }

@Component({
  selector: 'wt-new-document-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('documents')],
  template: `
    <ng-container *transloco="let t; prefix: 'documents'">
    <div class="overlay open" (click)="onOverlay($event)">
      <div class="panel" (click)="$event.stopPropagation()">

        <div class="ph">
          <div>
            <div class="pt">{{ t('newDocument.title') }}</div>
            <div class="ps">{{ t('newDocument.subtitle') }}</div>
          </div>
          <div class="pc" (click)="close.emit()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </div>
        </div>

        <div class="pb">
          <div class="sec-title">{{ t('newDocument.basicInfo') }}</div>
          <div class="fgrid">

            <div class="fg full">
              <label class="fl">{{ t('labels.fields.documentName') }} <span class="req">*</span></label>
              <input class="fi" [placeholder]="t('newDocument.namePlaceholder')" [(ngModel)]="form.name">
            </div>

            <div class="fg">
              <label class="fl">{{ t('labels.fields.documentType') }} <span class="req">*</span></label>
              <select class="fsel" [(ngModel)]="form.doc_type">
                <option value="">{{ t('newDocument.chooseType') }}</option>
                @for (option of docTypeOptions; track option.value) {
                  <option [value]="option.value">{{ option.label }}</option>
                }
              </select>
            </div>

            <div class="fg">
              <label class="fl">{{ t('labels.fields.gdprClassification') }} <span class="req">*</span></label>
              <select class="fsel" [(ngModel)]="form.gdpr_type">
                <option value="">{{ t('newDocument.chooseGdpr') }}</option>
                @for (option of gdprTypeOptions; track option.value) {
                  <option [value]="option.value">{{ option.label }}</option>
                }
              </select>
            </div>

            <div class="fg">
              <label class="fl">{{ t('labels.fields.group') }} <span class="req">*</span></label>
              <select class="fsel" [(ngModel)]="form.group_id">
                <option value="">{{ t('newDocument.chooseGroup') }}</option>
                @for (g of groups; track g.id) {
                  <option [value]="g.id">{{ g.display_name }}</option>
                }
              </select>
            </div>

            <!-- Owner -->
            <div class="fg">
              <label class="fl">{{ t('labels.fields.owner') }}</label>
              <select class="fsel" [(ngModel)]="ownerId">
                <option value="">{{ t('labels.options.unassigned') }}</option>
                @for (u of users(); track u.id) {
                  <option [value]="u.id">{{ u.display_name }}</option>
                }
              </select>
            </div>

            <div class="fg">
              <label class="fl">{{ t('labels.fields.signingDate') }}</label>
              <input class="fi" type="date" [(ngModel)]="form.signing_date">
            </div>
            <div class="fg">
              <label class="fl">{{ t('labels.fields.expirationDate') }}</label>
              <select class="fsel" [(ngModel)]="form.expiration_date_mode" (ngModelChange)="onExpDateModeChange()">
                <option value="indefinite">{{ t('labels.options.indefinite') }}</option>
                <option value="fixed">{{ t('labels.options.fixedDate') }}</option>
              </select>
              <input *ngIf="form.expiration_date_mode==='fixed'" class="fi" type="date" [(ngModel)]="form.expiration_date" style="margin-top:6px">
            </div>

            <div class="fg">
              <label class="fl">{{ t('labels.fields.contractSubject') }} <span class="req">*</span></label>
              <select class="fsel" [(ngModel)]="form.contract_subject">
                <option value="">{{ t('labels.options.choose') }}</option>
                @for (subject of contractSubjectOptions; track subject.value) {
                  <option [value]="subject.value">{{ subject.label }}</option>
                }
              </select>
            </div>

            <div class="fg">
              <label class="fl">{{ t('labels.fields.entity1') }} <span class="req">*</span></label>
              @if (entity1Options.length > 0) {
                <select class="fsel" [(ngModel)]="entity1">
                  <option value="">{{ t('newDocument.chooseEntity') }}</option>
                  @for (opt of entity1Options; track opt) {
                    <option [value]="opt">{{ opt }}</option>
                  }
                </select>
              } @else {
                <input class="fi" [placeholder]="t('labels.placeholders.entity1')" [(ngModel)]="entity1">
              }
            </div>
            <div class="fg">
              <label class="fl">{{ t('labels.fields.entity2') }}</label>
              <input class="fi" [placeholder]="t('labels.placeholders.entity2')" [(ngModel)]="entity2">
            </div>
            <div class="fg">
              <label class="fl">{{ t('labels.fields.counterpartyTaxId') }} <span class="req">*</span></label>
              <input class="fi" [placeholder]="t('labels.placeholders.taxId')" maxlength="15" [(ngModel)]="form.nip">
            </div>
            <div class="fg">
              <label class="fl">{{ t('labels.fields.counterpartyCountry') }} <span class="req">*</span></label>
              <select class="fsel" [(ngModel)]="form.country">
                <option value="">{{ t('labels.options.chooseCountry') }}</option>
                @for (country of countryOptions; track country.value) {
                  <option [value]="country.value">{{ country.label }}</option>
                }
              </select>
            </div>

          </div>

          <!-- Dane kontaktowe ds. umowy -->
          <div class="sec-title" style="margin-top:20px">{{ t('labels.fields.contactSection') }}</div>
          <div class="fgrid">
            <div class="fg full">
              <label class="fl">{{ t('labels.fields.contactName') }}</label>
              <input class="fi" [placeholder]="t('labels.placeholders.contactName')" [(ngModel)]="form.contact_name">
            </div>
            <div class="fg">
              <label class="fl">{{ t('labels.fields.email') }}</label>
              <input class="fi" type="email" [placeholder]="t('labels.placeholders.contactEmail')" [(ngModel)]="form.contact_email">
            </div>
            <div class="fg">
              <label class="fl">{{ t('labels.fields.phone') }}</label>
              <input class="fi" [placeholder]="t('labels.placeholders.contactPhone')" [(ngModel)]="form.contact_phone">
            </div>
          </div>

          <!-- Tags -->
          <div class="sec-title" style="margin-top:20px">{{ t('newDocument.tags.title') }}</div>
          @for (tag of form.tags; track $index) {
            <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
              <input class="fi" style="flex:1" [placeholder]="t('newDocument.tags.keyPlaceholder')" [(ngModel)]="tag.key">
              <button class="btn btn-d btn-sm" (click)="removeTag($index)">✕</button>
            </div>
          }
          <button class="btn btn-g btn-sm" (click)="addTag()" style="margin-bottom:20px">+ {{ t('labels.addTag') }}</button>

          <!-- File Upload -->
          <div class="sec-title">{{ t('newDocument.file.title') }}</div>
          <div class="upz" [class.drag-over]="isDragging"
               (dragover)="$event.preventDefault(); isDragging=true"
               (dragleave)="isDragging=false"
               (drop)="onDrop($event)"
               (click)="fileInput.click()">
            @if (selectedFile) {
              <div style="font-size:14px;font-weight:600;color:var(--gray-800)">📄 {{ selectedFile.name }}</div>
              <div style="font-size:12px;color:var(--gray-400);margin-top:4px">{{ formatSize(selectedFile.size) }}</div>
              <button class="btn btn-g btn-sm" style="margin-top:8px" (click)="$event.stopPropagation();selectedFile=null">{{ t('newDocument.file.remove') }}</button>
            } @else {
              <div style="font-size:24px;margin-bottom:8px">📂</div>
              <div style="font-size:13px;font-weight:600;color:var(--gray-700)">{{ t('newDocument.file.dropHint') }}</div>
              <div style="font-size:12px;color:var(--gray-400);margin-top:4px">{{ t('newDocument.file.formats') }}</div>
            }
          </div>
          <input #fileInput type="file" hidden accept=".pdf,.docx,.doc" (change)="onFileChange($event)">
        </div>

        <div class="pf">
          <button class="btn btn-g" (click)="close.emit()">{{ 'actions.cancel' | transloco }}</button>
          <button class="btn btn-p" [disabled]="!isValid() || saving()" (click)="save()">
            @if (saving()) { <span class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:white;display:inline-block"></span> }
            {{ t('newDocument.create') }}
          </button>
        </div>
      </div>
    </div>
    </ng-container>
  `,
  styles: [`
    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 100; backdrop-filter: blur(2px); display: flex; align-items: flex-start; justify-content: flex-end; }
    .panel { width: 640px; height: 100vh; background: white; box-shadow: var(--shadow-lg); overflow-y: auto; display: flex; flex-direction: column; animation: slideIn .2s ease; }
    .ph { padding: 20px 24px; border-bottom: 1px solid var(--gray-200); display: flex; align-items: flex-start; gap: 12px; background: white; position: sticky; top: 0; z-index: 1; }
    .pt { font-family: 'Sora', sans-serif; font-size: 16px; font-weight: 700; color: var(--gray-900); }
    .ps { font-size: 12px; color: var(--gray-500); margin-top: 3px; }
    .pc { margin-left: auto; cursor: pointer; color: var(--gray-400); padding: 4px; border-radius: 6px; }
    .pc:hover { background: var(--gray-100); color: var(--gray-700); }
    .pb { padding: 24px; flex: 1; }
    .pf { padding: 16px 24px; border-top: 1px solid var(--gray-200); display: flex; gap: 10px; justify-content: flex-end; background: var(--gray-50); position: sticky; bottom: 0; }
  `],
})
export class NewDocumentPanelComponent implements OnInit {
  @Input() groups: GroupProfile[] = [];
  @Output() close   = new EventEmitter<void>();
  @Output() created = new EventEmitter<Document>();

  private docSvc      = inject(DocumentService);
  private toast       = inject(ToastService);
  private settingsSvc = inject(AppSettingsService);
  private crmApi      = inject(CrmApiService);
  private transloco   = inject(TranslocoService);
  private locale      = inject(LocaleService);

  get docTypeOptions(): SelectOption[] {
    const toOption = (value: string): SelectOption => ({
      value,
      label: BUILT_IN_DOC_TYPES.includes(value) ? this.transloco.translate('documents.labels.docTypes.' + value) : value,
    });
    const byLabel = (a: SelectOption, b: SelectOption) => a.label.localeCompare(b.label, this.locale.activeLocale());
    try {
      const raw = this.settingsSvc.settings()?.['doc_types'];
      if (raw) {
        const types: string[] = JSON.parse(String(raw));
        return types.map(toOption).sort(byLabel);
      }
    } catch { }
    return BUILT_IN_DOC_TYPES.map(toOption).sort(byLabel);
  }

  get countryOptions(): SelectOption[] {
    try {
      const raw = this.settingsSvc.settings()?.['crm_partner_countries'];
      if (raw) return (JSON.parse(String(raw)) as string[]).map(value => ({ value, label: value }));
    } catch { }
    return this.fallbackOptions('countries', FALLBACK_COUNTRY_KEYS);
  }

  get contractSubjectOptions(): SelectOption[] {
    try {
      const raw = this.settingsSvc.settings()?.['doc_contract_subjects'];
      if (raw) return (JSON.parse(String(raw)) as string[]).map(value => ({ value, label: value }));
    } catch { }
    return this.fallbackOptions('contractSubjects', FALLBACK_CONTRACT_SUBJECT_KEYS);
  }

  // The stored value of a fallback entry is its name in the source language —
  // documents saved so far hold exactly that text, and one tenant's users may
  // work in different languages. Only the label follows the user's language.
  private fallbackOptions(dictionary: string, keys: string[]): SelectOption[] {
    return keys.map(key => ({
      value: this.transloco.translate(`documents.labels.${dictionary}.${key}`, {}, DEFAULT_LOCALE),
      label: this.transloco.translate(`documents.labels.${dictionary}.${key}`),
    }));
  }

  get entity1Options(): string[] {
    try {
      const raw = this.settingsSvc.settings()?.['doc_entity1_options'];
      if (raw) {
        const parsed = JSON.parse(String(raw));
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { }
    return [];
  }

  get gdprTypeOptions(): SelectOption[] {
    const toOption = (value: string): SelectOption => ({
      value,
      label: BUILT_IN_GDPR_TYPES.includes(value) ? this.transloco.translate('documents.labels.gdprTypes.' + value) : value,
    });
    try {
      const raw = this.settingsSvc.settings()?.['doc_gdpr_types'];
      if (raw) {
        const types: string[] = JSON.parse(String(raw));
        return types.map(toOption);
      }
    } catch { }
    return BUILT_IN_GDPR_TYPES.map(toOption);
  }

  saving       = signal(false);
  isDragging   = false;
  selectedFile: File | null = null;
  entity1 = '';
  entity2 = '';
  ownerId      = '';
  users = signal<any[]>([]);

  ngOnInit(): void {
    this.crmApi.getCrmUsers().subscribe(users => this.users.set(users));
  }

  form: {
    name: string; doc_type: DocType | ''; gdpr_type: GdprType | '';
    group_id: string; signing_date: string; expiration_date: string;
    expiration_date_mode: 'indefinite' | 'fixed';
    nip: string; country: string; contract_subject: string;
    contact_name: string; contact_email: string; contact_phone: string;
    entities: string[];
    tags: { key: string; value: string }[];
  } = {
    name: '', doc_type: '', gdpr_type: '', group_id: '',
    signing_date: '', expiration_date: '',
    expiration_date_mode: 'indefinite',
    nip: '', country: '', contract_subject: '',
    contact_name: '', contact_email: '', contact_phone: '',
    entities: [], tags: [],
  };

  isValid(): boolean {
    return !!(
      this.form.name.trim() && this.form.doc_type && this.form.gdpr_type &&
      this.form.group_id && this.entity1.trim() &&
      this.form.nip.trim() && this.form.country && this.form.contract_subject
    );
  }

  onExpDateModeChange(): void {
    if (this.form.expiration_date_mode === 'indefinite') {
      this.form.expiration_date = '';
    }
  }

  addTag(): void    { this.form.tags.push({ key: '', value: '' }); }
  removeTag(i: number): void { this.form.tags.splice(i, 1); }

  onFileChange(e: Event): void {
    this.selectedFile = (e.target as HTMLInputElement).files?.[0] ?? null;
  }
  onDrop(e: DragEvent): void {
    e.preventDefault(); this.isDragging = false;
    this.selectedFile = e.dataTransfer?.files[0] ?? null;
  }
  formatSize(b: number): string {
    return b < 1024 * 1024 ? `${(b/1024).toFixed(1)} KB` : `${(b/1024/1024).toFixed(1)} MB`;
  }

  onOverlay(e: Event): void {
    if ((e.target as HTMLElement).classList.contains('overlay')) this.close.emit();
  }

  save(): void {
    if (!this.isValid()) return;
    this.saving.set(true);
    this.docSvc.create({
      name:             this.form.name,
      doc_type:         this.form.doc_type as DocType,
      gdpr_type:        this.form.gdpr_type as GdprType,
      group_id:         this.form.group_id,
      entities:         [this.entity1, this.entity2].filter(s => !!s.trim()).map(s => s.trim()),
      signing_date:     this.form.signing_date || undefined,
      expiration_date:  this.form.expiration_date_mode === 'fixed' ? (this.form.expiration_date || undefined) : undefined,
      nip:              this.form.nip.trim() || undefined,
      country:          this.form.country || undefined,
      contract_subject: this.form.contract_subject,
      contact_name:     this.form.contact_name.trim() || undefined,
      contact_email:    this.form.contact_email.trim() || undefined,
      contact_phone:    this.form.contact_phone.trim() || undefined,
      tags:             this.form.tags.filter(t => t.key).map(t => ({ key: t.key, value: '' })),
      owner_id:         this.ownerId || undefined,
      file:             this.selectedFile ?? undefined,
    }).subscribe({
      next: doc => { this.saving.set(false); this.created.emit(doc); },
      error: () => { this.saving.set(false); this.toast.error(this.transloco.translate('documents.newDocument.createFailed')); },
    });
  }
}
