const { Client } = require('ssh2');
const PASSWORD = process.env.DEPLOY_PASSWORD;
const HOST = process.env.DEPLOY_HOST || '49.234.112.108';
const APP = '/opt/pulsewatch';
const webService = `[Unit]
Description=PulseWatch Web
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=${APP}/web/.next/standalone/apps/web
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
Environment=NEXT_PUBLIC_API_URL=http://${HOST}
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;

const c = new Client();
c.on('ready', () => {
  c.exec(`cat > /tmp/pw-web.service << 'ENDOFFILE'
${webService}ENDOFFILE
cp -r ${APP}/web/.next/static ${APP}/web/.next/standalone/apps/web/.next/ 2>/dev/null || true
cp -r ${APP}/web/public ${APP}/web/.next/standalone/apps/web/ 2>/dev/null || true
echo '${PASSWORD}' | sudo -S cp /tmp/pw-web.service /etc/systemd/system/pulsewatch-web.service
echo '${PASSWORD}' | sudo -S systemctl daemon-reload
echo '${PASSWORD}' | sudo -S systemctl restart pulsewatch-web
sleep 5
systemctl is-active pulsewatch-web
curl -s -o /dev/null -w "WEB:%{http_code}" http://127.0.0.1:3000/en
journalctl -u pulsewatch-web -n 5 --no-pager`, (e,s) => {
    s.on('data', d => process.stdout.write(d));
    s.stderr.on('data', d => process.stderr.write(d));
    s.on('close', () => c.end());
  });
});
c.connect({ host: HOST, username: 'ubuntu', password: PASSWORD });
