/** Render Nginx site configs for PulseWatch (HTTP + optional HTTPS). */

function parseDomains(domainsCsv) {
  return (domainsCsv || '')
    .split(',')
    .map((d) => d.trim().replace(/^https?:\/\//, '').split('/')[0])
    .filter(Boolean);
}

const PROXY_LOCATIONS = `
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /health {
        proxy_pass http://127.0.0.1:4000/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
`;

function renderHttpNginx({ domainsCsv, hostIp, includeIp = true }) {
  const domainList = parseDomains(domainsCsv);
  const serverNames = [...domainList];
  if (includeIp && hostIp && !serverNames.includes(hostIp)) {
    serverNames.push(hostIp);
  }
  serverNames.push('_');

  return `# PulseWatch — HTTP (generated)
# Apply: cd deploy && node apply-nginx.js

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${serverNames.join(' ')};
${PROXY_LOCATIONS}
}
`;
}

function renderHttpsNginx({ domainsCsv, certPrimary }) {
  const domains = parseDomains(domainsCsv);
  if (domains.length === 0) {
    throw new Error('APP_DOMAINS is required for HTTPS nginx');
  }
  const primary = certPrimary || domains[0];
  const serverName = domains.join(' ');

  return `# PulseWatch — HTTPS (generated after certbot)
# Cert paths: /etc/letsencrypt/live/${primary}/

server {
    listen 80;
    listen [::]:80;
    server_name ${serverName};
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${serverName};

    ssl_certificate     /etc/letsencrypt/live/${primary}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${primary}/privkey.pem;
    ssl_session_timeout 1d;
    ssl_protocols TLSv1.2 TLSv1.3;
${PROXY_LOCATIONS}
}
`;
}

/**
 * Shell snippet: remove duplicate pulsewatch symlinks in sites-enabled, then enable
 * the canonical sites-available/pulsewatch link. Prevents duplicate default_server
 * when both pulsewatch and pulsewatch.conf were enabled (e.g. Cloudflare origin cert).
 * @param {string} pwQuoted - shell-quoted sudo password (from shellQuote)
 */
function shellEnablePulsewatchSite(pwQuoted) {
  return `
echo ${pwQuoted} | sudo -S rm -f /etc/nginx/sites-enabled/pulsewatch /etc/nginx/sites-enabled/pulsewatch.conf
echo ${pwQuoted} | sudo -S ln -sf /etc/nginx/sites-available/pulsewatch /etc/nginx/sites-enabled/pulsewatch
`.trim();
}

module.exports = {
  parseDomains,
  renderHttpNginx,
  renderHttpsNginx,
  PROXY_LOCATIONS,
  shellEnablePulsewatchSite,
};
