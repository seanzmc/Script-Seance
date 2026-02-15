#!/usr/bin/env bash
set -euo pipefail

MODEL="${LLAMA_MODEL_PATH:-./models/qwen2.5-32b-instruct-q4_k_m.gguf}"
PORT="${LLAMA_PORT:-8080}"
CTX="${LLAMA_CTX:-32768}"
GPU="${LLAMA_GPU_LAYERS:-99}"
FLASH_ATTN="${LLAMA_FLASH_ATTN:-auto}"

if ! command -v llama-server &>/dev/null; then
  echo "llama-server not found."
  echo "Install with: brew install llama.cpp"
  exit 1
fi

if [ ! -f "$MODEL" ]; then
  echo "Model file not found: $MODEL"
  echo "Run: bash scripts/download-model.sh"
  exit 1
fi

echo "--- llama.cpp server ---"
echo "Model: $MODEL"
echo "Port : $PORT"
echo "Ctx  : $CTX"
echo "GPU  : $GPU layers"
echo "FA   : $FLASH_ATTN"

exec llama-server \
  --model "$MODEL" \
  --port "$PORT" \
  --ctx-size "$CTX" \
  --n-gpu-layers "$GPU" \
  --threads 8 \
  --parallel 1 \
  --cont-batching \
  --flash-attn "$FLASH_ATTN"
