import type { MetadataRoute } from 'next';

const DISALLOW = ['/api/', '/admin/', '/hvac-admin/', '/erp/', '/_next/', '/private/'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: DISALLOW,
      },
      {
        userAgent: ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot'],
        allow: '/',
        disallow: DISALLOW,
      },
      {
        userAgent: ['ClaudeBot', 'Claude-Web', 'anthropic-ai'],
        allow: '/',
        disallow: DISALLOW,
      },
      {
        userAgent: ['PerplexityBot', 'Perplexity-User'],
        allow: '/',
        disallow: DISALLOW,
      },
      {
        userAgent: ['Google-Extended', 'CCBot', 'Applebot'],
        allow: '/',
        disallow: DISALLOW,
      },
      {
        userAgent: 'Yandex',
        allow: '/',
        disallow: DISALLOW,
      },
    ],
    sitemap: 'https://hvac-info.com/sitemap.xml',
    host: 'https://hvac-info.com',
  };
}
