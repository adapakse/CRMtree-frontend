# WorkTripsDoc CRM — Frontend

## Stack

* **Framework:** Angular 18+ Standalone Components
* **Język:** TypeScript strict
* **Style:** Inline styles w komponentach (brak globalnego SCSS), CSS variables
* **Change detection:** `ChangeDetectionStrategy.OnPush` w większości komponentów
* **State:** Angular Signals (`signal()`, `computed()`) + `ChangeDetectorRef.markForCheck()`
* **HTTP:** `HttpClient` przez `CrmApiService`
* **Routing:** Lazy-loaded standalone components w `app.routes.ts`
* **Auth:** JWT w `sessionStorage`, `AuthService`
* **NgZone:** Wszystkie callbacki HTTP opakowywać w `this.zone.run(() => { ... })`

## Struktura katalogów

```
src/app/
  app.routes.ts                    ← routing (lazy load)
  core/
    auth/
      auth.service.ts              ← JWT, user signal, guards
      guards.ts                    ← authGuard, adminGuard, crmGuard, adminOrSalesManagerGuard
    services/
      crm-api.service.ts           ← WSZYSTKIE wywołania API CRM
      app-settings.service.ts      ← AppSettings (signal + reload)
      toast.service.ts             ← powiadomienia
      workflow.service.ts          ← zadania workflow
  layout/
    shell/
      shell.component.ts           ← sidebar nav + main layout
  pages/
    login/                         ← login, SAML callback
    dashboard/
    documents/
      list/
        documents-list.component.ts
    workflow/
    groups/
    users/
    logs/
    admin/
      settings/
        settings.component.ts      ← AppSettings panel (admin)
      data-management/
        data-management.component.ts
    crm/
      leads/
        crm-leads-list.component.ts   ← lista leadów + Nowy Lead modal
        crm-lead-detail.component.ts  ← szczegóły leada + edycja
      partners/
        crm-partners-list.component.ts
        crm-partner-detail.component.ts
      onboarding/
        crm-onboarding.component.ts   ← panel onboarding (4 widoki)
      groups/
        crm-groups.component.ts
      reports/
        crm-reports.component.ts
        crm-reports-leads.component.ts
        crm-reports-partners.component.ts
      calendar/
        crm-calendar.component.ts
      import/
        crm-import.component.ts
environments/
  environment.ts         ← { apiUrl: 'http://localhost:3000/api' }
  environment.prod.ts    ← { apiUrl: '/api' }
```

## Powiązany projekt — Backend

Kod backendu znajduje się w: `C:\Users\Adam\Documents\worktrips-doc-backend`
Opis backendu: [`backend-CLAUDE.md`](../worktrips-doc-backend/backend-CLAUDE.md)

## Routing (`app.routes.ts`)

```
/dashboard
/documents
/workflow, /groups, /users, /logs
/admin/settings, /admin/data
/crm/leads, /crm/leads/:id
/crm/reports, /crm/reports/leads, /crm/reports/partners
/crm/calendar
/crm/import
/crm/partners, /crm/partners/:id
/crm/partner-groups
/crm/onboarding                    ← panel onboarding (query: ?partner=:id)
```

Guards: `authGuard` (wszystkie), `crmGuard` (CRM), `adminGuard` (admin), `adminOrSalesManagerGuard`

## Konwencje komponentów

### Szablon komponentu

```typescript
@Component({
  selector: 'wt-...',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: \[CommonModule, FormsModule, RouterModule],
  template: `...`,
  styles: \[`...`],
})
export class XxxComponent implements OnInit {
  private api   = inject(CrmApiService);
  private cdr   = inject(ChangeDetectorRef);
  private zone  = inject(NgZone);
  private auth  = inject(AuthService);

  // State — signals dla reaktywności
  items = signal<Item\[]>(\[]);
  loading = signal(true);

  // Computed — MUSZĄ bazować na signals (nie na zwykłych polach!)
  filtered = computed(() => this.items().filter(...));

  // Filtry jako signals (jeśli używane w computed())
  search = signal('');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.getItems().subscribe({
      next: data => this.zone.run(() => {
        this.items.set(data);
        this.loading.set(false);
        this.cdr.markForCheck();
      }),
      error: () => this.zone.run(() => {
        this.loading.set(false);
        this.cdr.markForCheck();
      }),
    });
  }
}
```

### Ważne reguły Angular

1. **OnPush + zone.run** — zawsze opakowywać HTTP callbacks w `zone.run()` + `cdr.markForCheck()`
2. **Signals w computed()** — `computed()` śledzi TYLKO sygnały. Zwykłe pola (`string`, `boolean`) nie triggerują przeliczenia. Filtry używane w `computed()` MUSZĄ być `signal()`.
3. **Mutacja sygnału tablicy** — `fields.update(f => \[...f])` zamiast mutowania obiektu wewnątrz tablicy (żeby `computed()` wykrył zmianę).
4. **Template — private w klasie** — `private cdr` nie jest dostępny z template. Używaj publicznych metod.
5. **@if/@for w template** — Angular 18 control flow. NIE używaj `\*ngIf`/`\*ngFor` jako atrybutów gdy używasz `@if`/`@for` (choć `\*ngFor` i `\*ngIf` jako dyrektywy nadal działają z CommonModule).
6. **`{` w template** — w string interpolacji Angular traktuje `{` jako blok. Uciekaj: `{{ '{' }}` i `{{ '}' }}`.

### CSS Variables (globalne)

```css
--orange: #f97316
--gray-50 / --gray-100 / --gray-200 / --gray-300
--gray-400 / --gray-500 / --gray-600 / --gray-700
--gray-800 / --gray-900
```

### Wzorzec formularza (inline style)

```css
.fg   { display:flex; flex-direction:column }
.fl   { font-size:12px; font-weight:600; color:var(--gray-700); margin-bottom:4px }
.fi   { border:1px solid var(--gray-200); border-radius:6px; padding:7px 10px; font-size:13px }
.fsel { border:1px solid var(--gray-200); border-radius:6px; padding:7px 10px; font-size:13px; background:white }
.fta  { border:1px solid var(--gray-200); border-radius:6px; padding:7px 10px; font-size:13px; resize:vertical }
.fi-err { border-color:#ef4444 }
.ferr { font-size:11px; color:#ef4444; margin-top:2px }
```

## CrmApiService — kluczowe metody

```typescript
// Leads
getLeads(params)                    → PagedResponse<Lead>
getLead(id)                         → Lead (z extra\_contacts, activities)
createLead(data)                    → Lead
updateLead(id, data)                → Lead
deleteLead(id)                      → void
getLeadSources()                    → LeadSource\[]  // \[{value, label, group}]
getLeadContacts(leadId)             → LeadContact\[]
saveLeadContacts(leadId, contacts)  → LeadContact\[]  // replace all

// Partners
getPartners(params)                 → PagedResponse<Partner>  // BEZ onboarding!
getPartner(id)                      → Partner
createPartner(data)                 → Partner
updatePartner(id, data)             → Partner

// Onboarding
getOnboardingPartners(params)       → OnboardingPartner\[]
getOnboardingAllTasks(params)       → OnboardingTask\[]
getOnboardingTasks(partnerId)       → OnboardingTask\[]
createOnboardingTask(pid, data)     → OnboardingTask
updateOnboardingTask(pid, tid, data)→ OnboardingTask
deleteOnboardingTask(pid, tid)      → void
updateOnboardingStep(pid, step)     → Partner  // PATCH /partners/:id/onboarding

// AppSettings
// Via AppSettingsService.settings() signal i AppSettingsService.meta() signal
```

## Kluczowe interfejsy

```typescript
interface Lead {
  id, company, nip, contact\_name, contact\_title, email, phone,
  source, stage: LeadStage, value\_pln, probability, close\_date,
  first\_contact\_date, industry, assigned\_to, assigned\_to\_name,
  tags, notes, hot, lost\_reason, annual\_turnover\_currency, online\_pct,
  website, logo\_url, converted\_at, converted\_partner\_id,
  agent\_name, agent\_email, agent\_phone,
  activities?, linked\_documents?, extra\_contacts?: LeadContact\[],
  created\_at, updated\_at
}

type LeadStage = 'new'|'qualification'|'presentation'|'offer'|'negotiation'|'closed\_won'|'closed\_lost'

interface LeadSource { value: string; label: string; group: string | null; }
interface LeadContact { id?, lead\_id?, contact\_name, contact\_title, email, phone }

interface Partner {
  id, company, nip, partner\_number, status: PartnerStatus,
  onboarding\_step: number, manager\_id, group\_id,
  contact\_name, contact\_title, email, phone,
  contract\_signed, contract\_expires, contract\_value,
  subdomain, language, partner\_currency, country,
  billing\_\*, admin\_\*, commission\_\*, credit\_limit\_\*, deposit\_\*,
  tags, notes, created\_at, updated\_at
}

type PartnerStatus = 'onboarding'|'active'|'inactive'|'churned'

interface OnboardingTask {
  id, partner\_id, partner\_name?, partner\_nip?,
  step: 0|1|2|3, title, body, type, assigned\_to, assigned\_to\_name,
  due\_date, due\_time, done, done\_at, done\_by, created\_at
}

interface OnboardingPartner {
  id, company, nip, onboarding\_step, status,
  manager\_name, task\_count, done\_count, created\_at
}

interface OnboardingTaskTemplate {
  id: string, title: string, type: string,
  step: 0|1|2|3, standard: boolean,
  assignee: string|null, days: number|null
}
```

## AppSettings — odczyt w komponentach

```typescript
private settings = inject(AppSettingsService);

// W template lub metodzie:
const sources = JSON.parse(this.settings.settings()\['crm\_lead\_sources'] || '\[]');
const templates = JSON.parse(this.settings.settings()\['onboarding\_task\_templates'] || '\[]');

// Lub przez meta():
const field = this.settings.meta().find(m => m.key === 'crm\_lead\_sources');
```

## Reguły biznesowe (UI)

1. **Źródła leadów** — wyświetlać w `<optgroup>` z podziałem na grupy. W filtrach: opcja wyboru całej grupy (`\_\_group\_\_Marketing`). W formularzach edycji: tylko wartości słownikowe (bez opcji grupy).
2. **Wymagalność pól leada wg etapu:**

   * `new`, `closed\_lost` → wymagane tylko: Firma + NIP
   * pozostałe → wymagane: Strona WWW, Imię/Nazwisko, Stanowisko, Email, Telefon, Obrót roczny, % Online, Pierwszy kontakt, Data zamknięcia, Źródło, Branża, Handlowiec, % Szansa
3. **Onboarding** — partnerzy w statusie 'onboarding' NIE pojawiają się w `/crm/partners`. Tylko w `/crm/onboarding`.
4. **NIP** — format: 2 litery (kod kraju) + cyfry. Dla PL: dokładnie 10 cyfr. Inicjalna wartość w polu: `PL`. Walidacja wywoływana przy submit (nie tylko onChange).
5. **Kalendarze w onboarding** — `calYear`, `calMonth` muszą być `signal()` żeby `calCells = computed()` reagował na zmiany miesiąca.

## Nawigacja (shell.component.ts)

```
Dokumenty | Workflow | Groups \& Roles
─────────────────────
CRM (sekcja — tylko dla crm\_role != null)
  Leady | Kalendarz działań | Raporty sprzedaży
─────────────────────
Partnerzy (sekcja)
  Onboarding | Rejestr Partnerów | Grupy partnerów | Performance
─────────────────────
Ustawienia
  Import CSV
─────────────────────
Admin (is\_admin || sales\_manager)
  Users | Audit Logs | App Settings | Zarządzanie danymi
```

## API Base URL

```typescript
const BASE = `${environment.apiUrl}/crm`;
// environment.apiUrl = 'http://localhost:3000/api' (dev) | '/api' (prod)
```

