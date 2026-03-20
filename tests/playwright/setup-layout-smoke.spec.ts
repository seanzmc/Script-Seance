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

test('setup desktop layout smoke', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    window.localStorage.removeItem('script-seance:draft:v1');
  });
  await page.goto('/');
  await waitForAppReady(page);

  const loginHeading = page.getByRole('heading', { name: /Admin Login/i });
  if (await loginHeading.isVisible()) {
    const adminPassword = process.env.ADMIN_PASSWORD?.trim();
    test.skip(!adminPassword, 'ADMIN_PASSWORD is required when auth is enabled.');
    await page.locator('input[type="password"]').fill(adminPassword as string);
    await page.getByRole('button', { name: 'Unlock AI' }).click();
    await expect(loginHeading).toBeHidden();
  }

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
      viewportClientHeight: element.clientHeight,
      viewportScrollHeight: element.scrollHeight,
      valueWithinViewport:
        valueRect.top >= viewportRect.top - 0.5 &&
        valueRect.bottom <= viewportRect.bottom + 0.5
    };
  });

  expect(lengthMetrics).not.toBeNull();
  expect((lengthMetrics?.viewportScrollHeight ?? 0)).toBeLessThanOrEqual(
    (lengthMetrics?.viewportClientHeight ?? 0) + 1
  );
  expect(lengthMetrics?.valueWithinViewport).toBe(true);

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
