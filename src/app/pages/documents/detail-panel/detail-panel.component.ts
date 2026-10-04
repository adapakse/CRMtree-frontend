import { Component, inject, Input, Output, EventEmitter, OnChanges, OnInit, signal, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { Document, WorkflowTask, DocumentVersion, User, DocStatus, DocType, GdprType } from '../../../core/models/models';
import { DocumentService } from '../../../core/services/document.service';
import { WorkflowService, GroupService, UserService } from '../../../core/services/api.services';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { AppSettingsService } from '../../../core/services/app-settings.service';
import { StatusBadgeComponent, TypeBadgeComponent, GdprBadgeComponent, GroupPillComponent, TaskBadgeComponent, AvatarComponent } from '../../../shared/components/badges.components';
import { TooltipComponent } from '../../../shared/components/tooltip/tooltip.component';
import { fileSizeLabel, triggerDownload } from '../../../core/services/helpers';
import { environment } from '../../../../environments/environment';
import { CrmApiService } from '../../../core/services/crm-api.service';
import { LocaleService } from '../../../core/i18n/locale.service';
import { DEFAULT_LOCALE } from '../../../core/i18n/locales';

// Built-in values have translated names; any other value comes from App
// Settings and is its own display name.
const BUILT_IN_DOC_TYPES = ['partner_agreement', 'it_supplier_agreement', 'employee_agreement', 'nda', 'operator_agreement'];
const BUILT_IN_GDPR_TYPES = ['data_processing_entrustment', 'data_administration', 'no_gdpr'];
const BUILT_IN_STATUSES = ['new', 'being_edited', 'being_approved', 'being_signed', 'signed', 'hold', 'completed', 'rejected'];

// Dictionaries offered when the tenant has not configured its own
// (keys under documents.labels.countries / documents.labels.contractSubjects).
const FALLBACK_COUNTRY_KEYS = ['pl', 'de', 'fr', 'gb', 'cz', 'sk', 'hu', 'ro', 'ua', 'ru', 'at', 'ch'];
const FALLBACK_CONTRACT_SUBJECT_KEYS = ['businessTravel', 'conferences', 'accommodation', 'system', 'other'];

// Audit actions that have a translated description (documents.detail.history.actions.*).
const DESCRIBED_HISTORY_ACTIONS = new Set([
  'document_created', 'document_updated', 'document_deleted', 'document_downloaded', 'metadata_updated',
  'tag_added', 'tag_removed', 'tag_updated', 'status_changed', 'version_uploaded',
  'workflow_task_created', 'workflow_task_completed', 'workflow_task_cancelled',
  'signing_initiated', 'signing_completed', 'signing_failed',
  'attachment_uploaded', 'attachment_version_uploaded', 'attachment_deleted',
]);

interface SelectOption { value: string; label: string; }

@Component({
  selector: 'wt-detail-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusBadgeComponent, TypeBadgeComponent, GdprBadgeComponent, GroupPillComponent, TaskBadgeComponent, AvatarComponent, TooltipComponent, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('documents')],
  template: `
    <ng-container *transloco="let t; prefix: 'documents'">
    <div class="overlay open" (click)="onOverlayClick($event)">
      <div class="panel" (click)="$event.stopPropagation()">

        <!-- Panel Header -->
        <div class="ph">
          <div>
            <div class="pt">{{ doc.name }}</div>
            <div class="ps">{{ doc.doc_number }} · <wt-status-badge [status]="doc.status" /></div>
          </div>
          <div class="pc" (click)="close.emit()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </div>
        </div>

        <!-- Tabs -->
        <div style="padding:16px 24px 0">
          <div class="tabs">
            @for (tab of tabs; track tab.id) {
              <button class="tab-btn" [class.active]="activeTab === tab.id" (click)="activeTab = tab.id">
                {{ t(tab.labelKey) }}<wt-tooltip [key]="tab.tooltip"></wt-tooltip>
              </button>
            }
          </div>
        </div>

        <!-- Tab Content -->
        <div class="pb">

          <!-- OVERVIEW -->
          @if (activeTab === 'overview') {
            <div class="sec-title">{{ t('detail.overview.metadata') }}</div>
            <div class="fgrid">
              <div class="fg">
                <label class="fl">{{ t('labels.fields.documentName') }} <span class="req">*</span></label>
                <input class="fi" [(ngModel)]="draft.name" [readOnly]="doc._access !== 'full'">
              </div>
              <div class="fg">
                <label class="fl">{{ t('labels.fields.status') }}</label>
                @if (doc._access === 'full') {
                  <select class="fsel" [(ngModel)]="draft.status">
                    @for (option of docStatusOptions; track option.value) {
                      <option [value]="option.value">{{ option.label }}</option>
                    }
                  </select>
                } @else {
                  <wt-status-badge [status]="doc.status" />
                }
              </div>
              <div class="fg">
                <label class="fl">{{ t('labels.fields.documentType') }}</label>
                @if (doc._access === 'full') {
                  <select class="fsel" [(ngModel)]="draft.doc_type">
                    <option value="">{{ t('detail.overview.chooseType') }}</option>
                    @for (option of docTypeOptions; track option.value) {
                      <option [value]="option.value">{{ option.label }}</option>
                    }
                  </select>
                } @else {
                  <div class="fi" style="background:var(--gray-100);color:var(--gray-600)">{{ docTypeLabel }}</div>
                }
              </div>
              <div class="fg">
                <label class="fl">{{ t('labels.fields.gdprClassification') }}</label>
                @if (doc._access === 'full') {
                  <select class="fsel" [(ngModel)]="draft.gdpr_type">
                    @for (option of gdprTypeOptions; track option.value) {
                      <option [value]="option.value">{{ option.label }}</option>
                    }
                  </select>
                } @else {
                  <div style="padding-top:6px"><wt-gdpr-badge [gdpr]="doc.gdpr_type" /></div>
                }
              </div>
              <div class="fg">
                <label class="fl">{{ t('labels.fields.group') }}</label>
                @if (doc._access === 'full') {
                  <select class="fsel" [(ngModel)]="draft.group_id">
                    @for (g of groups(); track g.id) {
                      <option [value]="g.id">{{ g.display_name ?? g.name }}</option>
                    }
                  </select>
                } @else {
                  <div class="fi" style="background:var(--gray-100);color:var(--gray-600)">{{ doc.group_display ?? doc.group_name }}</div>
                }
              </div>
              <div class="fg">
                <label class="fl">{{ t('labels.fields.owner') }}</label>
                @if (doc._access === 'full') {
                  <select class="fsel" [(ngModel)]="draft.owner_id">
                    <option value="">{{ t('labels.options.unassigned') }}</option>
                    @for (u of users(); track u.id) {
                      <option [value]="u.id">{{ u.display_name }}</option>
                    }
                  </select>
                } @else {
                  <div style="display:flex;align-items:center;gap:8px;padding-top:4px">
                    <wt-avatar [name]="doc.owner_name ?? ''" [size]="28" />
                    <span style="font-size:13px">{{ doc.owner_name }}</span>
                  </div>
                }
              </div>
              <div class="fg">
                <label class="fl">{{ t('labels.fields.entity1') }}</label>
                @if (doc._access === 'full') {
                  @if (entity1Options.length > 0) {
                  <select class="fsel" [(ngModel)]="draft.entity1">
                    <option value="">{{ t('detail.overview.chooseEntity') }}</option>
                    @for (opt of entity1Options; track opt) {
                      <option [value]="opt">{{ opt }}</option>
                    }
                  </select>
                } @else {
                  <input class="fi" [(ngModel)]="draft.entity1" [placeholder]="t('labels.placeholders.entity1')">
                }
                } @else {
                  <div class="fi" style="background:var(--gray-100);color:var(--gray-600)">{{ draft.entity1 || '—' }}</div>
                }
              </div>
              <div class="fg">
                <label class="fl">{{ t('labels.fields.entity2') }}</label>
                <input class="fi" [(ngModel)]="draft.entity2"
                       [readOnly]="doc._access !== 'full'" [placeholder]="t('labels.placeholders.entity2')">
              </div>
              <div class="fg">
                <label class="fl">{{ t('labels.fields.signingDate') }}</label>
                <input class="fi" type="date" [(ngModel)]="draft.signing_date"
                       [readOnly]="doc._access !== 'full'"
                       [style.background]="doc._access !== 'full' ? 'var(--gray-100)' : ''">
              </div>
              <div class="fg">
                <label class="fl">{{ t('labels.fields.expirationDate') }}</label>
                @if (doc._access === 'full') {
                  <select class="fsel" [(ngModel)]="draft.expiration_date_mode" (ngModelChange)="onExpDateModeChange()">
                    <option value="indefinite">{{ t('labels.options.indefinite') }}</option>
                    <option value="fixed">{{ t('labels.options.fixedDate') }}</option>
                  </select>
                  @if (draft.expiration_date_mode === 'fixed') {
                    <input class="fi" type="date" [(ngModel)]="draft.expiration_date" style="margin-top:6px">
                  }
                } @else {
                  <div class="fi" style="background:var(--gray-100);color:var(--gray-600)">
                    {{ draft.expiration_date ? (draft.expiration_date | date:'dd.MM.yyyy') : t('labels.options.indefinite') }}
                  </div>
                }
              </div>
              <div class="fg">
                <label class="fl">{{ t('labels.fields.contractSubject') }} <span class="req">*</span></label>
                @if (doc._access === 'full') {
                  <select class="fsel" [(ngModel)]="draft.contract_subject">
                    <option value="">{{ t('labels.options.choose') }}</option>
                    @for (subject of contractSubjectOptions; track subject.value) {
                      <option [value]="subject.value">{{ subject.label }}</option>
                    }
                  </select>
                } @else {
                  <div class="fi" style="background:var(--gray-100);color:var(--gray-600)">{{ optionLabel(contractSubjectOptions, draft.contract_subject) || '—' }}</div>
                }
              </div>
              <div class="fg">
                <label class="fl">{{ t('labels.fields.counterpartyTaxId') }}</label>
                <input class="fi" [(ngModel)]="draft.nip" maxlength="15"
                       [readOnly]="doc._access !== 'full'"
                       [style.background]="doc._access !== 'full' ? 'var(--gray-100)' : ''"
                       [placeholder]="t('labels.placeholders.taxId')">
              </div>
              <div class="fg">
                <label class="fl">{{ t('labels.fields.counterpartyCountry') }}</label>
                @if (doc._access === 'full') {
                  <select class="fsel" [(ngModel)]="draft.country">
                    <option value="">{{ t('labels.options.chooseCountry') }}</option>
                    @for (country of countryOptions; track country.value) {
                      <option [value]="country.value">{{ country.label }}</option>
                    }
                  </select>
                } @else {
                  <div class="fi" style="background:var(--gray-100);color:var(--gray-600)">{{ optionLabel(countryOptions, draft.country) || '—' }}</div>
                }
              </div>
            </div>

            <!-- Dane kontaktowe ds. umowy -->
            <div class="sec-title" style="margin-top:20px">{{ t('labels.fields.contactSection') }}</div>
            <div class="fgrid">
              <div class="fg full">
                <label class="fl">{{ t('labels.fields.contactName') }}</label>
                <input class="fi" [(ngModel)]="draft.contact_name"
                       [readOnly]="doc._access !== 'full'"
                       [style.background]="doc._access !== 'full' ? 'var(--gray-100)' : ''"
                       [placeholder]="t('labels.placeholders.contactName')">
              </div>
              <div class="fg">
                <label class="fl">{{ t('labels.fields.email') }}</label>
                <input class="fi" type="email" [(ngModel)]="draft.contact_email"
                       [readOnly]="doc._access !== 'full'"
                       [style.background]="doc._access !== 'full' ? 'var(--gray-100)' : ''"
                       [placeholder]="t('labels.placeholders.contactEmail')">
              </div>
              <div class="fg">
                <label class="fl">{{ t('labels.fields.phone') }}</label>
                <input class="fi" [(ngModel)]="draft.contact_phone"
                       [readOnly]="doc._access !== 'full'"
                       [style.background]="doc._access !== 'full' ? 'var(--gray-100)' : ''"
                       [placeholder]="t('labels.placeholders.contactPhone')">
              </div>
            </div>

            <!-- Tags -->
            <div class="sec-title" style="margin-top:20px">{{ t('detail.tags.title') }}</div>
            @if (tags.length > 0) {
              <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:13px">
                <thead>
                  <tr style="background:var(--gray-50);border-bottom:1px solid var(--gray-200)">
                    <th style="text-align:left;padding:6px 10px;font-weight:600;color:var(--gray-500);font-size:11px;text-transform:uppercase">{{ t('detail.tags.key') }}</th>
                    @if (doc._access === 'full') {
                      <th style="width:36px"></th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (tag of tags; track tag.id) {
                    <tr style="border-bottom:1px solid var(--gray-100)">
                      <td style="padding:7px 10px;color:var(--gray-700);font-weight:600">{{ tag.key }}</td>
                      @if (doc._access === 'full') {
                        <td style="padding:7px 6px;text-align:center">
                          <span style="cursor:pointer;color:var(--gray-400);font-size:16px;line-height:1" (click)="deleteTag(tag.id)">&times;</span>
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <div style="font-size:12.5px;color:var(--gray-400);margin-bottom:12px">{{ t('detail.tags.empty') }}</div>
            }
            @if (doc._access === 'full') {
              <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
                <input class="fi" style="flex:1;min-width:0;padding:6px 10px;font-size:13px" [placeholder]="t('detail.tags.keyPlaceholder')" [(ngModel)]="newTagKey">
                <button class="btn btn-g btn-sm" style="white-space:nowrap" (click)="addTag()">+ {{ t('labels.addTag') }}</button>
              </div>
            }

            <!-- Powiązani Partnerzy -->
            <div class="sec-title" style="margin-top:20px">{{ t('detail.partners.title') }}</div>
            @if (linkedPartnersLoading) {
              <div style="font-size:12px;color:var(--gray-400)">{{ 'states.loading' | transloco }}</div>
            } @else {
              @if (linkedPartners().length > 0) {
                <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">
                  @for (p of linkedPartners(); track p.id) {
                    <div style="display:flex;align-items:center;gap:8px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;padding:8px 12px">
                      <span style="font-size:14px">🤝</span>
                      <span style="font-size:13px;font-weight:600;flex:1">{{ p.company }}</span>
                      @if (doc._access === 'full') {
                        <button style="background:none;border:none;color:var(--gray-400);cursor:pointer;font-size:14px;line-height:1" (click)="unlinkPartner(p)" [title]="t('detail.partners.unlink')">✕</button>
                      }
                    </div>
                  }
                </div>
              } @else {
                <div style="font-size:12.5px;color:var(--gray-400);margin-bottom:8px">{{ t('detail.partners.empty') }}</div>
              }
              @if (doc._access === 'full') {
                <div style="position:relative;margin-bottom:12px">
                  <input class="fi" style="width:100%;box-sizing:border-box;padding:6px 10px;font-size:13px"
                         [placeholder]="t('detail.partners.searchPlaceholder')"
                         [(ngModel)]="partnerSearch"
                         (ngModelChange)="onPartnerSearch($event)"
                         (blur)="hidePartnerDropdown()">
                  @if (partnerDropdown().length > 0) {
                    <div style="position:absolute;top:100%;left:0;right:0;background:white;border:1px solid var(--gray-200);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:50;max-height:200px;overflow-y:auto;margin-top:2px">
                      @for (p of partnerDropdown(); track p.id) {
                        <div style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--gray-100)"
                             (mousedown)="linkPartner(p)">
                          <div style="font-weight:500;font-size:13px">{{ p.company }}</div>
                          @if (p.nip) { <div style="font-size:11px;color:var(--gray-400)">{{ t('detail.partners.taxId', { nip: p.nip }) }}</div> }
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            }

            @if (doc.document_group_name) {
              <div style="background:var(--orange-pale);border:1px solid var(--orange-muted);border-radius:8px;padding:10px 14px;font-size:12.5px;color:var(--orange-dark)">
                📎 {{ t('detail.overview.packagePart') }} <strong>{{ doc.document_group_name }}</strong>
              </div>
            }
          }

          <!-- DOKUMENT GŁÓWNY -->
          @if (activeTab === 'preview') {
            @if (doc.blob_name) {
              @if (!isPdf) {
                <div class="empty-state">
                  <div class="empty-icon">📄</div>
                  <div class="empty-title">{{ t('detail.preview.unavailable') }}</div>
                  <div style="font-size:12.5px;color:var(--gray-400);margin-top:6px;text-align:center;max-width:320px">
                    {{ t('detail.preview.unavailableFormat') }}<br>{{ t('detail.preview.unavailableHint') }}
                  </div>
                  <button class="btn btn-g" style="margin-top:14px" (click)="downloadDoc()">⬇ {{ t('detail.preview.downloadFile') }}</button>
                </div>
              } @else {
                <div style="background:var(--gray-100);border-radius:8px;overflow:hidden;height:600px;position:relative">
                  @if (previewLoading()) {
                    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--gray-100)">
                      <div class="spinner"></div>
                    </div>
                  }
                  @if (previewError()) {
                    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--gray-500)">
                      <span style="font-size:32px">⚠️</span>
                      <span style="font-size:13px">{{ previewError() }}</span>
                    </div>
                  }
                  @if (previewBlobUrl()) {
                    <iframe [src]="previewBlobUrl()!" style="width:100%;height:100%;border:none" [title]="t('detail.preview.frameTitle')"></iframe>
                  }
                </div>
              }
            } @else {
              <div class="empty-state">
                <div class="empty-icon">📎</div>
                <div class="empty-title">{{ t('detail.preview.noFile') }}</div>
                @if (doc._access === 'full') {
                  <label class="btn btn-p" style="margin-top:12px;cursor:pointer">
                    {{ t('detail.preview.uploadFile') }}
                    <input type="file" hidden accept=".pdf,.docx,.doc" (change)="uploadFile($event)">
                  </label>
                }
              </div>
            }
          }

          <!-- VERSIONS -->
          @if (activeTab === 'versions') {
            @if (doc._access === 'full' && doc.blob_name) {
              <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
                <label class="btn btn-p btn-sm" style="cursor:pointer">
                  &#11014; {{ t('detail.versions.uploadNew') }}
                  <input type="file" hidden accept=".pdf,.docx,.doc" (change)="uploadNewVersion($event)">
                </label>
              </div>
            }
            @for (v of doc.versions ?? []; track v.id) {
              <div class="vrow">
                <div class="vico" [class.signed]="v.is_signed">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                </div>
                <div style="flex:1">
                  <div style="font-size:13px;font-weight:600;color:var(--gray-900)">v{{ v.version_number }} · {{ v.label }}</div>
                  <div style="font-size:11.5px;color:var(--gray-400)">
                    {{ v.created_at | date:'dd.MM.yyyy HH:mm' }}
                    @if (v.signatory_name) { · {{ t('detail.versions.signedBy', { name: v.signatory_name }) }} }
                    @if (v.blob_size_bytes) { · {{ formatSize(v.blob_size_bytes) }} }
                  </div>
                </div>
                <button class="btn btn-g btn-sm" (click)="downloadVersion(v)">⬇ {{ t('detail.actions.download') }}</button>
              </div>
            }
            @empty {
              <div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">{{ t('detail.versions.empty') }}</div></div>
            }
          }

          <!-- ATTACHMENTS -->
          @if (activeTab === 'attachments') {
            @if (doc._access === 'full') {
              <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
                <label class="btn btn-p btn-sm" style="cursor:pointer">
                  &#11014; {{ t('detail.attachments.add') }}
                  <input type="file" hidden (change)="uploadAttachment($event)">
                </label>
              </div>
            }
            @for (att of attachments(); track att.id) {
              <div style="border:1px solid var(--gray-200);border-radius:8px;margin-bottom:12px;overflow:hidden">
                <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--gray-50)">
                  <span style="font-size:18px">&#128206;</span>
                  <div style="flex:1">
                    <div style="font-size:13px;font-weight:600;color:var(--gray-900)">{{ att.name }}</div>
                    <div style="font-size:11.5px;color:var(--gray-400)">
                      {{ t('detail.attachments.versionCount', { count: att.versions?.length ?? 0 }) }} &middot; {{ att.mime_type }}
                      @if (att.blob_size_bytes) { &middot; {{ formatSize(att.blob_size_bytes) }} }
                    </div>
                  </div>
                  <button class="btn btn-g btn-sm" (click)="downloadAttachment(att)">&#11015; {{ t('detail.actions.download') }}</button>
                  @if (doc._access === 'full') {
                    <label class="btn btn-g btn-sm" style="cursor:pointer">
                      &#11014; {{ t('detail.attachments.newVersion') }}
                      <input type="file" hidden (change)="uploadAttachmentVersion($event, att.id)">
                    </label>
                    <button class="btn btn-d btn-sm" (click)="deleteAttachment(att.id)">&#10005;</button>
                  }
                </div>
                @if (att.versions?.length > 1) {
                  <div style="padding:8px 14px;border-top:1px solid var(--gray-100)">
                    <div style="font-size:11px;font-weight:600;color:var(--gray-400);text-transform:uppercase;margin-bottom:6px">{{ t('detail.tabs.versions') }}</div>
                    @for (ver of att.versions; track ver.id) {
                      <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--gray-100);font-size:12px">
                        <span style="color:var(--gray-500);min-width:24px">v{{ ver.version_number }}</span>
                        <span style="flex:1;color:var(--gray-700)">{{ ver.label }}</span>
                        <span style="color:var(--gray-400)">{{ ver.created_at | date:'dd.MM.yyyy HH:mm' }}</span>
                        @if (ver.blob_size_bytes) { <span style="color:var(--gray-400)">{{ formatSize(ver.blob_size_bytes) }}</span> }
                        <button class="btn btn-g btn-sm" style="padding:2px 8px;font-size:11px" (click)="downloadAttachmentVersion(att, ver)">&#11015;</button>
                      </div>
                    }
                  </div>
                }
              </div>
            }
            @empty {
              <div class="empty-state">
                <div class="empty-icon">&#128206;</div>
                <div class="empty-title">{{ t('detail.attachments.empty') }}</div>
                @if (doc._access === 'full') {
                  <label class="btn btn-p" style="margin-top:12px;cursor:pointer">
                    {{ t('detail.attachments.addFirst') }}
                    <input type="file" hidden (change)="uploadAttachment($event)">
                  </label>
                }
              </div>
            }
          }

          <!-- HISTORY TIMELINE -->
          @if (activeTab === 'history') {
            @if (history().length === 0) {
              <div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">{{ t('detail.history.empty') }}</div></div>
            } @else {
              <ul class="tl">
                @for (entry of history(); track entry.id) {
                  <li class="tli">
                    <div class="tdot dot-w">{{ historyIcon(entry.action) }}</div>
                    <div>
                      <div class="tlt">{{ historyLabel(entry) }}</div>
                      <div class="tlm">
                        {{ entry.created_at | date:'dd.MM.yyyy HH:mm' }}
                        @if (entry.user_name) { · {{ entry.user_name }} }
                      </div>
                    </div>
                  </li>
                }
              </ul>
            }
          }

          <!-- WORKFLOW -->
          @if (activeTab === 'workflow') {
            @if (doc._access === 'full') {
              <div class="sec-title">{{ t('detail.workflow.assignTitle') }}</div>
              <div class="fgrid">
                <div class="fg">
                  <label class="fl">{{ t('detail.workflow.assignTo') }} <span class="req">*</span></label>
                  <div style="position:relative">
                    <input class="fi" style="width:100%;box-sizing:border-box"
                           [placeholder]="t('detail.workflow.userSearchPlaceholder')"
                           [(ngModel)]="wf.assignSearch"
                           (ngModelChange)="onUserSearch($event)"
                           (blur)="hideDropdown()">
                    @if (userDropdown().length > 0) {
                      <div class="udrop">
                        @for (u of userDropdown(); track u.id) {
                          <div class="udrop-item" (mousedown)="selectUser(u)">
                            <div style="font-weight:500;font-size:13px">{{ u.display_name }}</div>
                            <div style="font-size:11px;color:var(--gray-400)">{{ u.email }}</div>
                          </div>
                        }
                      </div>
                    }
                    @if (wf.assignTo) {
                      <div style="margin-top:4px;font-size:12px;color:var(--orange);font-weight:500">
                        {{ t('detail.workflow.selected', { name: wf.assignToName }) }}
                      </div>
                    }
                  </div>
                </div>
                <div class="fg">
                  <label class="fl">{{ t('detail.workflow.taskType') }} <span class="req">*</span></label>
                  <select class="fsel" [(ngModel)]="wf.taskType">
                    <option value="read">{{ t('labels.taskTypes.read') }}</option>
                    <option value="edit">{{ t('labels.taskTypes.edit') }}</option>
                    <option value="approve">{{ t('labels.taskTypes.approve') }}</option>
                    <option value="sign">{{ t('labels.taskTypes.sign') }}</option>
                  </select>
                </div>
                <div class="fg">
                  <label class="fl">{{ t('detail.workflow.dueDate') }}</label>
                  <input class="fi" type="date" [(ngModel)]="wf.dueDate">
                </div>
                <div class="fg full">
                  <label class="fl">{{ t('detail.workflow.message') }}</label>
                  <textarea class="fta" [placeholder]="t('detail.workflow.messagePlaceholder')" [(ngModel)]="wf.message"></textarea>
                </div>
              </div>
              <button class="btn btn-p" style="margin-top:16px" [disabled]="!wf.assignTo" (click)="assignTask()">
                📨 {{ t('detail.workflow.assign') }}
              </button>
            }

            @if (doc._access === 'full' && doc.blob_name) {
              <div class="sec-title" style="margin-top:24px">{{ t('detail.signus.sectionTitle') }}</div>
              <button class="btn btn-p" (click)="openSignus()">
                ✍ {{ t('detail.signus.start') }}
              </button>
            }

            <div class="sec-title" style="margin-top:24px">{{ t('labels.activeTasks') }}</div>
            @for (task of doc.workflow_tasks ?? []; track task.id) {
              @if (task.task_status === 'pending' || task.task_status === 'in_progress') {
                <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--gray-100)">
                  <wt-task-badge [taskType]="task.task_type" />
                  <wt-avatar [name]="task.assignee_name ?? ''" [size]="24" />
                  <span style="font-size:13px;flex:1">{{ task.assignee_name }}</span>
                  <span style="font-size:11px;color:var(--gray-400)">{{ task.created_at | date:'dd.MM.yy' }}</span>
                  @if (doc._access === 'full') {
                    <button class="btn btn-d btn-sm" (click)="cancelTask(task.id)">{{ 'actions.cancel' | transloco }}</button>
                  }
                </div>
              }
            }
          }
        </div>

        <!-- Panel Footer -->
        <div class="pf">
          @if (doc._access === 'full' && doc.blob_name) {
            <button class="btn btn-g" (click)="downloadDoc()">⬇ {{ t('detail.actions.download') }}</button>
          }
          @if (doc._access === 'full' && activeTab === 'overview') {
            <button class="btn btn-d" (click)="deleteDoc()">🗑 {{ t('detail.actions.delete') }}</button>
          }
          @if (doc._access === 'full' && activeTab === 'overview') {
            <button class="btn btn-p" (click)="saveDoc()">💾 {{ t('detail.actions.saveChanges') }}</button>
          }
          <button class="btn btn-g" (click)="close.emit()">{{ 'actions.close' | transloco }}</button>
        </div>
      </div>
    </div>

    <!-- Signus Modal -->
    @if (signusOpen) {
      <div class="mol open" (click)="signusOpen = false">
        <div class="mo" (click)="$event.stopPropagation()">
          <div class="moh">
            <div class="moico" style="background:#F5F3FF">✍</div>
            <div>
              <div class="mot">{{ t('detail.signus.modalTitle') }}</div>
              <div class="mos">{{ doc.doc_number }} · {{ doc.name }}</div>
            </div>
          </div>
          <div style="padding:20px 24px">
            <div class="fg" style="margin-bottom:14px">
              <label class="fl">{{ t('detail.signus.signatories') }} <span class="req">*</span></label>
              <textarea class="fta" style="min-height:60px" [placeholder]="t('detail.signus.emailsPlaceholder')" [(ngModel)]="signusEmails"></textarea>
            </div>
            <div style="background:var(--gray-50);border-radius:8px;padding:12px;font-size:12px;color:var(--gray-500)">
              ℹ {{ t('detail.signus.info') }}
            </div>
          </div>
          <div style="padding:16px 24px;border-top:1px solid var(--gray-200);display:flex;gap:10px;justify-content:flex-end">
            <button class="btn btn-g" (click)="signusOpen = false">{{ 'actions.close' | transloco }}</button>
            <button class="btn btn-p" [disabled]="!signusEmails.trim()" (click)="confirmSignus()">{{ t('detail.signus.send') }} →</button>
          </div>
        </div>
      </div>
    }
    </ng-container>
  `,
  styles: [`
    .udrop { position:absolute;top:100%;left:0;right:0;background:white;border:1px solid var(--gray-200);border-radius:8px;box-shadow:var(--shadow-lg);z-index:50;max-height:200px;overflow-y:auto;margin-top:2px; }
    .udrop-item { padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--gray-100); }
    .udrop-item:last-child { border-bottom:none; }
    .udrop-item:hover { background:var(--gray-50); }
    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 100; backdrop-filter: blur(2px); display: flex; align-items: flex-start; justify-content: flex-end; }
    .panel { width: 680px; height: 100vh; background: white; box-shadow: var(--shadow-lg); overflow-y: auto; display: flex; flex-direction: column; animation: slideIn .2s ease; }
    .ph { padding: 20px 24px; border-bottom: 1px solid var(--gray-200); display: flex; align-items: flex-start; gap: 12px; background: white; position: sticky; top: 0; z-index: 1; }
    .pt { font-family: 'Sora', sans-serif; font-size: 16px; font-weight: 700; color: var(--gray-900); }
    .ps { font-size: 12px; color: var(--gray-500); margin-top: 3px; display: flex; align-items: center; gap: 6px; }
    .pc { margin-left: auto; cursor: pointer; color: var(--gray-400); padding: 4px; border-radius: 6px; }
    .pc:hover { background: var(--gray-100); color: var(--gray-700); }
    .pb { padding: 24px; flex: 1; }
    .pf { padding: 16px 24px; border-top: 1px solid var(--gray-200); display: flex; gap: 10px; justify-content: flex-end; background: var(--gray-50); position: sticky; bottom: 0; }
    .mol { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 200; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(3px); animation: fadeIn .15s ease; }
    .mo { background: white; border-radius: 14px; width: 460px; max-width: 95vw; box-shadow: var(--shadow-lg); overflow: hidden; animation: scaleIn .2s ease; }
    .moh { padding: 20px 24px 16px; border-bottom: 1px solid var(--gray-200); display: flex; align-items: center; gap: 12px; }
    .moico { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 18px; }
    .mot { font-family: 'Sora', sans-serif; font-size: 15px; font-weight: 700; color: var(--gray-900); }
    .mos { font-size: 12px; color: var(--gray-500); margin-top: 2px; }
  `],
})
export class DetailPanelComponent implements OnChanges {
  @Input({ required: true }) document!: Document;
  @Output() close   = new EventEmitter<void>();
  @Output() updated = new EventEmitter<Document>();
  @Output() deleted = new EventEmitter<string>();

  private docSvc      = inject(DocumentService);
  private wfSvc       = inject(WorkflowService);
  private groupSvc    = inject(GroupService);
  private userSvc     = inject(UserService);
  private toast       = inject(ToastService);
  private sanitizer   = inject(DomSanitizer);
  private cdr         = inject(ChangeDetectorRef);
  private settingsSvc = inject(AppSettingsService);
  private crmApi      = inject(CrmApiService);
  private transloco   = inject(TranslocoService);
  private locale      = inject(LocaleService);
  auth                = inject(AuthService);

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

  get docTypeOptions(): SelectOption[] {
    const byLabel = (a: SelectOption, b: SelectOption) => a.label.localeCompare(b.label, this.locale.activeLocale());
    try {
      const raw = this.settingsSvc.settings()?.['doc_types'];
      if (raw) {
        const types: string[] = JSON.parse(String(raw));
        return types.map(v => this.builtInOption('docTypes', BUILT_IN_DOC_TYPES, v)).sort(byLabel);
      }
    } catch { }
    return BUILT_IN_DOC_TYPES.map(v => this.builtInOption('docTypes', BUILT_IN_DOC_TYPES, v)).sort(byLabel);
  }

  get gdprTypeOptions(): SelectOption[] {
    try {
      const raw = this.settingsSvc.settings()?.['doc_gdpr_types'];
      if (raw) {
        const types: string[] = JSON.parse(String(raw));
        return types.map(v => this.builtInOption('gdprTypes', BUILT_IN_GDPR_TYPES, v));
      }
    } catch { }
    return BUILT_IN_GDPR_TYPES.map(v => this.builtInOption('gdprTypes', BUILT_IN_GDPR_TYPES, v));
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

  get docStatusOptions(): SelectOption[] {
    try {
      const raw = this.settingsSvc.settings()?.['doc_statuses'];
      if (raw) {
        const types: string[] = JSON.parse(String(raw));
        return types.map(v => this.builtInOption('statuses', BUILT_IN_STATUSES, v));
      }
    } catch { }
    return BUILT_IN_STATUSES.map(v => this.builtInOption('statuses', BUILT_IN_STATUSES, v));
  }

  private builtInOption(dictionary: string, builtInValues: string[], value: string): SelectOption {
    return {
      value,
      label: builtInValues.includes(value) ? this.transloco.translate(`documents.labels.${dictionary}.${value}`) : value,
    };
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

  optionLabel(options: SelectOption[], value: string): string {
    return options.find(option => option.value === value)?.label ?? value;
  }

  doc!: Document;

  /**
   * Stable getter — avoids NG0100 caused by `doc.tags ?? []` creating
   * a new array reference on every change-detection cycle.
   */
  get tags(): any[] { return this.doc?.tags ?? []; }

  private _activeTab = 'info';
  get activeTab(): string { return this._activeTab; }
  set activeTab(v: string) {
    this._activeTab = v;
    if (v === 'overview')    this.loadLinkedPartners();
    if (v === 'preview'     && this.doc?.blob_name && this.isPdf) this.loadPreview();
    if (v === 'attachments') this.loadAttachments();
    if (v === 'history')     this.loadHistory();
  }
  tabs = [
    { id: 'overview',    labelKey: 'detail.tabs.overview',    tooltip: 'docs.tab.overview' },
    { id: 'preview',     labelKey: 'detail.tabs.preview',     tooltip: 'docs.tab.preview' },
    { id: 'versions',    labelKey: 'detail.tabs.versions',    tooltip: 'docs.tab.versions' },
    { id: 'history',     labelKey: 'detail.tabs.history',     tooltip: 'docs.tab.history' },
    { id: 'attachments', labelKey: 'detail.tabs.attachments', tooltip: 'docs.tab.attachments' },
    { id: 'workflow',    labelKey: 'detail.tabs.workflow',    tooltip: 'docs.tab.workflow' },
  ];

  get isPdf(): boolean {
    return (this.doc?.blob_name ?? '').toLowerCase().endsWith('.pdf');
  }

  newTagKey   = '';
  signusOpen  = false;

  // ── Powiązani Partnerzy ─────────────────────────────────────────────────────
  linkedPartners      = signal<any[]>([]);
  linkedPartnersLoading = false;
  partnerSearch        = '';
  partnerDropdown      = signal<any[]>([]);
  private partnerSearchTimer: ReturnType<typeof setTimeout> | null = null;
  signusEmails = '';

  wf = { assignTo: '', assignToName: '', assignSearch: '', taskType: 'read', message: '', dueDate: '' };
  userDropdown = signal<User[]>([]);
  users = signal<User[]>([]);
  groups = signal<any[]>([]);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  draft: {
    name: string; status: DocStatus; doc_type: DocType; gdpr_type: GdprType;
    group_id: string; owner_id: string;
    entity1: string; entity2: string;
    expiration_date: string; expiration_date_mode: 'indefinite' | 'fixed';
    signing_date: string;
    nip: string; country: string; contract_subject: string;
    contact_name: string; contact_email: string; contact_phone: string;
  } = {} as any;

  initDraft(): void {
    const expDate = this.toDateInput(this.doc.expiration_date);
    this.draft = {
      name:                 this.doc.name ?? '',
      status:               this.doc.status ?? '',
      doc_type:             this.doc.doc_type ?? '',
      gdpr_type:            this.doc.gdpr_type ?? '',
      group_id:             this.doc.group_id ?? '',
      owner_id:             this.doc.owner_id ?? '',
      entity1:              this.doc.entities?.[0] ?? '',
      entity2:              this.doc.entities?.[1] ?? '',
      expiration_date:      expDate,
      expiration_date_mode: expDate ? 'fixed' : 'indefinite',
      signing_date:         this.toDateInput(this.doc.signing_date),
      nip:                  (this.doc as any).nip ?? '',
      country:              (this.doc as any).country ?? '',
      contract_subject:     (this.doc as any).contract_subject ?? '',
      contact_name:         (this.doc as any).contact_name ?? '',
      contact_email:        (this.doc as any).contact_email ?? '',
      contact_phone:        (this.doc as any).contact_phone ?? '',
    };
  }

  saveDoc(): void {
    if (this.doc._access !== 'full') return;
    const access = this.doc._access;
    const entities = [this.draft.entity1, this.draft.entity2]
      .map(s => s.trim()).filter(s => !!s);
    this.docSvc.update(this.doc.id, {
      name:             this.draft.name,
      status:           this.draft.status,
      doc_type:         this.draft.doc_type,
      gdpr_type:        this.draft.gdpr_type,
      group_id:         this.draft.group_id,
      owner_id:         this.draft.owner_id,
      entities,
      expiration_date:  this.draft.expiration_date_mode === 'fixed'
                          ? (this.draft.expiration_date || undefined)
                          : null as any,
      signing_date:     this.draft.signing_date || undefined,
      nip:              (this.draft.nip || null) as any,
      country:          (this.draft.country || null) as any,
      contract_subject: (this.draft.contract_subject || null) as any,
      contact_name:     (this.draft.contact_name || null) as any,
      contact_email:    (this.draft.contact_email || null) as any,
      contact_phone:    (this.draft.contact_phone || null) as any,
    }).subscribe(updated => {
      this.doc = { ...updated, _access: access };
      this.initDraft();
      this.cdr.markForCheck();
      this.updated.emit(this.doc);
      this.toast.success(this.transloco.translate('documents.detail.toasts.saved'));
    });
  }

  get docTypeLabel(): string {
    const docType = this.doc?.doc_type;
    return BUILT_IN_DOC_TYPES.includes(docType) ? this.transloco.translate('documents.labels.docTypes.' + docType) : '';
  }
  previewBlobUrl = signal<SafeResourceUrl | null>(null);
  previewLoading = signal(false);
  previewError   = signal<string | null>(null);

  loadPreview(): void {
    if (this.previewBlobUrl()) return; // already loaded
    this.previewLoading.set(true);
    this.previewError.set(null);
    this.docSvc.download(this.doc.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        this.previewBlobUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
        this.previewLoading.set(false);
      },
      error: (err) => {
        this.previewError.set(err?.error?.error ?? this.transloco.translate('documents.detail.preview.loadFailed'));
        this.previewLoading.set(false);
      }
    });
  }

  formatSize = fileSizeLabel;

  /** Konwertuje ISO timestamp do YYYY-MM-DD z uwzględnieniem lokalnej strefy czasowej */
  toDateInput(val: string | null | undefined): string {
    if (!val) return '';
    const d = new Date(val);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  ngOnChanges(): void {
    this.previewBlobUrl.set(null);
    this.previewLoading.set(false);
    this.previewError.set(null);
    this.attachments.set([]);
    this.attachmentsLoaded = false;
    this.attachmentEvents.set([]);
    this.history.set([]);
    this.historyLoaded = false;
    this._activeTab = 'info';

    this.doc = { ...this.document };
    this.linkedPartners.set([]);
    this.partnerSearch = '';
    this.partnerDropdown.set([]);
    this.initDraft();
    this.activeTab = 'overview';
    this.cdr.markForCheck();

    if (this.groups().length === 0) {
      this.groupSvc.list().subscribe(list => this.groups.set(list));
    }
    if (this.users().length === 0) {
      this.userSvc.list({ limit: 200 }).subscribe(res => this.users.set(res.data ?? []));
    }
  }

  onOverlayClick(e: Event): void {
    if ((e.target as HTMLElement).classList.contains('overlay')) this.close.emit();
  }

  updateField(field: string, value: unknown): void {
    if (this.doc._access !== 'full') return;
    const access = this.doc._access;
    this.docSvc.update(this.doc.id, { [field]: value }).subscribe(updated => {
      this.doc = { ...updated, _access: access };
      this.cdr.markForCheck();
      this.updated.emit(this.doc);
    });
  }

  addTag(): void {
    if (!this.newTagKey.trim()) return;
    this.docSvc.addTag(this.doc.id, this.newTagKey.trim(), '').subscribe(tag => {
      this.doc = { ...this.doc, tags: [...(this.doc.tags ?? []), tag] };
      this.newTagKey = '';
      this.cdr.markForCheck();
      this.toast.success(this.transloco.translate('documents.detail.tags.added'));
    });
  }

  deleteTag(tagId: string): void {
    this.docSvc.deleteTag(this.doc.id, tagId).subscribe(() => {
      this.doc = { ...this.doc, tags: (this.doc.tags ?? []).filter(t => t.id !== tagId) };
      this.cdr.markForCheck();
    });
  }

  uploadFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.docSvc.uploadFile(this.doc.id, file).subscribe(() => {
      this.toast.success(this.transloco.translate('documents.detail.preview.fileUploaded'));
      this.docSvc.get(this.doc.id).subscribe(d => { this.doc = d; this.cdr.markForCheck(); this.updated.emit(d); });
    });
  }

  uploadNewVersion(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const label = 'Version ' + ((this.doc.versions?.length ?? 0) + 1);
    this.docSvc.uploadFile(this.doc.id, file, label).subscribe(() => {
      this.toast.success(this.transloco.translate('documents.detail.versions.uploaded'));
      this.reloadHistory();
      this.docSvc.get(this.doc.id).subscribe(d => { this.doc = d; this.cdr.markForCheck(); this.updated.emit(d); });
    });
  }

  attachments = signal<any[]>([]);
  attachmentsLoaded = false;
  attachmentEvents = signal<{icon:string;title:string;date:string}[]>([]);
  history = signal<any[]>([]);
  historyLoaded = false;

  loadHistory(): void {
    if (this.historyLoaded) return;
    this.historyLoaded = true;
    this.docSvc.getHistory(this.doc.id).subscribe(rows => this.history.set(rows));
  }

  reloadHistory(): void {
    this.historyLoaded = false;
    this.loadHistory();
  }

  loadAttachments(): void {
    if (this.attachmentsLoaded) return;
    this.attachmentsLoaded = true;
    this.docSvc.getAttachments(this.doc.id).subscribe(list => this.attachments.set(list));
  }

  uploadAttachment(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.docSvc.uploadAttachment(this.doc.id, file, file.name).subscribe({
      next: att => {
        this.attachments.update(list => [...list, att]);
        this.attachmentEvents.update(evts => [{icon:'📎', title: this.transloco.translate('documents.detail.history.actions.attachment_uploaded', { name: file.name }), date: new Date().toISOString()}, ...evts]);
        this.toast.success(this.transloco.translate('documents.detail.attachments.uploaded'));
        this.reloadHistory();
      },
      error: err => {
        const msg = err?.error?.error || err?.message || this.transloco.translate('documents.detail.attachments.uploadFailed');
        this.toast.error(msg);
      },
    });
  }

  uploadAttachmentVersion(event: Event, attId: string): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const attName = this.attachments().find((a:any) => a.id === attId)?.name ?? file.name;
    this.docSvc.uploadAttachmentVersion(this.doc.id, attId, file).subscribe({
      next: () => {
        this.toast.success(this.transloco.translate('documents.detail.versions.uploaded'));
        this.reloadHistory();
        this.attachmentEvents.update(evts => [{icon:'📎', title: this.transloco.translate('documents.detail.attachments.events.newVersion', { name: attName }), date: new Date().toISOString()}, ...evts]);
        this.attachmentsLoaded = false;
        this.docSvc.getAttachments(this.doc.id).subscribe(list => { this.attachments.set(list); this.attachmentsLoaded = true; });
      },
      error: err => {
        const msg = err?.error?.error || err?.message || this.transloco.translate('documents.detail.attachments.versionUploadFailed');
        this.toast.error(msg);
      },
    });
  }

  downloadAttachment(att: any): void {
    this.docSvc.downloadAttachment(this.doc.id, att.id).subscribe(blob => triggerDownload(blob, att.blob_name ?? att.name));
  }

  downloadAttachmentVersion(att: any, ver: any): void {
    this.docSvc.downloadAttachmentVersion(this.doc.id, att.id, ver.id).subscribe(blob => triggerDownload(blob, ver.blob_name ?? att.name));
  }

  deleteAttachment(attId: string): void {
    if (!confirm(this.transloco.translate('documents.detail.attachments.deleteConfirm'))) return;
    const attName = this.attachments().find((a:any) => a.id === attId)?.name ?? attId;
    this.docSvc.deleteAttachment(this.doc.id, attId).subscribe(() => {
      this.attachments.update(list => list.filter((a: any) => a.id !== attId));
      this.attachmentEvents.update(evts => [{icon:'🗑', title: this.transloco.translate('documents.detail.attachments.events.deleted', { name: attName }), date: new Date().toISOString()}, ...evts]);
      this.toast.success(this.transloco.translate('documents.detail.attachments.deleted'));
      this.reloadHistory();
    });
  }

  historyIcon(action: string): string {
    const map: Record<string,string> = {
      document_created:            '📄',
      document_updated:            '✏️',
      document_deleted:            '🗑',
      document_downloaded:         '⬇️',
      metadata_updated:            '✏️',
      tag_added:                   '🏷️',
      tag_removed:                 '🏷️',
      tag_updated:                 '🏷️',
      status_changed:              '🔄',
      version_uploaded:            '📤',
      workflow_task_created:       '📝',
      workflow_task_completed:     '✅',
      workflow_task_cancelled:     '❌',
      signing_initiated:           '✍️',
      signing_completed:           '✅',
      signing_failed:              '❌',
      attachment_uploaded:         '📎',
      attachment_version_uploaded: '📎',
      attachment_deleted:          '🗑',
    };
    return map[action] ?? '📋';
  }

  historyLabel(entry: any): string {
    const after = entry.after_state ? (typeof entry.after_state === 'string' ? JSON.parse(entry.after_state) : entry.after_state) : null;
    if (!DESCRIBED_HISTORY_ACTIONS.has(entry.action)) return entry.action.replace(/_/g, ' ');
    return this.transloco.translate('documents.detail.history.actions.' + entry.action, {
      key:     after?.key ?? '',
      status:  after?.status ?? '',
      version: after?.version ?? '',
      name:    after?.name ?? after?.fileName ?? '',
    });
  }

  loadLinkedPartners(): void {
    this.linkedPartnersLoading = true;
    this.crmApi.getDocumentLinkedPartners(this.doc.id).subscribe({
      next: list => { this.linkedPartners.set(list); this.linkedPartnersLoading = false; this.cdr.markForCheck(); },
      error: () => { this.linkedPartnersLoading = false; this.cdr.markForCheck(); },
    });
  }

  onPartnerSearch(q: string): void {
    if (!q || q.length < 2) { this.partnerDropdown.set([]); return; }
    if (this.partnerSearchTimer) clearTimeout(this.partnerSearchTimer);
    this.partnerSearchTimer = setTimeout(() => {
      this.crmApi.getPartners({ search: q, limit: 10 }).subscribe(res => {
        this.partnerDropdown.set(res.data ?? []);
        this.cdr.markForCheck();
      });
    }, 300);
  }

  hidePartnerDropdown(): void {
    setTimeout(() => this.partnerDropdown.set([]), 200);
  }

  linkPartner(p: any): void {
    this.crmApi.linkDocumentPartner(this.doc.id, p.id).subscribe({
      next: () => {
        this.partnerSearch = '';
        this.partnerDropdown.set([]);
        this.loadLinkedPartners();
        this.toast.success(this.transloco.translate('documents.detail.partners.linked', { company: p.company }));
      },
      error: () => this.toast.error(this.transloco.translate('documents.detail.partners.linkFailed')),
    });
  }

  unlinkPartner(p: any): void {
    if (!confirm(this.transloco.translate('documents.detail.partners.unlinkConfirm', { company: p.company }))) return;
    this.crmApi.unlinkDocumentPartner(this.doc.id, p.id).subscribe({
      next: () => { this.loadLinkedPartners(); this.toast.success(this.transloco.translate('documents.detail.partners.unlinked')); },
      error: () => this.toast.error(this.transloco.translate('documents.detail.partners.unlinkFailed')),
    });
  }

  onExpDateModeChange(): void {
    if (this.draft.expiration_date_mode === 'indefinite') {
      this.draft.expiration_date = '';
    }
  }

  downloadDoc(): void {
    this.docSvc.download(this.doc.id).subscribe(blob => triggerDownload(blob, this.doc.blob_name ?? this.doc.doc_number + '.pdf'));
  }

  downloadVersion(v: DocumentVersion): void {
    this.docSvc.downloadVersion(this.doc.id, v.id).subscribe(blob => triggerDownload(blob, `${this.doc.doc_number}_v${v.version_number}.pdf`));
  }

  deleteDoc(): void {
    if (!confirm(this.transloco.translate('documents.detail.deleteConfirm', { name: this.doc.name }))) return;
    this.docSvc.delete(this.doc.id).subscribe(() => this.deleted.emit(this.doc.id));
  }

  onUserSearch(q: string): void {
    this.wf.assignTo = '';
    this.wf.assignToName = '';
    if (!q || q.length < 2) { this.userDropdown.set([]); return; }
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.userSvc.search(q).subscribe(users => this.userDropdown.set(users));
    }, 300);
  }

  selectUser(u: User): void {
    this.wf.assignTo     = u.id;
    this.wf.assignToName = u.display_name;
    this.wf.assignSearch = u.display_name + ' <' + u.email + '>';
    this.userDropdown.set([]);
  }

  hideDropdown(): void {
    setTimeout(() => this.userDropdown.set([]), 200);
  }

  assignTask(): void {
    this.wfSvc.assignTask(this.doc.id, {
      assigned_to: this.wf.assignTo,
      task_type:   this.wf.taskType,
      message:     this.wf.message || undefined,
      due_date:    this.wf.dueDate || undefined,
    }).subscribe(task => {
      this.doc = { ...this.doc, workflow_tasks: [...(this.doc.workflow_tasks ?? []), task] };
      this.wf = { assignTo: '', assignToName: '', assignSearch: '', taskType: 'read', message: '', dueDate: '' };
      this.cdr.markForCheck();
      this.toast.success(this.transloco.translate('documents.detail.workflow.assigned'));
    });
  }

  cancelTask(taskId: string): void {
    this.wfSvc.cancelTask(this.doc.id, taskId).subscribe(() => {
      this.doc = {
        ...this.doc,
        workflow_tasks: (this.doc.workflow_tasks ?? []).map(t => t.id === taskId ? { ...t, task_status: 'cancelled' } : t),
      };
      this.cdr.markForCheck();
      this.toast.success(this.transloco.translate('documents.detail.workflow.cancelled'));
    });
  }

  openSignus(): void { this.signusOpen = true; this.signusEmails = ''; }

  confirmSignus(): void {
    const signatories = this.signusEmails.split(',').map(e => ({ email: e.trim() })).filter(s => s.email);
    this.docSvc.initiateSigning(this.doc.id, signatories).subscribe({
      next: (res: any) => {
        this.signusOpen = false;
        if (res.training) {
          this.toast.success(this.transloco.translate('documents.detail.signus.sentTraining'));
          const docId = this.doc.id;
          setTimeout(() => {
            this.docSvc.get(docId).subscribe(d => {
              this.doc = { ...d, _access: this.doc._access };
              this.reloadHistory();
              this.cdr.markForCheck();
              this.updated.emit(this.doc);
            });
          }, 12_000);
        } else {
          this.toast.success(this.transloco.translate('documents.detail.signus.sentRedirect'));
          setTimeout(() => window.open(res.redirectUrl, '_blank'), 800);
        }
      },
      error: (err: any) => {
        this.toast.error(err?.error?.error || this.transloco.translate('documents.detail.signus.sendFailed'));
      },
    });
  }
}
