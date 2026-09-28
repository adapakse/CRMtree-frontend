import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideTrash2 } from '@lucide/angular';
import { CrmSeoService, SeoScreenshot } from '../../../core/services/crm-seo.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'wt-seo-screenshots-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideTrash2],
  template: `
    <p class="hint">
      Zrzuty ekranu produktu, oznaczone funkcją (np. „Prospekty", „Analiza rozmów AI"). SEObot sam wstawia pasujący
      screen do nowego artykułu, a jeśli żadnego nie ma, zostawia w tekście miejsce do uzupełnienia.
      Nie wgrywaj ekranów z prawdziwymi danymi klientów.
    </p>
    <div class="shot-grid">
      @for (s of screenshots(); track s.id) {
        <div class="shot-card">
          <img class="shot-img" [src]="seoService.screenshotSrc(s.id)" [alt]="s.caption" loading="lazy">
          @if (editingId() === s.id) {
            <label class="field-label" [for]="'tag-' + s.id">Funkcja</label>
            <input class="field-input" [id]="'tag-' + s.id" [(ngModel)]="editTag">
            <label class="field-label" [for]="'caption-' + s.id">Podpis</label>
            <input class="field-input" [id]="'caption-' + s.id" [(ngModel)]="editCaption">
            <div class="card-actions">
              <button type="button" class="btn-ghost btn-sm" (click)="saveEdit(s.id)" [disabled]="!editTag.trim() || !editCaption.trim()">Zapisz</button>
              <button type="button" class="btn-ghost btn-sm" (click)="editingId.set(null)">Anuluj</button>
            </div>
          } @else {
            <span class="shot-tag">{{ s.feature_tag }}</span>
            <p class="shot-caption">{{ s.caption }}</p>
            <div class="card-actions">
              <button type="button" class="btn-ghost btn-sm" (click)="startEdit(s)">Edytuj</button>
              <button type="button" class="btn-delete" (click)="remove(s.id)" title="Usuń screen" aria-label="Usuń screen">
                <svg lucideTrash2 [size]="14"></svg>
              </button>
            </div>
          }
        </div>
      }
      <div class="shot-card shot-card-new">
        <label class="field-label" for="newShotFile">Plik (PNG, JPEG, WebP, max 8 MB)</label>
        <input #fileInput id="newShotFile" type="file" accept="image/png,image/jpeg,image/webp" (change)="onFileSelected(fileInput)">
        <label class="field-label" for="newShotTag">Funkcja</label>
        <input id="newShotTag" class="field-input" [(ngModel)]="newTag" placeholder="np. Prospekty">
        <label class="field-label" for="newShotCaption">Podpis pod zdjęciem</label>
        <input id="newShotCaption" class="field-input" [(ngModel)]="newCaption" placeholder="np. Lista prospektów posortowana po scoringu ICP">
        <button type="button" class="btn-ghost btn-sm" (click)="upload(fileInput)" [disabled]="!newFile || !newTag.trim() || !newCaption.trim() || uploading()">
          @if (uploading()) { Wgrywam… } @else { + Dodaj screen }
        </button>
      </div>
    </div>
  `,
  styles: [`
    .hint { font-size: 0.78rem; color: var(--gray-500); margin: 0 0 0.75rem; }
    .shot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.6rem; align-items: start; }
    .shot-card { border: 1px solid var(--gray-200); border-radius: var(--radius); padding: 0.7rem; background: #fff; }
    .shot-card-new { border-style: dashed; }
    .shot-img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 6px; border: 1px solid var(--gray-100); }
    .shot-tag {
      display: inline-block; margin-top: 0.5rem; font-size: 0.68rem; font-weight: 700; padding: 0.15em 0.55em;
      border-radius: 999px; background: var(--orange-pale); color: var(--orange-dark);
    }
    .shot-caption { font-size: 0.78rem; color: var(--gray-600); margin: 0.35rem 0 0; line-height: 1.4; }
    .card-actions { display: flex; justify-content: flex-end; gap: 0.3rem; margin-top: 0.6rem; }
    .field-label { display: block; font-size: 0.72rem; font-weight: 600; color: var(--gray-700); margin: 0.5rem 0 0.2rem; }
    .field-input { width: 100%; border: 1px solid var(--gray-200); border-radius: 8px; padding: 0.4rem 0.55rem; font-family: inherit; font-size: 0.8rem; }
    input[type="file"] { font-size: 0.75rem; width: 100%; }
    .shot-card-new .btn-sm { margin-top: 0.7rem; width: 100%; }
    .btn-ghost { border: none; border-radius: 8px; font-weight: 600; cursor: pointer; background: var(--gray-100); color: var(--gray-800); }
    .btn-sm { padding: 0.5rem 0.8rem; font-size: 0.82rem; white-space: nowrap; }
    .btn-delete {
      display: inline-flex; align-items: center; justify-content: center;
      border: none; border-radius: 8px; background: #FEE2E2; color: #991B1B; cursor: pointer; padding: 0.5rem 0.6rem;
    }
  `],
})
export class SeoScreenshotsPanelComponent implements OnInit {
  readonly seoService = inject(CrmSeoService);
  private toast = inject(ToastService);

  readonly screenshots = signal<SeoScreenshot[]>([]);
  readonly editingId = signal<number | null>(null);
  readonly uploading = signal(false);

  editTag = '';
  editCaption = '';
  newTag = '';
  newCaption = '';
  newFile: File | null = null;

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.seoService.screenshots().subscribe((s) => this.screenshots.set(s));
  }

  onFileSelected(input: HTMLInputElement): void {
    this.newFile = input.files?.[0] ?? null;
  }

  upload(input: HTMLInputElement): void {
    if (!this.newFile) return;
    this.uploading.set(true);
    this.seoService.uploadScreenshot(this.newFile, this.newTag.trim(), this.newCaption.trim()).subscribe({
      next: () => {
        this.toast.success('Dodano screen.');
        this.newFile = null;
        this.newTag = '';
        this.newCaption = '';
        input.value = '';
        this.uploading.set(false);
        this.load();
      },
      error: (err) => {
        this.toast.error(err?.error?.error ?? 'Nie udało się wgrać screena.');
        this.uploading.set(false);
      },
    });
  }

  startEdit(s: SeoScreenshot): void {
    this.editTag = s.feature_tag;
    this.editCaption = s.caption;
    this.editingId.set(s.id);
  }

  saveEdit(id: number): void {
    this.seoService.updateScreenshot(id, { feature_tag: this.editTag.trim(), caption: this.editCaption.trim() }).subscribe({
      next: () => { this.toast.success('Zapisano.'); this.editingId.set(null); this.load(); },
      error: () => this.toast.error('Nie udało się zapisać.'),
    });
  }

  remove(id: number): void {
    if (!confirm('Usunąć ten screen z biblioteki?')) return;
    this.seoService.deleteScreenshot(id).subscribe({
      next: () => { this.toast.success('Usunięto screen.'); this.load(); },
      error: (err) => this.toast.error(err?.error?.error ?? 'Nie udało się usunąć screena.'),
    });
  }
}
