/**
 * Russian plural helpers.
 *
 * Правило русской плюрализации по последним двум цифрам:
 * - 11..19 → форма «много» (строк, разделов)
 * - mod10 == 1 → единственное (строка, раздел)
 * - mod10 ∈ 2..4 → «мало» (строки, раздела)
 * - иначе → «много» (строк, разделов)
 *
 * Поддержаны два API:
 *   pluralize(n, {one, few, many})      — объектная форма
 *   pluralize(n, [one, few, many])      — tuple (совместимость с UI-09)
 */

export type PluralForms = {
  one: string;
  few: string;
  many: string;
};

type PluralFormsInput = PluralForms | [string, string, string];

function resolveForm(n: number, forms: PluralForms): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 19) return forms.many;
  if (mod10 === 1) return forms.one;
  if (mod10 >= 2 && mod10 <= 4) return forms.few;
  return forms.many;
}

export function pluralize(n: number, forms: PluralFormsInput): string {
  if (Array.isArray(forms)) {
    return resolveForm(n, { one: forms[0], few: forms[1], many: forms[2] });
  }
  return resolveForm(n, forms);
}

export function pluralizeRows(n: number): string {
  return resolveForm(n, { one: "строка", few: "строки", many: "строк" });
}

export function pluralizeSections(n: number): string {
  return resolveForm(n, { one: "раздел", few: "раздела", many: "разделов" });
}
