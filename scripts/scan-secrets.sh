#!/usr/bin/env bash
set -euo pipefail

# Simple staged-content secret scanner.
# Blocks commits/pushes if it finds likely credentials.

# Ensure we run from the repo root even if invoked from elsewhere.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -n "${ROOT:-}" ]]; then
  cd "$ROOT"
fi

# Files to skip (by path regex) even if staged.
SKIP_RE='(^node_modules/|^package-lock\.json$|^\.env\.example$)'

# Read staged file list (added/modified/copied/renamed).
mapfile -d '' FILES < <(git diff --cached --name-only -z --diff-filter=ACMR)

if [[ ${#FILES[@]} -eq 0 ]]; then
  exit 0
fi

# Regexes for common secret formats.
# Keep these relatively specific to reduce false positives.
PATTERNS=(
  'AKIA[0-9A-Z]{16}'
  'ASIA[0-9A-Z]{16}'
  'ghp_[A-Za-z0-9]{20,}'
  'github_pat_[A-Za-z0-9_]{20,}'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
  '-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY-----'
  'ssh-rsa [A-Za-z0-9+/]{100,}={0,3}'
  '[0-9]{8,10}:[A-Za-z0-9_-]{30,}' # Telegram bot token shape
  'sk-[A-Za-z0-9]{20,}'
  'AIza[0-9A-Za-z\-_]{30,}'
  '(?i)authorization:\s*bearer\s+[A-Za-z0-9._\-+/=]{20,}'
)

# Env-var style (only for common credential variable names).
# This avoids false positives from code/docs that merely mention "token" etc.
ENV_KEYS='(?i)(MOONSHOT_API_KEY|KIMI_CODE_API_KEY|KIMI_API_KEY|TELEGRAM_BOT_TOKEN|OPENAI_API_KEY|GITHUB_TOKEN|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|NPM_TOKEN)'
ENV_RE="${ENV_KEYS}[[:space:]]*=[[:space:]]*['\"]?[^#\r\n\s'\"]{12,}"

FOUND=0

for f in "${FILES[@]}"; do
  if [[ "$f" =~ $SKIP_RE ]]; then
    continue
  fi

  # Get staged content. If it's binary or missing, skip gracefully.
  if ! content=$(git show ":$f" 2>/dev/null); then
    continue
  fi

  for re in "${PATTERNS[@]}"; do
    if printf '%s' "$content" | grep -Pq -- "$re"; then
      echo "[secret-scan] Potential secret detected in staged file: $f" >&2
      FOUND=1
      break
    fi
  done

  if [[ $FOUND -eq 0 ]]; then
    if printf '%s' "$content" | grep -Pq -- "$ENV_RE"; then
      echo "[secret-scan] Suspicious key/value secret detected in staged file: $f" >&2
      FOUND=1
    fi
  fi

  if [[ $FOUND -ne 0 ]]; then
    # Don't spam; one file is enough to stop.
    break
  fi

done

if [[ $FOUND -ne 0 ]]; then
  cat >&2 <<'MSG'
[secret-scan] Commit/push blocked.
[secret-scan] Fix: remove the secret from the commit, or move it to .env (which is gitignored).
[secret-scan] If you already pushed a secret: rotate/revoke it immediately.
MSG
  exit 1
fi

exit 0
