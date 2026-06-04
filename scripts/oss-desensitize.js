/**
 * Apply open-source desensitization in-place (cwd = repo root).
 * Used by scripts/sync-web-monitor-oss.js — do not run on the private production clone
 * unless you intend to publish that tree.
 */
const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'out',
  'build',
  'docker-data',
]);

const SKIP_FILES = new Set(['环境信息', '.env']);

const TEXT_EXT = new Set([
  '.js',
  '.ts',
  '.tsx',
  '.json',
  '.md',
  '.mdc', // cursor rules
  '.go',
  '.sql',
  '.sh',
  '.py',
  '.yml',
  '.yaml',
  '.conf',
  '.wxml',
  '.wxss',
  '.example',
  '.tf',
  '.html',
  '.css',
  '.txt',
]);

/** Longer tokens first to avoid partial replacements */
const GLOBAL_REPLACEMENTS = [
  ['www.gkao.com.cn', 'www.example.pulsewatch.io'],
  ['gkao.com.cn', 'example.pulsewatch.io'],
  ['49.234.112.108', 'YOUR_SERVER_IP'],
  ['wxdaf77fdfdeaab4cf', 'your-wechat-mini-program-appid'],
  ['mafei2021/monitor', 'securityWatch/web_monitor'],
];

function shouldProcessFile(rel) {
  if (SKIP_FILES.has(path.basename(rel))) return false;
  if (rel.startsWith('deploy/_')) return false;
  const ext = path.extname(rel);
  if (TEXT_EXT.has(ext)) return true;
  if (rel.endsWith('.env.example') || rel.endsWith('Dockerfile')) return true;
  return false;
}

function walk(dir, root, files = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    const rel = path.relative(root, full).replace(/\\/g, '/');
    if (name.isDirectory()) {
      if (SKIP_DIRS.has(name.name)) continue;
      walk(full, root, files);
    } else if (shouldProcessFile(rel)) {
      files.push(full);
    }
  }
  return files;
}

function applyGlobalReplacements(content) {
  let out = content;
  for (const [from, to] of GLOBAL_REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  return out;
}

function patchFile(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function patchSpecificFiles(root) {
  patchFile(
    root,
    'deploy/lib/config.js',
    `const path = require('path');

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
        .replace(/^https?:\\/\\//, '');
      return first ? \`http://\${first}\` : \`http://\${process.env.DEPLOY_HOST || 'YOUR_SERVER_IP'}\`;
    })(),
};
`
  );

  patchFile(
    root,
    'apps/miniprogram/config/env.js',
    `// Set to your API origin (HTTPS in production). WeChat Admin → 开发 → 服务器域名.
module.exports = {
  baseUrl: 'https://example.pulsewatch.io',
};
`
  );

  const seoPath = path.join(root, 'apps/web/src/lib/seo.ts');
  if (fs.existsSync(seoPath)) {
    let seo = fs.readFileSync(seoPath, 'utf8');
    seo = seo.replace(
      /'http:\/\/YOUR_SERVER_IP'/g,
      "'http://localhost:3000'"
    );
    seo = seo.replace(
      /process\.env\.SITE_URL \|\|\s*\n\s*'[^']+'/,
      "process.env.SITE_URL ||\n    'http://localhost:3000'"
    );
    fs.writeFileSync(seoPath, seo, 'utf8');
  }

  patchFile(
    root,
    'apps/web/src/lib/app-domains.ts',
    `/** Comma-separated hostnames allowed for app routes (set at build via NEXT_PUBLIC_APP_DOMAINS). */
export const defaultAppDomains =
  process.env.NEXT_PUBLIC_APP_DOMAINS ||
  'localhost:3000,127.0.0.1:3000,example.pulsewatch.io,www.example.pulsewatch.io';
`
  );

  const envExample = path.join(root, '.env.example');
  if (fs.existsSync(envExample)) {
    let e = fs.readFileSync(envExample, 'utf8');
    e = e.replace(/NEXT_PUBLIC_SITE_URL=.*/g, 'NEXT_PUBLIC_SITE_URL=http://localhost:3000');
    e = e.replace(
      /NEXT_PUBLIC_APP_DOMAINS=.*/g,
      'NEXT_PUBLIC_APP_DOMAINS=localhost:3000,example.pulsewatch.io'
    );
    e = e.replace(/# Deploy only: APP_DOMAINS=.*/g, '# Deploy only: APP_DOMAINS=example.pulsewatch.io');
    fs.writeFileSync(envExample, e, 'utf8');
  }

  const readme = path.join(root, 'README.md');
  if (fs.existsSync(readme)) {
    let r = fs.readFileSync(readme, 'utf8');
    r = r.replace(
      /\[!\[PulseWatch\]\([^)]+\)\]\([^)]+\)/,
      '[![PulseWatch](https://example.pulsewatch.io/api/v1/public/badge/your_token.svg)](https://github.com/securityWatch/web_monitor)'
    );
    r = r.replace(
      /> \*\*Live demo\*\*: \[https:\/\/[^\]]+\]\([^)]+\)/,
      '> **Open source**: [securityWatch/web_monitor](https://github.com/securityWatch/web_monitor) — self-host with `.env.example`'
    );
    if (!r.includes('## Open source mirror')) {
      r +=
        '\n\n## Open source mirror\n\nThis tree is published from the private PulseWatch development repo after desensitization. Do not commit production hosts, domains, or credentials.\n';
    }
    fs.writeFileSync(readme, r, 'utf8');
  }
}

function removeSensitiveArtifacts(root) {
  for (const rel of ['deploy/_check-ssl.js', '环境信息']) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

function copyOssTemplates(root, templatesDir) {
  const ossCursor = path.join(templatesDir, '.cursor', 'rules');
  if (!fs.existsSync(ossCursor)) {
    console.warn('[oss-desensitize] Missing templates/oss/.cursor/rules — skip rule overlay');
    return;
  }
  const destRules = path.join(root, '.cursor', 'rules');
  fs.mkdirSync(destRules, { recursive: true });
  // OSS repo: drop private-only production deploy rules first
  for (const priv of ['pulsewatch.mdc', 'git-auto-commit-push.mdc', 'web-monitor-oss.mdc']) {
    const p = path.join(destRules, priv);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  for (const name of fs.readdirSync(ossCursor)) {
    fs.copyFileSync(path.join(ossCursor, name), path.join(destRules, name));
  }
}

function main(root = process.cwd()) {
  const files = walk(root, root);
  for (const full of files) {
    const buf = fs.readFileSync(full);
    if (buf.includes(0)) continue;
    const text = buf.toString('utf8');
    const next = applyGlobalReplacements(text);
    if (next !== text) fs.writeFileSync(full, next, 'utf8');
  }
  patchSpecificFiles(root);
  removeSensitiveArtifacts(root);
  const templatesDir = path.join(root, 'templates', 'oss');
  if (fs.existsSync(templatesDir)) copyOssTemplates(root, templatesDir);
  console.log(`[oss-desensitize] Processed ${files.length} files under ${root}`);
}

if (require.main === module) {
  main(path.resolve(process.argv[2] || process.cwd()));
}

module.exports = { main, GLOBAL_REPLACEMENTS };
