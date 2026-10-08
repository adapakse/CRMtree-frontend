import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { TypeaheadComponent, TypeaheadOption } from '../../shared/components/typeahead/typeahead.component';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { ProjectFinanceFormatService } from '../../core/services/project-finance-format.service';
import { ToastService } from '../../core/services/toast.service';
import {
  ProjectAccessLevel, ProjectConfig, ProjectDetail, ProjectField,
  ProjectMember, ProjectMemberCandidate, ProjectRole, ProjectsApiService,
} from '../../core/services/projects-api.service';
import { ProjectDelayBadgeComponent } from '../../shared/components/project-deadlines/project-delay-badge.component';
import { ProjectCrmLinkComponent } from './project-crm-link.component';
import { PROJECTS_SHARED_STYLES } from './projects-shared.styles';

// PM always has full access and the controller is always read-only, so the
// access level is a choice only for the two participant roles.
const ROLES_WITH_FIXED_ACCESS: ProjectRole[] = ['pm', 'controller'];

@Component({
  selector: 'wt-project-card',
  standalone: true,
  imports: [FormsModule, ProjectCrmLinkComponent, ProjectDelayBadgeComponent, TypeaheadComponent, TranslocoDirective, TranslocoPipe],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
    <section class="card block">
      <div class="block-head">
        <div class="sec-title">{{ t('card.title') }}</div>
        @if (detail().can_manage) {
          @if (isOpen()) {
            @if (!isEditing()) { <button class="btn btn-g btn-sm" (click)="startEditing()">{{ t('card.edit') }}</button> }
            <button class="btn btn-g btn-sm" (click)="closeProject()">{{ t('card.closeProject') }}</button>
          } @else {
            <button class="btn btn-p btn-sm" (click)="reopenProject()">{{ t('card.reopenProject') }}</button>
          }
        }
      </div>

      @if (isEditing()) {
        <div class="fg">
          <label class="fl">{{ t('card.name') }} <span class="req">*</span></label>
          <input class="fi" [(ngModel)]="editedName" maxlength="200">
        </div>
        <div class="fg">
          <label class="fl">{{ t('card.description') }}</label>
          <textarea class="fta" rows="5" [(ngModel)]="editedDescription"></textarea>
        </div>
        <div class="fgrid dates-form">
          <div class="fg">
            <label class="fl">{{ t('card.startDate') }}</label>
            <input class="fi" type="date" [(ngModel)]="editedStartDate">
          </div>
          <div class="fg">
            <label class="fl">{{ t('card.endDate') }}</label>
            <input class="fi" type="date" [(ngModel)]="editedEndDate" [min]="editedStartDate">
          </div>
        </div>
        @if (hasInvalidDates()) { <p class="date-error">{{ t('card.errors.endBeforeStart') }}</p> }
        <p class="muted hint">{{ t('card.datesHint') }}</p>
        <div class="actions">
          <button class="btn btn-g btn-sm" (click)="isEditing.set(false)">{{ 'actions.cancel' | transloco }}</button>
          <button class="btn btn-p btn-sm" [disabled]="!editedName.trim() || hasInvalidDates()" (click)="saveProject()">{{ 'actions.save' | transloco }}</button>
        </div>
      } @else {
        <div class="project-name">
          <span class="mono">{{ detail().project.key }}</span> {{ detail().project.name }}
          @if (!isOpen()) { <span class="pill closed">{{ t('card.closedBadge') }}</span> }
        </div>
        <p class="description">{{ detail().project.description || t('card.noDescription') }}</p>
        <div class="dates">
          <span><span class="date-label">{{ t('card.startDate') }}</span> {{ format.date(detail().project.start_date) }}</span>
          <span><span class="date-label">{{ t('card.endDate') }}</span> {{ format.date(detail().project.end_date) }}</span>
          <wt-project-delay-badge [schedule]="detail().project" display="both" />
        </div>
      }
      <wt-project-crm-link [detail]="detail()" (changed)="changed.emit()" />
    </section>

    <section class="card block">
      <div class="sec-title">{{ t('card.members.title') }}</div>
      <div class="tw">
        <table class="grid">
          <thead>
            <tr>
              <th>{{ t('card.members.person') }}</th><th>{{ t('card.members.email') }}</th><th>{{ t('card.members.phone') }}</th>
              <th>{{ t('card.members.companyAndDepartment') }}</th><th>{{ t('card.members.role') }}</th>
              <th>{{ t('card.members.accessLevel') }}</th><th></th>
            </tr>
          </thead>
          <tbody>
            @for (member of detail().members; track member.user_id) {
              <tr>
                <td>
                  <strong>{{ member.display_name }}</strong>
                  @if (!member.is_active) { <span class="muted"> {{ t('card.members.inactive') }}</span> }
                </td>
                <td><a [href]="'mailto:' + member.email">{{ member.email }}</a></td>
                <td>
                  @if (member.phone) { <a [href]="'tel:' + member.phone">{{ member.phone }}</a> } @else { <span class="muted">—</span> }
                </td>
                <td>{{ companyAndDepartment(member) }}</td>
                <td>
                  @if (canEditMembers()) {
                    <select class="fsel compact" [ngModel]="member.role" (ngModelChange)="changeRole(member, $event)">
                      @for (role of rolesFor(member.is_external); track role) {
                        <option [ngValue]="role">{{ t('labels.roles.' + role) }}</option>
                      }
                    </select>
                  } @else { {{ t('labels.roles.' + member.role) }} }
                </td>
                <td>
                  @if (canEditMembers() && !hasFixedAccess(member.role)) {
                    <select class="fsel compact" [ngModel]="member.access_level" (ngModelChange)="changeAccessLevel(member, $event)">
                      <option ngValue="full">{{ t('labels.accessLevels.full') }}</option>
                      <option ngValue="read">{{ t('labels.accessLevels.read') }}</option>
                    </select>
                  } @else { {{ t('labels.accessLevels.' + member.access_level) }} }
                </td>
                <td class="row-action">
                  @if (canEditMembers()) { <button class="link-danger" (click)="removeMember(member)">{{ t('card.members.remove') }}</button> }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (canEditMembers()) {
        <div class="add-row">
          <wt-typeahead #memberSearch [search]="searchCandidates"
                        [placeholder]="t('card.members.searchPlaceholder')"
                        (picked)="onCandidatePicked($event)" />
          <select class="fsel" [(ngModel)]="newMemberRole">
            @for (role of rolesFor(newMember()?.is_external ?? false); track role) {
              <option [ngValue]="role">{{ t('labels.roles.' + role) }}</option>
            }
          </select>
          <select class="fsel" [(ngModel)]="newMemberAccessLevel" [disabled]="hasFixedAccess(newMemberRole)">
            <option ngValue="full">{{ t('labels.accessLevels.full') }}</option>
            <option ngValue="read">{{ t('labels.accessLevels.read') }}</option>
          </select>
          <button class="btn btn-p btn-sm" [disabled]="!newMember()" (click)="addMember()">{{ t('card.members.add') }}</button>
        </div>
      }
    </section>

    @if (detail().can_manage || detail().fields.length > 0) {
      <section class="card block">
        <div class="sec-title">{{ t('card.fields.title') }}</div>
        @if (detail().fields.length === 0) {
          <p class="muted">{{ t('card.fields.empty') }}</p>
        } @else {
          <div class="tw">
            <table class="grid">
              <thead><tr><th>{{ t('card.fields.field') }}</th><th>{{ t('card.fields.type') }}</th><th>{{ t('card.fields.required') }}</th><th></th></tr></thead>
              <tbody>
                @for (field of detail().fields; track field.field_definition_id) {
                  <tr>
                    <td>{{ field.name }}</td>
                    <td>{{ t('labels.fieldTypes.' + field.field_type) }}</td>
                    <td>
                      <input type="checkbox" [checked]="field.is_required" [disabled]="!canEditMembers()"
                             (change)="toggleFieldRequired(field)">
                    </td>
                    <td class="row-action">
                      @if (canEditMembers()) { <button class="link-danger" (click)="removeField(field)">{{ t('card.fields.remove') }}</button> }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        @if (canEditMembers() && availableFieldDefinitions().length > 0) {
          <div class="add-row fields">
            <select class="fsel" [(ngModel)]="newFieldId">
              <option [ngValue]="null">{{ t('card.fields.selectPlaceholder') }}</option>
              @for (definition of availableFieldDefinitions(); track definition.id) {
                <option [ngValue]="definition.id">{{ definition.name }} ({{ t('labels.fieldTypes.' + definition.field_type) }})</option>
              }
            </select>
            <label class="required-toggle"><input type="checkbox" [(ngModel)]="isNewFieldRequired"> {{ t('card.fields.requiredToggle') }}</label>
            <button class="btn btn-p btn-sm" [disabled]="!newFieldId" (click)="addField()">{{ t('card.fields.add') }}</button>
          </div>
        } @else if (canEditMembers()) {
          <p class="muted">
            {{ t('card.fields.noneAvailable') }}
          </p>
        }
      </section>
    }
    </ng-container>
  `,
  styles: [PROJECTS_SHARED_STYLES, `
    :host { display:flex; flex-direction:column; gap:16px; height:auto; }
    .block { padding:18px 20px; display:flex; flex-direction:column; gap:12px; }
    .block-head { display:flex; align-items:center; gap:8px; }
    .block-head .sec-title { flex:1; margin:0; }
    .project-name { font-size:17px; font-weight:700; color:var(--gray-900); display:flex; align-items:center; gap:8px; }
    .description { margin:0; font-size:13.5px; color:var(--gray-700); white-space:pre-wrap; }
    .actions { display:flex; justify-content:flex-end; gap:8px; }
    .dates { display:flex; flex-wrap:wrap; align-items:baseline; gap:6px 20px; font-size:13px; color:var(--gray-800); }
    .date-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; color:var(--gray-400); margin-right:4px; }
    .dates-form { max-width:420px; }
    .date-error { margin:0; font-size:12px; color:#DC2626; }
    .hint { margin:0; font-size:12px; }
    .pill.closed { background:var(--gray-100); color:var(--gray-500); }
    .compact { padding:4px 8px; font-size:12.5px; width:auto; }
    .row-action { text-align:right; }
    .link-danger { border:none; background:none; color:#B91C1C; font-size:12.5px; cursor:pointer; font-family:inherit; }
    .add-row { display:grid; grid-template-columns:2.4fr 1fr .7fr auto; gap:8px; align-items:center; }
    .add-row.fields { grid-template-columns:1.6fr auto auto; justify-content:start; }
    .required-toggle { display:flex; align-items:center; gap:6px; font-size:13px; color:var(--gray-700); }
    a { color:var(--accent-blue, #3B82F6); text-decoration:none; }
  `],
})
export class ProjectCardComponent {
  private readonly api = inject(ProjectsApiService);
  readonly format = inject(ProjectFinanceFormatService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly detail = input.required<ProjectDetail>();
  readonly config = input.required<ProjectConfig>();
  /** Emitted after any change so the parent reloads the project. */
  readonly changed = output<void>();

  readonly isEditing = signal(false);
  /** The person picked in the search field, waiting for a role before being added. */
  readonly newMember = signal<ProjectMemberCandidate | null>(null);
  private readonly memberSearch = viewChild<TypeaheadComponent<ProjectMemberCandidate>>('memberSearch');

  readonly isOpen = computed(() => this.detail().project.status === 'open');
  readonly canEditMembers = computed(() => this.detail().can_manage && this.isOpen());
  readonly availableFieldDefinitions = computed(() => {
    const attachedIds = new Set(this.detail().fields.map(field => field.field_definition_id));
    return this.config().field_definitions.filter(definition => definition.is_active && !attachedIds.has(definition.id));
  });

  editedName = '';
  editedDescription = '';
  editedStartDate = '';
  editedEndDate = '';
  newMemberRole: ProjectRole = 'internal_participant';
  newMemberAccessLevel: ProjectAccessLevel = 'full';
  newFieldId: string | null = null;
  isNewFieldRequired = false;

  private get projectId(): string {
    return this.detail().project.id;
  }

  companyAndDepartment(member: ProjectMember): string {
    return [member.company, member.department].filter(Boolean).join(' / ') || '—';
  }

  hasFixedAccess(role: ProjectRole): boolean {
    return ROLES_WITH_FIXED_ACCESS.includes(role);
  }

  rolesFor(isExternalAccount: boolean): ProjectRole[] {
    return isExternalAccount ? ['external_participant', 'controller'] : ['pm', 'internal_participant', 'controller'];
  }

  startEditing(): void {
    this.editedName = this.detail().project.name;
    this.editedDescription = this.detail().project.description ?? '';
    this.editedStartDate = this.detail().project.start_date ?? '';
    this.editedEndDate = this.detail().project.end_date ?? '';
    this.isEditing.set(true);
  }

  hasInvalidDates(): boolean {
    return !!this.editedStartDate && !!this.editedEndDate && this.editedEndDate < this.editedStartDate;
  }

  saveProject(): void {
    const payload = {
      name: this.editedName.trim(),
      description: this.editedDescription.trim() || null,
      start_date: this.editedStartDate || null,
      end_date: this.editedEndDate || null,
    };
    this.api.updateProject(this.projectId, payload).subscribe({
      next: () => { this.isEditing.set(false); this.changed.emit(); },
      error: err => this.showError(err, 'projects.card.errors.saveProjectFailed'),
    });
  }

  closeProject(): void {
    if (!confirm(this.transloco.translate('projects.card.closeConfirm'))) return;
    this.api.closeProject(this.projectId).subscribe({
      next: () => this.changed.emit(),
      error: err => this.showError(err, 'projects.card.errors.closeProjectFailed'),
    });
  }

  reopenProject(): void {
    this.api.reopenProject(this.projectId).subscribe({
      next: () => this.changed.emit(),
      error: err => this.showError(err, 'projects.card.errors.reopenProjectFailed'),
    });
  }

  readonly searchCandidates = (term: string): Observable<TypeaheadOption<ProjectMemberCandidate>[]> =>
    this.api.listMemberCandidates(this.projectId, term).pipe(
      map(candidates => candidates.map(candidate => ({
        id: candidate.id,
        label: candidate.display_name,
        hint: [candidate.email, candidate.company, candidate.is_external ? this.transloco.translate('projects.card.members.externalAccount') : null]
          .filter(Boolean).join(' · '),
        value: candidate,
      }))),
    );

  onCandidatePicked(option: TypeaheadOption<ProjectMemberCandidate>): void {
    this.newMember.set(option.value);
    this.newMemberRole = option.value.is_external ? 'external_participant' : 'internal_participant';
  }

  addMember(): void {
    const member = this.newMember();
    if (!member) return;
    const payload = { user_id: member.id, role: this.newMemberRole, access_level: this.newMemberAccessLevel };
    this.api.addMember(this.projectId, payload).subscribe({
      next: () => {
        this.newMember.set(null);
        this.memberSearch()?.clear();
        this.changed.emit();
      },
      error: err => this.showError(err, 'projects.card.errors.addMemberFailed'),
    });
  }

  changeRole(member: ProjectMember, role: ProjectRole): void {
    this.api.updateMember(this.projectId, member.user_id, { role }).subscribe({
      next: () => this.changed.emit(),
      // Reload also on failure so the select snaps back to the stored role.
      error: err => { this.showError(err, 'projects.card.errors.changeRoleFailed'); this.changed.emit(); },
    });
  }

  changeAccessLevel(member: ProjectMember, accessLevel: ProjectAccessLevel): void {
    this.api.updateMember(this.projectId, member.user_id, { access_level: accessLevel }).subscribe({
      next: () => this.changed.emit(),
      error: err => { this.showError(err, 'projects.card.errors.changeAccessLevelFailed'); this.changed.emit(); },
    });
  }

  removeMember(member: ProjectMember): void {
    if (!confirm(this.transloco.translate('projects.card.members.removeConfirm', { name: member.display_name }))) return;
    this.api.removeMember(this.projectId, member.user_id).subscribe({
      next: () => this.changed.emit(),
      error: err => this.showError(err, 'projects.card.errors.removeMemberFailed'),
    });
  }

  addField(): void {
    if (!this.newFieldId) return;
    const fields = [...this.currentFieldPayload(), { field_definition_id: this.newFieldId, is_required: this.isNewFieldRequired }];
    this.newFieldId = null;
    this.isNewFieldRequired = false;
    this.saveFields(fields);
  }

  toggleFieldRequired(field: ProjectField): void {
    this.saveFields(this.currentFieldPayload().map(item =>
      item.field_definition_id === field.field_definition_id ? { ...item, is_required: !item.is_required } : item));
  }

  removeField(field: ProjectField): void {
    if (!confirm(this.transloco.translate('projects.card.fields.removeConfirm', { name: field.name }))) return;
    this.saveFields(this.currentFieldPayload().filter(item => item.field_definition_id !== field.field_definition_id));
  }

  private currentFieldPayload(): { field_definition_id: string; is_required: boolean }[] {
    return this.detail().fields.map(field => ({
      field_definition_id: field.field_definition_id, is_required: field.is_required,
    }));
  }

  private saveFields(fields: { field_definition_id: string; is_required: boolean }[]): void {
    this.api.replaceProjectFields(this.projectId, fields).subscribe({
      next: () => this.changed.emit(),
      error: err => { this.showError(err, 'projects.card.errors.saveFieldsFailed'); this.changed.emit(); },
    });
  }

  private showError(err: { error?: { error?: string } }, fallbackKey: string): void {
    this.toast.error(err?.error?.error ?? this.transloco.translate(fallbackKey));
  }
}
