const { HOST, PASSWORD } = require('./lib/config');
const c = new Client();
c.on('ready', () => {
  const script = fs.readFileSync(require('path').join(__dirname, '..', 'tests', 'e2e-test.sh'), 'utf8').replace(/\r\n/g, '\n');
  c.exec(`cat > /tmp/e2e.sh << 'EOF'\n${script}\nEOF\nchmod +x /tmp/e2e.sh\nAPI_URL=http://127.0.0.1:4000 WEB_URL=http://127.0.0.1:3000 bash /tmp/e2e.sh`, (e,s) => {
    s.on('data', d => process.stdout.write(d));
    s.stderr.on('data', d => process.stderr.write(d));
    s.on('close', code => { console.log('exit:', code); c.end(); });
  });
});
c.connect({ host: HOST, username: 'ubuntu', password: PASSWORD });
