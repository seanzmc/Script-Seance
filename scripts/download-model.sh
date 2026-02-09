#!/usr/bin/env bash
set -euo pipefail

REPO="${LLAMA_HF_REPO:-bartowski/Meta-Llama-3.1-8B-Instruct-GGUF}"
FILE="${LLAMA_HF_FILE:-Meta-Llama-3.1-8B-Instruct-Q5_K_M.gguf}"
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
