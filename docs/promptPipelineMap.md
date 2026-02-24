# Prompt + Style Pipeline Map

This map covers server-side request handling for generation kinds:

- Text kinds: `generateScene`, `suggestPlotTwist`, `generateScriptElement`, `regenerateScriptBlock`, `generateSurpriseSetup`
- TTS kind: `generateSpeech`

## Entry Points

| Stage                                 | File                                         | Notes                                                                                        |
| ------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Kind validation + routing             | `server/index.js`                            | `POST /api/ai/generate` validates `kind` + `context`, then dispatches to text/TTS providers. |
| Text prompt construction              | `server/llm/promptBuilders.js`               | Static prompt templates and helper builders for each text kind.                              |
| Text model + token + schema execution | `server/llm/textGeneration.js`               | Per-kind model selection, max token budgets, OpenAI/Gemini request wiring, JSON parsing.     |
| Model defaults by kind                | `server/llm/llmClient.js`                    | Scene vs fast model defaults per provider.                                                   |
| TTS synthesis                         | `server/index.js` + `server/ttsProviders.js` | Inworld request payload assembly and audio extraction.                                       |

## `generateScene`

| Dimension                                 | Details                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt pieces: Instructions               | `buildGenerateScenePrompt` embeds explicit role/task (“professional screenwriter”), style requirements, length requirements, and strict JSON output instructions.                                                                                                                                                            |
| Prompt pieces: Dynamic Context            | `genre`, `premise`, `characters[]`, `storyContext.style`, `targetLength`, `userInstruction`, and all prior scene summaries (`storyContext.scenes[].summary`).                                                                                                                                                                |
| Current Style usage                       | Direct: `Style Theme: ${style}` line + explicit style requirements in prompt.                                                                                                                                                                                                                                                |
| Style SHOULD be injected                  | Keep current `Style Theme` injection and additionally mirror style in a dedicated “Do/Don’t” style rubric block for stronger consistency.                                                                                                                                                                                    |
| Story-memory artifacts currently included | Prior scene summaries only (flat list).                                                                                                                                                                                                                                                                                      |
| Story-memory artifacts SHOULD include     | Rolling summary, recent scene window (last 2-3 scenes full summaries), character bible (goals/voice), open threads/checklist.                                                                                                                                                                                                |
| Model + token budget + timeout            | Provider: `TEXT_LLM_PROVIDER`. OpenAI model resolves via `resolveSceneModel` (`OPENAI_MODEL` vs `OPENAI_BALANCED_MODEL`), Gemini uses `GEMINI_TEXT_MODEL_SCENE`. Max output tokens are length-profile dependent (`short/medium/long` + completion buffer). Server timeout uses `AI_UPSTREAM_TIMEOUT_MS_SCENE` for this kind. |
| Structured output schema                  | Yes. OpenAI strict `json_schema` (`scene_output`), Gemini `responseSchema` object; parsed JSON then normalized for trailing-thought completion.                                                                                                                                                                              |

## `suggestPlotTwist`

| Dimension                                 | Details                                                                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt pieces: Instructions               | Single sentence builder: “short, shocking, single-sentence plot twist idea”.                                                                                |
| Prompt pieces: Dynamic Context            | `genre`.                                                                                                                                                    |
| Current Style usage                       | None beyond genre tone.                                                                                                                                     |
| Style SHOULD be injected                  | Add style descriptor from story setup (`style`) so twist language matches screenplay voice.                                                                 |
| Story-memory artifacts currently included | None.                                                                                                                                                       |
| Story-memory artifacts SHOULD include     | Rolling summary + open threads so twist is causally connected to existing setup.                                                                            |
| Model + token budget + timeout            | OpenAI fast model (`OPENAI_FAST_MODEL`) or Gemini fast model (`GEMINI_TEXT_MODEL_FAST`); max output tokens: `90`; server timeout: `AI_UPSTREAM_TIMEOUT_MS`. |
| Structured output schema                  | No. Plain text returned as `{ text }`.                                                                                                                      |

## `generateScriptElement`

| Dimension                                 | Details                                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Prompt pieces: Instructions               | Type-specific imperative prompt from `buildScriptElementPrompt`; OpenAI/Gemini system instruction forces raw script text only.     |
| Prompt pieces: Dynamic Context            | `type`, optional `character`, `instruction`, `styleContext` (client-built: usually genre/style/length context).                    |
| Current Style usage                       | Indirect via `styleContext` string only.                                                                                           |
| Style SHOULD be injected                  | Keep `styleContext`, and split into explicit `Style:` + `Story state:` sections to avoid style dilution by arbitrary context text. |
| Story-memory artifacts currently included | Only what client already compresses into `styleContext`; no server-managed memory artifacts.                                       |
| Story-memory artifacts SHOULD include     | Rolling summary + recent window + character bible excerpt relevant to selected character/block.                                    |
| Model + token budget + timeout            | OpenAI fast model or Gemini fast model; max output tokens: `100`; server timeout: `AI_UPSTREAM_TIMEOUT_MS`.                        |
| Structured output schema                  | No. Plain text returned as `{ text }`.                                                                                             |

## `regenerateScriptBlock`

| Dimension                                 | Details                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Prompt pieces: Instructions               | Rewrite-focused prompt from `buildRegenerateBlockPrompt` with optional “Additional direction”.              |
| Prompt pieces: Dynamic Context            | `block.type`, `block.text`, optional `block.character`, `genre`, `premise`, optional `rewriteGuidance`.     |
| Current Style usage                       | No explicit style field; only genre/premise cues.                                                           |
| Style SHOULD be injected                  | Add `storyContext.style` (or derived styleContext) to preserve voice during rewrites.                       |
| Story-memory artifacts currently included | None (block-local only).                                                                                    |
| Story-memory artifacts SHOULD include     | Recent window around target block + character bible + open thread tags to prevent continuity regressions.   |
| Model + token budget + timeout            | OpenAI fast model or Gemini fast model; max output tokens: `150`; server timeout: `AI_UPSTREAM_TIMEOUT_MS`. |
| Structured output schema                  | No. Plain text returned as `{ text }`.                                                                      |

## `generateSurpriseSetup`

| Dimension                                 | Details                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt pieces: Instructions               | Premise generator with genre constraint behavior (`targetGenre` hard lock or list-based pick). Requires JSON object with `genre/premise/characters`. |
| Prompt pieces: Dynamic Context            | `targetGenre` (optional), canonical genre list (`GENRES`).                                                                                           |
| Current Style usage                       | None.                                                                                                                                                |
| Style SHOULD be injected                  | If setup style is user-selected upstream, include style tone in generated premise and character descriptions.                                        |
| Story-memory artifacts currently included | None (new setup generation).                                                                                                                         |
| Story-memory artifacts SHOULD include     | Not applicable for fresh setup; for iterative setup regeneration, include “previous attempts summary” + rejected ideas list to avoid repetition.     |
| Model + token budget + timeout            | OpenAI fast model or Gemini fast model; max output tokens: `350`; server timeout: `AI_UPSTREAM_TIMEOUT_MS`.                                          |
| Structured output schema                  | Yes. OpenAI strict `json_schema` (`surprise_setup_output`) and Gemini `responseSchema` object.                                                       |

## `generateSpeech` (TTS)

| Dimension                                 | Details                                                                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt pieces: Instructions               | No LLM text prompt. TTS payload is synthesized directly (`text`, `voice_id`, audio config).                                                                 |
| Prompt pieces: Dynamic Context            | `text`, `voiceName`, `expressive` (client option converted to expressive tags in text preprocessor).                                                        |
| Current Style usage                       | None as screenplay style metadata; only expressive tag transforms (e.g., `(whisper)` -> `[whisper]`).                                                       |
| Style SHOULD be injected                  | Optional: feed scene/style metadata into expressive transform policy so narration delivery matches screenplay style (without changing literal spoken line). |
| Story-memory artifacts currently included | None.                                                                                                                                                       |
| Story-memory artifacts SHOULD include     | For future prosody continuity: per-character speaking profile and recent emotional state summary.                                                           |
| Model + token budget + timeout            | Inworld model id `TTS_INWORLD_MODEL` (default `inworld-tts-1.5-max`); no token budget concept; server timeout `AI_UPSTREAM_TIMEOUT_MS`.                     |
| Structured output schema                  | No LLM schema. Server expects audio in payload/stream and returns `{ audioBase64 }`.                                                                        |

## Current Style-Coverage Snapshot

| Kind                    | Style injected now?           | Gap                                                |
| ----------------------- | ----------------------------- | -------------------------------------------------- |
| `generateScene`         | Yes (explicit)                | Needs richer memory-conditioned style constraints. |
| `suggestPlotTwist`      | No                            | Add style + continuity memory.                     |
| `generateScriptElement` | Yes (via `styleContext`)      | Make style section explicit/structured.            |
| `regenerateScriptBlock` | No                            | Add style to prevent rewrite voice drift.          |
| `generateSurpriseSetup` | No                            | Add optional style tonal guidance.                 |
| `generateSpeech`        | Indirect expressive tags only | Add optional style-aware delivery policy.          |

## Cohesive Story-Memory Recommendation

Across text kinds, introduce a shared memory bundle with stable keys:

- `rollingSummary`: continuously updated global story synopsis
- `recentWindow`: last N scenes or block neighborhood around rewrite target
- `characterBible`: character goals, voice traits, relationship deltas
- `openThreads`: unresolved setups/payoffs with priority tags

Then inject this bundle consistently in Dynamic Context sections for scene generation, twist generation, element insertion, and rewrites.
