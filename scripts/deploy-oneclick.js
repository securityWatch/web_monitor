#!/usr/bin/env node
/**
 * One-click production deploy from repo root.
 *
 * Usage:
 *   npm run deploy              # API + Web (redeploy-all)
 *   npm run deploy:first        # first-time full install (deploy.js)
 *   node scripts/deploy-oneclick.js --api
 *   node scripts/deploy-oneclick.js --web
 *   node scripts/deploy-oneclick.js --sync-oss   # deploy then sync web_monitor
 *
 * Env (or lines in local 环境信息, never committed):
 *   DEPLOY_HOST, DEPLOY_USER, DEPLOY_PASSWORD (required)
 *   PG_PASSWORD or DATABASE_URL (required for --first)
 *   APP_DOMAINS, NEXT_PUBLIC_SITE_URL (optional)
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const DEPLOY_DIR = path.join(ROOT, 'deploy');

function loadLocalSecrets() {
  const file = path.join(ROOT, '环境信息');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && val && process.env[key] == null) process.env[key] = val;
  }
}

function parseArgs(argv) {
  return {
    first: argv.includes('--first'),
    apiOnly: argv.includes('--api'),
    webOnly: argv.includes('--web'),
    skipVerify: argv.includes('--skip-verify'),
    syncOss: argv.includes('--sync-oss'),
  };
}

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('[deploy] Missing required environment variables:');
    for (const k of missing) console.error(`  - ${k}`);
    console.error('\nSet them in the shell or in local 环境信息 (not committed to Git).');
    process.exit(1);
  }
}

function runNode(script, extraEnv = {}) {
  const r = spawnSync('node', [path.join(DEPLOY_DIR, script)], {
    cwd: DEPLOY_DIR,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

function pickScript(args) {
  if (args.first) return 'deploy.js';
  if (args.apiOnly) return 'redeploy-api.js';
  if (args.webOnly) return 'redeploy-web.js';
  return 'redeploy-all.js';
}

function verifyPublic() {
  const host = process.env.DEPLOY_HOST || '49.234.112.108';
  const healthUrl = `http://${host}/health`;
  const webUrl = `http://${host}/en`;

  return new Promise((resolve) => {
    http
      .get(healthUrl, { timeout: 15000 }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          const okHealth = res.statusCode === 200 && body.includes('"status"');
          if (!okHealth) {
            console.error(`[deploy] Health check failed: ${healthUrl} → ${res.statusCode}`);
            resolve(false);
            return;
          }
          http
            .get(webUrl, { timeout: 15000 }, (res2) => {
              const okWeb = res2.statusCode === 200;
              if (!okWeb) console.error(`[deploy] Web check failed: ${webUrl} → ${res2.statusCode}`);
              resolve(okWeb);
            })
            .on('error', (e) => {
              console.error(`[deploy] Web check error: ${e.message}`);
              resolve(false);
            });
        });
      })
      .on('error', (e) => {
        console.error(`[deploy] Health check error: ${e.message}`);
        resolve(false);
      });
  });
}

async function main() {
  loadLocalSecrets();
  const args = parseArgs(process.argv.slice(2));

  requireEnv(['DEPLOY_PASSWORD']);
  if (args.first && !process.env.DATABASE_URL) requireEnv(['PG_PASSWORD']);

  const script = pickScript(args);
  console.log(`[deploy] Running ${script} → ${process.env.DEPLOY_HOST || '49.234.112.108'} ...\n`);
  runNode(script);

  if (!args.skipVerify) {
    console.log('\n[deploy] Verifying public endpoints...');
    const ok = await verifyPublic();
    if (!ok) {
      console.error('[deploy] Verification failed. Fix server issues or pass --skip-verify.');
      process.exit(1);
    }
    console.log('[deploy] Verification OK.');
  }

  if (args.syncOss) {
    console.log('\n[deploy] Syncing open-source mirror...');
    const r = spawnSync('node', [path.join(__dirname, 'sync-web-monitor-oss.js')], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (r.status !== 0) process.exit(r.status || 1);
  }

  console.log('\n[deploy] Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
