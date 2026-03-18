import { getMediaUrl } from '../config/api';

/**
 * Удаляет HTML теги из строки и декодирует HTML-сущности
 */
export const stripHtml = (html: string): string => {
  if (!html) return '';
  
  const tmp = document.createElement('DIV');
  tmp.innerHTML = html;
  const text = tmp.textContent || tmp.innerText || '';
  
  // Декодируем HTML-сущности
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
};

/**
 * Извлекает URL первого изображения из HTML
 */
export const extractFirstImageFromHtml = (html: string): string | null => {
  if (!html) return null;
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const img = doc.querySelector('img');
  
  if (!img?.src) return null;
  
  // Обрабатываем URL через getMediaUrl
  return getMediaUrl(img.src);
};

/**
 * Получает excerpt (отрывок) из текста с удалением HTML/Markdown
 */
export const getExcerpt = (text: string, maxLength: number = 200): string => {
  if (!text) return '';
  
  // Убираем Markdown и HTML форматирование
  const cleanText = text
    .replace(/!\[.*?\]\(.*?\)/g, '') // Удаляем изображения Markdown
    .replace(/<video.*?<\/video>/gs, '') // Удаляем видео
    .replace(/<img[^>]*>/gi, '') // Удаляем изображения HTML
    .replace(/<[^>]*>/g, '') // Удаляем остальные HTML теги
    .replace(/[#*_~`]/g, '') // Удаляем Markdown символы
    .trim();
  
  if (cleanText.length <= maxLength) return cleanText;
  
  // Обрезаем до maxLength и добавляем многоточие
  return cleanText.substring(0, maxLength).trim() + '...';
};

/**
 * Обрабатывает все URL изображений в HTML через getMediaUrl
 */
export const processImageUrls = (html: string): string => {
  if (!html) return '';
  
  return html
    .replace(/<img\s+[^>]*src="([^"]*)"[^>]*>/gi, (match, src) => {
      return match.replace(src, getMediaUrl(src));
    })
    .replace(/<img\s+[^>]*src='([^']*)'[^>]*>/gi, (match, src) => {
      return match.replace(src, getMediaUrl(src));
    });
};

/**
 * Извлекает первое изображение из HTML и возвращает обработанный контент
 */
export const extractAndProcessContent = (html: string): { firstImage: string | null; contentHtml: string } => {
  if (!html) return { firstImage: null, contentHtml: '' };
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  const firstImg = tempDiv.querySelector('img');
  let firstImgSrc: string | null = null;
  
  if (firstImg) {
    firstImgSrc = getMediaUrl(firstImg.src);
    firstImg.remove();
  }
  
  // Убираем пустые параграфы
  let content = tempDiv.innerHTML.replace(/<p>\s*<\/p>/g, '');
  
  // Обрабатываем оставшиеся изображения
  content = processImageUrls(content);
  
  return {
    firstImage: firstImgSrc,
    contentHtml: content
  };
};
