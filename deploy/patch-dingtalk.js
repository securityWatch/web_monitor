#!/usr/bin/env node
/** Patch DINGTALK_WEBHOOK_URL on server (never commit webhook URL). */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sshExec, scpToRemote } = require('./lib/ssh');

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

async function readRemoteEnv(envPath) {
  const r = await sshExec(`cat ${envPath} 2>/dev/null || true`);
  return r.stdout || '';
}

async function main() {
  const envPath = '/opt/pulsewatch/api/.env';
  const env = upsertEnv(await readRemoteEnv(envPath), 'DINGTALK_WEBHOOK_URL', url);
  const tmp = path.join(os.tmpdir(), 'pulsewatch-api.env');
  fs.writeFileSync(tmp, env);
  await scpToRemote(tmp, '/tmp/pulsewatch-api.env');
  await sshExec(`mv /tmp/pulsewatch-api.env ${envPath} && chmod 600 ${envPath}`);
  await sshExec('sudo systemctl restart pulsewatch-api');
  const health = await sshExec('sleep 2 && curl -sf http://127.0.0.1:4000/health');
  console.log('[pulsewatch] DingTalk webhook configured');
  console.log(health.stdout.trim());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
