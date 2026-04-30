# CRMtree Frontend

## Projekt
Angular 17+ SPA — moduł CRM dla biur podróży korporacyjnych.
Katalog: `C:\Users\Adam\Documents\crmtree-frontend`

## Stack
- Angular 17+ (standalone components, signals)
- Custom SCSS (CSS variables w `src/styles/global.scss`)
- Brak Tailwind, brak Angular Material

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
- Remote `origin` = bastion (backup)

## Uruchomienie lokalne
```bash
npm start   # http://localhost:4201
```
Backend musi działać na porcie 3001.

## Deploy
Jenkins job: `crmtree-frontend` — SCM polling z GitHub master co 5 min.
Azure Container App: `crmtree-frontend.salmonsmoke-415d1384.polandcentral.azurecontainerapps.io`

## Projekty NIE mylić
- `worktrips-doc-frontend` — osobna aplikacja, inne kolory (pomarańczowe), inne logo
- Zawsze sprawdź w jakim katalogu pracujesz przed edycją
