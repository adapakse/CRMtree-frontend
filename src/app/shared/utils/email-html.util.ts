import DOMPurify from 'dompurify';

/**
 * Incoming e-mails are written by anyone who mails a salesperson, so their HTML
 * must never run code in the CRM. DOMPurify drops scripts, event handlers and
 * javascript: links but keeps the e-mail's own formatting (inline styles,
 * tables), which Angular's built-in sanitizer would strip.
 * <style>/<form> are removed too: they could restyle or fake the CRM page itself.
 */
const EMAIL_PURIFY_CONFIG = {
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'base', 'meta', 'link'],
  FORBID_ATTR: ['srcset'],
};

let hasLinkHook = false;

export function sanitizeEmailHtml(html: string): string {
  // Server-side rendering has no DOM to sanitize with; e-mails are shown in the browser only.
  if (!html || !DOMPurify.isSupported) return '';
  if (!hasLinkHook) {
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node instanceof HTMLAnchorElement && node.hasAttribute('href')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
    hasLinkHook = true;
  }
  return DOMPurify.sanitize(html, EMAIL_PURIFY_CONFIG);
}
