const { Client } = require('ssh2');
const PASSWORD = process.env.DEPLOY_PASSWORD;
const HOST = process.env.DEPLOY_HOST || 'YOUR_SERVER_IP';
const c = new Client();
c.on('ready', () => {
  c.exec(`curl -s http://127.0.0.1:4000/health; echo; curl -s -o /dev/null -w "WEB:%{http_code}" http://127.0.0.1:3000/en; echo; curl -s -o /dev/null -w "NGINX:%{http_code}" http://127.0.0.1/en; echo; sudo ufw status 2>/dev/null || true; ss -tlnp | grep -E ':80|:3000|:4000'`, (e,s) => {
    s.on('data', d => process.stdout.write(d));
    s.on('close', () => c.end());
  });
});
c.connect({ host: HOST, username: 'ubuntu', password: PASSWORD });
