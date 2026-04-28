import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LlmProfileForm } from "@/components/settings/llm-profile-form";
import type { LLMProfile } from "@/lib/api/types";

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

function makeProfile(overrides: Partial<LLMProfile> = {}): LLMProfile {
  return {
    id: 5,
    name: "OpenAI",
    base_url: "https://api.openai.com",
    api_key_preview: "***1234",
    extract_model: "gpt-4o-mini",
    multimodal_model: "gpt-4o",
    classify_model: "",
    vision_supported: true,
    is_default: false,
    created_at: "",
    updated_at: "",
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

function renderForm(
  profile: LLMProfile | null = null,
  isFirstProfile = false,
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  const utils = render(
    <QueryClientProvider client={qc}>
      <LlmProfileForm
        open
        profile={profile}
        isFirstProfile={isFirstProfile}
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onOpenChange, qc };
}

describe("LlmProfileForm", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    toastMock.toast.success.mockClear();
    toastMock.toast.error.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("submit disabled until required fields filled (create mode)", async () => {
    renderForm(null);
    const submit = screen.getByTestId("llm-form-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId("llm-form-name"), {
      target: { value: "DS" },
    });
    fireEvent.change(screen.getByTestId("llm-form-extract-model"), {
      target: { value: "deepseek-chat" },
    });
    fireEvent.change(screen.getByTestId("llm-form-api-key"), {
      target: { value: "sk-xxx" },
    });

    expect(submit.disabled).toBe(false);
  });

  it("creates a profile via POST and closes the dialog on success", async () => {
    fetchSpy = vi.fn(async (url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      if (u.endsWith("/llm-profiles/") && method === "POST") {
        const body = JSON.parse(String(init?.body));
        expect(body.name).toBe("DeepSeek");
        expect(body.extract_model).toBe("deepseek-chat");
        expect(body.api_key).toBe("sk-secret");
        expect(body.base_url).toBe("https://api.deepseek.com");
        return jsonResponse(makeProfile({ id: 9, name: "DeepSeek" }), {
          status: 201,
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { onOpenChange } = renderForm(null);

    fireEvent.change(screen.getByTestId("llm-form-name"), {
      target: { value: "DeepSeek" },
    });
    fireEvent.change(screen.getByTestId("llm-form-preset"), {
      target: { value: "deepseek" },
    });
    fireEvent.change(screen.getByTestId("llm-form-extract-model"), {
      target: { value: "deepseek-chat" },
    });
    fireEvent.change(screen.getByTestId("llm-form-api-key"), {
      target: { value: "sk-secret" },
    });

    fireEvent.click(screen.getByTestId("llm-form-submit"));

    await waitFor(() => expect(toastMock.toast.success).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("update mode: api_key omitted from PATCH when left empty", async () => {
    fetchSpy = vi.fn(async (url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      if (u.includes("/llm-profiles/5/") && method === "PATCH") {
        const body = JSON.parse(String(init?.body));
        expect(body.api_key).toBeUndefined();
        expect(body.name).toBe("OpenAI gpt-5.4");
        return jsonResponse(
          makeProfile({ id: 5, name: "OpenAI gpt-5.4" }),
        );
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchSpy);

    renderForm(makeProfile());

    const nameInput = screen.getByTestId("llm-form-name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "OpenAI gpt-5.4" } });

    fireEvent.click(screen.getByTestId("llm-form-submit"));

    await waitFor(() => expect(toastMock.toast.success).toHaveBeenCalled());
  });

  it("test-connection button shows ✓ on success", async () => {
    fetchSpy = vi.fn(async (url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      if (u.includes("/llm-profiles/test-connection/") && method === "POST") {
        return jsonResponse({ ok: true, models: ["gpt-4o", "gpt-4o-mini"] });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchSpy);

    renderForm(null);

    fireEvent.change(screen.getByTestId("llm-form-name"), {
      target: { value: "OpenAI" },
    });
    fireEvent.change(screen.getByTestId("llm-form-extract-model"), {
      target: { value: "gpt-4o-mini" },
    });
    fireEvent.change(screen.getByTestId("llm-form-api-key"), {
      target: { value: "sk-xxx" },
    });

    fireEvent.click(screen.getByTestId("llm-form-test"));

    expect(
      await screen.findByTestId("llm-form-test-ok"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("llm-form-test-ok").textContent).toMatch(
      /2 моделей/,
    );
  });

  it("test-connection button shows ✗ on failure", async () => {
    fetchSpy = vi.fn(async (url: RequestInfo) => {
      const u = String(url);
      if (u.includes("/llm-profiles/test-connection/")) {
        return jsonResponse({ ok: false, status_code: 401, error: "unauthorized" });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchSpy);

    renderForm(null);

    fireEvent.change(screen.getByTestId("llm-form-name"), {
      target: { value: "X" },
    });
    fireEvent.change(screen.getByTestId("llm-form-extract-model"), {
      target: { value: "x" },
    });
    fireEvent.change(screen.getByTestId("llm-form-api-key"), {
      target: { value: "wrong" },
    });

    fireEvent.click(screen.getByTestId("llm-form-test"));

    const err = await screen.findByTestId("llm-form-test-error");
    expect(err.textContent).toMatch(/unauthorized/);
  });
});
