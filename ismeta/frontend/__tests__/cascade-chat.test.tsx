import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ChatPanel } from "@/components/estimate/chat-panel";
import { EstimateHeader } from "@/components/estimate/estimate-header";
import { ItemsTable } from "@/components/estimate/items-table";
import { ValidationReportDialog } from "@/components/estimate/validation-report-dialog";
import type {
  ChatMessage,
  Estimate,
  EstimateItem,
  ValidationReport,
} from "@/lib/api/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/estimates/e1",
  useSearchParams: () => new URLSearchParams(),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (m: string) => toastError(m),
    success: (m: string, _o?: unknown) => toastSuccess(m),
    info: (m: string) => toastInfo(m),
  },
  Toaster: () => null,
}));

function wrap(ui: React.ReactElement, qc?: QueryClient) {
  const client =
    qc ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

function makeEstimate(overrides: Partial<Estimate> = {}): Estimate {
  return {
    id: "e1",
    workspace: "11111111-1111-1111-1111-111111111111",
    folder_name: "",
    name: "Вентиляция корпус А",
    status: "in_progress",
    version_number: 2,
    parent_version: null,
    version: 7,
    default_material_markup: {},
    default_work_markup: {},
    total_equipment: "0",
    total_materials: "0",
    total_works: "0",
    total_amount: "0",
    man_hours: "0",
    profitability_percent: "0",
    advance_amount: "0",
    estimated_days: 0,
    note: "",
    created_by: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function makeItem(id: string, overrides: Partial<EstimateItem> = {}): EstimateItem {
  return {
    id,
    section: "sec-1",
    estimate: "e1",
    row_id: "rid-" + id,
    sort_order: 0,
    name: "Позиция " + id,
    unit: "шт",
    quantity: "1",
    equipment_price: "1000",
    material_price: "0",
    work_price: "0",
    equipment_total: "1000",
    material_total: "0",
    work_total: "0",
    total: "1000",
    version: 3,
    match_source: "manual",
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

describe("E26: Cascade — transmitted warning + recalc toast", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    toastError.mockClear();
    toastSuccess.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("показывает warning «Данные в ERP устарели» когда status=transmitted", () => {
    const estimate = makeEstimate({ status: "transmitted" });
    render(wrap(<EstimateHeader estimate={estimate} />));
    const warn = screen.getByTestId("transmitted-warning");
    expect(warn).toHaveAttribute("role", "alert");
    expect(warn.textContent).toMatch(/Данные в ERP устарели/);
  });

  it("НЕ показывает warning на статусе draft/in_progress/ready", () => {
    render(
      wrap(<EstimateHeader estimate={makeEstimate({ status: "draft" })} />),
    );
    expect(screen.queryByTestId("transmitted-warning")).toBeNull();
  });

  it("после PATCH item → invalidate ['estimate', id] + toast «Итоги пересчитаны»", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeItem("i1", { name: "Новое имя", version: 4 }),
        ),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ETag: "4",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    render(
      wrap(
        <ItemsTable
          estimateId="e1"
          items={[makeItem("i1", { name: "Старое имя" })]}
          activeSectionId="sec-1"
          fallbackSectionId="sec-1"
          track="all"
        />,
        qc,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Старое имя" }));
    const input = screen.getByDisplayValue("Старое имя");
    fireEvent.change(input, { target: { value: "Новое имя" } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Итоги пересчитаны"),
    );

    // Проверка каскада: инвалидируются оба queryKey
    const keys = invalidateSpy.mock.calls.map(
      (c) => (c[0] as { queryKey?: unknown[] })?.queryKey?.[0] ?? "",
    );
    expect(keys).toContain("estimate-items");
    expect(keys).toContain("estimate");
  });

  it("рендерит кнопку «ИИ-помощник» и вызывает колбэк (validate перенесён внутрь чата)", () => {
    const onChat = vi.fn();
    render(
      wrap(
        <EstimateHeader
          estimate={makeEstimate()}
          onOpenChat={onChat}
        />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /ИИ-помощник/ }));
    expect(onChat).toHaveBeenCalledTimes(1);
  });
});

describe("E8.2: ValidationReport dialog", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    toastError.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("open → POST /validate/ → рендер 3 issues с severity data-attr", async () => {
    const report: ValidationReport = {
      summary: "Найдены проблемы",
      issues: [
        {
          item_name: "Кабель UTP",
          item_id: "i-kabel",
          severity: "warning",
          category: "price_outlier",
          message: "цена 500₽ выше рынка",
          suggestion: "проверьте прайс",
        },
        {
          item_name: "Вентилятор",
          item_id: "i-fan",
          severity: "error",
          category: "missing_work",
          message: "нет подобранной работы",
          suggestion: "",
        },
        {
          item_name: "Датчик дыма",
          item_id: null,
          severity: "info",
          category: "quantity_mismatch",
          message: "количество 18 шт, проверьте",
          suggestion: "",
        },
      ],
      tokens_used: 1842,
      cost_usd: 0.0213,
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(report), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      wrap(
        <ValidationReportDialog
          estimateId="e1"
          open
          onOpenChange={vi.fn()}
        />,
      ),
    );

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.endsWith("/estimates/e1/validate/"))).toBe(
        true,
      );
    });

    await waitFor(() =>
      expect(screen.getByText(/Найдено 3 проблемы/)).toBeInTheDocument(),
    );

    const items = document.querySelectorAll("li[data-severity]");
    expect(items.length).toBe(3);
    expect(
      document.querySelector('li[data-severity="warning"]'),
    ).toBeTruthy();
    expect(
      document.querySelector('li[data-severity="error"]'),
    ).toBeTruthy();
    expect(
      document.querySelector('li[data-severity="info"]'),
    ).toBeTruthy();

    // Токены и cost в футере
    expect(screen.getByTestId("val-tokens").textContent).toMatch(/1\s?842/);
    expect(screen.getByTestId("val-cost").textContent).toContain("0.02");
  });

  it("клик по issue с item_id → onSelectItem(id) + закрытие", async () => {
    const report: ValidationReport = {
      summary: "",
      issues: [
        {
          item_name: "Кабель",
          item_id: "uuid-1",
          severity: "warning",
          category: "price_outlier",
          message: "дорого",
          suggestion: "",
        },
      ],
      tokens_used: 100,
      cost_usd: 0,
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(report), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      wrap(
        <ValidationReportDialog
          estimateId="e1"
          open
          onOpenChange={onOpenChange}
          onSelectItem={onSelect}
        />,
      ),
    );

    const issue = await waitFor(() => {
      const el = document.querySelector('li[data-severity="warning"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.click(issue);

    expect(onSelect).toHaveBeenCalledWith("uuid-1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("issue без item_id не кликабельна (без role=button)", async () => {
    const report: ValidationReport = {
      summary: "",
      issues: [
        {
          item_name: "Датчик",
          item_id: null,
          severity: "info",
          category: "quantity_mismatch",
          message: "проверьте",
          suggestion: "",
        },
      ],
      tokens_used: 0,
      cost_usd: 0,
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(report), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(
      wrap(
        <ValidationReportDialog
          estimateId="e1"
          open
          onOpenChange={vi.fn()}
        />,
      ),
    );
    const li = await waitFor(() => {
      const el = document.querySelector('li[data-severity="info"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(li.getAttribute("role")).not.toBe("button");
  });
});

describe("E8.2: ChatPanel", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("открытие → GET /chat/history/ → рендер истории с tool-call indicators", async () => {
    const history: ChatMessage[] = [
      {
        id: "m1",
        role: "user",
        content: "Почему кабель стоит 500₽?",
        tool_calls: null,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
        created_at: "",
      },
      {
        id: "m2",
        role: "assistant",
        content: "Рыночная цена Cat.6 — 50-150₽/м. 500₽ выше нормы.",
        tool_calls: [
          { name: "get_item_detail", arguments: { item_id: "x" } },
        ],
        tokens_in: 120,
        tokens_out: 80,
        cost_usd: 0.001,
        created_at: "",
      },
    ];
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(history), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      wrap(<ChatPanel estimateId="e1" open onClose={vi.fn()} />),
    );

    await waitFor(() =>
      expect(screen.getByText(/Почему кабель стоит/)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Рыночная цена Cat.6/),
    ).toBeInTheDocument();

    // tool-call badge
    const toolCallsBox = screen.getByTestId("tool-calls-m2");
    expect(
      toolCallsBox.querySelector('[data-tool-name="get_item_detail"]'),
    ).toBeTruthy();
  });

  it("отправка сообщения → POST /chat/messages/ с body {content}", async () => {
    // первый вызов — history (пустая), затем send → response
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") {
        return new Response("[]", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          message_id: "m-new",
          session_id: "s1",
          content: "Ответ ИИ",
          tool_calls: [],
          tool_results: [],
          tokens_in: 10,
          tokens_out: 5,
          cost_usd: 0.001,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    render(
      wrap(<ChatPanel estimateId="e1" open onClose={vi.fn()} />),
    );

    // Дождаться загрузки истории
    await waitFor(() => {
      const getCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes("/chat/history/"),
      );
      expect(getCall).toBeDefined();
    });

    const input = screen.getByRole("textbox", {
      name: /Сообщение ИИ-помощнику/,
    });
    fireEvent.change(input, { target: { value: "Тестовый вопрос" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((c) => {
        const url = String(c[0]);
        const init = c[1] as RequestInit | undefined;
        return (
          url.includes("/chat/messages/") && init?.method === "POST"
        );
      });
      expect(postCall).toBeDefined();
    });

    const postCall = fetchMock.mock.calls.find((c) => {
      const init = c[1] as RequestInit | undefined;
      return init?.method === "POST";
    })!;
    const [, init] = postCall as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("X-Workspace-Id")).toBeTruthy();
    expect(JSON.parse(init.body as string)).toEqual({
      content: "Тестовый вопрос",
    });
  });

  it("Esc закрывает панель (onClose)", async () => {
    fetchMock.mockResolvedValue(
      new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const onClose = vi.fn();
    render(
      wrap(<ChatPanel estimateId="e1" open onClose={onClose} />),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("пустое сообщение или только пробелы — кнопка Отправить disabled", () => {
    fetchMock.mockResolvedValue(
      new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(
      wrap(<ChatPanel estimateId="e1" open onClose={vi.fn()} />),
    );
    const sendBtn = screen.getByRole("button", { name: "Отправить" });
    expect(sendBtn).toBeDisabled();

    const input = screen.getByRole("textbox", {
      name: /Сообщение ИИ-помощнику/,
    });
    fireEvent.change(input, { target: { value: "  " } });
    expect(sendBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: "текст" } });
    expect(sendBtn).not.toBeDisabled();
  });
});
