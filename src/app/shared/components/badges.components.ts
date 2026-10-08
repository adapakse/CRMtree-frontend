import { Component, Input } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { DocStatus, DocType, GdprType, TaskType } from '../../core/models/models';
import { STATUS_MAP, DOC_TYPE_MAP, GDPR_MAP, TASK_TYPE_MAP, groupCssClass, initials } from '../../core/services/helpers';

// Each badge shows a translated label for the values the app knows; any other
// value (custom entries from App Settings) is shown exactly as stored.

// ── Status Badge ──────────────────────────────────────────
@Component({
  selector: 'wt-status-badge',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('documents')],
  template: `
    <ng-container *transloco="let t; prefix: 'documents'">
    <span class="badge" [class]="cls">
      <span class="bdot"></span>{{ labelKey ? t(labelKey) : rawValue }}
    </span>
    </ng-container>
  `,
})
export class StatusBadgeComponent {
  @Input({ required: true }) set status(s: DocStatus) {
    const known = STATUS_MAP[s];
    this.labelKey = known ? 'labels.statuses.' + s : null;
    this.rawValue = s;
    this.cls = known?.cls ?? '';
  }
  labelKey: string | null = null; rawValue = ''; cls = '';
}

// ── Doc Type Badge ────────────────────────────────────────
@Component({
  selector: 'wt-type-badge',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('documents')],
  template: `<ng-container *transloco="let t; prefix: 'documents'"><span class="tbadge">{{ labelKey ? t(labelKey) : rawValue }}</span></ng-container>`,
})
export class TypeBadgeComponent {
  @Input({ required: true }) set type(t: DocType) {
    // For custom types added via App Settings the value IS the display name
    // (e.g. "Dostawca Content Hotel").
    this.labelKey = DOC_TYPE_MAP[t] ? 'labels.docTypes.' + t : null;
    this.rawValue = t;
  }
  labelKey: string | null = null; rawValue = '';
}

// ── GDPR Badge ────────────────────────────────────────────
@Component({
  selector: 'wt-gdpr-badge',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('documents')],
  template: `<ng-container *transloco="let t; prefix: 'documents'"><span class="gbadge" [class]="cls">{{ labelKey ? t(labelKey) : rawValue }}</span></ng-container>`,
})
export class GdprBadgeComponent {
  @Input({ required: true }) set gdpr(g: GdprType) {
    const known = GDPR_MAP[g];
    this.labelKey = known ? 'badges.gdpr.' + g : null;
    this.rawValue = g;
    this.cls = known?.cls ?? '';
  }
  labelKey: string | null = null; rawValue = ''; cls = '';
}

// ── Task Type Badge ───────────────────────────────────────
@Component({
  selector: 'wt-task-badge',
  standalone: true,
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('documents')],
  template: `<ng-container *transloco="let t; prefix: 'documents'"><span class="badge" [class]="cls">{{ labelKey ? t(labelKey) : rawValue }}</span></ng-container>`,
})
export class TaskBadgeComponent {
  @Input({ required: true }) set taskType(t: TaskType) {
    const known = TASK_TYPE_MAP[t];
    this.labelKey = known ? 'labels.taskTypes.' + t : null;
    this.rawValue = t;
    this.cls = known?.cls ?? '';
  }
  labelKey: string | null = null; rawValue = ''; cls = '';
}

// ── Group Pill ────────────────────────────────────────────
@Component({
  selector: 'wt-group-pill',
  standalone: true,
  template: `<span class="pill" [class]="cls">{{ name }}</span>`,
})
export class GroupPillComponent {
  @Input({ required: true }) name = '';
  get cls() { return groupCssClass(this.name); }
}

// ── Avatar ────────────────────────────────────────────────
@Component({
  selector: 'wt-avatar',
  standalone: true,
  template: `
    <div class="av" [style.width.px]="size" [style.height.px]="size"
         [style.fontSize.px]="size * 0.4">
      {{ init }}
    </div>
  `,
})
export class AvatarComponent {
  @Input({ required: true }) set name(n: string) { this.init = initials(n); }
  @Input() size = 32;
  init = '';
}
