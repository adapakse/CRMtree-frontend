// Page chrome shared by the Projects module components. The app has no global
// topbar/modal styles — every page declares its own — so the module keeps
// one copy here instead of one per component.
export const PROJECTS_SHARED_STYLES = `
  :host { display:flex; flex-direction:column; height:100%; min-height:0; }
  #topbar { height:60px; background:white; border-bottom:1px solid var(--gray-200); display:flex; align-items:center; gap:12px; padding:0 24px; flex-shrink:0; }
  .page-title { font-family:'Sora',sans-serif; font-size:17px; font-weight:700; color:var(--gray-900); }
  .tsp { flex:1; }
  #content { flex:1; overflow-y:auto; padding:20px 24px 24px; min-height:0; }

  .mol { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:200; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(3px); }
  .mo { background:white; border-radius:14px; width:540px; max-width:95vw; box-shadow:var(--shadow-lg); overflow:hidden; }
  .moh { padding:18px 24px 14px; border-bottom:1px solid var(--gray-200); display:flex; align-items:center; gap:12px; }
  .mot { font-family:'Sora',sans-serif; font-size:15px; font-weight:700; color:var(--gray-900); }
  .mox { margin-left:auto; cursor:pointer; color:var(--gray-400); padding:4px 8px; border-radius:6px; border:none; background:none; font-size:15px; }
  .mox:hover { background:var(--gray-100); }
  .mob { padding:20px 24px; display:flex; flex-direction:column; gap:14px; }
  .mof { padding:14px 24px; border-top:1px solid var(--gray-200); display:flex; justify-content:flex-end; gap:8px; }

  table.grid { width:100%; border-collapse:collapse; font-size:13px; }
  table.grid th { text-align:left; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; color:var(--gray-500); padding:10px 12px; border-bottom:1px solid var(--gray-200); background:var(--gray-50); white-space:nowrap; }
  table.grid td { padding:9px 12px; border-bottom:1px solid var(--gray-100); color:var(--gray-800); vertical-align:middle; }
  table.grid tr:last-child td { border-bottom:none; }

  .chip { display:inline-flex; align-items:center; gap:5px; padding:2px 9px; border-radius:12px; font-size:11.5px; font-weight:600; white-space:nowrap; }
  .chip-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
  .muted { color:var(--gray-400); }
`;

// Tinted chip in a tenant-defined colour: light background, coloured text.
export function chipStyle(color: string): Record<string, string> {
  return { background: `${color}1F`, color };
}
