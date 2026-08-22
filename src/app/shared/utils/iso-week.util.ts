// Date helpers for the SEObot publishing calendar (seo-publishing-calendar.component.ts)
// — mirrors backend/src/utils/isoWeek.js so both sides agree on "which
// Monday does this date belong to" using plain calendar dates, no time-of-day.

export function mondayOf(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay(); // 0=Sun..6=Sat
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
