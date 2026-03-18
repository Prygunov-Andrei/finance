import type { MetadataRoute } from 'next';

const SITE_URL = 'https://hvac-info.com';
const HVAC_API = process.env.HVAC_API_URL || 'http://hvac-backend:8001';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/manufacturers`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/brands`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/resources`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/feedback`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}/smeta`, changeFrequency: 'monthly', priority: 0.6 },
  ];

  try {
    // Новости
    const newsRes = await fetch(`${HVAC_API}/api/hvac/news/?page_size=1000`, {
      next: { revalidate: 3600 },
    });
    if (newsRes.ok) {
      const newsData = await newsRes.json();
      for (const news of newsData.results) {
        entries.push({
          url: `${SITE_URL}/news/${news.id}`,
          lastModified: news.updated_at,
          changeFrequency: 'weekly',
          priority: 0.6,
        });
      }
    }

    // Производители
    const mfgRes = await fetch(`${HVAC_API}/api/hvac/references/manufacturers/?page_size=1000`, {
      next: { revalidate: 3600 },
    });
    if (mfgRes.ok) {
      const mfgData = await mfgRes.json();
      for (const mfg of mfgData.results) {
        entries.push({
          url: `${SITE_URL}/manufacturers#${mfg.id}`,
          changeFrequency: 'monthly',
          priority: 0.5,
        });
      }
    }
  } catch (err) {
    console.error('Sitemap generation error:', err);
  }

  return entries;
}
