const { Client } = require('ssh2');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
execSync('npm run build', { cwd: path.join(ROOT, 'apps/web'), stdio: 'inherit' });

const webTar = path.join(__dirname, 'web-bundle.tar.gz');
execSync(`tar -czf "${webTar}" -C "${path.join(ROOT, 'apps/web')}" .next/standalone .next/static public`, { shell: true, stdio: 'inherit' });

const c = new Client();
c.on('ready', () => {
  c.sftp((e, sftp) => {
    sftp.fastPut(webTar, '/tmp/web-bundle.tar.gz', () => {
      c.exec(`cd /opt/pulsewatch/web && tar -xzf /tmp/web-bundle.tar.gz && cp -r .next/static .next/standalone/apps/web/.next/ && cp -r public .next/standalone/apps/web/ && echo 'prs@2018' | sudo -S systemctl restart pulsewatch-web && sleep 3 && echo 'prs@2018' | sudo -S ufw allow 80/tcp 2>/dev/null; echo 'prs@2018' | sudo -S ufw allow 4000/tcp 2>/dev/null; echo 'prs@2018' | sudo -S ufw allow 3000/tcp 2>/dev/null; timeout 5 curl -s -o /dev/null -w "WEB:%{http_code}" http://127.0.0.1:3000/en`, (e2, s) => {
        s.on('data', d => process.stdout.write(d));
        s.on('close', () => { c.end(); fs.unlinkSync(webTar); });
      });
    });
  });
});
c.connect({ host: '49.234.112.108', username: 'ubuntu', password: 'prs@2018' });
