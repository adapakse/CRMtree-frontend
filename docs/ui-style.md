# Styl interfejsu (CRMtree i WorkTrips)

Zasady wyglądu ustalone przez Kacpra przy redesignie (listopad 2026). Ten sam plik leży w
obu repozytoriach frontendu (`CRMtree-frontend/docs/ui-style.md` i
`worktripsdoc_front/docs/ui-style.md`) — zmieniając go w jednym, zmień też w drugim.
Obie aplikacje mają ten sam kod stylów; różnią się kolorem marki i tłumaczeniami.

| | CRMtree | WorkTrips |
|---|---|---|
| Kolor marki | zielony `#3BAA5D` | pomarańczowy `#F26522` |
| Teksty w UI | i18n, 10 języków (`docs/i18n.md`) | po polsku na sztywno |
| Logowanie klienta | hasło + Google SSO | tylko SAML |

## Kolory

- **Tylko tokeny z `src/styles/global.scss`**, nigdy kolory wpisane na sztywno w komponencie.
  Zmienne marki nazywają się historycznie `--orange*` także w CRMtree (tam są zielone).
- **Kolor marki wszędzie jednakowy**: przyciski primary, linki, ikony, zaznaczona pozycja
  menu — `--orange` = `--orange-text` = `--orange-strong`. To świadoma decyzja (13.11.2026):
  mały tekst w kolorze marki ma ok. 3:1 kontrastu, poniżej WCAG AA — nie przyciemniaj go
  „dla kontrastu” bez pytania Kacpra.
- **Najciemniejszy tekst to `#333333`** (`--gray-800`, `--gray-900`, `--ink-strong`). Nigdy
  `#000`.
- **Znaczenie kolorów**: zielony = podpisane / sukces, mocny czerwony `#DC2626` = po terminie /
  ostrzeżenie, żółty = czeka, niebieski = w toku. Akcja usuwania zawsze czerwona.
- **Pastelowe tła** przez `color-mix(in srgb, <kolor> var(--tint-mix), var(--surface))`,
  **kolorowy tekst** przez `oklch(from <kolor> max(l, var(--text-min-l)) c h)` — dzięki temu
  działa też w ciemnym motywie.

## Tryb jasny i ciemny

- Przełącznik w „Moje ustawienia” → „Wygląd” (`ThemeService`, `theme-picker`), tylko Jasny /
  Ciemny. Ciemny motyw to blok `:root[data-theme="dark"]` w `global.scss` (szarości jak
  w trybie incognito Chrome).
- Każdy nowy element ma działać w obu motywach: tła `var(--surface)` / `var(--page-bg)`,
  pola `var(--control-bg)` + `var(--control-border)`, chipy `var(--chip-bg)` /
  `var(--chip-text)`. Żadnego `#fff` ani jasnych teł na sztywno.
- Ekran logowania jest **zawsze jasny** (sam deklaruje jasne tokeny w swoim `:host`).

## Wymiary i układ

- **Siatka 2px**: wszystkie wymiary parzyste — 2, 4, 6, 8, 10, 12, 14, 16… (font, padding,
  ikony, odstępy). Nie 11, 13, 15.
- **Karty z cieniem w przewijanym kontenerze** (`overflow: auto/hidden`) dostają klasę
  `.shadow-room` — inaczej przeglądarka ucina cień z boków.

## Ikony

- Każda ikona musi coś znaczyć; bez ozdobników „od siebie” — dodatki najpierw zaproponuj.
- Na przyciskach i w akcjach: **ikony linią (SVG `svg.ic`, kolor `currentColor`)**, nie emoji —
  emoji giną na kolorowym tle i wyglądają inaczej w każdym systemie.
- Emoji zostają tylko tam, gdzie są celowo (kafelki grup w „Grupy i role”).

## Gotowe elementy — używaj zamiast pisać od nowa

- Przyciski: `.btn .btn-p` (primary, biały tekst), `.btn .btn-g` (secondary), `.btn-d` (usuń).
- Znacznik nowości: `<span class="pill-new">…</span>`.
- Pusta lista: `.empty-state` + `.empty-tile` (kafelek z ikoną linią) + `.empty-title`.
- Pole wyszukiwania: `input type="search" class="srch"` (lupa w środku, ramka, obwódka przy
  pisaniu).
- **Listy rozwijane z grupami**:
  - nagłówki grup zamiast znaczków w tekście (`↳`, `📂`, `✦`, `🗄️`, `—`),
  - etapy z kolorową kropką (kolor jak kolumna kanbana),
  - osoby z kółkiem z inicjałami, zespoły z ikoną ludzi,
  - pozycja specjalna („Bez handlowca”, „Każda firma z rozmową AI”) oddzielona kreską,
  - dopiski (np. „3 próby”) szarym tekstem po prawej,
  - nagłówek grupy: 12px, `font-weight: 600`, `var(--gray-900)`.
  - WorkTrips: `wt-multi-select` (`shared/components/multi-select`) — pola opcji `group`,
    `tone` / `color`, `hint`, `indent`, `avatar`, `icon: 'team'`, `separatorAfter`,
    `buttonLabel`.
  - CRMtree: natywne `<select>` (styl `appearance: base-select`) z `<optgroup>`.
- CRMtree: listy z filtrami i stronicowaniem z `shared/list/` (zob. `CLAUDE.md`).

## Instrukcja użytkownika (CRMtree)

Zmiana wyglądu widoczna na ekranach = nowe zrzuty w instrukcji:
`scripts/manual-screenshots/` (web, z INT, tenant demo `crmtree`, jasny motyw). Układu ani
treści instrukcji nie zmieniaj przy samej podmianie zrzutów.
