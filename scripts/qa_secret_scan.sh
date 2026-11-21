#!/usr/bin/env bash
# qa_secret_scan.sh — Operations' independent secret scan for My Player (SAMPLE QA tool).
# Usage: ./qa_secret_scan.sh [repo_dir]   (default: current dir)
# Exit 0 = clean, 1 = findings, 2 = usage error. Never prints full secret values (masked).
# Skips: node_modules, .git, dist, build, coverage. Requires: rg (ripgrep) or falls back to grep.
set -u
ROOT="${1:-.}"
[ -d "$ROOT" ] || { echo "usage: $0 [repo_dir]"; exit 2; }
cd "$ROOT" || exit 2
EXCL=(--glob '!node_modules/**' --glob '!.git/**' --glob '!dist/**' --glob '!build/**' --glob '!coverage/**' --glob '!qa_secret_scan.sh')
FOUND=0
mask() { sed -E 's/(AI[z]a[0-9A-Za-z_-]{4})[0-9A-Za-z_-]{31}/\1****MASKED****/g; s/(["'"'"'=:][[:space:]]*["'"'"']?[^"'"'"'[:space:]]{4})[^"'"'"'[:space:]]{8,}/\1****MASKED****/g'; }
scan() { # $1 label, $2 regex, $3 extra rg flags
  local out
  if command -v rg >/dev/null; then
    out=$(rg -n --hidden --no-messages ${3:-} "${EXCL[@]}" -e "$2" . 2>/dev/null)
  else
    out=$(grep -rnIE ${3:-} --exclude-dir={node_modules,.git,dist,build,coverage} --exclude=qa_secret_scan.sh "$2" . 2>/dev/null)
  fi
  if [ -n "$out" ]; then FOUND=1; echo "FAIL [$1]"; echo "$out" | mask | sed 's/^/   /'; else echo "PASS [$1]"; fi
}
echo "== QA secret scan: $(pwd) @ $(date '+%Y-%m-%d %H:%M %Z') =="
scan "Google API key (A-I-z-a prefix + 35)" 'AI''za[0-9A-Za-z_-]{35}'
scan "Private key block" '-----BEGIN ([A-Z]+ )?PRIVATE KEY-----'
# generic assignments: api_key/apikey/secret/token/password = "literal" (ignores env lookups & empty/placeholder values)
scan "Generic secret assignment" '(?i)\b[a-z0-9_]*(api[_-]?key|secret|token|passwd|password)[a-z0-9_]*\b["'"'"']?\s*[:=]\s*["'"'"'][A-Za-z0-9_\-\.+/=]{16,}["'"'"']' '-P'
scan "GEMINI_API_KEY with a value" '^\s*(export\s+)?GEMINI_API_KEY\s*=\s*\S+' '-P'
# .env files present (anything named .env or .env.* except .env.example/.env.sample/.env.template)
ENVF=$(find . -path ./node_modules -prune -o -path ./.git -prune -o -type f \( -name '.env' -o -name '.env.*' \) -print 2>/dev/null | grep -Ev '\.env\.(example|sample|template)$')
if [ -n "$ENVF" ]; then FOUND=1; echo "FAIL [.env file present]"; echo "$ENVF" | sed 's/^/   /'; else echo "PASS [.env file present]"; fi
# git-tracked checks (only if a repo)
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  T=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -Ev '\.env\.(example|sample|template)$')
  if [ -n "$T" ]; then FOUND=1; echo "FAIL [.env tracked by git]"; echo "$T" | sed 's/^/   /'; else echo "PASS [.env tracked by git]"; fi
  if git check-ignore -q .env; then echo "PASS [.env is gitignored]"; else FOUND=1; echo "FAIL [.env is gitignored]"; fi
  G=$(git grep -n "AI""za" -- . ":!*qa_secret_scan.sh" ":!scripts/secret-scan.sh" 2>/dev/null); if [ -n "$G" ]; then FOUND=1; echo "FAIL [git grep Google-key prefix (spec check)]"; echo "$G" | mask | sed 's/^/   /'; else echo "PASS [git grep Google-key prefix (spec check)]"; fi
  H=$(git log -p --all 2>/dev/null | grep -cE 'AI[z]a[0-9A-Za-z_-]{35}'); if [ "${H:-0}" -gt 0 ]; then FOUND=1; echo "FAIL [Google key in git history: $H hits]"; else echo "PASS [Google key in git history]"; fi
else
  echo "SKIP [git checks: not a git repo]"
fi
[ $FOUND -eq 0 ] && { echo "RESULT: CLEAN"; exit 0; } || { echo "RESULT: FINDINGS — do not push"; exit 1; }
