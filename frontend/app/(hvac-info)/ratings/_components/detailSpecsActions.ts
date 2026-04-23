import type { SpecGroup } from './specs';

/**
 * Текстовое представление таблицы характеристик для clipboard.
 * Формат: каждая группа — заголовок, под ним пары «Критерий\tЗначение»,
 * группы разделены пустой строкой.
 */
export function buildSpecsPlainText(groups: SpecGroup[]): string {
  const lines: string[] = [];
  for (const g of groups) {
    lines.push(g.group_display.toUpperCase());
    for (const r of g.rows) {
      lines.push(`${r.name}\t${r.value}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

/**
 * Строит URL к бекэнду CSV-экспорта.
 *
 * Бекэнд Пети (Polish-4): `GET /api/public/v1/rating/models/<slug>/export.csv`.
 * Возвращает `Content-Disposition: attachment`, так что `<a download>` сам скачает файл.
 *
 * Для SSR build время `process.env.NEXT_PUBLIC_BACKEND_URL` — используем тот же
 * fallback, что и остальные клиентские сервисы: пустая строка = same-origin
 * (next dev + production подставят Host).
 */
export function buildCsvUrl(slug: string): string {
  const base = (
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_BACKEND_URL ?? '' : ''
  ).replace(/\/$/, '');
  return `${base}/api/public/v1/rating/models/${encodeURIComponent(slug)}/export.csv`;
}

/**
 * Копирует табличное представление характеристик в буфер обмена.
 * Возвращает true/false — успех. Ошибки Clipboard API (отказ пользователя,
 * неподдерживаемый контекст) логгируем в консоль и возвращаем false.
 */
export async function copySpecsToClipboard(groups: SpecGroup[]): Promise<boolean> {
  const text = buildSpecsPlainText(groups);
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[DetailSpecs] clipboard.writeText failed', err);
    return false;
  }
}

/**
 * Экспортирует DOM-секцию в PDF через html2canvas + jsPDF.
 *
 * Почему html2canvas: jsPDF не умеет кириллицу без кастомного встроенного шрифта
 * (требует TTF/OTF + VFS — ~500KB бандла). html2canvas рендерит DOM в bitmap,
 * поэтому текст превращается в картинку и язык перестаёт быть проблемой.
 *
 * Оба пакета импортируем динамически: PDF — редкий CTA, нет смысла тянуть
 * в initial bundle.
 */
export async function exportSpecsAsPdf(
  node: HTMLElement,
  slug: string,
): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    });
    const imgData = canvas.toDataURL('image/png');
    // A4 portrait: 210 × 297 мм. Канвас резиним по ширине ≈ 190 мм (margins 10).
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const availWidth = pageWidth - margin * 2;
    const imgWidthMm = availWidth;
    const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;

    // Если картинка выше одной страницы — разбиваем на несколько.
    if (imgHeightMm <= pageHeight - margin * 2) {
      pdf.addImage(imgData, 'PNG', margin, margin, imgWidthMm, imgHeightMm);
    } else {
      const availHeight = pageHeight - margin * 2;
      const pxPerMm = canvas.width / imgWidthMm;
      const pageHeightPx = availHeight * pxPerMm;
      let yOffset = 0;
      let pageNum = 0;
      while (yOffset < canvas.height) {
        const sliceHeight = Math.min(pageHeightPx, canvas.height - yOffset);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        const ctx = pageCanvas.getContext('2d');
        if (!ctx) break;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          yOffset,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight,
        );
        const sliceData = pageCanvas.toDataURL('image/png');
        if (pageNum > 0) pdf.addPage();
        const sliceHeightMm = (sliceHeight * imgWidthMm) / canvas.width;
        pdf.addImage(sliceData, 'PNG', margin, margin, imgWidthMm, sliceHeightMm);
        yOffset += sliceHeight;
        pageNum += 1;
      }
    }

    pdf.save(`${slug}.pdf`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[DetailSpecs] PDF export failed', err);
  }
}
