# Manual screenshots (WEB)

Regenerates the web screenshots of the in-app manual (`src/assets/manual/img/{pl,en}_*.jpg`,
1440x900 JPG q85) from the INT demo tenant `crmtree`. Mobile images (`*_t*.jpg`) are not touched.

```bash
node scripts/manual-screenshots/capture.mjs                    # everything, PL + EN
node scripts/manual-screenshots/capture.mjs --only pl_a01      # prefix of file name (or of the key, e.g. a0 = both languages)
node scripts/manual-screenshots/capture.mjs --lang pl --only w0
node scripts/manual-screenshots/capture.mjs --headed           # watch the browser
```

How it works
- Playwright is resolved from `C:/Projects/crmtree-tests` (override: `PLAYWRIGHT_DIR`); no changes to `package.json`.
- Target: `https://app.int.crmtree.pl` (override: `MANUAL_BASE_URL`). Wait for the INT deploy first (`gh run list`).
- Login: `POST /api/auth/dev-login` (INT dev SSO stub) for the demo personas listed at the top of `capture.mjs`
  (all in tenant `crmtree`). No passwords.
- Language is per user, so for each shot the script sets `PUT /api/profile/locale` for that demo user and
  restores the original value at the end (also on errors; skip with `--keep-locale`).
- Light theme forced (`theme_mode=light`), INT "test environment" banner hidden, clock fixed to
  2026-11-02 10:00 (the manual text describes the demo data as of that day; `fakeDate` in `shots.json`).
- Overwrites images in place; git keeps history. `_fail_*.png` files appear next to the script for failed shots
  (delete them).

`shots.json`: `{ file, route, user, actions?, alsoCopyTo?, settle?, fakeDate?, skip? }`
- `file`: name without the language prefix (`w01_dashboard` gives `pl_w01_dashboard.jpg` and `en_w01_dashboard.jpg`).
- `alsoCopyTo`: other names that get a byte-identical copy (not used by the manual now; the old `*b_*_full.jpg` copies were removed).
- `actions` (run in order after the page settles; text/selector values can be `{ "pl": "...", "en": "..." }`):
  `{wait: ms}`, `{click: css}`, `{clickText: text, exact?, nth?}`, `{clickRole: name, role?}`, `{fill: css, value}`,
  `{press: key}`, `{hover: css}`, `{waitFor: css}`, `{waitText: text}`, `{scroll: css|"window", to|by}`,
  `{scrollIntoView: css}`, `{eval: js}`, `{goto: path}`.
- Users: `piotr`, `ewa` (salespeople), `anna`, `karol` (managers), `olga` (accounting), `marta` (external), `jan` (admin).
