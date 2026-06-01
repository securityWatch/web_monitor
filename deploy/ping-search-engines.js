#!/usr/bin/env node
/**
 * Ping search engines after deployment to trigger re-indexing.
 *
 * Usage (after redeploy):
 *   cd deploy && node ping-search-engines.js
 *
 * Reads SITE_URL from config or env. Pings Google, Bing, and Baidu.
 */
const { SITE_URL } = require('./lib/config');
const https = require('https');
const http = require('http');

const site = SITE_URL.replace(/\/$/, '');
const sitemapUrl = `${site}/sitemap.xml`;

function pingGoogle() {
  const url = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ engine: 'Google', status: res.statusCode }));
    }).on('error', (e) => resolve({ engine: 'Google', error: e.message }));
  });
}

function pingBing() {
  const url = `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ engine: 'Bing', status: res.statusCode }));
    }).on('error', (e) => resolve({ engine: 'Bing', error: e.message }));
  });
}

function pingBaidu() {
  const url = `http://data.zz.baidu.com/urls?site=${encodeURIComponent(site)}&token=`;
  return new Promise((resolve) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ engine: 'Baidu', status: res.statusCode, body }));
    }).on('error', (e) => resolve({ engine: 'Baidu', error: e.message }));
  });
}

async function main() {
  console.log(`[seo-ping] Pinging search engines with sitemap: ${sitemapUrl}\n`);

  const results = await Promise.allSettled([pingGoogle(), pingBing(), pingBaidu()]);

  for (const r of results) {
    if (r.status === 'fulfilled') {
      const info = r.value;
      if (info.error) {
        console.log(`  ${info.engine}: error — ${info.error}`);
      } else {
        console.log(`  ${info.engine}: ${info.status}${info.body ? ` — ${info.body.slice(0, 100)}` : ''}`);
      }
    }
  }

  console.log('\n[seo-ping] Done. Allow a few hours for search engines to crawl the updated sitemap.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
