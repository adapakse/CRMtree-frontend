// Claude Code hook (PreToolUse, Bash): blocks a `feat` commit that changes src/app or src/i18n
// without touching the user manual (src/assets/manual). Same rule as scripts/manual-reminder.sh,
// but it stops Claude before the commit instead of warning in CI. Wired in .claude/settings.json.
const { execFileSync } = require('child_process');

let raw = '';
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  try { check(JSON.parse(raw)); } catch { /* never break unrelated commands */ }
  process.exit(0);
});

const toNativePath = (p) => p.replace(/^["']|["']$/g, '').replace(/^\/([a-z])\//i, '$1:/');
const git = (dir, args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();

function check(payload) {
  const command = payload.tool_input?.command ?? '';
  if (!/\bgit\b[^\n;&|]*\bcommit\b/.test(command)) return;
  if (/\[manual:\s*n\/a\]/i.test(command)) return;
  if (!/(^|["'\n])\s*feat(\([^)]*\))?!?:/m.test(command)) return;

  const gitC = command.match(/\bgit\s+-C\s+("[^"]+"|'[^']+'|\S+)\s+commit/);
  const cds = [...command.matchAll(/\bcd\s+("[^"]+"|'[^']+'|[^\s;&|]+)/g)];
  const dir = toNativePath(gitC?.[1] ?? cds.at(-1)?.[1] ?? payload.cwd ?? '.');

  const origin = git(dir, ['remote', 'get-url', 'origin']);
  if (!/crmtree-frontend/i.test(origin)) return;

  const files = new Set(git(dir, ['diff', '--cached', '--name-only']).split('\n'));
  // `git add ... && git commit` in one command: nothing is staged yet when this hook runs.
  if (/\bgit\b[^\n;&|]*\badd\b/.test(command) || /\bcommit\b[^\n;&|]*\s-(a|am|-all)\b/.test(command)) {
    git(dir, ['diff', '--name-only']).split('\n').forEach((f) => files.add(f));
    git(dir, ['ls-files', '--others', '--exclude-standard']).split('\n').forEach((f) => files.add(f));
  }
  const changesScreens = [...files].some((f) => /^src\/(app|i18n)\//.test(f));
  const changesManual = [...files].some((f) => f.startsWith('src/assets/manual/'));
  if (!changesScreens || changesManual) return;

  process.stderr.write(
    'Commit typu feat zmienia ekrany (src/app lub src/i18n), ale nie aktualizuje instrukcji użytkownika.\n'
    + 'Zasada Adama (CLAUDE.md, sekcja „Instrukcja użytkownika”): zaktualizuj odpowiedni rozdział we wszystkich '
    + '10 plikach src/assets/manual/<język>.html i dodaj je do tego commita.\n'
    + 'Jeśli zmiana nie dotyczy instrukcji (np. tylko panel superadmina), dopisz do opisu commita: [manual: n/a]\n',
  );
  process.exit(2);
}
