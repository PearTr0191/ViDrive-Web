import { test, expect } from '@playwright/test';

const routes = [
  { name: 'Landing', url: '/' },
  { name: 'Browse Cars', url: '/browse' },
  { name: 'TCO Calculator', url: '/tco' },
  { name: 'Compare', url: '/compare' },
  { name: 'History', url: '/history' },
  { name: 'Methodology', url: '/methodology' },
  { name: 'Wizard', url: '/wizard' },
  { name: 'Loan', url: '/loan' },
  { name: 'NotFound', url: '/nonexistent' },
];

const breakpoints = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const route of routes) {
  for (const bp of breakpoints) {
    test(`visual ${route.name} @ ${bp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto(route.url);
      await page.waitForTimeout(1200);
      const screenshotPath = `screenshots/${route.name.replace(/\s+/g, '_')}_${bp.name}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
    });
  }
}
