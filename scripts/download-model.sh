#!/usr/bin/env bash
set -euo pipefail

REPO="${LLAMA_HF_REPO:-bartowski/Qwen2.5-32B-Instruct-GGUF}"
FILE="${LLAMA_HF_FILE:-Qwen2.5-32B-Instruct-Q4_K_M.gguf}"
DEST="./models"

mkdir -p "$DEST"

echo "Downloading $FILE from $REPO to $DEST/"
if ! command -v hf &>/dev/null; then
  echo "hf CLI not found."
  echo "Install with: pip install \"huggingface-hub[cli]\""
  exit 1
fi

hf download "$REPO" "$FILE" --local-dir "$DEST"

echo "Done. Model path: $DEST/$FILE"
