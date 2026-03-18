import { NextResponse } from 'next/server';

const HVAC_API = process.env.HVAC_API_URL || 'http://hvac-backend:8001';
const SITE_URL = 'https://hvac-info.com';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

export async function GET() {
  try {
    const res = await fetch(`${HVAC_API}/api/hvac/news/?page_size=50`, {
      next: { revalidate: 300 },
    });
    const data = await res.json();

    const items = data.results
      .map((news: any) => {
        const description = stripHtml(news.body || '').slice(0, 500);
        return `
    <item>
      <title>${escapeXml(news.title)}</title>
      <link>${SITE_URL}/news/${news.id}</link>
      <guid isPermaLink="true">${SITE_URL}/news/${news.id}</guid>
      <pubDate>${new Date(news.pub_date).toUTCString()}</pubDate>
      <description>${escapeXml(description)}</description>
    </item>`;
      })
      .join('');

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>HVAC Info — Новости</title>
    <link>${SITE_URL}</link>
    <description>Актуальные новости HVAC-индустрии: отопление, вентиляция, кондиционирование</description>
    <language>ru</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />${items}
  </channel>
</rss>`;

    return new NextResponse(rss, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch (err) {
    return new NextResponse('RSS feed error', { status: 500 });
  }
}
