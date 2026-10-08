import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { KsefCostInvoice } from '../../core/services/ksef-api.service';
import { ProjectKsefInvoiceDetailComponent } from './project-ksef-invoice-detail.component';

/**
 * Invoice number of a linked cost item. Opens the invoice detail for a user
 * with the KSeF permission; for anyone else it is a plain label, because the
 * invoice endpoints would answer 403.
 */
@Component({
  selector: 'wt-project-ksef-invoice-badge',
  standalone: true,
  imports: [TranslocoDirective, ProjectKsefInvoiceDetailComponent],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      @if (auth.canViewKsefInvoices()) {
        <button class="badge-link" [title]="t('ksef.badge.openTitle')" (click)="isDetailOpen.set(true)">
          <span class="source">KSeF</span> {{ label() }}
        </button>
      } @else {
        <span class="badge-link static" [title]="t('ksef.badge.title')"><span class="source">KSeF</span> {{ label() }}</span>
      }
      @if (isDetailOpen()) {
        <wt-project-ksef-invoice-detail [invoiceId]="invoice().id" (closed)="isDetailOpen.set(false)" />
      }
    </ng-container>
  `,
  styles: [`
    :host { display:inline-block; max-width:100%; }
    .badge-link { display:inline-flex; align-items:baseline; gap:5px; max-width:100%; padding:2px 8px; border-radius:6px; border:1px solid #BFDBFE; background:#EFF6FF; color:#1D4ED8; font-size:12px; font-family:inherit; font-weight:600; cursor:pointer; text-align:left; overflow-wrap:anywhere; }
    .badge-link:hover { background:#DBEAFE; }
    .badge-link.static { cursor:default; }
    .badge-link.static:hover { background:#EFF6FF; }
    .source { font-size:10px; letter-spacing:.4px; opacity:.75; }
  `],
})
export class ProjectKsefInvoiceBadgeComponent {
  readonly auth = inject(AuthService);

  readonly invoice = input.required<KsefCostInvoice>();
  readonly isDetailOpen = signal(false);

  label(): string {
    return this.invoice().invoice_number ?? this.invoice().ksef_number;
  }
}
