#!/usr/bin/env node
/** Fast API deploy: stripped binary, gzip+scp, skip if SHA256 unchanged, stop-before-swap. */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { HOST, APP_DIR, ROOT, APP_DOMAINS, PASSWORD } = require('./lib/config');
const { buildCorsOrigins } = require('./lib/cors-origins');
const { sha256File } = require('./lib/hash');
const { sshExec, scpToRemote, shellQuote } = require('./lib/ssh');

const CORS_ORIGINS = buildCorsOrigins(HOST, APP_DOMAINS);
const binary = path.join(ROOT, 'apps/api/pulsewatch-api');
const gzPath = path.join(__dirname, '.cache/pulsewatch-api.gz');

async function main() {
  const t0 = Date.now();
  console.log('[api] Building linux/amd64 (stripped)...');
  execSync('go build -ldflags="-s -w" -o pulsewatch-api ./cmd/server', {
    cwd: path.join(ROOT, 'apps/api'),
    env: { ...process.env, GOOS: 'linux', GOARCH: 'amd64', CGO_ENABLED: '0', GOTOOLCHAIN: 'auto' },
    stdio: 'inherit',
  });

  const localHash = sha256File(binary);
  const remoteHash = (await sshExec(`sha256sum ${APP_DIR}/api/pulsewatch-api 2>/dev/null | awk '{print $1}'`)).stdout.trim();

  if (remoteHash === localHash && !process.env.FORCE_DEPLOY) {
    console.log('[api] Binary unchanged — skip upload');
  } else {
    fs.mkdirSync(path.dirname(gzPath), { recursive: true });
    const rawBuf = fs.readFileSync(binary);
    fs.writeFileSync(gzPath, zlib.gzipSync(rawBuf, { level: 9 }));
    const raw = rawBuf.length;
    const gz = fs.statSync(gzPath).size;
    console.log(`[api] Upload ${(gz / 1024 / 1024).toFixed(1)}MB gz (was ${(raw / 1024 / 1024).toFixed(1)}MB raw)...`);
    await scpToRemote(gzPath, '/tmp/pulsewatch-api.gz');
  }

  const pw = shellQuote(PASSWORD);
  const patchEnv = `
if grep -q '^CORS_ORIGINS=' ${APP_DIR}/api/.env 2>/dev/null; then
  sed -i 's|^CORS_ORIGINS=.*|CORS_ORIGINS=${CORS_ORIGINS}|' ${APP_DIR}/api/.env
else
  echo 'CORS_ORIGINS=${CORS_ORIGINS}' >> ${APP_DIR}/api/.env
fi`;
  const cmd = remoteHash === localHash && !process.env.FORCE_DEPLOY
    ? `curl -s http://127.0.0.1:4000/health`
    : `echo ${pw} | sudo -S systemctl stop pulsewatch-api
gunzip -c /tmp/pulsewatch-api.gz > /tmp/pulsewatch-api.new
chmod +x /tmp/pulsewatch-api.new
mv /tmp/pulsewatch-api.new ${APP_DIR}/api/pulsewatch-api
rm -f /tmp/pulsewatch-api.gz
${patchEnv}
echo ${pw} | sudo -S systemctl start pulsewatch-api
sleep 2
curl -s http://127.0.0.1:4000/health`;

  const { code, stdout } = await sshExec(cmd);
  process.stdout.write(stdout);
  if (code !== 0) process.exit(code);
  console.log(`[api] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
