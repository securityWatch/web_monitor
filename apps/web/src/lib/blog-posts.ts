export const blogPosts = [
  { articleKey: 'apiUptime' as const, date: '2026-05-15' },
  { articleKey: 'websiteDown' as const, date: '2026-05-22' },
] as const;

export type BlogArticleKey = (typeof blogPosts)[number]['articleKey'];
