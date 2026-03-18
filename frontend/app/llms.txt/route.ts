import { NextResponse } from 'next/server';

export async function GET() {
  const content = `# hvac-info.com

> Портал новостей и каталог оборудования HVAC-индустрии
> (отопление, вентиляция, кондиционирование)

## Разделы

- [Новости](https://hvac-info.com/): Актуальные новости климатической индустрии
- [Производители](https://hvac-info.com/manufacturers): Каталог производителей HVAC-оборудования
- [Бренды](https://hvac-info.com/brands): Каталог брендов оборудования
- [Ресурсы](https://hvac-info.com/resources): Источники и полезные ссылки
- [Оценка сметы](https://hvac-info.com/smeta): Портал автоматической оценки строительных смет
- [Обратная связь](https://hvac-info.com/feedback): Контактная форма

## API (публичный, без авторизации)

- GET https://hvac-info.com/api/hvac/news/ — список новостей (JSON, пагинация по 12)
- GET https://hvac-info.com/api/hvac/news/{id}/ — конкретная новость
- GET https://hvac-info.com/api/hvac/references/manufacturers/ — производители
- GET https://hvac-info.com/api/hvac/references/brands/ — бренды
- GET https://hvac-info.com/api/hvac/references/resources/ — ресурсы

## Машиночитаемые форматы

- RSS: https://hvac-info.com/rss.xml
- Sitemap: https://hvac-info.com/sitemap.xml
- JSON-LD: встроен в каждую страницу (Schema.org NewsArticle, Organization)
- Полный контент: https://hvac-info.com/llms-full.txt

## О сайте

HVAC Info — информационный портал для профессионалов климатической индустрии в России.
Публикуем новости производителей оборудования для отопления, вентиляции и кондиционирования,
ведём каталог производителей и брендов, предоставляем сервис оценки строительных смет.
`;

  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
