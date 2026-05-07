#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN="false"
SKIP_SYNTAX="false"
FUNCTION_ARGS=()
WEBHOOK_ARGS=()

usage() {
  cat <<EOF
Usage:
  bash ./scripts/predeploy.sh [options]

Options:
  --dry-run             Print all commands without executing deploy steps.
  --skip-syntax         Skip syntax check stage.
  --functions-only      Run syntax check + cloud function deploy only.
  --webhook-only        Run syntax check + webhook deploy only.
  --env-file <path>     Forwarded to both deploy scripts.
  --service-env-file <path>
                        Forwarded to webhook deploy script only.
  --env-id <envId>      Forwarded to both deploy scripts.
  --service-name <name> Forwarded to webhook deploy script only.
  --port <port>         Forwarded to webhook deploy script only.
  -h, --help            Show this help message.

Examples:
  bash ./scripts/predeploy.sh
  bash ./scripts/predeploy.sh --dry-run
  bash ./scripts/predeploy.sh --env-id prod-123456
EOF
}

RUN_FUNCTIONS="true"
RUN_WEBHOOK="true"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --skip-syntax)
      SKIP_SYNTAX="true"
      shift
      ;;
    --functions-only)
      RUN_FUNCTIONS="true"
      RUN_WEBHOOK="false"
      shift
      ;;
    --webhook-only)
      RUN_FUNCTIONS="false"
      RUN_WEBHOOK="true"
      shift
      ;;
    --env-file|--env-id)
      FUNCTION_ARGS+=("$1" "$2")
      WEBHOOK_ARGS+=("$1" "$2")
      shift 2
      ;;
    --service-env-file|--service-name|--port)
      WEBHOOK_ARGS+=("$1" "$2")
      shift 2
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

if [[ "$DRY_RUN" == "true" ]]; then
  FUNCTION_ARGS+=("--dry-run")
  WEBHOOK_ARGS+=("--dry-run")
fi

echo "Predeploy root: $ROOT_DIR"
echo "Run syntax: $([[ "$SKIP_SYNTAX" == "true" ]] && echo no || echo yes)"
echo "Run cloud functions: $RUN_FUNCTIONS"
echo "Run webhook: $RUN_WEBHOOK"
echo

if [[ "$SKIP_SYNTAX" != "true" ]]; then
  echo "==> Syntax check"
  bash "$ROOT_DIR/scripts/check-syntax.sh"
  echo
fi

if [[ "$RUN_FUNCTIONS" == "true" ]]; then
  echo "==> Cloud functions"
  bash "$ROOT_DIR/scripts/deploy-cloudfunctions.sh" "${FUNCTION_ARGS[@]}"
  echo
fi

if [[ "$RUN_WEBHOOK" == "true" ]]; then
  echo "==> Official account webhook"
  bash "$ROOT_DIR/scripts/deploy-webhook.sh" "${WEBHOOK_ARGS[@]}"
  echo
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "Predeploy dry run completed."
else
  echo "Predeploy completed."
fi
