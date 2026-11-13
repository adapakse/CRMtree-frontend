// Regenerates the WEB screenshots of the in-app manual from the INT demo tenant "crmtree".
// Usage: node scripts/manual-screenshots/capture.mjs [--only pl_a01,w0] [--lang pl|en] [--headed] [--keep-locale]
// See README.md. Commits nothing; overwrites src/assets/manual/img/{pl,en}_*.jpg.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const imgDir = path.join(repo, 'src', 'assets', 'manual', 'img');
const BASE = process.env.MANUAL_BASE_URL || 'https://app.int.crmtree.pl';
const PW_DIR = process.env.PLAYWRIGHT_DIR || 'C:/Projects/crmtree-tests';
const { chromium } = createRequire(path.join(PW_DIR, 'package.json'))('@playwright/test');

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const only = (opt('--only') || '').split(',').filter(Boolean);
const langs = opt('--lang') ? [opt('--lang')] : ['pl', 'en'];
const headed = args.includes('--headed');

// Demo personas of tenant "crmtree" (dev SSO stub on INT). Nobody outside this tenant is ever used.
const USERS = {
  piotr: 'piotr.zielinski@demo.crmtree.pl',   // salesperson
  ewa: 'ewa.wisniewska@demo.crmtree.pl',      // salesperson
  anna: 'anna.nowicka@demo.crmtree.pl',       // sales manager
  karol: 'karol.mazur@demo.crmtree.pl',       // manager
  olga: 'olga.kaminska@demo.crmtree.pl',      // accounting
  marta: 'marta.lis@demo.crmtree.pl',         // external project participant
  jan: 'jan.kowalski@crmtree.pl',             // tenant admin
};

const spec = JSON.parse(fs.readFileSync(path.join(here, 'shots.json'), 'utf8'));
const shots = spec.shots.filter((s) => !s.skip);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const L = (v, lang) => (v && typeof v === 'object' && !Array.isArray(v) ? (v[lang] ?? v.en) : v);

async function api(method, url, token, body) {
  const r = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { ok: r.ok, status: r.status, json };
}

const sessions = {};
async function session(alias) {
  if (sessions[alias]) return sessions[alias];
  const email = USERS[alias];
  if (!email) throw new Error(`unknown user alias ${alias}`);
  const login = await api('POST', '/api/auth/dev-login', null, { email });
  if (!login.ok) throw new Error(`dev-login failed for ${alias}: ${login.status}`);
  const token = login.json.access_token;
  const me = await api('GET', '/api/auth/me', token);
  const s = { alias, tokens: login.json, originalLocale: me.json?.locale ?? null, currentLocale: me.json?.locale ?? null };
  sessions[alias] = s;
  return s;
}
async function setLocale(s, lang) {
  if (s.currentLocale === lang) return;
  const r = await api('PUT', '/api/profile/locale', s.tokens.access_token, { locale: lang });
  if (!r.ok) throw new Error(`PUT locale failed ${r.status}`);
  s.currentLocale = lang;
}
async function restoreLocales() {
  for (const s of Object.values(sessions)) {
    if (s.currentLocale !== s.originalLocale) {
      const r = await api('PUT', '/api/profile/locale', s.tokens.access_token, { locale: s.originalLocale });
      console.log(`restore locale ${s.alias}: ${s.currentLocale} -> ${s.originalLocale} ${r.ok ? 'ok' : 'FAILED ' + r.status}`);
    }
  }
}

// An action is one of: {wait:ms} {waitFor:css} {waitText:txt} {click:css} {clickText:txt,nth,exact}
// {clickRole:name,role,nth} {fill:css,value} {press:key} {hover:css} {scroll:css|"window",to|by}
// {scrollIntoView:css} {select:css,label} {placeAt:css,top} {eval:js} {goto:path}. Any text/css value may be {pl:..,en:..}.
async function runAction(page, a, lang) {
  const [kind] = Object.keys(a);
  const v = a[kind];
  const text = L(v, lang);
  switch (kind) {
    case 'wait': await sleep(v); break;
    case 'waitFor': await page.locator(text).first().waitFor({ timeout: 15000 }); break;
    case 'waitText': await page.getByText(text, { exact: !!a.exact }).first().waitFor({ timeout: 15000 }); break;
    case 'click': await page.locator(text).first().click({ timeout: 10000 }); break;
    case 'clickText': await page.getByText(text, { exact: a.exact !== false }).nth(a.nth ?? 0).click({ timeout: 10000 }); break;
    case 'clickRole': await page.getByRole(a.role || 'button', { name: text, exact: a.exact !== false }).nth(a.nth ?? 0).click({ timeout: 10000 }); break;
    case 'fill': await page.locator(text).first().fill(L(a.value, lang)); break;
    case 'press': await page.keyboard.press(text); break;
    case 'hover': await page.locator(text).first().hover(); break;
    case 'scroll':
      await page.evaluate(({ sel, to, by }) => {
        const el = sel === 'window' ? document.scrollingElement : document.querySelector(sel);
        if (!el) return;
        if (to === 'bottom') el.scrollTop = el.scrollHeight; else if (typeof to === 'number') el.scrollTop = to; else if (by) el.scrollTop += by;
      }, { sel: text, to: a.to, by: a.by });
      break;
    case 'select': await page.locator(text).first().selectOption({ label: L(a.label, lang) }); break;
    case 'placeAt': // put the element's top edge "top" px below the viewport top, scrolling its scrollable ancestor
      await page.locator(text).first().evaluate((el, top) => {
        let p = el.parentElement;
        while (p && !(p.scrollHeight > p.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
        (p || document.scrollingElement).scrollTop += el.getBoundingClientRect().top - top;
      }, a.top ?? 0);
      break;
    case 'scrollIntoView': await page.locator(text).first().scrollIntoViewIfNeeded(); break;
    case 'eval': await page.evaluate(text); break;
    case 'goto': await page.goto(BASE + text, { waitUntil: 'domcontentloaded' }); break;
    default: throw new Error(`unknown action ${kind}`);
  }
  await sleep(a.after ?? 300);
}

async function capture(browser, shot, lang) {
  const file = `${lang}_${shot.file}`;
  const out = path.join(imgDir, `${file}.jpg`);
  const s = await session(shot.user);
  await setLocale(s, lang);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: lang === 'pl' ? 'pl-PL' : 'en-GB', timezoneId: 'Europe/Warsaw' });
  await ctx.addInitScript(({ t, lang }) => {
    try {
      localStorage.setItem('theme_mode', 'light');
      localStorage.setItem('crmtree_locale', lang);
      sessionStorage.setItem('wt_access', t.access_token);
      sessionStorage.setItem('wt_refresh', t.refresh_token);
    } catch { /* ignore */ }
  }, { t: s.tokens, lang });
  await ctx.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = '.test-banner{display:none!important}:root{--test-banner-height:0px!important}';
      document.head.appendChild(st);
    });
  });
  const page = await ctx.newPage();
  // The manual text describes the demo data as of this date (e.g. week 2-8 Nov 2026).
  await page.clock.setFixedTime(new Date(shot.fakeDate || spec.fakeDate || '2026-11-02T10:00:00+01:00'));
  const dest = (name) => path.join(imgDir, `${lang}_${name}.jpg`);
  try {
    await page.goto(BASE + shot.route, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await sleep(shot.settle ?? 1500);
    for (const a of shot.actions || []) await runAction(page, a, lang);
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await sleep(shot.settleAfter ?? 600);
    const buf = await page.screenshot({ type: 'jpeg', quality: 85 });
    fs.writeFileSync(out, buf);
    for (const extra of shot.alsoCopyTo || []) fs.copyFileSync(out, dest(extra));
    console.log(`ok   ${file}`);
    return true;
  } catch (e) {
    console.log(`FAIL ${file}: ${String(e.message).split('\n')[0]}`);
    try { fs.writeFileSync(path.join(here, `_fail_${file}.png`), await page.screenshot()); } catch { /* ignore */ }
    return false;
  } finally { await ctx.close(); }
}

const browser = await chromium.launch({ headless: !headed });
let okCount = 0, failCount = 0;
try {
  for (const lang of langs) {
    for (const shot of shots) {
      if (only.length && !only.some((o) => `${lang}_${shot.file}`.startsWith(o) || shot.file.startsWith(o))) continue;
      (await capture(browser, shot, lang)) ? okCount++ : failCount++;
    }
  }
} finally {
  await browser.close();
  if (!args.includes('--keep-locale')) await restoreLocales();
}
console.log(`done: ${okCount} ok, ${failCount} failed`);
