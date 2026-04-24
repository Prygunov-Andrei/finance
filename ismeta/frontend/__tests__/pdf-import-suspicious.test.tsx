import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PdfImportDialog } from "@/components/estimate/pdf-import-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
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

function makePdf(): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "spec.pdf", {
    type: "application/pdf",
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type FetchMock = ReturnType<typeof vi.fn>;

function mockFlow(mock: FetchMock, importBody: Record<string, unknown>) {
  mock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/probe/pdf/")) {
      return jsonResponse({
        pages_total: 3,
        has_text_layer: true,
        estimated_seconds: 3,
      });
    }
    if (url.includes("/import/pdf/")) {
      return jsonResponse(importBody);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

async function triggerImport() {
  render(wrap(<PdfImportDialog estimateId="e1" open onOpenChange={vi.fn()} />));
  fireEvent.change(
    document.querySelector('input[type="file"]') as HTMLInputElement,
    { target: { files: [makePdf()] } },
  );
}

describe("PdfImportDialog — suspicious pages warning", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("no warning when no suspicious pages", async () => {
    mockFlow(fetchMock, {
      created: 10,
      sections: 1,
      errors: [],
      pages_total: 3,
      pages_processed: 3,
      pages_summary: [
        { page: 1, expected_count: 5, expected_count_vision: 5, parsed_count: 5, retried: false, suspicious: false },
        { page: 2, expected_count: 3, expected_count_vision: 3, parsed_count: 3, retried: false, suspicious: false },
        { page: 3, expected_count: 2, expected_count_vision: 2, parsed_count: 2, retried: false, suspicious: false },
      ],
    });

    await triggerImport();
    await waitFor(() =>
      expect(screen.getByText(/Создано: 10 позиций/)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("pdf-import-suspicious-warning")).not.toBeInTheDocument();
  });

  it("warning when ≥1 page suspicious — shows page list and per-page details", async () => {
    mockFlow(fetchMock, {
      created: 8,
      sections: 1,
      errors: [],
      pages_total: 3,
      pages_processed: 3,
      pages_summary: [
        { page: 1, expected_count: 5, expected_count_vision: 5, parsed_count: 5, retried: false, suspicious: false },
        { page: 2, expected_count: 3, expected_count_vision: 7, parsed_count: 3, retried: false, suspicious: true },
        { page: 3, expected_count: 0, expected_count_vision: 4, parsed_count: 0, retried: false, suspicious: true },
      ],
    });

    await triggerImport();
    const warning = await screen.findByTestId("pdf-import-suspicious-warning");
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveTextContent(/Возможны пропущенные позиции/);
    expect(warning).toHaveTextContent(/На страницах\s+2,\s*3/);
    expect(warning).toHaveTextContent(/стр\. 2: распознано 3, проверка «видит» 7/);
    expect(warning).toHaveTextContent(/стр\. 3: распознано 0, проверка «видит» 4/);
  });

  it("legacy backend без pages_summary — UI не падает, банер не рендерится", async () => {
    mockFlow(fetchMock, {
      created: 5,
      sections: 1,
      errors: [],
      pages_total: 3,
      pages_processed: 3,
    });

    await triggerImport();
    await waitFor(() =>
      expect(screen.getByText(/Создано: 5 позиций/)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("pdf-import-suspicious-warning")).not.toBeInTheDocument();
  });

  it("suspicious с retried=true — текст «retry не помог»", async () => {
    mockFlow(fetchMock, {
      created: 2,
      sections: 1,
      errors: [],
      pages_total: 1,
      pages_processed: 1,
      pages_summary: [
        { page: 1, expected_count: 2, expected_count_vision: 6, parsed_count: 2, retried: true, suspicious: true },
      ],
    });

    await triggerImport();
    const warning = await screen.findByTestId("pdf-import-suspicious-warning");
    expect(warning).toHaveTextContent(/стр\. 1: распознано 2, проверка «видит» 6 \(retry не помог\)/);
  });
});
