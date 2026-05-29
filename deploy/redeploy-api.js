const { Client } = require('ssh2');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { buildCorsOrigins } = require('./lib/cors-origins');

const HOST = process.env.DEPLOY_HOST || '49.234.112.108';
const APP_DOMAINS = process.env.APP_DOMAINS || 'gkao.com.cn';
const APP_DIR = '/opt/pulsewatch';
const ROOT = path.join(__dirname, '..');
const CORS_ORIGINS = buildCorsOrigins(HOST, APP_DOMAINS);

execSync('go build -o pulsewatch-api ./cmd/server', {
  cwd: path.join(ROOT, 'apps/api'),
  env: { ...process.env, GOOS: 'linux', GOARCH: 'amd64', CGO_ENABLED: '0' },
  stdio: 'inherit',
});

const binary = path.join(ROOT, 'apps/api/pulsewatch-api');
const c = new Client();
c.on('ready', () => {
  c.sftp((e, sftp) => {
    sftp.fastPut(binary, '/tmp/pulsewatch-api', () => {
      const patchEnv = `
if grep -q '^CORS_ORIGINS=' ${APP_DIR}/api/.env 2>/dev/null; then
  sed -i 's|^CORS_ORIGINS=.*|CORS_ORIGINS=${CORS_ORIGINS}|' ${APP_DIR}/api/.env
else
  echo 'CORS_ORIGINS=${CORS_ORIGINS}' >> ${APP_DIR}/api/.env
fi`;
      c.exec(`mv /tmp/pulsewatch-api ${APP_DIR}/api/pulsewatch-api && chmod +x ${APP_DIR}/api/pulsewatch-api && ${patchEnv} && echo prs@2018 | sudo -S systemctl restart pulsewatch-api && sleep 3 && curl -s http://127.0.0.1:4000/health`, (e2, s) => {
        s.on('data', d => process.stdout.write(d));
        s.stderr.on('data', d => process.stderr.write(d));
        s.on('close', () => c.end());
      });
    });
  });
});
c.connect({ host: HOST, username: 'ubuntu', password: 'prs@2018' });
