import { NextResponse } from 'next/server';

const CONTENT = `# HVAC Info — Независимый рейтинг кондиционеров и новости климат-индустрии

> Hvac-info.com — независимый портал о кондиционерах: лабораторные замеры шума, рейтинг сплит-систем 2.5–4.5 кВт по методике «Август-климат», новости HVAC-индустрии.

## Основные разделы

- [Рейтинг сплит-систем](https://hvac-info.com/rating-split-system): сравнение моделей по 30 критериям, лабораторные замеры шума, индекс «Август-климат».
- [Самые тихие кондиционеры](https://hvac-info.com/quiet): топ моделей с самыми низкими замерами шума внутреннего блока.
- [Методика «Август-климат»](https://hvac-info.com/rating-split-system/methodology): описание индекса, 30 критериев, веса, медианы по рынку.
- [Архив моделей](https://hvac-info.com/rating-split-system/archive): снятые с производства модели.
- [Подать заявку на тестирование](https://hvac-info.com/rating-split-system/submit): форма для производителей.
- [Новости HVAC](https://hvac-info.com/): лента новостей климатической индустрии.
- [Производители](https://hvac-info.com/manufacturers): каталог производителей HVAC-оборудования.
- [Бренды](https://hvac-info.com/brands): каталог брендов оборудования.

## Ценовые сегменты

- [До 20 000 ₽](https://hvac-info.com/price/do-20000-rub)
- [До 25 000 ₽](https://hvac-info.com/price/do-25000-rub)
- [До 30 000 ₽](https://hvac-info.com/price/do-30000-rub)
- [До 35 000 ₽](https://hvac-info.com/price/do-35000-rub)
- [До 40 000 ₽](https://hvac-info.com/price/do-40000-rub)
- [До 50 000 ₽](https://hvac-info.com/price/do-50000-rub)
- [До 60 000 ₽](https://hvac-info.com/price/do-60000-rub)

## Авторы

- **Максим Савинов** — главный редактор, автор методики «Август-климат»
- **Андрей Прыгунов** — редактор

## Машиночитаемые форматы

- Полная база знаний: https://hvac-info.com/llms-full.txt
- Sitemap: https://hvac-info.com/sitemap.xml
- RSS новостей: https://hvac-info.com/rss.xml
- JSON-LD Schema.org Product встроен в страницы детальной модели рейтинга.

## Публичные API (без авторизации)

- GET https://hvac-info.com/api/public/v1/rating/models/ — список моделей рейтинга (JSON)
- GET https://hvac-info.com/api/public/v1/rating/models/by-slug/{slug}/ — детальная модель
- GET https://hvac-info.com/api/public/v1/rating/methodology/ — методика и критерии
- GET https://hvac-info.com/api/v1/hvac/public/news/ — новости (JSON, пагинация)
- GET https://hvac-info.com/api/v1/hvac/public/references/manufacturers/ — производители

## О сайте

HVAC Info — независимый информационный портал. Команда замеряет в лаборатории шум кондиционеров и оценивает сплит-системы по 30 параметрам собственной методики «Август-климат» (компрессор, теплообменники, фильтрация, управление, гарантия и др.). Цель — дать покупателю прозрачное сравнение моделей и держать индустрию в фокусе.
`;

export async function GET() {
  return new NextResponse(CONTENT, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
