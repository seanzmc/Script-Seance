import 'dotenv/config';
import { expect, test } from '@playwright/test';

const waitForAppReady = async (page: import('@playwright/test').Page) => {
  return expect
    .poll(async () => {
      if (await page.getByRole('heading', { name: /Admin Login/i }).isVisible()) {
        return 'login';
      }
      if (await page.getByRole('button', { name: /Start a New Script/i }).isVisible()) {
        return 'ready';
      }
      return 'loading';
    }, { timeout: 15000 })
    .not.toBe('loading');
};

const clearDraftStorage = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('script-seance:draft:v1');
    window.localStorage.removeItem('script-seance:draft:v0');
    window.localStorage.removeItem('script-seance:draft');
  });
};

const unlockIfNeeded = async (page: import('@playwright/test').Page) => {
  const loginHeading = page.getByRole('heading', { name: /Admin Login/i });
  if (await loginHeading.isVisible()) {
    const adminPassword = process.env.ADMIN_PASSWORD?.trim();
    test.skip(!adminPassword, 'ADMIN_PASSWORD is required when auth is enabled.');
    const response = await page.request.post('/api/auth/login', {
      data: { password: adminPassword },
    });
    expect(response.ok()).toBe(true);
    await page.reload();
    await expect(loginHeading).toBeHidden();
  }
};

const openStyleStage = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: /Start a New Script/i }).click();
  await expect(page.getByTestId('setup-screen')).toBeVisible();
  await page.getByRole('button', { name: /Continue to Style/i }).click();
  await expect(page.getByRole('button', { name: /Browse/i })).toBeVisible();
};

test('setup desktop layout smoke', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await clearDraftStorage(page);
  await page.goto('/');
  await waitForAppReady(page);
  await unlockIfNeeded(page);

  await page.getByRole('button', { name: /Start a New Script/i }).click();
  await expect(page.getByTestId('setup-screen')).toBeVisible();
  await expect(page.getByTestId('setup-genre-wheel')).toBeVisible();

  const genreMetrics = await page.getByTestId('setup-genre-value-viewport').evaluate((element) => {
    const valueElement = element.querySelector<HTMLElement>('[data-testid="setup-genre-value"]');
    if (!valueElement) return null;
    const viewportRect = element.getBoundingClientRect();
    const valueRect = valueElement.getBoundingClientRect();
    return {
      viewportClientWidth: element.clientWidth,
      viewportScrollWidth: element.scrollWidth,
      valueWithinViewport:
        valueRect.left >= viewportRect.left - 0.5 &&
        valueRect.right <= viewportRect.right + 0.5
    };
  });

  expect(genreMetrics).not.toBeNull();
  expect(genreMetrics?.valueWithinViewport).toBe(true);

  await page.getByTestId('setup-continue-to-style').click();
  await expect(page.getByTestId('setup-genre-summary')).toBeVisible();
  await page.getByRole('button', { name: /Write My Own Premise/i }).click();
  await expect(page.getByTestId('setup-style-summary')).toBeVisible();

  const premisePanel = page.getByTestId('setup-premise-panel');
  const charactersPanel = page.getByTestId('setup-characters-panel');
  await expect(premisePanel).toBeVisible();
  await expect(charactersPanel).toBeVisible();
  await expect(page.getByText('Narrator')).toBeVisible();
  await expect(page.getByTestId('setup-narrator-preference')).toBeVisible();

  const [premiseBox, charactersBox] = await Promise.all([
    premisePanel.boundingBox(),
    charactersPanel.boundingBox()
  ]);
  expect(premiseBox).not.toBeNull();
  expect(charactersBox).not.toBeNull();
  expect((premiseBox?.width ?? 0)).toBeGreaterThan((charactersBox?.width ?? 0));

  const lengthViewport = page.getByTestId('setup-length-value-viewport');
  await expect(lengthViewport).toBeVisible();
  const lengthMetrics = await lengthViewport.evaluate((element) => {
    const valueElement = element.querySelector<HTMLElement>('[data-testid="setup-length-value"]');
    if (!valueElement) return null;
    const viewportRect = element.getBoundingClientRect();
    const valueRect = valueElement.getBoundingClientRect();
    return {
      valueCenterOffset:
        Math.abs(
          (valueRect.top + valueRect.bottom) / 2 -
          (viewportRect.top + viewportRect.bottom) / 2,
        ),
      valueWithinViewport:
        valueRect.top >= viewportRect.top - 0.5 &&
        valueRect.bottom <= viewportRect.bottom + 0.5
    };
  });

  expect(lengthMetrics).not.toBeNull();
  expect(lengthMetrics?.valueCenterOffset ?? 999).toBeLessThanOrEqual(1);

  const generateButton = page.getByRole('button', { name: /Generate First Scene/i });
  await expect(generateButton).toBeVisible();
  const generateButtonBox = await generateButton.boundingBox();
  expect(generateButtonBox).not.toBeNull();
  expect(generateButtonBox?.y ?? 9999).toBeLessThan(760);

  await testInfo.attach('setup-desktop-layout', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
});

test('style library keeps its header and list usable in short viewports', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await clearDraftStorage(page);
  await page.goto('/');
  await waitForAppReady(page);
  await unlockIfNeeded(page);
  await openStyleStage(page);

  await page.getByRole('button', { name: /Browse/i }).click();
  await expect(page.getByRole('heading', { name: /Style Library/i })).toBeVisible();
  await expect(page.getByLabel('Search styles')).toBeVisible();
  const styleList = page.getByTestId('setup-style-library-list');
  const styleListMetrics = await styleList.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(styleListMetrics.scrollHeight).toBeGreaterThan(styleListMetrics.clientHeight);
  const scrollTop = await styleList.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
  expect(scrollTop).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: /Style Library/i })).toBeVisible();
  await expect(page.getByLabel('Search styles')).toBeVisible();
});

test('style library traps setup focus and overlays Step 2 content', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await clearDraftStorage(page);
  await page.goto('/');
  await waitForAppReady(page);
  await unlockIfNeeded(page);
  await openStyleStage(page);

  const manualPremiseButton = page.getByRole('button', { name: /Write My Own Premise/i });
  const manualPremiseBox = await manualPremiseButton.boundingBox();
  expect(manualPremiseBox).not.toBeNull();

  await page.getByRole('button', { name: /Browse/i }).click();

  const searchInput = page.getByLabel('Search styles');
  const closeButton = page.getByRole('button', { name: /Close style library/i });
  await expect(page.getByRole('heading', { name: /Style Library/i })).toBeVisible();
  await expect(searchInput).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(searchInput).toBeFocused();

  const overlayTarget = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!element) return null;
    return {
      text: element.textContent ?? '',
      role: element.getAttribute('role'),
      ariaLabel: element.getAttribute('aria-label'),
    };
  }, {
    x: (manualPremiseBox?.x ?? 0) + (manualPremiseBox?.width ?? 0) / 2,
    y: (manualPremiseBox?.y ?? 0) + (manualPremiseBox?.height ?? 0) / 2,
  });

  expect(overlayTarget?.text ?? '').not.toMatch(/Write My Own Premise/i);
  expect(overlayTarget?.ariaLabel ?? '').not.toMatch(/Write My Own Premise/i);
});
