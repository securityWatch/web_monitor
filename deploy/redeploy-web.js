const { Client } = require('ssh2');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOST = process.env.DEPLOY_HOST || '49.234.112.108';
const ROOT = path.join(__dirname, '..');

if (!process.env.SKIP_WEB_BUILD) {
  execSync('npm run build', {
    cwd: path.join(ROOT, 'apps/web'),
    stdio: 'inherit',
  });
}

const webTar = path.join(__dirname, 'web-bundle.tar.gz');
execSync(`tar -hczf "${webTar}" -C "${path.join(ROOT, 'apps/web')}" .next/standalone .next/static public`, { shell: true, stdio: 'inherit' });

const c = new Client();
c.on('ready', () => {
  c.sftp((e, sftp) => {
    sftp.fastPut(webTar, '/tmp/web-bundle.tar.gz', () => {
      const pw = (process.env.DEPLOY_PASSWORD || 'prs@2018').replace(/'/g, "'\\''");
      const localSize = fs.statSync(webTar).size;
      c.exec(`echo '${pw}' | sudo -S systemctl stop pulsewatch-web && test $(stat -c%s /tmp/web-bundle.tar.gz) -eq ${localSize} && cd /opt/pulsewatch/web && tar -xzf /tmp/web-bundle.tar.gz && cp -r .next/static .next/standalone/apps/web/.next/ && cp -r public .next/standalone/apps/web/ && printf 'INTERNAL_API_URL=http://127.0.0.1:4000\\nPORT=3000\\nHOSTNAME=0.0.0.0\\n' > /opt/pulsewatch/web/.env && echo '${pw}' | sudo -S sed -i '/^Environment=NEXT_PUBLIC_API_URL=/d' /etc/systemd/system/pulsewatch-web.service && echo '${pw}' | sudo -S grep -q 'INTERNAL_API_URL' /etc/systemd/system/pulsewatch-web.service || echo '${pw}' | sudo -S sed -i '/^Environment=HOSTNAME=/a Environment=INTERNAL_API_URL=http://127.0.0.1:4000' /etc/systemd/system/pulsewatch-web.service && echo '${pw}' | sudo -S sed -i 's|HOSTNAME=127.0.0.1|HOSTNAME=0.0.0.0|' /etc/systemd/system/pulsewatch-web.service && echo '${pw}' | sudo -S systemctl daemon-reload && echo '${pw}' | sudo -S systemctl start pulsewatch-web && sleep 5 && curl -s -o /dev/null -w "3000en:%{http_code}\\n" http://127.0.0.1:3000/en && curl -s -o /dev/null -w "80en:%{http_code}\\n" http://127.0.0.1/en`, (e2, s) => {
        s.on('data', d => process.stdout.write(d));
        s.stderr.on('data', d => process.stderr.write(d));
        s.on('close', () => { c.end(); fs.unlinkSync(webTar); });
      });
    });
  });
});
c.connect({ host: HOST, username: 'ubuntu', password: 'prs@2018' });
