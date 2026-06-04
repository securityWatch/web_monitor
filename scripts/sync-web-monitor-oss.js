#!/usr/bin/env node
/**
 * Clone current repo → desensitize → push to https://github.com/securityWatch/web_monitor.git
 *
 * Usage (from repo root):
 *   node scripts/sync-web-monitor-oss.js
 *
 * Requires: git, network, push access to securityWatch/web_monitor
 * Does NOT modify the private working tree (uses a temp clone).
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { main: desensitize } = require('./oss-desensitize');
const { main: verifySecrets } = require('./oss-verify-secrets');

const OSS_REMOTE = 'https://github.com/securityWatch/web_monitor.git';
const ROOT = path.join(__dirname, '..');
const STAGING = path.join(ROOT, '..', 'web_monitor-oss-staging');

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: opts.cwd || ROOT, env: { ...process.env, ...opts.env } });
}

function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
}

function main() {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  const sha = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  console.log(`[sync-oss] Source: ${ROOT} @ ${branch} ${sha.slice(0, 7)}\n`);

  rmDir(STAGING);
  run(`git clone --local "${ROOT.replace(/\\/g, '/')}" "${STAGING.replace(/\\/g, '/')}"`);

  const originUrl = execSync('git remote get-url origin', { cwd: STAGING, encoding: 'utf8' }).trim();
  run('git remote remove origin', { cwd: STAGING });
  run(`git remote add origin "${OSS_REMOTE}"`, { cwd: STAGING });

  desensitize(STAGING);
  verifySecrets(STAGING);

  const status = execSync('git status --porcelain', { cwd: STAGING, encoding: 'utf8' }).trim();
  if (!status) {
    console.log('[sync-oss] No desensitization diff (already in sync?).');
  } else {
    run('git add -A', { cwd: STAGING });
    const msg = [
      'chore(oss): desensitize for public open-source release',
      '',
      'Replace production host, domain, and WeChat AppID with placeholders.',
      'Sync from private PulseWatch repo via scripts/sync-web-monitor-oss.js.',
      '',
      `Source: ${sha}`,
    ].join('\n');
    const msgFile = path.join(STAGING, '.oss-commit-msg.txt');
    fs.writeFileSync(msgFile, msg, 'utf8');
    run(`git commit -F "${msgFile}"`, { cwd: STAGING });
    fs.unlinkSync(msgFile);
  }

  const push = () => {
    const r = spawnSync('git', ['push', '-u', 'origin', 'main'], {
      cwd: STAGING,
      stdio: 'inherit',
      shell: true,
    });
    return r.status === 0;
  };

  let ok = false;
  for (let i = 1; i <= 3; i++) {
    if (push()) {
      ok = true;
      break;
    }
    console.warn(`[sync-oss] Push attempt ${i} failed, retrying...`);
  }

  if (!ok) {
    console.warn('[sync-oss] Standard push failed; fetch + --force-with-lease');
    run('git fetch origin', { cwd: STAGING });
    const r = spawnSync('git', ['push', '--force-with-lease', '-u', 'origin', 'main'], {
      cwd: STAGING,
      stdio: 'inherit',
      shell: true,
    });
    ok = r.status === 0;
  }

  if (!ok) {
    console.error('[sync-oss] Push failed after retries. Staging dir kept:', STAGING);
    process.exit(1);
  }

  console.log(`\n[sync-oss] Published to ${OSS_REMOTE}`);
  console.log(`[sync-oss] Staging: ${STAGING} (safe to delete)`);
}

main();
