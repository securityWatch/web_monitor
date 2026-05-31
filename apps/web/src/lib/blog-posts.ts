export const BLOG_POSTS = [
  { slug: 'how-to-monitor-api-uptime', messageKey: 'apiUptime' as const },
  { slug: 'website-down-checker-guide', messageKey: 'websiteDown' as const },
] as const;

export type BlogPostSlug = (typeof BLOG_POSTS)[number]['slug'];
export type BlogMessageKey = (typeof BLOG_POSTS)[number]['messageKey'];

/** @deprecated use BLOG_POSTS */
export const blogPosts = BLOG_POSTS;

export function getBlogPost(slug: string) {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export function isBlogPostSlug(slug: string): slug is BlogPostSlug {
  return BLOG_POSTS.some((post) => post.slug === slug);
}
