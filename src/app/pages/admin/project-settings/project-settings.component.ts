import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';
import { ProjectConfig, ProjectsApiService } from '../../../core/services/projects-api.service';
import { ProjectDictionaryEditorComponent } from './project-dictionary-editor.component';
import { ProjectFieldsEditorComponent } from './project-fields-editor.component';
import { ProjectTransitionsEditorComponent } from './project-transitions-editor.component';

/** "Projekty" tab of the tenant settings: task dictionaries, status transitions and custom fields. */
@Component({
  selector: 'wt-project-settings',
  standalone: true,
  imports: [ProjectDictionaryEditorComponent, ProjectTransitionsEditorComponent, ProjectFieldsEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (config(); as loaded) {
      <section class="card block">
        <div class="sec-title">Statusy zadań</div>
        <p class="hint">
          Kategoria mówi systemowi, co status oznacza — niezależnie od nazwy. Zadania w statusie kategorii „Zakończone”
          nie liczą się jako otwarte ani przeterminowane.
        </p>
        <wt-project-dictionary-editor dictionary="statuses" [items]="loaded.statuses" (configChanged)="config.set($event)" />
      </section>

      <section class="card block">
        <div class="sec-title">Przejścia między statusami</div>
        <wt-project-transitions-editor [config]="loaded" (configChanged)="config.set($event)" />
      </section>

      <div class="two-columns">
        <section class="card block">
          <div class="sec-title">Typy zadań</div>
          <wt-project-dictionary-editor dictionary="types" [items]="loaded.types" (configChanged)="config.set($event)" />
        </section>
        <section class="card block">
          <div class="sec-title">Priorytety</div>
          <wt-project-dictionary-editor dictionary="priorities" [items]="loaded.priorities" (configChanged)="config.set($event)" />
        </section>
      </div>

      <section class="card block">
        <div class="sec-title">Pola dodatkowe zadań</div>
        <wt-project-fields-editor [definitions]="loaded.field_definitions" (configChanged)="config.set($event)" />
      </section>
    } @else {
      <div class="empty-state">Ładowanie…</div>
    }
  `,
  styles: [`
    :host { display:flex; flex-direction:column; gap:16px; max-width:1100px; }
    .block { padding:18px 20px; display:flex; flex-direction:column; gap:10px; }
    .block .sec-title { margin:0 0 4px; }
    .hint { margin:0; font-size:12.5px; color:var(--gray-500); line-height:1.6; }
    .two-columns { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    @media (max-width: 900px) { .two-columns { grid-template-columns:1fr; } }
  `],
})
export class ProjectSettingsComponent implements OnInit {
  private readonly api = inject(ProjectsApiService);
  private readonly toast = inject(ToastService);

  readonly config = signal<ProjectConfig | null>(null);

  ngOnInit(): void {
    this.api.getConfig().subscribe({
      next: config => this.config.set(config),
      error: err => this.toast.error(err?.error?.error ?? 'Nie udało się pobrać konfiguracji projektów'),
    });
  }
}
