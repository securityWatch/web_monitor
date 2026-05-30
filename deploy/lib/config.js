const path = require('path');

const ROOT = path.join(__dirname, '../..');

module.exports = {
  HOST: process.env.DEPLOY_HOST || '49.234.112.108',
  USER: process.env.DEPLOY_USER || 'ubuntu',
  PASSWORD: process.env.DEPLOY_PASSWORD || 'prs@2018',
  APP_DIR: '/opt/pulsewatch',
  BUILD_DIR: '/opt/pulsewatch/build',
  ROOT,
  APP_DOMAINS: process.env.APP_DOMAINS || 'gkao.com.cn',
  /** Default: build Next.js on server (~2–5 min) instead of uploading ~24MB bundle (~20+ min). */
  REMOTE_WEB_BUILD: process.env.REMOTE_WEB_BUILD !== '0',
  SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || `http://${process.env.DEPLOY_HOST || '49.234.112.108'}`,
};
