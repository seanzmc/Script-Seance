# Script Seance Orchestration Spec

## 0) Purpose

Define a single orchestration contract for all frontend-triggered LLM and TTS operations so commits are revision-safe, cancellation is deterministic, and stale responses never mutate state.

---

## 1) Operation Types + `scopeKey` Formats

### LLM operations

| Operation type         | `scopeKey` format                                           |
| ---------------------- | ----------------------------------------------------------- |
| `titleSuggestion`      | `script:{scriptId}:title`                                   |
| `generateOpeningScene` | `script:{scriptId}:scene:opening`                           |
| `generateNextScene`    | `script:{scriptId}:scene:next`                              |
| `suggestPlotTwist`     | `script:{scriptId}:twist`                                   |
| `rewriteBlock`         | `script:{scriptId}:scene:{sceneId}:block:{blockId}:rewrite` |
| `insertSurpriseText`   | `script:{scriptId}:insert:composer`                         |
| `setupSurprise`        | `setup:{setupSessionId}:surprise`                           |
| `setupAutoSurprise`    | `setup:{setupSessionId}:auto-surprise`                      |

### TTS operations

| Operation type        | `scopeKey` format                                        |
| --------------------- | -------------------------------------------------------- |
| `ttsPlaybackPrefetch` | `script:{scriptId}:tts:playback`                         |
| `ttsPlaybackRefresh`  | `script:{scriptId}:tts:playback:refresh`                 |
| `ttsPreviewModal`     | `script:{scriptId}:tts:preview:modal:{characterOrVoice}` |
| `ttsPreviewPanel`     | `script:{scriptId}:tts:preview:panel:{characterOrVoice}` |
| `ttsBlockRetry`       | `script:{scriptId}:tts:block:{blockId}:retry`            |

Notes:

- `scriptId` is stable per loaded draft/session.
- `setupSessionId` resets when setup is re-opened/reset.
- For “latest wins”, contention is by identical `scopeKey`.

---

## 2) Required Revisions

| Revision                | Definition                                | Increments when                                                                                                 |
| ----------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `blockRevision`         | Monotonic per block (`blockId`)           | block text changes, speaker changes, lock/unlock if it affects generation policy, block replace/regenerate      |
| `promptContextRevision` | Monotonic per script/setup prompt context | title/genre/premise/characters/style/targetLength changes, scene list changes that alter prompt context         |
| `voiceContextRevision`  | Monotonic per script voice context        | voice assignment changes, expressive toggle changes, playback speed/pitch policy changes if generation-relevant |

Rules:

- Revisions must be captured in the operation receipt at **start**.
- Commit is allowed only if receipt revisions are still current for required dimensions.
- Missing revision dependencies are a bug (must be explicit per op).

---

## 3) Per-Operation Contract

### Common receipt fields (captured at start)

- `opId` (uuid)
- `opType`
- `scopeKey`
- `startedAt`
- `trigger` (`user` | `system`)
- `blockRevision?`
- `promptContextRevision?`
- `voiceContextRevision?`
- `abortController`
- `status` (`started|aborted|resolved|committed|dropped`)

### LLM operations

| Op type                | Receipt revision snapshot                                             | Commit gating rules                                                                                        | Cancellation behavior                                                        |
| ---------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `titleSuggestion`      | `promptContextRevision`                                               | Commit only if op is latest for scope and prompt revision unchanged; if manual title set after start, drop | Latest wins in `script:{id}:title`; prior op aborted silently                |
| `generateOpeningScene` | `promptContextRevision`                                               | Commit only if latest and prompt revision unchanged and script still empty/opening-eligible                | Latest wins for opening scope; abort old request, no user-facing abort error |
| `generateNextScene`    | `promptContextRevision`                                               | Commit only if latest and prompt revision unchanged; append must re-check active script identity           | Latest wins for next-scene scope                                             |
| `suggestPlotTwist`     | `promptContextRevision` (optional strict)                             | Commit only if latest and instruction target still current                                                 | Latest wins for twist scope                                                  |
| `rewriteBlock`         | `blockRevision`, `promptContextRevision`                              | Commit only if latest and target block still exists and `blockRevision` unchanged                          | Latest wins per block rewrite scope                                          |
| `insertSurpriseText`   | `promptContextRevision`                                               | Commit only if latest and insert composer still active                                                     | Latest wins for insert composer scope                                        |
| `setupSurprise`        | setup-local revision baseline (or `promptContextRevision` equivalent) | Commit only if setup session unchanged and form still active                                               | Latest wins for setup surprise scope                                         |
| `setupAutoSurprise`    | same as `setupSurprise`                                               | Same gating; auto-run should not override newer manual edits                                               | Auto op canceled/dropped on any manual conflicting setup op                  |

### TTS operations

| Op type               | Receipt revision snapshot                                                       | Commit gating rules                                                                                   | Cancellation behavior                                               |
| --------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `ttsPlaybackPrefetch` | `voiceContextRevision` + per-block `blockRevision` map                          | Accept chunk only if playback run still active, block still expected, block/voice revisions unchanged | Starting new playback aborts prior run and inflight synth silently  |
| `ttsPlaybackRefresh`  | `voiceContextRevision` + per-block `blockRevision` map                          | Same as prefetch, but force cache-bypass/read-through                                                 | Supersedes prefetch scope immediately                               |
| `ttsPreviewModal`     | `voiceContextRevision` (+ optional target block revision if sample from script) | Commit/play only if preview scope still current and preview target unchanged                          | New preview request cancels prior preview; abort is non-user-facing |
| `ttsPreviewPanel`     | same as modal                                                                   | same as modal                                                                                         | same as modal                                                       |
| `ttsBlockRetry`       | target `blockRevision` + `voiceContextRevision`                                 | Commit only if same block still current and still in error/retryable state                            | Latest wins per block retry scope                                   |

Global cancellation policy:

- `AbortError` / orchestrator-aborted requests are treated as expected control flow.
- No toast/error banner for orchestrator-initiated abort.
- Only non-abort failures surface as user errors.

---

## 4) Canonical TTS Cache Key

Canonical fields (ordered):

1. `ttsSchemaVersion`
2. `provider` (e.g. `inworld`)
3. `modelId`
4. `audioEncoding`
5. `sampleRateHz`
6. `voiceId`
7. `expressive` (boolean)
8. `normalizedTextHash` (SHA-256 of normalized text)
9. `blockId` (or `preview`)
10. `blockRevision` (for block-bound audio)
11. `voiceContextRevision` (optional if generation parameters outside key can vary output)

Key format example:
`tts:v3:{provider}:{modelId}:{encoding}:{sampleRate}:{voiceId}:{expressive}:{textHash}:{blockOrPreview}:{blockRev}:{voiceRev}`

Notes:

- Keep client-side-only transforms (`playbackSpeed`, `pitch`) **out** of key if not generation-affecting.
- If provider output changes with extra knobs later, add them and bump `ttsSchemaVersion`.

---

## 5) Migration Checklist (Catalog -> Orchestrator)

### Route through orchestrator

- `App.tsx` `requestTitleSuggestion` -> `orchestrator.runText('titleSuggestion', ...)`
- `App.tsx` `handleStart` -> `runText('generateOpeningScene', ...)`
- `App.tsx` `handleGenerateNext` -> `runText('generateNextScene', ...)`
- `App.tsx` `handleTwist` -> `runText('suggestPlotTwist', ...)`
- `App.tsx` `handleRegenerateBlock` -> `runText('rewriteBlock', ...)`
- `components/InsertBlock.tsx` surprise -> `runText('insertSurpriseText', ...)`
- `components/SetupForm.tsx` surprise + auto-surprise -> `runText('setupSurprise'|'setupAutoSurprise', ...)`
- `hooks/useAudioPlayer.ts` `playScript`/`onRefreshAudio` -> `runTts('ttsPlaybackPrefetch'|'ttsPlaybackRefresh', ...)`
- `hooks/useAudioPlayer.ts` preview flows -> `runTts('ttsPreviewModal'|'ttsPreviewPanel', ...)`
- `hooks/useAudioPlayer.ts` `retryCurrentBlock` -> `runTts('ttsBlockRetry', ...)`

### Explicit exemptions

- Server route dispatch internals (`server/index.js` `handleAiGenerate`) are backend transport, not frontend orchestration scope.
- `services/scriptEngine.ts` private `fetchAudio` remains execution leaf, but must consume orchestrator-issued receipt metadata and obey gating/cancel contracts.

### Exit criteria

- No direct UI call sites invoke `services/ai.ts` generation APIs without orchestrator.
- Every commit path checks receipt freshness + required revisions.
- Abort paths do not show user-facing errors.
- TTS cache keys include revision-safe fields and schema versioning.
