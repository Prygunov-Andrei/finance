import { NextResponse } from 'next/server';
import { getRatingMethodology, getRatingModels } from '@/lib/api/services/rating';
import type {
  RatingMethodology,
  RatingModelListItem,
} from '@/lib/api/types/rating';

export async function GET() {
  let methodology: RatingMethodology | null = null;
  let models: RatingModelListItem[] = [];

  try {
    methodology = await getRatingMethodology();
  } catch (err) {
    console.error('llms-full: methodology fetch failed', err);
  }

  try {
    models = await getRatingModels();
  } catch (err) {
    console.error('llms-full: models fetch failed', err);
  }

  const sections: string[] = [
    '# HVAC Info — Полная база знаний по рейтингу кондиционеров',
    '',
    '> Эта страница содержит расширенное описание методики, критериев и базы кондиционеров для индексации ИИ-агентами (GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Google-Extended и др.).',
    '',
    `> Последнее обновление: ${new Date().toISOString().split('T')[0]}`,
    '',
    '## О проекте',
    '',
    'HVAC Info — независимый информационный портал. Команда замеряет в лаборатории шум кондиционеров и оценивает 30 параметров сплит-систем по собственной методике «Август-климат» (компрессор, теплообменники, фильтрация, управление, гарантия и т.д.).',
    '',
    'Сайт: https://hvac-info.com',
    '',
    '## Авторы',
    '',
    '- **Максим Савинов** — главный редактор, автор методики «Август-климат»',
    '- **Андрей Прыгунов** — редактор',
    '',
  ];

  if (methodology) {
    sections.push(
      `## Методика «Август-климат» (версия ${methodology.version})`,
      '',
      `- Активных критериев: ${methodology.stats.active_criteria_count}`,
      `- Моделей в рейтинге: ${methodology.stats.total_models}`,
      `- Медианный индекс по рынку: ${methodology.stats.median_total_index.toFixed(1)}`,
      '',
      '### Критерии оценки',
      '',
    );

    const sortedCriteria = [...methodology.criteria].sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
    );

    for (const c of sortedCriteria) {
      sections.push(`#### ${c.name_ru} (вес ${c.weight}%)`, '');
      if (c.description_ru) {
        sections.push(c.description_ru, '');
      }
      if (c.unit) sections.push(`- Единица измерения: ${c.unit}`);
      if (c.median_value != null) {
        const tail = c.unit ? ` ${c.unit}` : '';
        sections.push(`- Медиана по рынку: ${c.median_value}${tail}`);
      }
      if (c.group_display) sections.push(`- Группа: ${c.group_display}`);
      sections.push('');
    }

    if (methodology.presets && methodology.presets.length > 0) {
      sections.push('### Готовые пресеты', '', 'Подборки критериев для разных сценариев использования:', '');
      for (const p of methodology.presets) {
        const desc = p.description?.trim() || '(без описания)';
        sections.push(`- **${p.label}** — ${desc}`);
      }
      sections.push('');
    }
  }

  if (models.length > 0) {
    const top = models
      .filter((m) => m.publish_status === 'published' && m.rank != null)
      .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
      .slice(0, 30);

    if (top.length > 0) {
      sections.push(
        '## Топ-30 моделей в рейтинге',
        '',
        '| # | Бренд | Серия | Внутренний блок | Индекс | Цена |',
        '|---|-------|-------|-----------------|--------|------|',
      );
      for (const m of top) {
        const price = m.price
          ? `${parseInt(m.price, 10).toLocaleString('ru-RU')} ₽`
          : '—';
        const series = m.series || '—';
        const innerUnit = m.inner_unit || '—';
        const totalIndex = Number.isFinite(m.total_index)
          ? m.total_index.toFixed(1)
          : '—';
        sections.push(
          `| ${m.rank} | ${m.brand} | ${series} | ${innerUnit} | ${totalIndex} | ${price} |`,
        );
      }
      sections.push('');
      sections.push('Полный список моделей: https://hvac-info.com/rating-split-system');
      sections.push('');
    }
  }

  return new NextResponse(sections.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
