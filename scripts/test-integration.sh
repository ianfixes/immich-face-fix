#!/bin/sh

set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <artifacts-dir>" >&2
  exit 1
fi

ARTIFACTS_DIR="$1"

if [ ! -d "$ARTIFACTS_DIR" ]; then
  echo "Error: artifacts directory does not exist: $ARTIFACTS_DIR" >&2
  exit 1
fi

if [ ! -w "$ARTIFACTS_DIR" ]; then
  echo "Error: artifacts directory is not writable: $ARTIFACTS_DIR" >&2
  exit 1
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
ARTIFACTS_DIR="$(CDPATH= cd -- "$ARTIFACTS_DIR" && pwd)"
HOST_UID="$(id -u)"
HOST_GID="$(id -g)"

set +e

COMPOSE_MENU=false ARTIFACTS_DIR="$ARTIFACTS_DIR" docker compose \
  -f "$REPO_ROOT/docker-compose.test.yml" \
  up \
  --build \
  --abort-on-container-exit \
  --exit-code-from test-runner \
  --remove-orphans
EXIT_CODE=$?
docker run --rm \
  -v "$ARTIFACTS_DIR:/artifacts" \
  alpine:3.20 \
  chown -R "$HOST_UID:$HOST_GID" /artifacts
echo "docker compose exited with code: $EXIT_CODE"
exit $EXIT_CODE
