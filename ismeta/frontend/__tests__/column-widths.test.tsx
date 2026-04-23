import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  COLUMN_SIZING_STORAGE_KEY,
  ItemsTable,
} from "@/components/estimate/items-table";
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
    name: "Воздуховод",
    unit: "м.п.",
    quantity: "10",
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

function renderTable(items: EstimateItem[] = [makeItem()]) {
  return render(
    wrap(
      <ItemsTable
        estimateId="est-1"
        items={items}
        activeSectionId="sec-1"
        fallbackSectionId="sec-1"
      />,
    ),
  );
}

/** Вытащить width из inline-style заголовка по его текстовому лейблу. */
function headerWidth(label: string): number {
  const header = screen
    .getAllByRole("columnheader")
    .find((h) => h.textContent?.includes(label));
  if (!header) throw new Error(`Header "${label}" not found`);
  const w = (header as HTMLElement).style.width;
  return Number.parseInt(w, 10);
}

describe("UI-08 ItemsTable column widths", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("применяет дефолтные ширины к resizable колонкам", () => {
    renderTable();
    expect(headerWidth("Наименование")).toBe(500);
    expect(headerWidth("Модель")).toBe(160);
    expect(headerWidth("Ед.изм.")).toBe(80);
    expect(headerWidth("Примечание")).toBe(200);
  });

  it("ячейка name рендерит длинный текст с переносом (whitespace-normal), не overflow-ellipsis", () => {
    const longName =
      "П1/В 1-Приточно-вытяжная установка комплектно со смесительным узлом, пластинчатым рекуператором и стандартным комплектом автоматики, с байпасом, 2000 м3/ч";
    renderTable([makeItem({ name: longName })]);
    const btn = screen.getByRole("button", { name: longName });
    // wrap-режим: truncate НЕ применён, присутствует whitespace-normal
    expect(btn.className).not.toMatch(/\btruncate\b/);
    expect(btn.className).toMatch(/whitespace-normal/);
    expect(btn.className).toMatch(/break-words/);
  });

  it("показывает resize-handle для resizable колонок и скрывает для fixed", () => {
    renderTable();
    // resizable: name, model_name, unit, quantity, equipment_price,
    // material_price, work_price, total, match_source, comments
    expect(screen.getByTestId("resize-handle-name")).toBeInTheDocument();
    expect(screen.getByTestId("resize-handle-unit")).toBeInTheDocument();
    expect(screen.getByTestId("resize-handle-comments")).toBeInTheDocument();
    // fixed: select, row, key_toggle, actions
    expect(screen.queryByTestId("resize-handle-select")).toBeNull();
    expect(screen.queryByTestId("resize-handle-row")).toBeNull();
    expect(screen.queryByTestId("resize-handle-key_toggle")).toBeNull();
    expect(screen.queryByTestId("resize-handle-actions")).toBeNull();
  });

  it("mouse drag по handle меняет ширину колонки (columnResizeMode=onEnd)", () => {
    renderTable();
    const handle = screen.getByTestId("resize-handle-name");
    // перемещение на +100px от стартовой позиции
    fireEvent.mouseDown(handle, { clientX: 500 });
    fireEvent.mouseMove(document, { clientX: 600 });
    fireEvent.mouseUp(document, { clientX: 600 });
    // onEnd: ширина применяется по mouseUp
    expect(headerWidth("Наименование")).toBeGreaterThan(500);
  });

  it("persist'ит columnSizing в localStorage (debounced 300ms)", async () => {
    renderTable();
    const handle = screen.getByTestId("resize-handle-name");
    fireEvent.mouseDown(handle, { clientX: 500 });
    fireEvent.mouseMove(document, { clientX: 620 });
    fireEvent.mouseUp(document, { clientX: 620 });
    // 300ms debounce + небольшой запас; оборачиваем в act чтобы flush'нуть
    // таймер внутри React batch (иначе warning про non-wrapped update).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    const raw = window.localStorage.getItem(COLUMN_SIZING_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.name).toBeGreaterThan(500);
  });

  it("загружает сохранённые ширины из localStorage при mount", async () => {
    window.localStorage.setItem(
      COLUMN_SIZING_STORAGE_KEY,
      JSON.stringify({ name: 700, unit: 120 }),
    );
    renderTable();
    // useEffect loader срабатывает после первого paint — waitFor пережидает
    // один тик и hydration-setState.
    await waitFor(() => {
      expect(headerWidth("Наименование")).toBe(700);
    });
    expect(headerWidth("Ед.изм.")).toBe(120);
    // не заданные в storage — дефолтные
    expect(headerWidth("Модель")).toBe(160);
  });

  it("игнорирует невалидный JSON в localStorage (фолбек к дефолтам)", () => {
    window.localStorage.setItem(COLUMN_SIZING_STORAGE_KEY, "{{broken");
    renderTable();
    expect(headerWidth("Наименование")).toBe(500);
  });

  it("minSize соблюдается при drag влево (не даёт сжать имя ниже 200)", () => {
    renderTable();
    const handle = screen.getByTestId("resize-handle-name");
    fireEvent.mouseDown(handle, { clientX: 500 });
    // драг на -1000px — пытаемся сжать радикально
    fireEvent.mouseMove(document, { clientX: -500 });
    fireEvent.mouseUp(document, { clientX: -500 });
    expect(headerWidth("Наименование")).toBeGreaterThanOrEqual(200);
  });

  it("maxSize соблюдается при drag вправо (name не шире 900)", () => {
    renderTable();
    const handle = screen.getByTestId("resize-handle-name");
    fireEvent.mouseDown(handle, { clientX: 500 });
    // драг на +2000px
    fireEvent.mouseMove(document, { clientX: 2500 });
    fireEvent.mouseUp(document, { clientX: 2500 });
    expect(headerWidth("Наименование")).toBeLessThanOrEqual(900);
  });
});
