#!/usr/bin/env node
/** Patch DINGTALK_WEBHOOK_URL on server (never commit webhook URL). */
const { withConn, exec, sudo, readRemote, uploadBuffer } = require('./lib/ssh2');

const url = process.env.DINGTALK_WEBHOOK_URL;
if (!url) {
  console.error('Set DINGTALK_WEBHOOK_URL env var');
  process.exit(1);
}

function upsertEnv(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) return text.replace(re, line);
  return text.trimEnd() + '\n' + line + '\n';
}

withConn(async (conn) => {
  const envPath = '/opt/pulsewatch/api/.env';
  const env = upsertEnv(await readRemote(conn, envPath), 'DINGTALK_WEBHOOK_URL', url);
  await uploadBuffer(conn, Buffer.from(env), '/tmp/pulsewatch-api.env');
  await exec(conn, 'mv /tmp/pulsewatch-api.env ' + envPath + ' && chmod 600 ' + envPath);
  await sudo(conn, 'systemctl restart pulsewatch-api');
  await exec(conn, 'sleep 2 && curl -sf http://127.0.0.1:4000/health');
  console.log('[pulsewatch] DingTalk webhook configured');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
