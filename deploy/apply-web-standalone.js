#!/usr/bin/env node
/** Extract web bundle and align monorepo standalone layout + systemd (see DEPLOYMENT.md). */
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const PASSWORD = process.env.DEPLOY_PASSWORD;
const APP = '/opt/pulsewatch';
const gz = path.join(__dirname, 'web-bundle.tar.gz');
const localSize = fs.statSync(gz).size;

const webService = `[Unit]
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
`;

const c = new Client();
c.on('ready', () => {
  const pw = PASSWORD.replace(/'/g, "'\\''");
  c.exec(`echo '${pw}' | sudo -S systemctl stop pulsewatch-web`, () => {
    c.sftp((err, sftp) => {
      const remote = '/tmp/web-bundle.upload.tar.gz';
      console.log(`Uploading ${localSize} bytes...`);
      sftp.fastPut(gz, remote, {}, (e1) => {
        if (e1) { console.error(e1); process.exit(1); }
        const cmd = [
          `test $(stat -c%s ${remote}) -eq ${localSize}`,
          `cd ${APP}/web && tar -xzf ${remote}`,
          `cp -r ${APP}/web/.next/static ${APP}/web/.next/standalone/apps/web/.next/`,
          `cp -r ${APP}/web/public ${APP}/web/.next/standalone/apps/web/`,
          `test -f ${APP}/web/.next/standalone/apps/web/server.js`,
          `cat > /tmp/pw-web.service << 'EOF'\n${webService}EOF`,
          `echo '${pw}' | sudo -S cp /tmp/pw-web.service /etc/systemd/system/pulsewatch-web.service`,
          `echo '${pw}' | sudo -S systemctl daemon-reload`,
          `echo '${pw}' | sudo -S systemctl start pulsewatch-web`,
          'sleep 8',
          'systemctl is-active pulsewatch-web',
          'curl -s -o /dev/null -w "3000:%{http_code}\\n" http://127.0.0.1:3000/en',
          'curl -s -o /dev/null -w "reg:%{http_code}\\n" http://127.0.0.1:3000/en/register',
          'curl -s -o /dev/null -w "80:%{http_code}\\n" http://127.0.0.1/en',
          `rm -f ${remote}`,
        ].join(' && ');
        c.exec(cmd, (e2, s) => {
          s.on('data', (d) => process.stdout.write(d));
          s.stderr.on('data', (d) => process.stderr.write(d));
          s.on('close', (code) => { c.end(); process.exit(code || 0); });
        });
      });
    });
  });
});
c.on('error', (e) => { console.error(e); process.exit(1); });
c.connect({ host: '49.234.112.108', username: 'ubuntu', password: PASSWORD, readyTimeout: 30000 });
