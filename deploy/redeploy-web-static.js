#!/usr/bin/env node
/** Fast path: upload only .next/static (~2MB) after local build. Use when only frontend assets changed. */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { APP_DIR, ROOT, PASSWORD, SITE_URL } = require('./lib/config');
const { sshExec, scpToRemote, shellQuote } = require('./lib/ssh');

const pw = shellQuote(PASSWORD);
const staticTar = path.join(__dirname, '.cache/web-static.tar.gz');

async function main() {
  const t0 = Date.now();
  if (!process.env.SKIP_WEB_BUILD) {
    execSync('npm run build', {
      cwd: path.join(ROOT, 'apps/web'),
      env: { ...process.env, NODE_ENV: 'production', NEXT_PUBLIC_API_URL: SITE_URL, NEXT_PUBLIC_SITE_URL: SITE_URL },
      stdio: 'inherit',
    });
  }
  fs.mkdirSync(path.dirname(staticTar), { recursive: true });
  execSync(`tar czf "${staticTar}" -C "${path.join(ROOT, 'apps/web')}" .next/static`, { stdio: 'inherit' });
  const size = fs.statSync(staticTar).size;
  console.log(`[web-static] Upload ${(size / 1024 / 1024).toFixed(1)}MB...`);
  await scpToRemote(staticTar, '/tmp/web-static.tar.gz');

  const cmd = `
echo ${pw} | sudo -S systemctl stop pulsewatch-web
cd ${APP_DIR}/web && tar xzf /tmp/web-static.tar.gz
cp -r .next/static .next/standalone/apps/web/.next/
rm -f /tmp/web-static.tar.gz
echo ${pw} | sudo -S systemctl start pulsewatch-web
sleep 3
curl -s -o /dev/null -w "80en:%{http_code}\\n" http://127.0.0.1/en`;
  const { code, stdout } = sshExec(cmd);
  process.stdout.write(stdout);
  if (code !== 0) process.exit(code);
  console.log(`[web-static] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
