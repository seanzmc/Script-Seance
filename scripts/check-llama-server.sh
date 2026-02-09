#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${LOCAL_LLM_BASE_URL:-http://127.0.0.1:8080}"

echo "Checking local LLM server at ${BASE_URL}/v1/models ..."

HTTP_CODE=$(curl -sS -o /tmp/script-seance-llm-models.json -w "%{http_code}" "${BASE_URL}/v1/models" || true)
if [ "$HTTP_CODE" != "200" ]; then
  echo "Local LLM server check failed (HTTP $HTTP_CODE)."
  echo "Start server with: bash scripts/start-llama-server.sh"
  exit 1
fi

echo "Local LLM server is reachable."
cat /tmp/script-seance-llm-models.json
