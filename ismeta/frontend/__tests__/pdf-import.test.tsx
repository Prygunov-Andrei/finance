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

describe("PdfImportDialog (simplified flow: choose → uploading → result)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    toastError.mockClear();
    toastSuccess.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("на стадии choose: dropzone + file input (accept .pdf)", () => {
    render(
      wrap(<PdfImportDialog estimateId="e1" open onOpenChange={vi.fn()} />),
    );
    expect(
      screen.getByText(/Перетащите PDF сюда или нажмите для выбора/),
    ).toBeInTheDocument();
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toBe(".pdf");
  });

  it("upload: POST FormData на /import/pdf/ → stage uploading → result", async () => {
    fetchMock.mockImplementation(async () => {
      // имитируем задержку, чтобы stage=uploading стал виден
      await new Promise((r) => setTimeout(r, 10));
      return new Response(
        JSON.stringify({
          created: 42,
          updated: 0,
          sections: 3,
          errors: [],
          pages_total: 12,
          pages_processed: 12,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    render(
      wrap(<PdfImportDialog estimateId="e1" open onOpenChange={vi.fn()} />),
    );

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makePdf()] } });

    expect(screen.getByText("Распознавание...")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText(/Создано: 42 позиций/)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Обработано страниц: 12 из 12/),
    ).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toMatch(/\/estimates\/e1\/import\/pdf\/$/);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const headers = init.headers as Headers;
    expect(headers.get("X-Workspace-Id")).toBeTruthy();
    expect(headers.get("Content-Type")).not.toBe("application/json");
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringMatching(/Распознано: 42/),
    );
  });

  it("не-pdf файл → toast.error, остаёмся на choose", () => {
    render(
      wrap(<PdfImportDialog estimateId="e1" open onOpenChange={vi.fn()} />),
    );
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "doc.xlsx")] },
    });
    expect(toastError).toHaveBeenCalledWith("Нужен файл .pdf");
    expect(
      screen.getByText(/Перетащите PDF сюда или нажмите для выбора/),
    ).toBeInTheDocument();
  });

  it("ошибки в result показываются списком", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          created: 5,
          updated: 0,
          errors: ["Страница 7: модель не распознана", "Страница 9: нет количества"],
          pages_total: 10,
          pages_processed: 10,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    render(
      wrap(<PdfImportDialog estimateId="e1" open onOpenChange={vi.fn()} />),
    );
    fireEvent.change(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [makePdf()] } },
    );

    await waitFor(() =>
      expect(screen.getByText(/Предупреждения:/)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Страница 7: модель не распознана/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Страница 9: нет количества/),
    ).toBeInTheDocument();
  });
});

describe("EmptyEstimatesState — PDF кнопка", () => {
  it("рендерит кнопку «Загрузить PDF» и открывает соответствующий диалог", () => {
    render(wrap(<EmptyEstimatesState />));
    const pdfBtn = screen.getByRole("button", { name: /Загрузить PDF/ });
    expect(pdfBtn).toBeInTheDocument();
    fireEvent.click(pdfBtn);
    // В зависимости от реализации диалог может открыться сразу или через
    // Trigger. Проверяем появление dropzone с текстом .pdf.
    expect(
      screen.getAllByText(/Перетащите PDF|\.pdf/).length,
    ).toBeGreaterThan(0);
  });
});
