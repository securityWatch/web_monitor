#!/usr/bin/env node
/** Patch 163 SMTP settings on server (credentials via env vars only — never commit). */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sshExec, scpToRemote } = require('./lib/ssh');

const required = ['SMTP_USER', 'SMTP_PASS'];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`Set ${k} env var`);
    process.exit(1);
  }
}

const keys = {
  SMTP_MODE: process.env.SMTP_MODE || 'smtp',
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.163.com',
  SMTP_PORT: process.env.SMTP_PORT || '465',
  SMTP_SECURE: process.env.SMTP_SECURE || 'true',
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM || process.env.SMTP_USER,
};

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
  let env = await readRemoteEnv(envPath);
  for (const [k, v] of Object.entries(keys)) {
    env = upsertEnv(env, k, v);
  }
  const tmp = path.join(os.tmpdir(), 'pulsewatch-api.env');
  fs.writeFileSync(tmp, env);
  await scpToRemote(tmp, '/tmp/pulsewatch-api.env');
  await sshExec(`mv /tmp/pulsewatch-api.env ${envPath} && chmod 600 ${envPath}`);
  await sshExec('sudo systemctl restart pulsewatch-api');
  const health = await sshExec('sleep 2 && curl -sf http://127.0.0.1:4000/health');
  console.log('[pulsewatch] SMTP configured');
  console.log(health.stdout.trim());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
