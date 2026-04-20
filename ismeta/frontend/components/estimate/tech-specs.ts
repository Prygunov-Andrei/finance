/**
 * Хелперы для отображения полей из EstimateItem.tech_specs.
 *
 * tech_specs — открытый JSON, куда бэкенд кладёт нормализованные поля
 * (model_name, brand) + произвольные параметры (flow, power, ...). UI
 * читает только заранее известные ключи; остальное показываем в title.
 */

type TechSpecs = Record<string, unknown> | null | undefined;

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Подпись под именем: "{brand} · {model_name}" / "{brand}" / "{model_name}"
 * или null, если ни того, ни другого нет. Разделитель " · " только при
 * наличии обоих полей.
 */
export function techSpecsSubLabel(techSpecs: TechSpecs): string | null {
  if (!techSpecs) return null;
  const brand = asTrimmedString(techSpecs.brand);
  const model = asTrimmedString(techSpecs.model_name);
  const parts = [brand, model].filter((s) => s.length > 0);
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

/**
 * Формирует многострочный title для hover-tooltip: "key: value" по всем
 * ключам tech_specs (включая model_name/brand). Возвращает undefined,
 * если нет ни одного строкового/числового значения — чтобы не показывать
 * пустой tooltip.
 */
export function techSpecsTitle(techSpecs: TechSpecs): string | undefined {
  if (!techSpecs) return undefined;
  const lines: string[] = [];
  for (const [k, v] of Object.entries(techSpecs)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed.length === 0) continue;
      lines.push(`${k}: ${trimmed}`);
    } else if (typeof v === "number" || typeof v === "boolean") {
      lines.push(`${k}: ${String(v)}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : undefined;
}
