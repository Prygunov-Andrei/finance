import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PdfImportDialog } from "@/components/estimate/pdf-import-dialog";
import { EmptyEstimatesState } from "@/app/estimates/empty-state";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (m: string) => toastError(m),
    success: (m: string) => toastSuccess(m),
    info: vi.fn(),
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

function makePdf(name = "spec.pdf"): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, {
    type: "application/pdf",
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function probeResponse(overrides: Partial<{
  pages_total: number;
  has_text_layer: boolean;
  estimated_seconds: number;
}> = {}) {
  return jsonResponse({
    pages_total: 9,
    has_text_layer: true,
    estimated_seconds: 3,
    ...overrides,
  });
}

type FetchMock = ReturnType<typeof vi.fn>;

function routeFetch(mock: FetchMock, routes: {
  probe?: () => Response | Promise<Response>;
  importPdf?: () => Response | Promise<Response>;
}) {
  mock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/probe/pdf/")) {
      if (!routes.probe) throw new Error("probe not mocked");
      return routes.probe();
    }
    if (url.includes("/import/pdf/")) {
      if (!routes.importPdf) throw new Error("import not mocked");
      return routes.importPdf();
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe("PdfImportDialog — probe → uploading (progress + hints) → result", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    toastError.mockClear();
    toastSuccess.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("на стадии choose: dropzone + file input (accept .pdf)", () => {
    render(wrap(<PdfImportDialog estimateId="e1" open onOpenChange={vi.fn()} />));
    expect(screen.getByText(/Перетащите PDF сюда или нажмите для выбора/)).toBeInTheDocument();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toBe(".pdf");
  });

  it("probe happy → показывает число страниц + примерное время, затем uploading→result", async () => {
    let resolveImport!: (r: Response) => void;
    const importPromise = new Promise<Response>((res) => { resolveImport = res; });
    routeFetch(fetchMock, {
      probe: () => probeResponse({ pages_total: 9, has_text_layer: true, estimated_seconds: 3 }),
      importPdf: () => importPromise,
    });

    render(wrap(<PdfImportDialog estimateId="e1" open onOpenChange={vi.fn()} />));
    fireEvent.change(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [makePdf()] } },
    );

    // 1. probing visible immediately after file pick
    expect(screen.getByTestId("pdf-import-probing")).toBeInTheDocument();

    // 2. uploading with page count + estimate
    await waitFor(() =>
      expect(screen.getByTestId("pdf-import-uploading")).toBeInTheDocument(),
    );
    expect(screen.getByText(/PDF-спецификация, 9 страниц/)).toBeInTheDocument();
    expect(screen.getByText(/Примерное время ≈ 3 сек/)).toBeInTheDocument();
    expect(screen.getByTestId("pdf-import-progress")).toBeInTheDocument();

    // 3. release import → result
    resolveImport(jsonResponse({
      created: 42, sections: 3, errors: [], pages_total: 9, pages_processed: 9,
    }));
    await waitFor(() =>
      expect(screen.getByText(/Создано: 42 позиций/)).toBeInTheDocument(),
    );

    // Verify URLs hit in order.
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls[0]).toMatch(/\/estimates\/e1\/probe\/pdf\/$/);
    expect(calls[1]).toMatch(/\/estimates\/e1\/import\/pdf\/$/);
  });

  it("probe fails → fallback на обычный uploading (без страниц), import работает", async () => {
    let resolveImport!: (r: Response) => void;
    const importPromise = new Promise<Response>((res) => { resolveImport = res; });
    routeFetch(fetchMock, {
      probe: () => jsonResponse({ error: "not found" }, 404),
      importPdf: () => importPromise,
    });

    render(wrap(<PdfImportDialog estimateId="e1" open onOpenChange={vi.fn()} />));
    fireEvent.change(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [makePdf()] } },
    );

    await waitFor(() =>
      expect(screen.getByTestId("pdf-import-uploading")).toBeInTheDocument(),
    );
    // Fallback: нет "PDF-спецификация, N страниц", показываем общий текст.
    expect(screen.getByText(/Распознаём PDF…/)).toBeInTheDocument();
    // Прогресс-бар всё равно есть (с fallback estimated_seconds).
    expect(screen.getByTestId("pdf-import-progress")).toBeInTheDocument();

    resolveImport(jsonResponse({
      created: 5, sections: 1, errors: [], pages_total: 3, pages_processed: 3,
    }));
    await waitFor(() =>
      expect(screen.getByText(/Создано: 5 позиций/)).toBeInTheDocument(),
    );
  });

  it("hints соответствуют text layer (has_text_layer=true) — стартовая подсказка про таблицы", async () => {
    let resolveImport!: (r: Response) => void;
    const importPromise = new Promise<Response>((res) => { resolveImport = res; });
    routeFetch(fetchMock, {
      probe: () => probeResponse({ has_text_layer: true, estimated_seconds: 5 }),
      importPdf: () => importPromise,
    });

    render(wrap(<PdfImportDialog estimateId="e1" open onOpenChange={vi.fn()} />));
    fireEvent.change(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [makePdf()] } },
    );

    await waitFor(() =>
      expect(screen.getByTestId("pdf-import-hint")).toHaveTextContent(/Извлекаем текст таблиц/),
    );

    // Освобождаем mutation чтобы не подвис state.
    resolveImport(jsonResponse({ created: 0, sections: 0, errors: [] }));
  });

  it("hints соответствуют vision-режиму (has_text_layer=false) — стартовая подсказка про рендеринг", async () => {
    let resolveImport!: (r: Response) => void;
    const importPromise = new Promise<Response>((res) => { resolveImport = res; });
    routeFetch(fetchMock, {
      probe: () => probeResponse({ has_text_layer: false, estimated_seconds: 45 }),
      importPdf: () => importPromise,
    });

    render(wrap(<PdfImportDialog estimateId="e1" open onOpenChange={vi.fn()} />));
    fireEvent.change(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [makePdf()] } },
    );

    await waitFor(() =>
      expect(screen.getByTestId("pdf-import-hint")).toHaveTextContent(/Рендерим страницы PDF/),
    );
    // Vision-режим явно размечается в UI.
    expect(screen.getByText(/Vision-режим/)).toBeInTheDocument();

    resolveImport(jsonResponse({ created: 0, sections: 0, errors: [] }));
  });

  it("rotating hints: подсказка меняется через интервал (~2.5s)", async () => {
    let resolveImport!: (r: Response) => void;
    const importPromise = new Promise<Response>((res) => { resolveImport = res; });
    routeFetch(fetchMock, {
      probe: () => probeResponse({ has_text_layer: true, estimated_seconds: 10 }),
      importPdf: () => importPromise,
    });

    render(wrap(<PdfImportDialog estimateId="e1" open onOpenChange={vi.fn()} />));
    fireEvent.change(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [makePdf()] } },
    );

    const hint = await screen.findByTestId("pdf-import-hint");
    expect(hint).toHaveTextContent(/Извлекаем текст таблиц/);

    // Ждём смену подсказки (HINT_INTERVAL_MS=2500). С запасом 4s.
    await waitFor(
      () => expect(hint).toHaveTextContent(/Парсим строки спецификации/),
      { timeout: 4000 },
    );

    resolveImport(jsonResponse({ created: 0, sections: 0, errors: [] }));
  }, 10000);

  it("partial: ошибки в result показываются списком", async () => {
    routeFetch(fetchMock, {
      probe: () => probeResponse({ pages_total: 10, has_text_layer: true, estimated_seconds: 5 }),
      importPdf: () => jsonResponse({
        created: 5, sections: 1,
        errors: ["Страница 7: модель не распознана", "Страница 9: нет количества"],
        pages_total: 10, pages_processed: 8,
      }),
    });

    render(wrap(<PdfImportDialog estimateId="e1" open onOpenChange={vi.fn()} />));
    fireEvent.change(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [makePdf()] } },
    );

    await waitFor(() =>
      expect(screen.getByText(/Предупреждения:/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Страница 7: модель не распознана/)).toBeInTheDocument();
    expect(screen.getByText(/Страница 9: нет количества/)).toBeInTheDocument();
  });

  it("502 Bad Gateway на import → toast.error, возврат на choose", async () => {
    routeFetch(fetchMock, {
      probe: () => probeResponse(),
      importPdf: () => jsonResponse({
        error: "Recognition invalid_api_key",
        code: "invalid_api_key",
      }, 502),
    });

    render(wrap(<PdfImportDialog estimateId="e1" open onOpenChange={vi.fn()} />));
    fireEvent.change(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [makePdf()] } },
    );

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.getByText(/Перетащите PDF сюда или нажмите для выбора/)).toBeInTheDocument();
  });

  it("не-pdf файл → toast.error, остаёмся на choose", () => {
    render(wrap(<PdfImportDialog estimateId="e1" open onOpenChange={vi.fn()} />));
    fireEvent.change(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [new File(["x"], "doc.xlsx")] } },
    );
    expect(toastError).toHaveBeenCalledWith("Нужен файл .pdf");
    expect(screen.getByText(/Перетащите PDF сюда или нажмите для выбора/)).toBeInTheDocument();
  });
});

describe("EmptyEstimatesState — PDF кнопка", () => {
  it("рендерит кнопку «Загрузить PDF» и открывает соответствующий диалог", () => {
    render(wrap(<EmptyEstimatesState />));
    const pdfBtn = screen.getByRole("button", { name: /Загрузить PDF/ });
    expect(pdfBtn).toBeInTheDocument();
    fireEvent.click(pdfBtn);
    expect(screen.getAllByText(/Перетащите PDF|\.pdf/).length).toBeGreaterThan(0);
  });
});
