const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');
const PASS = process.env.DEPLOY_PASSWORD;
const HOST = process.env.DEPLOY_HOST || '49.234.112.108';
const confPath = path.join(__dirname, 'nginx', 'pulsewatch.conf');
function exec(conn, cmd) {
  return new Promise((resolve) => {
    console.log('>>', cmd.slice(0, 80));
    conn.exec(cmd, (e, s) => {
      s.on('data', d => process.stdout.write(d));
      s.stderr.on('data', d => process.stderr.write(d));
      s.on('close', c => resolve(c || 0));
    });
  });
}
function sudo(conn, cmd) {
  return exec(conn, `echo '${PASS.replace(/'/g, "'\\''")}' | sudo -S bash -c ${JSON.stringify(cmd)}`);
}
const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    sftp.fastPut(confPath, '/tmp/pulsewatch.conf', async (e) => {
      if (e) throw e;
      await sudo(conn, 'mv /tmp/pulsewatch.conf /etc/nginx/sites-available/pulsewatch');
      await sudo(conn, 'ln -sf /etc/nginx/sites-available/pulsewatch /etc/nginx/sites-enabled/pulsewatch');
      await sudo(conn, 'rm -f /etc/nginx/sites-enabled/default');
      await sudo(conn, 'nginx -t && systemctl reload nginx');
      await sudo(conn, `sed -i 's|NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=http://${HOST}|' /etc/systemd/system/pulsewatch-web.service`);
      await sudo(conn, "sed -i 's|HOSTNAME=127.0.0.1|HOSTNAME=0.0.0.0|' /etc/systemd/system/pulsewatch-web.service");
      await exec(conn, `printf 'NEXT_PUBLIC_API_URL=http://${HOST}\\nPORT=3000\\nHOSTNAME=0.0.0.0\\n' > /opt/pulsewatch/web/.env`);
      await sudo(conn, 'ufw allow 80/tcp 2>/dev/null || true');
      await sudo(conn, 'systemctl daemon-reload && systemctl restart pulsewatch-web');
      await exec(conn, 'sleep 4; systemctl is-active nginx pulsewatch-web; curl -s -o /dev/null -w "80en:%{http_code}\\n" http://127.0.0.1/en; curl -s http://127.0.0.1/health; ss -tlnp | grep -E ":(80|3000|4000) "');
      conn.end();
    });
  });
}).connect({ host: HOST, port: 22, username: 'ubuntu', password: PASS, readyTimeout: 20000 });
