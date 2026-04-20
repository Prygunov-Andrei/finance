import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ItemsTable } from "@/components/estimate/items-table";
import {
  techSpecsSubLabel,
  techSpecsTitle,
} from "@/components/estimate/tech-specs";
import type { EstimateItem } from "@/lib/api/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function makeItem(overrides: Partial<EstimateItem> = {}): EstimateItem {
  return {
    id: "it-1",
    section: "sec-1",
    estimate: "est-1",
    row_id: "rid-1",
    sort_order: 0,
    name: "Вентилятор канальный",
    unit: "шт",
    quantity: "2",
    equipment_price: "0",
    material_price: "0",
    work_price: "0",
    equipment_total: "0",
    material_total: "0",
    work_total: "0",
    total: "0",
    version: 1,
    match_source: "unmatched",
    material_markup: null,
    work_markup: null,
    tech_specs: {},
    custom_data: {},
    is_deleted: false,
    is_key_equipment: false,
    procurement_status: "none",
    man_hours: "0",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("techSpecsSubLabel", () => {
  it("brand + model_name → 'brand · model_name'", () => {
    expect(
      techSpecsSubLabel({ brand: "Korf", model_name: "WNK 100/1" }),
    ).toBe("Korf · WNK 100/1");
  });

  it("только brand → 'brand' без разделителя", () => {
    expect(techSpecsSubLabel({ brand: "Korf" })).toBe("Korf");
  });

  it("только model_name → 'model_name' без разделителя", () => {
    expect(techSpecsSubLabel({ model_name: "WNK 100/1" })).toBe("WNK 100/1");
  });

  it("пустые/отсутствующие/мусор → null", () => {
    expect(techSpecsSubLabel({})).toBeNull();
    expect(techSpecsSubLabel(null)).toBeNull();
    expect(techSpecsSubLabel(undefined)).toBeNull();
    expect(techSpecsSubLabel({ brand: "   ", model_name: "" })).toBeNull();
    expect(techSpecsSubLabel({ brand: 42, model_name: null })).toBeNull();
  });

  it("триммит пробелы и учитывает только непустые части", () => {
    expect(techSpecsSubLabel({ brand: "  Korf  ", model_name: "" })).toBe(
      "Korf",
    );
    expect(techSpecsSubLabel({ brand: "", model_name: "  WNK  " })).toBe(
      "WNK",
    );
  });
});

describe("techSpecsTitle", () => {
  it("формирует multiline 'k: v' по всем строковым/числовым значениям", () => {
    const t = techSpecsTitle({
      brand: "Korf",
      model_name: "WNK 100/1",
      flow: "2600 м³/ч",
      power: 1.5,
    });
    expect(t).toBeDefined();
    expect(t).toContain("brand: Korf");
    expect(t).toContain("model_name: WNK 100/1");
    expect(t).toContain("flow: 2600 м³/ч");
    expect(t).toContain("power: 1.5");
    expect(t!.split("\n").length).toBe(4);
  });

  it("пустой / без валидных полей → undefined", () => {
    expect(techSpecsTitle({})).toBeUndefined();
    expect(techSpecsTitle(null)).toBeUndefined();
    expect(techSpecsTitle({ brand: "", model_name: "   " })).toBeUndefined();
  });

  it("игнорирует null, undefined и объекты", () => {
    const t = techSpecsTitle({
      brand: "Korf",
      model_name: null,
      extra: undefined,
      nested: { a: 1 },
    });
    expect(t).toBe("brand: Korf");
  });
});

describe("ItemsTable — brand/model отображение", () => {
  it("brand + model видны подстрокой ниже имени (aria-hidden)", () => {
    const item = makeItem({
      tech_specs: { brand: "Korf", model_name: "WNK 100/1" },
    });
    render(
      wrap(
        <ItemsTable
          estimateId="est-1"
          items={[item]}
          activeSectionId="sec-1"
          fallbackSectionId="sec-1"
        />,
      ),
    );
    const sub = screen.getByTestId("item-sub-label");
    expect(sub.textContent).toBe("Korf · WNK 100/1");
    expect(sub.getAttribute("aria-hidden")).toBe("true");
  });

  it("пустые brand/model → подстрока не рендерится", () => {
    const item = makeItem({ tech_specs: {} });
    render(
      wrap(
        <ItemsTable
          estimateId="est-1"
          items={[item]}
          activeSectionId="sec-1"
          fallbackSectionId="sec-1"
        />,
      ),
    );
    expect(screen.queryByTestId("item-sub-label")).toBeNull();
  });

  it("только brand → подстрока без '·'", () => {
    const item = makeItem({ tech_specs: { brand: "Korf" } });
    render(
      wrap(
        <ItemsTable
          estimateId="est-1"
          items={[item]}
          activeSectionId="sec-1"
          fallbackSectionId="sec-1"
        />,
      ),
    );
    const sub = screen.getByTestId("item-sub-label");
    expect(sub.textContent).toBe("Korf");
    expect(sub.textContent).not.toContain("·");
  });

  it("только model_name → подстрока без '·'", () => {
    const item = makeItem({ tech_specs: { model_name: "WNK 100/1" } });
    render(
      wrap(
        <ItemsTable
          estimateId="est-1"
          items={[item]}
          activeSectionId="sec-1"
          fallbackSectionId="sec-1"
        />,
      ),
    );
    const sub = screen.getByTestId("item-sub-label");
    expect(sub.textContent).toBe("WNK 100/1");
    expect(sub.textContent).not.toContain("·");
  });

  it("a11y: accessible name кнопки имени = item.name (без brand/model)", () => {
    const item = makeItem({
      name: "Вентилятор канальный",
      tech_specs: { brand: "Korf", model_name: "WNK 100/1" },
    });
    render(
      wrap(
        <ItemsTable
          estimateId="est-1"
          items={[item]}
          activeSectionId="sec-1"
          fallbackSectionId="sec-1"
        />,
      ),
    );
    const btn = screen.getByRole("button", { name: "Вентилятор канальный" });
    expect(btn).toBeInTheDocument();
    // В accessible name кнопки не должно быть brand/model_name
    expect(btn.getAttribute("aria-label")).toBeNull();
    expect(btn.textContent).toBe("Вентилятор канальный");
  });

  it("tooltip tech_specs: title на TableRow содержит все поля", () => {
    const item = makeItem({
      id: "it-tip",
      tech_specs: {
        brand: "Korf",
        model_name: "WNK 100/1",
        flow: "2600 м³/ч",
      },
    });
    render(
      wrap(
        <ItemsTable
          estimateId="est-1"
          items={[item]}
          activeSectionId="sec-1"
          fallbackSectionId="sec-1"
        />,
      ),
    );
    const row = document.getElementById("item-row-it-tip");
    expect(row).not.toBeNull();
    const title = row!.getAttribute("title");
    expect(title).toBeTruthy();
    expect(title).toContain("brand: Korf");
    expect(title).toContain("flow: 2600 м³/ч");
  });

  it("tooltip не ставится, если tech_specs пустой", () => {
    const item = makeItem({ id: "it-notip", tech_specs: {} });
    render(
      wrap(
        <ItemsTable
          estimateId="est-1"
          items={[item]}
          activeSectionId="sec-1"
          fallbackSectionId="sec-1"
        />,
      ),
    );
    const row = document.getElementById("item-row-it-notip");
    expect(row).not.toBeNull();
    expect(row!.hasAttribute("title")).toBe(false);
  });
});
