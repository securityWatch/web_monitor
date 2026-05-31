#!/usr/bin/env node
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const PASSWORD = process.env.DEPLOY_PASSWORD || 'prs@2018';
const gz = path.join(__dirname, 'web-bundle.tar.gz');
const localSize = fs.statSync(gz).size;

const c = new Client();
c.on('ready', () => {
  console.log(`SSH ready (local bundle ${localSize} bytes), stopping web...`);
  c.exec(`echo '${PASSWORD.replace(/'/g, "'\\''")}' | sudo -S systemctl stop pulsewatch-web`, () => {
    c.sftp((e, sftp) => {
      const remote = '/tmp/web-bundle.upload.tar.gz';
      console.log('Uploading web bundle...');
      const start = Date.now();
      sftp.fastPut(gz, remote, {}, (err) => {
        if (err) { console.error(err); process.exit(1); }
        console.log(`Uploaded in ${((Date.now() - start) / 1000).toFixed(1)}s`);
        const cmd = [
          `test $(stat -c%s ${remote}) -eq ${localSize}`,
          `mv ${remote} /tmp/web-bundle.tar.gz`,
          'cd /opt/pulsewatch/web && tar -xzf /tmp/web-bundle.tar.gz',
          'cp -r .next/static .next/standalone/apps/web/.next/',
          'cp -r public .next/standalone/apps/web/',
          "printf 'INTERNAL_API_URL=http://127.0.0.1:4000\\nPORT=3000\\nHOSTNAME=0.0.0.0\\n' > /opt/pulsewatch/web/.env",
          `echo '${PASSWORD.replace(/'/g, "'\\''")}' | sudo -S systemctl start pulsewatch-web`,
          'sleep 8',
          'systemctl is-active pulsewatch-web',
          'curl -s -o /dev/null -w "3000:%{http_code}\\n" http://127.0.0.1:3000/en',
          'curl -s -o /dev/null -w "80:%{http_code}\\n" http://127.0.0.1/en',
          'rm -f /tmp/web-bundle.tar.gz',
        ].join(' && ');
        c.exec(cmd, (e2, s) => {
          s.on('data', (d) => process.stdout.write(d));
          s.stderr.on('data', (d) => process.stderr.write(d));
          s.on('close', (code) => {
            c.end();
            process.exit(code || 0);
          });
        });
      });
    });
  });
});
c.on('error', (e) => { console.error(e); process.exit(1); });
c.connect({ host: '49.234.112.108', username: 'ubuntu', password: PASSWORD, readyTimeout: 30000 });
