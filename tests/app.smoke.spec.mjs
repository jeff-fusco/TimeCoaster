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
  const cssResponse = await page.request.get('/styles.css?v=20260703-13');
  await expect(cssResponse).toBeOK();
  expect(cssResponse.headers()['cache-control']).toContain('no-store');
  const threeResponse = await page.request.get('/vendor/three.module.js');
  await expect(threeResponse).toBeOK();
  expect(threeResponse.headers()['cache-control']).toContain('no-store');
  await expect(page.locator('.money #money')).toHaveText('0');
  await expect(page.locator('#shopToggle')).toBeVisible();
  await expect(page.locator('.bottom .ctrl')).toHaveText(['🎟 Shop', '🔧 Build', '👥 Staff', '🔬 R&D', '🏆 Legacy', 'Marketing']);
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
  await expect(page.locator('#staffList .staff-row')).toHaveCount(7);
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
    // enough to afford any generated applicant (signing fees are per-person now)
    localStorage.setItem('tc3d_v5', JSON.stringify({ money: 4000, rides: 0, queue: 8 }));
  });
  await page.goto('/index.html');

  await expect(page.locator('#researchToggle')).toBeHidden();
  await page.locator('#staffToggle').click();
  const scientists = page.locator('#staffList .staff-row').filter({ hasText: 'Scientists' });
  await scientists.locator('[data-act="hire"]').click();
  // a scientist was hired: money dropped (a real signing fee was paid)
  await expect.poll(async () => {
    const raw = await page.locator('#money').textContent();
    return Number((raw || '').replace(/,/g, ''));
  }).toBeLessThan(4000);
  await page.locator('#staffClose').click();
  await expect(page.locator('#staffPanel')).toBeHidden();
  await expect(page.locator('#researchToggle')).toBeVisible();
  await page.locator('#researchToggle').click();
  await expect(page.locator('#researchPanel')).toBeVisible();
  await expect(page.locator('#rdPct')).toHaveText('7%');
  await expect(page.locator('#rdSlider')).toHaveAttribute('max', '7');
  expect(pageErrors).toEqual([]);
});

test('hiring a marketer unlocks Marketing HQ', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
    // enough to afford any generated applicant (signing fees are per-person now)
    localStorage.setItem('tc3d_v5', JSON.stringify({ money: 4000, rides: 0, queue: 8 }));
  });
  await page.goto('/index.html');

  await expect(page.locator('#marketingToggle')).toBeHidden();
  await page.locator('#staffToggle').click();
  const marketers = page.locator('#staffList .staff-row').filter({ hasText: 'Marketers' });
  await marketers.locator('[data-act="hire"]').click();
  await page.locator('#staffClose').click();

  await expect(page.locator('#marketingToggle')).toBeVisible();
  await page.locator('#marketingToggle').click();
  await expect(page.locator('#marketingPanel')).toBeVisible();
  await expect(page.locator('#mkPct')).toHaveText('6%');
  await expect(page.locator('#mkSlider')).toHaveAttribute('max', '6');
  await expect(page.locator('#marketingBody')).toContainText('Demand');
  expect(pageErrors).toEqual([]);
});

test('staff roster panel hires, trains, fires, and rerolls individuals', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
    localStorage.setItem('tc3d_v5', JSON.stringify({ money: 12000, rides: 0, queue: 8 }));
  });
  await page.goto('/index.html');

  await page.locator('#staffToggle').click();
  const operators = page.locator('#staffList .staff-row').filter({ hasText: 'Ride Operators' });
  await expect(operators.locator('.applicant-card')).toHaveCount(3);
  await expect(operators.locator('.person-avatar').first()).toBeVisible();
  await expect(operators.locator('.trait-chip').first()).toBeVisible();

  const firstApplicantName = await operators.locator('.applicant-card .person-name').first().textContent();
  await operators.locator('[data-act="hire-person"]').first().click();
  await expect(operators.locator('.member-card')).toHaveCount(1);
  await expect(operators.locator('.member-card .person-name')).toContainText((firstApplicantName || '').split(/\s+/).slice(0, 2).join(' '));
  await expect(operators.locator('.lead-strip')).toContainText('Crew Lead');

  await operators.locator('[data-act="train-person"]').first().click();
  await expect(operators.locator('.member-card .person-meta')).toContainText(/Level [1-8]\//);

  await operators.locator('[data-act="fire-person"]').first().click();
  await expect(operators.locator('.member-card')).toHaveCount(0);

  await operators.locator('[data-act="reroll"]').click();
  await expect(operators.locator('.applicant-card')).toHaveCount(3);
  await expect(operators.locator('.s-feedback')).toContainText(/Rerolled -\$/);
  expect(pageErrors).toEqual([]);
});

test('marketing HQ splits the budget across campaign channels', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
    localStorage.setItem('tc3d_v5', JSON.stringify({
      money: 5000, rides: 0, queue: 8,
      research: { done: { radio: true } },
    }));
  });
  await page.goto('/index.html');

  await page.locator('#staffToggle').click();
  const marketers = page.locator('#staffList .staff-row').filter({ hasText: 'Marketers' });
  await marketers.locator('[data-act="hire"]').click();
  await page.locator('#staffClose').click();

  await page.locator('#marketingToggle').click();
  await expect(page.locator('#marketingBody')).toContainText('Street Team');
  await expect(page.locator('#marketingBody')).toContainText('Broadcast');
  // unresearched channels render as locked rows with their unlock hint
  const spotlight = page.locator('.marketing-channel').filter({ hasText: 'Ride Spotlight' });
  await expect(spotlight).toHaveClass(/locked/);
  await expect(spotlight).toContainText('research');

  // the sliders split one budget: raising a channel pulls the others down
  await page.locator('#mkW-streetTeam').focus();
  await page.keyboard.press('ArrowRight');
  const mk = await page.evaluate(() => window.__TC3D_DEBUG__.marketing());
  expect(mk.channels.streetTeam.weight).toBe(55);
  expect(mk.channels.broadcast.weight).toBe(45);
  expect(mk.channels.streetTeam.unlocked).toBe(true);
  expect(mk.channels.broadcast.unlocked).toBe(true);
  expect(mk.channels.spotlight.unlocked).toBe(false);
  // running more than one channel earns the Full Coverage synergy readout
  await expect(page.locator('#mkCoverage')).toContainText('Full Coverage');
  expect(pageErrors).toEqual([]);
});

test('hired staff walk into the park as world actors', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
    localStorage.setItem('tc3d_v5', JSON.stringify({
      money: 20000, rides: 0, queue: 8,
      staff: { operators: { hired: 2, trained: 0 }, janitors: { hired: 1, trained: 0 } },
    }));
  });
  await page.goto('/index.html');

  // the migrated roster (2 operators + 1 janitor) stands in the park on boot
  await expect.poll(() => page.evaluate(() => window.__TC3D_DEBUG__.staffActorCount())).toBe(3);

  // a fresh hire walks in immediately
  await page.locator('#staffToggle').click();
  const mechanics = page.locator('#staffList .staff-row').filter({ hasText: 'Mechanics' });
  await mechanics.locator('[data-act="hire"]').click();
  await expect.poll(() => page.evaluate(() => window.__TC3D_DEBUG__.staffActorCount())).toBe(4);
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

// M4: height research raises the build cap; prefabs add track; undo/redo step it.
test('build tools: height research, prefab insertion, and undo/redo', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
    localStorage.setItem('tc3d_v6', JSON.stringify({
      version: 6, savedAt: Date.now(), lastRate: 0,
      active: {
        biome: 'meadow', money: 5_000_000, rides: 0, queue: 8,
        research: { fundingPct: 0, activePath: 'track', progress: {}, done: { steelSupports: true } },
      },
    }));
  });
  await page.goto('/index.html');

  // Steel Supports research raised the height cap from 18m to 34m
  await expect.poll(() => page.evaluate(() => window.__TC3D_DEBUG__?.maxHeight?.() ?? 0)).toBe(34);

  await page.locator('#buildToggle').click();
  await expect.poll(() => page.evaluate(() => window.__TC3D_DEBUG__.buildActive())).toBe(true);
  const lenBefore = await page.evaluate(() => window.__TC3D_DEBUG__.pathLen());

  // insert a Camelback prefab → track gets longer
  await page.locator('#prefabRow [data-prefab="camelback"]').click();
  await expect.poll(() => page.evaluate(() => window.__TC3D_DEBUG__.pathLen())).toBeGreaterThan(lenBefore + 5);
  const lenAfter = await page.evaluate(() => window.__TC3D_DEBUG__.pathLen());

  // undo removes it, redo restores it (keyboard: the mobile HUD occludes the
  // toolbar buttons, but the Ctrl+Z/Y shortcuts run through the window handler)
  await expect(page.locator('#undoBtn')).toBeEnabled();
  await page.keyboard.press('Control+z');
  await expect.poll(() => page.evaluate(() => window.__TC3D_DEBUG__.pathLen())).toBeCloseTo(lenBefore, 0);
  await page.keyboard.press('Control+y');
  await expect.poll(() => page.evaluate(() => window.__TC3D_DEBUG__.pathLen())).toBeCloseTo(lenAfter, 0);
  expect(pageErrors).toEqual([]);
});

// M4: manual banking — the Bank controls set a per-point tilt override.
test('build tools: manual banking sets a per-point tilt', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
    localStorage.setItem('tc3d_v6', JSON.stringify({ version: 6, active: { biome: 'meadow', money: 1000, rides: 0, queue: 8 } }));
  });
  await page.goto('/index.html');

  await page.locator('#buildToggle').click();
  await expect.poll(() => page.evaluate(() => window.__TC3D_DEBUG__.buildActive())).toBe(true);

  // select a plain point → the Bank row appears, starting on Auto
  await page.evaluate(() => window.__TC3D_DEBUG__.selectBuildPoint(4));
  await expect(page.locator('#bankRow')).toBeVisible();
  await expect(page.locator('#bankVal')).toHaveText('Auto');
  expect(await page.evaluate(() => window.__TC3D_DEBUG__.pointBank(4))).toBeNull();

  // lean right twice → +0.4 fraction stored on the point, label shows degrees
  // (dispatchEvent bypasses the mobile HUD that overlaps the build toolbar)
  await page.locator('#bankR').dispatchEvent('click');
  await page.locator('#bankR').dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => window.__TC3D_DEBUG__.pointBank(4))).toBeCloseTo(0.4, 5);
  await expect(page.locator('#bankVal')).not.toHaveText('Auto');

  // Auto button clears the override
  await page.locator('#bankAuto').dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => window.__TC3D_DEBUG__.pointBank(4))).toBeNull();
  await expect(page.locator('#bankVal')).toHaveText('Auto');
  expect(pageErrors).toEqual([]);
});

// Without the test flag the title splash gates the game until Play is clicked.
test('title splash starts the game on Play', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => localStorage.clear());
  await page.goto('/index.html');

  await expect(page.locator('#splash')).toBeVisible();
  await expect(page.locator('#splash .splash-title')).toHaveText('Time Coaster 3D');
  await expect(page.locator('#splashPlay')).toHaveText('▶ Play'); // no save → "Play"
  await expect(page.locator('#splashWelcome')).toBeHidden();     // no offline earnings

  await page.locator('#splashPlay').click();
  await expect(page.locator('#splash')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__TC3D_BOOTED === true)).toBe(true);
  expect(pageErrors).toEqual([]);
});

// Legacy: a well-themed coaster can be certified and retired into a monument.
test('retiring a coaster banks fame and starts a new generation', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    window.__TIME_COASTER_TEST__ = true;
    localStorage.clear();
    // a real lift/drop supplies craft; fountains add enough theming to clear EXC
    localStorage.setItem('tc3d_v5', JSON.stringify({
      version: 5, money: 5000, rides: 3, queue: 8,
      ctrlPts: [
        { x: 2.85, y: 0.7, z: 9.0, station: true, seg: 'station' },
        { x: -2.85, y: 0.7, z: 9.0, station: true, seg: 'plain' },
        { x: -7.5, y: 0.9, z: 5.5, seg: 'lift' },
        { x: -9.8, y: 14, z: 0.0, seg: 'plain' },
        { x: -7.5, y: 1.0, z: -5.5, seg: 'plain' },
        { x: 0.0, y: 4.0, z: -9.3, seg: 'plain' },
        { x: 7.5, y: 0.9, z: -5.5, seg: 'plain' },
        { x: 9.8, y: 1.1, z: 0.0, seg: 'plain' },
        { x: 7.5, y: 0.9, z: 5.5, seg: 'plain' },
      ],
      decorations: [
        { type: 'fountain', x: 0, z: -6 }, { type: 'fountain', x: 5, z: -5 },
        { type: 'fountain', x: -5, z: -5 }, { type: 'statue', x: 8, z: 2 },
        { type: 'statue', x: -8, z: 2 }, { type: 'fountain', x: 3, z: 6 },
      ],
      property: { owned: ['0,0', '1,0', '-1,0', '0,-1'] },
    }));
  });
  await page.goto('/index.html');

  await expect.poll(() => page.evaluate(() => window.__TC3D_DEBUG__.ownedLand())).toBe(4);
  await page.evaluate(() => {
    window.__TC3D_DEBUG__.setFrustum(120);
    window.__TC3D_DEBUG__.setCamHeight(90);
  });
  await expect.poll(() => page.evaluate(() => window.__TC3D_DEBUG__?.legacy?.().generation ?? 0)).toBe(1);
  // effective excitement (with theming) should clear the gen-1 certification bar (40)
  await expect.poll(() => page.evaluate(() => window.__TC3D_DEBUG__.legacy().excitement)).toBeGreaterThan(40);

  await page.locator('#legacyToggle').click();
  await expect(page.locator('#legacyPanel')).toBeVisible();
  await page.locator('#lgName').fill('The Beast');
  const retire = page.locator('#lgRetire');
  await expect(retire).toBeEnabled();
  await retire.click();

  // retiring opens the biome picker; Moon is locked, Ice is available
  await expect(page.locator('#ceremonyPanel')).toBeVisible();
  await expect(page.locator('.biome-card[data-biome="moon"]')).toBeDisabled();
  await page.locator('.biome-card[data-biome="ice"]').click();

  // generation advanced, one monument banked, now building fresh on the Ice plot
  await expect.poll(() => page.evaluate(() => window.__TC3D_DEBUG__.legacy().generation)).toBe(2);
  const after = await page.evaluate(() => window.__TC3D_DEBUG__.legacy());
  expect(after.monuments).toBe(1);
  expect(after.fame).toBeGreaterThan(0);
  expect(after.biome).toBe('ice');
  expect(await page.evaluate(() => window.__TC3D_DEBUG__.ownedLand())).toBe(1);
  const cam = await page.evaluate(() => window.__TC3D_CAM__());
  expect(cam.frustum).toBeCloseTo(30, 1);
  expect(cam.target.x).toBeCloseTo(0, 1);
  expect(cam.target.z).toBeCloseTo(0, 1);
  await page.locator('#ceremonyClose').click();
  await expect(page.locator('#ceremonyPanel')).toBeHidden();
  expect(pageErrors).toEqual([]);
});

// A save written in the past shows a welcome-back credit and pays it out on Play.
test('offline progress credits money on return', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(() => {
    localStorage.clear();
    // saved 1 hour ago, earning $600/min → 1h × 600 × 0.5 efficiency = $18,000
    localStorage.setItem('tc3d_v5', JSON.stringify({
      version: 5, savedAt: Date.now() - 3600 * 1000, lastRate: 600,
      money: 0, rides: 0, queue: 8,
    }));
  });
  await page.goto('/index.html');

  await expect(page.locator('#splashWelcome')).toBeVisible();
  await expect(page.locator('#splashWelcome')).toContainText('While you were away');
  await expect(page.locator('#splashPlay')).toHaveText('▶ Continue'); // has a save

  await page.locator('#splashPlay').click();
  await expect(page.locator('#splash')).toBeHidden();
  // money jumped from the offline credit (~$18k)
  await expect.poll(async () => page.evaluate(() => {
    const t = document.getElementById('money').textContent;
    return t.includes('k') ? Math.round(parseFloat(t) * 1000) : parseInt(t.replace(/,/g, ''), 10) || 0;
  })).toBeGreaterThan(15000);
  expect(pageErrors).toEqual([]);
});
