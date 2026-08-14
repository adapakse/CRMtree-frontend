import { ChangeDetectionStrategy, Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideTrash2 } from '@lucide/angular';
import { CrmSeoService, SeoAuthor } from '../../../core/services/crm-seo.service';
import { ToastService } from '../../../core/services/toast.service';
import { normalizeLinkedinUrl } from '../../../shared/utils/linkedin-url.util';

@Component({
  selector: 'wt-seo-authors-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideTrash2],
  template: `
    <div class="author-grid">
      @for (a of authors(); track a.id) {
        <div class="author-card" [class.inactive]="!a.is_active">
          @if (editingId() === a.id) {
            <label class="field-label">Imię i nazwisko <span class="required-star">*</span></label>
            <input class="field-input" [(ngModel)]="editName">
            <label class="field-label">Stanowisko</label>
            <input class="field-input" [(ngModel)]="editJobTitle" placeholder="np. Head of Sales">
            <label class="field-label">Opis kompetencji</label>
            <textarea class="field-input" rows="3" [(ngModel)]="editBio"></textarea>
            <label class="field-label">URL zdjęcia</label>
            <input class="field-input" [(ngModel)]="editPhotoUrl">
            <label class="field-label">Profil LinkedIn</label>
            <input class="field-input" [(ngModel)]="editLinkedinUrl" placeholder="https://linkedin.com/in/...">
            <div class="author-edit-actions">
              <button type="button" class="btn-ghost btn-sm" (click)="saveEdit(a.id)" [disabled]="!editName.trim() || savingEdit()">
                @if (savingEdit()) { Zapisuję… } @else { Zapisz }
              </button>
              <button type="button" class="btn-ghost btn-sm" (click)="cancelEdit()">Anuluj</button>
            </div>
          } @else {
            <div class="author-card-top">
              @if (a.photo_url) { <img class="author-photo" [src]="a.photo_url" alt=""> }
              <div class="author-heading">
                <span class="author-name">{{ a.full_name }}</span>
                @if (a.job_title) { <span class="author-job-title">{{ a.job_title }}</span> }
              </div>
            </div>
            @if (a.bio) { <p class="author-bio">{{ a.bio }}</p> }
            @if (a.linkedin_url) {
              <a class="author-linkedin" [href]="a.linkedin_url" target="_blank" rel="noopener noreferrer" title="Profil LinkedIn" aria-label="Profil LinkedIn">
                <svg class="linkedin-icon" viewBox="0 0 24 24" width="21" height="21" fill="currentColor" aria-hidden="true">
                  <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.03-1.85-3.03-1.85 0-2.14 1.45-2.14 2.94v5.66H9.34V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45z"/>
                </svg>
              </a>
            }
            @if (!a.is_active) { <span class="author-inactive-badge">Nieaktywny</span> }
            <div class="author-card-actions">
              <button type="button" class="btn-ghost btn-sm" (click)="startEdit(a)">Edytuj</button>
              @if (a.is_active) {
                <button type="button" class="btn-warn btn-sm" (click)="toggleActive(a)">Dezaktywuj</button>
              } @else {
                <button type="button" class="btn-ghost btn-sm" (click)="toggleActive(a)">Aktywuj</button>
              }
              <button type="button" class="btn-delete" (click)="remove(a.id)" title="Usuń autora" aria-label="Usuń autora">
                <svg lucideTrash2 [size]="14"></svg>
              </button>
            </div>
          }
        </div>
      }
      <div class="author-card author-card-new">
        @if (adding()) {
          <label class="field-label">Imię i nazwisko <span class="required-star">*</span></label>
          <input class="field-input" [(ngModel)]="newName" placeholder="np. Beata Kowalska">
          <label class="field-label">Stanowisko</label>
          <input class="field-input" [(ngModel)]="newJobTitle" placeholder="np. Kierownik działu sprzedaży">
          <label class="field-label">Opis kompetencji</label>
          <textarea class="field-input" rows="3" [(ngModel)]="newBio" placeholder="Krótki opis doświadczenia i eksperckości"></textarea>
          <label class="field-label">URL zdjęcia</label>
          <input class="field-input" [(ngModel)]="newPhotoUrl">
          <label class="field-label">Profil LinkedIn</label>
          <input class="field-input" [(ngModel)]="newLinkedinUrl" placeholder="https://linkedin.com/in/...">
          <div class="author-edit-actions">
            <button type="button" class="btn-ghost btn-sm" (click)="add()" [disabled]="!newName.trim() || savingNew()">
              @if (savingNew()) { Dodaję… } @else { Dodaj autora }
            </button>
            <button type="button" class="btn-ghost btn-sm" (click)="adding.set(false)">Anuluj</button>
          </div>
        } @else {
          <button type="button" class="btn-add-author" (click)="adding.set(true)">+ Dodaj autora</button>
        }
      </div>
    </div>
    @if (authors().length === 0 && !adding()) {
      <p class="empty">Brak autorów — dodaj pierwszego, żeby móc zatwierdzać artykuły (autor jest wymagany przed publikacją).</p>
    }
  `,
  styles: [`
    .author-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0.6rem; align-items: start; }
    .author-card { border: 1px solid var(--gray-200); border-radius: var(--radius); padding: 0.7rem 0.85rem; background: #fff; }
    .author-card.inactive { opacity: 0.6; }
    .author-card-top { display:flex; align-items:center; gap: 0.6rem; }
    .author-photo { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
    .author-heading { display:flex; flex-direction: column; min-width: 0; }
    .author-name { font-size: 0.85rem; font-weight: 700; color: var(--gray-900); }
    .author-job-title { font-size: 0.72rem; color: var(--gray-500); }
    .author-bio { font-size: 0.78rem; color: var(--gray-600); margin: 0.5rem 0 0; line-height: 1.4; }
    .author-linkedin { display: inline-flex; align-items: center; margin-top: 0.5rem; color: #0A66C2; }
    .author-linkedin:hover { opacity: 0.75; }
    .linkedin-icon { flex-shrink: 0; }
    .author-inactive-badge {
      display: inline-block; margin-top: 0.5rem; font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: .03em; padding: 0.15em 0.55em; border-radius: 4px; background: var(--gray-100); color: var(--gray-600);
    }
    .author-card-actions { display: flex; align-items: center; justify-content: flex-end; gap: 0.3rem; margin-top: 0.6rem; }
    .author-edit-actions { display: flex; gap: 0.5rem; margin-top: 0.6rem; }
    .author-card .field-label { display: block; font-size: 0.72rem; font-weight: 600; color: var(--gray-700); margin: 0.45rem 0 0.2rem; }
    .author-card .field-label:first-child { margin-top: 0; }
    .author-card .field-input { width: 100%; border: 1px solid var(--gray-200); border-radius: 8px; padding: 0.4rem 0.55rem; font-family: inherit; font-size: 0.8rem; }
    .required-star { color: #DC2626; }
    .author-card-new { display: flex; flex-direction: column; justify-content: center; border-style: dashed; }
    .btn-add-author {
      border: none; background: transparent; color: var(--gray-500); font-weight: 600; font-size: 0.85rem;
      cursor: pointer; padding: 1rem 0; width: 100%; text-align: center;
    }
    .btn-add-author:hover { color: var(--orange-dark); }
    .btn-ghost { border: none; border-radius: 8px; font-weight: 600; cursor: pointer; background: var(--gray-100); color: var(--gray-800); }
    .btn-warn { border: none; border-radius: 8px; font-weight: 600; cursor: pointer; background: #FEF3C7; color: #92400E; }
    .btn-sm { padding: 0.5rem 0.8rem; font-size: 0.82rem; white-space: nowrap; }
    .btn-delete {
      display: inline-flex; align-items: center; justify-content: center;
      border: none; border-radius: 8px; background: #FEE2E2; color: #991B1B;
      cursor: pointer; padding: 0.5rem 0.6rem; flex-shrink: 0;
    }
    .btn-delete:hover { background: #FECACA; }
    .empty { color: var(--gray-500); font-size: 0.82rem; margin: 0.75rem 0 0; }
  `],
})
export class SeoAuthorsPanelComponent implements OnInit {
  @Output() authorsChanged = new EventEmitter<void>();

  private seoService = inject(CrmSeoService);
  private toast = inject(ToastService);

  readonly authors = signal<SeoAuthor[]>([]);

  readonly editingId = signal<number | null>(null);
  readonly savingEdit = signal(false);
  editName = '';
  editJobTitle = '';
  editBio = '';
  editPhotoUrl = '';
  editLinkedinUrl = '';

  readonly adding = signal(false);
  readonly savingNew = signal(false);
  newName = '';
  newJobTitle = '';
  newBio = '';
  newPhotoUrl = '';
  newLinkedinUrl = '';

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.seoService.authors().subscribe((a) => this.authors.set(a));
  }

  startEdit(a: SeoAuthor): void {
    this.editingId.set(a.id);
    this.editName = a.full_name;
    this.editJobTitle = a.job_title ?? '';
    this.editBio = a.bio ?? '';
    this.editPhotoUrl = a.photo_url ?? '';
    this.editLinkedinUrl = a.linkedin_url ?? '';
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  saveEdit(id: number): void {
    const full_name = this.editName.trim();
    if (!full_name) return;
    this.savingEdit.set(true);
    this.seoService.updateAuthor(id, {
      full_name,
      job_title: this.editJobTitle.trim() || null,
      bio: this.editBio.trim() || null,
      photo_url: this.editPhotoUrl.trim() || null,
      linkedin_url: normalizeLinkedinUrl(this.editLinkedinUrl),
    }).subscribe({
      next: () => {
        this.savingEdit.set(false);
        this.editingId.set(null);
        this.toast.success('Autor zaktualizowany.');
        this.load();
        this.authorsChanged.emit();
      },
      error: (err) => {
        this.savingEdit.set(false);
        this.toast.error(err?.error?.error ?? 'Nie udało się zapisać autora.');
      },
    });
  }

  toggleActive(a: SeoAuthor): void {
    this.seoService.updateAuthor(a.id, { is_active: !a.is_active }).subscribe({
      next: () => { this.load(); this.authorsChanged.emit(); },
      error: (err) => this.toast.error(err?.error?.error ?? 'Nie udało się zmienić statusu.'),
    });
  }

  remove(id: number): void {
    this.seoService.deleteAuthor(id).subscribe({
      next: () => { this.toast.info('Autor usunięty.'); this.load(); this.authorsChanged.emit(); },
      error: (err) => this.toast.error(err?.error?.error ?? 'Nie udało się usunąć autora.'),
    });
  }

  add(): void {
    const full_name = this.newName.trim();
    if (!full_name) return;
    this.savingNew.set(true);
    this.seoService.addAuthor({
      full_name,
      job_title: this.newJobTitle.trim() || null,
      bio: this.newBio.trim() || null,
      photo_url: this.newPhotoUrl.trim() || null,
      linkedin_url: normalizeLinkedinUrl(this.newLinkedinUrl),
    }).subscribe({
      next: () => {
        this.savingNew.set(false);
        this.adding.set(false);
        this.newName = '';
        this.newJobTitle = '';
        this.newBio = '';
        this.newPhotoUrl = '';
        this.newLinkedinUrl = '';
        this.toast.success('Autor dodany.');
        this.load();
        this.authorsChanged.emit();
      },
      error: (err) => {
        this.savingNew.set(false);
        this.toast.error(err?.error?.error ?? 'Nie udało się dodać autora.');
      },
    });
  }
}
