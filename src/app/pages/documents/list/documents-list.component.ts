import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DocumentService } from '../../../core/services/document.service';
import { GroupService } from '../../../core/services/api.services';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Document, DocStatus, DocType, GroupProfile } from '../../../core/models/models';
import { StatusBadgeComponent, TypeBadgeComponent, GdprBadgeComponent, GroupPillComponent, AvatarComponent } from '../../../shared/components/badges.components';
import { DOC_TYPE_MAP, triggerDownload, isExpiringSoon } from '../../../core/services/helpers';
import { DetailPanelComponent } from '../detail-panel/detail-panel.component';
import { NewDocumentPanelComponent } from '../new-panel/new-document-panel.component';

const STATUSES: { key: DocStatus | 'all'; label: string }[] = [
  { key: 'all',          label: 'All' },
  { key: 'new',          label: 'New' },
  { key: 'being_edited', label: 'Editing' },
  { key: 'being_signed', label: 'Signing' },
  { key: 'signed',       label: 'Signed' },
  { key: 'completed',    label: 'Completed' },
  { key: 'rejected',     label: 'Rejected' },
];

// Columns supported by backend sort
const BACKEND_SORT_COLS = new Set(['doc_number','name','status','expiration_date']);

type SortDir = 'asc' | 'desc';

@Component({
  selector: 'wt-documents-list',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusBadgeComponent, TypeBadgeComponent, GdprBadgeComponent, GroupPillComponent, AvatarComponent, DetailPanelComponent, NewDocumentPanelComponent],
  template: `
    <!-- Topbar -->
    <div id="topbar">
      <span class="page-title">Documents</span>
      <span class="tsp"></span>
      <div class="srch-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input class="srch" type="search" placeholder="Search documents, tags…"
               [(ngModel)]="searchQuery" (ngModelChange)="onSearch()">
      </div>
      <button class="btn btn-p" (click)="openNew = true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New Document
      </button>
    </div>

    <div id="content">
      <!-- Toolbar -->
      <div class="toolbar">
        @for (s of statuses; track s.key) {
          <span class="fchip" [class.on]="activeStatus === s.key" (click)="setStatus(s.key)">{{ s.label }}</span>
        }
        <span style="flex:1"></span>
        <select class="sel" [(ngModel)]="selectedGroup" (ngModelChange)="loadDocuments()">
          <option value="">All Groups</option>
          @for (g of groups(); track g.id) {
            <option [value]="g.id">{{ g.display_name }}</option>
          }
        </select>
        <select class="sel" [(ngModel)]="selectedType" (ngModelChange)="loadDocuments()">
          <option value="">All Types</option>
          @for (t of docTypes; track t.key) {
            <option [value]="t.key">{{ t.label }}</option>
          }
        </select>
      </div>

      <!-- Table -->
      <div class="tw">
        <div class="thead">
          <div class="th"><input type="checkbox" class="chk"></div>
          <div class="th sortable" (click)="sortBy('doc_number')">
            Number <span class="sort-icon">{{ sortIcon('doc_number') }}</span>
          </div>
          <div class="th sortable" (click)="sortBy('name')">
            Name <span class="sort-icon">{{ sortIcon('name') }}</span>
          </div>
          <div class="th sortable" (click)="sortBy('doc_type')">
            Type <span class="sort-icon">{{ sortIcon('doc_type') }}</span>
          </div>
          <div class="th sortable" (click)="sortBy('group_name')">
            Group <span class="sort-icon">{{ sortIcon('group_name') }}</span>
          </div>
          <div class="th sortable" (click)="sortBy('entities')">
            Entity <span class="sort-icon">{{ sortIcon('entities') }}</span>
          </div>
          <div class="th sortable" (click)="sortBy('gdpr_type')">
            GDPR <span class="sort-icon">{{ sortIcon('gdpr_type') }}</span>
          </div>
          <div class="th sortable" (click)="sortBy('status')">
            Status <span class="sort-icon">{{ sortIcon('status') }}</span>
          </div>
          <div class="th sortable" (click)="sortBy('expiration_date')">
            Expiry <span class="sort-icon">{{ sortIcon('expiration_date') }}</span>
          </div>
          <div class="th sortable" (click)="sortBy('owner_name')">
            Owner <span class="sort-icon">{{ sortIcon('owner_name') }}</span>
          </div>
        </div>

        @if (loading()) {
          <div class="loading-overlay"><div class="spinner"></div></div>
        }

        @for (doc of displayedDocuments(); track doc.id) {
          <div class="tr" (click)="openDocument(doc)">
            <div class="td"><input type="checkbox" class="chk" (click)="$event.stopPropagation()"></div>
            <div class="td td-num">{{ doc.doc_number }}</div>
            <div class="td td-n" [title]="doc.name">{{ doc.name }}</div>
            <div class="td"><wt-type-badge [type]="doc.doc_type" /></div>
            <div class="td"><wt-group-pill [name]="doc.group_display ?? doc.group_name ?? ''" /></div>
            <div class="td td-ent" [title]="(doc.entities ?? []).join(', ')">
              {{ (doc.entities ?? []).join(', ') || '—' }}
            </div>
            <div class="td"><wt-gdpr-badge [gdpr]="doc.gdpr_type" /></div>
            <div class="td"><wt-status-badge [status]="doc.status" /></div>
            <div class="td" [style.color]="isExpiring(doc.expiration_date) ? '#DC2626' : ''">
              {{ doc.expiration_date ? (doc.expiration_date | date:'dd.MM.yy') : '—' }}
            </div>
            <div class="td">
              <wt-avatar [name]="doc.owner_name ?? ''" [size]="24" />
            </div>
          </div>
        }

        @if (displayedDocuments().length === 0 && !loading()) {
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-title">No documents found</div>
            <div>Try adjusting filters or search query</div>
          </div>
        }
      </div>

      <!-- Pagination -->
      @if (totalPages() > 1) {
        <div style="display:flex;align-items:center;gap:8px;margin-top:16px;justify-content:flex-end">
          <button class="btn btn-g btn-sm" [disabled]="page() === 1" (click)="setPage(page() - 1)">← Prev</button>
          <span style="font-size:12.5px;color:var(--gray-500)">Page {{ page() }} of {{ totalPages() }}</span>
          <button class="btn btn-g btn-sm" [disabled]="page() === totalPages()" (click)="setPage(page() + 1)">Next →</button>
        </div>
      }
    </div>

    <!-- Detail Panel -->
    @if (selectedDoc()) {
      <wt-detail-panel
        [document]="selectedDoc()!"
        (close)="selectedDoc.set(null)"
        (updated)="onDocumentUpdated($event)"
        (deleted)="onDocumentDeleted($event)"
      />
    }

    <!-- New Document Panel -->
    @if (openNew) {
      <wt-new-document-panel
        [groups]="groups()"
        (close)="openNew = false"
        (created)="onDocumentCreated($event)"
      />
    }
  `,
  styles: [`
    #topbar { height: 60px; background: white; border-bottom: 1px solid var(--gray-200); display: flex; align-items: center; gap: 12px; padding: 0 24px; flex-shrink: 0; }
    .page-title { font-family: 'Sora', sans-serif; font-size: 17px; font-weight: 700; color: var(--gray-900); }
    .tsp { flex: 1; }
    .srch-wrap { position: relative; display: flex; align-items: center; }
    .srch-wrap svg { position: absolute; left: 10px; width: 15px; height: 15px; color: var(--gray-400); pointer-events: none; }
    .srch { background: var(--gray-100); border: 1px solid var(--gray-200); border-radius: 8px; padding: 7px 14px 7px 34px; font-size: 13px; color: var(--gray-800); width: 260px; outline: none; font-family: inherit; }
    .srch:focus { border-color: var(--orange); box-shadow: 0 0 0 3px rgba(242,101,34,.1); background: white; }
    #content { flex: 1; overflow-y: auto; padding: 24px; }
    .toolbar { background: white; border: 1px solid var(--gray-200); border-radius: var(--radius); padding: 12px 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 10px; box-shadow: var(--shadow-sm); flex-wrap: wrap; }
    .thead { display: grid; grid-template-columns: 36px 110px 1fr 120px 110px 130px 100px 105px 82px 52px; background: var(--gray-50); border-bottom: 1px solid var(--gray-200); padding: 0 16px; }
    .th { padding: 10px 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--gray-500); display: flex; align-items: center; gap: 4px; }
    .th.sortable { cursor: pointer; user-select: none; }
    .th.sortable:hover { color: var(--gray-800); }
    .sort-icon { font-size: 10px; color: var(--gray-400); min-width: 10px; }
    .tr { display: grid; grid-template-columns: 36px 110px 1fr 120px 110px 130px 100px 105px 82px 52px; padding: 0 16px; border-bottom: 1px solid var(--gray-100); cursor: pointer; transition: background .1s; align-items: center; }
    .tr:last-child { border-bottom: none; }
    .tr:hover { background: var(--gray-50); }
    .td { padding: 11px 8px; font-size: 13px; color: var(--gray-700); overflow: hidden; }
    .td-n { font-weight: 500; color: var(--gray-900); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .td-num { font-family: 'Sora', monospace; font-size: 11px; color: var(--gray-500); font-weight: 600; }
    .td-ent { font-size: 12px; color: var(--gray-600); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  `],
})
export class DocumentsListComponent implements OnInit {
  private docSvc   = inject(DocumentService);
  private groupSvc = inject(GroupService);
  private route    = inject(ActivatedRoute);
  private toast    = inject(ToastService);
  auth             = inject(AuthService);

  statuses   = STATUSES;
  docTypes   = Object.entries(DOC_TYPE_MAP).map(([key, label]) => ({ key, label }));
  groups     = signal<GroupProfile[]>([]);
  documents  = signal<Document[]>([]);
  loading    = signal(true);
  page       = signal(1);
  totalPages = signal(1);

  activeStatus: DocStatus | 'all' = 'all';
  selectedGroup = '';
  selectedType  = '';
  searchQuery   = '';
  openNew       = false;
  selectedDoc   = signal<Document | null>(null);

  sortCol = signal<string>('created_at');
  sortDir = signal<SortDir>('desc');

  isExpiring = (d?: string) => isExpiringSoon(d, 30);

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  /** Dokumenty po ewentualnym sortowaniu frontendowym */
  displayedDocuments = computed(() => {
    const docs = this.documents();
    const col  = this.sortCol();
    const dir  = this.sortDir();
    if (BACKEND_SORT_COLS.has(col)) return docs; // backend już posortował
    return [...docs].sort((a, b) => {
      let va: string = '';
      let vb: string = '';
      if (col === 'entities')   { va = (a.entities ?? []).join(','); vb = (b.entities ?? []).join(','); }
      if (col === 'doc_type')   { va = a.doc_type ?? ''; vb = b.doc_type ?? ''; }
      if (col === 'group_name') { va = a.group_display ?? a.group_name ?? ''; vb = b.group_display ?? b.group_name ?? ''; }
      if (col === 'gdpr_type')  { va = a.gdpr_type ?? ''; vb = b.gdpr_type ?? ''; }
      if (col === 'owner_name') { va = a.owner_name ?? ''; vb = b.owner_name ?? ''; }
      const cmp = va.localeCompare(vb, 'pl', { sensitivity: 'base' });
      return dir === 'asc' ? cmp : -cmp;
    });
  });

  sortBy(col: string): void {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
    if (BACKEND_SORT_COLS.has(col)) {
      this.page.set(1);
      this.loadDocuments();
    }
  }

  sortIcon(col: string): string {
    if (this.sortCol() !== col) return '↕';
    return this.sortDir() === 'asc' ? '↑' : '↓';
  }

  ngOnInit(): void {
    this.groupSvc.list().subscribe(g => this.groups.set(g));
    this.loadDocuments();

    const openId = this.route.snapshot.queryParamMap.get('open');
    if (openId) {
      this.docSvc.get(openId).subscribe(doc => this.selectedDoc.set(doc));
    }
  }

  loadDocuments(): void {
    this.loading.set(true);
    const col = this.sortCol();
    this.docSvc.list({
      search:   this.searchQuery || undefined,
      status:   this.activeStatus === 'all' ? undefined : this.activeStatus,
      group_id: this.selectedGroup || undefined,
      doc_type: (this.selectedType as any) || undefined,
      page:     this.page(),
      limit:    50,
      sort:     BACKEND_SORT_COLS.has(col) ? col : 'created_at',
      order:    BACKEND_SORT_COLS.has(col) ? this.sortDir() : 'desc',
    }).subscribe(res => {
      this.documents.set(res.data);
      this.totalPages.set(res.pages);
      this.loading.set(false);
    });
  }

  setStatus(s: DocStatus | 'all'): void {
    this.activeStatus = s;
    this.page.set(1);
    this.loadDocuments();
  }

  setPage(p: number): void {
    this.page.set(p);
    this.loadDocuments();
  }

  onSearch(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page.set(1); this.loadDocuments(); }, 350);
  }

  openDocument(doc: Document): void {
    this.docSvc.get(doc.id).subscribe(full => this.selectedDoc.set(full));
  }

  onDocumentUpdated(doc: Document): void {
    this.documents.update(docs => docs.map(d => d.id === doc.id ? { ...d, ...doc } : d));
    this.selectedDoc.set(doc);
    this.toast.success('Document updated');
  }

  onDocumentDeleted(id: string): void {
    this.documents.update(docs => docs.filter(d => d.id !== id));
    this.selectedDoc.set(null);
    this.toast.success('Document deleted');
  }

  onDocumentCreated(doc: Document): void {
    this.openNew = false;
    this.loadDocuments();
    this.toast.success(`Document ${doc.doc_number} created`);
  }
}
