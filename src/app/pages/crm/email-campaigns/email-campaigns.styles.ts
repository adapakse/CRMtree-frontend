// Styles shared by the screens of the e-mail campaigns module (the app has no global copy of them).
export const EMAIL_CAMPAIGNS_SHARED_STYLES = `
  .ec-muted { color: var(--gray-500); font-size: 12px; font-weight: 400; }
  .ec-link { display: inline-flex; align-items: center; gap: 4px; border: 0; background: none; padding: 0; color: var(--orange); font-size: 12px;
             font-family: inherit; cursor: pointer; text-align: left; text-decoration: none; }
  .ec-link:disabled { opacity: .5; cursor: default; }
  .ec-info { display: flex; gap: 10px; align-items: flex-start; flex-wrap: wrap; border-radius: 10px; padding: 10px 14px; font-size: 14px;
             background: color-mix(in srgb, #EFF6FF var(--tint-mix), var(--surface));
             border: 1px solid color-mix(in srgb, #BFDBFE var(--tint-mix), var(--surface));
             color: oklch(from #1D4ED8 max(l, var(--text-min-l)) c h); }
  .ec-warn { border-radius: 10px; padding: 10px 14px; font-size: 14px;
             background: color-mix(in srgb, #FEFCE8 var(--tint-mix), var(--surface));
             border: 1px solid color-mix(in srgb, #FDE68A var(--tint-mix), var(--surface));
             color: oklch(from #854D0E max(l, var(--text-min-l)) c h); }
  .ec-error { border-radius: 10px; padding: 10px 14px; font-size: 14px;
              background: color-mix(in srgb, #FEF2F2 var(--tint-mix), var(--surface));
              border: 1px solid color-mix(in srgb, #FECACA var(--tint-mix), var(--surface));
              color: oklch(from #DC2626 max(l, var(--text-min-l)) c h); }
  .ec-ok { border-radius: 10px; padding: 10px 14px; font-size: 14px;
           background: color-mix(in srgb, #F0FDF4 var(--tint-mix), var(--surface));
           border: 1px solid color-mix(in srgb, #BBF7D0 var(--tint-mix), var(--surface));
           color: oklch(from #15803D max(l, var(--text-min-l)) c h); }
  .ec-badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; white-space: nowrap;
              background: var(--chip-bg); color: var(--chip-text); }
  .ec-badge.st-sending { background: color-mix(in srgb, #EFF6FF var(--tint-mix), var(--surface)); color: oklch(from #1D4ED8 max(l, var(--text-min-l)) c h); }
  .ec-badge.st-sent { background: color-mix(in srgb, #F0FDF4 var(--tint-mix), var(--surface)); color: oklch(from #15803D max(l, var(--text-min-l)) c h); }
  .ec-badge.st-failed { background: color-mix(in srgb, #FEF2F2 var(--tint-mix), var(--surface)); color: oklch(from #DC2626 max(l, var(--text-min-l)) c h); }
  .ec-input { box-sizing: border-box; height: 36px; border: 1px solid var(--control-border); background: var(--control-bg); color: var(--gray-800);
              border-radius: 10px; padding: 0 12px; font: 400 14px inherit; font-family: inherit; box-shadow: var(--shadow-field); min-width: 0; }
  .ec-input:hover { border-color: var(--orange); }
  .ec-input:focus { outline: none; border-color: var(--orange); box-shadow: var(--shadow-field), var(--ring-field); }
  .ec-input:disabled { opacity: .6; }
  textarea.ec-input { height: auto; padding: 8px 12px; resize: vertical; line-height: 1.4; }
  .ec-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
  .ec-empty .empty-tile, .ec-empty .empty-title { margin-bottom: 0; }
  .ec-nowrap { white-space: nowrap; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  /* Summary next to a button clicked with errors: "Fix the fields marked in red (N)". */
  .pf-err { align-self: center; font-size: 12px; font-weight: 500; color: oklch(from #dc2626 max(l, var(--text-min-l)) c h); }
  b { font-weight: 600; }
`;
