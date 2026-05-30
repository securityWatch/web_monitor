#!/usr/bin/env node
/** Deploy API + Web in parallel (when only one side changed, use redeploy-api.js or redeploy-web.js). */
const { spawn } = require('child_process');
const path = require('path');

const deployDir = __dirname;
const env = { ...process.env, FORCE_DEPLOY: process.env.FORCE_DEPLOY || '' };

function run(script) {
  return new Promise((resolve, reject) => {
    const p = spawn('node', [path.join(deployDir, script)], { stdio: 'inherit', env });
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`${script} exited ${c}`))));
  });
}

async function main() {
  const t0 = Date.now();
  console.log('[deploy] API + Web in parallel...');
  await Promise.all([run('redeploy-api.js'), run('redeploy-web.js')]);
  console.log(`[deploy] All done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
