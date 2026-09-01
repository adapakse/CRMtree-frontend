import { DocStatus, DocType, GdprType, TaskType } from '../models/models';

export const STATUS_MAP: Record<DocStatus, { label: string; cls: string }> = {
  new:             { label: 'Nowy',            cls: 's-new' },
  being_edited:    { label: 'W edycji',        cls: 's-editing' },
  being_signed:    { label: 'W podpisywaniu',  cls: 's-signing' },
  being_approved:  { label: 'W akceptacji',    cls: 's-approving' },
  signed:          { label: 'Podpisany',       cls: 's-signed' },
  hold:            { label: 'Wstrzymany',      cls: 's-hold' },
  completed:       { label: 'Zakończony',      cls: 's-completed' },
  rejected:        { label: 'Odrzucony',       cls: 's-rejected' },
};

export const DOC_TYPE_MAP: Record<DocType, string> = {
  partner_agreement:      'Umowa partnerska',
  it_supplier_agreement:  'Umowa z dostawcą IT',
  employee_agreement:     'Umowa pracownicza',
  nda:                    'NDA',
  operator_agreement:     'Umowa operatorska',
};

export const GDPR_MAP: Record<GdprType, { label: string; cls: string }> = {
  data_processing_entrustment: { label: 'Powierzenie', cls: 'gp' },
  data_administration:          { label: 'Współadministrowanie', cls: 'ga' },
  no_gdpr:                      { label: 'Brak GDPR', cls: 'gn' },
};

export const TASK_TYPE_MAP: Record<TaskType, { label: string; cls: string }> = {
  read:    { label: 'Odczyt',     cls: 'task-read' },
  edit:    { label: 'Edycja',     cls: 'task-edit' },
  approve: { label: 'Akceptacja', cls: 'task-approve' },
  sign:    { label: 'Podpis',     cls: 'task-sign' },
};

export function groupCssClass(groupName: string): string {
  const map: Record<string, string> = {
    Management:  'g-management',
    Zarząd:      'g-zarzad',
    Zarzad:      'g-zarzad',
    Sales:       'g-sales',
    Sprzedaż:    'g-sprzedaz',
    Sprzedaz:    'g-sprzedaz',
    Marketing:   'g-marketing',
    HR:          'g-hr',
    Accounting:  'g-accounting',
    Operations:  'g-operations',
  };
  return map[groupName] ?? 'g-operations';
}

export function initials(name: string): string {
  return (name ?? '')
    .split(' ')
    .slice(0, 2)
    .map(n => n[0] ?? '')
    .join('')
    .toUpperCase();
}

export function fileSizeLabel(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Returns true when the document expires within `days` days from now.
 * IMPORTANT: `days` should come from AppSettingsService.get('expiration_soon_days')
 * — do not use the fallback default 30 in new code.
 */
export function isExpiringSoon(dateStr?: string, days = 30): boolean {
  if (!dateStr) return false;
  const daysLeft = (new Date(dateStr).getTime() - Date.now()) / 86_400_000;
  return daysLeft >= 0 && daysLeft <= days;
}

export function isExpired(dateStr?: string): boolean {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < Date.now();
}

/**
 * Returns CSS color for expiration display:
 *   daysLeft > threshold  → '' (inherit)
 *   daysLeft ≤ threshold  → '#DC2626' (red)
 * IMPORTANT: `thresholdDays` should come from AppSettingsService.get('expiration_red_days')
 */
export function expirationColor(dateStr?: string, thresholdDays = 90): string {
  if (!dateStr) return '';
  const daysLeft = (new Date(dateStr).getTime() - Date.now()) / 86_400_000;
  return daysLeft <= thresholdDays ? '#DC2626' : '';
}
