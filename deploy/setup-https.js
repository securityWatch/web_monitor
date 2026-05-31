#!/usr/bin/env node
/**
 * Issue Let's Encrypt cert and switch Nginx to HTTPS redirect + 443.
 * Requires: APP_DOMAINS DNS A records → DEPLOY_HOST, port 80 open.
 *
 *   CERTBOT_EMAIL=you@example.com cd deploy && node setup-https.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { HOST, APP_DOMAINS, PASSWORD, SITE_URL } = require('./lib/config');
const { parseDomains, renderHttpsNginx, shellEnablePulsewatchSite } = require('./lib/nginx-config');
const { sshExec, scpToRemote, shellQuote } = require('./lib/ssh');

const domains = parseDomains(APP_DOMAINS);
const primary = domains[0];
const email = process.env.CERTBOT_EMAIL || process.env.LETSENCRYPT_EMAIL || `admin@${primary}`;
const pw = shellQuote(PASSWORD);
const httpsSite = process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https://')
  ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  : `https://${primary}`;

async function main() {
  if (domains.length === 0) {
    console.error('[https] Set APP_DOMAINS.');
    process.exit(1);
  }

  console.log('[https] Domains:', domains.join(', '));
  console.log('[https] Certbot email:', email);
  console.log('[https] Target canonical URL:', httpsSite);

  const dnsCheck = domains
    .map((d) => `dig +short A ${d} @8.8.8.8 | grep -Fx '${HOST}' && echo OK:${d} || echo MISS:${d}`)
    .join('; ');
  const { stdout: dnsOut } = await sshExec(dnsCheck, { timeoutMs: 30000 });
  process.stdout.write(dnsOut || '');
  if (!dnsOut.includes('OK:')) {
    console.error(`\n[https] ABORT: No domain A record points to ${HOST}. Fix DNS first, then retry.`);
    process.exit(1);
  }

  const certbotCmd = `echo ${pw} | sudo -S certbot certonly --nginx --non-interactive --agree-tos --email ${email} ${domains.map((d) => `-d ${d}`).join(' ')}`;
  console.log('[https] Running certbot on server...');
  const { code: certCode, stdout: certOut, stderr: certErr } = await sshExec(certbotCmd, {
    timeoutMs: 300000,
  });
  process.stdout.write(certOut);
  if (certErr) process.stderr.write(certErr);
  if (certCode !== 0) {
    console.error('[https] certbot failed. Ensure port 80 is reachable and nginx serves the domain.');
    process.exit(certCode);
  }

  const nginxConf = renderHttpsNginx({ domainsCsv: APP_DOMAINS, certPrimary: primary });
  const confPath = path.join(__dirname, 'nginx', 'pulsewatch-https.conf');
  fs.writeFileSync(confPath, nginxConf, 'utf8');
  await scpToRemote(confPath, '/tmp/pulsewatch-https.conf');

  const cmd = `
echo ${pw} | sudo -S mv /tmp/pulsewatch-https.conf /etc/nginx/sites-available/pulsewatch
${shellEnablePulsewatchSite(pw)}
echo ${pw} | sudo -S ufw allow 443/tcp 2>/dev/null || true
echo ${pw} | sudo -S nginx -t && echo ${pw} | sudo -S systemctl reload nginx
curl -s -o /dev/null -w "http80:%{http_code}\\n" http://127.0.0.1/en || true
`;
  const { code, stdout } = await sshExec(cmd, { timeoutMs: 120000 });
  process.stdout.write(stdout);
  if (code !== 0) process.exit(code);

  console.log('\n[https] Nginx HTTPS active. Rebuilding web with canonical URL...');
  execSync('node redeploy-web.js', {
    cwd: __dirname,
    env: { ...process.env, NEXT_PUBLIC_SITE_URL: httpsSite },
    stdio: 'inherit',
  });

  console.log('\n[https] Done. Verify:');
  console.log(`  curl -sI ${httpsSite}/en | head -5`);
  console.log(`  Submit sitemap: ${httpsSite}/sitemap.xml (GSC + 百度站长)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
