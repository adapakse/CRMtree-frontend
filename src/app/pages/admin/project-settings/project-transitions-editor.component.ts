import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';
import {
  PROJECT_ROLE_LABELS, ProjectConfig, ProjectRole, ProjectsApiService,
} from '../../../core/services/projects-api.service';

type TransitionRole = Exclude<ProjectRole, 'pm'>;

const TRANSITION_ROLES: TransitionRole[] = ['internal_participant', 'external_participant', 'controller'];
const transitionKey = (fromStatusId: string, toStatusId: string): string => `${fromStatusId}>${toStatusId}`;

/** Matrix "from status → to status" of the transitions one project role may perform. */
@Component({
  selector: 'wt-project-transitions-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="hint">
      PM zawsze może zmienić status na dowolny. Uczestnicy zmieniają status tylko w zadaniach, do których są przypisani
      i mają pełne uprawnienia. Kontroler zmienia status w każdym zadaniu projektu.
    </p>

    <div class="roles">
      @for (role of roles; track role) {
        <button class="role-btn" [class.active]="selectedRole() === role" (click)="selectRole(role)">{{ roleLabels[role] }}</button>
      }
    </div>

    <div class="matrix-wrap">
      <table class="matrix">
        <thead>
          <tr>
            <th class="corner">Z statusu ↓ / na status →</th>
            @for (status of statuses(); track status.id) { <th>{{ status.name }}</th> }
          </tr>
        </thead>
        <tbody>
          @for (from of statuses(); track from.id) {
            <tr>
              <th class="from">{{ from.name }}</th>
              @for (to of statuses(); track to.id) {
                <td>
                  @if (from.id !== to.id) {
                    <input type="checkbox" [checked]="isAllowed(from.id, to.id)" (change)="toggle(from.id, to.id)">
                  } @else { <span class="same">—</span> }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>

    <div class="actions">
      <button class="btn btn-p btn-sm" [disabled]="!isDirty() || isSaving()" (click)="save()">
        {{ isSaving() ? 'Zapisywanie…' : 'Zapisz przejścia' }}
      </button>
    </div>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; gap:12px; }
    .hint { margin:0; font-size:12.5px; color:var(--gray-500); line-height:1.6; }
    .roles { display:flex; gap:6px; }
    .role-btn { border:1.5px solid var(--gray-200); background:white; border-radius:8px; padding:6px 12px; font-size:12.5px; cursor:pointer; color:var(--gray-600); font-family:inherit; }
    .role-btn.active { border-color:var(--orange); color:var(--orange-dark); background:var(--orange-pale); font-weight:600; }
    .matrix-wrap { overflow-x:auto; }
    .matrix { border-collapse:collapse; font-size:12.5px; }
    .matrix th, .matrix td { border:1px solid var(--gray-200); padding:7px 10px; text-align:center; }
    .matrix th { background:var(--gray-50); color:var(--gray-600); font-weight:600; white-space:nowrap; }
    .matrix th.from, .matrix th.corner { text-align:left; }
    .same { color:var(--gray-300); }
    .actions { display:flex; justify-content:flex-end; }
  `],
})
export class ProjectTransitionsEditorComponent {
  private readonly api = inject(ProjectsApiService);
  private readonly toast = inject(ToastService);

  readonly config = input.required<ProjectConfig>();
  readonly configChanged = output<ProjectConfig>();

  readonly roles = TRANSITION_ROLES;
  readonly roleLabels = PROJECT_ROLE_LABELS;

  readonly selectedRole = signal<TransitionRole>('internal_participant');
  readonly isSaving = signal(false);
  readonly isDirty = signal(false);
  private readonly allowedKeys = signal<Set<string>>(new Set());

  readonly statuses = computed(() => this.config().statuses.filter(status => status.is_active));

  constructor() {
    // Reloads the matrix from the stored configuration whenever the role or the configuration changes.
    effect(() => {
      const role = this.selectedRole();
      const stored = this.config().transitions.filter(transition => transition.role === role);
      this.allowedKeys.set(new Set(stored.map(transition => transitionKey(transition.from_status_id, transition.to_status_id))));
      this.isDirty.set(false);
    });
  }

  isAllowed(fromStatusId: string, toStatusId: string): boolean {
    return this.allowedKeys().has(transitionKey(fromStatusId, toStatusId));
  }

  selectRole(role: TransitionRole): void {
    if (this.isDirty() && !confirm('Masz niezapisane zmiany przejść. Porzucić je?')) return;
    this.selectedRole.set(role);
  }

  toggle(fromStatusId: string, toStatusId: string): void {
    const key = transitionKey(fromStatusId, toStatusId);
    const next = new Set(this.allowedKeys());
    if (next.has(key)) next.delete(key); else next.add(key);
    this.allowedKeys.set(next);
    this.isDirty.set(true);
  }

  save(): void {
    const transitions = [...this.allowedKeys()].map(key => {
      const [from_status_id, to_status_id] = key.split('>');
      return { from_status_id, to_status_id };
    });
    this.isSaving.set(true);
    this.api.replaceRoleTransitions(this.selectedRole(), transitions).subscribe({
      next: config => {
        this.isSaving.set(false);
        this.toast.success('Zapisano przejścia statusów');
        this.configChanged.emit(config);
      },
      error: err => {
        this.isSaving.set(false);
        this.toast.error(err?.error?.error ?? 'Nie udało się zapisać przejść');
      },
    });
  }
}
