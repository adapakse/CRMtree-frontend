export interface PeriodDates {
  from:      string;  // YYYY-MM-DD
  to:        string;  // YYYY-MM-DD
  periodEnd: string;  // YYYY-MM-DD
}

export function getPresetDates(preset: string, customFrom = '', customTo = ''): PeriodDates {
  const now   = new Date();
  const fmt   = (d: Date) => {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };
  const today = fmt(now);
  const y     = now.getFullYear();
  const m     = now.getMonth();

  switch (preset) {
    case 'cm': {
      const start = fmt(new Date(y, m, 1));
      const end   = fmt(new Date(y, m + 1, 0));
      return { from: start, to: today, periodEnd: end };
    }
    case 'cq': {
      const q     = Math.floor(m / 3);
      const start = fmt(new Date(y, q * 3, 1));
      const end   = fmt(new Date(y, q * 3 + 3, 0));
      return { from: start, to: today, periodEnd: end };
    }
    case 'ytd':
      return { from: `${y}-01-01`, to: today, periodEnd: `${y}-12-31` };

    case 'prev_1m': {
      const start = fmt(new Date(y, m - 1, 1));
      const end   = fmt(new Date(y, m, 0));
      return { from: start, to: end, periodEnd: end };
    }
    case 'prev_q': {
      const q  = Math.floor(m / 3);
      const pq = q === 0 ? 3 : q - 1;
      const py = q === 0 ? y - 1 : y;
      const start = fmt(new Date(py, pq * 3, 1));
      const end   = fmt(new Date(py, pq * 3 + 3, 0));
      return { from: start, to: end, periodEnd: end };
    }
    case 'prev_year':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, periodEnd: `${y - 1}-12-31` };

    case 'custom': {
      const from = customFrom || today;
      const to   = customTo   || today;
      return { from, to, periodEnd: to };
    }
    default: {
      const q     = Math.floor(m / 3);
      const start = fmt(new Date(y, q * 3, 1));
      const end   = fmt(new Date(y, q * 3 + 3, 0));
      return { from: start, to: today, periodEnd: end };
    }
  }
}
