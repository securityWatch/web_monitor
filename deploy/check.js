const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  const cmd = [
    'systemctl is-active pulsewatch-api pulsewatch-web nginx 2>&1',
    'journalctl -u pulsewatch-api -n 15 --no-pager 2>&1',
    'journalctl -u pulsewatch-web -n 15 --no-pager 2>&1',
    'curl -s --max-time 3 http://127.0.0.1:4000/health || echo API_FAIL',
    'curl -s --max-time 3 -o /dev/null -w "WEB:%{http_code}" http://127.0.0.1:3000/en || echo WEB_FAIL',
    'ss -tlnp | grep -E "4000|3000|80" || netstat -tlnp 2>/dev/null | grep -E "4000|3000|80"',
  ].join(' ; echo "===" ; ');
  c.exec(cmd, (e, s) => {
    s.on('data', d => process.stdout.write(d));
    s.stderr.on('data', d => process.stderr.write(d));
    s.on('close', () => { c.end(); process.exit(0); });
  });
});
c.on('error', e => { console.error(e); process.exit(1); });
setTimeout(() => { console.error('timeout'); process.exit(1); }, 25000);
c.connect({ host: '49.234.112.108', username: 'ubuntu', password: 'prs@2018', readyTimeout: 20000 });
