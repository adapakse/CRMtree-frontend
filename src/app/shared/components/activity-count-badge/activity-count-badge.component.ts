import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'wt-activity-count-badge',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span *ngIf="count > 0"
          style="background:#f3f4f6;border-radius:10px;padding:1px 6px;font-size:10px;margin-left:4px">
      {{count}}
    </span>
  `,
})
export class ActivityCountBadgeComponent {
  @Input() activities: any[] = [];

  get count(): number {
    return this.activities.filter(
      a => a.type !== 'email' && a.status && a.status !== 'closed'
    ).length;
  }
}
