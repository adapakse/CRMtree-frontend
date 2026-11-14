// Shared by the sections of the Finance tab and the cost list in the task panel.
export const PROJECT_FINANCE_STYLES = `
  :host { display:block; height:auto; }
  .block { padding:18px 20px; display:flex; flex-direction:column; gap:12px; }
  .block-head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .block-head .sec-title { flex:1; margin:0; }
  .hint { margin:0; font-size:12px; color:var(--gray-500); line-height:1.5; }
  .amount { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
  table.grid th.amount { text-align:right; }
  .secondary { display:block; font-size:12px; color:var(--gray-500); font-weight:400; }
  .danger { color:oklch(from #dc2626 max(l, var(--text-min-l)) c h); }
  .nowrap { white-space:nowrap; }
  .row-action { text-align:right; white-space:nowrap; }
  .link, .link-danger { border:none; background:none; padding:0; font-size:12px; cursor:pointer; font-family:inherit; }
  .link { color:var(--accent-blue, oklch(from #3b82f6 max(l, var(--text-min-l)) c h)); text-align:left; }
  .link-danger { color:oklch(from #b91c1c max(l, var(--text-min-l)) c h); margin-left:10px; }
  .status-pill { background:var(--gray-100); color:var(--gray-600); white-space:nowrap; }
  .status-pill.incurred, .status-pill.paid { background:var(--orange-pale); color:var(--orange-dark); }
  .status-pill.invoiced { background:color-mix(in srgb, #eff6ff var(--tint-mix), var(--surface)); color:oklch(from #1d4ed8 max(l, var(--text-min-l)) c h); }
  .cell-input { width:130px; padding:4px 8px; font-size:14px; text-align:right; }
  tfoot td { font-weight:700; background:var(--gray-50); border-top:1px solid var(--gray-200); }
  input:disabled, select:disabled { opacity:.75; cursor:not-allowed; }
`;

/** Reads a money input; null for an empty field, NaN for anything that is not an amount ≥ 0. */
export function parseMoneyInput(raw: string): number | null {
  const text = raw.trim();
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : Number.NaN;
}
