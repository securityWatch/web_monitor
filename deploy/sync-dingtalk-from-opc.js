#!/usr/bin/env node
/** Copy DINGTALK_WEBHOOK_URL from opc-api .env to pulsewatch-api .env and restart API. */
const { sshExec } = require('./lib/ssh');

async function main() {
  const script = `bash -lc 'set -e
URL=$(grep ^DINGTALK_WEBHOOK_URL= /opt/opc-api/.env | cut -d= -f2- | tr -d "\\r")
PW=/opt/pulsewatch/api/.env
test -n "$URL"
if grep -q ^DINGTALK_WEBHOOK_URL= "$PW" 2>/dev/null; then
  sed -i "s|^DINGTALK_WEBHOOK_URL=.*|DINGTALK_WEBHOOK_URL=$URL|" "$PW"
else
  printf "\\nDINGTALK_WEBHOOK_URL=%s\\n" "$URL" >> "$PW"
fi
grep -q ^DINGTALK_WEBHOOK_URL= "$PW"
sudo systemctl restart pulsewatch-api
sleep 2
curl -sf http://127.0.0.1:4000/health'`;
  const r = await sshExec(script);
  console.log('[pulsewatch] DingTalk webhook synced from opc');
  console.log(r.stdout.trim());
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
