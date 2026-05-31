#!/usr/bin/env node
/**
 * Web deploy — default REMOTE_BUILD=1 (build on server, ~2–5 min).
 * Set REMOTE_WEB_BUILD=0 to upload prebuilt bundle (slow on narrow uplink).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { HOST, APP_DIR, BUILD_DIR, ROOT, PASSWORD, REMOTE_WEB_BUILD, SITE_URL } = require('./lib/config');
const { sshExec, scpToRemote, shellQuote } = require('./lib/ssh');

const APP = APP_DIR;
const pw = shellQuote(PASSWORD);
const webServiceB64 = Buffer.from(`[Unit]
Description=PulseWatch Web
After=network.target
[Service]
Type=simple
User=ubuntu
WorkingDirectory=${APP}/web/.next/standalone/apps/web
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
Environment=INTERNAL_API_URL=http://127.0.0.1:4000
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
`).toString('base64');

function installWebUnit() {
  return `echo ${webServiceB64} | base64 -d > /tmp/pw-web.service
echo ${pw} | sudo -S cp /tmp/pw-web.service /etc/systemd/system/pulsewatch-web.service
echo ${pw} | sudo -S systemctl daemon-reload`;
}

function activateWebArtifacts(buildRoot) {
  const webNext = `${buildRoot}/apps/web/.next`;
  return `
mkdir -p ${APP}/web
rm -rf ${APP}/web/.next
cp -a ${webNext} ${APP}/web/.next
cp -r ${APP}/web/.next/static ${APP}/web/.next/standalone/apps/web/.next/
cp -r ${APP}/web/public ${APP}/web/.next/standalone/apps/web/ 2>/dev/null || cp -r ${buildRoot}/apps/web/public ${APP}/web/.next/standalone/apps/web/
test -f ${APP}/web/.next/standalone/apps/web/server.js
${installWebUnit()}
echo ${pw} | sudo -S systemctl start pulsewatch-web
sleep 5
systemctl is-active pulsewatch-web
curl -s -o /dev/null -w "3000en:%{http_code}\\n" http://127.0.0.1:3000/en
curl -s -o /dev/null -w "reg:%{http_code}\\n" http://127.0.0.1:3000/en/register
curl -s -o /dev/null -w "80en:%{http_code}\\n" http://127.0.0.1/en`;
}

async function deployRemoteBuild() {
  const t0 = Date.now();
  const lockHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'package-lock.json'))).digest('hex');
  const srcTar = path.join(__dirname, '.cache/web-src.tar.gz');

  console.log('[web] Packing source (~500KB)...');
  fs.mkdirSync(path.dirname(srcTar), { recursive: true });
  execSync(
    `tar czf "${srcTar}" --exclude=node_modules --exclude=.next package.json package-lock.json apps/web`,
    { cwd: ROOT, stdio: 'inherit' },
  );

  console.log('[web] Upload source + remote npm build...');
  await scpToRemote(srcTar, '/tmp/pulsewatch-src.tar.gz');

  const site = SITE_URL.replace(/\/$/, '');
  const cmd = `
set -e
echo ${pw} | sudo -S systemctl stop pulsewatch-web || true
mkdir -p ${BUILD_DIR}
cd ${BUILD_DIR}
rm -rf apps package.json package-lock.json
tar xzf /tmp/pulsewatch-src.tar.gz
rm -f /tmp/pulsewatch-src.tar.gz
NEED_CI=1
if [ -f .deps-hash ] && [ "$(cat .deps-hash)" = "${lockHash}" ] && [ -d node_modules ]; then NEED_CI=0; fi
if [ "$NEED_CI" = "1" ]; then
  echo "[web] npm ci (lockfile changed)..."
  npm ci --include=dev
  echo "${lockHash}" > .deps-hash
else
  echo "[web] Reusing node_modules"
fi
export NODE_ENV=production
export NEXT_PUBLIC_API_URL=${site}
export NEXT_PUBLIC_SITE_URL=${site}
echo "[web] next build on server..."
npm run build -w @pulsewatch/web
${activateWebArtifacts(BUILD_DIR)}
`;
  const { code, stdout, stderr } = await sshExec(cmd, { timeoutMs: 900000 });
  process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (code !== 0) process.exit(code);
  console.log(`[web] Remote build done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

async function deployUploadBundle() {
  const t0 = Date.now();
  if (!process.env.SKIP_WEB_BUILD) {
    console.log('[web] Local next build...');
    execSync('npm run build', {
      cwd: path.join(ROOT, 'apps/web'),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXT_PUBLIC_API_URL: SITE_URL,
        NEXT_PUBLIC_SITE_URL: SITE_URL,
      },
      stdio: 'inherit',
    });
  }

  const webTar = path.join(__dirname, '.cache/web-bundle.tar.gz');
  fs.mkdirSync(path.dirname(webTar), { recursive: true });
  execSync(`tar czf "${webTar}" .next/standalone .next/static public`, {
    cwd: path.join(ROOT, 'apps/web'),
    stdio: 'inherit',
  });

  const localSize = fs.statSync(webTar).size;
  console.log(`[web] Upload bundle ${(localSize / 1024 / 1024).toFixed(1)}MB (slow)...`);
  await scpToRemote(webTar, '/tmp/web-bundle.tar.gz');

  const cmd = `
echo ${pw} | sudo -S systemctl stop pulsewatch-web
test $(stat -c%s /tmp/web-bundle.tar.gz) -eq ${localSize}
cd ${APP}/web && tar xzf /tmp/web-bundle.tar.gz
cp -r .next/static .next/standalone/apps/web/.next/
cp -r public .next/standalone/apps/web/
rm -f /tmp/web-bundle.tar.gz
test -f .next/standalone/apps/web/server.js
${installWebUnit()}
echo ${pw} | sudo -S systemctl start pulsewatch-web
sleep 5
curl -s -o /dev/null -w "3000en:%{http_code}\\n" http://127.0.0.1:3000/en
curl -s -o /dev/null -w "80en:%{http_code}\\n" http://127.0.0.1/en`;
  const { code, stdout } = await sshExec(cmd, { timeoutMs: 900000 });
  process.stdout.write(stdout);
  if (code !== 0) process.exit(code);
  console.log(`[web] Upload deploy done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

async function main() {
  if (REMOTE_WEB_BUILD) {
    await deployRemoteBuild();
  } else {
    await deployUploadBundle();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
