import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PdfImportDialog } from "@/components/estimate/pdf-import-dialog";
import type { LLMProfile, RecognitionJob } from "@/lib/api/types";

const toastMock = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: toastMock.toast,
  Toaster: () => null,
}));

const ESTIMATE_ID = "e1";

function makeProfile(overrides: Partial<LLMProfile> = {}): LLMProfile {
  return {
    id: 1,
    name: "OpenAI",
    base_url: "https://api.openai.com",
    api_key_preview: "***1234",
    extract_model: "gpt-4o-mini",
    multimodal_model: "",
    classify_model: "",
    vision_supported: true,
    is_default: true,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function makeJob(overrides: Partial<RecognitionJob> = {}): RecognitionJob {
  return {
    id: "job-1",
    estimate_id: ESTIMATE_ID,
    estimate_name: "Объект A",
    file_name: "spec.pdf",
    file_type: "pdf",
    profile_id: null,
    status: "queued",
    pages_total: null,
    pages_done: 0,
    items_count: 0,
    pages_summary: [],
    llm_costs: {},
    error_message: "",
    apply_result: {},
    is_active: true,
    duration_seconds: null,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

function jsonResponse(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  const utils = render(
    <QueryClientProvider client={qc}>
      <PdfImportDialog
        estimateId={ESTIMATE_ID}
        open
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onOpenChange, qc };
}

describe("PdfImportDialog · LLM profile dropdown", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    toastMock.toast.success.mockClear();
    toastMock.toast.error.mockClear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("preselects default profile and submits llm_profile_id in FormData", async () => {
    const profiles = [
      makeProfile({ id: 1, name: "OpenAI", is_default: false }),
      makeProfile({
        id: 7,
        name: "DeepSeek",
        extract_model: "deepseek-chat",
        is_default: true,
      }),
    ];
    fetchSpy = vi.fn(async (url: RequestInfo) => {
      const u = String(url);
      if (u.includes("/llm-profiles/")) return jsonResponse(profiles);
      return jsonResponse(makeJob(), { status: 202 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    renderDialog();

    const select = (await screen.findByTestId(
      "pdf-import-profile-select",
    )) as HTMLSelectElement;
    expect(select.value).toBe("7");

    const input = screen.getByTestId("pdf-import-input") as HTMLInputElement;
    const file = new File(["x"], "spec.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(([u]) => String(u).includes("import/pdf")),
      ).toBe(true),
    );

    const uploadCall = fetchSpy.mock.calls.find(([u]) =>
      String(u).includes("import/pdf"),
    )!;
    const body = uploadCall[1].body as FormData;
    expect(body.get("file")).toBeInstanceOf(File);
    expect(body.get("llm_profile_id")).toBe("7");
  });

  it("changing dropdown selection sends new profile_id", async () => {
    const profiles = [
      makeProfile({ id: 1, name: "OpenAI", is_default: true }),
      makeProfile({
        id: 2,
        name: "DeepSeek",
        extract_model: "deepseek-chat",
        is_default: false,
      }),
    ];
    fetchSpy = vi.fn(async (url: RequestInfo) => {
      const u = String(url);
      if (u.includes("/llm-profiles/")) return jsonResponse(profiles);
      return jsonResponse(makeJob(), { status: 202 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    renderDialog();

    const select = (await screen.findByTestId(
      "pdf-import-profile-select",
    )) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "2" } });

    const input = screen.getByTestId("pdf-import-input") as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [new File(["x"], "spec.pdf", { type: "application/pdf" })],
      },
    });

    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(([u]) => String(u).includes("import/pdf")),
      ).toBe(true),
    );

    const uploadCall = fetchSpy.mock.calls.find(([u]) =>
      String(u).includes("import/pdf"),
    )!;
    expect((uploadCall[1].body as FormData).get("llm_profile_id")).toBe("2");
  });

  it("shows model in launch toast description", async () => {
    fetchSpy = vi.fn(async (url: RequestInfo) => {
      if (String(url).includes("/llm-profiles/"))
        return jsonResponse([
          makeProfile({ name: "DeepSeek", extract_model: "deepseek-chat" }),
        ]);
      return jsonResponse(makeJob(), { status: 202 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    renderDialog();
    await screen.findByTestId("pdf-import-profile-select");

    const input = screen.getByTestId("pdf-import-input") as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [new File(["x"], "spec.pdf", { type: "application/pdf" })],
      },
    });

    await waitFor(() =>
      expect(toastMock.toast.success).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          description: expect.stringMatching(/DeepSeek.*deepseek-chat/),
        }),
      ),
    );
  });

  it("renders an empty-state hint with link to settings when no profiles", async () => {
    fetchSpy = vi.fn(async (url: RequestInfo) => {
      if (String(url).includes("/llm-profiles/")) return jsonResponse([]);
      return jsonResponse(makeJob(), { status: 202 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    renderDialog();

    expect(
      await screen.findByTestId("pdf-import-no-profiles"),
    ).toBeInTheDocument();
    // dropzone отключён — проверяем aria-disabled.
    expect(screen.getByTestId("pdf-import-dropzone")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
