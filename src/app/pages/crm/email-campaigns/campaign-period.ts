// Ready-made periods of the results tab ("This month", "This quarter"…).

export type Preset = 'all' | 'month' | 'prev_month' | 'last30' | 'quarter' | 'year' | 'custom';

export const PRESETS: Preset[] = ['all', 'month', 'prev_month', 'last30', 'quarter', 'year', 'custom'];

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** [from, to] of a preset in the browser's local time; 'all' and 'custom' give empty bounds. */
export function presetRange(preset: Preset): [string, string] {
  const now = new Date(), year = now.getFullYear(), month = now.getMonth();
  switch (preset) {
    case 'month': return [isoDate(new Date(year, month, 1)), isoDate(new Date(year, month + 1, 0))];
    case 'prev_month': return [isoDate(new Date(year, month - 1, 1)), isoDate(new Date(year, month, 0))];
    case 'last30': return [isoDate(new Date(year, month, now.getDate() - 29)), isoDate(now)];
    case 'quarter': {
      const quarterStart = Math.floor(month / 3) * 3;
      return [isoDate(new Date(year, quarterStart, 1)), isoDate(new Date(year, quarterStart + 3, 0))];
    }
    case 'year': return [isoDate(new Date(year, 0, 1)), isoDate(new Date(year, 11, 31))];
    default: return ['', ''];
  }
}

export const SENDGRID_TEMPLATES_URL = 'https://mc.sendgrid.com/dynamic-templates';

/** Query parameters that belong to the campaigns screen, not to the campaign list's filters. */
export const CAMPAIGNS_SCREEN_PARAMS = ['tab', 'campaign'];
