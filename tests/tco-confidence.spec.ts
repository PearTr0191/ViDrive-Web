import { test, expect, type Page } from '@playwright/test';

/**
 * E2E tests for the TCO confidence interval + staleness badge + custom car warning.
 *
 * Strategy: Use URL deep-linking (?car=xxx) which triggers auto-calc on mount
 * (see TcoCalculator.tsx useEffect at the deep-link block). This avoids the
 * flaky combobox dropdown interaction that times out in the test environment.
 *
 * DOM structure observed:
 *   - Staleness badge: .noprint.inline-flex.items-center (green bg for fresh)
 *   - CI label: text matching tco.confidenceRange ("95% confidence interval")
 *   - CI disclaimer/explainer: text matching tco.ciDisclaimer / tco.ciExplainer
 *   - Confidence range values: (95%) label + VND currency symbols
 *   - Custom car warning: text matching resale.customCarNoMl
 *   - Generic parametric warning: text matching resale.fallbackToParametric (should NOT show for custom cars)
 *
 * A DeveloperMessage modal (z-[100], role="presentation") opens on first visit —
 * dismissed by setting localStorage before navigation.
 */

const REGULAR_CAR_URL = '/tco?car=vios_2026&years=5';
const CUSTOM_CAR_URL = '/tco?car=custom-test-1&years=5';

const CUSTOM_CAR_DATA = {
  id: 'custom-test-1',
  brand: 'Custom',
  model: 'TestCar',
  price: 600000000,
  type: 'ICE',
  seats: 5,
  consumption: 6.0,
  annual_maintenance: 5000000,
  segment: 'C-Sedan',
  depreciation_rate: null,
};

/**
 * Navigate to the TCO page with a URL deep-link and wait for the auto-calc
 * to complete. Sets localStorage to dismiss the dev modal before navigation.
 */
async function gotoTcoWithDeepLink(page: Page, url: string, sessionStorageData?: Record<string, string>) {
  const initScript = sessionStorageData
    ? `
        localStorage.setItem('vidrive-dev-msg-seen', '1');
        ${Object.entries(sessionStorageData)
          .map(([k, v]) => `sessionStorage.setItem('${k}', \`${JSON.stringify(v)}\`);`)
          .join('\n')}
      `
    : `localStorage.setItem('vidrive-dev-msg-seen', '1');`;

  await page.addInitScript(initScript);
  await page.goto(url);
  // Wait for cars + cities API to resolve
  await Promise.all([
    page.waitForResponse(r => /\/api\/cars$/.test(r.url()) && r.status() === 200, { timeout: 30000 }),
    page.waitForResponse(r => /\/api\/cities$/.test(r.url()) && r.status() === 200, { timeout: 30000 }),
  ]);
  // Deep-link auto-calc fires on mount; wait for it
  await page.waitForResponse(r => r.url().includes('/api/tco/calculate') && r.status() === 200, { timeout: 30000 });
  await page.waitForTimeout(1500);
}

/**
 * For custom cars, the deep-link auto-calc may fire before `allCars` is populated
 * (cars query + sessionStorage custom car both load async). In that case the API
 * returns 400. This helper waits for cars to resolve, then manually clicks Calculate.
 */
async function calculateCustomCar(page: Page) {
  // Wait for cars API to resolve so allCars includes the sessionStorage custom car
  await page.waitForResponse(r => /\/api\/cars$/.test(r.url()) && r.status() === 200, { timeout: 30000 });
  await page.waitForTimeout(500); // Let React re-render with allCars populated

  // The custom car warning is set via useEffect on selectedCar (fires on mount)
  // The manual Calculate click ensures req.car is sent with the custom car data
  const calcBtn = page.getByRole('button', { name: /Tính TCO|Calculate TCO/i });
  await calcBtn.waitFor({ state: 'visible', timeout: 10000 });
  await calcBtn.click();
  await page.waitForResponse(r => r.url().includes('/api/tco/calculate') && r.status() === 200, { timeout: 30000 });
  await page.waitForTimeout(1500);
}

test.describe('TCO confidence interval + staleness badge', () => {

  test('staleness badge shows check icon for fresh data', async ({ page }) => {
    // Dismiss dev modal, navigate with deep-link, auto-calc fires
    await page.addInitScript(() => { localStorage.setItem('vidrive-dev-msg-seen', '1'); });
    await page.goto(REGULAR_CAR_URL);
    await page.waitForResponse(r => /\/api\/cars$/.test(r.url()) && r.status() === 200, { timeout: 30000 });
    await page.waitForResponse(r => r.url().includes('/api/tco/calculate') && r.status() === 200, { timeout: 30000 });
    await page.waitForTimeout(1500);

    // The staleness badge should be visible with a green background (fresh data)
    const badge = page.locator('.noprint.inline-flex.items-center');
    await expect(badge).toBeVisible({ timeout: 10000 });

    const badgeClasses = await badge.getAttribute('class');
    expect(badgeClasses).toMatch(/bg-emerald-50/);
    // Should contain a check mark (✓)
    expect(await badge.locator('span').nth(0).textContent()).toBe('✓');
  });

  test('confidence interval disclaimer renders in result card', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('vidrive-dev-msg-seen', '1'); });
    await page.goto(REGULAR_CAR_URL);
    await page.waitForResponse(r => /\/api\/cars$/.test(r.url()) && r.status() === 200, { timeout: 30000 });
    await page.waitForResponse(r => r.url().includes('/api/tco/calculate') && r.status() === 200, { timeout: 30000 });
    await page.waitForTimeout(1500);

    // The confidence interval label should appear (EN or VI)
    await expect(
      page.locator('text=/Khoảng tin cậy 95%|95% confidence interval/i')
    ).toBeVisible({ timeout: 10000 });

    // The CI disclaimer text should appear
    await expect(
      page.locator('text=/generalization gap|khoảng trống chung hơn/i')
    ).toBeVisible({ timeout: 10000 });

    // The CI explainer text should also appear
    await expect(
      page.locator('text=/Trong 19 trên 20 trường hợp|In 19 of 20 cases/i')
    ).toBeVisible({ timeout: 10000 });
  });

  test('confidence range shows low–high values', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('vidrive-dev-msg-seen', '1'); });
    await page.goto(REGULAR_CAR_URL);
    await page.waitForResponse(r => /\/api\/cars$/.test(r.url()) && r.status() === 200, { timeout: 30000 });
    await page.waitForResponse(r => r.url().includes('/api/tco/calculate') && r.status() === 200, { timeout: 30000 });
    await page.waitForTimeout(1500);

    // The (95%) label should be present in the result card
    await expect(page.locator('text=(95%)')).toBeVisible({ timeout: 10000 });

    // VND values should appear
    const vndValues = page.locator('text=₫');
    const count = await vndValues.count();
    expect(count).toBeGreaterThanOrEqual(3); // at least on-road + low + high
  });
});

test.describe('Custom car warning', () => {
  test('custom car warning shows resale.customCarNoMl instead of year-limit warning', async ({ page }) => {
    // Set sessionStorage with a custom car before navigation
    await page.addInitScript(() => {
      localStorage.setItem('vidrive-dev-msg-seen', '1');
      localStorage.setItem('vidrive-locale', 'en');
      sessionStorage.setItem('vidrive-custom-car', JSON.stringify({
        id: 'custom-test-1',
        brand: 'Custom',
        model: 'TestCar',
        price: 600000000,
        type: 'ICE',
        seats: 5,
        consumption: 6.0,
        annual_maintenance: 5000000,
        segment: 'C-Sedan',
        depreciation_rate: null,
      }));
    });
    await page.goto(CUSTOM_CAR_URL);

    // Wait for cars + cities API, then the deep-link auto-calc (which now
    // succeeds thanks to the sessionStorage fallback in handleCalculate)
    await Promise.all([
      page.waitForResponse(r => /\/api\/cars$/.test(r.url()) && r.status() === 200, { timeout: 30000 }),
      page.waitForResponse(r => /\/api\/cities$/.test(r.url()) && r.status() === 200, { timeout: 30000 }),
    ]);
    await page.waitForResponse(r => r.url().includes('/api/tco/calculate') && r.status() === 200, { timeout: 30000 });
    await page.waitForTimeout(1500);

    // The custom car-specific warning should be visible (resale.customCarNoMl)
    await expect(
      page.locator('text=/Custom cars do not support ML depreciation/i')
    ).toBeVisible({ timeout: 10000 });

    // The generic year-limit parametric fallback warning should NOT be visible
    const modalCount = await page.locator('text=/ML model only supports.*years/i').count();
    expect(modalCount).toBe(0);
  });

  test('page reload with custom car deep-link does not produce a 400 error', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('vidrive-dev-msg-seen', '1');
      localStorage.setItem('vidrive-locale', 'en');
      sessionStorage.setItem('vidrive-custom-car', JSON.stringify({
        id: 'custom-test-1',
        brand: 'Custom',
        model: 'TestCar',
        price: 600000000,
        type: 'ICE',
        seats: 5,
        consumption: 6.0,
        annual_maintenance: 5000000,
        segment: 'C-Sedan',
        depreciation_rate: null,
      }));
    });
    await page.goto(CUSTOM_CAR_URL);

    // Wait for cars + cities + the deep-link auto-calc
    await Promise.all([
      page.waitForResponse(r => /\/api\/cars$/.test(r.url()) && r.status() === 200, { timeout: 30000 }),
      page.waitForResponse(r => /\/api\/cities$/.test(r.url()) && r.status() === 200, { timeout: 30000 }),
    ]);
    // The auto-calc must succeed (no 400 "Custom car data required" error)
    const calcResponse = await page.waitForResponse(
      r => r.url().includes('/api/tco/calculate'), { timeout: 30000 }
    );
    expect(calcResponse.status()).toBe(200);
    await page.waitForTimeout(1500);

    // No error toast/modal should be visible
    const errorEl = page.locator('text=/lỗi|error|đã xảy ra/i');
    expect(await errorEl.count()).toBe(0);

    // The custom car warning should be visible instead
    await expect(
      page.locator('text=/Custom cars do not support ML depreciation/i')
    ).toBeVisible({ timeout: 10000 });
  });

  test('Car Details page shows custom car data from sessionStorage', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('vidrive-dev-msg-seen', '1');
      localStorage.setItem('vidrive-locale', 'en');
      sessionStorage.setItem('vidrive-custom-car', JSON.stringify({
        id: 'custom-test-1',
        brand: 'Custom',
        model: 'TestCar',
        price: 600000000,
        type: 'ICE',
        seats: 5,
        consumption: 6.0,
        annual_maintenance: 5000000,
        segment: 'C-Sedan',
        depreciation_rate: null,
      }));
    });
    await page.goto('/car/custom-test-1');

    // No "not found" message — the car details should render
    await expect(page.locator('text=/Not found|Không tìm thấy/i')).not.toBeVisible({ timeout: 5000 });

    // The custom car's brand + model should be visible (heading, not breadcrumb)
    await expect(page.locator('text=Custom TestCar').first()).toBeVisible({ timeout: 10000 });

    // The price should be formatted and visible (600,000,000 ₫)
    await expect(page.locator('text=₫').first()).toBeVisible({ timeout: 10000 });

    // The TCO calculate button should link to /tco with the custom car ID
    const tcoLink = page.locator('a[href*="/tco?car=custom-test-1"]');
    await expect(tcoLink).toBeVisible({ timeout: 5000 });
  });
});
