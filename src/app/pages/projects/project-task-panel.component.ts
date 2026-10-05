import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';
import {
  MoneyValue, ProjectConfig, ProjectCustomValue, ProjectField, ProjectFinanceAccess, ProjectMember, ProjectReminderType, ProjectTask,
  ProjectTaskDetail, ProjectTaskHistoryEntry, ProjectTaskPayload, ProjectTaskPermissions, ProjectsApiService,
} from '../../core/services/projects-api.service';
import { AddToCalendarComponent } from '../../shared/components/add-to-calendar/add-to-calendar.component';
import { projectTaskCalendarEntry } from '../../shared/utils/calendar-export.util';
import { ProjectChatComponent } from './project-chat.component';
import { ProjectTaskCostsComponent } from './project-task-costs.component';
import { PROJECTS_SHARED_STYLES } from './projects-shared.styles';

const CURRENCIES = ['PLN', 'EUR', 'USD', 'GBP', 'CHF', 'CZK'];
const DEFAULT_CURRENCY = 'PLN';

const REMINDER_OPTIONS: { value: ProjectReminderType; labelKey: string }[] = [
  { value: 'at_due', labelKey: 'labels.reminders.at_due' },
  { value: '1d_before', labelKey: 'labels.reminders.1d_before' },
  { value: '2d_before', labelKey: 'labels.reminders.2d_before' },
  { value: '3d_before', labelKey: 'labels.reminders.3d_before' },
  { value: 'custom', labelKey: 'labels.reminders.custom' },
];

// Value for <input type="datetime-local">: local time without a zone.
function toLocalDateTimeInput(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const HISTORY_FIELD_LABEL_KEYS: Record<string, string> = {
  name: 'panel.history.fields.name', description: 'panel.history.fields.description',
  type_id: 'panel.history.fields.type', status_id: 'panel.history.fields.status',
  priority_id: 'panel.history.fields.priority', start_date: 'panel.history.fields.startDate',
  end_date: 'panel.history.fields.endDate', parent_task_id: 'panel.history.fields.parentTask',
  assignee_ids: 'panel.history.fields.assignees', custom_values: 'panel.history.fields.customFields',
  reminder_type: 'panel.history.fields.reminder',
};

interface TaskForm {
  name: string;
  description: string;
  type_id: string | null;
  status_id: string | null;
  priority_id: string | null;
  start_date: string | null;
  end_date: string | null;
  parent_task_id: string | null;
  assignee_ids: string[];
  reminder_type: ProjectReminderType | null;
  /** Only for the "custom" reminder; bound to a datetime-local input. */
  reminder_at: string;
  // Keyed by field definition id. Money fields keep amount and currency apart
  // so each can be bound to its own input.
  values: Record<string, string | number | null>;
  currencies: Record<string, string>;
}

// A new task is created by the PM, who may set everything.
const CREATE_PERMISSIONS: ProjectTaskPermissions = {
  can_edit_content: true, can_edit_structure: true, allowed_status_ids: [],
};

@Component({
  selector: 'wt-project-task-panel',
  standalone: true,
  imports: [
    FormsModule, DatePipe, ProjectChatComponent, ProjectTaskCostsComponent, AddToCalendarComponent, TranslocoDirective, TranslocoPipe,
  ],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      <div class="overlay" (click)="closed.emit()">
        <aside class="panel" (click)="$event.stopPropagation()">
          <header class="panel-head">
            <div>
              <div class="mono">{{ taskLabel() }}</div>
              <div class="mot">{{ isCreating() ? t('panel.newTask') : form.name }}</div>
            </div>
            <button class="mox" (click)="closed.emit()">✕</button>
          </header>

          @if (isLoading()) {
            <div class="empty-state">{{ 'states.loading' | transloco }}</div>
          } @else {
            <div class="panel-body">
              <div class="fg">
                <label class="fl">{{ t('panel.fields.name') }} <span class="req">*</span></label>
                <input class="fi" [(ngModel)]="form.name" maxlength="300" [disabled]="!permissions().can_edit_content">
              </div>
              <div class="fg">
                <label class="fl">{{ t('panel.fields.description') }}</label>
                <textarea class="fta" rows="4" [(ngModel)]="form.description" [disabled]="!permissions().can_edit_content"></textarea>
              </div>

              <div class="fgrid">
                <div class="fg">
                  <label class="fl">{{ t('panel.fields.status') }}</label>
                  <select class="fsel" [(ngModel)]="form.status_id" [disabled]="selectableStatuses().length < 2">
                    @for (status of selectableStatuses(); track status.id) {
                      <option [ngValue]="status.id">{{ status.name }}</option>
                    }
                  </select>
                </div>
                <div class="fg">
                  <label class="fl">{{ t('panel.fields.type') }}</label>
                  <select class="fsel" [(ngModel)]="form.type_id" [disabled]="!permissions().can_edit_content">
                    <option [ngValue]="null">—</option>
                    @for (type of selectableTypes(); track type.id) { <option [ngValue]="type.id">{{ type.name }}</option> }
                  </select>
                </div>
                <div class="fg">
                  <label class="fl">{{ t('panel.fields.priority') }}</label>
                  <select class="fsel" [(ngModel)]="form.priority_id" [disabled]="!permissions().can_edit_content">
                    <option [ngValue]="null">—</option>
                    @for (priority of selectablePriorities(); track priority.id) {
                      <option [ngValue]="priority.id">{{ priority.name }}</option>
                    }
                  </select>
                </div>
                <div class="fg">
                  <label class="fl">{{ t('panel.fields.parentTask') }}</label>
                  <select class="fsel" [(ngModel)]="form.parent_task_id" [disabled]="!permissions().can_edit_structure">
                    <option [ngValue]="null">{{ t('panel.fields.noParent') }}</option>
                    @for (candidate of parentCandidates(); track candidate.id) {
                      <option [ngValue]="candidate.id">{{ projectKey() }}-{{ candidate.task_number }} {{ candidate.name }}</option>
                    }
                  </select>
                </div>
                <div class="fg">
                  <label class="fl">{{ t('panel.fields.startDate') }}</label>
                  <input class="fi" type="date" [(ngModel)]="form.start_date" [disabled]="!permissions().can_edit_content">
                </div>
                <div class="fg">
                  <label class="fl">{{ t('panel.fields.endDate') }}</label>
                  <input class="fi" type="date" [(ngModel)]="form.end_date" [disabled]="!permissions().can_edit_content">
                </div>
              </div>

              <div class="fgrid">
                <div class="fg">
                  <label class="fl">{{ t('panel.reminder.label') }}</label>
                  <select class="fsel" [(ngModel)]="form.reminder_type" [disabled]="!permissions().can_edit_content">
                    <option [ngValue]="null">{{ t('panel.reminder.none') }}</option>
                    @for (option of reminderOptions; track option.value) {
                      <option [ngValue]="option.value">{{ t(option.labelKey) }}</option>
                    }
                  </select>
                </div>
                @if (form.reminder_type === 'custom') {
                  <div class="fg">
                    <label class="fl">{{ t('panel.reminder.customDate') }}</label>
                    <input class="fi" type="datetime-local" [(ngModel)]="form.reminder_at" [disabled]="!permissions().can_edit_content">
                  </div>
                }
              </div>
              @if (form.reminder_type && form.reminder_type !== 'custom') {
                <div class="field-hint">
                  {{ t('panel.reminder.hint') }}
                </div>
              }

              <div class="fg">
                <label class="fl">{{ t('panel.fields.assignees') }}</label>
                <div class="assignee-list">
                  @for (member of members(); track member.user_id) {
                    <label class="assignee">
                      <input type="checkbox" [checked]="form.assignee_ids.includes(member.user_id)"
                             [disabled]="!permissions().can_edit_structure" (change)="toggleAssignee(member.user_id)">
                      {{ member.display_name }}
                    </label>
                  }
                </div>
              </div>

              @if (fields().length > 0 || canAddFields()) {
                <div class="sec-title">{{ t('panel.customFields.title') }}</div>
              }
              @if (fields().length > 0) {
                <div class="fgrid">
                  @for (field of fields(); track field.field_definition_id) {
                    <div class="fg">
                      <label class="fl">{{ field.name }} @if (field.is_required) { <span class="req">*</span> }</label>
                      @switch (field.field_type) {
                        @case ('text') {
                          <input class="fi" [(ngModel)]="form.values[field.field_definition_id]" [disabled]="!permissions().can_edit_content">
                        }
                        @case ('number') {
                          <input class="fi" type="number" [(ngModel)]="form.values[field.field_definition_id]" [disabled]="!permissions().can_edit_content">
                        }
                        @case ('date') {
                          <input class="fi" type="date" [(ngModel)]="form.values[field.field_definition_id]" [disabled]="!permissions().can_edit_content">
                        }
                        @case ('list') {
                          <select class="fsel" [(ngModel)]="form.values[field.field_definition_id]" [disabled]="!permissions().can_edit_content">
                            <option [ngValue]="null">—</option>
                            @for (option of field.options; track option) { <option [ngValue]="option">{{ option }}</option> }
                          </select>
                        }
                        @case ('money') {
                          <div class="money">
                            <input class="fi" type="number" step="0.01" [(ngModel)]="form.values[field.field_definition_id]"
                                   [disabled]="!permissions().can_edit_content">
                            <select class="fsel" [(ngModel)]="form.currencies[field.field_definition_id]"
                                    [disabled]="!permissions().can_edit_content">
                              @for (currency of currencies; track currency) { <option [ngValue]="currency">{{ currency }}</option> }
                            </select>
                          </div>
                        }
                      }
                    </div>
                  }
                </div>
              }

              @if (canAddFields()) {
                @if (availableFieldDefinitions().length > 0) {
                  <div class="add-field">
                    <select class="fsel" [(ngModel)]="newFieldId">
                      <option [ngValue]="null">{{ t('panel.customFields.selectField') }}</option>
                      @for (definition of availableFieldDefinitions(); track definition.id) {
                        <option [ngValue]="definition.id">{{ definition.name }}</option>
                      }
                    </select>
                    <button class="btn btn-g btn-sm" [disabled]="!newFieldId" (click)="addField()">{{ t('panel.customFields.addButton') }}</button>
                  </div>
                  <div class="field-hint">{{ t('panel.customFields.addHint') }}</div>
                } @else {
                  <div class="field-hint">
                    {{ t('panel.customFields.noneAvailable') }}
                  </div>
                }
              }

              @if (costsAccess(); as financeAccess) {
                <wt-project-task-costs
                  [projectId]="projectId()" [projectKey]="projectKey()" [taskId]="taskId()!" [access]="financeAccess"
                  [categories]="config().cost_categories" [tasks]="tasks()" (costsChanged)="costsChanged.emit()" />
              }

              @if (taskId(); as existingTaskId) {
                <div class="sec-title">{{ t('panel.chatTitle') }}</div>
                <wt-project-chat [projectId]="projectId()" [taskId]="existingTaskId" [canPost]="isProjectOpen()" />
              }

              @if (!isCreating()) {
                <button class="history-toggle" (click)="toggleHistory()">
                  {{ isHistoryOpen() ? '▾' : '▸' }} {{ t('panel.history.title') }}
                </button>
                @if (isHistoryOpen()) {
                  <ul class="history">
                    @for (entry of history(); track entry.id) {
                      <li>
                        <span class="muted">{{ entry.created_at | date:'dd.MM.yyyy HH:mm' }}</span>
                        <strong>{{ entry.user_name ?? t('panel.history.systemUser') }}</strong>
                        {{ describeHistoryEntry(entry) }}
                      </li>
                    } @empty {
                      <li class="muted">{{ t('panel.history.empty') }}</li>
                    }
                  </ul>
                }
              }
            </div>

            <footer class="panel-foot">
              <wt-add-to-calendar [entry]="calendarEntry()" [showLabel]="true" />
              <span class="foot-spacer"></span>
              <button class="btn btn-g" (click)="closed.emit()">{{ 'actions.close' | transloco }}</button>
              @if (canSave()) {
                <button class="btn btn-p" [disabled]="!form.name.trim() || isSaving()" (click)="save()">
                  {{ isSaving() ? t('panel.saving') : (isCreating() ? t('panel.createTask') : ('actions.save' | transloco)) }}
                </button>
              }
            </footer>
          }
        </aside>
      </div>
    </ng-container>
  `,
  styles: [PROJECTS_SHARED_STYLES, `
    :host { display:block; height:auto; }
    .overlay { position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:200; display:flex; justify-content:flex-end; }
    .panel { width:620px; max-width:100vw; height:100%; background:white; display:flex; flex-direction:column; box-shadow:var(--shadow-lg); }
    .panel-head { display:flex; align-items:flex-start; gap:12px; padding:18px 24px 14px; border-bottom:1px solid var(--gray-200); }
    .panel-body { flex:1; overflow-y:auto; padding:20px 24px; display:flex; flex-direction:column; gap:14px; }
    .panel-body > * { flex-shrink:0; }
    .panel-foot { padding:14px 24px; border-top:1px solid var(--gray-200); display:flex; align-items:center; gap:8px; }
    .foot-spacer { flex:1; }
    .assignee-list { display:flex; flex-wrap:wrap; gap:6px 16px; }
    .assignee { display:flex; align-items:center; gap:6px; font-size:13px; color:var(--gray-700); }
    .money { display:grid; grid-template-columns:1fr 90px; gap:8px; }
    .add-field { display:flex; gap:8px; align-items:center; }
    .add-field .fsel { max-width:280px; }
    .field-hint { font-size:12px; color:var(--gray-400); }
    .history-toggle { align-self:flex-start; border:none; background:none; color:var(--gray-600); font-size:12.5px; font-weight:600; cursor:pointer; padding:0; font-family:inherit; }
    .history { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px; font-size:12.5px; color:var(--gray-700); }
    input:disabled, select:disabled, textarea:disabled { opacity:.75; cursor:not-allowed; }
  `],
})
export class ProjectTaskPanelComponent implements OnInit {
  private readonly api = inject(ProjectsApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly projectId = input.required<string>();
  readonly projectKey = input.required<string>();
  readonly projectName = input('');
  /** null opens the panel for a new task. */
  readonly taskId = input.required<string | null>();
  readonly config = input.required<ProjectConfig>();
  readonly members = input.required<ProjectMember[]>();
  readonly fields = input.required<ProjectField[]>();
  readonly tasks = input.required<ProjectTask[]>();
  readonly isProjectOpen = input(true);
  /** The viewer's finance rights in this project; null hides every trace of costs. */
  readonly finance = input<ProjectFinanceAccess | null>(null);

  readonly closed = output<void>();
  readonly saved = output<void>();
  /** Emitted after the PM adds a custom field to the project from this panel. */
  readonly fieldsChanged = output<void>();
  /** Emitted after a cost item of this task was added, changed or deleted. */
  readonly costsChanged = output<void>();

  readonly currencies = CURRENCIES;
  readonly reminderOptions = REMINDER_OPTIONS;
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly isHistoryOpen = signal(false);
  readonly history = signal<ProjectTaskHistoryEntry[]>([]);
  private readonly loadedTask = signal<ProjectTaskDetail | null>(null);

  readonly isCreating = computed(() => this.taskId() === null);
  readonly permissions = computed(() => this.loadedTask()?.permissions ?? CREATE_PERMISSIONS);
  readonly taskLabel = computed(() => {
    const task = this.loadedTask();
    return task ? `${this.projectKey()}-${task.task_number}` : this.projectKey();
  });

  // Dictionary items stay selectable when inactive only if the task already uses them.
  readonly selectableTypes = computed(() =>
    this.config().types.filter(type => type.is_active || type.id === this.loadedTask()?.type_id));
  readonly selectablePriorities = computed(() =>
    this.config().priorities.filter(priority => priority.is_active || priority.id === this.loadedTask()?.priority_id));
  readonly selectableStatuses = computed(() => {
    const task = this.loadedTask();
    if (!task) return this.config().statuses.filter(status => status.is_active);
    const allowed = new Set([task.status_id, ...task.permissions.allowed_status_ids]);
    return this.config().statuses.filter(status => allowed.has(status.id));
  });
  readonly parentCandidates = computed(() => {
    const excluded = this.descendantIdsOf(this.taskId());
    return this.tasks().filter(task => !excluded.has(task.id));
  });
  readonly canAddFields = computed(() => this.isProjectOpen() && this.permissions().can_edit_structure);
  readonly availableFieldDefinitions = computed(() => {
    const attachedIds = new Set(this.fields().map(field => field.field_definition_id));
    return this.config().field_definitions.filter(definition => definition.is_active && !attachedIds.has(definition.id));
  });
  // Built from the saved task, not the form: the export reflects what is stored.
  readonly calendarEntry = computed(() => {
    const task = this.loadedTask();
    if (!task) return null;
    return projectTaskCalendarEntry({
      projectId: this.projectId(), projectKey: this.projectKey(), projectName: this.projectName(),
      taskId: task.id, taskNumber: task.task_number, name: task.name, endDate: task.end_date,
    });
  });
  // Costs are shown to finance readers on every saved task. A participant who
  // may only add own costs gets the section just on tasks assigned to them —
  // the API refuses their cost on any other task.
  readonly costsAccess = computed(() => {
    const finance = this.finance();
    const task = this.loadedTask();
    if (!finance || !task) return null;
    if (finance.can_read) return finance;
    const myId = this.auth.user()?.id;
    const isAssignedToMe = task.assignees.some(assignee => assignee.user_id === myId);
    return finance.can_add_own_costs && isAssignedToMe ? finance : null;
  });
  readonly canSave = computed(() => {
    const permissions = this.permissions();
    return permissions.can_edit_content || permissions.can_edit_structure || permissions.allowed_status_ids.length > 0;
  });

  form: TaskForm = this.emptyForm();
  newFieldId: string | null = null;

  ngOnInit(): void {
    const taskId = this.taskId();
    if (taskId === null) {
      const activeStatuses = this.config().statuses.filter(status => status.is_active);
      const initialStatus = activeStatuses.find(status => status.category === 'todo') ?? activeStatuses[0];
      this.form.status_id = initialStatus?.id ?? null;
      for (const field of this.fields()) {
        if (field.field_type === 'money') this.form.currencies[field.field_definition_id] = DEFAULT_CURRENCY;
      }
      this.isLoading.set(false);
      return;
    }
    this.api.getTask(this.projectId(), taskId).subscribe({
      next: task => {
        this.applyLoadedTask(task);
        this.isLoading.set(false);
      },
      error: err => {
        this.toast.error(err?.error?.error ?? this.transloco.translate('projects.panel.loadFailed'));
        this.closed.emit();
      },
    });
  }

  toggleAssignee(userId: string): void {
    const selected = this.form.assignee_ids;
    this.form.assignee_ids = selected.includes(userId) ? selected.filter(id => id !== userId) : [...selected, userId];
  }

  addField(): void {
    const fieldId = this.newFieldId;
    if (!fieldId) return;
    const fields = [
      ...this.fields().map(field => ({ field_definition_id: field.field_definition_id, is_required: field.is_required })),
      { field_definition_id: fieldId, is_required: false },
    ];
    this.api.replaceProjectFields(this.projectId(), fields).subscribe({
      next: () => {
        this.newFieldId = null;
        this.form.currencies[fieldId] = DEFAULT_CURRENCY;
        this.fieldsChanged.emit();
      },
      error: err => this.toast.error(err?.error?.error ?? this.transloco.translate('projects.panel.customFields.addFailed')),
    });
  }

  toggleHistory(): void {
    const willOpen = !this.isHistoryOpen();
    this.isHistoryOpen.set(willOpen);
    if (willOpen) this.loadHistory();
  }

  describeHistoryEntry(entry: ProjectTaskHistoryEntry): string {
    if (entry.action === 'project_task_created') return this.transloco.translate('projects.panel.history.created');
    const fields = Object.keys(entry.after_state ?? {})
      .map(field => {
        const labelKey = HISTORY_FIELD_LABEL_KEYS[field];
        return labelKey ? this.transloco.translate(`projects.${labelKey}`) : field;
      })
      .join(', ');
    const statusChange = this.describeStatusChange(entry);
    return statusChange
      ? this.transloco.translate('projects.panel.history.changedWithStatus', { fields, ...statusChange })
      : this.transloco.translate('projects.panel.history.changed', { fields });
  }

  save(): void {
    const taskId = this.taskId();
    const payload = this.buildPayload();
    const request = taskId === null
      ? this.api.createTask(this.projectId(), payload)
      : this.api.updateTask(this.projectId(), taskId, payload);

    this.isSaving.set(true);
    request.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.toast.success(this.transloco.translate(taskId === null ? 'projects.panel.created' : 'projects.panel.saved'));
        this.saved.emit();
      },
      error: err => {
        this.isSaving.set(false);
        this.toast.error(err?.error?.error ?? this.transloco.translate('projects.panel.saveFailed'));
      },
    });
  }

  private emptyForm(): TaskForm {
    return {
      name: '', description: '', type_id: null, status_id: null, priority_id: null,
      start_date: null, end_date: null, parent_task_id: null, assignee_ids: [],
      reminder_type: null, reminder_at: '',
      values: {}, currencies: {},
    };
  }

  private applyLoadedTask(task: ProjectTaskDetail): void {
    const values: TaskForm['values'] = {};
    const currencies: TaskForm['currencies'] = {};
    for (const field of this.fields()) {
      const stored = task.custom_values[field.field_definition_id] ?? null;
      if (field.field_type === 'money') {
        const money = stored as MoneyValue | null;
        values[field.field_definition_id] = money?.amount ?? null;
        currencies[field.field_definition_id] = money?.currency ?? DEFAULT_CURRENCY;
      } else {
        values[field.field_definition_id] = stored as string | number | null;
      }
    }
    this.form = {
      name: task.name,
      description: task.description ?? '',
      type_id: task.type_id,
      status_id: task.status_id,
      priority_id: task.priority_id,
      start_date: task.start_date,
      end_date: task.end_date,
      parent_task_id: task.parent_task_id,
      assignee_ids: task.assignees.map(assignee => assignee.user_id),
      reminder_type: task.reminder_type,
      reminder_at: task.reminder_type === 'custom' && task.reminder_at ? toLocalDateTimeInput(task.reminder_at) : '',
      values,
      currencies,
    };
    this.loadedTask.set(task);
  }

  // Sends only the groups of fields this user may change; the backend rejects the rest.
  private buildPayload(): ProjectTaskPayload {
    const permissions = this.permissions();
    const payload: ProjectTaskPayload = {};
    if (permissions.can_edit_content) {
      payload.name = this.form.name.trim();
      payload.description = this.form.description.trim() || null;
      payload.type_id = this.form.type_id;
      payload.priority_id = this.form.priority_id;
      payload.start_date = this.form.start_date || null;
      payload.end_date = this.form.end_date || null;
      payload.custom_values = this.collectCustomValues();
      payload.reminder_type = this.form.reminder_type;
      if (this.form.reminder_type === 'custom') {
        payload.reminder_at = this.form.reminder_at ? new Date(this.form.reminder_at).toISOString() : null;
      }
    }
    if (permissions.can_edit_structure) {
      payload.parent_task_id = this.form.parent_task_id;
      payload.assignee_ids = this.form.assignee_ids;
    }
    if (this.form.status_id) payload.status_id = this.form.status_id;
    return payload;
  }

  private collectCustomValues(): Record<string, ProjectCustomValue> {
    const collected: Record<string, ProjectCustomValue> = {};
    for (const field of this.fields()) {
      const fieldId = field.field_definition_id;
      const value = this.form.values[fieldId];
      const isEmpty = value === null || value === undefined || value === '';
      if (isEmpty) {
        collected[fieldId] = null;
      } else if (field.field_type === 'money') {
        collected[fieldId] = { amount: Number(value), currency: this.form.currencies[fieldId] ?? DEFAULT_CURRENCY };
      } else if (field.field_type === 'number') {
        collected[fieldId] = Number(value);
      } else {
        collected[fieldId] = String(value);
      }
    }
    return collected;
  }

  private descendantIdsOf(taskId: string | null): Set<string> {
    const excluded = new Set<string>();
    if (taskId === null) return excluded;
    excluded.add(taskId);
    let hasGrown = true;
    while (hasGrown) {
      hasGrown = false;
      for (const task of this.tasks()) {
        if (task.parent_task_id && excluded.has(task.parent_task_id) && !excluded.has(task.id)) {
          excluded.add(task.id);
          hasGrown = true;
        }
      }
    }
    return excluded;
  }

  private describeStatusChange(entry: ProjectTaskHistoryEntry): { from: string; to: string } | null {
    const fromId = entry.before_state?.['status_id'];
    const toId = entry.after_state?.['status_id'];
    if (typeof fromId !== 'string' || typeof toId !== 'string') return null;
    const nameOf = (id: string) => this.config().statuses.find(status => status.id === id)?.name ?? '?';
    return { from: nameOf(fromId), to: nameOf(toId) };
  }

  private loadHistory(): void {
    const taskId = this.taskId();
    if (taskId === null) return;
    this.api.listTaskHistory(this.projectId(), taskId).subscribe({
      next: history => this.history.set(history),
      error: err => this.toast.error(err?.error?.error ?? this.transloco.translate('projects.panel.history.loadFailed')),
    });
  }
}
