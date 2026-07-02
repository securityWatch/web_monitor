const { Client } = require('ssh2');
const PASSWORD = process.env.DEPLOY_PASSWORD;
const HOST = process.env.DEPLOY_HOST || 'YOUR_SERVER_IP';
const APP = '/opt/pulsewatch';
const c = new Client();
c.on('ready', () => {
  const cmd = [
    `cd ${APP}/web && cp -r .next/static .next/standalone/apps/web/.next/ 2>/dev/null; cp -r public .next/standalone/apps/web/ 2>/dev/null`,
    `cat > /tmp/pulsewatch-web.service << 'EOF'
[Unit]
Description=PulseWatch Web
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=${APP}/web/.next/standalone/apps/web
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
Environment=NEXT_PUBLIC_API_URL=http://${HOST}:4000
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF`,
    `echo '${PASSWORD}' | sudo -S mv /tmp/pulsewatch-web.service /etc/systemd/system/pulsewatch-web.service`,
    `echo '${PASSWORD}' | sudo -S systemctl daemon-reload`,
    `echo '${PASSWORD}' | sudo -S systemctl restart pulsewatch-api pulsewatch-web`,
    'sleep 6',
    'curl -s http://127.0.0.1:4000/health',
    'curl -s -o /dev/null -w "WEB:%{http_code}" http://127.0.0.1:3000/en',
    'systemctl is-active pulsewatch-api pulsewatch-web',
  ].join(' ; ');
  c.exec(cmd, (e,s) => {
    s.on('data', d => process.stdout.write(d));
    s.on('close', () => c.end());
  });
});
c.connect({ host: HOST, username: 'ubuntu', password: PASSWORD });
