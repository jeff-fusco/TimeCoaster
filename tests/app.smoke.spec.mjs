import { expect, test } from '@playwright/test';

test('loads the coaster scene and core controls', async ({ page }) => {
  const cdnRequests = [];
  const pageErrors = [];

  page.on('request', request => {
    const url = request.url();
    if (url.includes('cdnjs.cloudflare.com/ajax/libs/three.js')) {
      cdnRequests.push(url);
    }
  });
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
  });
  await page.goto('/index.html');

  await expect(page.locator('#scene canvas')).toBeVisible();
  await expect(page.locator('.money #money')).toContainText(/\d/);
  await expect(page.locator('#shop')).toBeVisible();
  await expect(page.locator('#shopBody')).toBeVisible();
  await expect(page.locator('#modeBadge')).toContainText('Build Mode');

  await expect.poll(async () => {
    return page.evaluate(() => {
      const canvas = document.querySelector('#scene canvas');
      if (!canvas || canvas.width === 0 || canvas.height === 0) return false;

      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return false;

      const pixels = new Uint8Array(4);
      const points = [
        [0.5, 0.5],
        [0.25, 0.5],
        [0.75, 0.5],
        [0.5, 0.25],
      ];

      for (const [xRatio, yRatio] of points) {
        const x = Math.floor(canvas.width * xRatio);
        const y = Math.floor(canvas.height * yRatio);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        if (pixels[3] > 0 && (pixels[0] > 0 || pixels[1] > 0 || pixels[2] > 0)) {
          return true;
        }
      }

      return false;
    });
  }).toBe(true);

  await page.locator('#buildToggle').click();
  await expect(page.locator('#buildPanel')).toBeVisible();
  await expect(page.locator('#shop')).toHaveClass(/hidden/);

  await page.locator('#buildToggle').click();
  await expect(page.locator('#buildPanel')).toHaveClass(/hidden/);

  expect(cdnRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
