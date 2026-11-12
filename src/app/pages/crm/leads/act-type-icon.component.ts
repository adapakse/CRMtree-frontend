import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';
import { NgSwitch, NgSwitchCase, NgSwitchDefault } from '@angular/common';

/** Line icon for an activity type (replaces the former emoji glyphs), in the colour the emoji had. */
const TYPE_COLORS: Record<string, string> = {
  task: '#16A34A', call: '#0D9488', email: '#3B82F6', meeting: '#F97316', note: '#EAB308',
  doc_sent: '#6B7280', training: '#8B5CF6', qbr: '#3B82F6', opportunity: '#F59E0B',
};

@Component({
  selector: 'wt-act-type-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgSwitch, NgSwitchCase, NgSwitchDefault],
  template: `
    <ng-container [ngSwitch]="type">
      <svg *ngSwitchCase="'task'" class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>
      <svg *ngSwitchCase="'call'" class="ic" viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>
      <svg *ngSwitchCase="'email'" class="ic" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>
      <svg *ngSwitchCase="'meeting'" class="ic" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>
      <svg *ngSwitchCase="'note'" class="ic" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
      <svg *ngSwitchCase="'doc_sent'" class="ic" viewBox="0 0 24 24"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/></svg>
      <svg *ngSwitchCase="'training'" class="ic" viewBox="0 0 24 24"><path d="M22 9 12 4 2 9l10 5z"/><path d="M6 11v5c0 1 3 3 6 3s6-2 6-3v-5"/></svg>
      <svg *ngSwitchCase="'qbr'" class="ic" viewBox="0 0 24 24"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-8"/><path d="M22 20H2"/></svg>
      <svg *ngSwitchCase="'opportunity'" class="ic" viewBox="0 0 24 24"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg>
      <svg *ngSwitchDefault class="ic" viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/></svg>
    </ng-container>
  `,
  styles: [`:host { display: inline-flex; align-items: center; } svg.ic { width: 1em; height: 1em; vertical-align: 0; }`],
})
export class ActTypeIconComponent {
  @Input() type = '';

  @HostBinding('style.color') get color(): string { return TYPE_COLORS[this.type] ?? '#3B82F6'; }
}
