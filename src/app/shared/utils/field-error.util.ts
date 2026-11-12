/**
 * After a rejected save, brings the first field marked `.fi-err` into view and
 * focuses it. The error markup appears on the next change detection, hence
 * the one-frame delay.
 */
export function scrollToFirstFieldError(): void {
  if (typeof document === 'undefined') return;
  requestAnimationFrame(() => {
    const field = document.querySelector<HTMLElement>('.fi-err');
    if (!field) return;
    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    field.focus({ preventScroll: true });
  });
}

// crm_leads.value_pln is NUMERIC(14,2): anything above this overflows the column.
const MAX_AMOUNT = 999_999_999_999.99;

/** Translation key (under `fieldErrors`) for an amount the database cannot store, or '' when it is fine. */
export function amountError(value: unknown): '' | 'valueTooLarge' | 'valueNegative' {
  if (value === null || value === undefined || value === '') return '';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  if (amount < 0) return 'valueNegative';
  return amount > MAX_AMOUNT ? 'valueTooLarge' : '';
}
