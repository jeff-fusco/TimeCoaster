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
  const cssResponse = await page.request.get('/styles.css?v=20260703-12');
  await expect(cssResponse).toBeOK();
  expect(cssResponse.headers()['cache-control']).toContain('no-store');
  const threeResponse = await page.request.get('/vendor/three.module.js');
  await expect(threeResponse).toBeOK();
  expect(threeResponse.headers()['cache-control']).toContain('no-store');
  await expect(page.locator('.money #money')).toHaveText('0');
  await expect(page.locator('#shopToggle')).toBeVisible();
  await expect(page.locator('.bottom .ctrl')).toHaveText(['🎟 Shop', '🔧 Build', '👥 Staff', '🔬 R&D']);
  await expect(page.locator('#shopPanel')).toBeHidden();
  await page.locator('#shopToggle').click();
  await expect(page.locator('#shopPanel')).toBeVisible();
  await expect(page.locator('#shopBody')).toBeVisible();
  await page.locator('#shopClose').click();
  await expect(page.locator('#shopPanel')).toBeHidden();
  await expect(page.locator('#modeBadge')).toContainText('Build Mode');
  await expect.poll(() => page.evaluate(() => window.__TC3D_BOOTED === true)).toBe(true);
  await expect(page.evaluate(() => window.__TC3D_BOOT_ERROR || null)).resolves.toBeNull();

  await expect.poll(async () => {
    return page.evaluate(() => {
      const canvas = document.querySelector('#scene canvas');
      if (!canvas || canvas.width === 0 || canvas.height === 0) return false;

      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return false;

      const pixels = new Uint8Array(4);
      const buckets = new Set();
      let visibleSamples = 0;
      let nonSkySamples = 0;

      for (let gx = 1; gx <= 11; gx++) {
        for (let gy = 1; gy <= 7; gy++) {
          const x = Math.floor(canvas.width * gx / 12);
          const y = Math.floor(canvas.height * gy / 8);
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          if (pixels[3] === 0) continue;

          visibleSamples++;
          const r = pixels[0];
          const g = pixels[1];
          const b = pixels[2];
          buckets.add(`${r >> 4},${g >> 4},${b >> 4}`);

          const skyLike =
            b >= 205 &&
            g >= 180 &&
            r >= 105 &&
            r <= 190 &&
            b - r >= 35 &&
            g - r >= 18;
          if (!skyLike) nonSkySamples++;
        }
      }

      return visibleSamples >= 20 && buckets.size >= 4 && nonSkySamples >= 4;
    });
  }).toBe(true);

  await page.locator('#buildToggle').click();
  await expect(page.locator('#buildPanel')).toBeVisible();
  await expect(page.locator('#shopPanel')).toBeHidden();

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

  await expect(page.locator('#researchToggle')).toBeHidden();
  await page.locator('#staffToggle').click();
  await expect(page.locator('#staffPanel')).toBeVisible();
  await expect(page.locator('#staffList .staff-row')).toHaveCount(6);
  await expect(page.locator('#staffList .staff-row .s-status').first()).toContainText(/dispatch trains yourself/i);
  const scientists = page.locator('#staffList .staff-row').filter({ hasText: 'Scientists' });
  await expect(scientists.locator('[data-act="hire"]')).toBeDisabled();
  await page.locator('#staffClose').click();
  await expect(page.locator('#staffPanel')).toBeHidden();
  await expect(page.locator('#researchToggle')).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test('hiring a scientist unlocks the research lab', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
    localStorage.setItem('tc3d_v5', JSON.stringify({ money: 1000, rides: 0, queue: 8 }));
  });
  await page.goto('/index.html');

  await expect(page.locator('#researchToggle')).toBeHidden();
  await page.locator('#staffToggle').click();
  const scientists = page.locator('#staffList .staff-row').filter({ hasText: 'Scientists' });
  await scientists.locator('[data-act="hire"]').click();
  await expect.poll(async () => {
    const raw = await page.locator('#money').textContent();
    return Number((raw || '').replace(/,/g, ''));
  }).toBeLessThanOrEqual(100);
  await expect.poll(async () => {
    const raw = await page.locator('#money').textContent();
    return Number((raw || '').replace(/,/g, ''));
  }).toBeGreaterThan(90);
  await page.locator('#staffClose').click();
  await expect(page.locator('#staffPanel')).toBeHidden();
  await expect(page.locator('#researchToggle')).toBeVisible();
  await page.locator('#researchToggle').click();
  await expect(page.locator('#researchPanel')).toBeVisible();
  await expect(page.locator('#rdPct')).toHaveText('7%');
  await expect(page.locator('#rdSlider')).toHaveAttribute('max', '7');
  expect(pageErrors).toEqual([]);
});

test('clicking park funds opens a live balance sheet', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
  });
  await page.goto('/index.html');

  const hudRate = (await page.locator('#rate').textContent()).replace(/\s+/g, '');
  await page.locator('.bank').click();
  await expect(page.locator('#balancePanel')).toBeVisible();
  await expect(page.locator('#balanceSheet')).toContainText('Per Rider');
  await expect(page.locator('#balanceSheet')).toContainText('Per Dispatch');
  await expect(page.locator('#balanceSheet')).toContainText('Throughput');
  await expect(page.locator('#balanceSheet')).toContainText(hudRate);

  await page.keyboard.press('Escape');
  await expect(page.locator('#balancePanel')).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test('staff and research buttons exit build mode before opening', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
    localStorage.setItem('tc3d_v5', JSON.stringify({
      money: 1000,
      rides: 0,
      queue: 8,
      staff: { scientists: { hired: 1, trained: 0 } },
      research: { fundingPct: 0, activePath: 'track', progress: {}, done: {} },
    }));
  });
  await page.goto('/index.html');

  await page.locator('#buildToggle').click();
  await expect(page.locator('#buildPanel')).toBeVisible();
  await page.locator('#staffToggle').click();
  await expect(page.locator('#buildPanel')).toHaveClass(/hidden/);
  await expect(page.locator('#staffPanel')).toBeVisible();
  await page.locator('#staffClose').click();

  await page.locator('#buildToggle').click();
  await expect(page.locator('#buildPanel')).toBeVisible();
  await page.locator('#researchToggle').click();
  await expect(page.locator('#buildPanel')).toHaveClass(/hidden/);
  await expect(page.locator('#researchPanel')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('low camera angle widens framing without adding future land', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
  });
  await page.goto('/index.html');

  const frame = await page.evaluate(() => {
    window.__TC3D_DEBUG__.setAzimuth(Math.PI * 0.25);
    window.__TC3D_DEBUG__.setFrustum(38);
    window.__TC3D_DEBUG__.setCamHeight(8); // ground-level floor (lowT = 1)
    return window.__TC3D_DEBUG__.cameraFrame();
  });
  expect(frame.lowT).toBeCloseTo(1, 3);
  expect(frame.effectiveFrustum).toBeGreaterThan(38);

  const framedPixels = await page.evaluate(() => {
    const canvas = document.querySelector('#scene canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const pixel = new Uint8Array(4);
    let island = 0;
    let sky = 0;

    for (let y = Math.floor(canvas.height * 0.5); y < Math.floor(canvas.height * 0.88); y += 18) {
      for (let x = Math.floor(canvas.width * 0.22); x < Math.floor(canvas.width * 0.78); x += 18) {
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const [r, g, b, a] = pixel;
        if (a === 0) continue;
        if (r > 120 && g > 170 && b > 200) sky += 1;
        if ((g > r * 0.85 && b < 220) || (r > 130 && g > 90 && b < 190)) island += 1;
      }
    }

    return { island, sky };
  });

  expect(framedPixels.island).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});

test('escape menu saves and guards reset', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
  });
  await page.goto('/index.html');

  await page.keyboard.press('Escape');
  await expect(page.locator('#escapePanel')).toBeVisible();

  await page.locator('#escapeSave').click();
  await expect(page.locator('#toast')).toContainText(/saved/i);

  await page.locator('#escapeReset').click();
  await expect(page.locator('#escapeReset')).toHaveText('Confirm Reset');

  await page.keyboard.press('Escape');
  await expect(page.locator('#escapePanel')).toBeHidden();
  await expect(page.locator('#escapeReset')).toHaveText('Reset Park');
  expect(pageErrors).toEqual([]);
});

test('staff training rebuilds queue visuals when capacity changes', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
    localStorage.setItem('tc3d_v5', JSON.stringify({ money: 5000, rides: 0, queue: 8 }));
  });
  await page.goto('/index.html');

  const before = await page.evaluate(() => window.__TC3D_DEBUG__.queueVisual());
  await page.locator('#staffToggle').click();
  const entertainers = page.locator('#staffList .staff-row').filter({ hasText: 'Entertainers' });
  await entertainers.locator('[data-act="hire"]').click();
  await entertainers.locator('[data-act="train"]').click();

  await expect.poll(async () => page.evaluate(() => window.__TC3D_DEBUG__.queueVisual().capacity)).toBeGreaterThan(before.capacity);
  const after = await page.evaluate(() => window.__TC3D_DEBUG__.queueVisual());
  expect(after.visualCapacity).toBeGreaterThanOrEqual(after.capacity);
  expect(pageErrors).toEqual([]);
});

test('staff buttons accept rapid repeated purchases and show feedback', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
    localStorage.setItem('tc3d_v5', JSON.stringify({ money: 10000, rides: 0, queue: 8 }));
  });
  await page.goto('/index.html');

  await page.locator('#staffToggle').click();
  const operators = page.locator('#staffList .staff-row').filter({ hasText: 'Ride Operators' });
  const hire = operators.locator('[data-act="hire"]');
  const box = await hire.boundingBox();
  expect(box).toBeTruthy();

  for (let i = 0; i < 3; i += 1) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }

  await expect(operators.locator('.s-count')).toContainText('3');
  await expect(operators.locator('.s-feedback')).toContainText(/Hired -\$/);
  await expect(page.locator('.bank-delta.spend')).toHaveCount(3);
  await expect(page.locator('.pop.spend')).toHaveCount(3);
  const clickX = box.x + box.width / 2;
  const clickY = box.y + box.height / 2;
  const pointerPops = await page.locator('.pop.spend').evaluateAll(nodes =>
    nodes.map(node => ({
      left: Number.parseFloat(node.style.left),
      top: Number.parseFloat(node.style.top),
      text: node.textContent,
    }))
  );
  expect(pointerPops.every(pop => pop.text.startsWith('-$'))).toBe(true);
  expect(pointerPops.every(pop => pop.left < clickX && pop.top < clickY)).toBe(true);
  expect(pageErrors).toEqual([]);
});

test('research funding slider drags and keeps future research hidden', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
    localStorage.setItem('tc3d_v5', JSON.stringify({
      money: 1000,
      rides: 0,
      queue: 8,
      staff: { scientists: { hired: 3, trained: 0 } },
      research: { fundingPct: 0, activePath: 'track', progress: {}, done: {} },
    }));
  });
  await page.goto('/index.html');

  await expect(page.locator('#tab-research')).toHaveCount(0);
  await page.locator('#researchToggle').click();
  await expect(page.locator('#researchPanel')).toBeVisible();
  await expect(page.locator('#rdSlider')).toBeVisible();
  await expect(page.locator('#rdSlider')).toHaveAttribute('max', '21');
  const box = await page.locator('#rdSlider').boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width * 0.05, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => {
    const text = await page.locator('#rdPct').textContent();
    return Number(text.replace('%', ''));
  }).toBeGreaterThan(5);
  await expect(page.locator('#rdSpend')).not.toHaveText('$0/min');
  await expect(page.locator('#rdRp')).toContainText('progress');
  await expect(page.locator('.research-current')).toContainText('Block Brakes');
  await expect(page.locator('.research-current')).not.toContainText('Track');
  await expect(page.locator('.research-queue')).toHaveCount(0);
  await expect(page.locator('#researchPanel')).not.toContainText('Path Queue');
  await page.locator('#researchClose').click();
  await expect(page.locator('#researchPanel')).toBeHidden();
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
  await page.locator('#shopToggle').click();
  await expect(page.locator('#shopPanel')).toBeVisible();
  await page.locator('#up-car').click();
  await expect(page.locator('#riders')).toHaveText('4');
  await expect(page.locator('.bank-delta.spend')).toContainText('-$');
  await expect(page.locator('#work')).not.toHaveText('Idle');
  await expect(page.locator('#lv-car')).toContainText('pending');
  expect(pageErrors).toEqual([]);
});

test('clicking a for-sale sign opens purchase details and buys the plot', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
    localStorage.setItem('tc3d_v5', JSON.stringify({ money: 5000, rides: 0, queue: 8 }));
  });
  await page.goto('/index.html');

  // the shop no longer has a Land tab — land is bought in the world
  await page.locator('#shopToggle').click();
  await expect(page.locator('#tab-property')).toHaveCount(0);
  await page.locator('#shopClose').click();
  await expect.poll(async () => page.evaluate(() => window.__TC3D_DEBUG__?.ownedLand?.() ?? 0)).toBe(1);

  // zoom out until a neighbouring for-sale sign is on screen, then click it
  const sign = await page.evaluate(() => {
    for (const frustum of [70, 100, 130]) {
      window.__TC3D_DEBUG__.setFrustum(frustum);
      const hit = window.__TC3D_DEBUG__.landSigns()
        .find(s => s.x > 40 && s.x < window.innerWidth - 40 && s.y > 100 && s.y < window.innerHeight - 100);
      if (hit) return hit;
    }
    return undefined;
  });
  expect(sign).toBeTruthy();
  await page.mouse.click(sign.x, sign.y);

  await expect(page.locator('#landPanel')).toBeVisible();
  await expect(page.locator('#landInfo')).toContainText('Plot');
  await expect(page.locator('#landInfo .land-price')).toContainText('$');

  await page.locator('#landBuy').click();
  await expect(page.locator('#landPanel')).toBeHidden();
  await expect.poll(async () => page.evaluate(() => window.__TC3D_DEBUG__.ownedLand())).toBe(2);
  expect(pageErrors).toEqual([]);
});

test('decor placement refuses station and queue footprints', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
    localStorage.setItem('tc3d_v5', JSON.stringify({ money: 1000, rides: 0, queue: 8 }));
  });
  await page.goto('/index.html');

  expect(await page.evaluate(() => window.__TC3D_DEBUG__.canPlaceDecor('flowers', 0, 0))).toBe(true);
  expect(await page.evaluate(() => window.__TC3D_DEBUG__.canPlaceDecor('flowers', 0, 9))).toBe(false);
  expect(await page.evaluate(() => window.__TC3D_DEBUG__.canPlaceDecor('flowers', 0, 11))).toBe(false);
  expect(pageErrors).toEqual([]);
});

test('decor tab places a flower bed on owned land', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
    localStorage.setItem('tc3d_v5', JSON.stringify({ money: 1000, rides: 0, queue: 8 }));
  });
  await page.goto('/index.html');

  await page.locator('#shopToggle').click();
  await expect(page.locator('#shopPanel')).toBeVisible();
  await page.locator('#tab-decor').click();
  await expect(page.locator('#decor-flowers')).toBeVisible();
  await page.locator('#decor-flowers').click();
  await expect(page.locator('#decor-flowers')).toHaveClass(/selected/);

  const spot = await page.evaluate(() => {
    const candidates = [
      [-4, -2],
      [-3, -4],
      [3, -3],
      [5, 2],
      [-5, 3],
      [0, 0],
    ];
    for (const [x, z] of candidates) {
      if (!window.__TC3D_DEBUG__.canPlaceDecor('flowers', x, z)) continue;
      const screen = window.__TC3D_DEBUG__.screenPoint(x, z);
      if (screen.x > 32 && screen.x < window.innerWidth - 260 && screen.y > 80 && screen.y < window.innerHeight - 120) {
        return screen;
      }
    }
    return undefined;
  });
  expect(spot).toBeTruthy();
  await page.mouse.click(spot.x, spot.y);

  await expect.poll(async () => page.evaluate(() => window.__TC3D_DEBUG__.decorCount())).toBe(1);
  await expect(page.locator('#money')).toHaveText('960');

  // Esc stops placement and clears the selection highlight
  await page.keyboard.press('Escape');
  await expect(page.locator('#decor-flowers')).not.toHaveClass(/selected/);
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
