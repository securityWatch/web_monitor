const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  c.exec(`echo 'prs@2018' | sudo -S -u postgres psql -p 6541 -c "ALTER USER postgres WITH PASSWORD 'prs@2018';" 2>&1; ls -la /opt/pulsewatch/web/.next/standalone/ 2>&1; find /opt/pulsewatch/web -name server.js 2>&1`, (e,s) => {
    s.on('data', d => process.stdout.write(d));
    s.on('close', () => c.end());
  });
});
c.connect({ host: '49.234.112.108', username: 'ubuntu', password: 'prs@2018' });
