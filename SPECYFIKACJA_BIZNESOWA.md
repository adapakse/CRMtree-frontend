# Specyfikacja Biznesowa — Worktrips Doc

> System zarządzania dokumentami, partnerami i sprzedażą dla biur podróży.
> Wersja: 2026-04-27

---

## Spis treści

1. [Przegląd systemu](#1-przegląd-systemu)
2. [Role i uprawnienia użytkowników](#2-role-i-uprawnienia-użytkowników)
3. [Moduł Dokumentów](#3-moduł-dokumentów)
4. [Moduł Workflow](#4-moduł-workflow)
5. [Moduł CRM — Leady sprzedażowe](#5-moduł-crm--leady-sprzedażowe)
6. [Moduł CRM — Partnerzy](#6-moduł-crm--partnerzy)
7. [Moduł CRM — Onboarding partnerów](#7-moduł-crm--onboarding-partnerów)
8. [Moduł CRM — Komunikacja emailowa (Gmail)](#8-moduł-crm--komunikacja-emailowa-gmail)
9. [Moduł CRM — Raporty i analityka sprzedaży](#9-moduł-crm--raporty-i-analityka-sprzedaży)
10. [Moduł CRM — Kalendarz](#10-moduł-crm--kalendarz)
11. [Panel Administratora](#11-panel-administratora)
12. [Integracje zewnętrzne](#12-integracje-zewnętrzne)
13. [Słowniki i konfiguracja](#13-słowniki-i-konfiguracja)
14. [Model danych — tabele główne](#14-model-danych--tabele-główne)

---

## 1. Przegląd systemu

**Worktrips Doc** to wewnętrzny system SaaS obsługujący trzy główne obszary działalności biura podróży:

| Obszar | Cel |
|--------|-----|
| **Zarządzanie dokumentami** | Tworzenie, wersjonowanie, obieg podpisów i zatwierdzanie umów oraz innych dokumentów |
| **CRM sprzedażowy** | Zarządzanie leadami, konwersja na partnerów, komunikacja emailowa, aktywności handlowców |
| **Analityka** | Raporty sprzedażowe i KPI oparte na danych z DWH (systemu transakcyjnego) |

**Logowanie:** Użytkownicy logują się przez Google Workspace SAML — brak osobnych haseł w systemie. Dostęp tylko dla kont w domenie `@worktrips.com`.

---

## 2. Role i uprawnienia użytkowników

### 2.1 Role systemowe

| Rola | Zakres dostępu |
|------|----------------|
| **Administrator** | Pełny dostęp do wszystkich danych, ustawień i panelu administracyjnego |
| **Sales Manager** | Widzi i edytuje leady/partnerów handlowców ze swoich grup; może filtrować dane per handlowiec |
| **Salesperson** | Widzi i edytuje wyłącznie własne leady i partnerów (przypisane do niego jako `assigned_to`) |
| **Użytkownik bez roli CRM** | Dostęp do modułu dokumentów i workflow; brak dostępu do CRM |

### 2.2 Grupy użytkowników

- Użytkownicy są przypisywani do **grup** (np. region, dział).
- Sales Manager widzi wszystkich handlowców z grup, do których należy.
- Grupy mogą mieć flagę **ograniczenia właścicielskiego** (`has_owner_restriction`): tylko właściciel dokumentu/zasobu może go modyfikować.
- Dostęp do dokumentów grupy: wszyscy członkowie grupy widzą dokumenty grupy.

### 2.3 Zarządzanie użytkownikami (panel admina)

- Tworzenie i dezaktywacja kont użytkowników.
- Przypisywanie ról CRM (`salesperson`, `sales_manager`).
- Dodawanie do grup z określonym poziomem dostępu (`read` / `full`).

---

## 3. Moduł Dokumentów

### 3.1 Typy dokumentów

Konfigurowane w słowniku `doc_types`:
- Umowa partnerska (`partner_agreement`)
- Umowa NDA (`nda`)
- Umowa pracownicza (`employee_agreement`)
- Umowa z dostawcą IT (`it_supplier_agreement`)
- Umowa z operatorem (`operator_agreement`)

### 3.2 Statusy dokumentów

```
new → being_edited → being_signed → being_approved → signed → completed
                                                    → rejected
                                  → hold
```

### 3.3 Funkcjonalności dokumentów

- **Tworzenie dokumentu** — przypisanie do grupy, typu, stron (entity1, entity2), przedmiotu umowy, klasyfikacji GDPR.
- **Wersjonowanie** — każda zapisana wersja jest odrębnym rekordem; historia wszystkich wersji jest dostępna.
- **Tagi** — dowolne tagi do kategoryzacji.
- **Załączniki** — pliki dołączone do wersji dokumentu, przechowywane w Azure Blob Storage.
- **Daty** — data zawarcia, data wygaśnięcia; alerty (czerwony: < 90 dni, żółty: < 30 dni, konfigurowalny w ustawieniach).
- **Powiązanie z leadem/partnerem** — dokument może być podlinkowany do rekordu CRM.
- **Obieg podpisów** — integracja z zewnętrznym serwisem Signus (tworzenie kopert, statusy podpisów przez webhook).

### 3.4 Kontrola dostępu do dokumentów

- Właściciel dokumentu (`owner_id`).
- Przynależność do grupy (`group_id`).
- Użytkownicy z aktywnym zadaniem workflow na dokumencie.
- Administratorzy widzą wszystko.

---

## 4. Moduł Workflow

### 4.1 Cel

Workflow umożliwia formalny obieg dokumentów wewnątrz organizacji — przypisanie zadań edycji, podpisu, zatwierdzenia lub przeczytania konkretnym osobom.

### 4.2 Typy zadań

| Typ | Opis |
|-----|------|
| `edit` | Zadanie edycji dokumentu |
| `sign` | Zadanie podpisania |
| `approve` | Zadanie zatwierdzenia |
| `read` | Zadanie zapoznania się z dokumentem |

### 4.3 Statusy zadań

`pending` → `in_progress` → `completed` | `cancelled` | `rejected`

### 4.4 Widoki Workflow

- **"Moje zadania"** — lista zadań przypisanych do zalogowanego użytkownika, z podziałem na statusy.
- **Kanban Board** — widok wszystkich zadań (dla managera/admina) w kolumnach według statusu. Auto-odświeżanie co N sekund (konfigurowalne).

### 4.5 Powiadomienia

Przypisanie zadania generuje powiadomienie dla odbiorcy.

---

## 5. Moduł CRM — Leady sprzedażowe

### 5.1 Czym jest lead

Lead to potencjalny partner handlowy, który jest w procesie sprzedaży. Leady prowadzone są przez handlowców i przechodzą przez kolejne etapy aż do konwersji lub utraty.

### 5.2 Dane leada

| Pole | Opis |
|------|------|
| Firma | Nazwa firmy potencjalnego partnera |
| NIP | Numer identyfikacji podatkowej |
| Osoba kontaktowa | Imię, nazwisko, stanowisko, email, telefon |
| Dodatkowe kontakty | Wiele osób kontaktowych dla jednej firmy |
| Strona WWW | Adres strony internetowej |
| Branża | Branża klienta (słownikowa) |
| Źródło pozyskania | Jak trafił do nas lead (słownikowe: strona www, polecenie, cold call, LinkedIn, targi, itp.) |
| Etap sprzedaży | Aktualny etap w lejku (patrz 5.3) |
| Wartość kontraktu | Szacowana wartość w PLN |
| Prawdopodobieństwo | Szansa zamknięcia (0–100%) |
| Planowana data zamknięcia | Kiedy ma dojść do podpisania umowy |
| Handlowiec odpowiedzialny | Przypisany handlowiec |
| Tagi | Dowolne etykiety |
| Gorący lead 🔥 | Flaga priorytetowego leada |
| Procent sprzedaży online | Jaka część sprzedaży partnera odbywa się online |
| Roczny obrót / waluta | Szacowany roczny obrót |
| Data pierwszego kontaktu | Kiedy po raz pierwszy skontaktowaliśmy się |
| Notatki | Swobodny tekst |
| Powód utraty | Wypełniany przy zamknięciu jako `closed_lost` |

### 5.3 Etapy sprzedaży (pipeline)

```
new → qualification → presentation → offer → negotiation → closed_won
                                                          → closed_lost
```

Po `closed_won` → następuje **konwersja na partnera**.

### 5.4 Widok listy leadów

- **Kanban** — kolumny odpowiadają etapom; drag & drop do zmiany etapu.
- **Filtry:** szukaj po nazwie firmy, filtruj po etapie, źródle, handlowcu (manager), gorący, zakres dat zamknięcia.
- **Statystyki nagłówkowe:**
  - Łączna liczba leadów
  - Gorące leady
  - Pipeline (suma: wartość × prawdopodobieństwo)
  - Won (zamknięte jako wygrany)
  - Lost (zamknięte jako przegrane)
- **Odznaki emailowe** — przy każdym leadzie widać liczbę nieprzeczytanych wiadomości email.
- **Auto-odświeżanie** — lista odświeża się co 60 sekund (automatyczne wykrywanie nowych emaili).

### 5.5 Widok szczegółów leada

Trzyszpaltowy układ:

**Lewa kolumna — informacje:**
- Dane kontaktowe (email, telefon, WWW, NIP)
- Dodatkowe kontakty (wiele osób)
- Dane sprzedażowe (etap, wartość, prawdopodobieństwo, data zamknięcia)
- Historia zmian (audit trail z timestampami)

**Środkowa kolumna — aktywności:**
- Lista wszystkich aktywności chronologicznie (emaile, notatki, połączenia, spotkania, dokumenty)
- Formularz dodawania nowej aktywności
- Filtry aktywności

**Prawa kolumna — powiązania:**
- Powiązane dokumenty (link do modułu dokumentów)
- Konto testowe (zewnętrzna platforma)
- Konwersja na partnera

### 5.6 Aktywności leada

| Typ | Opis |
|-----|------|
| `email` | Wysłana lub odebrana wiadomość email (przez Gmail) |
| `call` | Zarejestrowane połączenie telefoniczne z notatką i czasem trwania |
| `meeting` | Spotkanie z uczestnikami, lokalizacją i czasem trwania |
| `note` | Swobodna notatka |
| `doc_sent` | Wysłany dokument |

Aktywności email mają status przeczytania — nieprzeczytane emaile od partnera wyświetlane są jako **pogrubione i z żółtym tłem** w widoku wątku.

### 5.7 Konwersja leada na partnera

- Dostępna dla leadów na etapie `closed_won`.
- Tworzy nowy rekord w `crm_partners` na podstawie danych leada.
- Lead otrzymuje status `onboarded` i link do partnera.
- Dane leada (firma, kontakty, email, NIP, branża, itp.) są przenoszone do partnera.

### 5.8 Import leadów z CSV

- Dostępny przez panel admina (`/crm/import`).
- Historia importów z logiem błędów i sukcesów.

---

## 6. Moduł CRM — Partnerzy

### 6.1 Czym jest partner

Partner to firma, która podpisała umowę i korzysta z platformy Worktrips. Partnerzy mogą powstać przez konwersję leada lub być dodani bezpośrednio. Kluczowa integracja z DWH (hurtownia danych) dostarcza dane sprzedażowe.

### 6.2 Dane partnera

| Pole | Opis |
|------|------|
| Firma | Nazwa firmy |
| NIP | Numer identyfikacji podatkowej |
| Adres | Pełny adres |
| Kontakt główny | Imię, nazwisko, stanowisko, email, telefon |
| Dodatkowe kontakty | Wiele osób kontaktowych |
| Branża | Branża (słownikowa) |
| Opiekun (manager) | Przypisany handlowiec |
| Grupa partnerska | Przynależność do grupy (regionalna/sektorowa) |
| Status | Aktualny status partnera (patrz 6.3) |
| Etap onboardingu | Krok 0–3 w procesie wdrożenia |
| Wartość kontraktu | Wynegocjowana wartość |
| Data podpisania umowy | Data zawarcia kontraktu |
| Data wygaśnięcia umowy | Koniec okresu umownego |
| Procent sprzedaży online | Część sprzedaży w kanale online |
| Roczny obrót / waluta | Wolumen obrotu partnera |
| Języki obsługi | Języki, w których partner obsługuje klientów |
| Kraje operacyjne | Kraje, w których partner działa |
| Zainteresowania produktowe | Typy produktów, które partner sprzedaje |
| Link do DWH | Powiązanie z rekordem w hurtowni danych |
| Liczba licencji | Liczba aktywnych licencji w systemie |

### 6.3 Statusy partnerów

```
onboarding → active → inactive
                    → churned
```

### 6.4 Widok listy partnerów

- **Widok kart** — kafelki z kluczowymi informacjami.
- **Widok tabeli** — szczegółowa tabela z paginacją.
- **Filtry:** status, opiekun, grupa, branża, szukaj po nazwie.
- **Sortowanie:** firma, branża, grupa, opiekun, wartość kontraktu, procent online, data wygaśnięcia.
- **Odznaki emailowe** — nieprzeczytane emaile przy każdym partnerze.
- **Auto-odświeżanie** — co 60 sekund.

### 6.5 Widok szczegółów partnera

Analogiczny do widoku leada, rozszerzony o:
- Dane finansowe z DWH (obroty, transakcje, prowizje — tylko do odczytu)
- Panel onboardingu (kroki 0–3)
- Zadania onboardingowe
- Historia aktywności z podziałem na typy

### 6.6 Aktywności partnera

Takie same typy jak dla leadów, dodatkowo:
- `training` — zarejestrowane szkolenie

### 6.7 Grupy partnerskie

- Grupy służą do organizacji portfela partnerów (np. regional, sektor).
- Każda grupa ma opiekuna-managera.
- Partnerzy przypisani do jednej grupy.
- Panel `/crm/partner-groups` — zarządzanie grupami.

---

## 7. Moduł CRM — Onboarding partnerów

### 7.1 Cel

Onboarding to 4-etapowy ustrukturyzowany proces wprowadzenia nowego partnera do platformy Worktrips. Każdy etap ma przypisane zadania dla handlowców.

### 7.2 Etapy onboardingu

| Krok | Nazwa | Opis |
|------|-------|------|
| 0 | Umowa | Formalizacja umowy partnerskiej |
| 1 | Konfiguracja | Konfiguracja konta i dostępów w systemie |
| 2 | Szkolenie | Szkolenie użytkowników partnera |
| 3 | Uruchomienie | Gotowy do aktywnej sprzedaży |

### 7.3 Zadania onboardingowe

Każde zadanie w onboardingu ma:
- Przypisany krok (0–3)
- Typ (`task`, `call`, `email`, `meeting`, `note`, `doc_sent`, `training`)
- Tytuł i opis
- Przypisaną osobę (`assigned_to`)
- Termin wykonania (`due_date`)
- Status: otwarte / zakończone (z datą i osobą, która zamknęła)

### 7.4 Szablony zadań

- Administrator może zdefiniować **szablony zadań** dla każdego kroku onboardingu.
- Przy tworzeniu onboardingu dla nowego partnera, szablony są automatycznie przekształcane w zadania.
- Szablony zawierają: krok, typ, tytuł, treść, liczbę dni od startu (termin relatywny).

### 7.5 Widoki panelu onboardingu (`/crm/onboarding`)

| Widok | Opis |
|-------|------|
| **Partners** | Lista partnerów aktualnie w onboardingu z postępem na każdym kroku |
| **Kanban** | Partnerzy w kolumnach według kroku onboardingu; przeciąganie do zmiany kroku |
| **Timeline** | Oś czasowa postępu wszystkich partnerów |
| **Calendar** | Widok kalendarzowy terminów zadań |

- **Filtry:** partner, handlowiec (dla managera widok cudzych zadań).

---

## 8. Moduł CRM — Komunikacja emailowa (Gmail)

### 8.1 Podłączenie konta Gmail

- Każdy handlowiec łączy **własne** konto Gmail przez OAuth2 (Google).
- Połączenie odbywa się jednorazowo z poziomu modalu Email w CRM.
- Po połączeniu, Gmail jest używany do wysyłki w imieniu handlowca.
- Możliwość ponownej autoryzacji (reauth) z poziomu UI przy wygaśnięciu tokenów.

### 8.2 Okno korespondencji (Compose)

Dostępne z widoku szczegółów leada lub partnera (przycisk "✉️ Email"):
- Pole **Do** — autocomplete z kontaktów leada/partnera; możliwość wpisania dowolnego adresu
- Pole **DW (CC)** — kopie wiadomości
- **Temat**
- **Treść** (tekstowa z opcją dołączenia historii korespondencji jako cytat)
- **Załączniki z dysku lokalnego** — upload plików
- **Załączniki z Google Drive** — picker wyboru pliku z Drive (przycisk "📁 Z Google Drive"); obsługuje Google Docs, Sheets, Slides, Drawings z automatycznym eksportem do PDF
- Wysłana wiadomość automatycznie trafia do historii aktywności

### 8.3 Wątki emailowe (Thread Viewer)

- Z panelu aktywności można otworzyć **wątek** emailowy — pełna historia konwersacji w formacie Gmail.
- Każda wiadomość w wątku wyświetla: nadawcę, odbiorców, datę, treść, załączniki.
- **Nieprzeczytane wiadomości** od klienta: wyróżnione żółtym tłem i pogrubionym tekstem.
- Ikony: pobieranie i podgląd załączników.
- Przycisk **Odpowiedz** — otwiera formularz odpowiedzi w tym samym oknie:
  - Autocomplete adresów
  - Treść z cytatem poprzedniej wiadomości
  - Załączniki: lokalne + Google Drive

### 8.4 Odbieranie emaili (Pub/Sub)

- System automatycznie odbiera wiadomości przychodzące z Gmail przez Google Cloud Pub/Sub.
- Każda przychodzący email jest dopasowywany do leada lub partnera na podstawie adresów nadawcy/odbiorcy.
- Dopasowany email tworzy aktywność `email` z flagą `is_read = false`.
- **Odznaki nieprzeczytanych emaili** (badge z liczbą) pojawiają się na:
  - Przycisku "✉️ Email" na stronie leada/partnera
  - Na liście leadów/partnerów przy każdym rekordzie
- Odczytanie wątku (otwarcie Thread Viewera) automatycznie oznacza wiadomości jako przeczytane.
- Nowe kontakty emailowe są **automatycznie zapisywane** do bazy kontaktów leada/partnera.

### 8.5 Zarządzanie załącznikami emailowymi

- Załączniki z odebranych emaili są rejestrowane i opcjonalnie przechowywane w Azure Blob Storage.
- Możliwość podglądu (w przeglądarce) i pobrania każdego załącznika.
- Wysłane załączniki są przechowywane osobno i widoczne przy wiadomościach wychodzących.

---

## 9. Moduł CRM — Raporty i analityka sprzedaży

### 9.1 Raporty sprzedażowe (`/crm/reports`)

Dashboard KPI z wykresami dla managera/admina:

| Wskaźnik | Opis |
|----------|------|
| **Pipeline** | Suma wartości aktywnych leadów × prawdopodobieństwo |
| **Won** | Wartość zamkniętych wygranych w okresie |
| **Win Rate** | Procent leadów zamkniętych jako wygrane |
| **Avg Cycle** | Średni czas domknięcia transakcji (dni) |
| **Active Leads** | Liczba aktywnych leadów |
| **Hot Leads** | Liczba leadów oznaczonych jako gorące |

**Wykresy:**
- **Lejek sprzedaży** — rozkład leadów po etapach
- **Monthly Trend** — porównanie pipeline vs. won w miesiącach
- **Sales by Person** — tabela per handlowiec (leady, pipeline, won, win%, pasek postępu)
- **Source Breakdown** — rozkład źródeł pozyskania
- **Lost Reasons** — analiza powodów utraty
- **Velocity by Stage** — średni czas spędzony na każdym etapie

**Filtry:** okres (Q1, Q2, YTD, 2024), handlowiec, partner (DWH), kategoria produktu

**Export:** PDF

### 9.2 Raporty per Lead (`/crm/reports/leads`)

Tabela i wykresy dotyczące leadów z możliwością filtrowania i eksportu.

### 9.3 Raporty per Partner (`/crm/reports/partners`)

Tabela i wykresy dotyczące partnerów. Dane finansowe z DWH gdy dostępne.

### 9.4 Dane sprzedażowe z DWH

Agregacje dostępne per partner:
- Łączny obrót brutto / netto (PLN)
- Prowizje i marże
- Liczba transakcji
- Liczba pasażerów (pax)
- Podział po kategoriach produktowych:
  - Hotel
  - Lot (transport_flight)
  - Pociąg (transport_train)
  - Autobus (transport_bus)
  - Prom (transport_ferry)
  - Wynajem samochodów (car_rental)
  - Transfer
  - Ubezpieczenie turystyczne (travel_insurance)
  - Wiza (visa)
  - Inne

### 9.5 Budżety sprzedażowe

- Definiowanie planów sprzedażowych per handlowiec / miesiąc.
- Porównanie planu vs. wykonania.

---

## 10. Moduł CRM — Kalendarz

### 10.1 Widok (`/crm/calendar`)

- Wyświetlanie wszystkich zaplanowanych aktywności handlowców (call, meeting) w widoku kalendarza.
- Filtrowanie per handlowiec.
- Integracja z Google Calendar — tworzenie eventów przez Service Account.

---

## 11. Panel Administratora

### 11.1 Ustawienia aplikacji (`/admin/settings`)

Edycja parametrów konfiguracyjnych systemu z poziomu UI (bez konieczności zmiany kodu). Każde ustawienie ma: klucz, wartość, typ, kategorię, opis.

Kluczowe ustawienia:

| Ustawienie | Opis |
|------------|------|
| `expiration_red_days` | Liczba dni do wygaśnięcia — alarm czerwony (domyślnie 90) |
| `expiration_soon_days` | Liczba dni do wygaśnięcia — ostrzeżenie żółte (domyślnie 30) |
| `kanban_refresh_interval_sec` | Częstotliwość auto-odświeżania kanban (0 = wyłączone) |
| `default_page_size` | Domyślna paginacja list |
| `lead_attachments_folder_url` | URL folderu Google Drive dla załączników leadów |

Konfigurowalny jest pełen zestaw słowników (patrz rozdział 13).

### 11.2 Zarządzanie danymi (`/admin/data`)

Narzędzia administracyjne do zarządzania danymi aplikacji — backup, reset, czyszczenie.

### 11.3 Logi systemowe (`/logs`)

Dostępne dla admina — historia zdarzeń systemowych, błędów, operacji użytkowników (audit trail).

### 11.4 Zarządzanie użytkownikami (`/users`)

- Przeglądanie listy użytkowników (z datasource SAML).
- Nadawanie / odbieranie ról CRM.
- Aktywacja / dezaktywacja kont.
- Przypisywanie do grup z poziomem dostępu.

### 11.5 Zarządzanie grupami (`/groups`)

- Tworzenie i edycja grup użytkowników.
- Przypisywanie członków i ról w grupie.
- Konfiguracja ograniczeń właścicielskich.

### 11.6 Import CRM (`/crm/import`)

- Import leadów z pliku CSV.
- Podgląd historii importów z log błędów i licznikami.

---

## 12. Integracje zewnętrzne

### 12.1 Google Workspace

| Integracja | Użycie |
|-----------|--------|
| **SAML SSO** | Logowanie użytkowników przez konta Google Workspace |
| **Gmail OAuth2** | Wysyłanie i odbieranie emaili w imieniu handlowca (per user) |
| **Google Cloud Pub/Sub** | Powiadomienia o nowych emailach w czasie rzeczywistym (polling co 30s) |
| **Google Drive Picker** | Wybór plików z Drive do załączenia do emaila (browser-side) |
| **Google Calendar API** | Tworzenie eventów w kalendarzu przez Service Account |

### 12.2 Azure Blob Storage

- Przechowywanie załączników emailowych (wysłanych i odebranych).
- Przechowywanie wersji dokumentów.
- Skalowalny, trwały magazyn plików.

### 12.3 Signus (serwis podpisów elektronicznych)

- Tworzenie kopert do podpisu elektronicznego.
- Webhook odbierający aktualizacje statusu podpisu.
- Zmiana statusu dokumentu po podpisaniu przez wszystkie strony.

### 12.4 Platform API (system transakcyjny)

- Zewnętrzna platforma Worktrips pushuje transakcje do CRM przez dedykowany endpoint API (klucz API w nagłówku).
- Dane transakcji: numer rezerwacji, data, wartość netto/brutto, prowizja, marża, produkty, pasażerowie.
- Transakcje służą jako uzupełnienie danych DWH.

### 12.5 DWH (hurtownia danych)

- Schemat `dwh` w tej samej bazie PostgreSQL, zasilany przez osobny proces ETL.
- Tabele: `dwh.dm_partner` (wymiar partnerów), `dwh.dm_sales` (fakty sprzedażowe).
- Dane z DWH są **tylko do odczytu** w CRM — służą do wyświetlania historii sprzedażowej i raportów.
- Partnerzy CRM są powiązani z rekordami DWH przez `dwh_partner_id`.

---

## 13. Słowniki i konfiguracja

Wszystkie poniższe wartości są konfigurowane przez administratora w panelu ustawień (JSON arrays).

### Źródła leadów (`crm_lead_sources`)

strona www, polecenie, cold call, LinkedIn, targi, partner, agent, kampania marketingowa, inbound, inne

### Etapy leadów (`crm_lead_stages`)

new, qualification, presentation, offer, negotiation, closed_won, closed_lost

### Statusy partnerów (`crm_partner_statuses`)

onboarding, active, inactive, churned

### Stanowiska kontaktów (`crm_contact_titles`)

CEO, CFO, CTO, COO, VP, Dyrektor, Manager, Specjalista, Właściciel, Inne

### Branże (`crm_industries`)

IT, Finanse, Transport, Turystyka, Zdrowie, Handel, Produkcja, Prawnicza, Edukacja, Inne

### Waluty (`crm_currencies`)

PLN, EUR, USD, GBP, CHF

### Kategorie produktów (`crm_product_types`)

hotel, lot, pociąg, autobus, prom, wynajem auta, transfer, ubezpieczenie, wiza, inne

### Typy dokumentów (`doc_types`)

partner_agreement, nda, employee_agreement, it_supplier_agreement, operator_agreement

### Klasyfikacje GDPR (`doc_gdpr_types`)

Powierzenie przetwarzania danych, Administratorstwo danych, Bez GDPR

---

## 14. Model danych — tabele główne

### Dokumenty

| Tabela | Opis |
|--------|------|
| `documents` | Dokumenty — główny rejestr |
| `document_versions` | Wersje dokumentów (historia) |
| `document_tags` | Tagi dokumentów |
| `workflow_tasks` | Zadania obiegu dokumentów |
| `attachments` | Pliki załączone do wersji |

### CRM — Leady

| Tabela | Opis |
|--------|------|
| `crm_leads` | Leady sprzedażowe |
| `crm_lead_activities` | Aktywności (email, call, meeting, note) |
| `crm_lead_contacts` | Dodatkowe kontakty leada |
| `crm_lead_documents` | Powiązania lead ↔ dokument |

### CRM — Partnerzy

| Tabela | Opis |
|--------|------|
| `crm_partners` | Partnerzy |
| `crm_partner_groups` | Grupy partnerów |
| `crm_partner_activities` | Aktywności partnera |
| `crm_partner_contacts` | Dodatkowe kontakty partnera |
| `crm_onboarding_tasks` | Zadania procesu onboardingu |
| `crm_onboarding_templates` | Szablony zadań onboardingowych |

### Email i transakcje

| Tabela | Opis |
|--------|------|
| `user_gmail_tokens` | Tokeny OAuth Gmail per użytkownik |
| `crm_email_attachments` | Załączniki emailowe (metadata + blob path) |
| `crm_email_message_reads` | Statusy przeczytania wiadomości |
| `crm_transactions` | Transakcje z platformy |
| `crm_transaction_products` | Produkty w transakcji |

### DWH

| Tabela | Opis |
|--------|------|
| `dwh.dm_partner` | Wymiar partnerów (ETL) |
| `dwh.dm_sales` | Fakty sprzedażowe (ETL) |

### System

| Tabela | Opis |
|--------|------|
| `users` | Konta użytkowników |
| `group_profiles` | Grupy użytkowników |
| `user_group_roles` | Przypisania użytkowników do grup |
| `app_settings` | Konfiguracja aplikacji (klucz-wartość) |
| `crm_import_logs` | Historia importów CSV |
| `crm_sales_budgets` | Budżety sprzedażowe |
| `audit_logs` | Logi audytu |

---

*Dokument wygenerowany automatycznie na podstawie analizy kodu źródłowego, 2026-04-27.*
