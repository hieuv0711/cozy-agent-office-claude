import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ORIGIN = process.env.AO_E2E_ORIGIN ?? 'http://127.0.0.1:4777';

// One Chrome profile for the whole run (set here, in the main process, so every
// worker inherits it): a worker restarted after a failed test finds the scene
// already saved instead of building it again. Removed by the global teardown.
if (!process.env.AO_E2E_PROFILE) process.env.AO_E2E_RUN_PROFILE ??= fs.mkdtempSync(path.join(os.tmpdir(), 'ao-e2e-run-'));

// End-to-end tests for Agent Office 3D (scenarios in docs/test-scenarios.md).
// They run against the built app served by `npm start` on 127.0.0.1:4777, in
// the installed Google Chrome, headless but with the GPU: Chrome's software
// renderer draws the WebGL scene blank. One worker, in order: the scene is
// heavy on the GPU and several checks are about timing.
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  globalTeardown: './tests/e2e/support/teardown.ts',
  use: {
    baseURL: ORIGIN,
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] },
  },
  // the app's own server (started if it isn't running); AO_E2E_ORIGIN points the tests elsewhere
  webServer: process.env.AO_E2E_ORIGIN
    ? undefined
    : {
        command: 'npm start',
        url: 'http://127.0.0.1:4777',
        reuseExistingServer: true,
      },
});
