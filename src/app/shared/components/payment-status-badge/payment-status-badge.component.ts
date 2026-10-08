import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { BUILT_IN_PAYMENT_STATUSES, OVERDUE_PAYMENT_STATUS } from '../../../core/services/helpers';

const STATUS_CSS_CLASSES: Record<string, string> = {
  unpaid: 's-hold',
  partially_paid: 's-approving',
  paid: 's-signed',
  overdue: 's-rejected',
};

/**
 * Payment status of an invoice document. A built-in code gets a translated
 * name; a code the tenant added is shown as entered. An invoice past its due
 * date is shown as overdue whatever status is stored, because the stored one
 * is set by hand and may simply not have been updated.
 */
@Component({
  selector: 'wt-payment-status-badge',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('documents')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t; prefix: 'documents'">
      @if (shownStatus(); as code) {
        <span class="badge" [class]="cssClass()">
          <span class="bdot"></span>{{ isBuiltIn() ? t('labels.paymentStatuses.' + code) : code }}
        </span>
      }
    </ng-container>
  `,
})
export class PaymentStatusBadgeComponent {
  readonly status = input<string | null | undefined>(null);
  readonly isOverdue = input<boolean | undefined>(false);

  readonly shownStatus = computed(() => (this.isOverdue() ? OVERDUE_PAYMENT_STATUS : this.status() || null));
  readonly isBuiltIn = computed(() => BUILT_IN_PAYMENT_STATUSES.includes(this.shownStatus() ?? ''));
  readonly cssClass = computed(() => STATUS_CSS_CLASSES[this.shownStatus() ?? ''] ?? '');
}
