import 'dotenv/config';
import { expect, test } from '@playwright/test';

type Phase = 'idle' | 'surprise' | 'generate';

type GenerateEvent = {
  id: number;
  at: number;
  phase: Phase;
  type: 'start' | 'finish' | 'failed';
  kind?: string;
  status?: number;
  failureText?: string;
};

const AI_GENERATE_PATH = '/api/ai/generate';

const parseKind = (postData: string | null): string | undefined => {
  if (!postData) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(postData) as { kind?: unknown };
    return typeof parsed.kind === 'string' ? parsed.kind : undefined;
  } catch {
    return undefined;
  }
};

test('single-click surprise and generate keeps requests stable', async ({ page }, testInfo) => {
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  test.skip(!adminPassword, 'ADMIN_PASSWORD is not set.');

  await page.addInitScript(() => {
    (window as Window & { __SS_DEBUG_AI_ABORTS__?: boolean }).__SS_DEBUG_AI_ABORTS__ = true;
  });

  const consoleLogs: string[] = [];
  const events: GenerateEvent[] = [];
  const requestMeta = new Map<unknown, { id: number; phase: Phase; kind?: string }>();
  let phase: Phase = 'idle';
  let requestId = 0;

  page.on('console', (message) => {
    consoleLogs.push(`[${message.type()}] ${message.text()}`);
  });

  page.on('request', (request) => {
    if (!request.url().includes(AI_GENERATE_PATH)) {
      return;
    }
    const id = ++requestId;
    const kind = parseKind(request.postData());
    requestMeta.set(request, { id, phase, kind });
    events.push({ id, at: Date.now(), phase, type: 'start', kind });
  });

  page.on('requestfinished', async (request) => {
    const meta = requestMeta.get(request);
    if (!meta) {
      return;
    }
    const response = await request.response();
    events.push({
      id: meta.id,
      at: Date.now(),
      phase: meta.phase,
      type: 'finish',
      kind: meta.kind,
      status: response?.status()
    });
  });

  page.on('requestfailed', (request) => {
    const meta = requestMeta.get(request);
    if (!meta) {
      return;
    }
    events.push({
      id: meta.id,
      at: Date.now(),
      phase: meta.phase,
      type: 'failed',
      kind: meta.kind,
      failureText: request.failure()?.errorText
    });
  });

  const clickInPhase = async (targetPhase: Phase, click: () => Promise<void>) => {
    phase = targetPhase;
    await click();
    await page.waitForTimeout(1200);
    phase = 'idle';
  };

  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Admin Login/i })).toBeVisible();
  await page.locator('input[type="password"]').fill(adminPassword as string);
  await page.getByRole('button', { name: 'Unlock AI' }).click();
  await expect(page.getByRole('heading', { name: /Admin Login/i })).toBeHidden();

  await page.getByRole('button', { name: /Start a New Script/i }).click();
  await expect(page.getByRole('heading', { name: /Start a new script/i })).toBeVisible();

  await clickInPhase('surprise', async () => {
    await page.getByRole('button', { name: /Let AI Surprise Me/i }).click();
  });

  await clickInPhase('generate', async () => {
    await page.getByRole('button', { name: /Generate First Scene/i }).click();
  });

  await expect.poll(() => {
    return events.filter((event) => event.type === 'start').length;
  }).toBeGreaterThanOrEqual(2);

  await page.waitForTimeout(5000);

  const starts = events.filter((event) => event.type === 'start');
  const surpriseStarts = starts.filter((event) => event.phase === 'surprise');
  const generateStarts = starts.filter((event) => event.phase === 'generate');
  const surpriseSetupStarts = surpriseStarts.filter((event) => event.kind === 'generateSurpriseSetup').length;
  const generateSceneStarts = generateStarts.filter((event) => event.kind === 'generateScene').length;
  const failedEvents = events.filter((event) => event.type === 'failed');
  const canceledOrAbortedFailures = failedEvents.filter((event) =>
    /cancel|abort/i.test(event.failureText ?? '')
  ).length;
  const finished502 = events.filter(
    (event) => event.type === 'finish' && event.status === 502
  ).length;
  const orchestratorAbortPriorCount = consoleLogs.filter((line) =>
    line.includes('[orchestrator:abort-prior]')
  ).length;
  const aiCancelCount = consoleLogs.filter((line) => line.includes('[ai:cancel]')).length;
  const aiFetchAbortCount = consoleLogs.filter((line) =>
    line.includes('[ai:fetch-reject]')
  ).length;

  const summary = {
    surpriseClickStartCount: surpriseStarts.length,
    surpriseSetupStarts,
    generateClickStartCount: generateStarts.length,
    generateSceneStarts,
    canceledOrAbortedFailures,
    finished502,
    orchestratorAbortPriorCount,
    aiCancelCount,
    aiFetchAbortCount
  };

  await testInfo.attach('ai-generate-diagnostics', {
    contentType: 'application/json',
    body: JSON.stringify({ summary, events, consoleLogs }, null, 2)
  });

  console.log(`[playwright][ai-generate-diagnostics] ${JSON.stringify(summary)}`);

  expect(summary.surpriseSetupStarts).toBe(1);
  expect(summary.surpriseClickStartCount).toBe(1);
  expect(summary.generateSceneStarts).toBe(1);
  expect(summary.generateClickStartCount).toBeLessThanOrEqual(2);
  expect(summary.orchestratorAbortPriorCount).toBe(0);
  expect(summary.canceledOrAbortedFailures).toBe(0);
  expect(summary.finished502).toBe(0);
});
