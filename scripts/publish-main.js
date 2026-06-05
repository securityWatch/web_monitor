#!/usr/bin/env node
/**
 * Push private main to origin, then desensitize and publish to securityWatch/web_monitor.
 *
 * Usage: npm run publish:main
 * Skip OSS: SKIP_OSS_SYNC=1 npm run publish:main
 */
const { execSync, spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function run(cmd, cwd = ROOT) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

function pushWithRetry() {
  for (let i = 1; i <= 3; i++) {
    const r = spawnSync('git', ['push', 'origin', 'main'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
    });
    if (r.status === 0) return;
    console.warn(`[publish] push attempt ${i} failed, retrying...`);
  }
  console.error('[publish] git push origin main failed after 3 attempts');
  process.exit(1);
}

function main() {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  if (branch !== 'main') {
    console.error(`[publish] Expected branch main, got ${branch}`);
    process.exit(1);
  }

  pushWithRetry();

  if (process.env.SKIP_OSS_SYNC === '1') {
    console.log('[publish] SKIP_OSS_SYNC=1 — OSS mirror sync skipped.');
    return;
  }

  run('node scripts/sync-web-monitor-oss.js');
  console.log('\n[publish] Private main pushed and web_monitor mirror updated.');
}

main();
