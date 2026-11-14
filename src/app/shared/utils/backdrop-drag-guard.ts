/**
 * Modals close on a click on their backdrop. When a press starts inside the
 * modal (e.g. selecting text in a field) and the mouse is released over the
 * backdrop, the browser fires that click on the backdrop — their nearest
 * common ancestor — and the modal closed mid-selection. App-wide, such a click
 * is dropped: a backdrop only receives clicks that were also pressed on it.
 */
export function preventBackdropCloseOnDrag(doc: Document): void {
  let pressTarget: Node | null = null;
  doc.addEventListener('mousedown', event => { pressTarget = event.target as Node | null; }, true);
  doc.addEventListener('click', event => {
    const pressed = pressTarget;
    pressTarget = null;
    const target = event.target;
    if (!(target instanceof Element) || !pressed || pressed === target) return;
    if (!target.contains(pressed)) return;
    if (target.closest('button, a, label, summary, [role="button"], input, select, textarea')) return;
    if (doc.defaultView?.getComputedStyle(target).position !== 'fixed') return;
    event.stopImmediatePropagation();
    event.preventDefault();
  }, true);
}
