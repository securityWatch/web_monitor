#!/usr/bin/env node
/**
 * Install git hooks for optional OSS auto-sync after push workflow.
 * Primary workflow: npm run publish:main (push + sync).
 * Optional: OSS_AUTO_SYNC=1 on post-commit when branch is in sync with origin.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HOOKS_DIR = path.join(__dirname, 'git-hooks');

function main() {
  if (process.platform !== 'win32') {
    for (const name of fs.readdirSync(HOOKS_DIR)) {
      fs.chmodSync(path.join(HOOKS_DIR, name), 0o755);
    }
  }
  execSync('git config core.hooksPath scripts/git-hooks', { cwd: ROOT, stdio: 'inherit' });
  console.log('[hooks] core.hooksPath → scripts/git-hooks');
  console.log('[hooks] Recommended: npm run publish:main  (push private + sync web_monitor)');
  console.log('[hooks] Optional post-commit sync: OSS_AUTO_SYNC=1 on commits already pushed to origin');
}

main();
