/**
 * Submit buttons stay clickable (product owner's rule: a greyed-out button does not
 * say what to fix). A click with errors marks the fields red and brings the first
 * one into view; the render that adds `.fi-err` happens first, hence the timeout.
 */
export function scrollToFirstError(container: ParentNode = document): void {
  setTimeout(() => {
    const field = container.querySelector<HTMLElement>('.fi-err');
    field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    field?.focus({ preventScroll: true });
  });
}
