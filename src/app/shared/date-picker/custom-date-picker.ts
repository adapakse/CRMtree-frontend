const ICON_HIT_WIDTH = 40;
const PANEL_WIDTH = 292;
const VIEWPORT_MARGIN = 8;
const PANEL_GAP = 6;
const SVG_NS = 'http://www.w3.org/2000/svg';

const CHEVRON_LEFT = 'M15 18l-6-6 6-6';
const CHEVRON_RIGHT = 'M9 18l6-6-6-6';
const CLEAR_ICON = 'M18 6L6 18M6 6l12 12';

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseIsoDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? { year: +match[1], month: +match[2] - 1, day: +match[3] } : null;
}

function createIcon(doc: Document, path: string): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const shape = doc.createElementNS(SVG_NS, 'path');
  shape.setAttribute('d', path);
  svg.appendChild(shape);
  return svg;
}

function createButton(doc: Document, className: string, onClick: () => void): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = className;
  button.addEventListener('click', onClick);
  return button;
}

/**
 * Replaces the native date popup (which cannot be styled) with a custom calendar.
 * Only the calendar icon area opens it; typing into the date segments stays native.
 */
export function enableCustomDatePicker(doc: Document): void {
  const win = doc.defaultView;
  if (!win) return;

  let panel: HTMLDivElement | null = null;
  let input: HTMLInputElement | null = null;
  let viewYear = 0;
  let viewMonth = 0;

  function close(): void {
    panel?.remove();
    panel = null;
    input = null;
  }

  function selectValue(value: string): void {
    const target = input;
    if (!target) return;
    target.value = value;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    close();
    target.focus();
  }

  function shiftMonth(delta: number): void {
    const shifted = new Date(viewYear, viewMonth + delta, 1);
    viewYear = shifted.getFullYear();
    viewMonth = shifted.getMonth();
    render();
  }

  function render(): void {
    if (!panel || !input) return;
    const locale = doc.documentElement.lang || 'pl';
    const selectedIso = input.value;
    const now = new Date();
    const todayIso = toIsoDate(now.getFullYear(), now.getMonth(), now.getDate());
    const { min, max } = input;
    const isOutOfRange = (iso: string) => (!!min && iso < min) || (!!max && iso > max);

    const header = doc.createElement('div');
    header.className = 'crm-dp__header';
    const previous = createButton(doc, 'crm-dp__nav', () => shiftMonth(-1));
    previous.appendChild(createIcon(doc, CHEVRON_LEFT));
    const title = doc.createElement('span');
    title.className = 'crm-dp__title';
    title.textContent = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
      .format(new Date(viewYear, viewMonth, 1));
    const next = createButton(doc, 'crm-dp__nav', () => shiftMonth(1));
    next.appendChild(createIcon(doc, CHEVRON_RIGHT));
    header.append(previous, title, next);

    const weekdays = doc.createElement('div');
    weekdays.className = 'crm-dp__weekdays';
    const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    for (let i = 0; i < 7; i++) {
      const label = doc.createElement('span');
      // 2024-01-01 is a Monday, so the week starts on Monday.
      label.textContent = weekdayFormat.format(new Date(2024, 0, 1 + i)).slice(0, 2);
      weekdays.appendChild(label);
    }

    const grid = doc.createElement('div');
    grid.className = 'crm-dp__grid';
    const leadingBlanks = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let i = 0; i < leadingBlanks; i++) grid.appendChild(doc.createElement('span'));
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = toIsoDate(viewYear, viewMonth, day);
      const button = createButton(doc, 'crm-dp__day', () => selectValue(iso));
      button.textContent = String(day);
      if (iso === todayIso) button.classList.add('crm-dp__day--today');
      if (iso === selectedIso) button.classList.add('crm-dp__day--selected');
      button.disabled = isOutOfRange(iso);
      grid.appendChild(button);
    }

    const footer = doc.createElement('div');
    footer.className = 'crm-dp__footer';
    const todayText = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(0, 'day');
    const todayButton = createButton(doc, 'crm-dp__today', () => selectValue(todayIso));
    todayButton.textContent = todayText.charAt(0).toUpperCase() + todayText.slice(1);
    todayButton.disabled = isOutOfRange(todayIso);
    const clearButton = createButton(doc, 'crm-dp__clear', () => selectValue(''));
    clearButton.appendChild(createIcon(doc, CLEAR_ICON));
    footer.append(todayButton, clearButton);

    panel.replaceChildren(header, weekdays, grid, footer);
  }

  function position(): void {
    if (!panel || !input || !win) return;
    const rect = input.getBoundingClientRect();
    const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, win.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN));
    const height = panel.offsetHeight;
    const fitsBelow = rect.bottom + PANEL_GAP + height <= win.innerHeight - VIEWPORT_MARGIN;
    const top = fitsBelow ? rect.bottom + PANEL_GAP : Math.max(VIEWPORT_MARGIN, rect.top - PANEL_GAP - height);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function open(target: HTMLInputElement): void {
    close();
    input = target;
    const now = new Date();
    const base = parseIsoDate(target.value) ?? { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
    viewYear = base.year;
    viewMonth = base.month;
    panel = doc.createElement('div');
    panel.className = 'crm-dp';
    doc.body.appendChild(panel);
    render();
    position();
  }

  doc.addEventListener('click', (event) => {
    const target = event.target;
    if (panel && target instanceof Node && panel.contains(target)) return;
    if (target instanceof win.HTMLInputElement && target.type === 'date' && !target.disabled && !target.readOnly
      && event.clientX >= target.getBoundingClientRect().right - ICON_HIT_WIDTH) {
      event.preventDefault();
      event.stopPropagation();
      open(target);
      return;
    }
    close();
  }, true);

  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  doc.addEventListener('scroll', (event) => {
    if (panel && event.target instanceof Node && panel.contains(event.target)) return;
    close();
  }, true);

  win.addEventListener('resize', close);
}
