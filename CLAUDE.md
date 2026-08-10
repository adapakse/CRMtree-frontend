# CRMtree Frontend

## Projekt
Angular 17+ SPA — generyczny CRM dla przedsiębiorstw różnych branż, skupiony na
dynamicznej pracy handlowców oraz zarządzaniu lejkiem sprzedażowym, upsellem i cross-sellem.
Katalog: `C:\Users\Adam\Documents\crmtree-frontend`

## Stack
- Angular 17+ (standalone components, signals, ChangeDetectionStrategy.OnPush)
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
- Branch roboczy: `develop`
- Push TYLKO do `develop`: `git push crmtree develop`
- Merge do `master` robi Adam ręcznie po testach (master = deploy na Azure)
- Remote `crmtree` = GitHub (`git@github-crmtree:adapakse/CRMtree-frontend.git`)
- Remote `origin` = martwy (stary projekt), ignoruj komunikaty o rozbieżności

## Uruchomienie lokalne
```bash
npm start   # http://localhost:4201
```
Backend musi działać na porcie 3001.

## Deploy (CI/CD)
- GitHub Actions workflow: `.github/workflows/deploy.yml`
- Odpala się automatycznie po pushu do `master`
- Pipeline: Docker build → push do ACR → Azure Container App update
- Azure Container App: `crmtree-frontend.salmonsmoke-415d1384.polandcentral.azurecontainerapps.io`

## Projekty NIE mylić
- `worktrips-doc-frontend` — osobna aplikacja, inne kolory (pomarańczowe), inne logo
- Zawsze sprawdź w jakim katalogu pracujesz przed edycją

---

## WhatsApp Integration

Zobacz też `CRMtree-backend/CLAUDE.md` — architektura, model per-user, webhook, wymagane
pola konfiguracji po stronie Meta.

### Model: per-user, NIE per-tenant — nie cofaj tej decyzji

Każdy CRM user ma własną konfigurację WhatsApp (`MyWhatsappConfig`, `crm-api.service.ts`).
Panel admina (Tenants / Ustawienia) **nie ma** formularza do wpisywania WABA ID/Phone
Number ID/tokenów — tylko podgląd tylko-do-odczytu i włącznik feature flagi. Jeśli ktoś
prosi o dodanie z powrotem takiego formularza w adminie, to prawdopodobnie próba cofnięcia
świadomej decyzji architektonicznej — dopytaj, zanim to zrobisz.

### Gdzie w UI

- **User łączy własny numer**: Moje ustawienia → sekcja „Mój numer WhatsApp" —
  `src/app/pages/my-settings/my-settings.component.ts`. Pola: WABA ID, Phone Number ID,
  numer widoczny dla klientów (opcjonalny), Access Token, App Secret. Po zapisaniu CRM
  generuje i pokazuje Webhook Verify Token (z ikoną kopiowania, `@lucide/angular` →
  `LucideCopy`) do wklejenia w konfiguracji webhooka w Meta App.
- **Superadmin włącza/wyłącza moduł per tenant**: Panel admina → Tenants → zakładka
  „Moduły" — `src/app/pages/admin/tenants/tenants.component.ts`. Ten sam widok pokazuje
  tylko-do-odczytu listę podłączonych numerów w tenancie.
- **Tenant admin** widzi tę samą listę tylko-do-odczytu w Ustawienia → Parametry biznesowe
  CRM — `src/app/pages/admin/settings/settings.component.ts`.
- **Wysyłka/odbiór**: zakładka „WhatsApp" na karcie leada/partnera —
  `crm-lead-detail.component.ts` / `crm-partner-detail.component.ts` (ta sama logika w obu
  plikach, osobne komponenty — sprawdzaj oba przy zmianach).

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

## Code quality standards

### Language
- **All code must be written in English**: variable names, method names, class names,
  interface names, type aliases, enum values, and inline comments.
- Polish is only acceptable in user-facing UI strings (labels, messages, tooltips).

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
