import { Signal, computed, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Observable, catchError, map, of, switchMap } from 'rxjs';

export const LIST_PAGE_SIZE = 50;

export type ListSortOrder = 'asc' | 'desc';
export type ListParams = Record<string, string>;

/** What every paged list endpoint returns. */
export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type ListFilterKind = 'text' | 'select' | 'multi' | 'dateRange' | 'numberRange';

export interface ListFilterOption {
  value: string;
  label: string;
}

/**
 * One filter of a list. `params` are the query parameters it writes: one for
 * text / select / multi (multi joins the picked values with commas), two —
 * lower and upper bound — for the ranges.
 */
export interface ListFilter {
  id: string;
  label: string;
  kind: ListFilterKind;
  params: string[];
  options?: ListFilterOption[];
  maxLength?: number;
  /** Number ranges only: the limits the inputs accept; omitted = no limit on that side. */
  min?: number;
  max?: number;
}

export interface ListSortOption {
  key: string;
  label: string;
}

const PAGING_AND_SORT_PARAMS = new Set(['page', 'page_size', 'sort', 'order']);
// Both bounds of a range ("end_from" / "end_to", "cost_min" / "cost_max") are one filter to the user.
const RANGE_BOUND_SUFFIX = /_(from|to|min|max)$/;

/**
 * Filters, sorting and the page of one server-side list, as signals. Filter
 * values are kept exactly as they travel in the query string, so the same
 * state serves the request and the address bar.
 */
export class ListQueryState {
  private readonly filterValues = signal<ListParams>({});
  readonly sort = signal<string | null>(null);
  readonly order = signal<ListSortOrder>('asc');
  readonly page = signal(1);

  readonly filters = this.filterValues.asReadonly();

  readonly activeFilterCount = computed(() =>
    new Set(Object.keys(this.filterValues()).map(param => param.replace(RANGE_BOUND_SUFFIX, ''))).size);

  /** True while the list is exactly what the server returns by default. */
  readonly isDefault = computed(() => this.activeFilterCount() === 0 && this.sort() === null);

  /** The request of a paged list. A list the server returns whole (the timeline) sends `filters()` alone. */
  readonly params = computed<ListParams>(() => ({
    ...this.filterValues(), ...this.sortParams(), page: String(this.page()), page_size: String(LIST_PAGE_SIZE),
  }));

  /** The state as it is written to the address: without defaults, so a plain list has a plain URL. */
  readonly queryParams = computed<ListParams>(() => {
    const params: ListParams = { ...this.filterValues(), ...this.sortParams() };
    if (this.page() > 1) params['page'] = String(this.page());
    return params;
  });

  value(param: string): string {
    return this.filterValues()[param] ?? '';
  }

  setValue(param: string, value: string): void {
    this.setValues({ [param]: value });
  }

  /** Empty values remove the filter. Any change returns to the first page. */
  setValues(values: ListParams): void {
    const next = { ...this.filterValues() };
    for (const [param, value] of Object.entries(values)) {
      if (value === '') delete next[param];
      else next[param] = value;
    }
    this.filterValues.set(next);
    this.page.set(1);
  }

  clearFilters(): void {
    this.filterValues.set({});
    this.page.set(1);
  }

  /** Unsorted → ascending → descending → unsorted. */
  toggleSort(key: string): void {
    if (this.sort() !== key) {
      this.sort.set(key);
      this.order.set('asc');
    } else if (this.order() === 'asc') {
      this.order.set('desc');
    } else {
      this.sort.set(null);
      this.order.set('asc');
    }
    this.page.set(1);
  }

  setSort(key: string | null, order: ListSortOrder): void {
    this.sort.set(key);
    this.order.set(order);
    this.page.set(1);
  }

  /** Reads the state back from an address; `ignoredParams` belong to the screen, not to the list. */
  restore(queryParams: { keys: string[]; get(name: string): string | null }, ignoredParams: string[] = []): void {
    const filters: ListParams = {};
    for (const key of queryParams.keys) {
      const value = queryParams.get(key);
      if (value && !PAGING_AND_SORT_PARAMS.has(key) && !ignoredParams.includes(key)) filters[key] = value;
    }
    this.filterValues.set(filters);
    this.sort.set(queryParams.get('sort'));
    this.order.set(queryParams.get('order') === 'desc' ? 'desc' : 'asc');
    const page = Number(queryParams.get('page'));
    this.page.set(Number.isInteger(page) && page > 0 ? page : 1);
  }

  private sortParams(): ListParams {
    const sort = this.sort();
    return sort ? { sort, order: this.order() } : {};
  }
}

export interface ListLoader<R> {
  /** Null until the first response and after a failed request. */
  readonly result: Signal<R | null>;
  readonly isLoading: Signal<boolean>;
  /** Repeats the last request, e.g. after an item was edited. */
  reload(): void;
}

/**
 * Requests the list again whenever its parameters change and drops the answer
 * of a request that was overtaken by a newer one. `params` returning null
 * pauses loading (e.g. while another view is shown). Must be called in an
 * injection context.
 */
export function createListLoader<R>(
  params: Signal<ListParams | null>,
  fetch: (params: ListParams) => Observable<R>,
  onError: (error: unknown) => void,
): ListLoader<R> {
  const result = signal<R | null>(null);
  const isLoading = signal(false);
  const revision = signal(0);
  const request = computed(() => ({ params: params(), revision: revision() }));

  toObservable(request).pipe(
    switchMap(({ params: requestParams }) => {
      if (requestParams === null) return of(undefined);
      isLoading.set(true);
      return fetch(requestParams).pipe(
        map(response => response as R | null),
        catchError(error => {
          onError(error);
          return of(null);
        }),
      );
    }),
    takeUntilDestroyed(),
  ).subscribe(response => {
    if (response === undefined) return;
    result.set(response);
    isLoading.set(false);
  });

  return { result: result.asReadonly(), isLoading: isLoading.asReadonly(), reload: () => revision.update(value => value + 1) };
}
