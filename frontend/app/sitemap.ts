import type { MetadataRoute } from 'next';
import { getRatingMethodology, getRatingModels } from '@/lib/api/services/rating';
import { getAllNews, getManufacturers } from '@/lib/hvac-api';

const SITE_URL = 'https://hvac-info.com';

const PRICE_SLUGS = [
  'do-20000-rub',
  'do-25000-rub',
  'do-30000-rub',
  'do-35000-rub',
  'do-40000-rub',
  'do-50000-rub',
  'do-60000-rub',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/rating-split-system`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/rating-split-system/methodology`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/rating-split-system/archive`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/rating-split-system/submit`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/quiet`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/manufacturers`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/brands`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/resources`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/feedback`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}/smeta`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
  ];

  const pricePages: MetadataRoute.Sitemap = PRICE_SLUGS.map((slug) => ({
    url: `${SITE_URL}/price/${slug}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  let presetPages: MetadataRoute.Sitemap = [];
  let modelPages: MetadataRoute.Sitemap = [];
  let newsPages: MetadataRoute.Sitemap = [];
  let manufacturerPages: MetadataRoute.Sitemap = [];

  try {
    const methodology = await getRatingMethodology();
    presetPages = (methodology.presets || [])
      .filter((p) => !p.is_all_selected)
      .map((p) => ({
        url: `${SITE_URL}/rating-split-system/${p.slug}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.7,
      }));
  } catch (err) {
    console.error('sitemap: methodology fetch failed', err);
  }

  try {
    const models = await getRatingModels();
    modelPages = models
      .filter((m) => m.publish_status === 'published')
      .map((m) => ({
        url: `${SITE_URL}/rating-split-system/${m.slug}`,
        lastModified: now,
        changeFrequency: 'monthly',
        priority: 0.6,
      }));
  } catch (err) {
    console.error('sitemap: models fetch failed', err);
  }

  try {
    const news = await getAllNews();
    newsPages = news.map((n) => ({
      url: `${SITE_URL}/news/${n.id}`,
      lastModified: n.updated_at ? new Date(n.updated_at) : (n.pub_date ? new Date(n.pub_date) : now),
      changeFrequency: 'weekly',
      priority: 0.6,
    }));
  } catch (err) {
    console.error('sitemap: news fetch failed', err);
  }

  try {
    const manufacturers = await getManufacturers();
    manufacturerPages = manufacturers.map((m) => ({
      url: `${SITE_URL}/manufacturers#${m.id}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    }));
  } catch (err) {
    console.error('sitemap: manufacturers fetch failed', err);
  }

  return [
    ...staticPages,
    ...pricePages,
    ...presetPages,
    ...modelPages,
    ...newsPages,
    ...manufacturerPages,
  ];
}
