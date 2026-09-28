# ADR 001: Natywna aplikacja mobilna CRMtree (Flutter)

- **Status:** Zaakceptowana, zmieniona 2026-09-26 (sekcje 2–3: jeden email w wielu
  tenantach zamiast globalnej unikalności)
- **Data:** 2026-09-25
- **Decydent:** Adam
- **Dotyczy:** `crmtree-mobile` (nowe repo), `CRMtree-backend`, `CRMtree-frontend`

## Kontekst

CRMtree to CRM dla handlowców, którzy dużą część pracy wykonują poza biurem. Web
(Angular) jest projektowany pod desktop. Chcemy natywnej aplikacji na Android i iOS.

Ustalenia z analizy obecnego frontendu:

- Jedynym wspólnym punktem web ↔ mobile jest REST API backendu (`/api`, `/api/crm`).
  Modele TS są utrzymywane ręcznie w `crm-api.service.ts`, bez formalnego kontraktu.
- Część logiki biznesowej siedzi w komponentach Angulara (np. grupowanie konwersacji
  WhatsApp w `crm-lead-detail` / `crm-partner-detail`). Na mobile trzeba by ją
  napisać drugi raz.
- Auth: JWT access + refresh (`/auth/login`, `/auth/refresh` po `401 TOKEN_EXPIRED`,
  `/auth/me`). SAML przez redirect, tokeny wracają w query stringu `/auth/callback`.
- Multi-tenancy po subdomenie `nazwafirmy.crmtree.pl`. Backend odrzuca sesję innego
  tenanta kodem `403 TENANT_HOST_MISMATCH`. Na `app.crmtree.pl` (bez subdomeny)
  logowanie działa, a tenant wynika z konta.
- Brak push/WebSocket — odświeżanie przez `setInterval` i ręczne „Sprawdź nowe”.
- Telefonia: softphone WebRTC (`sip.js`), dane SIP z `/pbx/sip-credentials`.
- Moduły włączane per tenant (`tenant_features`), role `is_admin` / `crm_role`.

## Decyzje

### 1. Technologia i zakres

- **Flutter** (Dart 3), jedna baza kodu dla Android i iOS, osobne repo `crmtree-mobile`.
- **MVP tylko dla handlowców**: `crm_role` = `salesperson` lub `sales_manager`.
  Pozostali użytkownicy po zalogowaniu widzą komunikat, że aplikacja mobilna jest dla
  handlowców, i link do weba. Backend egzekwuje to samo: logowanie z `client=mobile`
  dla innych ról jest odrzucane.
- Moduły dodatkowo filtrowane przez `tenant_features` (np. bez `leads` nie ma zakładki
  Leady).
- Panel admina (tenants, billing, SEO, prospekty, import, ustawienia) **zostaje tylko
  w webie**.

**Zakres faz:**

| Faza | Zakres |
|---|---|
| 0 | Zmiany w backendzie (sekcja „Wymagane zmiany w backendzie”), szkielet aplikacji, theme, CI |
| 1 — MVP | Logowanie + biometria, ekran „Dziś”, leady (lista, kanban etapów, karta), partnerzy, aktywności, `tel:` + notatka po rozmowie, kalendarz |
| 2 | Push, WhatsApp / SMS / email, dokumenty (aparat, pliki), offline z kolejką zapisów, lekki dashboard, wiele firm na jednym telefonie (przełącznik, „Dodaj firmę”) |
| 3 | Softphone SIP (CallKit / ConnectionService), skanowanie wizytówek, widgety |

### 2. Tenant i logowanie

**Koncepcja `nazwafirmy.crmtree.pl` zostaje bez zmian.** Web i mechanizm
`TENANT_HOST_MISMATCH` nie są modyfikowane.

Na mobile tenant ustalamy **na podstawie emaila i hasła** (decyzja Adama z
2026-09-26). Ten sam email może mieć aktywne konta w kilku tenantach. Każde z nich
to osobne konto z osobnym hasłem.

1. User wpisuje email i hasło.
2. `POST /auth/mobile/login { email, password, device_id }` na hoście bez subdomeny
   (`app.crmtree.pl/api`). Backend szuka wszystkich aktywnych kont z tym emailem
   (`lower(trim(email))`) w aktywnych tenantach, sprawdza hasło na każdym z nich i
   zostawia tylko te konta, na których hasło pasuje i które mają rolę
   `salesperson` / `sales_manager`.
3. Odpowiedź: lista `[{ tenant_slug, tenant_name, access_token, refresh_token,
   must_change_password }]`, osobna para tokenów dla każdego pasującego konta.
   - **jedno konto** → aplikacja od razu wchodzi do tej firmy, bez żadnego wyboru;
   - **kilka kont** → ekran „Wybierz firmę” z nazwami firm;
   - **zero** → zwykły błąd „nieprawidłowe dane logowania”, bez informacji, czy email
     w ogóle istnieje;
   - hasło pasuje tylko do konta z inną rolą → komunikat, że aplikacja jest dla
     handlowców, z linkiem do weba.
4. Dla każdej firmy aplikacja używa `https://{tenant_slug}.crmtree.pl/api`. Każda
   sesja idzie na subdomenę swojej firmy, więc `TENANT_HOST_MISMATCH` działa bez zmian.
5. `must_change_password` obsługiwane per konto, jak w webie.

**Lista firm dopiero po haśle.** Nazw firm nie pokazujemy po samym emailu. Inaczej
każdy, kto zna czyjś email, dowiedziałby się, w jakich firmach (klientach CRMtree)
ta osoba ma konto. Rate limit per IP i per email.

**Wiele firm na jednym telefonie** (faza 2, patrz tabela faz):

- Jedno hasło dodaje wszystkie firmy, w których pasuje. Firmę z innym hasłem user
  dodaje później przez „Dodaj firmę” (ten sam endpoint, nowe konta dochodzą do
  listy).
- Przełączanie między firmami bez ponownego logowania: aplikacja trzyma osobną
  sesję dla każdej firmy.
- „Usuń firmę z aplikacji” wylogowuje tylko tę jedną sesję.
- W MVP ekran „Wybierz firmę” przy logowaniu już istnieje, ale aplikacja trzyma
  tylko wybraną firmę. Architektura od początku jest per tenant (sekcja 6), więc
  faza 2 dodaje UI, bez przebudowy.

**SSO na mobile — odłożone.** Żaden tenant nie ma dziś skonfigurowanego SAML.
Wymaga to wskazania firmy przed logowaniem (o SSO decyduje tenant), co kłóci się z
zasadą „lista firm dopiero po haśle”. Rozwiązanie zaprojektujemy, gdy pojawi się
pierwszy klient z SSO. Kierunek: przeglądarka systemowa (`flutter_web_auth_2`),
`https://{slug}.crmtree.pl/api/auth/saml?client=mobile`, powrót na
`crmtree://auth/callback?code=…` z jednorazowym kodem wymienianym na tokeny (PKCE).

### 3. Email w wielu tenantach

**Zmiana z 2026-09-26:** pierwotnie ADR zakładał globalną unikalność emaila wśród
aktywnych kont (jeden email = jeden tenant). Adam ją odrzucił, bo blokowała osoby
pracujące w kilku firmach (konsultanci, super admin z kontem w tenancie). Obowiązuje
teraz:

- **Ten sam email może mieć aktywne konta w wielu tenantach.** Konta są niezależne:
  osobne hasła, role i uprawnienia. Logowanie mobilne rozstrzyga niejednoznaczność
  hasłem (sekcja 2).
- **W obrębie jednego tenanta email musi być unikalny bez rozróżniania wielkości
  liter.** Obecny indeks `idx_users_tenant_email (tenant_id, email)` rozróżnia
  wielkość liter, więc `Jan@x.pl` i `jan@x.pl` mogą dziś istnieć w tej samej firmie,
  a logowanie po `lower(trim(email))` trafiłoby wtedy na dwa konta. Zastępujemy go
  indeksem na `(tenant_id, lower(trim(email)))`, po sprawdzeniu, że w danych nie ma
  takich par.
- Tabela `users` nie ma `deleted_at` — konto nieaktywne to `is_active = false`.

### 4. Sesja i biometria

- Zaraz po pierwszym udanym logowaniu aplikacja proponuje włączenie biometrii
  (Face ID / odcisk palca) i — w tym samym momencie — zgodę na powiadomienia.
- **Biometria włączona:** refresh tokeny zapisane w Keychain (iOS,
  `biometryCurrentSet`) / Keystore (Android, klucz wymagający uwierzytelnienia
  użytkownika) przez `biometric_storage`. Przy kilku firmach to jeden zaszyfrowany
  wpis z mapą `tenant → refresh token`, więc jeden prompt odblokowuje wszystkie
  sesje. Start aplikacji = prompt biometryczny → odblokowanie → od razu zalogowany
  do ostatnio otwartej firmy. Samo `local_auth` jako bramka UI nie wystarcza.
- **Biometria odrzucona:** refresh token trzymany tylko w pamięci. Każdy zimny start
  wymaga logowania; zapamiętany jest email (i tenant), więc user wpisuje tylko hasło
  lub klika SSO.
- **Zmiana biometrii w telefonie** (nowy odcisk / twarz) unieważnia klucz → pełne
  logowanie.
- Mobilny refresh token jest przypisany do urządzenia (`device_id`), ma przedłużaną
  ważność (np. 60 dni), jest rotowany przy każdym refreshu; ponowne użycie starego
  tokenu unieważnia całą rodzinę tokenów.
- Dezaktywacja usera, zmiana hasła i wyłączenie tenanta unieważniają tokeny urządzeń.
  `/auth/refresh` sprawdza `is_active` usera i tenanta.
- Web: „Moje ustawienia” → lista zalogowanych urządzeń z przyciskiem „Wyloguj”
  (zgubiony telefon służbowy).
- W aplikacji refresh tokenu jest serializowany (jeden refresh naraz, pozostałe
  żądania czekają) — przy starcie ekranu leci wiele żądań równolegle.

### 5. Kontrakt API — OpenAPI

- Backend generuje i publikuje specyfikację OpenAPI. Na start obejmuje endpointy MVP
  (auth, leady, partnerzy, aktywności, kalendarz, zadania).
- `crmtree-mobile` generuje klienta Dart (`openapi-generator` dart-dio lub
  `swagger_parser`). Warstwa `data/` opakowuje wygenerowany kod, żeby UI nie zależało
  od generatora.
- CI backendu wykrywa zmiany łamiące kompatybilność (np. `oasdiff`). Stare wersje
  aplikacji żyją u użytkowników tygodniami — zmiany łamiące wymagają wersjonowania.
- Logikę, która dziś jest w komponentach Angulara, a jest potrzebna na mobile
  (np. grupowanie konwersacji WhatsApp po `normalizePhoneDigits()`), przenosimy do
  backendu, żeby oba klienty zachowywały się identycznie.

### 6. Architektura aplikacji

Struktura według funkcji, trzy cienkie warstwy (bez pełnego Clean Architecture z
use-case'ami — KISS):

```
lib/
  app/        # MaterialApp, router, theme, flavors (dev/int/prod)
  core/       # api (Dio + interceptory), auth, tenant, storage (drift), push, utils
  features/
    today/ leads/ partners/ activities/ calendar/ messaging/ calls/
      data/          # repozytoria (API + cache)
      domain/        # modele freezed, reguły
      presentation/  # ekrany, widgety, notifiery Riverpod
  shared/widgets/    # design system CRMtree
```

| Obszar | Wybór |
|---|---|
| Stan | Riverpod (codegen) |
| HTTP | Dio + interceptory (auth, refresh z kolejką, błędy) |
| Modele | freezed + json_serializable / klient z OpenAPI |
| Routing | go_router; ścieżki zgodne z webem (`/crm/leads/:id`) → deep linki i universal links |
| Tokeny | biometric_storage / flutter_secure_storage |
| Cache i offline | drift (SQLite, szyfrowany sqlcipher), tabela `outbox` |
| Push | firebase_messaging + flutter_local_notifications |
| SSO | flutter_web_auth_2 |
| Monitoring | Sentry (`sentry_flutter`) |
| i18n | ARB + flutter_localizations (PL, później EN) |

**Offline:** odczyt stale-while-revalidate z cache; zapisy (aktywności, notatki,
zmiana etapu) do `outbox` z `client_id` dla idempotencji. Pełnej dwukierunkowej
synchronizacji celowo nie robimy.

**Wszystko per tenant od pierwszego dnia** (sekcja 2, wiele firm na telefonie).
Tenant jest kluczem dla: adresu API, pary tokenów, lokalnej bazy drift (osobny
zaszyfrowany plik na firmę — dane klientów różnych firm nie mogą się mieszać),
kolejki `outbox` (zapis zrobiony w firmie A nie może trafić do B po przełączeniu),
rejestracji urządzenia do push, roli i `tenant_features`. Przełączenie firmy
podmienia zakres providerów Riverpod, zamiast czyścić stan ręcznie. Dopisanie tego
w szkielecie jest tanie; przerabianie gotowej aplikacji byłoby drogie.

**Theme:** tokeny z `src/styles/global.scss` (`#3BAA5D`, `#2F8F4D`, `#E6F4EA`,
`#1F2933`, `#3B82F6`) → Material 3 `ThemeData`; adaptacyjne kontrolki Cupertino na
iOS tam, gdzie użytkownik ich oczekuje.

**Numery telefonów:** `normalizePhoneDigits()` portujemy do Darta; wspólny zestaw
przypadków testowych w obu repozytoriach. Każde porównanie `from_phone` / `to_phone`
przechodzi przez normalizację (zasada z `CLAUDE.md`).

**Telefonia w MVP:** `tel:` przez natywny dialer, po powrocie do aplikacji formularz
notatki (jak faza `post-call` w PBX). Automatyczne dopasowanie z rejestru połączeń
odpada — Google Play praktycznie nie przyznaje `READ_CALL_LOG` aplikacjom, które nie
są domyślnym dialerem.

### 7. Monitoring — Sentry

- `sendDefaultPii: false`, `beforeSend` usuwa body żądań, nagłówek `Authorization`,
  numery telefonów i emaile.
- Kontekst usera: tylko `user_id` i `tenant_id`.
- Osobne `environment` dla dev / int / prod; release = wersja builda; wgrane symbole
  debugowania (`--split-debug-info`, dSYM).

### 8. Powiadomienia push

- `firebase_messaging` + `flutter_local_notifications`.
- Backend wysyła wiadomości **data-only z samymi identyfikatorami**
  (`{ type: 'whatsapp_inbound', lead_id: 123 }`). Tekst generuje aplikacja, bez treści
  wiadomości i numerów telefonu — powiadomienie widać na zablokowanym ekranie.
- Kanały Androida: Wiadomości, Zadania, Leady (osobno wyciszane).
- Kliknięcie → go_router → np. `/crm/leads/123`.
- **Powiadomienia ze wszystkich firm** zapisanych w aplikacji, nie tylko z otwartej
  (decyzja 2026-09-26). Payload zawiera `tenant_slug`; przy więcej niż jednej firmie
  tekst powiadomienia zawiera nazwę firmy, a kliknięcie przełącza na nią przed
  otwarciem ekranu. Urządzenie rejestruje token FCM osobno w każdej firmie.
- Universal links z maili webowych przychodzą z hosta `{slug}.crmtree.pl`, więc
  firma wynika z hosta (`applinks:*.crmtree.pl` w iOS Associated Domains).
- Zdarzenia: przychodzący WhatsApp / SMS, nowy lead przypisany do handlowca,
  przypomnienie o zadaniu, nieodebrane połączenie.
- Konfiguracja: klucz APNs (`.p8`) w Firebase, osobny projekt Firebase per flavor.

### 9. CI/CD

- Flavory `dev`, `int` (`int.crmtree.pl`), `prod` z osobnymi bundle ID.
- Flavor `int` zawsze używa `int.crmtree.pl` bez subdomeny firmy. Na INT jest DNS
  `*.int.crmtree.pl`, ale bez certyfikatu i powiązania z aplikacją, więc
  `https://{slug}.int.crmtree.pl` nie działa. Na hoście bez subdomeny tenant wynika z
  konta (tokenu), tak jak na `app.crmtree.pl`.
- Buildy iOS wymagają macOS (runner macOS w GitHub Actions albo Mac).
- GitHub Actions + fastlane → TestFlight i Google Play Internal.
- `flutter analyze` (`very_good_analysis`), testy jednostkowe repozytoriów i
  notifierów, widget testy kluczowych ekranów, `integration_test` dla logowania i
  dodania aktywności.
- Git workflow jak w webie: `develop`, merge do `master` / release ręcznie.

## Wymagane zmiany w backendzie (faza 0)

1. Unikalność emaila w obrębie tenanta bez rozróżniania wielkości liter (sekcja 3):
   sprawdzenie danych, indeks `(tenant_id, lower(trim(email)))` w miejsce obecnego.
2. `POST /auth/mobile/login` sprawdzający hasło na wszystkich aktywnych kontach z
   danym emailem i zwracający listę pasujących firm z tokenami (sekcja 2), z rate
   limitem.
3. ~~SSO dla mobile~~ — odłożone do pierwszego klienta z SAML (sekcja 2).
4. Mobilne refresh tokeny przypisane do urządzenia i konta: rotacja, wykrywanie
   ponownego użycia, unieważnianie, endpoint listy urządzeń.
5. Ograniczenie logowania mobilnego do ról `salesperson` / `sales_manager`
   (sprawdzane per konto).
6. `POST` / `DELETE /api/devices` (token FCM) i wysyłka push przez Firebase Admin SDK.
7. OpenAPI dla endpointów MVP + kontrola kompatybilności w CI.
8. Paginacja kursorowa list, lekka lista leadów, agregat dla ekranu „Dziś”,
   `updated_since` dla cache.
9. `client_id` (idempotencja) dla zapisów z kolejki offline.
10. `GET /api/public/app-config` z minimalną wspieraną wersją aplikacji (wymuszenie
    aktualizacji).
11. Gotowe konwersacje WhatsApp zgrupowane po znormalizowanym numerze.

## Konsekwencje

**Pozytywne**

- Model `nazwafirmy.crmtree.pl` i web pozostają bez zmian w zakresie rozpoznawania
  tenanta.
- Handlowiec loguje się raz; kolejne wejścia to biometria.
- OpenAPI i przeniesienie logiki do backendu ograniczają rozjazd web ↔ mobile.
- Osoba z kontami w kilku firmach loguje się raz i przełącza między nimi (od fazy
  2); nie trzeba czyścić duplikatów emaili w istniejących danych.

**Negatywne / ryzyka**

- Każda nowa funkcja CRM potencjalnie powstaje dwa razy (Angular + Flutter).
- Aplikacja musi być od początku zbudowana per tenant (sekcja 6) — kilka dni pracy
  więcej w szkielecie i MVP.
- SSO na mobile wymaga osobnego projektu, bo wskazanie firmy przed logowaniem kłóci
  się z zasadą „lista firm dopiero po haśle”.
- Dane klientów w cache na urządzeniu — wymagane szyfrowanie bazy i czyszczenie przy
  wylogowaniu (RODO).
- VoIP na iOS (CallKit / PushKit) jest pracochłonny i podlega review Apple — dlatego
  dopiero faza 3.
- App Store review wymaga konta demo z danymi testowymi.

## Rozważone alternatywy

- **Jeden host API z tenantem w JWT zamiast subdomen** — odrzucone: wymaga przebudowy
  rozpoznawania tenanta w działającym webie i backendzie.
- **Użytkownik wpisuje subdomenę firmy przy pierwszym logowaniu** — odrzucone:
  logowanie emailem i hasłem jest prostsze dla użytkownika.
- **Lista firm pokazywana po samym emailu** (`/auth/discover`) — odrzucone
  2026-09-26: zdradza, w jakich firmach ma konto osoba o danym emailu.
- **Globalna unikalność emaila wśród aktywnych kont** (pierwotna wersja tego ADR) —
  odrzucone 2026-09-26: blokuje osoby pracujące w kilku firmach.
