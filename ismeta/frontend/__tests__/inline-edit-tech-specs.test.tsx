/**
 * UI-13: inline-edit для колонки «Модель» (tech_specs.model_name).
 *
 * Колонка была введена в UI-04 (b252a88) уже редактируемой через EditableCell;
 * эти тесты фиксируют контракт gap'ов, которых не было в columns-model-comments:
 *   - пустое значение допустимо (очистка model_name через PATCH с "");
 *   - ошибка API → toast.error с detail из ProblemDetails;
 *   - 409 optimistic-lock → специальный toast + ничего не падает;
 *   - If-Match header = item.version при PATCH.
 *
 * Тест render+merged tech_specs дублируется с columns-model-comments.test.tsx
 * намеренно — ТЗ UI-13 явно требует «test_model_column_renders_existing_value»
 * и «test_edit_model_sends_patch_with_merged_tech_specs» в этом файле как
 * независимый acceptance-набор.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ItemsTable } from "@/components/estimate/items-table";
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
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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
    quantity: "1",
    equipment_price: "0",
    material_price: "0",
    work_price: "0",
    equipment_total: "0",
    material_total: "0",
    work_total: "0",
    total: "0",
    version: 3,
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

function renderTable(item: EstimateItem) {
  return render(
    wrap(
      <ItemsTable
        estimateId="est-1"
        items={[item]}
        activeSectionId="sec-1"
        fallbackSectionId="sec-1"
      />,
    ),
  );
}

describe("UI-13: inline-edit колонки «Модель» (tech_specs.model_name)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    toastMock.success.mockClear();
    toastMock.error.mockClear();
    toastMock.info.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("рендерит существующее значение tech_specs.model_name в ячейке «Модель»", () => {
    renderTable(
      makeItem({ tech_specs: { model_name: "MOB 2600/45-3a" } }),
    );
    expect(
      screen.getByRole("button", { name: "MOB 2600/45-3a" }),
    ).toBeInTheDocument();
  });

  it("редактирование model_name шлёт PATCH с merged tech_specs (brand/manufacturer/comments не теряются)", async () => {
    const item = makeItem({
      tech_specs: {
        model_name: "MOB 2600/45-3a",
        brand: "Systemair",
        manufacturer: "Systemair AB",
        comments: "согласовано с заказчиком",
      },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...item,
          tech_specs: { ...item.tech_specs, model_name: "MOB 2600/45-3b" },
          version: item.version + 1,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    renderTable(item);

    fireEvent.click(screen.getByRole("button", { name: "MOB 2600/45-3a" }));
    const input = screen.getByDisplayValue(
      "MOB 2600/45-3a",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "MOB 2600/45-3b" } });
    fireEvent.blur(input);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toMatch(/\/items\/it-1\/$/);
    expect(init.method).toBe("PATCH");

    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      tech_specs: {
        model_name: "MOB 2600/45-3b",
        brand: "Systemair",
        manufacturer: "Systemair AB",
        comments: "согласовано с заказчиком",
      },
    });
  });

  it("пустое значение допустимо — PATCH с model_name: '' (очистка)", async () => {
    const item = makeItem({
      tech_specs: { model_name: "MOB 2600", brand: "Systemair" },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...item,
          tech_specs: { model_name: "", brand: "Systemair" },
          version: item.version + 1,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    renderTable(item);

    fireEvent.click(screen.getByRole("button", { name: "MOB 2600" }));
    const input = screen.getByDisplayValue("MOB 2600") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      tech_specs: { model_name: "", brand: "Systemair" },
    });
  });

  it("PATCH 500 → toast.error с detail из ProblemDetails", async () => {
    const item = makeItem({ tech_specs: { model_name: "OLD" } });
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          title: "Server error",
          detail: "tech_specs sanitize failed",
          status: 500,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    renderTable(item);

    fireEvent.click(screen.getByRole("button", { name: "OLD" }));
    const input = screen.getByDisplayValue("OLD") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "NEW" } });
    fireEvent.blur(input);

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    const msg = String(toastMock.error.mock.calls[0]?.[0] ?? "");
    expect(msg).toBe("tech_specs sanitize failed");
  });

  it("PATCH 409 (optimistic-lock) → toast.error про конфликт, invalidate без throw", async () => {
    const item = makeItem({ tech_specs: { model_name: "OLD" } });
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          title: "Conflict",
          detail: "Version mismatch",
          status: 409,
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    renderTable(item);

    fireEvent.click(screen.getByRole("button", { name: "OLD" }));
    const input = screen.getByDisplayValue("OLD") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "NEW" } });
    fireEvent.blur(input);

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    const msg = String(toastMock.error.mock.calls[0]?.[0] ?? "");
    expect(msg).toMatch(/обновил/);
  });

  it("PATCH отправляется с If-Match = item.version (optimistic lock)", async () => {
    const item = makeItem({
      version: 7,
      tech_specs: { model_name: "A" },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...item,
          tech_specs: { model_name: "B" },
          version: 8,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    renderTable(item);

    fireEvent.click(screen.getByRole("button", { name: "A" }));
    const input = screen.getByDisplayValue("A") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "B" } });
    fireEvent.blur(input);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get("If-Match")).toBe("7");
  });

  it("blur без изменения значения не шлёт PATCH", async () => {
    const item = makeItem({ tech_specs: { model_name: "MOB 2600" } });
    renderTable(item);

    fireEvent.click(screen.getByRole("button", { name: "MOB 2600" }));
    const input = screen.getByDisplayValue("MOB 2600") as HTMLInputElement;
    fireEvent.blur(input);

    // даём микрозадачам отработать, чтобы убедиться что mutate не вызван
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
