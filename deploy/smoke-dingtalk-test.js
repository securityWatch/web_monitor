#!/usr/bin/env node
/** Send a manual DingTalk test message; sync webhook from opc to pulsewatch if needed. */
const { sshExec } = require('./lib/ssh');
const https = require('https');
const http = require('http');

function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      u,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  let r = await sshExec('grep ^DINGTALK_WEBHOOK_URL= /opt/pulsewatch/api/.env 2>/dev/null | cut -d= -f2- | tr -d "\\r"');
  let url = r.stdout.trim();
  if (!url) {
    r = await sshExec('grep ^DINGTALK_WEBHOOK_URL= /opt/opc-api/.env 2>/dev/null | cut -d= -f2- | tr -d "\\r"');
    url = r.stdout.trim();
  }
  if (!url) {
    console.error('No DINGTALK_WEBHOOK_URL on server (pulsewatch or opc)');
    process.exit(1);
  }

  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  const text = `测试\n【PulseWatch 通知测试】\n这是一条手动测试消息\n时间：${now}`;
  const res = await postJSON(url, JSON.stringify({ msgtype: 'text', text: { content: text } }));
  console.log('[dingtalk] HTTP', res.status);
  console.log('[dingtalk]', res.body.trim());

  const syncCmd = [
    'PW=/opt/pulsewatch/api/.env',
    'URL=$(grep ^DINGTALK_WEBHOOK_URL= /opt/opc-api/.env | cut -d= -f2- | tr -d "\\r")',
    'if [ -n "$URL" ]; then',
    '  if grep -q ^DINGTALK_WEBHOOK_URL= "$PW" 2>/dev/null; then',
    '    sed -i "s|^DINGTALK_WEBHOOK_URL=.*|DINGTALK_WEBHOOK_URL=$URL|" "$PW"',
    '  else',
    '    printf "\\nDINGTALK_WEBHOOK_URL=%s\\n" "$URL" >> "$PW"',
    '  fi',
    '  sudo systemctl restart pulsewatch-api',
    '  sleep 2',
    '  curl -sf http://127.0.0.1:4000/health',
    'fi',
  ].join(' ');
  const health = await sshExec(syncCmd);
  if (health.stdout.trim()) {
    console.log('[pulsewatch] webhook synced, api health:', health.stdout.trim());
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
