// Run with `npm run test:unit` (Node's own test runner; the file is not part of the app build).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { TENANT_DEFAULT_VALUES, TENANT_DICTIONARIES, tenantDefaultLabelKey } from './tenant-default-labels.ts';

const LOCALES = ['pl', 'en', 'de', 'it', 'es', 'fr', 'ro', 'ru', 'sl', 'hr'];

function commonTranslations(locale: string): Record<string, any> {
  return JSON.parse(readFileSync(new URL(`../../../i18n/common/${locale}.json`, import.meta.url), 'utf8'));
}

describe('tenantDefaultLabelKey', () => {
  it('maps seeded defaults to their translation key', () => {
    assert.equal(tenantDefaultLabelKey('projectStatuses', 'Do zrobienia'), 'tenantDefaults.projectStatuses.todo');
    assert.equal(tenantDefaultLabelKey('holdReasons', 'Brak osób decyzyjnych'), 'tenantDefaults.holdReasons.noDecisionMakers');
    assert.equal(tenantDefaultLabelKey('lostReasons', 'Inne'), 'tenantDefaults.lostReasons.other');
    assert.equal(tenantDefaultLabelKey('countries', 'Wielka Brytania'), 'tenantDefaults.countries.gb');
    assert.equal(tenantDefaultLabelKey('groups', 'Zarzad'), 'tenantDefaults.groups.management');
  });

  it('recognises project dictionaries seeded in another tenant language', () => {
    assert.equal(tenantDefaultLabelKey('projectStatuses', 'In review'), 'tenantDefaults.projectStatuses.review');
    assert.equal(tenantDefaultLabelKey('projectStatuses', 'Выполнено'), 'tenantDefaults.projectStatuses.done');
    assert.equal(tenantDefaultLabelKey('projectPriorities', 'Kritisch'), 'tenantDefaults.projectPriorities.critical');
  });

  it('leaves values the tenant typed itself untranslated', () => {
    assert.equal(tenantDefaultLabelKey('projectStatuses', 'Czeka na klienta'), null);
    assert.equal(tenantDefaultLabelKey('lostReasons', 'wysoka cena'), null);
    assert.equal(tenantDefaultLabelKey('lostReasons', ''), null);
    assert.equal(tenantDefaultLabelKey('groups', null), null);
    assert.equal(tenantDefaultLabelKey('groups', 'SEO'), null);
  });

  it('has a translation for every seeded default in every language', () => {
    for (const locale of LOCALES) {
      const texts = commonTranslations(locale).tenantDefaults;
      for (const dictionary of TENANT_DICTIONARIES) {
        assert.deepEqual(Object.keys(texts[dictionary]).sort(), Object.keys(TENANT_DEFAULT_VALUES[dictionary]).sort(), `${locale}: ${dictionary}`);
      }
    }
  });

  it('never gives one stored value two meanings within a dictionary', () => {
    for (const dictionary of TENANT_DICTIONARIES) {
      const values = Object.values(TENANT_DEFAULT_VALUES[dictionary]).flat();
      assert.equal(new Set(values).size, values.length, dictionary);
    }
  });

  it('round-trips the Polish translation, which is the stored default', () => {
    const polish = commonTranslations('pl').tenantDefaults;
    for (const dictionary of TENANT_DICTIONARIES) {
      for (const slug of Object.keys(TENANT_DEFAULT_VALUES[dictionary])) {
        assert.equal(tenantDefaultLabelKey(dictionary, polish[dictionary][slug]), `tenantDefaults.${dictionary}.${slug}`);
      }
    }
  });
});
