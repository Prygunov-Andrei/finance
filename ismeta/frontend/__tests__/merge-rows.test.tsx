import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ItemsTable } from "@/components/estimate/items-table";
import { computeMerged, isSameSection } from "@/components/estimate/merge-rows";
import type { EstimateItem } from "@/lib/api/types";

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: toastMock,
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
    name: "Позиция",
    unit: "шт",
    quantity: "1",
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

function getRowCheckbox(index: number): HTMLInputElement {
  const row = document.querySelectorAll("tbody tr")[index];
  if (!row) throw new Error(`Row #${index} not found`);
  const cb = row.querySelector(
    'input[type="checkbox"]',
  ) as HTMLInputElement | null;
  if (!cb) throw new Error(`Checkbox in row #${index} not found`);
  return cb;
}

describe("merge-rows — pure functions", () => {
  it("computeMerged склеивает name / model_name / comments через пробел", () => {
    const rows = [
      makeItem({
        id: "1",
        name: "Приточно-вытяжная установка",
        tech_specs: { model_name: "LM DUCT Q 40-20", comments: "подвесная" },
      }),
      makeItem({
        id: "2",
        name: "L=755/655 м³/ч Pc=300 Па",
        tech_specs: { model_name: "", comments: "" },
      }),
      makeItem({
        id: "3",
        name: "комплектно со смесительным узлом",
        tech_specs: { model_name: "", comments: "с рекуператором" },
      }),
    ];
    const merged = computeMerged(rows);
    expect(merged.name).toBe(
      "Приточно-вытяжная установка L=755/655 м³/ч Pc=300 Па комплектно со смесительным узлом",
    );
    expect(merged.tech_specs.model_name).toBe("LM DUCT Q 40-20");
    expect(merged.tech_specs.comments).toBe("подвесная с рекуператором");
  });

  it("computeMerged сохраняет произвольные ключи tech_specs из первой строки", () => {
    const rows = [
      makeItem({
        id: "1",
        name: "A",
        tech_specs: { model_name: "M1", flow: "2600", brand: "Korf" },
      }),
      makeItem({
        id: "2",
        name: "B",
        tech_specs: { model_name: "M2", flow: "другое", brand: "Other" },
      }),
    ];
    const merged = computeMerged(rows);
    expect(merged.tech_specs.flow).toBe("2600");
    expect(merged.tech_specs.brand).toBe("Korf");
    expect(merged.tech_specs.model_name).toBe("M1 M2");
  });

  it("isSameSection: true когда все в одной секции, false когда разные", () => {
    const items = [
      makeItem({ id: "1", section: "A" }),
      makeItem({ id: "2", section: "A" }),
      makeItem({ id: "3", section: "B" }),
    ];
    expect(isSameSection(items, ["1", "2"])).toBe(true);
    expect(isSameSection(items, ["1", "3"])).toBe(false);
    expect(isSameSection(items, [])).toBe(true);
  });
});

describe("ItemsTable — checkbox selection (UI-06)", () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  it("клик по checkbox добавляет строку в выделение", () => {
    const items = [
      makeItem({ id: "1", sort_order: 0, name: "Строка 1" }),
      makeItem({ id: "2", sort_order: 1, name: "Строка 2" }),
    ];
    render(
      wrap(
        <ItemsTable
          estimateId="est-1"
          items={items}
          activeSectionId="sec-1"
          fallbackSectionId="sec-1"
        />,
      ),
    );
    const cb = getRowCheckbox(0);
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    expect(cb.checked).toBe(true);

    // UI-09: toolbar показан даже при 1 выделенном (для Move), но Merge
    // disabled до selection ≥ 2.
    expect(screen.getByTestId("merge-toolbar")).toBeInTheDocument();
    const mergeBtn = screen.getByTestId("merge-button") as HTMLButtonElement;
    expect(mergeBtn.disabled).toBe(true);
  });

  it("shift-click выделяет диапазон строк", () => {
    const items = [
      makeItem({ id: "1", sort_order: 0, name: "A" }),
      makeItem({ id: "2", sort_order: 1, name: "B" }),
      makeItem({ id: "3", sort_order: 2, name: "C" }),
      makeItem({ id: "4", sort_order: 3, name: "D" }),
    ];
    render(
      wrap(
        <ItemsTable
          estimateId="est-1"
          items={items}
          activeSectionId="sec-1"
          fallbackSectionId="sec-1"
        />,
      ),
    );
    fireEvent.click(getRowCheckbox(0));
    fireEvent.click(getRowCheckbox(2), { shiftKey: true });

    expect(getRowCheckbox(0).checked).toBe(true);
    expect(getRowCheckbox(1).checked).toBe(true);
    expect(getRowCheckbox(2).checked).toBe(true);
    expect(getRowCheckbox(3).checked).toBe(false);
  });

  it("toolbar появляется при selection ≥ 1 (UI-09 для Move); Merge-кнопка активна при ≥ 2", () => {
    const items = [
      makeItem({ id: "1", sort_order: 0 }),
      makeItem({ id: "2", sort_order: 1 }),
      makeItem({ id: "3", sort_order: 2 }),
    ];
    render(
      wrap(
        <ItemsTable
          estimateId="est-1"
          items={items}
          activeSectionId="sec-1"
          fallbackSectionId="sec-1"
        />,
      ),
    );
    expect(screen.queryByTestId("merge-toolbar")).toBeNull();

    fireEvent.click(getRowCheckbox(0));
    // UI-09: toolbar виден при ≥1 (для Move), Merge disabled
    expect(screen.getByTestId("merge-toolbar")).toBeInTheDocument();
    expect(
      (screen.getByTestId("merge-button") as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(getRowCheckbox(1));
    expect(screen.getByTestId("merge-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("merge-toolbar").textContent).toContain(
      "Выделено: 2",
    );
    // ≥2 в одной секции → Merge активен
    expect(
      (screen.getByTestId("merge-button") as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});

describe("ItemsTable — merge dialog и API calls (UI-06)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderWithRows() {
    const items = [
      makeItem({
        id: "it-1",
        sort_order: 0,
        name: "Приточно-вытяжная установка",
        tech_specs: { model_name: "LM DUCT Q 40-20", comments: "подвесная" },
        unit: "шт",
        quantity: "1",
      }),
      makeItem({
        id: "it-2",
        sort_order: 1,
        name: "L=755 м³/ч",
        tech_specs: { model_name: "", comments: "" },
      }),
      makeItem({
        id: "it-3",
        sort_order: 2,
        name: "комплектно со смесительным узлом",
        tech_specs: { model_name: "", comments: "с рекуператором" },
      }),
    ];
    render(
      wrap(
        <ItemsTable
          estimateId="est-1"
          items={items}
          activeSectionId="sec-1"
          fallbackSectionId="sec-1"
        />,
      ),
    );
    return items;
  }

  it("confirm dialog показывает склеенные name / model / comments", async () => {
    renderWithRows();
    fireEvent.click(getRowCheckbox(0));
    fireEvent.click(getRowCheckbox(1));
    fireEvent.click(getRowCheckbox(2));

    fireEvent.click(screen.getByTestId("merge-button"));

    const preview = await screen.findByTestId("merge-preview");
    expect(within(preview).getByTestId("merge-preview-name")).toHaveTextContent(
      "Приточно-вытяжная установка L=755 м³/ч комплектно со смесительным узлом",
    );
    expect(
      within(preview).getByTestId("merge-preview-model"),
    ).toHaveTextContent("LM DUCT Q 40-20");
    expect(
      within(preview).getByTestId("merge-preview-comments"),
    ).toHaveTextContent("подвесная с рекуператором");
  });

  it("confirm → 1 PATCH на первую строку + N-1 DELETE на остальные", async () => {
    renderWithRows();

    // PATCH ответ
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "it-1",
          section: "sec-1",
          estimate: "est-1",
          row_id: "rid-1",
          sort_order: 0,
          name: "merged",
          unit: "шт",
          quantity: "1",
          equipment_price: "0",
          material_price: "0",
          work_price: "0",
          equipment_total: "0",
          material_total: "0",
          work_total: "0",
          total: "0",
          version: 2,
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
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: "2" },
        },
      ),
    );
    // 2 DELETE ответа
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    fireEvent.click(getRowCheckbox(0));
    fireEvent.click(getRowCheckbox(1));
    fireEvent.click(getRowCheckbox(2));
    fireEvent.click(screen.getByTestId("merge-button"));
    fireEvent.click(await screen.findByTestId("merge-confirm"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const [patchUrl, patchInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(String(patchUrl)).toMatch(/\/items\/it-1\/$/);
    expect(patchInit.method).toBe("PATCH");
    const patchBody = JSON.parse(String(patchInit.body));
    expect(patchBody.name).toBe(
      "Приточно-вытяжная установка L=755 м³/ч комплектно со смесительным узлом",
    );
    expect(patchBody.tech_specs.model_name).toBe("LM DUCT Q 40-20");
    expect(patchBody.tech_specs.comments).toBe("подвесная с рекуператором");

    const [delUrl1, delInit1] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(String(delUrl1)).toMatch(/\/items\/it-2\/$/);
    expect(delInit1.method).toBe("DELETE");

    const [delUrl2, delInit2] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(String(delUrl2)).toMatch(/\/items\/it-3\/$/);
    expect(delInit2.method).toBe("DELETE");
  });

  it("cross-section: кнопка disabled + подсказка", () => {
    const items = [
      makeItem({ id: "1", section: "sec-A", sort_order: 0 }),
      makeItem({ id: "2", section: "sec-B", sort_order: 1 }),
    ];
    render(
      wrap(
        <ItemsTable
          estimateId="est-1"
          items={items}
          activeSectionId={null}
          fallbackSectionId={null}
        />,
      ),
    );
    fireEvent.click(getRowCheckbox(0));
    fireEvent.click(getRowCheckbox(1));

    const btn = screen.getByTestId("merge-button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe("Строки должны быть в одной секции");
    expect(screen.getByTestId("merge-toolbar").textContent).toContain(
      "Строки должны быть в одной секции",
    );
  });

  it("успешный merge → toast success «Объединено N строки/строк в одну»", async () => {
    renderWithRows();
    fetchMock.mockResolvedValueOnce(
      new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json", ETag: "2" },
      }),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    fireEvent.click(getRowCheckbox(0));
    fireEvent.click(getRowCheckbox(1));
    fireEvent.click(screen.getByTestId("merge-button"));
    fireEvent.click(await screen.findByTestId("merge-confirm"));

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith(
        "Объединено 2 строки в одну",
      );
    });
  });

  it("PATCH 500 → toast error, selection сохранён для retry", async () => {
    renderWithRows();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ title: "Server error", detail: "db down", status: 500 }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    fireEvent.click(getRowCheckbox(0));
    fireEvent.click(getRowCheckbox(1));
    fireEvent.click(screen.getByTestId("merge-button"));
    fireEvent.click(await screen.findByTestId("merge-confirm"));

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalled();
    });
    const msg = String(toastMock.error.mock.calls[0]?.[0] ?? "");
    expect(msg).toMatch(/Не удалось объединить/);

    // селекшн сохранён
    expect(getRowCheckbox(0).checked).toBe(true);
    expect(getRowCheckbox(1).checked).toBe(true);
    // DELETE не вызывался — только PATCH упал
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
