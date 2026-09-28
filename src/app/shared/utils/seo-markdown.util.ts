// SEObot article bodies are stored as a small, fixed markdown subset (## / ###
// headings, "- " and "1. " lists, > blockquotes, standalone ![caption](src)
// images, tables, **bold**, [text](url) links) — see CRMtree-backend's
// seoContentService.renderBody. Mirrors CRMtree-backend's utils/seoMarkdown.js
// (used for WordPress); keep both in sync.
//
// Text is HTML-escaped before any tag is added, so this only ever emits the
// whitelisted tags below, never markup coming straight from the source text.
// Parsed line by line, not block by block: numbered lists were not supported
// and the model doesn't always put a blank line before a list, so whole lists
// rendered as one run-on paragraph (12 of the first 22 articles, 2026-09-28).

const SLOT_LINE = /^\[\[SLOT:[a-z0-9_-]+\]\]$/i;
const IMAGE_LINE = /^!\[([^\]]*)\]\((\/[^)\s]*|https:\/\/[^)\s]*)\)$/;
const UNORDERED_ITEM = /^[-*]\s+(.*)$/;
const ORDERED_ITEM = /^\d+[.)]\s+(.*)$/;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderInline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Only relative (/blog/...) or https:// links are honored — anything else stays plain text.
  out = out.replace(/\[([^\]]+)\]\((\/[^)\s]*|https:\/\/[^)\s]*)\)/g, (_m, label: string, href: string) => {
    const external = href.startsWith('https://');
    return `<a href="${href}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
  });
  return out;
}

function isTableSeparatorRow(line: string): boolean {
  return /-/.test(line) && /^\|?[\s:-]+\|[\s:|-]*\|?$/.test(line.trim());
}

function parseTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function startsOtherBlock(line: string): boolean {
  return !line || SLOT_LINE.test(line) || /^(#{2,3} |>|\|)/.test(line) || IMAGE_LINE.test(line)
    || UNORDERED_ITEM.test(line) || ORDERED_ITEM.test(line);
}

// A quote block's last paragraph starting with a dash is the attribution.
function renderBlockquote(lines: string[]): string {
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line) { current.push(line); continue; }
    if (current.length) paragraphs.push(current.join(' '));
    current = [];
  }
  if (current.length) paragraphs.push(current.join(' '));
  const parts = paragraphs.map((p) =>
    /^[—–-]\s/.test(p) ? `<footer>${renderInline(p)}</footer>` : `<p>${renderInline(p)}</p>`,
  );
  return `<blockquote>${parts.join('')}</blockquote>`;
}

export function renderSeoMarkdown(body: string): string {
  const lines = (body || '').replace(/\r\n/g, '\n').split('\n').map((l) => l.trim());
  const html: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line || SLOT_LINE.test(line)) { i++; continue; }

    if (line.startsWith('### ')) { html.push(`<h3>${renderInline(line.slice(4))}</h3>`); i++; continue; }
    if (line.startsWith('## ')) { html.push(`<h2>${renderInline(line.slice(3))}</h2>`); i++; continue; }

    const image = line.match(IMAGE_LINE);
    if (image) {
      const caption = image[1].trim();
      const figcaption = caption ? `<figcaption>${renderInline(caption)}</figcaption>` : '';
      html.push(`<figure><img src="${escapeHtml(image[2])}" alt="${escapeHtml(caption)}" loading="lazy">${figcaption}</figure>`);
      i++;
      continue;
    }

    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, '').trim());
        i++;
      }
      html.push(renderBlockquote(quoteLines));
      continue;
    }

    if (line.startsWith('|') && i + 1 < lines.length && isTableSeparatorRow(lines[i + 1])) {
      const header = parseTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(parseTableRow(lines[i])); i++; }
      html.push(`<table><thead><tr>${header.map((h) => `<th>${renderInline(h)}</th>`).join('')}</tr></thead><tbody>${rows
        .map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`);
      continue;
    }

    const listPattern = UNORDERED_ITEM.test(line) ? UNORDERED_ITEM : ORDERED_ITEM.test(line) ? ORDERED_ITEM : null;
    if (listPattern) {
      const items: string[] = [];
      while (i < lines.length && listPattern.test(lines[i])) { items.push(lines[i].match(listPattern)![1]); i++; }
      const tag = listPattern === UNORDERED_ITEM ? 'ul' : 'ol';
      html.push(`<${tag}>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${tag}>`);
      continue;
    }

    const paragraph = [line];
    i++;
    while (i < lines.length && !startsOtherBlock(lines[i])) { paragraph.push(lines[i]); i++; }
    html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
  }
  return html.join('');
}
