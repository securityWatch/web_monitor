const path = require('path');

const ROOT = path.join(__dirname, '../..');

/** Open-source defaults — override via DEPLOY_HOST, DEPLOY_PASSWORD, APP_DOMAINS, NEXT_PUBLIC_SITE_URL */
module.exports = {
  HOST: process.env.DEPLOY_HOST || 'YOUR_SERVER_IP',
  USER: process.env.DEPLOY_USER || 'ubuntu',
  PASSWORD: process.env.DEPLOY_PASSWORD,
  APP_DIR: '/opt/pulsewatch',
  BUILD_DIR: '/opt/pulsewatch/build',
  ROOT,
  APP_DOMAINS: process.env.APP_DOMAINS || 'example.pulsewatch.io,www.example.pulsewatch.io',
  REMOTE_WEB_BUILD: process.env.REMOTE_WEB_BUILD !== '0',
  SITE_URL:
    process.env.NEXT_PUBLIC_SITE_URL ||
    (() => {
      const first = (process.env.APP_DOMAINS || 'example.pulsewatch.io')
        .split(',')[0]
        .trim()
        .replace(/^https?:\/\//, '');
      return first ? `http://${first}` : `http://${process.env.DEPLOY_HOST || 'YOUR_SERVER_IP'}`;
    })(),
};
