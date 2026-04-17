import type {
  CreateEstimateDto,
  Estimate,
  EstimateListItem,
  ProblemDetails,
  UUID,
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001/api/v1";

export class ApiError extends Error {
  readonly status: number;
  readonly problem?: ProblemDetails;

  constructor(status: number, message: string, problem?: ProblemDetails) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, "body" | "headers"> {
  body?: BodyInit | Record<string, unknown> | null;
  headers?: Record<string, string>;
  workspaceId: string;
  ifMatch?: number | string;
  expect?: "json" | "blob" | "none";
}

function buildHeaders(opts: ApiFetchOptions, hasJsonBody: boolean): Headers {
  const headers = new Headers(opts.headers ?? {});
  headers.set("X-Workspace-Id", opts.workspaceId);
  if (opts.ifMatch !== undefined && opts.ifMatch !== null) {
    headers.set("If-Match", String(opts.ifMatch));
  }
  if (hasJsonBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has("Accept") && opts.expect !== "blob") {
    headers.set("Accept", "application/json");
  }
  return headers;
}

export async function apiFetch<T>(
  path: string,
  opts: ApiFetchOptions,
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  let body: BodyInit | undefined;
  let hasJsonBody = false;
  if (opts.body != null) {
    if (
      typeof opts.body === "string" ||
      opts.body instanceof FormData ||
      opts.body instanceof Blob ||
      opts.body instanceof ArrayBuffer ||
      opts.body instanceof URLSearchParams
    ) {
      body = opts.body;
    } else {
      body = JSON.stringify(opts.body);
      hasJsonBody = true;
    }
  }

  const headers = buildHeaders(opts, hasJsonBody);

  const response = await fetch(url, {
    ...opts,
    headers,
    body,
  });

  if (!response.ok) {
    let problem: ProblemDetails | undefined;
    try {
      problem = (await response.json()) as ProblemDetails;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(
      response.status,
      problem?.title ?? problem?.detail ?? response.statusText,
      problem,
    );
  }

  if (opts.expect === "blob") return (await response.blob()) as T;
  if (opts.expect === "none" || response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

function q(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries as [string, string][]).toString();
}

export interface EstimateListFilters {
  folder_id?: UUID;
  status?: string;
  q?: string;
  cursor?: string;
}

export const estimateApi = {
  list: (workspaceId: string, filters: EstimateListFilters = {}) =>
    apiFetch<EstimateListItem[]>(
      `/estimates/${q(filters as Record<string, string | undefined>)}`,
      { workspaceId },
    ),

  get: (id: UUID, workspaceId: string) =>
    apiFetch<Estimate>(`/estimates/${id}/`, { workspaceId }),

  create: (data: CreateEstimateDto, workspaceId: string) =>
    apiFetch<Estimate>(`/estimates/`, {
      method: "POST",
      body: data as unknown as Record<string, unknown>,
      workspaceId,
    }),

  update: (
    id: UUID,
    data: Partial<Estimate>,
    version: number,
    workspaceId: string,
  ) =>
    apiFetch<Estimate>(`/estimates/${id}/`, {
      method: "PATCH",
      body: data as unknown as Record<string, unknown>,
      workspaceId,
      ifMatch: version,
    }),

  archive: (id: UUID, workspaceId: string) =>
    apiFetch<void>(`/estimates/${id}/`, {
      method: "DELETE",
      workspaceId,
      expect: "none",
    }),

  exportXlsx: (id: UUID, workspaceId: string) =>
    apiFetch<Blob>(`/estimates/${id}/export/xlsx/`, {
      workspaceId,
      expect: "blob",
    }),
};
