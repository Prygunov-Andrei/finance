import type { EstimateItem, EstimateItemTechSpecs, UUID } from "@/lib/api/types";

/**
 * Склейка подряд стоящих строк сметы в одну.
 * Собирает name / tech_specs.model_name / tech_specs.comments через пробел,
 * остальные поля берёт из первой строки.
 */
export interface MergedPatch {
  name: string;
  tech_specs: EstimateItemTechSpecs;
}

const joinNonEmpty = (values: Array<string | undefined | null>): string =>
  values
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

export function computeMerged(rows: EstimateItem[]): MergedPatch {
  if (rows.length === 0) {
    throw new Error("computeMerged: empty rows");
  }
  const first = rows[0];

  const name = joinNonEmpty(rows.map((r) => r.name));

  const modelName = joinNonEmpty(
    rows.map((r) =>
      typeof r.tech_specs?.model_name === "string"
        ? r.tech_specs.model_name
        : "",
    ),
  );

  const comments = joinNonEmpty(
    rows.map((r) =>
      typeof r.tech_specs?.comments === "string" ? r.tech_specs.comments : "",
    ),
  );

  const tech_specs: EstimateItemTechSpecs = {
    ...first.tech_specs,
    model_name: modelName,
    comments,
  };

  return { name, tech_specs };
}

/**
 * Проверка: все ли выделенные items принадлежат одной секции.
 * Возвращает false при >=1 различающемся section UUID.
 */
export function isSameSection(
  items: EstimateItem[],
  selectedIds: Iterable<UUID>,
): boolean {
  const sections = new Set<UUID>();
  const selectedSet = new Set(selectedIds);
  for (const it of items) {
    if (selectedSet.has(it.id)) sections.add(it.section);
  }
  return sections.size <= 1;
}
