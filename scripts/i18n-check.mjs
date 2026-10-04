// Guards the translation files. Run with `npm run i18n:check`; CI runs it
// before every build.
//
// Layout: src/i18n/<scope>/<lang>.json, Polish (pl) being the source language.
// Checks, per scope:
//   1. every supported language has a file;
//   2. every language has exactly the keys of the Polish file, none empty;
//   3. every text uses the same {placeholders} as the Polish text;
//   4. every text is valid ICU message syntax for its language (a broken
//      plural would otherwise only fail in the browser);
//   5. files are formatted canonically (sorted keys, 2 spaces) so diffs and
//      merges stay line-based.
// And for the source files listed in src/i18n/translated-files.json:
//   6. no Polish text is written directly in the file any more.
//
// `--fix` rewrites the files into the canonical format instead of failing on 5.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import MessageFormat from '@messageformat/core';

const I18N_DIR = 'src/i18n';
const SOURCE_LOCALE = 'pl';
const TRANSLATED_FILES_MANIFEST = join(I18N_DIR, 'translated-files.json');
// Letters that occur in Polish but in none of the code identifiers or the
// other languages' names that legitimately appear in source files.
const POLISH_LETTERS = /[ąćęłńśźżĄĆĘŁŃŚŹŻ]/;
const shouldFix = process.argv.includes('--fix');

const localesSource = readFileSync('src/app/core/i18n/locales.ts', 'utf8');
const SUPPORTED_LOCALES = localesSource
  .match(/SUPPORTED_LOCALES = \[([^\]]+)\]/)[1]
  .split(',')
  .map(code => code.trim().replace(/'/g, ''));

const problems = [];
const report = (message) => problems.push(message);

function sortDeep(value) {
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortDeep(value[key])]));
}

const canonical = (content) => JSON.stringify(sortDeep(content), null, 2) + '\n';

function flatten(node, prefix = '') {
  const entries = new Map();
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      for (const [childPath, childValue] of flatten(value, path)) entries.set(childPath, childValue);
    } else {
      entries.set(path, value);
    }
  }
  return entries;
}

// Top-level ICU arguments of a message: {name}, {count, plural, ...}.
function placeholdersOf(text) {
  const names = new Set();
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '{') {
      if (depth === 0) {
        const name = text.slice(index + 1).match(/^\s*([A-Za-z_][A-Za-z0-9_]*)/);
        if (name) names.add(name[1]);
      }
      depth++;
    } else if (text[index] === '}') {
      depth--;
    }
  }
  return [...names].sort().join(',');
}

function readJson(path) {
  const raw = readFileSync(path, 'utf8');
  try {
    return { raw, content: JSON.parse(raw) };
  } catch (error) {
    report(`${path}: invalid JSON (${error.message})`);
    return null;
  }
}

function checkScope(scope) {
  const sourcePath = join(I18N_DIR, scope, `${SOURCE_LOCALE}.json`);
  if (!existsSync(sourcePath)) {
    report(`${scope}: missing source file ${SOURCE_LOCALE}.json`);
    return;
  }
  const source = readJson(sourcePath);
  if (!source) return;
  const sourceEntries = flatten(source.content);

  for (const locale of SUPPORTED_LOCALES) {
    const path = join(I18N_DIR, scope, `${locale}.json`);
    if (!existsSync(path)) {
      report(`${scope}: missing ${locale}.json`);
      continue;
    }
    const file = readJson(path);
    if (!file) continue;

    if (file.raw.replace(/\r\n/g, '\n') !== canonical(file.content)) {
      if (shouldFix) writeFileSync(path, canonical(file.content));
      else report(`${path}: not in canonical format — run "npm run i18n:check -- --fix"`);
    }

    const entries = flatten(file.content);
    const messageFormat = new MessageFormat(locale);
    for (const [key, text] of entries) {
      if (typeof text !== 'string') continue;
      try {
        messageFormat.compile(text);
      } catch (error) {
        report(`${path}: "${key}" is not valid ICU syntax (${error.message})`);
      }
    }
    for (const [key, sourceText] of sourceEntries) {
      const text = entries.get(key);
      if (typeof text !== 'string' || text.trim() === '') {
        report(`${path}: missing or empty "${key}"`);
      } else if (placeholdersOf(text) !== placeholdersOf(sourceText)) {
        report(`${path}: "${key}" uses different placeholders than the Polish text`);
      }
    }
    for (const key of entries.keys()) {
      if (!sourceEntries.has(key)) report(`${path}: "${key}" does not exist in the Polish file`);
    }
  }
}

// Older files carry Polish code comments; only text the user can see matters
// here. Comments are blanked out, keeping line breaks so line numbers stay right.
function withoutComments(source) {
  const blank = (comment) => comment.replace(/[^\r\n]/g, ' ');
  return source
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    // "//" starts a comment only at the start of a line or after whitespace — not in "https://".
    .replace(/(^|\s)\/\/[^\r\n]*/g, blank);
}

function checkTranslatedSourceFiles() {
  if (!existsSync(TRANSLATED_FILES_MANIFEST)) return;
  const files = JSON.parse(readFileSync(TRANSLATED_FILES_MANIFEST, 'utf8'));
  for (const path of files) {
    if (!existsSync(path)) {
      report(`${TRANSLATED_FILES_MANIFEST}: ${path} does not exist`);
      continue;
    }
    withoutComments(readFileSync(path, 'utf8')).split(/\r?\n/).forEach((line, index) => {
      if (POLISH_LETTERS.test(line)) report(`${path}:${index + 1}: Polish text written in code — move it to ${I18N_DIR}`);
    });
  }
}

const scopes = readdirSync(I18N_DIR).filter(name => statSync(join(I18N_DIR, name)).isDirectory());
scopes.forEach(checkScope);
checkTranslatedSourceFiles();

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\ni18n check failed: ${problems.length} problem(s) in ${scopes.length} scope(s).`);
  process.exit(1);
}
console.log(`i18n check passed: ${scopes.length} scope(s) × ${SUPPORTED_LOCALES.length} languages.`);
