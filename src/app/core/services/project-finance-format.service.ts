import { Injectable, inject } from '@angular/core';
import { LocaleService } from '../i18n/locale.service';

export const PROJECT_CURRENCIES = ['PLN', 'EUR', 'USD', 'GBP', 'CHF', 'CZK'];

const EMPTY_VALUE = '—';

/** Money, percentages and dates of project finance, written the way the active language does. */
@Injectable({ providedIn: 'root' })
export class ProjectFinanceFormatService {
  private readonly locale = inject(LocaleService).activeLocale();
  private readonly moneyFormatters = new Map<string, Intl.NumberFormat>();
  private readonly amountFormatter = new Intl.NumberFormat(this.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  private readonly percentFormatter = new Intl.NumberFormat(this.locale, { style: 'percent', maximumFractionDigits: 1 });
  private readonly rateFormatter = new Intl.NumberFormat(this.locale, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  private readonly dateFormatter = new Intl.DateTimeFormat(this.locale, {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  });

  private readonly dateTimeFormatter = new Intl.DateTimeFormat(this.locale, {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  money(amount: number | null | undefined, currency: string): string {
    if (amount === null || amount === undefined) return EMPTY_VALUE;
    return this.moneyFormatter(currency).format(amount);
  }

  /** An amount without its currency, for tables that show the currency in a column of its own. */
  plainAmount(amount: number | null | undefined): string {
    if (amount === null || amount === undefined) return EMPTY_VALUE;
    return this.amountFormatter.format(amount);
  }

  /** `percent` is in percentage points, as the API sends it (12.5 = 12.5%). */
  percent(percent: number | null | undefined): string {
    if (percent === null || percent === undefined) return EMPTY_VALUE;
    return this.percentFormatter.format(percent / 100);
  }

  exchangeRate(rate: number): string {
    return this.rateFormatter.format(rate);
  }

  /** `isoDate` is a calendar day ("YYYY-MM-DD"); a longer timestamp is cut to its day. */
  date(isoDate: string | null | undefined): string {
    if (!isoDate) return EMPTY_VALUE;
    const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? isoDate : this.dateFormatter.format(date);
  }

  /** A moment in time, shown in the viewer's time zone. */
  dateTime(isoTimestamp: string | null | undefined): string {
    if (!isoTimestamp) return EMPTY_VALUE;
    const date = new Date(isoTimestamp);
    return Number.isNaN(date.getTime()) ? isoTimestamp : this.dateTimeFormatter.format(date);
  }

  private moneyFormatter(currency: string): Intl.NumberFormat {
    let formatter = this.moneyFormatters.get(currency);
    if (!formatter) {
      formatter = new Intl.NumberFormat(this.locale, { style: 'currency', currency });
      this.moneyFormatters.set(currency, formatter);
    }
    return formatter;
  }
}
