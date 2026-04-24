import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { EstimateNote } from "@/components/estimate/estimate-note";
import type { Estimate } from "@/lib/api/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: (msg: string) => toastError(msg),
    success: (msg: string) => toastSuccess(msg),
  },
  Toaster: () => null,
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function makeEstimate(overrides: Partial<Estimate> = {}): Estimate {
  return {
    id: "est-1",
    workspace: "ws-1",
    folder_name: "",
    name: "Тестовая смета",
    status: "draft",
    version_number: 1,
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

describe("EstimateNote", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    toastError.mockClear();
    toastSuccess.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("свёрнутое состояние → «+ Заметка» когда note пустая", () => {
    render(wrap(<EstimateNote estimate={makeEstimate({ note: "" })} />));
    expect(screen.getByTestId("estimate-note-expand")).toHaveTextContent(
      "+ Заметка",
    );
    expect(screen.queryByTestId("estimate-note")).toBeNull();
  });

  it("свёрнутое состояние после collapse с контентом → «Заметка» (без «+»)", () => {
    render(
      wrap(<EstimateNote estimate={makeEstimate({ note: "привет" })} />),
    );
    // По умолчанию note!=="" → развёрнуто; свернём и проверим кнопку.
    fireEvent.click(screen.getByTestId("estimate-note-collapse"));
    const btn = screen.getByTestId("estimate-note-expand");
    expect(btn).toHaveTextContent("Заметка");
    expect(btn).not.toHaveTextContent("+");
  });

  it("клик по свёрнутой кнопке → textarea появляется", () => {
    render(wrap(<EstimateNote estimate={makeEstimate({ note: "" })} />));
    fireEvent.click(screen.getByTestId("estimate-note-expand"));
    expect(screen.getByTestId("estimate-note-textarea")).toBeInTheDocument();
  });

  it("ввод текста → PATCH /estimates/:id/ с {note} после debounce", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ...makeEstimate({ note: "Хм" }), version: 8 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    render(
      wrap(<EstimateNote estimate={makeEstimate({ note: "Хм" })} />),
    );
    const textarea = screen.getByTestId(
      "estimate-note-textarea",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Хм!" } });

    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toMatch(/\/estimates\/est-1\/$/);
    expect(init.method).toBe("PATCH");
    const headers = init.headers as Headers;
    expect(headers.get("If-Match")).toBe("7");
    expect(init.body).toBe(JSON.stringify({ note: "Хм!" }));
  });

  it("быстрая последовательность вводов → только один PATCH после тишины", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ ...makeEstimate({ note: "abc" }), version: 8 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    render(wrap(<EstimateNote estimate={makeEstimate({ note: "a" })} />));
    const textarea = screen.getByTestId(
      "estimate-note-textarea",
    ) as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "ab" } });
    await new Promise((r) => setTimeout(r, 200));
    fireEvent.change(textarea, { target: { value: "abc" } });
    expect(fetchMock).not.toHaveBeenCalled();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    });
    // После тишины 800ms — ровно один вызов с последним значением.
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ note: "abc" }));
  });

  it("ввод >5000 символов → обрезка до 5000", () => {
    render(wrap(<EstimateNote estimate={makeEstimate({ note: "" })} />));
    fireEvent.click(screen.getByTestId("estimate-note-expand"));
    const textarea = screen.getByTestId(
      "estimate-note-textarea",
    ) as HTMLTextAreaElement;
    const huge = "я".repeat(5200);
    fireEvent.change(textarea, { target: { value: huge } });
    expect(textarea.value).toHaveLength(5000);
    expect(screen.getByTestId("estimate-note-counter")).toHaveTextContent(
      "5000 / 5000",
    );
  });

  it("Ctrl+Enter в textarea → свёрнутое состояние", () => {
    render(
      wrap(<EstimateNote estimate={makeEstimate({ note: "тек" })} />),
    );
    const textarea = screen.getByTestId("estimate-note-textarea");
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    expect(screen.queryByTestId("estimate-note-textarea")).toBeNull();
    expect(screen.getByTestId("estimate-note-expand")).toBeInTheDocument();
  });

  it("Cmd+Enter в textarea → свёрнутое состояние (macOS)", () => {
    render(
      wrap(<EstimateNote estimate={makeEstimate({ note: "тек" })} />),
    );
    const textarea = screen.getByTestId("estimate-note-textarea");
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    expect(screen.queryByTestId("estimate-note-textarea")).toBeNull();
  });

  it("ошибка API → toast.error с problem.detail", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "https://ismeta/errors/server",
          title: "Server error",
          status: 500,
          detail: "note too long",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    );
    render(wrap(<EstimateNote estimate={makeEstimate({ note: "a" })} />));
    const textarea = screen.getByTestId(
      "estimate-note-textarea",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "ab" } });
    await waitFor(
      () => expect(toastError).toHaveBeenCalledWith("note too long"),
      { timeout: 2000 },
    );
  });
});
