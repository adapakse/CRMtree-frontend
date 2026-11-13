// Shared by the KSeF invoice picker, the invoice detail view and the link form.
export const PROJECT_KSEF_STYLES = `
  .notice { padding:10px 12px; border-radius:9px; font-size:12px; line-height:1.5; background:color-mix(in srgb, #fffbeb var(--tint-mix), var(--surface)); border:1px solid #FDE68A; color:oklch(from #92400e max(l, var(--text-min-l)) c h); }
  .notice.error { background:var(--gray-50); border-color:color-mix(in srgb, #fecaca var(--tint-mix), var(--surface)); color:oklch(from #b91c1c max(l, var(--text-min-l)) c h); }
  .notice-title { font-weight:700; }
  .facts { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:10px 18px; margin:0; }
  .fact dt { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; color:var(--gray-500); }
  .fact dd { margin:2px 0 0; font-size:14px; color:var(--gray-800); overflow-wrap:anywhere; white-space:pre-line; }
  .fact.wide { grid-column:1 / -1; }
`;

/** Label of a project task the way the module writes it everywhere: "KEY-12 Task name". */
export function taskLabel(projectKey: string, taskNumber: number | null, taskName: string | null): string {
  return `${projectKey}-${taskNumber} ${taskName ?? ''}`.trim();
}
