#!/usr/bin/env bash
set -euo pipefail

MODEL="${LLAMA_MODEL_PATH:-./models/Meta-Llama-3.1-8B-Instruct-Q5_K_M.gguf}"
PORT="${LLAMA_PORT:-8080}"
CTX="${LLAMA_CTX:-6144}"
GPU="${LLAMA_GPU_LAYERS:-99}"

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

exec llama-server \
  --model "$MODEL" \
  --port "$PORT" \
  --ctx-size "$CTX" \
  --n-gpu-layers "$GPU" \
  --threads 8 \
  --parallel 1 \
  --cont-batching \
  --flash-attn
