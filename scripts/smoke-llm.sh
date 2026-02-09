#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE_URL:-http://127.0.0.1:3001}"
ADMIN_PASSWORD_VALUE="${ADMIN_PASSWORD:-}"
COOKIE_JAR="$(mktemp -t script-seance-cookie.XXXXXX)"
trap 'rm -f "$COOKIE_JAR" /tmp/script-seance-llm-response.json /tmp/script-seance-login.json' EXIT

if [ -z "$ADMIN_PASSWORD_VALUE" ]; then
  echo "ADMIN_PASSWORD env var is required for smoke test."
  echo "Example: ADMIN_PASSWORD=your_password bash scripts/smoke-llm.sh"
  exit 1
fi

echo "Checking API server at ${API_BASE} ..."
API_CHECK_CODE=$(curl -sS -o /dev/null -w "%{http_code}" "${API_BASE}/api/auth/session" || true)
if [ "$API_CHECK_CODE" = "000" ]; then
  echo "API server is not reachable at ${API_BASE}."
  echo "Start it with: pnpm run server"
  echo "Or run both app + api with: pnpm start"
  exit 1
fi

echo "Logging in to ${API_BASE}/api/auth/login ..."
LOGIN_CODE=$(curl -sS -o /tmp/script-seance-login.json -w "%{http_code}" \
  -X POST "${API_BASE}/api/auth/login" \
  -H "Content-Type: application/json" \
  -c "$COOKIE_JAR" \
  -d "{\"password\":\"${ADMIN_PASSWORD_VALUE}\"}")

if [ "$LOGIN_CODE" != "200" ]; then
  echo "Login failed (HTTP $LOGIN_CODE)."
  cat /tmp/script-seance-login.json
  exit 1
fi

echo "Calling ${API_BASE}/api/llm/generate ..."
GEN_CODE=$(curl -sS -o /tmp/script-seance-llm-response.json -w "%{http_code}" \
  -X POST "${API_BASE}/api/llm/generate" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_JAR" \
  -d @- <<'JSON'
{
  "action": { "type": "continue", "instruction": "Write 4 short screenplay lines continuing the moment." },
  "scriptState": {
    "title": "Smoke Test",
    "characters": [{ "name": "ALEX", "goals": "Find the signal" }],
    "style": { "genre": "Sci-Fi", "tone": "tense" },
    "plotThreads": [{ "id": "t1", "description": "The transmitter is unstable", "status": "active" }],
    "canonFacts": [{ "fact": "The station is losing power" }],
    "totalScenes": 1
  },
  "blocks": [
    { "id": "b1", "type": "scene-heading", "content": "INT. CONTROL ROOM - NIGHT" },
    { "id": "b2", "type": "action", "content": "ALEX stares at the flickering monitor." }
  ],
  "callbackNotes": ["Keep urgency high"]
}
JSON
)

if [ "$GEN_CODE" != "200" ]; then
  echo "LLM generate failed (HTTP $GEN_CODE)."
  cat /tmp/script-seance-llm-response.json
  exit 1
fi

node -e '
const fs = require("fs");
const p = "/tmp/script-seance-llm-response.json";
const raw = fs.readFileSync(p, "utf8");
const parsed = JSON.parse(raw);
if (!parsed || typeof parsed.text !== "string") {
  console.error("Invalid response contract:", raw);
  process.exit(1);
}
console.log("Smoke test passed. finishReason=", parsed.finishReason, " chars=", parsed.text.length);
'

echo "--- Response preview ---"
head -c 500 /tmp/script-seance-llm-response.json
echo
