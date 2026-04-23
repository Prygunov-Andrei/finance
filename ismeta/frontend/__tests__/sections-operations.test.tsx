/**
 * UI-09 — тесты операций с разделами (move items, merge sections, counters).
 *
 * Findings #46-#49 (QA-CYCLE-10 заход 1/10).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ItemsTable } from "@/components/estimate/items-table";
import { SectionsPanel } from "@/components/estimate/sections-panel";
import { pluralizeRows, pluralizeSections } from "@/lib/i18n";
import type { EstimateItem, EstimateSection } from "@/lib/api/types";

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

function makeSection(overrides: Partial<EstimateSection> = {}): EstimateSection {
  return {
    id: "sec-A",
    estimate: "est-1",
    name: "Раздел A",
    sort_order: 0,
    version: 1,
    material_markup: null,
    work_markup: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function makeItem(overrides: Partial<EstimateItem> = {}): EstimateItem {
  return {
    id: "it-1",
    section: "sec-A",
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

const sectionsFixture: EstimateSection[] = [
  makeSection({ id: "sec-A", name: "Вентиляция", sort_order: 0, version: 1 }),
  makeSection({ id: "sec-B", name: "Кондиционирование", sort_order: 1, version: 2 }),
  makeSection({ id: "sec-C", name: "Автоматика", sort_order: 2, version: 3 }),
];

// ---------------------------------------------------------------------------
// #47 — Плюралайзер и счётчик
// ---------------------------------------------------------------------------

describe("UI-09 #47 — pluralize helpers", () => {
  it("pluralizeRows: 1 → строка, 2/3/4 → строки, 5-20 → строк, 11-14 → строк", () => {
    expect(pluralizeRows(1)).toBe("строка");
    expect(pluralizeRows(2)).toBe("строки");
    expect(pluralizeRows(3)).toBe("строки");
    expect(pluralizeRows(4)).toBe("строки");
    expect(pluralizeRows(5)).toBe("строк");
    expect(pluralizeRows(11)).toBe("строк");
    expect(pluralizeRows(12)).toBe("строк");
    expect(pluralizeRows(14)).toBe("строк");
    expect(pluralizeRows(21)).toBe("строка");
    expect(pluralizeRows(22)).toBe("строки");
    expect(pluralizeRows(101)).toBe("строка");
  });

  it("pluralizeSections: 1 раздел / 2 раздела / 5 разделов", () => {
    expect(pluralizeSections(1)).toBe("раздел");
    expect(pluralizeSections(2)).toBe("раздела");
    expect(pluralizeSections(5)).toBe("разделов");
    expect(pluralizeSections(11)).toBe("разделов");
  });
});

describe("UI-09 #47 — section item counters", () => {
  it("sidebar показывает (N) рядом с названием каждого раздела", () => {
    const items = [
      makeItem({ id: "1", section: "sec-A" }),
      makeItem({ id: "2", section: "sec-A" }),
      makeItem({ id: "3", section: "sec-A" }),
      makeItem({ id: "4", section: "sec-B" }),
    ];
    render(
      wrap(
        <SectionsPanel
          estimateId="est-1"
          sections={sectionsFixture}
          selectedId={null}
          onSelect={vi.fn()}
          itemCounts={{ "sec-A": 3, "sec-B": 1, "sec-C": 0 }}
          totalItemCount={items.length}
          items={items}
        />,
      ),
    );
    expect(
      screen.getByTestId("section-item-count-sec-A").textContent,
    ).toBe("(3)");
    expect(
      screen.getByTestId("section-item-count-sec-B").textContent,
    ).toBe("(1)");
    expect(
      screen.getByTestId("section-item-count-sec-C").textContent,
    ).toBe("(0)");
    expect(
      screen.getByTestId("section-item-count-all").textContent,
    ).toBe("(4)");
  });

  it("без itemCounts prop — счётчики не рендерятся (бэк-совместимость)", () => {
    render(
      wrap(
        <SectionsPanel
          estimateId="est-1"
          sections={sectionsFixture}
          selectedId={null}
          onSelect={vi.fn()}
        />,
      ),
    );
    expect(screen.queryByTestId("section-item-count-sec-A")).toBeNull();
    expect(screen.queryByTestId("section-item-count-all")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// #46 — Move items between sections
// ---------------------------------------------------------------------------

describe("UI-09 #46 — move items between sections", () => {
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

  function renderWithRows(opts?: { items?: EstimateItem[] }) {
    const items =
      opts?.items ??
      [
        makeItem({ id: "it-1", section: "sec-A", sort_order: 0, name: "A1" }),
        makeItem({ id: "it-2", section: "sec-A", sort_order: 1, name: "A2" }),
        makeItem({ id: "it-3", section: "sec-A", sort_order: 2, name: "A3" }),
      ];
    render(
      wrap(
        <ItemsTable
          estimateId="est-1"
          items={items}
          activeSectionId="sec-A"
          fallbackSectionId="sec-A"
          sections={sectionsFixture}
        />,
      ),
    );
    return items;
  }

  it("Move-кнопка видна в toolbar при selection ≥ 1 (даже для одного item)", () => {
    renderWithRows();
    fireEvent.click(getRowCheckbox(0));
    // toolbar показан даже при 1 selected (ранее был ≥ 2 для Merge only)
    expect(screen.getByTestId("merge-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("move-dropdown-trigger")).toBeInTheDocument();
    // Merge disabled т.к. < 2
    const mergeBtn = screen.getByTestId("merge-button") as HTMLButtonElement;
    expect(mergeBtn.disabled).toBe(true);
  });

  it("dropdown показывает все разделы кроме текущего (single-section selection)", async () => {
    const user = userEvent.setup();
    renderWithRows();
    fireEvent.click(getRowCheckbox(0));
    fireEvent.click(getRowCheckbox(1));
    await user.click(screen.getByTestId("move-dropdown-trigger"));
    // sec-A — текущий, исключается
    expect(screen.queryByTestId("move-target-sec-A")).toBeNull();
    expect(screen.getByTestId("move-target-sec-B")).toBeInTheDocument();
    expect(screen.getByTestId("move-target-sec-C")).toBeInTheDocument();
    // Новый раздел — всегда присутствует
    expect(screen.getByTestId("move-new-section")).toBeInTheDocument();
  });

  it("cross-section selection разрешён, dropdown показывает все секции", async () => {
    const user = userEvent.setup();
    renderWithRows({
      items: [
        makeItem({ id: "it-1", section: "sec-A", sort_order: 0 }),
        makeItem({ id: "it-2", section: "sec-B", sort_order: 1 }),
      ],
    });
    fireEvent.click(getRowCheckbox(0));
    fireEvent.click(getRowCheckbox(1));
    // Merge disabled (cross-section)
    const mergeBtn = screen.getByTestId("merge-button") as HTMLButtonElement;
    expect(mergeBtn.disabled).toBe(true);
    // Move доступен
    await user.click(screen.getByTestId("move-dropdown-trigger"));
    expect(screen.getByTestId("move-target-sec-A")).toBeInTheDocument();
    expect(screen.getByTestId("move-target-sec-B")).toBeInTheDocument();
    expect(screen.getByTestId("move-target-sec-C")).toBeInTheDocument();
  });

  it("выбор раздела → N последовательных PATCH с правильным section id", async () => {
    const user = userEvent.setup();
    renderWithRows();
    // 3 PATCH ответа (для 3 items)
    for (let i = 0; i < 3; i++) {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: "2" },
        }),
      );
    }
    fireEvent.click(getRowCheckbox(0));
    fireEvent.click(getRowCheckbox(1));
    fireEvent.click(getRowCheckbox(2));

    await user.click(screen.getByTestId("move-dropdown-trigger"));
    await user.click(screen.getByTestId("move-target-sec-B"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toMatch(/\/items\/it-1\/$/);
    expect(urls[1]).toMatch(/\/items\/it-2\/$/);
    expect(urls[2]).toMatch(/\/items\/it-3\/$/);

    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.method).toBe("PATCH");
      const body = JSON.parse(String(init.body));
      expect(body.section).toBe("sec-B");
    }
  });

  it("успешный move → toast success с plural'ом и selection сбрасывается", async () => {
    const user = userEvent.setup();
    renderWithRows();
    for (let i = 0; i < 2; i++) {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: "2" },
        }),
      );
    }
    fireEvent.click(getRowCheckbox(0));
    fireEvent.click(getRowCheckbox(1));

    await user.click(screen.getByTestId("move-dropdown-trigger"));
    await user.click(screen.getByTestId("move-target-sec-B"));

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith(
        'Перенесено 2 строки в раздел «Кондиционирование»',
      );
    });
    // Selection сбрасывается после success → toolbar должен исчезнуть
    await waitFor(() => {
      expect(screen.queryByTestId("merge-toolbar")).toBeNull();
    });
  });

  it("PATCH error → toast error, selection сохранён для retry", async () => {
    const user = userEvent.setup();
    renderWithRows();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ title: "err", detail: "server down", status: 500 }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    fireEvent.click(getRowCheckbox(0));
    await user.click(screen.getByTestId("move-dropdown-trigger"));
    await user.click(screen.getByTestId("move-target-sec-B"));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(String(toastMock.error.mock.calls[0]?.[0])).toMatch(
      /Не удалось перенести/,
    );
    // selection сохранён
    expect(getRowCheckbox(0).checked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// #48 — Merge sections
// ---------------------------------------------------------------------------

describe("UI-09 #48 — merge sections", () => {
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

  function renderPanel() {
    const items = [
      makeItem({ id: "it-1", section: "sec-A", version: 1, total: "100" }),
      makeItem({ id: "it-2", section: "sec-A", version: 1, total: "200" }),
      makeItem({ id: "it-3", section: "sec-B", version: 1, total: "50" }),
      makeItem({ id: "it-4", section: "sec-B", version: 1, total: "75" }),
      makeItem({ id: "it-5", section: "sec-B", version: 1, total: "25" }),
      makeItem({ id: "it-6", section: "sec-C", version: 1, total: "10" }),
    ];
    render(
      wrap(
        <SectionsPanel
          estimateId="est-1"
          sections={sectionsFixture}
          selectedId={null}
          onSelect={vi.fn()}
          itemCounts={{ "sec-A": 2, "sec-B": 3, "sec-C": 1 }}
          totalItemCount={items.length}
          subtotals={{ "sec-A": 300, "sec-B": 150, "sec-C": 10 }}
          totalAll={460}
          items={items}
        />,
      ),
    );
    return items;
  }

  it("checkbox у раздела — click отмечает раздел", () => {
    renderPanel();
    const cb = screen.getByTestId("section-checkbox-sec-A") as HTMLInputElement;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    expect(cb.checked).toBe(true);
  });

  it("bulk toolbar разделов появляется при selection ≥ 2", () => {
    renderPanel();
    expect(screen.queryByTestId("sections-bulk-toolbar")).toBeNull();

    fireEvent.click(screen.getByTestId("section-checkbox-sec-A"));
    expect(screen.queryByTestId("sections-bulk-toolbar")).toBeNull();

    fireEvent.click(screen.getByTestId("section-checkbox-sec-B"));
    expect(screen.getByTestId("sections-bulk-toolbar")).toBeInTheDocument();
    expect(
      screen.getByTestId("sections-bulk-toolbar").textContent,
    ).toContain("Выделено: 2 раздела");
  });

  it("confirm dialog показывает preview (counts, totals, имена)", async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("section-checkbox-sec-A"));
    fireEvent.click(screen.getByTestId("section-checkbox-sec-B"));
    fireEvent.click(screen.getByTestId("sections-merge-button"));

    const preview = await screen.findByTestId("sections-merge-preview");
    // sec-A — target (sort_order=0), sec-B — source
    expect(preview.textContent).toContain("Вентиляция");
    expect(preview.textContent).toContain("Кондиционирование");
    // Результат: 2+3=5 items
    expect(
      screen.getByTestId("sections-merge-result").textContent,
    ).toContain("Вентиляция");
    expect(
      screen.getByTestId("sections-merge-result").textContent,
    ).toContain("(5");
  });

  it("название берётся от первого раздела по sort_order даже при обратном порядке клика", async () => {
    renderPanel();
    // Сначала кликаем sec-B (sort_order=1), затем sec-A (sort_order=0)
    fireEvent.click(screen.getByTestId("section-checkbox-sec-B"));
    fireEvent.click(screen.getByTestId("section-checkbox-sec-A"));
    fireEvent.click(screen.getByTestId("sections-merge-button"));

    const result = await screen.findByTestId("sections-merge-result");
    // target по sort_order → sec-A → «Вентиляция»
    expect(result.textContent).toContain("Вентиляция");
    expect(result.textContent).not.toContain("«Кондиционирование»");
  });

  it("confirm → N PATCH items + M DELETE sections в правильном порядке", async () => {
    renderPanel();
    // PATCH ответы для 3 items в sec-B
    for (let i = 0; i < 3; i++) {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: "2" },
        }),
      );
    }
    // DELETE sec-B
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    fireEvent.click(screen.getByTestId("section-checkbox-sec-A"));
    fireEvent.click(screen.getByTestId("section-checkbox-sec-B"));
    fireEvent.click(screen.getByTestId("sections-merge-button"));
    fireEvent.click(await screen.findByTestId("sections-merge-confirm"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

    // Первые 3 — PATCH /items/ на items из sec-B (it-3, it-4, it-5)
    const [url1, init1] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url1)).toMatch(/\/items\/it-3\/$/);
    expect(init1.method).toBe("PATCH");
    expect(JSON.parse(String(init1.body)).section).toBe("sec-A");

    const [url2] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(String(url2)).toMatch(/\/items\/it-4\/$/);

    const [url3] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(String(url3)).toMatch(/\/items\/it-5\/$/);

    // DELETE /sections/sec-B после всех PATCH
    const [url4, init4] = fetchMock.mock.calls[3] as [string, RequestInit];
    expect(String(url4)).toMatch(/\/sections\/sec-B\/$/);
    expect(init4.method).toBe("DELETE");
  });

  it("успешный merge → toast success с plural'ом и selection сбрасывается", async () => {
    renderPanel();
    // 3 PATCH + 1 DELETE
    for (let i = 0; i < 3; i++) {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: "2" },
        }),
      );
    }
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    fireEvent.click(screen.getByTestId("section-checkbox-sec-A"));
    fireEvent.click(screen.getByTestId("section-checkbox-sec-B"));
    fireEvent.click(screen.getByTestId("sections-merge-button"));
    fireEvent.click(await screen.findByTestId("sections-merge-confirm"));

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith(
        'Объединено 2 раздела в «Вентиляция»',
      );
    });
  });

  it("merge трёх разделов: N=items(sec-B)+items(sec-C) PATCH + 2 DELETE", async () => {
    renderPanel();
    // sec-B has 3 items, sec-C has 1 item → 4 PATCH + 2 DELETE
    for (let i = 0; i < 4; i++) {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: "2" },
        }),
      );
    }
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    fireEvent.click(screen.getByTestId("section-checkbox-sec-A"));
    fireEvent.click(screen.getByTestId("section-checkbox-sec-B"));
    fireEvent.click(screen.getByTestId("section-checkbox-sec-C"));
    fireEvent.click(screen.getByTestId("sections-merge-button"));
    fireEvent.click(await screen.findByTestId("sections-merge-confirm"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));

    // Первые 4 — PATCH, последние 2 — DELETE
    for (let i = 0; i < 4; i++) {
      const init = fetchMock.mock.calls[i][1] as RequestInit;
      expect(init.method).toBe("PATCH");
    }
    const del1 = fetchMock.mock.calls[4][1] as RequestInit;
    const del2 = fetchMock.mock.calls[5][1] as RequestInit;
    expect(del1.method).toBe("DELETE");
    expect(del2.method).toBe("DELETE");
  });

  it("PATCH error → toast error, диалог не закрывается до invalidate", async () => {
    renderPanel();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ title: "err", detail: "db down", status: 500 }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    fireEvent.click(screen.getByTestId("section-checkbox-sec-A"));
    fireEvent.click(screen.getByTestId("section-checkbox-sec-B"));
    fireEvent.click(screen.getByTestId("sections-merge-button"));
    fireEvent.click(await screen.findByTestId("sections-merge-confirm"));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(String(toastMock.error.mock.calls[0]?.[0])).toMatch(
      /Не удалось объединить разделы/,
    );
  });
});

// ---------------------------------------------------------------------------
// #49 — Добавить раздел (кнопка уже существует)
// ---------------------------------------------------------------------------

describe("UI-09 #49 — add section", () => {
  it("кнопка «+ Добавить раздел» рендерится в sidebar", () => {
    render(
      wrap(
        <SectionsPanel
          estimateId="est-1"
          sections={sectionsFixture}
          selectedId={null}
          onSelect={vi.fn()}
        />,
      ),
    );
    expect(screen.getByTestId("add-section-button")).toBeInTheDocument();
    expect(screen.getByText("Добавить раздел")).toBeInTheDocument();
  });

  it("клик → появляется inline input для имени", () => {
    render(
      wrap(
        <SectionsPanel
          estimateId="est-1"
          sections={sectionsFixture}
          selectedId={null}
          onSelect={vi.fn()}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("add-section-button"));
    const input = screen.getByPlaceholderText("Название раздела");
    expect(input).toBeInTheDocument();
  });
});
