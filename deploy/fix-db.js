const { Client } = require('ssh2');
const PASSWORD = process.env.DEPLOY_PASSWORD;
const HOST = process.env.DEPLOY_HOST || 'YOUR_SERVER_IP';
const c = new Client();
c.on('ready', () => {
  c.exec(`echo '${PASSWORD}' | sudo -S -u postgres psql -p 6541 -c "ALTER USER postgres WITH PASSWORD '${PASSWORD}';" 2>&1; ls -la /opt/pulsewatch/web/.next/standalone/ 2>&1; find /opt/pulsewatch/web -name server.js 2>&1`, (e,s) => {
    s.on('data', d => process.stdout.write(d));
    s.on('close', () => c.end());
  });
});
c.connect({ host: HOST, username: 'ubuntu', password: PASSWORD });
