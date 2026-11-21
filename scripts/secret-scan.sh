#!/usr/bin/env bash
# Pre-push secret scan (Engineering). Aborts (exit 1) on any match. Scans git-tracked + staged files only,
# so your local, gitignored .env never trips it. Wired as .githooks/pre-push and `npm run secret-scan`.
set -u
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
EXCL=(':!scripts/secret-scan.sh' ':!scripts/qa_secret_scan.sh')
FAIL=0
hit() { echo "SECRET-SCAN FAIL [$1]"; echo "$2" | sed -E 's/(A[I]za[0-9A-Za-z_-]{4})[0-9A-Za-z_-]+/\1****/g' | sed 's/^/   /'; FAIL=1; }
# 1) Spec check: git grep -n "$KP" (any mention aborts the push)
P1="AI""za"
# (docs/operations/qa-checklist.md only *describes* this check, so it is exempt from the plain-prefix match
#  but still covered by the full-key regex below.)
DOCX=(':!docs/operations/qa-checklist.md')
O=$(git grep -n --cached -e "$P1" -- . "${EXCL[@]}" "${DOCX[@]}" 2>/dev/null; git grep -n -e "$P1" -- . "${EXCL[@]}" "${DOCX[@]}" 2>/dev/null)
[ -n "$O" ] && hit "git grep A[I]za" "$(echo "$O" | sort -u)"
O=$(git grep -nE --cached -e "${P1}[0-9A-Za-z_-]{35}" -- . "${EXCL[@]}" 2>/dev/null)
[ -n "$O" ] && hit "Google API key pattern" "$O"
# 2) Generic key patterns
O=$(git grep -nIE -e '-----BEGIN ([A-Z]+ )?PRIVATE KEY-----' -e 'sk-[A-Za-z0-9]{32,}' -e 'ghp_[A-Za-z0-9]{30,}' -e 'xox[abp]-[A-Za-z0-9-]{20,}' -e 'AKIA[0-9A-Z]{16}' -- . "${EXCL[@]}" 2>/dev/null)
[ -n "$O" ] && hit "generic key pattern" "$O"
O=$(git grep -nIiP '(api[_-]?key|secret|token|password)["'"'"']?\s*[:=]\s*["'"'"'][A-Za-z0-9_\-\.+/=]{20,}["'"'"']' -- . "${EXCL[@]}" 2>/dev/null)
[ -n "$O" ] && hit "generic secret assignment" "$O"
O=$(git grep -nP '^\s*(export\s+)?GEMINI_API_KEY\s*=\s*\S+' -- . "${EXCL[@]}" 2>/dev/null)
[ -n "$O" ] && hit "GEMINI_API_KEY with a value in a tracked file" "$O"
# 3) .env must never be tracked, and must be ignored
T=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -Ev '\.env\.example$')
[ -n "$T" ] && hit ".env tracked by git" "$T"
git check-ignore -q .env || hit ".env not gitignored" ".gitignore must list .env"
# 4) No large media (>50 MB) tracked
B=$(git ls-files -z | xargs -0 -I{} sh -c 'f="{}"; [ -f "$f" ] && [ $(wc -c <"$f") -gt 52428800 ] && echo "$f"' 2>/dev/null)
[ -n "$B" ] && hit "file over 50 MB tracked" "$B"
if [ $FAIL -ne 0 ]; then echo "Push ABORTED by secret scan."; exit 1; fi
echo "secret-scan: PASS (no key patterns in tracked/staged files; .env ignored; no >50 MB files)"
