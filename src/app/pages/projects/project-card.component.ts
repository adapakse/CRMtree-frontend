import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../core/services/toast.service';
import {
  PROJECT_ACCESS_LEVEL_LABELS, PROJECT_ROLE_LABELS, ProjectAccessLevel, ProjectConfig, ProjectDetail, ProjectField,
  ProjectMember, ProjectMemberCandidate, ProjectRole, ProjectsApiService,
} from '../../core/services/projects-api.service';
import { PROJECTS_SHARED_STYLES } from './projects-shared.styles';

const FIELD_TYPE_LABELS: Record<ProjectField['field_type'], string> = {
  text: 'Tekst', number: 'Liczba', list: 'Lista wartości', date: 'Data', money: 'Kwota z walutą',
};

// PM always has full access and the controller is always read-only, so the
// access level is a choice only for the two participant roles.
const ROLES_WITH_FIXED_ACCESS: ProjectRole[] = ['pm', 'controller'];

@Component({
  selector: 'wt-project-card',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card block">
      <div class="block-head">
        <div class="sec-title">Karta projektu</div>
        @if (detail().can_manage) {
          @if (isOpen()) {
            @if (!isEditing()) { <button class="btn btn-g btn-sm" (click)="startEditing()">Edytuj</button> }
            <button class="btn btn-g btn-sm" (click)="closeProject()">Zamknij projekt</button>
          } @else {
            <button class="btn btn-p btn-sm" (click)="reopenProject()">Otwórz ponownie</button>
          }
        }
      </div>

      @if (isEditing()) {
        <div class="fg">
          <label class="fl">Nazwa <span class="req">*</span></label>
          <input class="fi" [(ngModel)]="editedName" maxlength="200">
        </div>
        <div class="fg">
          <label class="fl">Opis</label>
          <textarea class="fta" rows="5" [(ngModel)]="editedDescription"></textarea>
        </div>
        <div class="actions">
          <button class="btn btn-g btn-sm" (click)="isEditing.set(false)">Anuluj</button>
          <button class="btn btn-p btn-sm" [disabled]="!editedName.trim()" (click)="saveProject()">Zapisz</button>
        </div>
      } @else {
        <div class="project-name">
          <span class="mono">{{ detail().project.key }}</span> {{ detail().project.name }}
          @if (!isOpen()) { <span class="pill closed">Zamknięty</span> }
        </div>
        <p class="description">{{ detail().project.description || 'Brak opisu.' }}</p>
      }
    </section>

    <section class="card block">
      <div class="sec-title">Osoby w projekcie</div>
      <div class="tw">
        <table class="grid">
          <thead>
            <tr><th>Osoba</th><th>E-mail</th><th>Telefon</th><th>Firma / dział</th><th>Rola</th><th>Uprawnienia</th><th></th></tr>
          </thead>
          <tbody>
            @for (member of detail().members; track member.user_id) {
              <tr>
                <td>
                  <strong>{{ member.display_name }}</strong>
                  @if (!member.is_active) { <span class="muted"> (nieaktywny)</span> }
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
                        <option [ngValue]="role">{{ roleLabels[role] }}</option>
                      }
                    </select>
                  } @else { {{ roleLabels[member.role] }} }
                </td>
                <td>
                  @if (canEditMembers() && !hasFixedAccess(member.role)) {
                    <select class="fsel compact" [ngModel]="member.access_level" (ngModelChange)="changeAccessLevel(member, $event)">
                      <option ngValue="full">{{ accessLabels.full }}</option>
                      <option ngValue="read">{{ accessLabels.read }}</option>
                    </select>
                  } @else { {{ accessLabels[member.access_level] }} }
                </td>
                <td class="row-action">
                  @if (canEditMembers()) { <button class="link-danger" (click)="removeMember(member)">Usuń</button> }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (canEditMembers()) {
        <div class="add-row">
          <input class="fi" placeholder="Szukaj osoby (imię, nazwisko, e-mail, firma)…"
                 [(ngModel)]="candidateSearch" (ngModelChange)="searchCandidates()" (focus)="searchCandidates()">
          <select class="fsel" [(ngModel)]="newMemberId" (ngModelChange)="onCandidateSelected()">
            <option [ngValue]="null">— wybierz osobę —</option>
            @for (candidate of candidates(); track candidate.id) {
              <option [ngValue]="candidate.id">
                {{ candidate.display_name }} · {{ candidate.email }}{{ candidate.is_external ? ' · zewnętrzny' : '' }}
              </option>
            }
          </select>
          <select class="fsel" [(ngModel)]="newMemberRole">
            @for (role of rolesFor(isSelectedCandidateExternal()); track role) {
              <option [ngValue]="role">{{ roleLabels[role] }}</option>
            }
          </select>
          <select class="fsel" [(ngModel)]="newMemberAccessLevel" [disabled]="hasFixedAccess(newMemberRole)">
            <option ngValue="full">{{ accessLabels.full }}</option>
            <option ngValue="read">{{ accessLabels.read }}</option>
          </select>
          <button class="btn btn-p btn-sm" [disabled]="!newMemberId" (click)="addMember()">Dodaj</button>
        </div>
      }
    </section>

    @if (detail().can_manage || detail().fields.length > 0) {
      <section class="card block">
        <div class="sec-title">Pola dodatkowe zadań</div>
        @if (detail().fields.length === 0) {
          <p class="muted">Projekt nie ma pól dodatkowych.</p>
        } @else {
          <div class="tw">
            <table class="grid">
              <thead><tr><th>Pole</th><th>Typ</th><th>Wymagane</th><th></th></tr></thead>
              <tbody>
                @for (field of detail().fields; track field.field_definition_id) {
                  <tr>
                    <td>{{ field.name }}</td>
                    <td>{{ fieldTypeLabels[field.field_type] }}</td>
                    <td>
                      <input type="checkbox" [checked]="field.is_required" [disabled]="!canEditMembers()"
                             (change)="toggleFieldRequired(field)">
                    </td>
                    <td class="row-action">
                      @if (canEditMembers()) { <button class="link-danger" (click)="removeField(field)">Usuń</button> }
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
              <option [ngValue]="null">— wybierz pole —</option>
              @for (definition of availableFieldDefinitions(); track definition.id) {
                <option [ngValue]="definition.id">{{ definition.name }} ({{ fieldTypeLabels[definition.field_type] }})</option>
              }
            </select>
            <label class="required-toggle"><input type="checkbox" [(ngModel)]="isNewFieldRequired"> wymagane</label>
            <button class="btn btn-p btn-sm" [disabled]="!newFieldId" (click)="addField()">Dodaj pole</button>
          </div>
        }
      </section>
    }
  `,
  styles: [PROJECTS_SHARED_STYLES, `
    :host { display:flex; flex-direction:column; gap:16px; height:auto; }
    .block { padding:18px 20px; display:flex; flex-direction:column; gap:12px; }
    .block-head { display:flex; align-items:center; gap:8px; }
    .block-head .sec-title { flex:1; margin:0; }
    .project-name { font-size:17px; font-weight:700; color:var(--gray-900); display:flex; align-items:center; gap:8px; }
    .description { margin:0; font-size:13.5px; color:var(--gray-700); white-space:pre-wrap; }
    .actions { display:flex; justify-content:flex-end; gap:8px; }
    .pill.closed { background:var(--gray-100); color:var(--gray-500); }
    .compact { padding:4px 8px; font-size:12.5px; width:auto; }
    .row-action { text-align:right; }
    .link-danger { border:none; background:none; color:#B91C1C; font-size:12.5px; cursor:pointer; font-family:inherit; }
    .add-row { display:grid; grid-template-columns:1.4fr 1.6fr 1fr .7fr auto; gap:8px; align-items:center; }
    .add-row.fields { grid-template-columns:1.6fr auto auto; justify-content:start; }
    .required-toggle { display:flex; align-items:center; gap:6px; font-size:13px; color:var(--gray-700); }
    a { color:var(--accent-blue, #3B82F6); text-decoration:none; }
  `],
})
export class ProjectCardComponent {
  private readonly api = inject(ProjectsApiService);
  private readonly toast = inject(ToastService);

  readonly detail = input.required<ProjectDetail>();
  readonly config = input.required<ProjectConfig>();
  /** Emitted after any change so the parent reloads the project. */
  readonly changed = output<void>();

  readonly roleLabels = PROJECT_ROLE_LABELS;
  readonly accessLabels = PROJECT_ACCESS_LEVEL_LABELS;
  readonly fieldTypeLabels = FIELD_TYPE_LABELS;

  readonly isEditing = signal(false);
  readonly candidates = signal<ProjectMemberCandidate[]>([]);

  readonly isOpen = computed(() => this.detail().project.status === 'open');
  readonly canEditMembers = computed(() => this.detail().can_manage && this.isOpen());
  readonly availableFieldDefinitions = computed(() => {
    const attachedIds = new Set(this.detail().fields.map(field => field.field_definition_id));
    return this.config().field_definitions.filter(definition => definition.is_active && !attachedIds.has(definition.id));
  });

  editedName = '';
  editedDescription = '';
  candidateSearch = '';
  newMemberId: string | null = null;
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

  isSelectedCandidateExternal(): boolean {
    return this.candidates().find(candidate => candidate.id === this.newMemberId)?.is_external ?? false;
  }

  startEditing(): void {
    this.editedName = this.detail().project.name;
    this.editedDescription = this.detail().project.description ?? '';
    this.isEditing.set(true);
  }

  saveProject(): void {
    const payload = { name: this.editedName.trim(), description: this.editedDescription.trim() || null };
    this.api.updateProject(this.projectId, payload).subscribe({
      next: () => { this.isEditing.set(false); this.changed.emit(); },
      error: err => this.showError(err, 'Nie udało się zapisać projektu'),
    });
  }

  closeProject(): void {
    if (!confirm('Zamknąć projekt? Zamknięty projekt jest tylko do odczytu i znika z domyślnej listy.')) return;
    this.api.closeProject(this.projectId).subscribe({
      next: () => this.changed.emit(),
      error: err => this.showError(err, 'Nie udało się zamknąć projektu'),
    });
  }

  reopenProject(): void {
    this.api.reopenProject(this.projectId).subscribe({
      next: () => this.changed.emit(),
      error: err => this.showError(err, 'Nie udało się otworzyć projektu'),
    });
  }

  searchCandidates(): void {
    this.api.listMemberCandidates(this.projectId, this.candidateSearch.trim()).subscribe({
      next: candidates => this.candidates.set(candidates),
      error: err => this.showError(err, 'Nie udało się pobrać listy osób'),
    });
  }

  onCandidateSelected(): void {
    this.newMemberRole = this.isSelectedCandidateExternal() ? 'external_participant' : 'internal_participant';
  }

  addMember(): void {
    if (!this.newMemberId) return;
    const payload = { user_id: this.newMemberId, role: this.newMemberRole, access_level: this.newMemberAccessLevel };
    this.api.addMember(this.projectId, payload).subscribe({
      next: () => {
        this.newMemberId = null;
        this.candidates.set([]);
        this.candidateSearch = '';
        this.changed.emit();
      },
      error: err => this.showError(err, 'Nie udało się dodać osoby'),
    });
  }

  changeRole(member: ProjectMember, role: ProjectRole): void {
    this.api.updateMember(this.projectId, member.user_id, { role }).subscribe({
      next: () => this.changed.emit(),
      // Reload also on failure so the select snaps back to the stored role.
      error: err => { this.showError(err, 'Nie udało się zmienić roli'); this.changed.emit(); },
    });
  }

  changeAccessLevel(member: ProjectMember, accessLevel: ProjectAccessLevel): void {
    this.api.updateMember(this.projectId, member.user_id, { access_level: accessLevel }).subscribe({
      next: () => this.changed.emit(),
      error: err => { this.showError(err, 'Nie udało się zmienić uprawnień'); this.changed.emit(); },
    });
  }

  removeMember(member: ProjectMember): void {
    if (!confirm(`Usunąć ${member.display_name} z projektu? Osoba zostanie też odpięta od swoich zadań.`)) return;
    this.api.removeMember(this.projectId, member.user_id).subscribe({
      next: () => this.changed.emit(),
      error: err => this.showError(err, 'Nie udało się usunąć osoby'),
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
    if (!confirm(`Usunąć pole „${field.name}” z projektu? Wartości wpisane w zadaniach zostaną zachowane.`)) return;
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
      error: err => { this.showError(err, 'Nie udało się zapisać pól'); this.changed.emit(); },
    });
  }

  private showError(err: { error?: { error?: string } }, fallback: string): void {
    this.toast.error(err?.error?.error ?? fallback);
  }
}
