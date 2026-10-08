# Aplikacja mobilna: kontrola terminów i koszty projektów — opis dla agenta mobilnego

Stan na 2026-10-08. Autor: sesja web/backend. Odbiorca: sesja pracująca w `crmtree-mobile`.

Ten dokument opisuje, co w dniach 2026-10-05…08 doszło w module **Projekty** po stronie web i
backendu (finanse projektu, faktury KSeF, kontrola terminów) i co z tego ma trafić do aplikacji
mobilnej. Backend jest gotowy i wdrożony na `develop` — po stronie mobilnej jest tylko klient.

**Źródła prawdy** (czytaj je, gdy coś tu jest niejasne — ten dokument je streszcza):

- `crmtree-backend/CLAUDE.md` → „Moduł Projekty” z podsekcjami: finanse projektu, KSeF,
  „Kontrola terminów”, „Listy modułu Projekty”; osobno „Moduł Dokumenty — typ Faktura” i „Kursy
  walut (NBP)”.
- Trasy: `src/routes/projects.js`, `project-tasks.js`, `project-portfolio.js`,
  `project-finance.js`, `ksef.js`, `profile.js`; parametry list: `src/middleware/project-list-query.js`.
- Testy jako przykłady żądań i odpowiedzi: `src/__tests__/project-lists.test.js`,
  `project-deadlines.test.js`, `project-finance.test.js`, `ksef-invoices.test.js`.
- Web jako wzór zachowania: `crmtree-frontend/src/app/pages/projects/` oraz
  `crmtree-frontend/CLAUDE.md` → „Moduł Projekty”.

Reguły biznesowe poniżej to **decyzje Adama** — nie zmieniaj ich bez pytania.

---

## 1. Najpierw: zgodność obecnej aplikacji

- `GET /api/projects` jest teraz **stronicowane** (maks. 50) i zwraca
  `{ items, total, page, page_size, can_create, can_filter_finance }`. Aplikacja czyta dziś
  `response['projects']` (`projects_repository.dart`). Backend zwraca tymczasowo to samo pod
  starą nazwą `projects` (alias), więc wydana aplikacja działa, ale widzi tylko pierwszą stronę
  (50 otwartych projektów). **Przejdź na `items` + stronicowanie**; alias zniknie po migracji.
- Pozostałe trasy używane dziś przez aplikację nie zmieniły kształtu — tylko **dostały nowe
  pola** (lista poniżej). `GET /api/projects/:id/tasks` (całe drzewo) i
  `GET /api/projects/assigned-tasks` (zasilanie kalendarza i „na dziś”) zostają bez stron.
- Specyfikacja `src/openapi/mobile-v1.yaml` nie dokumentuje żadnej trasy Projektów. Jeśli sesja
  mobilna dopisuje je do specyfikacji, niech dopisze od razu nowy kształt.

---

## 2. Kontrola terminów

### 2.1 Reguły

- **Terminowość zadania** jest wyliczana przez backend, nigdy przez klienta („dziś” = data w
  `Europe/Warsaw`):
  - `overdue` — data zakończenia przed dziś i status z kategorii innej niż `done`;
  - `at_risk` — data zakończenia w ciągu N dni (dziś włącznie) i kategoria `todo`; N ustawia
    admin tenanta (`at_risk_threshold_days` w `GET /api/projects/config`, domyślnie 3);
  - `on_time` — pozostałe niezakończone zadania z datą;
  - `null` — brak daty albo zadanie zakończone.
- `is_completed_late` — zadanie zakończone po swoim terminie.
- `has_overdue_subtasks` — któreś podzadanie jest po terminie. To **osobny, słabszy znacznik**;
  samo zadanie nadrzędne nie jest przez to „po terminie”.
- **Pierwotny termin**: `original_end_date` to pierwsza ustawiona data zakończenia; późniejsze
  zmiany jej nie nadpisują. `slip_days` = obecny termin − pierwotny (null, gdy równe; ujemne,
  gdy termin przyspieszono). Web pokazuje pierwotny termin na szaro z przesunięciem („+5 d”).
- **Powód zmiany terminu**: przy zmianie daty zakończenia zadania, które już ją miało, można
  podać opcjonalny `end_date_change_reason` (≤500 znaków) w `PATCH …/tasks/:taskId`. Powód
  trafia do historii zadania i do maila do PM-a.
- **Daty projektu**: opcjonalne `start_date`, `end_date`. Zadanie może mieć datę po dacie końca
  projektu — nigdy nie blokujemy.
- **Projekt opóźniony** (`is_delayed`, `delay_reasons`, `delay_details`):
  - `task_after_end` — niezakończone zadanie kończy się po dacie końca projektu;
  - `end_passed` — data końca projektu minęła, a są niezakończone zadania.
  Bez daty końca albo po zamknięciu projekt nigdy nie jest opóźniony.
- **Dwa różne słowa**: zadanie jest „po terminie”, projekt jest „opóźniony”. Nie mieszaj ich w
  tekstach — tak jest w webie we wszystkich 10 językach.
- **Kto zmienia daty** — bez zmian: uczestnik z pełnym dostępem zmienia daty swoich zadań, bez
  akceptacji PM-a.

### 2.2 Widok wielu projektów („multi-PM”)

Dla osoby, która jest PM-em lub kontrolerem w projektach (np. szef firmy, szef produkcji):
admin tenanta widzi wszystkie otwarte projekty, pozostali — otwarte projekty, w których są
PM-em lub kontrolerem. Flaga dostępu: `has_cross_project_view` w `GET /api/projects/config`.
Bez zakresu trasy `/api/projects/portfolio/*` odpowiadają 403.

### 2.3 Maile i powiadomienia

Backend wysyła trzy maile (w języku odbiorcy): poranne zestawienie zadań po terminie o 09:00
(przypisani, w tym konta zewnętrzne, oraz PM-owie), zmianę terminu zadania (do PM-a) i „projekt
opóźniony” (do PM-ów, raz). Jeden przełącznik na użytkownika wyłącza wszystkie:
`project_deadline_notifications_enabled` w `GET /api/auth/me`, zmiana przez
`PUT /api/profile/project-deadline-notifications` `{ is_enabled: boolean }`.

**Powiadomień push dla tych zdarzeń backend nie wysyła** — to do decyzji Adama (pytanie 3 na
końcu).

### 2.4 API

Wspólna konwencja list: `page` (≥1), `page_size` (1–50, domyślnie 50), `sort`, `order`
(`asc`|`desc`); odpowiedź `{ items, total, page, page_size }`. Pusta wartość parametru = filtr
nieużyty; błędna = 400 `{ error: "Validation failed", details: [{ field, message }] }`.
Komunikaty API są po angielsku (decyzja Adama) — nie pokazuj ich użytkownikowi wprost, mapuj
na własne teksty.

**Filtry zadań** (te same nazwy na wszystkich trasach z zadaniami):

| Parametr | Wartość |
|---|---|
| `name` | fragment nazwy |
| `number` | fragment numeru, np. `WSC-12` albo `12` |
| `project_ids` | lista uuid po przecinku (tylko widok wielu projektów) |
| `status_ids`, `priority_ids`, `type_ids` | listy uuid |
| `status_category` | lista z `todo,in_progress,done` |
| `assignee` | uuid albo `unassigned` (ignorowany w „moich zadaniach”) |
| `start_from`, `start_to`, `end_from`, `end_to` | daty `YYYY-MM-DD`, włącznie |
| `original_end_from`, `original_end_to` | daty |
| `slip_min`, `slip_max` | liczby całkowite (mogą być ujemne) |
| `cost_min`, `cost_max` | kwoty ≥ 0 (patrz 3.1) |
| `timeliness` | lista z `overdue,at_risk,on_time` |

Klucze sortowania: `number, name, project, status, priority, type, assignee, start_date,
end_date, original_end_date, slip_days, days_overdue, timeliness, cost, parent`.

**Płaski wiersz zadania** (trasy stronicowane i Gantt):

```
id, project_id, project_key, project_name, task_number, name, start_date, end_date,
parent_task_id, parent_task_number, parent_task_name,
status_id, status_name, status_category, status_color,
priority_id, priority_name, priority_color, type_id, type_name, type_color,
original_end_date, completed_at, slip_days, timeliness, days_overdue,
is_completed_late, has_overdue_subtasks, cost_total, cost_currency,
assignees: [{ user_id, display_name }]
```

| Trasa | Kto | Co zwraca |
|---|---|---|
| `GET /api/projects/:id/tasks/search` | członek projektu (zewnętrzny: tylko swoje) | stronicowane płaskie wiersze; `mine` (bool) + filtry |
| `GET /api/projects/:id/tasks/gantt` | jw. | `{ items, truncated, limit: 500 }`, bez stron |
| `GET /api/projects/my-tasks` | każdy, także konto zewnętrzne | stronicowane zadania przypisane do mnie w otwartych projektach; `include_done` |
| `GET /api/projects/portfolio/tasks` | zakres wielu projektów | stronicowane płaskie wiersze |
| `GET /api/projects/portfolio/gantt` | jw. | `{ items, truncated, limit: 500 }` |
| `GET /api/projects/portfolio/projects` | jw. | stronicowany przegląd projektów (wiersz jak w `GET /api/projects`) |
| `GET /api/projects/portfolio/people` | jw. | `{ people: [{ user_id, display_name }], truncated, limit }` — do filtra po osobie |
| `GET /api/projects/portfolio/project-options` | jw. | `{ projects: [{ id, key, name, start_date, end_date }], truncated, limit }` |
| `GET /api/projects/:id/tasks/assignee-summary` | PM, admin, kontroler | `{ people: [{ user_id, display_name, open_task_count, overdue_task_count, at_risk_task_count }], unassigned: {…} }` |

Trasy, których aplikacja używa dziś (`/projects/:id/tasks`, `/projects/:id/tasks/:taskId`,
`/projects/assigned-tasks`, zadania w projektach powiązanych z leadem/partnerem), **dostały
pola**: `original_end_date, completed_at, slip_days, timeliness, days_overdue,
is_completed_late, has_overdue_subtasks` (bez pól kosztu). Wpisy historii zadania dostały
`end_date_change_reason`.

**Projekty** — `GET /api/projects` i `GET /api/projects/portfolio/projects`. Filtry: `status`
(`open`|`closed`|`all`, domyślnie `open`; w przeglądzie zawsze otwarte), `name` (nazwa lub
klucz), `start_from/to`, `end_from/to`, `delayed` (bool), `delay_reason`, `lead_id`,
`partner_id`, `my_role` (`pm,controller,participant`), `pm` (uuid), `overdue_min/max`,
`at_risk_min/max`, `progress_min/max` (0–100), `cost_min/max`, `revenue_min/max`. Sortowanie:
`name, key, status, start_date, end_date, delay, pm, progress, overdue, at_risk, cost, revenue`.

Wiersz projektu:

```
id, key, name, description, status, partner_id, lead_id, created_at, closed_at,
start_date, end_date, partner_name, lead_name, my_role, my_access_level,
member_count, task_count, done_task_count, overdue_task_count, at_risk_task_count,
my_open_task_count, progress_percent,
project_managers: [{ user_id, display_name }],
is_delayed, delay_reasons, delay_details: { open_task_count, tasks_after_end_count,
  latest_task_end_date, days_after_end, days_past_end },
finance (obiekt sum z 3.2 albo null)
```

`progress_percent` licz z serwera, nie sam. `POST /api/projects` i `PATCH /api/projects/:id`
przyjmują `start_date`, `end_date`. `GET /api/projects/:id` ma w `project` te same pola dat i
opóźnienia.

---

## 3. Koszty i przychody projektu

### 3.1 Reguły

- To kontroling projektu, nie księgowość: **kwoty netto, jedna waluta na projekt**.
- Finanse włącza admin tenanta (`finance_enabled` w `GET /api/projects/config`; tam też
  `cost_categories`). Gdy wyłączone, trasy finansowe odpowiadają 403, a pola `finance` są `null`.
- **Kto co widzi** (role w projekcie):
  - PM i admin tenanta — czytają i zmieniają wszystko;
  - kontroler — czyta wszystko, nic nie zmienia;
  - uczestnik wewnętrzny — nie widzi finansów; wyjątek: gdy PM włączył w projekcie opcję
    „uczestnicy mogą dodawać koszty do swoich zadań”, może dodać koszt do zadania, do którego
    jest przypisany, i widzi/edytuje tylko pozycje dodane przez siebie (bez budżetu i przychodu);
  - **konto zewnętrzne — nigdy nic finansowego**;
  - zamknięty projekt — tylko odczyt.
- Uprawnienia przychodzą z backendu: `GET /api/projects/:id` zwraca **obok** `project` klucz
  `finance`: `null` albo `{ currency, can_read, can_write, can_add_own_costs }`. Nie zgaduj ich
  po roli.
- **Handlowiec widzi sumy** powiązanego projektu na karcie leada i partnera, nawet bez
  członkostwa w projekcie — to świadoma decyzja Adama. Tylko sumy, bez pozycji.
- Koszt zadania w listach (`cost_total`, `cost_currency`) to suma pozycji przypisanych
  bezpośrednio do zadania (planowane + poniesione, bez podzadań); widoczny tylko dla osób z
  prawem odczytu finansów tego projektu — dla innych `null`. W widoku wielu projektów kwoty są
  w walutach projektów, bez przeliczania.

### 3.2 API

Obiekt sum (`finance` w liście projektów i na kartach leada/partnera):

```
{ currency,
  revenue: { planned: number|null, actual: number },
  cost:    { planned: number, actual: number },
  margin:  { planned: { amount, percent }, actual: { amount, percent } } }
```

`margin.*.percent` jest w punktach procentowych (12.5 = 12,5%).

| Trasa | Kto | Opis |
|---|---|---|
| `GET /api/projects/:id/finance` | PM, admin, kontroler | podsumowanie: waluta, przychód plan/wykonanie, koszt plan/wykonanie, marża, `remaining_budget`, tabela `categories` (budżet, poniesione, planowane, odchylenie, `is_over_budget`), `tasks` (koszty zadań z sumowaniem po podzadaniach) |
| `PATCH /api/projects/:id/finance` | PM, admin | waluta, planowany przychód, budżety kategorii, opcja kosztów uczestników |
| `GET …/finance/costs?task_id=` | PM, admin, kontroler; uczestnik z opcją — tylko swoje | pozycje kosztowe |
| `POST …/finance/costs` | PM, admin; uczestnik z opcją — do swojego zadania | wymagane `date`, `category_id` i `amount` **albo** `original_amount` + `original_currency` (backend przelicza kursem NBP z dnia roboczego przed datą); opcjonalnie `task_id`, `status` (`planned`\|`incurred`), `description`, `supplier_name`, `document_number` |
| `PATCH` / `DELETE …/finance/costs/:itemId` | jw. | edycja / usunięcie |
| `GET` / `POST` / `PATCH` / `DELETE …/finance/revenues` | PM, admin (odczyt też kontroler) | pozycje przychodu: `date`, `amount`, `description`, `status` (`planned`\|`invoiced`\|`paid`) |

Pozycja kosztowa w odpowiedzi ma też `ksef_invoice_id`, `ksef_invoice`, `document_id`,
`document` i `other_links` (inne powiązania tej samej faktury — web pokazuje pod pozycją stały
czerwony tekst „ta faktura jest podpięta również pod …”). Błąd 422 przy koszcie w walucie obcej
= brak kursu NBP → poproś o kwotę w walucie projektu.

### 3.3 Faktury KSeF i dokument „Faktura” — tylko informacyjnie

W webie admin tenanta konfiguruje KSeF, uprawnione osoby wybierają faktury z listy za okres i
podpinają je do kosztów, a faktura jest rejestrowana w module Dokumenty z wizualizacją PDF.
Aplikacja mobilna nie ma modułu Dokumenty, więc rekomendacja to **nie budować podpinania
faktur w telefonie**; wystarczy przy pozycji kosztowej pokazać numer faktury i — gdy
`other_links` nie jest puste — ostrzeżenie o innych powiązaniach. Trasy, gdyby Adam zdecydował
inaczej: `GET /api/ksef/invoices`, `GET /api/ksef/invoices/:id`, `POST …/finance/costs` z
`ksef_invoice_id` (wymaga `can_view_ksef_invoices` z `/api/auth/me` albo admina).

---

## 4. Proponowany zakres dla aplikacji mobilnej

Kolejność od najtańszego i najbardziej potrzebnego. Punkty 1–3 to kontrola terminów, 4–5
koszty.

1. **Zgodność i znaczniki.** Lista projektów na `items` ze stronicowaniem (doładowanie przy
   przewijaniu, po 50). Wszędzie, gdzie widać zadanie (lista zadań projektu, zadanie, „na
   dziś”, kalendarz, karta leada/partnera): znacznik „po terminie” z liczbą dni, „zagrożone”,
   „zakończone po terminie”, słabszy „opóźnione podzadania”; pierwotny termin na szaro z
   przesunięciem. Na projekcie: daty, znacznik „opóźniony” z powodem, liczniki zadań
   (zakończone/wszystkie, po terminie, zagrożone).
2. **Filtry i listy.** Zasada ogólna Adama dla CRMtree: *każda lista ma filtry i stronicowanie
   po maks. 50*. Zapisana dla webu — dla aplikacji mobilnej potwierdź u Adama formę (pytanie 1).
   Minimum w telefonie: wyszukiwanie po nazwie, status, terminowość, przedział dat zakończenia,
   a w widokach PM-a osoba. Lista zadań projektu z filtrem → `/tasks/search`; „moje zadania” →
   `/projects/my-tasks`.
3. **Widok wielu projektów** (gdy `has_cross_project_view`): przegląd projektów (postęp,
   opóźnione, zagrożone, znacznik opóźnienia) i lista zadań ze wszystkich projektów z filtrami.
   Oś czasu (Gantt) na telefonie — do decyzji Adama (pytanie 2).
4. **Zmiana terminu z powodem**: w formularzu zadania pole powodu, gdy zmienia się istniejąca
   data zakończenia; powód w historii. Przełącznik maili o terminach w profilu.
5. **Finanse — odczyt**: sumy na karcie projektu oraz na karcie leada i partnera (gdy `finance`
   nie jest `null`); dla `can_read` podsumowanie projektu i lista kosztów; koszt zadania w
   listach.
6. **Finanse — dodanie kosztu z telefonu**: formularz kosztu (data, kategoria, kwota lub kwota
   w walucie obcej, zadanie, dostawca, numer dokumentu) dla `can_write` oraz dla
   `can_add_own_costs` przy własnym zadaniu. Budżet, przychody i KSeF zostają w webie.

---

## 5. Czego pilnować

- **Uprawnienia tylko z odpowiedzi backendu** (`finance`, `permissions` zadania,
  `has_cross_project_view`, `my_role`). Konto zewnętrzne nie może zobaczyć śladu finansów ani
  widoku wielu projektów — także pustych sekcji.
- **Wyliczenia po stronie serwera**: terminowość, przesunięcie, opóźnienie projektu, postęp,
  sumy. Klient ich nie liczy, bo próg „zagrożone” i „dziś” są po stronie backendu.
- **10 języków**: każdy nowy tekst od razu we wszystkich plikach `lib/l10n/app_<lang>.arb`
  (pl, en, de, it, es, fr, ro, ru, sl, hr). Słowniczek i gotowe sformułowania są w webie —
  bierz je stamtąd, żeby web i telefon mówiły tak samo: `crmtree-frontend/docs/i18n.md` oraz
  `crmtree-frontend/src/i18n/projects/<lang>.json` (gałęzie `deadlines`, `delay`, `filters`,
  `finance`, `ksef`) i `common/<lang>.json` (`list`).
- **Kwoty i daty** formatuj według języku aplikacji i waluty projektu (`currency` z odpowiedzi).
- **Wzorce**: przy rozwiązaniach typowo mobilnych najpierw sprawdź, jak zrobiono to w aplikacji
  Worktrips (`C:\dev\worktrips-mobile`) — to stała prośba Adama dla CRMtree mobile.
- **Asystent AI zadań projektu** (`/assistant/project-task`) tworzy zadania z datą — po jego
  użyciu odśwież znaczniki projektu (mogło powstać zadanie po dacie końca projektu).

---

## 6. Pytania do Adama przed startem

1. **Filtry i stronicowanie w telefonie**: pełny zestaw filtrów z webu (także koszt, pierwotny
   termin, przesunięcie, typ, priorytet) czy zestaw minimalny z punktu 4.2? Stronicowanie jako
   doładowanie przy przewijaniu?
2. **Oś czasu (Gantt)** na telefonie: budować (pozioma, przewijana) czy pominąć i zostać przy
   listach?
3. **Powiadomienia push** o zadaniach po terminie, zmianie terminu i opóźnionym projekcie:
   backend dziś wysyła tylko maile. Dodać push (wymaga pracy w backendzie) i czy ma go
   obejmować ten sam przełącznik co maile?
4. **Dodawanie kosztu z telefonu** (punkt 4.6): tak / nie? Jeśli tak — czy ze zdjęciem
   paragonu? (Załączników moduł Projekty dziś nie ma, to byłaby nowa funkcja także w backendzie.)
5. **Faktury KSeF w telefonie**: zostają tylko w webie (rekomendacja) czy potrzebna choćby
   lista i podpinanie?
