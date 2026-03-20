import { Component, inject, Input, Output, EventEmitter, OnChanges, OnInit, signal, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Document, WorkflowTask, DocumentVersion, User, DocStatus, DocType, GdprType } from '../../../core/models/models';
import { DocumentService } from '../../../core/services/document.service';
import { WorkflowService, GroupService, UserService } from '../../../core/services/api.services';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { StatusBadgeComponent, TypeBadgeComponent, GdprBadgeComponent, GroupPillComponent, TaskBadgeComponent, AvatarComponent } from '../../../shared/components/badges.components';
import { DOC_TYPE_MAP, fileSizeLabel, triggerDownload } from '../../../core/services/helpers';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'wt-detail-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusBadgeComponent, TypeBadgeComponent, GdprBadgeComponent, GroupPillComponent, TaskBadgeComponent, AvatarComponent],
  template: `
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
            @for (t of tabs; track t.id) {
              <button class="tab-btn" [class.active]="activeTab === t.id" (click)="activeTab = t.id">{{ t.label }}</button>
            }
          </div>
        </div>

        <!-- Tab Content -->
        <div class="pb">

          <!-- OVERVIEW -->
          @if (activeTab === 'overview') {
            <div class="sec-title">Document Metadata</div>
            <div class="fgrid">
              <div class="fg">
                <label class="fl">Document Name <span class="req">*</span></label>
                <input class="fi" [(ngModel)]="draft.name" [readOnly]="doc._access !== 'full'">
              </div>
              <div class="fg">
                <label class="fl">Status</label>
                @if (doc._access === 'full') {
                  <select class="fsel" [(ngModel)]="draft.status">
                    <option value="new">New</option>
                    <option value="being_edited">Being Edited</option>
                    <option value="being_signed">Being Signed</option>
                    <option value="being_approved">Being Approved</option>
                    <option value="signed">Signed</option>
                    <option value="hold">Hold</option>
                    <option value="completed">Completed</option>
                    <option value="rejected">Rejected</option>
                  </select>
                } @else {
                  <wt-status-badge [status]="doc.status" />
                }
              </div>
              <div class="fg">
                <label class="fl">Document Type</label>
                @if (doc._access === 'full') {
                  <select class="fsel" [(ngModel)]="draft.doc_type">
                    <option value="partner_agreement">Partner Agreement</option>
                    <option value="it_supplier_agreement">IT Supplier Agreement</option>
                    <option value="employee_agreement">Employee Agreement</option>
                    <option value="nda">NDA</option>
                    <option value="operator_agreement">Operator Agreement</option>
                  </select>
                } @else {
                  <div class="fi" style="background:var(--gray-100);color:var(--gray-600)">{{ docTypeLabel }}</div>
                }
              </div>
              <div class="fg">
                <label class="fl">GDPR</label>
                @if (doc._access === 'full') {
                  <select class="fsel" [(ngModel)]="draft.gdpr_type">
                    <option value="data_processing_entrustment">Data Processing Entrustment</option>
                    <option value="data_administration">Data Administration</option>
                    <option value="no_gdpr">No GDPR</option>
                  </select>
                } @else {
                  <div style="padding-top:6px"><wt-gdpr-badge [gdpr]="doc.gdpr_type" /></div>
                }
              </div>
              <div class="fg">
                <label class="fl">Group</label>
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
                <label class="fl">Owner</label>
                @if (doc._access === 'full') {
                  <div style="position:relative">
                    <input class="fi" style="width:100%;box-sizing:border-box"
                           placeholder="Search by name or email..."
                           [(ngModel)]="ownerSearch"
                           (ngModelChange)="onOwnerSearch($event)"
                           (blur)="hideOwnerDropdown()">
                    @if (ownerDropdown().length > 0) {
                      <div class="udrop">
                        @for (u of ownerDropdown(); track u.id) {
                          <div class="udrop-item" (mousedown)="selectOwner(u)">
                            <div style="font-weight:500;font-size:13px">{{ u.display_name }}</div>
                            <div style="font-size:11px;color:var(--gray-400)">{{ u.email }}</div>
                          </div>
                        }
                      </div>
                    }
                  </div>
                } @else {
                  <div style="display:flex;align-items:center;gap:8px;padding-top:4px">
                    <wt-avatar [name]="doc.owner_name ?? ''" [size]="28" />
                    <span style="font-size:13px">{{ doc.owner_name }}</span>
                  </div>
                }
              </div>
              <div class="fg">
                <label class="fl">Entity 1</label>
                <input class="fi" [(ngModel)]="draft.entity1"
                       [readOnly]="doc._access !== 'full'" placeholder="np. WorkTrips Sp. z o.o.">
              </div>
              <div class="fg">
                <label class="fl">Entity 2</label>
                <input class="fi" [(ngModel)]="draft.entity2"
                       [readOnly]="doc._access !== 'full'" placeholder="np. Partner Ltd.">
              </div>
              <div class="fg">
                <label class="fl">Expiration Date</label>
                <input class="fi" type="date" [(ngModel)]="draft.expiration_date"
                       [readOnly]="doc._access !== 'full'">
              </div>
              <div class="fg">
                <label class="fl">Signing Date</label>
                <input class="fi" type="date" [(ngModel)]="draft.signing_date"
                       [readOnly]="doc._access !== 'full'"
                       [style.background]="doc._access !== 'full' ? 'var(--gray-100)' : ''">
              </div>
            </div>

            <!-- Tags -->
            <div class="sec-title" style="margin-top:20px">Tags</div>
            @if (tags.length > 0) {
              <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:13px">
                <thead>
                  <tr style="background:var(--gray-50);border-bottom:1px solid var(--gray-200)">
                    <th style="text-align:left;padding:6px 10px;font-weight:600;color:var(--gray-500);font-size:11px;text-transform:uppercase;width:40%">Key</th>
                    <th style="text-align:left;padding:6px 10px;font-weight:600;color:var(--gray-500);font-size:11px;text-transform:uppercase">Value</th>
                    @if (doc._access === 'full') {
                      <th style="width:36px"></th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (tag of tags; track tag.id) {
                    <tr style="border-bottom:1px solid var(--gray-100)">
                      <td style="padding:7px 10px;color:var(--gray-700);font-weight:600">{{ tag.key }}</td>
                      <td style="padding:7px 10px;color:var(--gray-700)">{{ tag.value }}</td>
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
              <div style="font-size:12.5px;color:var(--gray-400);margin-bottom:12px">No tags yet.</div>
            }
            @if (doc._access === 'full') {
              <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
                <input class="fi" style="flex:1;min-width:0;padding:6px 10px;font-size:13px" placeholder="Key (np. contract_id)" [(ngModel)]="newTagKey">
                <input class="fi" style="flex:1;min-width:0;padding:6px 10px;font-size:13px" placeholder="Value (np. 2024/ABC/001)" [(ngModel)]="newTagValue">
                <button class="btn btn-g btn-sm" style="white-space:nowrap" (click)="addTag()">+ Add Tag</button>
              </div>
            }

            @if (doc.document_group_name) {
              <div style="background:var(--orange-pale);border:1px solid var(--orange-muted);border-radius:8px;padding:10px 14px;font-size:12.5px;color:var(--orange-dark)">
                📎 Part of document bundle: <strong>{{ doc.document_group_name }}</strong>
              </div>
            }
          }

          <!-- PDF PREVIEW -->
          @if (activeTab === 'preview') {
            @if (doc.blob_name) {
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
                  <iframe [src]="previewBlobUrl()!" style="width:100%;height:100%;border:none" title="PDF Preview"></iframe>
                }
              </div>
            } @else {
              <div class="empty-state">
                <div class="empty-icon">📎</div>
                <div class="empty-title">No file attached</div>
                @if (doc._access === 'full') {
                  <label class="btn btn-p" style="margin-top:12px;cursor:pointer">
                    Upload File
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
                  &#11014; Upload New Version
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
                    @if (v.signatory_name) { · Signed by {{ v.signatory_name }} }
                    @if (v.blob_size_bytes) { · {{ formatSize(v.blob_size_bytes) }} }
                  </div>
                </div>
                <button class="btn btn-g btn-sm" (click)="downloadVersion(v)">⬇ Download</button>
              </div>
            }
            @empty {
              <div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No versions yet</div></div>
            }
          }

          <!-- ATTACHMENTS -->
          @if (activeTab === 'attachments') {
            @if (doc._access === 'full') {
              <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
                <label class="btn btn-p btn-sm" style="cursor:pointer">
                  &#11014; Add Attachment
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
                      {{ att.versions?.length ?? 0 }} version(s) &middot; {{ att.mime_type }}
                      @if (att.blob_size_bytes) { &middot; {{ formatSize(att.blob_size_bytes) }} }
                    </div>
                  </div>
                  <button class="btn btn-g btn-sm" (click)="downloadAttachment(att)">&#11015; Download</button>
                  @if (doc._access === 'full') {
                    <label class="btn btn-g btn-sm" style="cursor:pointer">
                      &#11014; New version
                      <input type="file" hidden (change)="uploadAttachmentVersion($event, att.id)">
                    </label>
                    <button class="btn btn-d btn-sm" (click)="deleteAttachment(att.id)">&#10005;</button>
                  }
                </div>
                @if (att.versions?.length > 1) {
                  <div style="padding:8px 14px;border-top:1px solid var(--gray-100)">
                    <div style="font-size:11px;font-weight:600;color:var(--gray-400);text-transform:uppercase;margin-bottom:6px">Versions</div>
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
                <div class="empty-title">No attachments yet</div>
                @if (doc._access === 'full') {
                  <label class="btn btn-p" style="margin-top:12px;cursor:pointer">
                    Add First Attachment
                    <input type="file" hidden (change)="uploadAttachment($event)">
                  </label>
                }
              </div>
            }
          }

          <!-- HISTORY TIMELINE -->
          @if (activeTab === 'history') {
            @if (history().length === 0) {
              <div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No history yet</div></div>
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
              <div class="sec-title">Assign Task</div>
              <div class="fgrid">
                <div class="fg">
                  <label class="fl">Assign to User <span class="req">*</span></label>
                  <div style="position:relative">
                    <input class="fi" style="width:100%;box-sizing:border-box"
                           placeholder="Search by name or email..."
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
                        Selected: {{ wf.assignToName }}
                      </div>
                    }
                  </div>
                </div>
                <div class="fg">
                  <label class="fl">Task Type <span class="req">*</span></label>
                  <select class="fsel" [(ngModel)]="wf.taskType">
                    <option value="read">Read</option>
                    <option value="edit">Edit</option>
                    <option value="approve">Approve</option>
                    <option value="sign">Sign</option>
                  </select>
                </div>
                <div class="fg">
                  <label class="fl">Due Date</label>
                  <input class="fi" type="date" [(ngModel)]="wf.dueDate">
                </div>
                <div class="fg full">
                  <label class="fl">Message</label>
                  <textarea class="fta" placeholder="Optional message to assignee…" [(ngModel)]="wf.message"></textarea>
                </div>
              </div>
              <button class="btn btn-p" [disabled]="!wf.assignTo" (click)="assignTask()">
                📨 Assign &amp; Send Email
              </button>
            }

            @if (doc._access === 'full' && doc.blob_name) {
              <div class="sec-title" style="margin-top:24px">E-Signing (Signus)</div>
              <button class="btn btn-p" (click)="openSignus()">
                ✍ Initiate E-Signing via Signus
              </button>
            }

            <div class="sec-title" style="margin-top:24px">Active Tasks</div>
            @for (task of doc.workflow_tasks ?? []; track task.id) {
              @if (task.task_status === 'pending' || task.task_status === 'in_progress') {
                <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--gray-100)">
                  <wt-task-badge [taskType]="task.task_type" />
                  <wt-avatar [name]="task.assignee_name ?? ''" [size]="24" />
                  <span style="font-size:13px;flex:1">{{ task.assignee_name }}</span>
                  <span style="font-size:11px;color:var(--gray-400)">{{ task.created_at | date:'dd.MM.yy' }}</span>
                  @if (doc._access === 'full') {
                    <button class="btn btn-d btn-sm" (click)="cancelTask(task.id)">Cancel</button>
                  }
                </div>
              }
            }
          }
        </div>

        <!-- Panel Footer -->
        <div class="pf">
          @if (doc._access === 'full' && doc.blob_name) {
            <button class="btn btn-g" (click)="downloadDoc()">⬇ Download</button>
          }
          @if (doc._access === 'full') {
            <button class="btn btn-d" (click)="deleteDoc()">🗑 Delete</button>
          }
          @if (doc._access === 'full' && activeTab === 'overview') {
            <button class="btn btn-p" (click)="saveDoc()">💾 Save</button>
          }
          <button class="btn btn-g" (click)="close.emit()">Cancel</button>
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
              <div class="mot">Initiate E-Signing</div>
              <div class="mos">{{ doc.doc_number }} · {{ doc.name }}</div>
            </div>
          </div>
          <div style="padding:20px 24px">
            <div class="fg" style="margin-bottom:14px">
              <label class="fl">Signatories (comma-separated emails) <span class="req">*</span></label>
              <textarea class="fta" style="min-height:60px" placeholder="anna@worktrips.com, partner@example.com" [(ngModel)]="signusEmails"></textarea>
            </div>
            <div style="background:var(--gray-50);border-radius:8px;padding:12px;font-size:12px;color:var(--gray-500)">
              ℹ The document will be sent to Signus API. Each signatory will receive an email. Signed versions are automatically archived.
            </div>
          </div>
          <div style="padding:16px 24px;border-top:1px solid var(--gray-200);display:flex;gap:10px;justify-content:flex-end">
            <button class="btn btn-g" (click)="signusOpen = false">Cancel</button>
            <button class="btn btn-p" [disabled]="!signusEmails.trim()" (click)="confirmSignus()">Send to Signus →</button>
          </div>
        </div>
      </div>
    }
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

  private docSvc   = inject(DocumentService);
  private wfSvc    = inject(WorkflowService);
  private groupSvc = inject(GroupService);
  private userSvc  = inject(UserService);
  private toast    = inject(ToastService);
  private sanitizer = inject(DomSanitizer);
  private cdr       = inject(ChangeDetectorRef);
  auth            = inject(AuthService);

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
    if (v === 'preview'     && this.doc?.blob_name) this.loadPreview();
    if (v === 'attachments') this.loadAttachments();
    if (v === 'history')     this.loadHistory();
  }
  tabs = [
    { id: 'overview',  label: 'Overview' },
    { id: 'preview',   label: 'PDF Preview' },
    { id: 'versions',  label: 'Versions' },
    { id: 'history',   label: 'History' },
    { id: 'attachments',  label: 'Attachments' },
    { id: 'workflow',  label: 'Workflow' },
  ];

  newTagKey   = '';
  newTagValue = '';
  signusOpen  = false;
  signusEmails = '';

  wf = { assignTo: '', assignToName: '', assignSearch: '', taskType: 'read', message: '', dueDate: '' };
  userDropdown = signal<User[]>([]);
  ownerSearch  = '';
  ownerDropdown = signal<User[]>([]);
  groups = signal<any[]>([]);
  private ownerSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  draft: {
    name: string; status: DocStatus; doc_type: DocType; gdpr_type: GdprType;
    group_id: string; owner_id: string;
    entity1: string; entity2: string;
    expiration_date: string; signing_date: string;
  } = {} as any;

  initDraft(): void {
    this.draft = {
      name:            this.doc.name ?? '',
      status:          this.doc.status ?? '',
      doc_type:        this.doc.doc_type ?? '',
      gdpr_type:       this.doc.gdpr_type ?? '',
      group_id:        this.doc.group_id ?? '',
      owner_id:        this.doc.owner_id ?? '',
      entity1:         this.doc.entities?.[0] ?? '',
      entity2:         this.doc.entities?.[1] ?? '',
      expiration_date: this.toDateInput(this.doc.expiration_date),
      signing_date:    this.toDateInput(this.doc.signing_date),
    };
    this.ownerSearch = this.doc.owner_name ?? '';
  }

  saveDoc(): void {
    if (this.doc._access !== 'full') return;
    const access = this.doc._access;
    const entities = [this.draft.entity1, this.draft.entity2]
      .map(s => s.trim()).filter(s => !!s);
    this.docSvc.update(this.doc.id, {
      name:            this.draft.name,
      status:          this.draft.status,
      doc_type:        this.draft.doc_type,
      gdpr_type:       this.draft.gdpr_type,
      group_id:        this.draft.group_id,
      owner_id:        this.draft.owner_id,
      entities,
      expiration_date: this.draft.expiration_date || undefined,
      signing_date:    this.draft.signing_date || undefined,
    }).subscribe(updated => {
      this.doc = { ...updated, _access: access };
      this.initDraft();
      this.cdr.markForCheck();
      this.updated.emit(this.doc);
      this.toast.success('Document saved');
    });
  }

  get docTypeLabel(): string { return DOC_TYPE_MAP[this.doc?.doc_type] ?? ''; }
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
        this.previewError.set(err?.error?.error ?? 'Failed to load PDF');
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
    this.ownerSearch = this.document.owner_name ?? '';
    this.initDraft();
    this.activeTab = 'overview';
    this.cdr.markForCheck();

    if (this.groups().length === 0) {
      this.groupSvc.list().subscribe(list => this.groups.set(list));
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
    if (!this.newTagKey.trim() || !this.newTagValue.trim()) return;
    this.docSvc.addTag(this.doc.id, this.newTagKey.trim(), this.newTagValue.trim()).subscribe(tag => {
      this.doc = { ...this.doc, tags: [...(this.doc.tags ?? []), tag] };
      this.newTagKey = ''; this.newTagValue = '';
      this.cdr.markForCheck();
      this.toast.success('Tag added');
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
      this.toast.success('File uploaded');
      this.docSvc.get(this.doc.id).subscribe(d => { this.doc = d; this.cdr.markForCheck(); this.updated.emit(d); });
    });
  }

  uploadNewVersion(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const label = 'Version ' + ((this.doc.versions?.length ?? 0) + 1);
    this.docSvc.uploadFile(this.doc.id, file, label).subscribe(() => {
      this.toast.success('New version uploaded');
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
    this.docSvc.uploadAttachment(this.doc.id, file, file.name).subscribe(att => {
      this.attachments.update(list => [...list, att]);
      this.attachmentEvents.update(evts => [{icon:'📎', title:`Attachment added: ${file.name}`, date: new Date().toISOString()}, ...evts]);
      this.toast.success('Attachment uploaded');
      this.reloadHistory();
    });
  }

  uploadAttachmentVersion(event: Event, attId: string): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const attName = this.attachments().find((a:any) => a.id === attId)?.name ?? file.name;
    this.docSvc.uploadAttachmentVersion(this.doc.id, attId, file).subscribe(() => {
      this.toast.success('New version uploaded');
      this.reloadHistory();
      this.attachmentEvents.update(evts => [{icon:'📎', title:`Attachment new version: ${attName}`, date: new Date().toISOString()}, ...evts]);
      this.attachmentsLoaded = false;
      this.docSvc.getAttachments(this.doc.id).subscribe(list => { this.attachments.set(list); this.attachmentsLoaded = true; });
    });
  }

  downloadAttachment(att: any): void {
    this.docSvc.downloadAttachment(this.doc.id, att.id).subscribe(blob => triggerDownload(blob, att.blob_name ?? att.name));
  }

  downloadAttachmentVersion(att: any, ver: any): void {
    this.docSvc.downloadAttachmentVersion(this.doc.id, att.id, ver.id).subscribe(blob => triggerDownload(blob, ver.blob_name ?? att.name));
  }

  deleteAttachment(attId: string): void {
    if (!confirm('Delete this attachment and all its versions?')) return;
    const attName = this.attachments().find((a:any) => a.id === attId)?.name ?? attId;
    this.docSvc.deleteAttachment(this.doc.id, attId).subscribe(() => {
      this.attachments.update(list => list.filter((a: any) => a.id !== attId));
      this.attachmentEvents.update(evts => [{icon:'🗑', title:'Attachment deleted: ' + attName, date: new Date().toISOString()}, ...evts]);
      this.toast.success('Attachment deleted');
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
    switch (entry.action) {
      case 'document_created':            return 'Document created';
      case 'document_updated':            return 'Document updated';
      case 'document_deleted':            return 'Document deleted';
      case 'document_downloaded':         return 'Document downloaded';
      case 'metadata_updated':            return 'Metadata updated';
      case 'tag_added':                   return `Tag added: ${after?.key ?? ''}`;
      case 'tag_removed':                 return `Tag removed: ${after?.key ?? ''}`;
      case 'tag_updated':                 return `Tag updated: ${after?.key ?? ''}`;
      case 'status_changed':              return `Status changed to: ${after?.status ?? ''}`;
      case 'version_uploaded':            return `New document version uploaded (v${after?.version ?? ''})`;
      case 'workflow_task_created':       return `Workflow task assigned`;
      case 'workflow_task_completed':     return `Workflow task completed`;
      case 'workflow_task_cancelled':     return `Workflow task cancelled`;
      case 'signing_initiated':           return 'E-signing initiated';
      case 'signing_completed':           return 'E-signing completed';
      case 'signing_failed':              return 'E-signing failed';
      case 'attachment_uploaded':         return `Attachment added: ${after?.name ?? after?.fileName ?? ''}`;
      case 'attachment_version_uploaded': return `Attachment new version (v${after?.version ?? ''})`;
      case 'attachment_deleted':          return `Attachment deleted`;
      default:                            return entry.action.replace(/_/g, ' ');
    }
  }

  onOwnerSearch(q: string): void {
    if (!q || q.length < 2) { this.ownerDropdown.set([]); return; }
    if (this.ownerSearchTimer) clearTimeout(this.ownerSearchTimer);
    this.ownerSearchTimer = setTimeout(() => {
      this.userSvc.search(q).subscribe(users => this.ownerDropdown.set(users));
    }, 300);
  }

  selectOwner(u: User): void {
    this.ownerSearch = u.display_name + ' <' + u.email + '>';
    this.ownerDropdown.set([]);
    this.draft.owner_id = u.id;
  }

  hideOwnerDropdown(): void {
    setTimeout(() => this.ownerDropdown.set([]), 200);
  }

  downloadDoc(): void {
    this.docSvc.download(this.doc.id).subscribe(blob => triggerDownload(blob, this.doc.blob_name ?? this.doc.doc_number + '.pdf'));
  }

  downloadVersion(v: DocumentVersion): void {
    this.docSvc.downloadVersion(this.doc.id, v.id).subscribe(blob => triggerDownload(blob, `${this.doc.doc_number}_v${v.version_number}.pdf`));
  }

  deleteDoc(): void {
    if (!confirm(`Delete "${this.doc.name}"?`)) return;
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
      this.toast.success('Task assigned — email notification sent');
    });
  }

  cancelTask(taskId: string): void {
    this.wfSvc.cancelTask(this.doc.id, taskId).subscribe(() => {
      this.doc = {
        ...this.doc,
        workflow_tasks: (this.doc.workflow_tasks ?? []).map(t => t.id === taskId ? { ...t, task_status: 'cancelled' } : t),
      };
      this.cdr.markForCheck();
      this.toast.success('Task cancelled');
    });
  }

  openSignus(): void { this.signusOpen = true; this.signusEmails = ''; }

  confirmSignus(): void {
    const signatories = this.signusEmails.split(',').map(e => ({ email: e.trim() })).filter(s => s.email);
    this.docSvc.initiateSigning(this.doc.id, signatories).subscribe(res => {
      this.signusOpen = false;
      this.toast.success('Document sent to Signus — redirecting…');
      setTimeout(() => window.open(res.redirectUrl, '_blank'), 800);
    });
  }
}
