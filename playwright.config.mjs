import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.smoke.spec.mjs',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  // These are full-scene WebGL integration tests: two Chromium instances
  // rendering the 3D park in parallel contend for the GPU, which throttles
  // requestAnimationFrame and makes the rAF-driven sim (physics, economy,
  // deferred UI renders) converge slower than the poll timeouts expect —
  // the sole source of the historical flakiness. Serial execution removes the
  // contention entirely, so the suite is deterministic. `retries: 0` keeps it
  // honest: a flake fails the run rather than being papered over by a re-run.
  workers: 1,
  retries: 0,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:4321',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: 'http://127.0.0.1:4321/index.html',
    // reuse a dev server you already have running (npm start); CI stays strict
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Pixel 5'],
      },
    },
  ],
});
