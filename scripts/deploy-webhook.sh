#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ENV_FILE="$ROOT_DIR/.env.local"
SERVICE_ENV_FILE="$ROOT_DIR/services/official-account-webhook/.env.local"
ENV_ID_OVERRIDE=""
SERVICE_NAME="official-account-webhook"
PORT_VALUE="3000"
SOURCE_DIR="$ROOT_DIR/services/official-account-webhook"
DRY_RUN="false"

usage() {
  cat <<EOF
Usage:
  bash ./scripts/deploy-webhook.sh [options]

Options:
  --env-file <path>         Load project-level env variables from a custom env file.
  --service-env-file <path> Load webhook service env variables from a custom env file.
  --env-id <envId>          Override ENV_ID / CLOUDBASE_ENV_ID from env files.
  --service-name <name>     Override cloud run service name. Default: official-account-webhook
  --port <port>             Override exposed port. Default: 3000
  --source <dir>            Override deploy source directory.
  --dry-run                 Print deploy command without executing it.
  -h, --help                Show this help message.

Examples:
  bash ./scripts/deploy-webhook.sh
  bash ./scripts/deploy-webhook.sh --dry-run
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      PROJECT_ENV_FILE="$2"
      shift 2
      ;;
    --service-env-file)
      SERVICE_ENV_FILE="$2"
      shift 2
      ;;
    --env-id)
      ENV_ID_OVERRIDE="$2"
      shift 2
      ;;
    --service-name)
      SERVICE_NAME="$2"
      shift 2
      ;;
    --port)
      PORT_VALUE="$2"
      shift 2
      ;;
    --source)
      SOURCE_DIR="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$DRY_RUN" != "true" ]] && ! command -v tcb >/dev/null 2>&1; then
  echo "Error: tcb CLI is not installed or not in PATH." >&2
  exit 1
fi

if [[ -f "$PROJECT_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$PROJECT_ENV_FILE"
  set +a
fi

if [[ -f "$SERVICE_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$SERVICE_ENV_FILE"
  set +a
fi

ENV_ID_VALUE="${ENV_ID_OVERRIDE:-${ENV_ID:-${CLOUDBASE_ENV_ID:-}}}"

if [[ -z "$ENV_ID_VALUE" ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    ENV_ID_VALUE="<ENV_ID>"
  else
    echo "Error: ENV_ID / CLOUDBASE_ENV_ID is required." >&2
    exit 1
  fi
fi

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Error: webhook source directory not found: $SOURCE_DIR" >&2
  exit 1
fi

REQUIRED_VARS=(
  "WECHAT_OFFICIAL_ACCOUNT_TOKEN"
  "WECHAT_OFFICIAL_ACCOUNT_APP_ID"
  "WECHAT_OFFICIAL_ACCOUNT_ENCODING_AES_KEY"
)

MISSING_VARS=()
for var_name in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    MISSING_VARS+=("$var_name")
  fi
done

echo "Project root: $ROOT_DIR"
echo "Webhook source: $SOURCE_DIR"
echo "CloudBase env: $ENV_ID_VALUE"
echo "Service name: $SERVICE_NAME"
echo "Port: $PORT_VALUE"

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
  echo "Warning: missing local webhook env vars: ${MISSING_VARS[*]}"
  echo "Warning: make sure these are already configured in CloudBase cloud run before going live."
fi

echo

CMD=(
  tcb cloudrun deploy
  -e "$ENV_ID_VALUE"
  -s "$SERVICE_NAME"
  --port "$PORT_VALUE"
  --source "$SOURCE_DIR"
  --force
)

echo "${CMD[*]}"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[dry-run] skipped"
  echo "Webhook deploy dry run completed."
  exit 0
fi

(
  cd "$ROOT_DIR"
  "${CMD[@]}"
)

echo "Webhook deploy completed."
