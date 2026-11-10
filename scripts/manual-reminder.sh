#!/usr/bin/env bash
# Reminds that the in-app user manual (src/assets/manual) must follow user-visible changes.
#
# Rule (Adam, 2026-11-03): fixes don't need a manual update; new features and changes of screens or
# logic do. A commit counts as such when its subject is a Conventional Commits "feat" and it touches
# the application (src/app, src/i18n). A commit that genuinely needs no manual change says so with
# "[manual: n/a]" in its message.
#
# Never fails: it only warns (GitHub annotation + job summary in CI, plain text locally).
#   bash scripts/manual-reminder.sh <base> <head>      e.g. origin/develop HEAD
set -uo pipefail

base="${1:-origin/develop}"
head="${2:-HEAD}"

if [[ -z "$base" || "$base" =~ ^0+$ ]] || ! git rev-parse --verify --quiet "$base^{commit}" >/dev/null; then
  echo "manual-reminder: no usable base commit ('$base'), skipping."
  exit 0
fi

if git diff --quiet "$base" "$head" -- src/assets/manual; then
  manual_updated=false
else
  manual_updated=true
fi

needing_manual=()
while IFS= read -r sha; do
  [[ -z "$sha" ]] && continue
  subject=$(git log -1 --format=%s "$sha")
  message=$(git log -1 --format=%B "$sha")
  [[ "$subject" =~ ^feat(\(.+\))?!?: ]] || continue
  [[ "$message" == *"[manual: n/a]"* ]] && continue
  if git diff-tree --no-commit-id --name-only -r "$sha" | grep -qE '^src/(app|i18n)/'; then
    needing_manual+=("$(git log -1 --format='%h %s' "$sha")")
  fi
done < <(git rev-list --no-merges "$base..$head")

if [[ ${#needing_manual[@]} -eq 0 || "$manual_updated" == true ]]; then
  echo "manual-reminder: OK (feature commits: ${#needing_manual[@]}, manual updated: $manual_updated)."
  exit 0
fi

message="These feature commits change the app but the user manual (src/assets/manual, all 10 languages) was not updated. Update it, or add [manual: n/a] to a commit that really needs no manual change."
if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  echo "::warning title=User manual not updated::$message"
  {
    echo "### User manual not updated"
    echo "$message"
    echo
    printf -- '- %s\n' "${needing_manual[@]}"
  } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
else
  echo "manual-reminder: $message"
fi
printf -- '  - %s\n' "${needing_manual[@]}"
exit 0
