#!/usr/bin/env node
/**
 * Set search-engine verification tokens on the server build env (not committed).
 *
 *   cd deploy
 *   set GOOGLE_SITE_VERIFICATION=your-google-token
 *   set BAIDU_SITE_VERIFICATION=your-baidu-token
 *   node patch-seo-verification.js
 *   node redeploy-web.js
 */
const { BUILD_DIR, PASSWORD } = require('./lib/config');
const { sshExec, shellQuote } = require('./lib/ssh');

const google = process.env.GOOGLE_SITE_VERIFICATION?.trim();
const baidu = process.env.BAIDU_SITE_VERIFICATION?.trim();
const pw = shellQuote(PASSWORD);
const envFile = `${BUILD_DIR}/.env`;

function upsert(key, value) {
  if (!value) return '';
  const escaped = value.replace(/'/g, `'\\''`);
  return `
if grep -q '^${key}=' ${envFile} 2>/dev/null; then
  sed -i 's|^${key}=.*|${key}=${escaped}|' ${envFile}
else
  echo '${key}=${escaped}' >> ${envFile}
fi
`;
}

async function main() {
  if (!google && !baidu) {
    console.error('[seo] Set GOOGLE_SITE_VERIFICATION and/or BAIDU_SITE_VERIFICATION.');
    process.exit(1);
  }

  const cmd = `
mkdir -p ${BUILD_DIR}
touch ${envFile}
${upsert('GOOGLE_SITE_VERIFICATION', google)}
${upsert('BAIDU_SITE_VERIFICATION', baidu)}
echo "[seo] ${envFile}:"
grep -E '^(GOOGLE|BAIDU)_SITE_VERIFICATION=' ${envFile} || true
`;
  const { code, stdout } = await sshExec(cmd, { timeoutMs: 60000 });
  process.stdout.write(stdout);
  if (code !== 0) process.exit(code);

  console.log('\n[seo] Tokens saved. Run: cd deploy && node redeploy-web.js');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
