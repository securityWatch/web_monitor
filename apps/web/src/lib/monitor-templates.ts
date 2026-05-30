export interface MonitorTemplate {
  id: string;
  name: string;
  nameZh: string;
  type: string;
  targetUrl: string;
  intervalSeconds: number;
  config?: Record<string, unknown>;
}

export const MONITOR_TEMPLATES: MonitorTemplate[] = [
  {
    id: 'api-health',
    name: 'API Health Check',
    nameZh: 'API 健康检查',
    type: 'http',
    targetUrl: 'https://api.example.com/health',
    intervalSeconds: 60,
    config: { method: 'GET', expectedStatuses: [200] },
  },
  {
    id: 'stripe-webhook',
    name: 'Stripe Webhook Endpoint',
    nameZh: 'Stripe Webhook',
    type: 'http',
    targetUrl: 'https://your-app.com/api/webhooks/stripe',
    intervalSeconds: 300,
    config: { method: 'POST', expectedStatuses: [200, 400] },
  },
  {
    id: 'wordpress',
    name: 'WordPress Site',
    nameZh: 'WordPress 站点',
    type: 'keyword',
    targetUrl: 'https://your-blog.com',
    intervalSeconds: 300,
    config: { keyword: 'wp-content', keywordMustContain: true },
  },
  {
    id: 'ssl-expiry',
    name: 'SSL Certificate',
    nameZh: 'SSL 证书监控',
    type: 'ssl',
    targetUrl: 'https://example.com',
    intervalSeconds: 86400,
    config: {},
  },
  {
    id: 'dns-a',
    name: 'DNS A Record',
    nameZh: 'DNS A 记录',
    type: 'dns',
    targetUrl: 'example.com',
    intervalSeconds: 3600,
    config: { recordType: 'A' },
  },
  {
    id: 'cron-job',
    name: 'Cron / Heartbeat',
    nameZh: '定时任务 Heartbeat',
    type: 'heartbeat',
    targetUrl: '',
    intervalSeconds: 300,
    config: {},
  },
  {
    id: 'domain-expiry',
    name: 'Domain Expiry',
    nameZh: '域名到期监控',
    type: 'domain',
    targetUrl: 'example.com',
    intervalSeconds: 86400,
    config: { warnDays: 30 },
  },
  {
    id: 'page-speed',
    name: 'Page Speed (TTFB)',
    nameZh: '页面速度 TTFB',
    type: 'pagespeed',
    targetUrl: 'https://example.com',
    intervalSeconds: 300,
    config: { maxTtfbMs: 2000 },
  },
];
