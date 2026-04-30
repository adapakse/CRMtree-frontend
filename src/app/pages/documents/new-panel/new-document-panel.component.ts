import { Component, inject, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DocumentService } from '@core/services/document.service';
import { GroupProfile, Document, DocType, GdprType } from '@core/models/models';
import { ToastService } from '@core/services/toast.service';
import { AppSettingsService } from '@core/services/app-settings.service';

@Component({
  selector: 'wt-new-document-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="overlay open" (click)="onOverlay($event)">
      <div class="panel" (click)="$event.stopPropagation()">

        <div class="ph">
          <div>
            <div class="pt">New Document</div>
            <div class="ps">Fill in metadata and optionally attach a file</div>
          </div>
          <div class="pc" (click)="close.emit()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </div>
        </div>

        <div class="pb">
          <div class="sec-title">Basic Information</div>
          <div class="fgrid">

            <div class="fg full">
              <label class="fl">Document Name <span class="req">*</span></label>
              <input class="fi" placeholder="e.g. Partner Agreement — ABC Sp. z o.o." [(ngModel)]="form.name">
            </div>

            <div class="fg">
              <label class="fl">Document Type <span class="req">*</span></label>
              <select class="fsel" [(ngModel)]="form.doc_type">
                <option value="">— Select type —</option>
                @for (t of docTypeOptions; track t.value) {
                  <option [value]="t.value">{{ t.label }}</option>
                }
              </select>
            </div>

            <div class="fg">
              <label class="fl">GDPR Classification <span class="req">*</span></label>
              <select class="fsel" [(ngModel)]="form.gdpr_type">
                <option value="">— Select GDPR —</option>
                @for (t of gdprTypeOptions; track t.value) {
                  <option [value]="t.value">{{ t.label }}</option>
                }
              </select>
            </div>

            <div class="fg">
              <label class="fl">Group <span class="req">*</span></label>
              <select class="fsel" [(ngModel)]="form.group_id">
                <option value="">— Select group —</option>
                @for (g of groups; track g.id) {
                  <option [value]="g.id">{{ g.display_name }}</option>
                }
              </select>
            </div>

            <div class="fg">
              <label class="fl">Signing Date</label>
              <input class="fi" type="date" [(ngModel)]="form.signing_date">
            </div>
            <div class="fg">
              <label class="fl">Expiration Date</label>
              <select class="fsel" [(ngModel)]="form.expiration_date_mode" (ngModelChange)="onExpDateModeChange()">
                <option value="indefinite">Czas nieokreślony</option>
                <option value="fixed">Data określona</option>
              </select>
              <input *ngIf="form.expiration_date_mode==='fixed'" class="fi" type="date" [(ngModel)]="form.expiration_date" style="margin-top:6px">
            </div>

            <div class="fg">
              <label class="fl">Przedmiot umowy <span class="req">*</span></label>
              <select class="fsel" [(ngModel)]="form.contract_subject">
                <option value="">— Wybierz —</option>
                @for (s of contractSubjectOptions; track s) {
                  <option [value]="s">{{ s }}</option>
                }
              </select>
            </div>

            <div class="fg">
              <label class="fl">Entity 1 <span class="req">*</span></label>
              @if (entity1Options.length > 0) {
                <select class="fsel" [(ngModel)]="entity1">
                  <option value="">— Wybierz podmiot —</option>
                  @for (opt of entity1Options; track opt) {
                    <option [value]="opt">{{ opt }}</option>
                  }
                </select>
              } @else {
                <input class="fi" placeholder="np. CRMtree Sp. z o.o." [(ngModel)]="entity1">
              }
            </div>
            <div class="fg">
              <label class="fl">Entity 2</label>
              <input class="fi" placeholder="np. Partner Ltd." [(ngModel)]="entity2">
            </div>
            <div class="fg">
              <label class="fl">NIP kontrahenta <span class="req">*</span></label>
              <input class="fi" placeholder="np. 1234567890" maxlength="15" [(ngModel)]="form.nip">
            </div>
            <div class="fg">
              <label class="fl">Kraj kontrahenta <span class="req">*</span></label>
              <select class="fsel" [(ngModel)]="form.country">
                <option value="">— Wybierz kraj —</option>
                @for (k of countryOptions; track k) {
                  <option [value]="k">{{ k }}</option>
                }
              </select>
            </div>

          </div>

          <!-- Dane kontaktowe ds. umowy -->
          <div class="sec-title" style="margin-top:20px">Dane kontaktowe ds. umowy</div>
          <div class="fgrid">
            <div class="fg full">
              <label class="fl">Imię i Nazwisko</label>
              <input class="fi" placeholder="np. Jan Kowalski" [(ngModel)]="form.contact_name">
            </div>
            <div class="fg">
              <label class="fl">Email</label>
              <input class="fi" type="email" placeholder="np. jan.kowalski@firma.pl" [(ngModel)]="form.contact_email">
            </div>
            <div class="fg">
              <label class="fl">Telefon</label>
              <input class="fi" placeholder="np. +48 600 000 000" [(ngModel)]="form.contact_phone">
            </div>
          </div>

          <!-- Tags -->
          <div class="sec-title" style="margin-top:20px">Tags (optional)</div>
          @for (tag of form.tags; track $index) {
            <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
              <input class="fi" style="flex:1" placeholder="key" [(ngModel)]="tag.key">
              <input class="fi" style="flex:2" placeholder="value" [(ngModel)]="tag.value">
              <button class="btn btn-d btn-sm" (click)="removeTag($index)">✕</button>
            </div>
          }
          <button class="btn btn-g btn-sm" (click)="addTag()" style="margin-bottom:20px">+ Add Tag</button>

          <!-- File Upload -->
          <div class="sec-title">File Attachment (optional)</div>
          <div class="upz" [class.drag-over]="isDragging"
               (dragover)="$event.preventDefault(); isDragging=true"
               (dragleave)="isDragging=false"
               (drop)="onDrop($event)"
               (click)="fileInput.click()">
            @if (selectedFile) {
              <div style="font-size:14px;font-weight:600;color:var(--gray-800)">📄 {{ selectedFile.name }}</div>
              <div style="font-size:12px;color:var(--gray-400);margin-top:4px">{{ formatSize(selectedFile.size) }}</div>
              <button class="btn btn-g btn-sm" style="margin-top:8px" (click)="$event.stopPropagation();selectedFile=null">Remove</button>
            } @else {
              <div style="font-size:24px;margin-bottom:8px">📂</div>
              <div style="font-size:13px;font-weight:600;color:var(--gray-700)">Drop file here or click to browse</div>
              <div style="font-size:12px;color:var(--gray-400);margin-top:4px">PDF, DOCX — max 50 MB</div>
            }
          </div>
          <input #fileInput type="file" hidden accept=".pdf,.docx,.doc" (change)="onFileChange($event)">
        </div>

        <div class="pf">
          <button class="btn btn-g" (click)="close.emit()">Cancel</button>
          <button class="btn btn-p" [disabled]="!isValid() || saving()" (click)="save()">
            @if (saving()) { <span class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:white;display:inline-block"></span> }
            Create Document
          </button>
        </div>
      </div>
    </div>
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
export class NewDocumentPanelComponent {
  @Input() groups: GroupProfile[] = [];
  @Output() close   = new EventEmitter<void>();
  @Output() created = new EventEmitter<Document>();

  private docSvc      = inject(DocumentService);
  private toast       = inject(ToastService);
  private settingsSvc = inject(AppSettingsService);

  get docTypeOptions(): { value: string; label: string }[] {
    const DOC_LABELS: Record<string, string> = {
      partner_agreement:    'Umowa partnerska',
      it_supplier_agreement:'Umowa z dostawcą IT',
      employee_agreement:   'Umowa pracownicza',
      nda:                  'NDA',
      operator_agreement:   'Umowa operatorska',
    };
    try {
      const raw = this.settingsSvc.settings()?.['doc_types'];
      if (raw) {
        const types: string[] = JSON.parse(String(raw));
        return types
          .map(v => ({ value: v, label: DOC_LABELS[v] ?? v }))
          .sort((a, b) => a.label.localeCompare(b.label, 'pl'));
      }
    } catch { }
    return Object.entries(DOC_LABELS)
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pl'));
  }

  get countryOptions(): string[] {
    try {
      const raw = this.settingsSvc.settings()?.['crm_partner_countries'];
      if (raw) return JSON.parse(String(raw));
    } catch { }
    return ['Polska','Niemcy','Francja','Wielka Brytania','Czechy','Słowacja',
            'Węgry','Rumunia','Ukraina','Rosja','Austria','Szwajcaria'];
  }

  get contractSubjectOptions(): string[] {
    try {
      const raw = this.settingsSvc.settings()?.['doc_contract_subjects'];
      if (raw) return JSON.parse(String(raw));
    } catch { }
    return ['Podróże służbowe','Konferencje/Spotkania','Zakwaterowanie','System','Inne'];
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

  get gdprTypeOptions(): { value: string; label: string }[] {
    const GDPR_LABELS: Record<string, string> = {
      data_processing_entrustment: 'Powierzenie przetwarzania danych',
      data_administration: 'Współadministrowanie danych',
      no_gdpr: 'Brak GDPR',
    };
    try {
      const raw = this.settingsSvc.settings()?.['doc_gdpr_types'];
      if (raw) {
        const types: string[] = JSON.parse(String(raw));
        return types.map(v => ({ value: v, label: GDPR_LABELS[v] ?? v }));
      }
    } catch { }
    return Object.entries(GDPR_LABELS).map(([value, label]) => ({ value, label }));
  }

  saving       = signal(false);
  isDragging   = false;
  selectedFile: File | null = null;
  entity1 = '';
  entity2 = '';

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
      tags:             this.form.tags.filter(t => t.key && t.value),
      file:             this.selectedFile ?? undefined,
    }).subscribe({
      next: doc => { this.saving.set(false); this.created.emit(doc); },
      error: () => { this.saving.set(false); this.toast.error('Failed to create document'); },
    });
  }
}
