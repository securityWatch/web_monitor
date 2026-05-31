#!/usr/bin/env node
/**
 * Bind custom domain(s) on Nginx (HTTP), sync API CORS, print DNS checklist.
 * DNS must point APP_DOMAINS → DEPLOY_HOST before HTTPS (setup-https.js).
 *
 *   cd deploy && node apply-domain.js
 *   APP_DOMAINS=gkao.com.cn,www.gkao.com.cn node apply-domain.js
 */
const fs = require('fs');
const path = require('path');
const { HOST, APP_DOMAINS, PASSWORD } = require('./lib/config');
const { buildCorsOrigins } = require('./lib/cors-origins');
const { parseDomains, renderHttpNginx, shellEnablePulsewatchSite } = require('./lib/nginx-config');
const { sshExec, scpToRemote, shellQuote } = require('./lib/ssh');

const domains = parseDomains(APP_DOMAINS);
const confPath = path.join(__dirname, 'nginx', 'pulsewatch.conf');
const pw = shellQuote(PASSWORD);
const corsOrigins = buildCorsOrigins(HOST, APP_DOMAINS);

async function checkDns() {
  if (domains.length === 0) return;
  const checks = domains.map((d) => `echo "DNS ${d}:"; dig +short A ${d} @8.8.8.8 2>/dev/null | head -3`).join('\n');
  const { stdout } = await sshExec(checks, { timeoutMs: 30000 });
  return stdout;
}

async function main() {
  if (domains.length === 0) {
    console.error('[domain] Set APP_DOMAINS (comma-separated hostnames).');
    process.exit(1);
  }

  const nginxConf = renderHttpNginx({ domainsCsv: APP_DOMAINS, hostIp: HOST });
  fs.writeFileSync(confPath, nginxConf, 'utf8');
  console.log(`[domain] Wrote ${confPath}`);
  console.log(`[domain] server_name: ${domains.join(' ')} ${HOST}`);

  console.log('[domain] Checking public DNS (from server)...');
  const dnsOut = await checkDns();
  if (dnsOut) process.stdout.write(dnsOut);

  const pointsHere = dnsOut && dnsOut.includes(HOST);
  if (!pointsHere) {
    console.warn(
      `\n[domain] WARNING: ${domains.join(', ')} may not resolve to ${HOST} yet.`,
    );
    console.warn('[domain] In DNS (or Cloudflare): A record →', HOST, 'then re-run setup-https.js');
    console.warn('[domain] Cloudflare: set SSL to Full (strict) after origin cert, or Flexible for HTTP origin only.\n');
  } else {
    console.log(`[domain] DNS looks good — at least one record includes ${HOST}`);
  }

  await scpToRemote(confPath, '/tmp/pulsewatch.conf');
  const cmd = `
echo ${pw} | sudo -S mv /tmp/pulsewatch.conf /etc/nginx/sites-available/pulsewatch
${shellEnablePulsewatchSite(pw)}
echo ${pw} | sudo -S rm -f /etc/nginx/sites-enabled/default
echo ${pw} | sudo -S nginx -t && echo ${pw} | sudo -S systemctl reload nginx
if grep -q '^CORS_ORIGINS=' /opt/pulsewatch/api/.env 2>/dev/null; then
  sed -i 's|^CORS_ORIGINS=.*|CORS_ORIGINS=${corsOrigins}|' /opt/pulsewatch/api/.env
else
  echo 'CORS_ORIGINS=${corsOrigins}' >> /opt/pulsewatch/api/.env
fi
echo ${pw} | sudo -S systemctl restart pulsewatch-api
sleep 2
curl -s http://127.0.0.1/health
for d in ${domains.join(' ')}; do
  curl -s -o /dev/null -w "host %s: %{http_code}\\n" -H "Host: $d" http://127.0.0.1/en || true
done
`;
  const { code, stdout, stderr } = await sshExec(cmd, { timeoutMs: 120000 });
  process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (code !== 0) process.exit(code);

  console.log('\n[domain] HTTP nginx applied. Next:');
  console.log('  1. Confirm DNS A →', HOST);
  console.log('  2. cd deploy && node setup-https.js   (Let\'s Encrypt)');
  console.log('  3. cd deploy && node redeploy-web.js  (rebuild with NEXT_PUBLIC_SITE_URL=https://...)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
