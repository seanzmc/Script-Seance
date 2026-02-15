#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

read_env_file_value() {
  local key="$1"
  local file="${2:-.env}"
  if [ ! -f "$file" ]; then
    return 1
  fi

  local line
  line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n1 || true)"
  if [ -z "$line" ]; then
    return 1
  fi

  line="${line#*=}"
  line="${line%%#*}"
  line="$(printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  printf '%s' "$line"
}

resolve_env() {
  local key="$1"
  local fallback="$2"
  local runtime="${!key-}"
  if [ -n "$runtime" ]; then
    printf '%s' "$runtime"
    return 0
  fi

  local from_file
  from_file="$(read_env_file_value "$key" .env || true)"
  if [ -n "$from_file" ]; then
    printf '%s' "$from_file"
    return 0
  fi

  printf '%s' "$fallback"
}

LLM_PROVIDER="$(resolve_env "LLM_PROVIDER" "local")"

if [ "$LLM_PROVIDER" = "gemini" ]; then
  echo "[start] LLM_PROVIDER=gemini; starting API server + client."
  exec concurrently -k -n server,client -c green,cyan \
    "pnpm run server" \
    "pnpm run dev"
fi

echo "[start] LLM_PROVIDER=${LLM_PROVIDER}; starting local LLM + API server + client."
exec concurrently -k -n llm,server,client -c magenta,green,cyan \
  "pnpm run llm:start-server" \
  "pnpm run server" \
  "pnpm run dev"
