#!/usr/bin/env node
const { Client } = require('ssh2');
const path = require('path');
const PASSWORD = process.env.DEPLOY_PASSWORD;
const gz = path.join(__dirname, 'pulsewatch-api.gz');

const c = new Client();
c.on('ready', () => {
  console.log('SSH ready, stopping API...');
  c.exec(`echo '${PASSWORD.replace(/'/g, "'\\''")}' | sudo -S systemctl stop pulsewatch-api; sudo -S systemctl reset-failed pulsewatch-api 2>/dev/null; true`, () => {
    c.sftp((e, sftp) => {
      console.log('Uploading gzip binary...');
      const start = Date.now();
      sftp.fastPut(gz, '/tmp/pulsewatch-api.gz', {}, (err) => {
        if (err) { console.error(err); process.exit(1); }
        console.log(`Uploaded in ${((Date.now() - start) / 1000).toFixed(1)}s`);
        const cmd = [
          'gunzip -c /tmp/pulsewatch-api.gz > /tmp/pulsewatch-api.new',
          'chmod +x /tmp/pulsewatch-api.new',
          'mv /tmp/pulsewatch-api.new /opt/pulsewatch/api/pulsewatch-api',
          'rm -f /tmp/pulsewatch-api.gz',
          `echo '${PASSWORD.replace(/'/g, "'\\''")}' | sudo -S systemctl start pulsewatch-api`,
          'sleep 4',
          'systemctl is-active pulsewatch-api',
          'curl -s http://127.0.0.1:4000/health',
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
