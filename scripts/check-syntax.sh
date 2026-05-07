#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is not installed or not in PATH." >&2
  exit 1
fi

FAILED=0
JS_COUNT=0
JSON_COUNT=0
SH_COUNT=0

check_js() {
  local file="$1"
  JS_COUNT=$((JS_COUNT + 1))
  if node -c "$file" >/dev/null 2>&1; then
    echo "[ok] js   $file"
  else
    echo "[fail] js   $file" >&2
    FAILED=1
  fi
}

check_json() {
  local file="$1"
  JSON_COUNT=$((JSON_COUNT + 1))
  if node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' "$file" >/dev/null 2>&1; then
    echo "[ok] json $file"
  else
    echo "[fail] json $file" >&2
    FAILED=1
  fi
}

check_shell() {
  local file="$1"
  SH_COUNT=$((SH_COUNT + 1))
  if bash -n "$file" >/dev/null 2>&1; then
    echo "[ok] sh   $file"
  else
    echo "[fail] sh   $file" >&2
    FAILED=1
  fi
}

while IFS= read -r file; do
  check_js "$file"
done < <(
  find \
    "$ROOT_DIR/miniprogram" \
    "$ROOT_DIR/cloudfunctions" \
    "$ROOT_DIR/services/official-account-webhook" \
    -path '*/node_modules/*' -prune -o \
    -type f -name '*.js' -print | sort
)

while IFS= read -r file; do
  check_json "$file"
done < <(
  find \
    "$ROOT_DIR" \
    -path '*/node_modules/*' -prune -o \
    -path '*/miniprogram_npm/*' -prune -o \
    -type f \
    \( \
      -name '*.json' \
      ! -name 'package-lock.json' \
    \) \
    -print | sort
)

while IFS= read -r file; do
  check_shell "$file"
done < <(
  find "$ROOT_DIR/scripts" -type f -name '*.sh' -print | sort
)

echo
echo "Checked $JS_COUNT JavaScript files, $JSON_COUNT JSON files, $SH_COUNT shell scripts."

if [[ "$FAILED" -ne 0 ]]; then
  exit 1
fi

echo "Syntax check passed."
