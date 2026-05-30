#!/usr/bin/env node
/**
 * 校验 PulseWatch 微信小程序目录结构是否完整
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'apps', 'miniprogram');

const required = [
  'app.js',
  'app.json',
  'app.wxss',
  'project.config.json',
  'sitemap.json',
  'config/env.js',
  'utils/api.js',
  'utils/auth.js',
  'utils/format.js',
  'custom-tab-bar/index.js',
  'custom-tab-bar/index.json',
  'custom-tab-bar/index.wxml',
  'custom-tab-bar/index.wxss',
  'pages/login/login.js',
  'pages/login/login.json',
  'pages/login/login.wxml',
  'pages/login/login.wxss',
  'pages/monitors/index.js',
  'pages/monitors/index.json',
  'pages/monitors/index.wxml',
  'pages/monitors/index.wxss',
  'pages/monitor-detail/detail.js',
  'pages/monitor-detail/detail.json',
  'pages/monitor-detail/detail.wxml',
  'pages/monitor-detail/detail.wxss',
  'pages/incidents/index.js',
  'pages/incidents/index.json',
  'pages/incidents/index.wxml',
  'pages/incidents/index.wxss',
  'pages/settings/index.js',
  'pages/settings/index.json',
  'pages/settings/index.wxml',
  'pages/settings/index.wxss',
  'README.md',
];

let missing = [];
for (const rel of required) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    missing.push(rel);
  }
}

if (missing.length) {
  console.error('Missing files:\n' + missing.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
}

const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const pages = appJson.pages || [];
const expectedPages = [
  'pages/login/login',
  'pages/monitors/index',
  'pages/monitor-detail/detail',
  'pages/incidents/index',
  'pages/settings/index',
];
for (const p of expectedPages) {
  if (!pages.includes(p)) {
    console.error('app.json missing page: ' + p);
    process.exit(1);
  }
}

console.log('PulseWatch miniprogram structure OK (' + required.length + ' files)');
