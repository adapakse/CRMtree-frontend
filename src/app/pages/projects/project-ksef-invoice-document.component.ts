import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { ToastService } from '../../core/services/toast.service';
import { KsefApiService, KsefInvoiceDocument } from '../../core/services/ksef-api.service';

const GROUP_NOT_CONFIGURED_STATUS = 409;

/**
 * Whether a KSeF invoice has a document in the Documents module: a link to it,
 * or a button that registers the invoice there. Registering needs the access
 * group the tenant admin chooses in the KSeF settings; without it the button
 * is disabled.
 */
@Component({
  selector: 'wt-project-ksef-invoice-document',
  standalone: true,
  imports: [RouterLink, TranslocoDirective],
  providers: [provideTranslocoScope('projects')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'projects'">
      @if (shownDocumentId(); as id) {
        @if (canOpen()) {
          <a class="open" [routerLink]="['/documents']" [queryParams]="{ open: id }">{{ t('ksef.document.open') }}</a>
        } @else {
          <span class="registered" [title]="t('ksef.document.noAccessTitle')">
            {{ t('ksef.document.registered', { number: registered()?.doc_number }) }}
          </span>
        }
      } @else {
        <!-- The title sits on a wrapper: browsers show no tooltip for a disabled button. -->
        <span [title]="isGroupConfigured() ? '' : t('ksef.document.groupMissing')">
          <button type="button" class="btn btn-g btn-sm" [disabled]="!isGroupConfigured() || isRegistering()" (click)="register()">
            {{ isRegistering() ? t('ksef.document.registering') : t('ksef.document.register') }}
          </button>
        </span>
      }
    </ng-container>
  `,
  styles: [`
    :host { display:inline-block; }
    .open { font-size:12.5px; color:var(--accent-blue, #3B82F6); text-decoration:none; white-space:nowrap; }
    .open:hover { text-decoration:underline; }
    .registered { font-size:12.5px; color:var(--gray-600); }
    .btn { white-space:nowrap; }
  `],
})
export class ProjectKsefInvoiceDocumentComponent {
  private readonly api = inject(KsefApiService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly invoiceId = input.required<string>();
  /** The invoice's document as the invoice list or detail reported it. */
  readonly documentId = input.required<string | null>();
  readonly isGroupConfigured = input.required<boolean>();

  readonly isRegistering = signal(false);
  readonly registered = signal<KsefInvoiceDocument | null>(null);
  readonly shownDocumentId = computed(() => this.registered()?.document_id ?? this.documentId());
  // The invoice endpoints do not say whether the viewer may open an existing
  // document; only the answer to registering does.
  readonly canOpen = computed(() => this.registered()?.can_open ?? true);

  register(): void {
    this.isRegistering.set(true);
    this.api.registerInvoiceDocument(this.invoiceId()).subscribe({
      next: document => {
        this.isRegistering.set(false);
        this.registered.set(document);
        this.toast.success(this.transloco.translate('projects.ksef.document.registeredToast', { number: document.doc_number }));
      },
      error: err => {
        this.isRegistering.set(false);
        this.toast.error(err?.status === GROUP_NOT_CONFIGURED_STATUS
          ? this.transloco.translate('projects.ksef.document.groupMissing')
          : err?.error?.error ?? this.transloco.translate('projects.ksef.document.registerFailed'));
      },
    });
  }
}
