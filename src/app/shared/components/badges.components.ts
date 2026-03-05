import { Component, Input } from '@angular/core';
import { DocStatus, DocType, GdprType, TaskType } from '../../core/models/models';
import { STATUS_MAP, DOC_TYPE_MAP, GDPR_MAP, TASK_TYPE_MAP, groupCssClass, initials } from '../../core/services/helpers';

// ── Status Badge ──────────────────────────────────────────
@Component({
  selector: 'wt-status-badge',
  standalone: true,
  template: `
    <span class="badge" [class]="cls">
      <span class="bdot"></span>{{ label }}
    </span>
  `,
})
export class StatusBadgeComponent {
  @Input({ required: true }) set status(s: DocStatus) {
    const m = STATUS_MAP[s] ?? { label: s, cls: '' };
    this.label = m.label; this.cls = m.cls;
  }
  label = ''; cls = '';
}

// ── Doc Type Badge ────────────────────────────────────────
@Component({
  selector: 'wt-type-badge',
  standalone: true,
  template: `<span class="tbadge">{{ label }}</span>`,
})
export class TypeBadgeComponent {
  @Input({ required: true }) set type(t: DocType) {
    this.label = DOC_TYPE_MAP[t] ?? t;
  }
  label = '';
}

// ── GDPR Badge ────────────────────────────────────────────
@Component({
  selector: 'wt-gdpr-badge',
  standalone: true,
  template: `<span class="gbadge" [class]="cls">{{ label }}</span>`,
})
export class GdprBadgeComponent {
  @Input({ required: true }) set gdpr(g: GdprType) {
    const m = GDPR_MAP[g] ?? { label: g, cls: '' };
    this.label = m.label; this.cls = m.cls;
  }
  label = ''; cls = '';
}

// ── Task Type Badge ───────────────────────────────────────
@Component({
  selector: 'wt-task-badge',
  standalone: true,
  template: `<span class="badge" [class]="cls">{{ label }}</span>`,
})
export class TaskBadgeComponent {
  @Input({ required: true }) set taskType(t: TaskType) {
    const m = TASK_TYPE_MAP[t] ?? { label: t, cls: '' };
    this.label = m.label; this.cls = m.cls;
  }
  label = ''; cls = '';
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
