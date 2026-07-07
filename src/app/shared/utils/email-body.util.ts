// Removes automatically-generated empty paragraphs/<br> from the very start
// and end of Quill-produced HTML — e.g. a stray leading <p><br></p> or a
// trailing <div><br></div> — without touching blank lines the user typed on
// purpose in the middle of the message. Mirrors the equivalent trimming done
// on received Gmail replies in CRMtree-backend's gmailService.stripQuotedContent.
export function trimEdgeEmptyHtml(html: string): string {
  const source = (html || '').trim();
  if (!source) return source;

  const container = document.createElement('div');
  container.innerHTML = source;

  const isEmptyNode = (node: ChildNode): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      return !(node.textContent || '').trim();
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node as HTMLElement;
    if (el.tagName === 'BR') return true;
    const hasMedia = !!el.querySelector('img,video,audio,iframe,table,hr');
    return !hasMedia && !(el.textContent || '').trim();
  };

  const trimEdge = (fromStart: boolean): void => {
    let node = fromStart ? container.firstChild : container.lastChild;
    while (node && isEmptyNode(node)) {
      const sibling: ChildNode | null = fromStart ? node.nextSibling : node.previousSibling;
      container.removeChild(node);
      node = sibling;
    }
  };

  trimEdge(true);
  trimEdge(false);

  return container.innerHTML;
}
