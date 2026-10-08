# CRMtree Frontend

## Projekt
Angular 21 SPA — generyczny CRM dla przedsiębiorstw różnych branż, skupiony na
dynamicznej pracy handlowców oraz zarządzaniu lejkiem sprzedażowym, upsellem i cross-sellem.
Katalog: `C:\Users\apt\Documents\crmtree-frontend`

Powiązane repozytoria (obok tego katalogu): `crmtree-backend` (API; reguły biznesowe modułów są
w jego `CLAUDE.md`), `crmtree-mobile` (aplikacja Flutter), `crmtree-landing` (strona crmtree.pl).

## Stack
- Angular 21 (standalone components, signals, ChangeDetectionStrategy.OnPush)
- Custom SCSS (CSS variables w `src/styles/global.scss`)
- Brak Tailwind, brak Angular Material — tylko własne komponenty

## Paleta kolorów (CRMtree)
- Primary Green: `#3BAA5D` (--orange w CSS vars)
- Primary Dark hover: `#2F8F4D` (--orange-dark)
- Light Green: `#E6F4EA` (--orange-pale)
- Sidebar bg: `#1F2933`
- Accent Blue: `#3B82F6`

## Kluczowe pliki
- `src/styles/global.scss` — design tokens i globalne style
- `src/app/layout/shell/shell.component.ts` — sidebar, logo, nawigacja
- `src/proxy.conf.json` — proxy `/api` → `http://127.0.0.1:3001`

## Git workflow
- Remote `origin` = GitHub (`git@github-crmtree:adapakse/CRMtree-frontend.git`) — to jedyny
  i właściwy remote; osobnego remote `crmtree` nie ma.
- Branch roboczy: `develop` (push na `develop` wdraża środowisko INT). Większą zmianę rób na
  gałęzi `feature/<opisowa-nazwa>` i scalaj do `develop` po sprawdzeniu.
- Nazwy gałęzi: opisowe, bez numerów zgłoszeń; nie używaj nazw automatycznych
  (np. `claude/...`). Adam pozwala dobrać nazwę samodzielnie.
- **W tym repozytorium pracuje równolegle kilka sesji.** Przed pushem zawsze `git fetch` i
  scal `origin/develop`; po scaleniu uruchom `npm run i18n:check` i build. Commituj tylko
  swoje pliki.
- Merge do `master` robi Adam ręcznie po testach (master = deploy produkcyjny na Azure).
- Commit i push dopiero na prośbę Adama.

## Uruchomienie lokalne
```bash
npm start   # http://localhost:4201
```
Backend musi działać na porcie 3001. Serwery deweloperskie (frontend i backend) Adam uruchamia
sam w osobnym terminalu — nie startuj ich w tle z sesji. Do weryfikacji używaj
`npm run build` (wcześniej sam uruchamia `npm run i18n:check`).

## Deploy (CI/CD)
- GitHub Actions: `.github/workflows/deploy.yml` (push do `master` → produkcja) oraz
  `deploy-int.yml` (push do `develop` → środowisko INT, `crmtree-frontend-int`)
- Pipeline: Docker build → push do ACR → Azure Container App update
- Azure Container App: `crmtree-frontend.salmonsmoke-415d1384.polandcentral.azurecontainerapps.io`

## Projekty NIE mylić
- `worktrips-doc-frontend` — osobna aplikacja, inne kolory (pomarańczowe), inne logo
- Zawsze sprawdź w jakim katalogu pracujesz przed edycją

---

## Zasady ogólne interfejsu (decyzje Adama — obowiązują w każdym module)

- **Każdy ekran z listą wielu elementów ma filtry i stronicowanie** (2026-10-06): pasek
  filtrów, filtr w nagłówku każdej kolumny tabeli, sortowanie oraz strony po maks. 50 elementów
  („poprzednia / następna” z licznikiem „1–50 z 230”). Filtrowanie, sortowanie i strony są po
  stronie serwera. Używaj gotowych elementów z `src/app/shared/list/` (`ListQueryState`,
  `createListLoader`, `wt-list-filter-bar`, `th[wtListColumn]`, `wt-list-pager`); stan
  filtrów trzymaj w adresie strony. Dla list zadań projektowych zestaw filtrów to: nazwa,
  status, przedziały dat rozpoczęcia i zakończenia, przedział kosztu, a w widokach PM-a,
  multi-PM-a i kontrolera — osoba. Buduj tak każdą nową listę bez czekania na prośbę. Starsze
  listy (leady, partnerzy, dokumenty) nie były jeszcze przeglądane pod tym kątem.
- **Każdy tekst widoczny dla użytkownika idzie przez tłumaczenia w 10 językach** — patrz
  „Wielojęzyczność (i18n)”.
- **Komunikaty z API są po angielsku** (decyzja z 2026-10-05, backend ich nie tłumaczy). Tam,
  gdzie znasz przyczynę błędu (status HTTP, kontekst akcji), pokaż własny, przetłumaczony tekst;
  surowy komunikat z API zostaw tylko jako ostateczność.
- **Aplikacja mobilna** (`crmtree-mobile`) powtarza funkcje webu własnym kodem. Gdy zmieniasz
  kształt odpowiedzi API, sprawdź, czy korzysta z niej telefon. Opis kontroli terminów i
  finansów projektu dla sesji mobilnej: `docs/mobile-handoff-project-deadlines-finance.md`.

---

## WhatsApp Integration

Zobacz też `CRMtree-backend/CLAUDE.md` — architektura, model per-user, webhook, wymagane
pola konfiguracji po stronie Meta.

### Model: per-tenant, NIE per-user — decyzja biznesowa 2026-08-03, nie cofaj bez pytania

Jeden wspólny firmowy numer WhatsApp Business per tenant, konfigurowany przez super
admina w Panel admina → Tenants → zakładka „WhatsApp" (`tenants.component.ts`). Wcześniej
(do 2026-08-03) każdy CRM user łączył własny numer w Moje ustawienia — wycofane, bo
WhatsApp Business blokuje jednoczesne prywatne/firmowe użycie tego samego numeru telefonu
(user tracił dostęp do własnej prywatnej historii). Zobacz też `CRMtree-backend/CLAUDE.md`
— pełna architektura, webhook, wymagane pola konfiguracji po stronie Meta. Jeśli ktoś
prosi o przywrócenie self-service podłączania numeru w Moje ustawienia, to prawdopodobnie
próba cofnięcia tej decyzji — dopytaj, zanim to zrobisz.

### Gdzie w UI

- **Superadmin konfiguruje numer tenanta i włącza/wyłącza moduł**: Panel admina → Tenants →
  zakładka „WhatsApp" — `src/app/pages/admin/tenants/tenants.component.ts`. Pola: WABA ID,
  Phone Number ID, numer widoczny dla klientów (opcjonalny), Access Token, App Secret. Po
  zapisaniu CRM generuje i pokazuje Webhook Verify Token (przycisk „Pokaż"/„Kopiuj") do
  wklejenia w konfiguracji webhooka w Meta App.
- **Tenant admin** widzi tylko włącznik feature flagi w Ustawienia → Parametry biznesowe
  CRM — `src/app/pages/admin/settings/settings.component.ts` — nie konfiguruje numeru.
- **Wysyłka/odbiór**: zakładka „WhatsApp" na karcie leada/partnera —
  `crm-lead-detail.component.ts` / `crm-partner-detail.component.ts` (ta sama logika w obu
  plikach, osobne komponenty — sprawdzaj oba przy zmianach). Widoczność jest tenant-wide —
  każdy CRM user w tenancie widzi te same konwersacje, bo numer jest wspólny.

### Jeden numer rozmówcy = jedna karta konwersacji

`groupWhatsappConversations()` w obu komponentach leada/partnera grupuje wiadomości po
**znormalizowanych cyfrach** numeru (`normalizePhoneDigits()`,
`shared/utils/phone-format.util.ts`), NIE po surowym stringu z bazy. Powód: wychodzące
zapisują numer tak jak user go wpisał (może mieć spacje), a webhook Meta zapisuje czyste
cyfry — bez normalizacji ten sam numer tworzy dwie osobne karty. **Każde nowe miejsce, które
czyta/porównuje `from_phone`/`to_phone`, musi przepuszczać przez `normalizePhoneDigits()`
zamiast porównywać stringi bezpośrednio.**

- Nowa rozmowa powstaje wyłącznie przez formularz „Nowa wiadomość WhatsApp" (edytowalne pole
  numeru). Celowo nie ma przycisku „dodaj rozmówcę do istniejącego wątku".
- Stan UI per konwersacja (rozwinięcie, okno odpowiedzi) jest też kluczowany po
  znormalizowanych cyfrach (`getWhatsappConvState()`), żeby nie gubić się przy zmianie
  formatu reprezentanta między odświeżeniami.
- Przycisk „🔄 Sprawdź nowe" na górze zakładki (ten sam wzorzec co w zakładce Email) to
  ręczny fallback odświeżania — webhook jest głównym mechanizmem odbioru, ale nie ma
  gwarancji natychmiastowego dostarczenia.

---

## Moduł Projekty

Projekty z zespołem, zadaniami, osią czasu i czatem. Osobny moduł poza CRM, za flagą
`projects` (`auth.hasFeature('projects')`). Reguły biznesowe i uprawnienia są opisane w
`CRMtree-backend/CLAUDE.md` — to decyzje Adama z 2026-10-03/04, nie zmieniaj ich bez pytania.

### Gdzie w UI

- **Projekty** (`/projects`) — `pages/projects/projects-list.component.ts`: lista z filtrem
  otwarte / zamknięte / wszystkie oraz przełącznik „Moje zadania”
  (`project-my-tasks.component.ts`) dla osób bez kalendarza CRM.
- **Projekt** (`/projects/:id`) — `project-detail.component.ts` z zakładkami: Zadania
  (`project-task-list`), Oś czasu (`project-gantt`, własny komponent, tylko podgląd), Czat
  (`project-chat`), Karta projektu (`project-card` + `project-crm-link`).
- **Panel zadania** — `project-task-panel.component.ts`; otwarte zadanie jest w URL
  (`?task=<id>`), bo na ten adres prowadzą linki z maili.
- **Ustawienia → Projekty** — `pages/admin/project-settings/`: słowniki, macierz przejść
  statusów, definicje pól.
- **Panel użytkowników** — telefon, firma, dział, typ konta (zewnętrzne) i „zakładanie
  projektów” w `pages/users/users.component.ts`.
- **Moduł włącza superadmin**: Panel admina → Tenants → Moduły.

### Zadania projektowe w CRM

- Zadania projektowe dochodzą do list CRM jako kolejne źródło **na poziomie serwisu**:
  `CrmApiService.getActivityTasks`, `getCalendarMeetings` i `getCrmTasks` doklejają je przez
  `core/services/project-task-feed.ts` (`source_type: 'project'`, `all_day: true`,
  `project_task_id`). Błąd lub wyłączony moduł daje pustą listę, CRM działa dalej.
- **W listach CRM są tylko do podglądu.** Każde miejsce, które zamyka/edytuje zadanie przez
  `updateLeadActivity` / `updatePartnerActivity`, musi pomijać `source_type === 'project'`
  (kalendarz, dashboard, oś spotkań na liście leadów) — inaczej wyśle żądanie do złego API.
- Zadanie nie ma godziny: w kalendarzu stoi o **09:00** w dniu zakończenia
  (`ALL_DAY_ANCHOR_TIME`), a widoki pokazują „termin” zamiast godziny.
- Kliknięcie przenosi do Projektów przez `ProjectTaskNavigationService.open()`, które
  zapamiętuje miejsce wyjścia w `NavBackService`; `project-detail` pokazuje wtedy przycisk
  powrotu („← Lead X”, „← Kalendarz”).
- Karta leada i partnera: `shared/components/linked-project-tasks` — widoczne dla każdego,
  kto widzi kartę; bez członkostwa w projekcie kliknięcie jest nieaktywne (`can_open`).
  Wstawione w `crm-lead-detail` i `crm-partner-detail` (zmieniaj oba).

### Wspólne komponenty powstałe przy module

- `shared/components/add-to-calendar` + `shared/utils/calendar-export.util.ts` — „Przekaż do
  kalendarza” (Google, Outlook, plik .ics) dla zadań leada, partnera, dokumentów, onboardingu
  i projektów. Wpis bez uczestników; zadania z samą datą trafiają na 09:00. Menu ma
  `position: fixed`, bo w tabelach i stopce panelu było obcinane.
- `shared/components/typeahead` — jedno pole z podpowiedziami od 3 znaków (wybór leada lub
  partnera, wybór osób do projektu).

### Finanse projektu, faktury KSeF, typ dokumentu „Faktura” (2026-10-05)

Reguły biznesowe (kto co widzi, kwoty netto, kursy NBP, zasady podpinania faktur) są w
`CRMtree-backend/CLAUDE.md` — to decyzje Adama, nie zmieniaj ich bez pytania.

- **Zakładka Finanse** (`?tab=finance`) — `pages/projects/project-finance*.ts`: kafelki, plan,
  budżet per kategoria, koszty, przychody, koszty zadań. Widoczna, gdy `detail.finance?.can_read`
  (`finance` leży obok `project` w odpowiedzi, nie w nim). Koszty zadania:
  `project-task-costs.component.ts` w panelu zadania; wspólny formularz `project-cost-form`.
- **Sumy finansowe** (`shared/components/project-finance-totals`) są na kartach listy projektów
  oraz na karcie leada i partnera — tam celowo także dla osób spoza projektu.
- **KSeF** — `pages/projects/project-ksef-*.ts`: okno wyboru faktury za okres, potwierdzenie
  podpięcia, podgląd faktury. **Czerwony tekst o innych powiązaniach faktury**
  (`project-ksef-other-links`) ma być widoczny zawsze pod pozycją kosztową, nie tylko przy
  podpinaniu — to wymóg Adama. Prawo do podpinania:
  `finance.can_write && auth.canViewKsefInvoices()`.
- **Ustawienia → Projekty**: przełącznik finansów, kategorie kosztów, blok KSeF (firmy „NIP +
  token”, grupa dostępu dla dokumentów faktur) — `pages/admin/project-settings/`.
- **Dokumenty, typ `invoice`**: pola faktury w `pages/documents/invoice-fields`, powiązania z
  projektami w `pages/documents/project-links`. Dla faktury `signing_date` to data wystawienia,
  a `expiration_date` to termin płatności — etykiety przełączają się po `doc_type === 'invoice'`.
  Podpis elektroniczny jest dla faktur ukryty (nadpisałby datę wystawienia).

### Kontrola terminów i listy (2026-10-06)

Reguły (co jest „po terminie”, „zagrożone”, kiedy projekt jest opóźniony, kto dostaje maile) są
w `CRMtree-backend/CLAUDE.md` → „Kontrola terminów”. To decyzje Adama.

- **Zasada ogólna Adama: każdy ekran z listą ma filtry (także w nagłówku każdej kolumny) i
  stronicowanie po maks. 50 elementów.** Służą do tego wspólne elementy w `shared/list/`
  (`ListQueryState`, `createListLoader`, `wt-list-filter-bar`, `th[wtListColumn]`,
  `wt-list-pager`) — używaj ich w każdej nowej liście zamiast pisać własne. Filtrowanie,
  sortowanie i strony są po stronie serwera; stan filtrów siedzi w adresie strony.
- Znaczniki terminowości: `shared/components/project-deadlines/` (po terminie, zagrożone,
  zakończone po terminie, opóźnione podzadania, pierwotny termin z przesunięciem, znacznik
  opóźnionego projektu). „Po terminie” dotyczy zadania, „opóźniony” projektu — nie mieszaj.
- Zakładka Zadania projektu: bez filtrów drzewo (`project-task-list`), z filtrem / sortowaniem
  / przełącznikiem „Lista płaska” stronicowana tabela (`project-task-table`, trasa
  `/tasks/search`). Gantt (`project-gantt-view`) bierze płaskie wiersze z `/tasks/gantt`
  (limit 500) i sam buduje drzewo po `parent_task_id`.
- Widok wielu projektów: `/projects/portfolio` (`project-portfolio*.ts`), tylko gdy
  `config.has_cross_project_view`; wejście przełącznikiem na ekranie Projekty.
- `GET /api/projects` zwraca `{ items, total, page, page_size, can_create, can_filter_finance }`.

### Pułapki

- `pages/projects/projects-shared.styles.ts` trzyma wspólne style topbara, modala i tabel
  modułu — aplikacja nie ma ich globalnie.
- Czat w panelu zadania leży w przewijanej kolumnie flex: elementy panelu muszą mieć
  `flex-shrink: 0`, inaczej wątek kurczy się do zera, a pole wiadomości nachodzi na sekcję
  poniżej.

---

## Wielojęzyczność (i18n)

Aplikacja jest tłumaczona na 10 języków (`pl, en, de, it, es, fr, ro, ru, sl, hr`), polski jest
źródłowy. Pełne zasady, słowniczek i instrukcja dodawania tekstów: **`docs/i18n.md`** — przeczytaj
przed dodaniem jakiegokolwiek tekstu widocznego dla użytkownika.

- Mechanizm: Transloco, pliki `src/i18n/<zakres>/<język>.json`, kod w `src/app/core/i18n/`.
- **Każdy nowy lub zmieniony tekst trafia od razu do wszystkich 10 plików** (zasada Adama).
- `npm run i18n:check` pilnuje kompletu kluczy, parametrów i formatu; uruchamia się też przed
  `npm run build`. Pliki z listy `src/i18n/translated-files.json` nie mogą już zawierać polskiego
  tekstu wpisanego na sztywno.
- **Stan na 2026-10-08:** cała część aplikacji dla tenantów jest przetłumaczona. Zakresy:
  `common` (wspólne, w tym kontrolki list), `shell` (menu), `auth`, `crm` (leady, partnerzy,
  kalendarz, raporty, softphone, analiza rozmów, SEObot), `projects` (projekty, finanse, KSeF,
  terminy), `documents`, `admin` (ustawienia, użytkownicy, grupy, logi, dane, ankieta),
  `account` (moje ustawienia). Nowy ekran dopisz do `SCOPES_BY_PATH_PREFIX` w
  `src/app/core/i18n/i18n-scope.guard.ts`.
- **Po polsku zostają celowo:** panel superadmina (Tenants, rozliczenia), moduł Prospekty
  (przerabiany osobno) i publiczne strony (blog, strona główna, regulamin, polityka prywatności).
  Danych wpisanych przez tenanta nie tłumaczymy.
- Maile i wizualizację faktury KSeF tłumaczy backend (język odbiorcy / tenanta).

---

## Code quality standards

### Language
- **All code must be written in English**: variable names, method names, class names,
  interface names, type aliases, enum values, and inline comments.
- No hardcoded user-facing text: every label, message and tooltip goes through Transloco keys
  in all 10 languages (see "Wielojęzyczność (i18n)"). Polish literals remain only in the parts
  deliberately left untranslated (super-admin panel, Prospects, public pages).

### Naming conventions
- Use descriptive, self-explanatory names — a reader should understand intent without
  needing a comment.
- Prefer `getUserLeadsByStage()` over `getData()` or `fn1()`.
- Boolean variables and properties: use `is`, `has`, `can`, `should` prefix
  (`isLoading`, `hasPermission`, `canEdit`).
- Avoid abbreviations unless universally understood (`url`, `id`, `api`, `dto`).

### KISS — Keep It Simple, Stupid
- Solve the problem at hand, not hypothetical future problems.
- Three similar lines of code are better than a premature abstraction.
- If a function does more than one thing, split it.
- Avoid over-engineering: no unnecessary abstractions, factories, or design patterns
  unless the complexity clearly justifies them.

### Clean Code (Angular-specific)
- One component = one responsibility. If a component grows beyond ~300 lines,
  consider splitting it.
- Components use `ChangeDetectionStrategy.OnPush` by default.
- Use Angular signals (`signal()`, `computed()`) for reactive state — avoid manual
  `BehaviorSubject` where signals suffice.
- Standalone components only — no NgModules.
- Extract reusable logic into services, not base classes.
- Template expressions must be free of side effects.
- Do not add comments that explain *what* the code does — well-named identifiers
  already do that. Only add a comment when explaining *why* something non-obvious
  is done (a workaround, a constraint, a subtle invariant).
- No dead code, no commented-out blocks left in the codebase.

### Security
- Never interpolate user input directly into HTML (XSS risk).
- Never log sensitive data (passwords, tokens, personal data) to the console.
- Validate all data at system boundaries (API responses, user inputs).
