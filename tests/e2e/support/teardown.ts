import fs from 'node:fs';

// Removes the run's Chrome profile (see playwright.config.ts).
export default async function teardown() {
  const dir = process.env.AO_E2E_RUN_PROFILE;
  if (dir && !process.env.AO_E2E_PROFILE) fs.rmSync(dir, { recursive: true, force: true });
}
