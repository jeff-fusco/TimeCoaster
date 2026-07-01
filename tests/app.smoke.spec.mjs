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
  const cssResponse = await page.request.get('/styles.css?v=20260701-7');
  await expect(cssResponse).toBeOK();
  expect(cssResponse.headers()['cache-control']).toContain('no-store');
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

test('staff panel opens and closes from the bottom controls', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
  });
  await page.goto('/index.html');

  await page.locator('#staffToggle').click();
  await expect(page.locator('#staffPanel')).toBeVisible();
  await expect(page.locator('#staffList .staff-row')).toHaveCount(4);
  await page.locator('#staffClose').click();
  await expect(page.locator('#staffPanel')).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test('research funding slider previews income-based spend and RP', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
  });
  await page.goto('/index.html');

  await page.locator('#tab-research').click();
  await expect(page.locator('#rdSlider')).toBeVisible();
  await page.locator('#rdSlider').evaluate(slider => {
    slider.value = '25';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#rdPct')).toHaveText('25%');
  await expect(page.locator('#rdSpend')).not.toHaveText('$0/min');
  await expect(page.locator('#rdRp')).toContainText('RP/min');
  expect(pageErrors).toEqual([]);
});

test('manual dispatch launches a ready train and pays the ride', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
  });
  await page.goto('/index.html');

  const dispatch = page.locator('#dispatchBtn');
  await expect(dispatch).toBeVisible({ timeout: 12_000 });

  const moneyBefore = await page.locator('#money').textContent();
  await dispatch.click();

  await expect(dispatch).toBeHidden();
  await expect.poll(async () => page.locator('#money').textContent()).not.toBe(moneyBefore);
  expect(pageErrors).toEqual([]);
});

test('car purchase queues mechanic work before seats increase', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
    localStorage.setItem('tc3d_v5', JSON.stringify({ money: 1000, rides: 0, queue: 8 }));
  });
  await page.goto('/index.html');

  await expect(page.locator('#riders')).toHaveText('4');
  await page.locator('#up-car').click();
  await expect(page.locator('#riders')).toHaveText('4');
  await expect(page.locator('#work')).not.toHaveText('Idle');
  await expect(page.locator('#lv-car')).toContainText('pending');
  expect(pageErrors).toEqual([]);
});

test('property tab buys adjacent land chunks', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
    localStorage.setItem('tc3d_v5', JSON.stringify({ money: 5000, rides: 0, queue: 8 }));
  });
  await page.goto('/index.html');

  await page.locator('#tab-property').click();
  await expect(page.locator('#landOwned')).toHaveText('1 chunks');
  await expect(page.locator('.land-ticket')).toHaveCount(4);
  await page.locator('.land-ticket').first().click();
  await expect(page.locator('#landOwned')).toHaveText('2 chunks');
  await expect(page.locator('.land-ticket')).toHaveCount(6);
  expect(pageErrors).toEqual([]);
});

test('exiting build mode keeps train position and state', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
  });
  await page.goto('/index.html');

  await expect.poll(async () => page.evaluate(() => window.__TC3D_DEBUG__?.trainState?.()[0]?.s ?? 0)).toBeGreaterThan(0);
  await page.locator('#buildToggle').click();
  await expect.poll(async () => page.evaluate(() => window.__TC3D_DEBUG__.buildActive())).toBe(true);
  const beforeExit = await page.evaluate(() => {
    const [train] = window.__TC3D_DEBUG__.trainState();
    return { train, pathLen: window.__TC3D_DEBUG__.pathLen() };
  });

  await page.locator('#buildToggle').click();
  await expect.poll(async () => page.evaluate(() => window.__TC3D_DEBUG__.buildActive())).toBe(false);
  const afterExit = await page.evaluate(() => ({
    train: window.__TC3D_LAST_BUILD_EXIT__[0],
    pathLen: window.__TC3D_DEBUG__.pathLen(),
  }));

  expect(afterExit.train.s / afterExit.pathLen).toBeCloseTo(beforeExit.train.s / beforeExit.pathLen, 5);
  expect(afterExit.train.mode).toBe(beforeExit.train.mode);
  expect(afterExit.train.phase).toBe(beforeExit.train.phase);
  expect(pageErrors).toEqual([]);
});
