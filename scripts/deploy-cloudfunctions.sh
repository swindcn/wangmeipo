#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"
ENV_ID_OVERRIDE=""
DRY_RUN="false"

FUNCTIONS=(
  "bootstrapDatabase"
  "getDashboardSummary"
  "getCandidateDetail"
  "generateShareCode"
  "listReviewQueue"
  "getPermissionData"
  "grantCandidatePermission"
  "getMatchData"
  "recordMatch"
  "listMyAccess"
  "createShareToken"
  "manageAccount"
  "manageAdminSettings"
  "manageCandidateTags"
  "upsertCurrentUser"
  "askMatchmaker"
  "submitCandidateProfile"
  "parseCandidateText"
  "ingestOfficialAccountMessage"
  "runParsePipeline"
  "drainParseQueue"
  "reviewParsedCandidate"
)

usage() {
  cat <<EOF
Usage:
  bash ./scripts/deploy-cloudfunctions.sh [options] [functionName...]

Options:
  --env-file <path>   Load environment variables from a custom env file.
  --env-id <envId>    Override ENV_ID from the env file.
  --dry-run           Print deploy commands without executing them.
  -h, --help          Show this help message.

Examples:
  bash ./scripts/deploy-cloudfunctions.sh
  bash ./scripts/deploy-cloudfunctions.sh --dry-run
  bash ./scripts/deploy-cloudfunctions.sh runParsePipeline drainParseQueue
EOF
}

POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --env-id)
      ENV_ID_OVERRIDE="$2"
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
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

if [[ ${#POSITIONAL[@]} -gt 0 ]]; then
  FUNCTIONS=("${POSITIONAL[@]}")
fi

if [[ "$DRY_RUN" != "true" ]] && ! command -v tcb >/dev/null 2>&1; then
  echo "Error: tcb CLI is not installed or not in PATH." >&2
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

ENV_ID_VALUE="${ENV_ID_OVERRIDE:-${ENV_ID:-}}"

if [[ -z "$ENV_ID_VALUE" ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    ENV_ID_VALUE="<ENV_ID>"
  else
    echo "Error: ENV_ID is required. Set it in .env.local or pass --env-id." >&2
    exit 1
  fi
fi

for fn_name in "${FUNCTIONS[@]}"; do
  if [[ ! -d "$ROOT_DIR/cloudfunctions/$fn_name" ]]; then
    echo "Error: cloud function directory not found: $ROOT_DIR/cloudfunctions/$fn_name" >&2
    exit 1
  fi
done

echo "Project root: $ROOT_DIR"
echo "CloudBase env: $ENV_ID_VALUE"
echo "Functions to deploy: ${FUNCTIONS[*]}"
echo

for fn_name in "${FUNCTIONS[@]}"; do
  CMD=(tcb fn deploy "$fn_name" --force --yes -e "$ENV_ID_VALUE")
  echo "==> Deploying $fn_name"
  echo "${CMD[*]}"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[dry-run] skipped"
  else
    (
      cd "$ROOT_DIR"
      "${CMD[@]}"
    )
  fi

  echo
done

if [[ "$DRY_RUN" == "true" ]]; then
  echo "Dry run completed."
else
  echo "Cloud function deployment completed."
fi
