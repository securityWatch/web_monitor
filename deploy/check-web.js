const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  c.exec('journalctl -u pulsewatch-web -n 20 --no-pager; echo ---; ps aux | grep node; echo ---; timeout 3 curl -v http://127.0.0.1:3000/en 2>&1 | head -20', (e,s) => {
    s.on('data', d => process.stdout.write(d));
    s.on('close', () => c.end());
  });
});
c.connect({ host: '49.234.112.108', username: 'ubuntu', password: 'prs@2018' });
