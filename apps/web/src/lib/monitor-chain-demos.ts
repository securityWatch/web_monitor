import type { HttpStep } from './monitor-config';

type Locale = 'zh' | 'en';

const DEMOS: Record<Locale, {
  loginBody: string;
  loginHeaders: string;
  authHeaders: string;
  step1Name: string;
  step2Name: string;
  step2Url: string;
}> = {
  zh: {
    loginBody: '{\n  "email": "user@example.com",\n  "password": "your-password"\n}',
    loginHeaders: '{\n  "Content-Type": "application/json"\n}',
    authHeaders: '{\n  "Authorization": "Bearer {{token}}"\n}',
    step1Name: '登录',
    step2Name: '带 Token 请求',
    step2Url: 'https://api.example.com/v1/health',
  },
  en: {
    loginBody: '{\n  "email": "user@example.com",\n  "password": "your-password"\n}',
    loginHeaders: '{\n  "Content-Type": "application/json"\n}',
    authHeaders: '{\n  "Authorization": "Bearer {{token}}"\n}',
    step1Name: 'Login',
    step2Name: 'Authenticated request',
    step2Url: 'https://api.example.com/v1/health',
  },
};

export function getChainFieldDemos(locale: string) {
  return DEMOS[locale === 'zh' ? 'zh' : 'en'];
}

export function buildLoginChainDemo(locale: string): HttpStep[] {
  const d = getChainFieldDemos(locale);
  return [
    {
      name: d.step1Name,
      url: '',
      method: 'POST',
      body: d.loginBody,
      headers: { 'Content-Type': 'application/json' },
      expectedStatuses: [200],
      extract: [{ var: 'token', from: 'json', path: 'accessToken' }],
    },
    {
      name: d.step2Name,
      url: d.step2Url,
      method: 'GET',
      headers: { Authorization: 'Bearer {{token}}' },
      body: '',
      expectedStatuses: [200],
      extract: [],
    },
  ];
}

export function formatChainDemoText(locale: string): string {
  const d = getChainFieldDemos(locale);
  if (locale === 'zh') {
    return `步骤 1 — 登录（POST，URL 可留空用目标地址）
请求体:
${d.loginBody}

请求头:
${d.loginHeaders}

提取变量: token ← JSON 路径 accessToken

步骤 2 — 带 Token 请求
URL: ${d.step2Url}
请求头:
${d.authHeaders}`;
  }
  return `Step 1 — Login (POST, URL optional — uses target URL)
Body:
${d.loginBody}

Headers:
${d.loginHeaders}

Extract: token ← JSON path accessToken

Step 2 — Authenticated request
URL: ${d.step2Url}
Headers:
${d.authHeaders}`;
}
