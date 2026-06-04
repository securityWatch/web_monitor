#!/usr/bin/env node
/**
 * Fail if known production secrets or hosts appear in the OSS tree.
 * Used by scripts/sync-web-monitor-oss.js before push.
 */
const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'out', 'build']);

const DENY = [
  { label: 'production IP', pattern: /49\.234\.112\.108/ },
  { label: 'production domain', pattern: /gkao\.com\.cn/i },
  { label: 'legacy DB password (url-encoded)', pattern: /prs%402018/i },
  { label: 'legacy DB password', pattern: /prs@2018/i },
  { label: 'WeChat AppID', pattern: /wxdaf77fdfdeaab4cf/i },
  {
    label: 'DingTalk access_token',
    pattern: /access_token=96899fb676569940b30d1ca80bb8a8a9807e0239dff86042ee088a5ac77ebefc/i,
  },
  { label: 'local secrets file', pattern: /(?:^|\/)环境信息$/ },
];

const TEXT_EXT =
  /\.(js|ts|tsx|json|md|mdc|go|sql|sh|py|yml|yaml|conf|wxml|wxss|example|env|txt|html|css)$/i;

function walk(dir, root, hits = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(root, full).replace(/\\/g, '/');
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walk(full, root, hits);
      continue;
    }
    if (ent.name === '.env' || ent.name === '环境信息') {
      hits.push({ rel, label: 'forbidden file' });
      continue;
    }
    // This file defines the deny list; templates/oss are sources, not the published tree.
    if (rel === 'scripts/oss-verify-secrets.js' || rel.startsWith('templates/oss/')) {
      continue;
    }
    if (!TEXT_EXT.test(ent.name) && !rel.endsWith('Dockerfile')) continue;
    const buf = fs.readFileSync(full);
    if (buf.includes(0)) continue;
    const text = buf.toString('utf8');
    for (const { label, pattern } of DENY) {
      if (pattern.test(text) || pattern.test(rel)) {
        hits.push({ rel, label });
        break;
      }
    }
  }
  return hits;
}

function main(root = process.cwd()) {
  const hits = walk(root, root);
  if (hits.length === 0) {
    console.log(`[oss-verify] OK — no denied patterns under ${root}`);
    return;
  }
  console.error('[oss-verify] FAILED — possible secret or production leak:');
  for (const h of hits) {
    console.error(`  - ${h.label}: ${h.rel}`);
  }
  process.exit(1);
}

if (require.main === module) {
  main(path.resolve(process.argv[2] || process.cwd()));
}

module.exports = { main, DENY };
