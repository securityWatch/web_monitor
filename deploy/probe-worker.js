const { Client } = require('ssh2');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOST = process.env.DEPLOY_HOST || 'YOUR_SERVER_IP';
const APP_DIR = '/opt/pulsewatch';
const ROOT = path.join(__dirname, '..');

execSync('go build -o pulsewatch-probe ./cmd/probe-worker', {
  cwd: path.join(ROOT, 'apps/api'),
  env: { ...process.env, GOOS: 'linux', GOARCH: 'amd64', CGO_ENABLED: '0' },
  stdio: 'inherit',
});

const binary = path.join(ROOT, 'apps/api/pulsewatch-probe');
const unitUsEast = `[Unit]
Description=PulseWatch Probe Worker (us-east)
After=network.target pulsewatch-api.service

[Service]
Type=simple
WorkingDirectory=${APP_DIR}/api
EnvironmentFile=${APP_DIR}/api/.env
Environment=PROBE_REGION=us-east
Environment=PROBE_API_URL=http://127.0.0.1:4000
ExecStart=${APP_DIR}/api/pulsewatch-probe
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;

const unitApSoutheast = unitUsEast.replace('us-east', 'ap-southeast').replace('(us-east)', '(ap-southeast)');

const c = new Client();
c.on('ready', () => {
  c.sftp((e, sftp) => {
    sftp.writeFile('/tmp/pulsewatch-probe', fs.readFileSync(binary), () => {
      const script = `
sudo mv /tmp/pulsewatch-probe ${APP_DIR}/api/pulsewatch-probe
sudo chmod +x ${APP_DIR}/api/pulsewatch-probe
echo '${unitUsEast.replace(/'/g, "'\\''")}' | sudo tee /etc/systemd/system/pulsewatch-probe-us-east.service > /dev/null
echo '${unitApSoutheast.replace(/'/g, "'\\''")}' | sudo tee /etc/systemd/system/pulsewatch-probe-ap-southeast.service > /dev/null
grep -q '^PROBE_DISPATCH=' ${APP_DIR}/api/.env || echo 'PROBE_DISPATCH=true' | sudo tee -a ${APP_DIR}/api/.env
grep -q '^PROBE_SECRET=' ${APP_DIR}/api/.env || echo 'PROBE_SECRET=pulsewatch-probe-dev-secret' | sudo tee -a ${APP_DIR}/api/.env
sudo sed -i 's|^PROBE_DISPATCH=.*|PROBE_DISPATCH=true|' ${APP_DIR}/api/.env
sudo systemctl daemon-reload
sudo systemctl enable pulsewatch-probe-us-east pulsewatch-probe-ap-southeast
sudo systemctl restart pulsewatch-probe-us-east pulsewatch-probe-ap-southeast pulsewatch-api
sleep 2
curl -s http://127.0.0.1:4000/health
`;
      c.exec(`bash -lc "${script.replace(/"/g, '\\"')}"`, (e2, s) => {
        s.on('data', (d) => process.stdout.write(d));
        s.stderr.on('data', (d) => process.stderr.write(d));
        s.on('close', () => c.end());
      });
    });
  });
});
c.connect({ host: HOST, username: 'ubuntu', password: PASSWORD });
