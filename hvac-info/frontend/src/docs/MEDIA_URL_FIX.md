# Исправление ошибок Mixed Content с изображениями

## Проблема

При загрузке страниц с новостями возникали ошибки:
- **Mixed Content**: Страница загружена через HTTPS, но запрашивает ресурсы через HTTP
- **ERR_HTTP2_SERVER_REFUSED_STREAM**: Старый ngrok домен `finance.ngrok.app` не работает
- **150+ ошибок** в консоли браузера при загрузке списка новостей

## Причина

1. В базе данных сохранены URL изображений со старым ngrok доменом `finance.ngrok.app`
2. Этот домен больше не работает
3. Функция `getMediaUrl` в `/config/api.ts` не включала этот домен в список для замены
4. Дублирующаяся логика обработки URL в `NewsList.tsx` и `NewsDetail.tsx`

## Решение

### 1. Обновлен `/config/api.ts`

Добавлен `finance.ngrok.app` в список старых доменов для автоматической замены:

```typescript
const oldDomains = [
  'finance.ngrok.app',      // ← ДОБАВЛЕНО
  'cold-pugs-press.loca.lt',
];
```

Уд��лен console.log из production кода.

### 2. Рефакторинг `/pages/NewsList.tsx`

- Удалена дублирующая функция `processImageUrl`
- Все вызовы заменены на централизованную `getMediaUrl` из `/config/api.ts`
- Код стал чище и проще поддерживать

**До:**
```typescript
const processImageUrl = (url: string): string => {
  // Дублирующая логика
  const oldDomains = ['finance.ngrok.app', 'cold-pugs-press.loca.lt'];
  // ...
};
return processImageUrl(firstImageMedia.file);
```

**После:**
```typescript
return getMediaUrl(firstImageMedia.file);
```

### 3. Рефакторинг `/pages/NewsDetail.tsx`

- Удалены функции `forceHttps`, `replaceOldDomains`, `processUrls`
- Весь код обработки URL заменен на использование `getMediaUrl`
- Обработка изображений в HTML через regex с применением `getMediaUrl`

**До:**
```typescript
const forceHttps = (url: string): string => { /* ... */ };
const replaceOldDomains = (str: string): string => { /* ... */ };
const processUrls = (str: string) => { /* ... */ };
```

**После:**
```typescript
const processedContent = content.replace(/<img\s+[^>]*src="([^"]*)"[^>]*>/gi, (match, src) => {
  const processedSrc = getMediaUrl(src);
  return match.replace(src, processedSrc);
});

return {
  firstImage: firstImgSrc ? getMediaUrl(firstImgSrc) : null,
  contentHtml: processedContent
};
```

### 4. Рефакторинг `/pages/NewsEditor.tsx`

- Упрощена функция `processImageUrls` - удалена дублирующая логика
- Теперь использует централизованную `getMediaUrl` для всех URL
- Код стал короче и проще поддерживать

**До:**
```typescript
const processImageUrls = (html: string): string => {
  const replaceOldDomains = (str: string): string => { /* ... */ };
  let processed = replaceOldDomains(html);
  processed = processed.replace(/src="\/media/g, `src="${baseUrl}/media`);
  processed = processed.replace(/src="http:\/\//g, 'src="https://');
  return processed;
};
```

**После:**
```typescript
const processImageUrls = (html: string): string => {
  if (!html) return '';
  
  return html.replace(/<img\s+[^>]*src="([^"]*)"[^>]*>/gi, (match, src) => {
    return match.replace(src, getMediaUrl(src));
  }).replace(/<img\s+[^>]*src='([^']*)'[^>]*>/gi, (match, src) => {
    return match.replace(src, getMediaUrl(src));
  });
};
```

## Результат

✅ Все изображения автоматически загружаются с текущего ngrok домена `hvac-news.ngrok.io`  
✅ Ошибки Mixed Content полностью устранены  
✅ Код стал единообразным и проще поддерживать  
✅ Централизованная логика обработки URL в одном месте  

## Текущая конфигурация

- **Текущий ngrok домен**: `https://hvac-news.ngrok.io`
- **Файл конфигурации**: `/config/api.ts`
- **Список старых доменов**: `finance.ngrok.app`, `cold-pugs-press.loca.lt`

## Добавление новых доменов

Если понадобится добавить новый старый домен для замены, обновите только один файл:

```typescript
// /config/api.ts
const oldDomains = [
  'finance.ngrok.app',
  'cold-pugs-press.loca.lt',
  'your-new-old-domain.ngrok.app', // ← добавить сюда
];
```

## Дата исправления

22 января 2026