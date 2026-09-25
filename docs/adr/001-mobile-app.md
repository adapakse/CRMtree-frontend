# ADR 001: Natywna aplikacja mobilna CRMtree (Flutter)

- **Status:** Zaakceptowana
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
| 2 | Push, WhatsApp / SMS / email, dokumenty (aparat, pliki), offline z kolejką zapisów, lekki dashboard |
| 3 | Softphone SIP (CallKit / ConnectionService), skanowanie wizytówek, widgety |

### 2. Tenant i logowanie

**Koncepcja `nazwafirmy.crmtree.pl` zostaje bez zmian.** Web i mechanizm
`TENANT_HOST_MISMATCH` nie są modyfikowane.

Na mobile tenant ustalamy **na podstawie emaila** (logowanie zaczynające się od
emaila):

1. User wpisuje email.
2. `POST /auth/discover { email }` →
   `{ tenant_slug, tenant_name, auth_methods: ['password' | 'saml', ...] }`.
3. Aplikacja zapisuje `https://{tenant_slug}.crmtree.pl/api` jako adres API. Wszystkie
   kolejne żądania idą na subdomenę firmy, więc obecna walidacja hosta działa bez zmian.
4. Aplikacja pokazuje pole hasła, przycisk SSO albo oba — zgodnie z konfiguracją
   tenanta (`auth_configs`).
5. `must_change_password` obsługiwane jak w webie.

Discovery musi się odbyć **przed** hasłem, bo o dostępności SSO decyduje tenant.

**Ochrona discovery:** rate limit per IP i per email. Dla nieznanego emaila endpoint
zwraca neutralną odpowiedź (`auth_methods: ['password']`, bez nazwy firmy) zamiast
błędu, żeby nie dało się sprawdzać, kto jest klientem CRMtree. Logowanie hasłem
kończy się wtedy zwykłym błędem „nieprawidłowe dane logowania”.

**SSO na mobile:** przeglądarka systemowa (`flutter_web_auth_2`) otwiera
`https://{slug}.crmtree.pl/api/auth/saml?client=mobile`. Po sukcesie backend
przekierowuje na `crmtree://auth/callback?code=…` z jednorazowym, krótko żyjącym
kodem, który aplikacja wymienia na tokeny (PKCE). Tokeny nigdy nie trafiają do URL.

### 3. Unikalność emaila między tenantami

Discovery działa tylko wtedy, gdy email jednoznacznie wskazuje tenanta. Dlatego:

- **Jeden adres email może należeć do najwyżej jednego aktywnego użytkownika w całym
  systemie, niezależnie od tenanta.** Reguła obejmuje wszystkich użytkowników, w tym
  adminów tenantów i super adminów.
- **Użytkownik nieaktywny (dezaktywowany lub usunięty logicznie, `deleted_at`) nie
  jest duplikatem.** Ten sam email może zostać użyty dla nowego, aktywnego konta w
  tym samym lub innym tenancie.
- Porównanie bez rozróżniania wielkości liter i po przycięciu spacji
  (`lower(trim(email))`).

**Walidacja w backendzie** — w każdym miejscu, które może sprawić, że dwa aktywne
konta mają ten sam email:

- utworzenie użytkownika (panel admina, onboarding tenanta, SSO just-in-time
  provisioning, jeśli istnieje),
- zmiana emaila użytkownika,
- **reaktywacja** nieaktywnego użytkownika (jego email mógł w międzyczasie zostać
  użyty przez aktywne konto gdzie indziej),
- przywrócenie usuniętego tenanta (reaktywuje wielu użytkowników naraz),
- import użytkowników.

Kontrola w kodzie aplikacji to za mało (race condition przy równoległych zapisach).
Regułę gwarantuje baza — częściowy indeks unikalny, np. w PostgreSQL:

```sql
CREATE UNIQUE INDEX users_active_email_unique
  ON users (lower(trim(email)))
  WHERE is_active AND deleted_at IS NULL;
```

Dokładny warunek `WHERE` należy dopasować do tego, jak backend oznacza nieaktywne
konta.

**Błąd dla klienta:** `409 EMAIL_ALREADY_IN_USE` z komunikatem „Ten adres email jest
już używany przez aktywne konto w CRMtree.”. Komunikat **nie ujawnia**, w którym
tenancie jest konto — admin jednej firmy nie może się dowiedzieć, kto jest klientem
innej. Web (`users.component.ts`, panel tenantów) pokazuje ten komunikat przy
formularzu.

**Migracja:** przed założeniem indeksu uruchamiamy zapytanie wykrywające istniejące
duplikaty wśród aktywnych kont. Duplikaty rozwiązujemy ręcznie (dezaktywacja lub
zmiana emaila) — indeks zakładamy dopiero, gdy wynik jest pusty.

### 4. Sesja i biometria

- Zaraz po pierwszym udanym logowaniu aplikacja proponuje włączenie biometrii
  (Face ID / odcisk palca) i — w tym samym momencie — zgodę na powiadomienia.
- **Biometria włączona:** refresh token zapisany w Keychain (iOS,
  `biometryCurrentSet`) / Keystore (Android, klucz wymagający uwierzytelnienia
  użytkownika) przez `biometric_storage`. Start aplikacji = prompt biometryczny →
  odblokowanie refresh tokenu → od razu zalogowany. Samo `local_auth` jako bramka UI
  nie wystarcza.
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
- Zdarzenia: przychodzący WhatsApp / SMS, nowy lead przypisany do handlowca,
  przypomnienie o zadaniu, nieodebrane połączenie.
- Konfiguracja: klucz APNs (`.p8`) w Firebase, osobny projekt Firebase per flavor.

### 9. CI/CD

- Flavory `dev`, `int` (`int.crmtree.pl`), `prod` z osobnymi bundle ID.
- GitHub Actions + fastlane → TestFlight i Google Play Internal.
- `flutter analyze` (`very_good_analysis`), testy jednostkowe repozytoriów i
  notifierów, widget testy kluczowych ekranów, `integration_test` dla logowania i
  dodania aktywności.
- Git workflow jak w webie: `develop`, merge do `master` / release ręcznie.

## Wymagane zmiany w backendzie (faza 0)

1. Walidacja unikalności emaila wśród aktywnych kont we wszystkich tenantach
   (sekcja 3): czyszczenie duplikatów, częściowy indeks unikalny, `409
   EMAIL_ALREADY_IN_USE` we wszystkich ścieżkach tworzenia, zmiany emaila i
   reaktywacji.
2. `POST /auth/discover` z rate limitem i neutralną odpowiedzią dla nieznanego emaila.
3. SSO dla mobile: `client=mobile`, redirect na `crmtree://auth/callback` z
   jednorazowym kodem + PKCE.
4. Mobilne refresh tokeny przypisane do urządzenia: rotacja, wykrywanie ponownego
   użycia, unieważnianie, endpoint listy urządzeń.
5. Ograniczenie logowania `client=mobile` do ról `salesperson` / `sales_manager`.
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
- Reguła unikalnego emaila upraszcza też logowanie na `app.crmtree.pl`.

**Negatywne / ryzyka**

- Każda nowa funkcja CRM potencjalnie powstaje dwa razy (Angular + Flutter).
- Reguła unikalności blokuje przypadek „jedna osoba aktywna w dwóch firmach”
  (np. konsultant, super admin z kontem w tenancie). Taka osoba potrzebuje osobnych
  adresów email.
- Dane klientów w cache na urządzeniu — wymagane szyfrowanie bazy i czyszczenie przy
  wylogowaniu (RODO).
- VoIP na iOS (CallKit / PushKit) jest pracochłonny i podlega review Apple — dlatego
  dopiero faza 3.
- App Store review wymaga konta demo z danymi testowymi.

## Rozważone alternatywy

- **Jeden host API z tenantem w JWT zamiast subdomen** — odrzucone: wymaga przebudowy
  rozpoznawania tenanta w działającym webie i backendzie.
- **Użytkownik wpisuje subdomenę firmy przy pierwszym logowaniu** — odrzucone na
  rzecz discovery po emailu: prostsze dla użytkownika.
- **Discovery zwracające listę tenantów dla emaila** — odrzucone: wprowadzamy
  globalną unikalność emaila wśród aktywnych kont.
