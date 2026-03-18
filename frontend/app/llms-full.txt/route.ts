import { NextResponse } from 'next/server';

const HVAC_API = process.env.HVAC_API_URL || 'http://hvac-backend:8001';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

export async function GET() {
  try {
    // Получаем все опубликованные новости
    const newsRes = await fetch(`${HVAC_API}/api/hvac/news/?page_size=1000`, {
      next: { revalidate: 3600 },
    });
    const newsData = await newsRes.json();

    // Получаем производителей
    const mfgRes = await fetch(`${HVAC_API}/api/hvac/references/manufacturers/?page_size=1000`, {
      next: { revalidate: 3600 },
    });
    const mfgData = await mfgRes.json();

    let content = `# hvac-info.com — Полный контент

> Последнее обновление: ${new Date().toISOString().split('T')[0]}

## Новости (${newsData.count} статей)

`;

    for (const news of newsData.results) {
      const body = stripHtml(news.body || '').slice(0, 500);
      content += `### ${news.title}
- Дата: ${news.pub_date}
- URL: https://hvac-info.com/news/${news.id}
${news.manufacturer ? `- Производитель: ${news.manufacturer.name}` : ''}
${body ? `\n${body}...\n` : ''}
`;
    }

    content += `\n## Производители (${mfgData.count})\n\n`;

    for (const mfg of mfgData.results) {
      content += `- **${mfg.name}**`;
      if (mfg.country) content += ` (${mfg.country})`;
      if (mfg.website) content += ` — ${mfg.website}`;
      if (mfg.news_count) content += ` [${mfg.news_count} новостей]`;
      content += '\n';
    }

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (err) {
    return new NextResponse('Error generating llms-full.txt', { status: 500 });
  }
}
