#!/usr/bin/env node
/** Deploy PulseWatch: native Go binary + Next.js standalone + Nginx */
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { buildCorsOrigins } = require('./lib/cors-origins');

const HOST = process.env.DEPLOY_HOST || '49.234.112.108';
const USER = process.env.DEPLOY_USER || 'ubuntu';
const PASSWORD = process.env.DEPLOY_PASSWORD || 'prs@2018';
const APP_DIR = '/opt/pulsewatch';
const ROOT = path.join(__dirname, '..');

function exec(conn, cmd) {
  return new Promise((resolve) => {
    console.log(`>>> ${cmd.slice(0, 100)}`);
    conn.exec(cmd, (err, stream) => {
      if (err) { console.error(err); return resolve(1); }
      stream.on('data', (d) => process.stdout.write(d));
      stream.stderr.on('data', (d) => process.stderr.write(d));
      stream.on('close', (code) => resolve(code || 0));
    });
  });
}

function sudo(conn, cmd) {
  return exec(conn, `echo '${PASSWORD.replace(/'/g, "'\\''")}' | sudo -S bash -c ${JSON.stringify(cmd)}`);
}

function upload(sftp, local, remote) {
  return new Promise((res, rej) => sftp.fastPut(local, remote, (e) => e ? rej(e) : res()));
}

async function main() {
  // Cross-compile API
  console.log('Building Go API for linux/amd64...');
  execSync('go build -o pulsewatch-api ./cmd/server', {
    cwd: path.join(ROOT, 'apps/api'),
    env: { ...process.env, GOOS: 'linux', GOARCH: 'amd64', CGO_ENABLED: '0' },
    stdio: 'inherit',
  });

  const conn = new Client();
  await new Promise((res, rej) => {
    conn.on('ready', res);
    conn.on('error', rej);
    conn.connect({ host: HOST, port: 22, username: USER, password: PASSWORD, readyTimeout: 30000 });
  });
  console.log('SSH connected.');

  // Install deps
  await sudo(conn, 'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx curl ca-certificates 2>/dev/null || true');
  await sudo(conn, 'systemctl enable nginx && systemctl start nginx || true');

  // Node.js 22 if missing
  await exec(conn, 'command -v node >/dev/null || (curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs)');

  // Database
  await sudo(conn, "sudo -u postgres psql -p 6541 -tc \"SELECT 1 FROM pg_database WHERE datname='pulsewatch'\" | grep -q 1 || sudo -u postgres psql -p 6541 -c \"CREATE DATABASE pulsewatch;\"");

  await sudo(conn, `mkdir -p ${APP_DIR}/{api,web} && chown -R ubuntu:ubuntu ${APP_DIR}`);

  const jwt1 = require('crypto').randomBytes(32).toString('hex');
  const jwt2 = require('crypto').randomBytes(32).toString('hex');
  const corsOrigins = buildCorsOrigins(HOST, process.env.APP_DOMAINS || '');
  const envContent = `DATABASE_URL=postgresql://postgres:prs%402018@127.0.0.1:6541/pulsewatch
JWT_SECRET=${jwt1}
JWT_REFRESH_SECRET=${jwt2}
PORT=4000
CORS_ORIGINS=${corsOrigins}
SMTP_MODE=console
NODE_ENV=production
HOSTNAME=0.0.0.0
`;

  const sftp = await new Promise((res, rej) => conn.sftp((e, s) => e ? rej(e) : res(s)));

  await upload(sftp, path.join(ROOT, 'apps/api/pulsewatch-api'), '/tmp/pulsewatch-api');
  await exec(conn, `mv /tmp/pulsewatch-api ${APP_DIR}/api/pulsewatch-api && chmod +x ${APP_DIR}/api/pulsewatch-api`);

  // Upload Next.js standalone
  const standalone = path.join(ROOT, 'apps/web/.next/standalone');
  const staticDir = path.join(ROOT, 'apps/web/.next/static');
  const publicDir = path.join(ROOT, 'apps/web/public');

  // Create web tarball locally
  const webTar = path.join(__dirname, 'web-bundle.tar.gz');
  if (fs.existsSync(standalone)) {
    execSync(`tar -czf "${webTar}" -C "${path.join(ROOT, 'apps/web')}" .next/standalone .next/static public`, { shell: true, stdio: 'inherit' });
    await upload(sftp, webTar, '/tmp/web-bundle.tar.gz');
    await exec(conn, `cd ${APP_DIR}/web && tar -xzf /tmp/web-bundle.tar.gz && rm /tmp/web-bundle.tar.gz`);
    await exec(conn, `cp -r ${APP_DIR}/web/.next/static ${APP_DIR}/web/.next/standalone/apps/web/.next/ && cp -r ${APP_DIR}/web/public ${APP_DIR}/web/.next/standalone/apps/web/`);
    fs.unlinkSync(webTar);
  } else {
    console.warn('Standalone build not found, uploading source for server build...');
    const srcTar = path.join(__dirname, 'web-src.tar.gz');
    execSync(`tar -czf "${srcTar}" --exclude=node_modules --exclude=.next -C "${path.join(ROOT, 'apps/web')}" .`, { shell: true });
    await upload(sftp, srcTar, '/tmp/web-src.tar.gz');
    await exec(conn, `cd ${APP_DIR}/web && tar -xzf /tmp/web-src.tar.gz && npm install && NEXT_PUBLIC_API_URL=http://${HOST} npm run build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/`);
    fs.unlinkSync(srcTar);
  }

  await exec(conn, `cat > ${APP_DIR}/api/.env << 'EOF'\n${envContent}EOF`);
  await exec(conn, `cat > ${APP_DIR}/web/.env << 'EOF'\nINTERNAL_API_URL=http://127.0.0.1:4000\nPORT=3000\nHOSTNAME=0.0.0.0\nEOF`);

  // Systemd services
  const apiService = `[Unit]
Description=PulseWatch API
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=${APP_DIR}/api
EnvironmentFile=${APP_DIR}/api/.env
ExecStart=${APP_DIR}/api/pulsewatch-api
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;

  const webService = `[Unit]
Description=PulseWatch Web
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=${APP_DIR}/web/.next/standalone/apps/web
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
Environment=INTERNAL_API_URL=http://127.0.0.1:4000
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;

  await exec(conn, `cat > /tmp/pulsewatch-api.service << 'EOF'\n${apiService}EOF`);
  await exec(conn, `cat > /tmp/pulsewatch-web.service << 'EOF'\n${webService}EOF`);
  await sudo(conn, 'mv /tmp/pulsewatch-api.service /etc/systemd/system/pulsewatch-api.service');
  await sudo(conn, 'mv /tmp/pulsewatch-web.service /etc/systemd/system/pulsewatch-web.service');

  const nginxConf = fs.readFileSync(path.join(__dirname, 'nginx', 'pulsewatch.conf'), 'utf8');
  await exec(conn, `cat > /tmp/pulsewatch-nginx << 'EOF'\n${nginxConf}EOF`);
  await sudo(conn, 'mv /tmp/pulsewatch-nginx /etc/nginx/sites-available/pulsewatch');
  await sudo(conn, 'ln -sf /etc/nginx/sites-available/pulsewatch /etc/nginx/sites-enabled/pulsewatch');
  await sudo(conn, 'rm -f /etc/nginx/sites-enabled/default');
  await sudo(conn, 'nginx -t && systemctl reload nginx');

  await sudo(conn, 'systemctl daemon-reload && systemctl enable pulsewatch-api pulsewatch-web && systemctl restart pulsewatch-api pulsewatch-web');

  await exec(conn, 'sleep 5');
  await exec(conn, 'curl -s http://127.0.0.1:4000/health');
  await exec(conn, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/en');
  await exec(conn, 'systemctl is-active pulsewatch-api pulsewatch-web nginx');

  conn.end();
  console.log(`\n? Deploy complete: http://${HOST}/en`);
}

main().catch((e) => { console.error(e); process.exit(1); });
