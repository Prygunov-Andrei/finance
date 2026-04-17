import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { estimateApi, apiFetch, ApiError } from "@/lib/api/client";

const WS = "11111111-1111-1111-1111-111111111111";

function mockJsonResponse(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("apiFetch / estimateApi", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function callArgs(index = 0): [string, RequestInit] {
    const call = fetchSpy.mock.calls[index] as [string, RequestInit] | undefined;
    if (!call) throw new Error(`fetch was not called (index=${index})`);
    return call;
  }

  it("adds X-Workspace-Id header on list", async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));
    await estimateApi.list(WS);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = callArgs();
    const headers = init.headers as Headers;
    expect(headers.get("X-Workspace-Id")).toBe(WS);
    expect(headers.get("If-Match")).toBeNull();
  });

  it("serialises POST body to JSON with Content-Type and workspace header", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ id: "e1" }, { status: 201 }),
    );

    await estimateApi.create({ name: "Смета", folder_name: "F" }, WS);

    const [url, init] = callArgs();
    expect(String(url)).toMatch(/\/estimates\/$/);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({ name: "Смета", folder_name: "F" }),
    );
    const headers = init.headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Workspace-Id")).toBe(WS);
  });

  it("sends If-Match header on PATCH (optimistic lock)", async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ id: "e1", version: 4 }));

    await estimateApi.update("e1", { name: "upd" }, 3, WS);

    const [, init] = callArgs();
    const headers = init.headers as Headers;
    expect(init.method).toBe("PATCH");
    expect(headers.get("If-Match")).toBe("3");
    expect(headers.get("X-Workspace-Id")).toBe(WS);
  });

  it("throws ApiError with parsed Problem Details on 4xx", async () => {
    const problem = {
      type: "https://ismeta.example.com/errors/conflict",
      title: "Conflict",
      status: 409,
      detail: "version mismatch",
    };
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(problem), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      apiFetch("/estimates/x/", { workspaceId: WS, method: "GET" }),
    ).rejects.toBeInstanceOf(ApiError);

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(problem), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );
    try {
      await apiFetch("/estimates/x/", { workspaceId: WS });
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(409);
      expect((e as ApiError).problem?.detail).toBe("version mismatch");
    }
  });

  it("requests blob for exportXlsx", async () => {
    const blob = new Blob(["xlsx"], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    fetchSpy.mockResolvedValueOnce(
      new Response(blob, { status: 200 }),
    );

    const out = await estimateApi.exportXlsx("e1", WS);

    expect(typeof (out as Blob).arrayBuffer).toBe("function");
    expect((out as Blob).size).toBeGreaterThan(0);
    const [url] = callArgs();
    expect(String(url)).toMatch(/\/estimates\/e1\/export\/xlsx\/$/);
  });
});
