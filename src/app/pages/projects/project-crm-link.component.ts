import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from '../../core/auth/auth.service';
import { CrmApiService } from '../../core/services/crm-api.service';
import { ProjectDetail, ProjectsApiService } from '../../core/services/projects-api.service';
import { ToastService } from '../../core/services/toast.service';
import { TypeaheadComponent, TypeaheadOption } from '../../shared/components/typeahead/typeahead.component';

/** What the link API takes: a lead id, or a partner reference (CRM uuid, else DWH id). */
type CrmLink = { lead_id: number } | { partner_ref: string };

const RESULTS_PER_KIND = 10;

/**
 * Link between a project and one lead or one partner. Everyone sees the
 * link; changing it needs the PM role and CRM access, and the search offers
 * only records the user can see in the CRM.
 */
@Component({
  selector: 'wt-project-crm-link',
  standalone: true,
  imports: [RouterLink, TypeaheadComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="link-row">
      <span class="label">Powiązanie z CRM</span>
      @if (currentLink(); as link) {
        @if (hasCrmAccess()) {
          <a class="target" [routerLink]="link.route">{{ link.kind }}: {{ link.name }}</a>
        } @else {
          <span class="target plain">{{ link.kind }}: {{ link.name }}</span>
        }
      } @else {
        <span class="none">brak</span>
      }
      @if (canChange() && !isEditing()) {
        <button class="btn btn-g btn-sm" (click)="isEditing.set(true)">{{ currentLink() ? 'Zmień' : 'Powiąż' }}</button>
        @if (currentLink()) { <button class="link-danger" (click)="removeLink()">Usuń powiązanie</button> }
      }
    </div>

    @if (isEditing()) {
      <div class="picker">
        <wt-typeahead [search]="searchCrm" placeholder="Wpisz nazwę leada lub partnera (min. 3 znaki)…"
                      (picked)="saveLink($event)" />
        <button class="btn btn-g btn-sm" (click)="isEditing.set(false)">Anuluj</button>
      </div>
      <div class="hint">Podpowiedzi obejmują tylko leady i partnerów, do których masz dostęp w CRM. Wybór od razu zapisuje powiązanie.</div>
    }
  `,
  styles: [`
    :host { display:flex; flex-direction:column; gap:8px; }
    .link-row { display:flex; align-items:center; gap:10px; font-size:13px; }
    .label { font-size:12px; font-weight:600; color:var(--gray-600); }
    .target { color:#5b21b6; font-weight:600; text-decoration:none; }
    .target.plain { color:var(--gray-800); }
    .none { color:var(--gray-400); }
    .link-danger { border:none; background:none; color:#B91C1C; font-size:12.5px; cursor:pointer; font-family:inherit; }
    .picker { display:grid; grid-template-columns:minmax(0, 520px) auto; gap:8px; align-items:center; justify-content:start; }
    .hint { font-size:11.5px; color:var(--gray-400); }
  `],
})
export class ProjectCrmLinkComponent {
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly crmApi = inject(CrmApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly detail = input.required<ProjectDetail>();
  /** Emitted after the link changed so the parent reloads the project. */
  readonly changed = output<void>();

  readonly hasCrmAccess = this.auth.isCrmUser;
  readonly isEditing = signal(false);

  readonly canChange = computed(() =>
    this.hasCrmAccess() && this.detail().can_manage && this.detail().project.status === 'open');

  readonly currentLink = computed(() => {
    const project = this.detail().project;
    if (project.lead_id) {
      return { kind: 'Lead', name: project.lead_name ?? '', route: ['/crm/leads', project.lead_id] };
    }
    if (project.partner_id) {
      return { kind: 'Partner', name: project.partner_name ?? '', route: ['/crm/partners', project.partner_id] };
    }
    return null;
  });

  // Leads and partners are searched together; a failed side yields no results instead of breaking the other.
  readonly searchCrm = (term: string): Observable<TypeaheadOption<CrmLink>[]> => {
    const params = { search: term, limit: RESULTS_PER_KIND, page: 1 };
    const leads$ = this.crmApi.getLeads(params).pipe(
      map(page => page.data.map((lead): TypeaheadOption<CrmLink> => ({
        id: `lead-${lead.id}`, label: lead.company, hint: 'Lead', value: { lead_id: Number(lead.id) },
      }))),
      catchError(() => of([])),
    );
    const partners$ = this.crmApi.getPartners(params).pipe(
      map(page => page.data
        .map(partner => ({ ref: partner.crm_uuid || String(partner.id ?? ''), name: partner.company }))
        .filter(partner => partner.ref !== '')
        .map((partner): TypeaheadOption<CrmLink> => ({
          id: `partner-${partner.ref}`, label: partner.name, hint: 'Partner', value: { partner_ref: partner.ref },
        }))),
      catchError(() => of([])),
    );
    return forkJoin([leads$, partners$]).pipe(map(([leads, partners]) => [...leads, ...partners]));
  };

  saveLink(option: TypeaheadOption<CrmLink>): void {
    this.send(option.value, 'Nie udało się powiązać projektu');
  }

  removeLink(): void {
    if (!confirm('Usunąć powiązanie projektu z CRM? Zadania projektu znikną z karty leada lub partnera.')) return;
    this.send({}, 'Nie udało się usunąć powiązania');
  }

  private send(link: { lead_id?: number; partner_ref?: string }, fallbackError: string): void {
    this.projectsApi.setCrmLink(this.detail().project.id, link).subscribe({
      next: () => { this.isEditing.set(false); this.changed.emit(); },
      error: err => this.toast.error(err?.error?.error ?? fallbackError),
    });
  }
}
