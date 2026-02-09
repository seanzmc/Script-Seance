import { Router } from 'express';
import { loadLLMConfig } from './config.js';
import { createProvider } from './providers/index.js';
import { InstrumentationService } from './instrumentation.js';
import { GenerationService } from './generation-service.js';

const toScriptState = (value = {}) => {
  const style = value.style && typeof value.style === 'object'
    ? value.style
    : { genre: 'unknown', tone: 'neutral' };

  return {
    title: typeof value.title === 'string' && value.title.trim() ? value.title.trim() : 'Untitled',
    characters: Array.isArray(value.characters) ? value.characters : [],
    style: {
      genre: typeof style.genre === 'string' && style.genre.trim() ? style.genre.trim() : 'unknown',
      tone: typeof style.tone === 'string' && style.tone.trim() ? style.tone.trim() : 'neutral',
      formattingNotes: Array.isArray(style.formattingNotes) ? style.formattingNotes : [],
      influences: Array.isArray(style.influences) ? style.influences : []
    },
    plotThreads: Array.isArray(value.plotThreads) ? value.plotThreads : [],
    canonFacts: Array.isArray(value.canonFacts) ? value.canonFacts : [],
    currentSceneOutline:
      typeof value.currentSceneOutline === 'string' ? value.currentSceneOutline : undefined,
    totalScenes: typeof value.totalScenes === 'number' ? value.totalScenes : 0
  };
};

const toBlocks = (blocks = []) =>
  Array.isArray(blocks)
    ? blocks.map((block, index) => ({
        id: typeof block?.id === 'string' && block.id ? block.id : `block-${index}`,
        type: typeof block?.type === 'string' ? block.type : 'action',
        content:
          typeof block?.content === 'string'
            ? block.content
            : typeof block?.text === 'string'
            ? block.text
            : '',
        sceneIndex: typeof block?.sceneIndex === 'number' ? block.sceneIndex : undefined
      }))
    : [];

const toGenerationInput = (body = {}) => ({
  action: body.action,
  scriptState: toScriptState(body.scriptState),
  blocks: toBlocks(body.blocks),
  callbackNotes: Array.isArray(body.callbackNotes) ? body.callbackNotes : []
});

export function createLLMRouter() {
  const router = Router();

  const config = loadLLMConfig();
  let provider;
  try {
    provider = createProvider(config);
  } catch (error) {
    console.warn('[LLM] Provider bootstrap failed, falling back to local.', {
      configuredProvider: config.provider,
      error: error instanceof Error ? error.message : String(error)
    });
    provider = createProvider({ ...config, provider: 'local' });
  }

  const instrumentation = new InstrumentationService({
    dedupeWindowMs: config.safety.dedupeWindowMs,
    maxPromptChars: config.safety.maxPromptChars,
    tokenSpikeThreshold: config.safety.tokenSpikeThreshold,
    maxInputTokens: config.generation.maxInputTokens
  });

  const generation = new GenerationService(provider, config, instrumentation);

  console.log(`[LLM] Provider ready: ${provider.name}`);

  router.post('/generate', async (req, res) => {
    try {
      const input = toGenerationInput(req.body);
      const result = await generation.generate(input);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generation failed.';
      const status =
        message.includes('Prompt safety') ||
        message.includes('Duplicate') ||
        message.includes('already in progress')
          ? 429
          : 500;

      res.status(status).json({ error: message });
    }
  });

  router.post('/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders?.();

    const input = toGenerationInput(req.body);

    try {
      let completed = false;
      const handle = generation.stream(input, {
        onToken(token) {
          res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
        },
        onComplete(response) {
          completed = true;
          res.write(
            `data: ${JSON.stringify({
              type: 'done',
              text: response.text,
              usage: response.usage,
              timing: response.timing,
              finishReason: response.finishReason
            })}\n\n`
          );
          res.end();
        },
        onError(error) {
          completed = true;
          res.write(
            `data: ${JSON.stringify({
              type: 'error',
              message: error instanceof Error ? error.message : String(error)
            })}\n\n`
          );
          res.end();
        }
      });

      // Abort only when the response stream disconnects unexpectedly.
      res.on('close', () => {
        if (!completed) {
          handle.abort();
        }
      });
    } catch (error) {
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : 'Generation failed.'
        })}\n\n`
      );
      res.end();
    }
  });

  router.post('/cancel', (_req, res) => {
    generation.cancel();
    res.json({ cancelled: true });
  });

  router.post('/toggle-provider', (req, res) => {
    const requested = req.body?.provider;
    if (requested !== 'local' && requested !== 'gemini') {
      res.status(400).json({ error: 'provider must be "local" or "gemini"' });
      return;
    }

    try {
      const swapped = createProvider({ ...config, provider: requested });
      generation.setProvider(swapped);
      res.json({ provider: swapped.name });
    } catch (error) {
      res
        .status(500)
        .json({ error: error instanceof Error ? error.message : 'Provider toggle failed.' });
    }
  });

  router.get('/metrics', (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
      res.status(404).end();
      return;
    }

    res.json(instrumentation.getRecentMetrics());
  });

  return router;
}
