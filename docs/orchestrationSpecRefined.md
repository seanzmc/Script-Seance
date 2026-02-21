# Script Seance Orchestration Spec (Refined)

## 0) Purpose

Define a single orchestration contract for all frontend-triggered LLM and TTS operations so that:

- stale responses never commit,
- cancellation is deterministic (`latest wins`),
- aborts are control-flow events (not user-facing errors).

---

## 1) Operation Types and `scopeKey` Formats

### LLM operations

| Operation type         | `scopeKey`                                   |
| ---------------------- | -------------------------------------------- |
| `titleSuggestion`      | `script:{scriptId}:title`                    |
| `generateOpeningScene` | `script:{scriptId}:scene:opening`            |
| `generateNextScene`    | `script:{scriptId}:scene:next`               |
| `suggestPlotTwist`     | `script:{scriptId}:twist`                    |
| `rewriteBlock`         | `script:{scriptId}:block:{blockId}:rewrite`  |
| `insertSurpriseText`   | `script:{scriptId}:insert:{anchorIdOrIndex}` |
| `setupSurprise`        | `setup:{setupSessionId}:surprise`            |
| `setupAutoSurprise`    | `setup:{setupSessionId}:auto-surprise`       |

### TTS operations

| Operation type        | `scopeKey`                                             |
| --------------------- | ------------------------------------------------------ |
| `ttsPlaybackPrefetch` | `script:{scriptId}:tts:playback`                       |
| `ttsPlaybackRefresh`  | `script:{scriptId}:tts:playback:refresh`               |
| `ttsPreview`          | `script:{scriptId}:tts:preview:{voiceIdOrCharacterId}` |
| `ttsBlockRetry`       | `script:{scriptId}:block:{blockId}:tts-retry`          |

### Anchor definition (`anchorIdOrIndex`)

`anchorIdOrIndex` is the insertion anchor identity for `insertSurpriseText`:

- Use stable anchor IDs when available (existing block ID, or insertion sentinels such as top/bottom markers).
- If no stable ID exists, use deterministic insertion index (0-based) derived from the script snapshot at operation start.
- Commit gating must verify the anchor still resolves to the intended insertion point semantics before applying.

---

## 2) Required Revisions

| Revision                | Meaning                                        | Increments when                                                                                                                       |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `blockRevision`         | Monotonic revision per `blockId`               | block text/speaker changes, block replacement/regeneration, or any mutation that changes generated-audio/text validity for that block |
| `promptContextRevision` | Monotonic script/setup prompt-context revision | title/genre/premise/characters/style/targetLength/scenes changes that affect prompt construction                                      |
| `voiceContextRevision`  | Monotonic voice-generation context revision    | voice assignment changes, expressive toggle changes, or any generation-relevant TTS context change                                    |

Additional guard for setup auto-generation:

- `setupManualEditRevision` (monotonic within setup session): increments on any user-authored setup edit.

---

## 3) Orchestration Contract

## 3.1 Common receipt fields (captured at start)

- `opId`
- `opType`
- `scopeKey`
- `startedAt`
- `trigger` (`user` or `system`)
- `scriptId` or `setupSessionId`
- `blockRevision?`
- `promptContextRevision?`
- `voiceContextRevision?`
- `setupManualEditRevision?`
- `playbackRunId?` (required for playback TTS operations)
- `anchorIdOrIndex?` (required for insert operations)
- `abortController`
- `status` (`started|aborted|resolved|committed|dropped`)

## 3.2 LLM per-operation rules

| Operation              | Receipt snapshot                                   | Commit gating                                                                                               | Cancellation                                                     |
| ---------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `titleSuggestion`      | `promptContextRevision`                            | commit only if latest in scope and prompt revision unchanged; drop if manual title change superseded result | latest wins within `script:{id}:title`                           |
| `generateOpeningScene` | `promptContextRevision`                            | commit only if latest and opening preconditions still valid                                                 | latest wins in opening scope                                     |
| `generateNextScene`    | `promptContextRevision`                            | commit only if latest and prompt revision unchanged                                                         | latest wins in next-scene scope                                  |
| `suggestPlotTwist`     | `promptContextRevision`                            | commit only if latest and instruction target unchanged                                                      | latest wins in twist scope                                       |
| `rewriteBlock`         | `blockRevision`, `promptContextRevision`           | commit only if latest and target block exists and `blockRevision` unchanged                                 | latest wins in `script:{id}:block:{blockId}:rewrite`             |
| `insertSurpriseText`   | `promptContextRevision`, `anchorIdOrIndex`         | commit only if latest for the same anchor, prompt revision unchanged, and anchor still resolves             | latest wins in `script:{id}:insert:{anchor}`                     |
| `setupSurprise`        | setup session identity                             | commit only if setup session unchanged                                                                      | latest wins in setup-surprise scope                              |
| `setupAutoSurprise`    | setup session identity + `setupManualEditRevision` | commit only if setup session unchanged and `setupManualEditRevision` unchanged since start                  | latest wins in auto-surprise scope; silently drop on manual edit |

### Manual edit protection for `setupAutoSurprise`

If any manual setup edit occurs after auto-surprise starts, the auto-surprise result must be dropped (or preemptively aborted). Manual user intent always overrides system-generated auto-surprise.

## 3.3 TTS per-operation rules

| Operation             | Receipt snapshot                                                                                   | Commit gating                                                                                                                           | Cancellation                                             |
| --------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `ttsPlaybackPrefetch` | `playbackRunId`, `voiceContextRevision`, per-target `blockRevision` snapshot                       | accept chunk only if current playback run matches `playbackRunId`, voice context unchanged, and block revision for that block unchanged | new playback run aborts prior run; abort not user-facing |
| `ttsPlaybackRefresh`  | same as prefetch                                                                                   | same as prefetch; refresh semantics bypass/rebuild reusable playback set                                                                | refresh supersedes prior playback synth scope            |
| `ttsPreview`          | `voiceContextRevision` (plus optional text/input fingerprint metadata)                             | commit/play only if preview request is latest for its preview scope and voice context unchanged                                         | latest wins per preview scope; abort not user-facing     |
| `ttsBlockRetry`       | target `blockRevision`, `voiceContextRevision`, `playbackRunId?` (if retry during active playback) | commit only if target block still exists, block revision unchanged, and retry target still retryable                                    | latest wins in `script:{id}:block:{blockId}:tts-retry`   |

Global rule:

- `AbortError`/orchestrator-canceled operations are expected control flow and must not surface as user-visible failure toasts/banners.

---

## 4) Canonical TTS Cache Keys

## 4.1 Block audio cache key

Use block revision as freshness identity (no text hash).

Fields:

1. `ttsSchemaVersion`
2. `provider`
3. `modelId`
4. `audioEncoding`
5. `sampleRateHz`
6. `voiceId`
7. `expressive`
8. `blockId`
9. `blockRevision`

Canonical format:
`tts:v{schema}:{provider}:{model}:{encoding}:{rate}:{voiceId}:{expressive}:{blockId}:{blockRevision}`

## 4.2 Preview audio cache key

Use normalized text hash (preview is not block-bound).

Fields:

1. `ttsSchemaVersion`
2. `provider`
3. `modelId`
4. `audioEncoding`
5. `sampleRateHz`
6. `voiceId`
7. `expressive`
8. `normalizedTextHash`

Canonical format:
`tts:v{schema}:{provider}:{model}:{encoding}:{rate}:{voiceId}:{expressive}:{textHash}`

---

## 5) Coverage Statement

This spec governs all cataloged frontend-triggered generation operations (LLM + TTS), including:

- title, scene generation, twist, rewrite, insert surprise, setup surprise/auto-surprise,
- playback synthesis, refresh synthesis, preview synthesis, and per-block retry synthesis.

Backend dispatch (`/api/ai/generate`) remains transport/execution boundary; frontend orchestration controls start receipts, latest-wins cancellation, and commit gating decisions.
