// Keeps node_modules and test output out of iCloud Drive when the project sits in a synced folder
// (~/Documents or ~/Desktop with "Desktop & Documents" on). Safe no-op elsewhere.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

// Also the built UI (rewritten by every build) and the folders the end-to-end tests
// write into (screenshots, traces, the report):
// uploading them to iCloud on every test run loads the whole machine.
const FOLDERS = ['node_modules', 'dist', 'test-results', 'playwright-report'];

if (process.platform === 'darwin') {
  for (const dir of FOLDERS) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      execFileSync('xattr', ['-w', 'com.apple.fileprovider.ignore#P', '1', dir]);
    } catch {
      // xattr missing or not permitted: nothing else to do
    }
  }
}
