const { Client } = require('ssh2');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOST = process.env.DEPLOY_HOST || '49.234.112.108';
const ROOT = path.join(__dirname, '..');

execSync('npm run build', {
  cwd: path.join(ROOT, 'apps/web'),
  stdio: 'inherit',
  env: { ...process.env, NEXT_PUBLIC_API_URL: `http://${HOST}` },
});

const webTar = path.join(__dirname, 'web-bundle.tar.gz');
execSync(`tar -czf "${webTar}" -C "${path.join(ROOT, 'apps/web')}" .next/standalone .next/static public`, { shell: true, stdio: 'inherit' });

const c = new Client();
c.on('ready', () => {
  c.sftp((e, sftp) => {
    sftp.fastPut(webTar, '/tmp/web-bundle.tar.gz', () => {
      c.exec(`cd /opt/pulsewatch/web && tar -xzf /tmp/web-bundle.tar.gz && cp -r .next/static .next/standalone/apps/web/.next/ && cp -r public .next/standalone/apps/web/ && printf 'NEXT_PUBLIC_API_URL=http://${HOST}\\nPORT=3000\\nHOSTNAME=0.0.0.0\\n' > /opt/pulsewatch/web/.env && echo 'prs@2018' | sudo -S sed -i 's|NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=http://${HOST}|' /etc/systemd/system/pulsewatch-web.service && echo 'prs@2018' | sudo -S sed -i 's|HOSTNAME=127.0.0.1|HOSTNAME=0.0.0.0|' /etc/systemd/system/pulsewatch-web.service && echo 'prs@2018' | sudo -S systemctl daemon-reload && echo 'prs@2018' | sudo -S systemctl restart pulsewatch-web && sleep 5 && curl -s -o /dev/null -w "3000en:%{http_code}\\n" http://127.0.0.1:3000/en && curl -s -o /dev/null -w "80en:%{http_code}\\n" http://127.0.0.1/en`, (e2, s) => {
        s.on('data', d => process.stdout.write(d));
        s.stderr.on('data', d => process.stderr.write(d));
        s.on('close', () => { c.end(); fs.unlinkSync(webTar); });
      });
    });
  });
});
c.connect({ host: HOST, username: 'ubuntu', password: 'prs@2018' });
