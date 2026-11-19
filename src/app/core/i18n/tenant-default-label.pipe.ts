import { Injectable, Pipe, PipeTransform, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { TenantDictionary, tenantDefaultLabelKey } from './tenant-default-labels';

/**
 * Display text of a stored tenant dictionary value: the translation when the
 * value is a seeded default, otherwise the value as stored. Display only —
 * never feed the result back into a form value, filter or API call.
 */
@Injectable({ providedIn: 'root' })
export class TenantDefaultLabels {
  private readonly transloco = inject(TranslocoService);

  label(dictionary: TenantDictionary, value: string | null | undefined): string {
    const key = tenantDefaultLabelKey(dictionary, value);
    return key ? this.transloco.translate(key) : (value ?? '');
  }
}

// Pure on purpose: the `common` scope is loaded before the app renders and a
// language change reloads the page, so a value's label never changes in place.
@Pipe({ name: 'tenantLabel', standalone: true })
export class TenantDefaultLabelPipe implements PipeTransform {
  private readonly labels = inject(TenantDefaultLabels);

  transform(value: string | null | undefined, dictionary: TenantDictionary): string {
    return this.labels.label(dictionary, value);
  }
}
