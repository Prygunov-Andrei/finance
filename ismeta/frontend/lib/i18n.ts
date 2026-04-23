/**
 * Русский pluralize — правило «1 / 2-4 / 5+» с учётом 11-14 (всегда «5+»).
 *
 * UI-09: local helper до момента, когда Петя вынесет в общий модуль в TD-01.
 * Если TD-01 мержится первым и экспортирует pluralizeRows/pluralizeSections —
 * заменить импорт на его helper и удалить этот файл в follow-up.
 */
function pluralize(count: number, forms: [string, string, string]): string {
  const abs = Math.abs(count);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

export function pluralizeRows(count: number): string {
  return pluralize(count, ["строка", "строки", "строк"]);
}

export function pluralizeSections(count: number): string {
  return pluralize(count, ["раздел", "раздела", "разделов"]);
}
