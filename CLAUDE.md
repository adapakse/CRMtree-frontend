# CRMtree Frontend

## Projekt
Angular 17+ SPA — moduł CRM dla biur podróży korporacyjnych.
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
