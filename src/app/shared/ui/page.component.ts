import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Standard screen layout: a 60px title bar with an actions slot and a body with
 * the shared 24px gutter. Every screen used to copy these rules by hand.
 *
 * <wt-page [title]="…"><button actions class="btn btn-p">…</button> …content… </wt-page>
 */
@Component({
  selector: 'wt-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <h1 class="title">{{ title() }}</h1>
      <ng-content select="[leading]" />
      <span class="grow"></span>
      <div class="actions"><ng-content select="[actions]" /></div>
    </header>
    <div class="body"><ng-content /></div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0; }
    .head {
      display: flex; align-items: center; gap: 12px; flex-shrink: 0;
      height: 60px; padding: 0 24px;
      background: var(--surface); border-bottom: 1px solid var(--gray-200);
    }
    .title { font-family: 'Sora', sans-serif; font-size: 18px; font-weight: 600; color: var(--gray-900); margin: 0; }
    .grow { flex: 1; }
    .actions { display: flex; align-items: center; gap: 8px; }
    .body { flex: 1; min-height: 0; overflow-y: auto; padding: 24px; }
  `],
})
export class PageComponent {
  readonly title = input.required<string>();
}
