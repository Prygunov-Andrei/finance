import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { MaterialPickerCell } from "@/components/estimate/material-picker-cell";
import { MaterialsMatchingDialog } from "@/components/estimate/materials-matching-dialog";
import type {
  EstimateItem,
  MaterialMatchSession,
  MaterialSearchResponse,
} from "@/lib/api/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (m: string) => toastError(m),
    success: (m: string) => toastSuccess(m),
    info: (m: string) => toastInfo(m),
  },
  Toaster: () => null,
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function searchResponse(
  hits: Partial<MaterialSearchResponse["results"][number]>[],
): MaterialSearchResponse {
  return {
    query: "test",
    results: hits.map((h, i) => ({
      id: h.id ?? `mat-${i}`,
      name: h.name ?? `Материал ${i}`,
      unit: h.unit ?? "шт",
      price: h.price ?? "100.00",
      brand: h.brand ?? null,
      model_name: h.model_name ?? null,
      score: h.score ?? "0.9000",
    })),
  };
}

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// =============================================================================
// MaterialPickerCell
// =============================================================================

describe("MaterialPickerCell — autocomplete", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("render триггера: показывает отформатированную цену, нет popover", () => {
    render(
      wrap(
        <MaterialPickerCell
          value="1250.00"
          workspaceId="ws-1"
          onCommitPrice={vi.fn()}
          onPick={vi.fn()}
        />,
      ),
    );
    const trigger = screen.getByTestId("material-picker-trigger");
    expect(trigger.textContent).toMatch(/1\s?250/);
    expect(screen.queryByTestId("material-picker-listbox")).toBeNull();
  });

  it("клик → открывается popover с initialQuery, один запрос к /materials/search/", async () => {
    fetchMock.mockResolvedValue(
      okResponse(searchResponse([
        { name: "Кабель UTP Cat.6", brand: "ExtraLink", unit: "м", price: "48.00", score: "0.95" },
        { name: "Кабель UTP Cat.5e", brand: "Hyperline", unit: "м", price: "35.00", score: "0.82" },
        { name: "Патч-корд UTP 1 м", brand: null, unit: "шт", price: "180.00", score: "0.71" },
      ])),
    );

    render(
      wrap(
        <MaterialPickerCell
          value="0"
          workspaceId="ws-1"
          initialQuery="Кабель UTP"
          onCommitPrice={vi.fn()}
          onPick={vi.fn()}
        />,
      ),
    );

    fireEvent.click(screen.getByTestId("material-picker-trigger"));
    expect(screen.getByTestId("material-picker-listbox")).toBeInTheDocument();

    // При открытии initialQuery уже непустой — запрос летит через debounce
    // (≤ 250 мс, ждём до 1 сек).
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), {
      timeout: 1000,
    });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toMatch(/\/materials\/search\//);
    expect(String(url)).toMatch(/q=%D0%9A%D0%B0%D0%B1%D0%B5%D0%BB%D1%8C/); // "Кабель" URL-encoded
    expect(String(url)).toMatch(/workspace_id=ws-1/);

    // Результаты рендерятся
    await waitFor(() =>
      expect(screen.getByTestId("material-picker-option-0")).toBeInTheDocument(),
    );
    const opt0 = screen.getByTestId("material-picker-option-0");
    expect(opt0.textContent).toMatch(/Кабель UTP Cat\.6/);
    expect(opt0.textContent).toMatch(/ExtraLink/);
    // Score % убран из dropdown в cleanup перед демо (f92921c) — отображается
    // только в модалке «Подобрать материалы» через bucket-badges.
  });

  it("debounce: typing — только один fetch после паузы", async () => {
    fetchMock.mockResolvedValue(okResponse(searchResponse([])));

    render(
      wrap(
        <MaterialPickerCell
          value="0"
          workspaceId="ws-1"
          onCommitPrice={vi.fn()}
          onPick={vi.fn()}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("material-picker-trigger"));

    const input = screen.getByTestId("material-picker-input") as HTMLInputElement;

    // Три быстрых ввода подряд в течение 50 мс — должно схлопнуться в 1 запрос
    // благодаря 250 мс debounce.
    fireEvent.change(input, { target: { value: "к" } });
    fireEvent.change(input, { target: { value: "ка" } });
    fireEvent.change(input, { target: { value: "каб" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), {
      timeout: 1000,
    });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    // Ушло финальное значение — "каб"
    expect(String(url)).toMatch(/q=%D0%BA%D0%B0%D0%B1/);
  });

  it("выбор материала → onPick с hit, popover закрывается", async () => {
    fetchMock.mockResolvedValue(
      okResponse(searchResponse([
        { id: "m1", name: "Материал A", price: "500.00", score: "0.95" },
      ])),
    );
    const onPick = vi.fn();

    render(
      wrap(
        <MaterialPickerCell
          value="0"
          workspaceId="ws-1"
          initialQuery="A"
          onCommitPrice={vi.fn()}
          onPick={onPick}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("material-picker-trigger"));

    await waitFor(
      () =>
        expect(
          screen.getByTestId("material-picker-option-0"),
        ).toBeInTheDocument(),
      { timeout: 1000 },
    );
    fireEvent.click(screen.getByTestId("material-picker-option-0"));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toMatchObject({
      id: "m1",
      name: "Материал A",
      price: "500.00",
    });
    // popover закрылся
    expect(screen.queryByTestId("material-picker-listbox")).toBeNull();
  });

  it("пустой результат → сообщение «Ничего не найдено»", async () => {
    fetchMock.mockResolvedValue(okResponse(searchResponse([])));

    render(
      wrap(
        <MaterialPickerCell
          value="0"
          workspaceId="ws-1"
          initialQuery="xxx"
          onCommitPrice={vi.fn()}
          onPick={vi.fn()}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("material-picker-trigger"));
    await waitFor(
      () => expect(screen.getByText(/Ничего не найдено/)).toBeInTheDocument(),
      { timeout: 1000 },
    );
  });
});

// =============================================================================
// MaterialsMatchingDialog
// =============================================================================

function makeItem(id: string, name: string): EstimateItem {
  return {
    id,
    section: "sec-1",
    estimate: "est-1",
    row_id: id,
    sort_order: 0,
    name,
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
  };
}

function matchSession(
  results: Partial<MaterialMatchSession["results"][number]>[] = [],
): MaterialMatchSession {
  return {
    session_id: "sess-1",
    total_items: results.length,
    matched: results.length,
    results: results.map((r, i) => ({
      item_id: r.item_id ?? `it-${i}`,
      material_id: r.material_id ?? `mat-${i}`,
      material_name: r.material_name ?? `Материал ${i}`,
      material_unit: r.material_unit ?? "шт",
      material_price: r.material_price ?? "100.00",
      confidence: r.confidence ?? "0.85",
      bucket: r.bucket ?? "yellow",
    })),
  };
}

describe("MaterialsMatchingDialog", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    toastError.mockClear();
    toastSuccess.mockClear();
    toastInfo.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("рендер таблицы: strong/yellow/red бейджи по bucket", async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse(
        matchSession([
          { item_id: "it-1", bucket: "green", confidence: "0.95" },
          { item_id: "it-2", bucket: "yellow", confidence: "0.80" },
          { item_id: "it-3", bucket: "red", confidence: "0.50" },
        ]),
      ),
    );

    render(
      wrap(
        <MaterialsMatchingDialog
          estimateId="est-1"
          items={[makeItem("it-1", "A"), makeItem("it-2", "B"), makeItem("it-3", "C")]}
          open
          onOpenChange={vi.fn()}
        />,
      ),
    );

    await waitFor(() =>
      expect(screen.getByTestId("materials-match-row-it-1")).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId("materials-match-row-it-1").getAttribute("data-bucket"),
    ).toBe("green");
    expect(
      screen.getByTestId("materials-match-row-it-2").getAttribute("data-bucket"),
    ).toBe("yellow");
    expect(
      screen.getByTestId("materials-match-row-it-3").getAttribute("data-bucket"),
    ).toBe("red");
    // Счётчики в footer
    expect(screen.getByText(/Зелёных:\s*1/)).toBeInTheDocument();
    expect(screen.getByText(/Жёлтых:\s*1/)).toBeInTheDocument();
  });

  it("bucket filtering: checkbox зелёных задизейблен и включён; жёлтые — toggle", async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse(
        matchSession([
          { item_id: "it-1", bucket: "green" },
          { item_id: "it-2", bucket: "yellow" },
        ]),
      ),
    );

    render(
      wrap(
        <MaterialsMatchingDialog
          estimateId="est-1"
          items={[makeItem("it-1", "A"), makeItem("it-2", "B")]}
          open
          onOpenChange={vi.fn()}
        />,
      ),
    );

    await waitFor(() =>
      expect(screen.getByTestId("materials-match-checkbox-it-1")).toBeInTheDocument(),
    );

    const cbGreen = screen.getByTestId(
      "materials-match-checkbox-it-1",
    ) as HTMLInputElement;
    const cbYellow = screen.getByTestId(
      "materials-match-checkbox-it-2",
    ) as HTMLInputElement;

    expect(cbGreen.checked).toBe(true);
    expect(cbGreen.disabled).toBe(true); // зелёный нельзя unchecked — они применяются автоматом
    expect(cbYellow.checked).toBe(false);

    fireEvent.click(cbYellow);
    expect(cbYellow.checked).toBe(true);
    fireEvent.click(cbYellow);
    expect(cbYellow.checked).toBe(false);
  });

  it("apply зелёных: POST /match-materials/apply/ body.matches — только зелёные", async () => {
    fetchMock
      .mockResolvedValueOnce(
        okResponse(
          matchSession([
            { item_id: "it-1", bucket: "green", material_price: "100.00" },
            { item_id: "it-2", bucket: "yellow", material_price: "200.00" },
          ]),
        ),
      )
      .mockResolvedValueOnce(okResponse({ updated: 1 }));

    render(
      wrap(
        <MaterialsMatchingDialog
          estimateId="est-1"
          items={[makeItem("it-1", "A"), makeItem("it-2", "B")]}
          open
          onOpenChange={vi.fn()}
        />,
      ),
    );

    await waitFor(() =>
      expect(screen.getByTestId("materials-apply-green")).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByTestId("materials-apply-green"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const applyCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).endsWith("/match-materials/apply/"),
    )!;
    const body = JSON.parse((applyCall[1] as RequestInit).body as string);
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0]).toEqual({
      item_id: "it-1",
      material_price: "100.00",
    });
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/Применено: 1/)),
    );
  });

  it("пустой результат: «совпадений не найдено» + кнопки disabled", async () => {
    fetchMock.mockResolvedValueOnce(okResponse(matchSession([])));

    render(
      wrap(
        <MaterialsMatchingDialog
          estimateId="est-1"
          items={[]}
          open
          onOpenChange={vi.fn()}
        />,
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("materials-match-empty")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("materials-apply-green")).toBeDisabled();
    expect(screen.getByTestId("materials-apply-selected")).toBeDisabled();
  });
});
