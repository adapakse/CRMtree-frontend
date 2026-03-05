import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppSettingsService, AppSettingsMeta } from '../../../core/services/app-settings.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/auth/auth.service';

interface SettingField {
  key: string;
  label: string;
  description: string;
  value_type: 'number' | 'boolean' | 'string';
  category: string;
  updated_at: string;
  updated_by_name: string | null;
  draft: string;          // editable string bound to input
  dirty: boolean;
  error: string;
}

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  documents: { label: 'Documents & Expiration',  icon: '📄' },
  workflow:  { label: 'Workflow & Kanban',        icon: '🗂' },
  general:   { label: 'General / UI',             icon: '⚙️' },
};

@Component({
  selector: 'wt-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div id="topbar">
      <span class="page-title">Application Settings</span>
      <span class="tsp"></span>
      @if (dirty()) {
        <span style="font-size:12px;color:var(--orange);font-weight:500;margin-right:8px">
          ● Unsaved changes
        </span>
      }
      <button class="btn btn-p" [disabled]="saving() || !dirty()" (click)="saveAll()">
        @if (saving()) { Saving… } @else { 💾 Save Changes }
      </button>
      <button class="btn btn-g" [disabled]="!dirty()" (click)="resetDrafts()">
        Discard
      </button>
    </div>

    <div id="content">
      @if (loading()) {
        <div class="loading-overlay"><div class="spinner"></div></div>
      }

      <div style="max-width:760px">

        <!-- Info banner -->
        <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#1D4ED8;display:flex;gap:12px;align-items:flex-start">
          <span style="font-size:18px;flex-shrink:0">ℹ️</span>
          <div>
            <strong>Global application settings</strong> — changes apply to all users immediately after saving.
            These values replace hard-coded defaults throughout the application.
          </div>
        </div>

        @for (cat of categories(); track cat.key) {
          <div class="card" style="margin-bottom:20px;overflow:hidden">
            <!-- Category header -->
            <div style="padding:14px 20px;background:var(--gray-50);border-bottom:1px solid var(--gray-200);display:flex;align-items:center;gap:10px">
              <span style="font-size:18px">{{ cat.icon }}</span>
              <span style="font-family:'Sora',sans-serif;font-size:14px;font-weight:700;color:var(--gray-900)">{{ cat.label }}</span>
            </div>

            @for (field of cat.fields; track field.key; let last = $last) {
              <div [style.border-bottom]="last ? 'none' : '1px solid var(--gray-100)'"
                   style="padding:16px 20px;display:grid;grid-template-columns:1fr 220px;gap:20px;align-items:start">

                <!-- Left: label + description + meta -->
                <div>
                  <div style="font-size:13.5px;font-weight:600;color:var(--gray-900);margin-bottom:3px">
                    {{ field.label }}
                  </div>
                  <div style="font-size:12px;color:var(--gray-500);line-height:1.5;margin-bottom:6px">
                    {{ field.description }}
                  </div>
                  @if (field.updated_by_name) {
                    <div style="font-size:11px;color:var(--gray-400)">
                      Last changed by <strong>{{ field.updated_by_name }}</strong>
                      · {{ field.updated_at | date:'dd.MM.yyyy HH:mm' }}
                    </div>
                  }
                </div>

                <!-- Right: input -->
                <div style="display:flex;flex-direction:column;gap:4px">
                  @if (field.value_type === 'boolean') {
                    <select class="fsel" [(ngModel)]="field.draft"
                            (ngModelChange)="onFieldChange(field)">
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  } @else if (field.value_type === 'number') {
                    <div style="position:relative">
                      <input class="fi" type="number" min="0"
                             [(ngModel)]="field.draft"
                             (ngModelChange)="onFieldChange(field)"
                             [class.fi-err]="!!field.error"
                             style="width:100%;box-sizing:border-box;text-align:right;padding-right:12px">
                    </div>
                  } @else {
                    <input class="fi" type="text"
                           [(ngModel)]="field.draft"
                           (ngModelChange)="onFieldChange(field)"
                           [class.fi-err]="!!field.error">
                  }
                  @if (field.error) {
                    <span style="font-size:11px;color:#EF4444">{{ field.error }}</span>
                  }
                  @if (field.dirty && !field.error) {
                    <span style="font-size:11px;color:var(--orange)">● Modified</span>
                  }
                </div>
              </div>
            }
          </div>
        }

        <!-- Preview: expiration color logic -->
        <div class="card" style="padding:20px;margin-bottom:20px">
          <div style="font-family:'Sora',sans-serif;font-size:14px;font-weight:700;color:var(--gray-900);margin-bottom:14px">
            🔍 Expiration Color Preview
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:16px;height:16px;background:var(--gray-800);border-radius:3px"></div>
              <span>Expires in more than <strong>{{ previewRedDays() }}</strong> days → black (no urgency)</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:16px;height:16px;background:#DC2626;border-radius:3px"></div>
              <span>Expires in <strong>{{ previewRedDays() }}</strong> days or fewer → red (urgent)</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:16px;height:16px;background:#F59E0B;border-radius:3px"></div>
              <span>Expires in <strong>{{ previewSoonDays() }}</strong> days or fewer → "expiring soon" badge</span>
            </div>
          </div>
          <div style="margin-top:16px;padding:12px 16px;background:var(--gray-50);border-radius:8px;font-size:12px;color:var(--gray-500)">
            ℹ️ Changes take effect immediately after saving — no page reload required for Kanban and document list.
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    #topbar { height:60px;background:white;border-bottom:1px solid var(--gray-200);display:flex;align-items:center;gap:10px;padding:0 24px;flex-shrink:0; }
    .page-title { font-family:'Sora',sans-serif;font-size:17px;font-weight:700;color:var(--gray-900); }
    .tsp { flex:1; }
    #content { flex:1;overflow-y:auto;padding:24px; }
    .fi { border:1px solid var(--gray-200);border-radius:8px;padding:8px 12px;font-size:13px;font-family:inherit;outline:none;transition:border .15s; }
    .fi:focus { border-color:var(--orange); }
    .fi-err { border-color:#EF4444 !important; }
    .fsel { border:1px solid var(--gray-200);border-radius:8px;padding:8px 12px;font-size:13px;font-family:inherit;outline:none;background:white;width:100%; }
    .fsel:focus { border-color:var(--orange); }
  `],
})
export class SettingsComponent implements OnInit {
  private settingsSvc = inject(AppSettingsService);
  private toast       = inject(ToastService);
  auth                = inject(AuthService);

  loading = signal(true);
  saving  = signal(false);
  fields  = signal<SettingField[]>([]);

  dirty = computed(() => this.fields().some(f => f.dirty));

  previewRedDays  = computed(() => {
    const f = this.fields().find(x => x.key === 'expiration_red_days');
    return f ? (Number(f.draft) || 90) : 90;
  });
  previewSoonDays = computed(() => {
    const f = this.fields().find(x => x.key === 'expiration_soon_days');
    return f ? (Number(f.draft) || 30) : 30;
  });

  categories = computed(() => {
    const byCategory: Record<string, SettingField[]> = {};
    for (const f of this.fields()) {
      (byCategory[f.category] ??= []).push(f);
    }
    return Object.entries(byCategory).map(([key, flds]) => ({
      key,
      label: CATEGORY_LABELS[key]?.label ?? key,
      icon:  CATEGORY_LABELS[key]?.icon  ?? '⚙️',
      fields: flds,
    }));
  });

  ngOnInit(): void {
    this.settingsSvc.reload().then(() => {
      this.buildFields(this.settingsSvc.meta());
      this.loading.set(false);
    });
  }

  private buildFields(meta: AppSettingsMeta[]): void {
    this.fields.set(meta.map(m => ({
      key:             m.key,
      label:           m.label,
      description:     m.description,
      value_type:      m.value_type,
      category:        m.category,
      updated_at:      m.updated_at,
      updated_by_name: m.updated_by_name,
      draft:           m.value,
      dirty:           false,
      error:           '',
    })));
  }

  onFieldChange(field: SettingField): void {
    field.dirty = true;
    field.error = '';
    if (field.value_type === 'number') {
      const n = Number(field.draft);
      if (isNaN(n) || n < 0) {
        field.error = 'Must be a non-negative number';
      }
    }
    // Trigger computed re-evaluation
    this.fields.update(fs => [...fs]);
  }

  resetDrafts(): void {
    this.fields.update(fs => fs.map(f => ({
      ...f,
      draft: this.settingsSvc.meta().find(m => m.key === f.key)?.value ?? f.draft,
      dirty: false,
      error: '',
    })));
  }

  saveAll(): void {
    const dirtyFields = this.fields().filter(f => f.dirty && !f.error);
    if (dirtyFields.length === 0) return;

    const updates: Record<string, string | number | boolean> = {};
    for (const f of dirtyFields) {
      updates[f.key] = f.value_type === 'number'  ? Number(f.draft)
                     : f.value_type === 'boolean' ? f.draft === 'true'
                     : f.draft;
    }

    this.saving.set(true);
    this.settingsSvc.save(updates).subscribe({
      next: (res) => {
        this.settingsSvc.settings.set({ ...res.settings });
        this.settingsSvc.meta.set(res.meta);
        this.buildFields(res.meta);
        this.saving.set(false);
        this.toast.success(`${dirtyFields.length} setting${dirtyFields.length > 1 ? 's' : ''} saved`);
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err?.error?.error ?? 'Failed to save settings');
      },
    });
  }
}
