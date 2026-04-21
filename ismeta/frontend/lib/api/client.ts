import type {
  ChatMessage,
  ChatResponse,
  CreateEstimateDto,
  CreateItemDto,
  CreateSectionDto,
  Estimate,
  EstimateItem,
  EstimateListItem,
  EstimateSection,
  ImportResult,
  MaterialApplyResponse,
  MaterialMatchResult,
  MaterialMatchSession,
  MaterialSearchResponse,
  MatchingResult,
  MatchingSession,
  PdfImportPreview,
  PdfItem,
  PdfProbeResponse,
  ProblemDetails,
  UUID,
  ValidationReport,
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
  list: async (workspaceId: string, filters: EstimateListFilters = {}): Promise<EstimateListItem[]> => {
    const resp = await apiFetch<{ results: EstimateListItem[] } | EstimateListItem[]>(
      `/estimates/${q(filters as Record<string, string | undefined>)}`,
      { workspaceId },
    );
    // Backend может вернуть {results: [...]} (с pagination) или [...] (без)
    return Array.isArray(resp) ? resp : resp.results;
  },

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

  createVersion: (id: UUID, workspaceId: string) =>
    apiFetch<Estimate>(`/estimates/${id}/create-version/`, {
      method: "POST",
      workspaceId,
    }),

  sections: (estimateId: UUID, workspaceId: string) =>
    apiFetch<EstimateSection[]>(
      `/estimates/${estimateId}/sections/`,
      { workspaceId },
    ),

  items: (estimateId: UUID, workspaceId: string, sectionId?: UUID) =>
    apiFetch<EstimateItem[]>(
      `/estimates/${estimateId}/items/${q({ section_id: sectionId })}`,
      { workspaceId },
    ),
};

export const sectionApi = {
  create: (estimateId: UUID, data: CreateSectionDto, workspaceId: string) =>
    apiFetch<EstimateSection>(`/estimates/${estimateId}/sections/`, {
      method: "POST",
      body: data as unknown as Record<string, unknown>,
      workspaceId,
    }),

  update: (
    id: UUID,
    data: Partial<EstimateSection>,
    version: number,
    workspaceId: string,
  ) =>
    apiFetch<EstimateSection>(`/sections/${id}/`, {
      method: "PATCH",
      body: data as unknown as Record<string, unknown>,
      workspaceId,
      ifMatch: version,
    }),

  delete: (id: UUID, version: number, workspaceId: string) =>
    apiFetch<void>(`/sections/${id}/`, {
      method: "DELETE",
      workspaceId,
      ifMatch: version,
      expect: "none",
    }),
};

export const itemApi = {
  create: (estimateId: UUID, data: CreateItemDto, workspaceId: string) =>
    apiFetch<EstimateItem>(`/estimates/${estimateId}/items/`, {
      method: "POST",
      body: data as unknown as Record<string, unknown>,
      workspaceId,
    }),

  update: (
    id: UUID,
    data: Partial<EstimateItem>,
    version: number,
    workspaceId: string,
  ) =>
    apiFetch<EstimateItem>(`/items/${id}/`, {
      method: "PATCH",
      body: data as unknown as Record<string, unknown>,
      workspaceId,
      ifMatch: version,
    }),

  softDelete: (id: UUID, version: number, workspaceId: string) =>
    apiFetch<void>(`/items/${id}/`, {
      method: "DELETE",
      workspaceId,
      ifMatch: version,
      expect: "none",
    }),
};

export const matchingApi = {
  start: (estimateId: UUID, workspaceId: string) =>
    apiFetch<MatchingSession>(
      `/estimates/${estimateId}/match-works/`,
      { method: "POST", workspaceId },
    ),

  getProgress: (estimateId: UUID, sessionId: string, workspaceId: string) =>
    apiFetch<{ session_id: string; status: "pending" | "done" | "error" }>(
      `/estimates/${estimateId}/match-works/${sessionId}/`,
      { workspaceId },
    ),

  apply: (
    estimateId: UUID,
    sessionId: string,
    results: MatchingResult[],
    workspaceId: string,
  ) =>
    apiFetch<{ updated: number }>(
      `/estimates/${estimateId}/match-works/${sessionId}/apply/`,
      {
        method: "POST",
        body: { results },
        workspaceId,
      },
    ),
};

export const agentApi = {
  validate: (estimateId: UUID, workspaceId: string) =>
    apiFetch<ValidationReport>(
      `/estimates/${estimateId}/validate/`,
      { method: "POST", workspaceId },
    ),

  sendMessage: (estimateId: UUID, content: string, workspaceId: string) =>
    apiFetch<ChatResponse>(
      `/estimates/${estimateId}/chat/messages/`,
      {
        method: "POST",
        body: { content },
        workspaceId,
      },
    ),

  getHistory: (estimateId: UUID, workspaceId: string) =>
    apiFetch<ChatMessage[]>(
      `/estimates/${estimateId}/chat/history/`,
      { workspaceId },
    ),
};

export const importApi = {
  uploadExcel: (estimateId: UUID, file: File, workspaceId: string) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<ImportResult>(
      `/estimates/${estimateId}/import/excel/`,
      {
        method: "POST",
        body: form,
        workspaceId,
      },
    );
  },

  uploadPdf: (estimateId: UUID, file: File, workspaceId: string) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<ImportResult>(
      `/estimates/${estimateId}/import/pdf/`,
      {
        method: "POST",
        body: form,
        workspaceId,
      },
    );
  },

  probePdf: (estimateId: UUID, file: File, workspaceId: string) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<PdfProbeResponse>(
      `/estimates/${estimateId}/probe/pdf/`,
      {
        method: "POST",
        body: form,
        workspaceId,
      },
    );
  },
};

export const materialApi = {
  search: (query: string, workspaceId: string, limit = 20) => {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
      workspace_id: workspaceId,
    });
    return apiFetch<MaterialSearchResponse>(
      `/materials/search/?${params.toString()}`,
      { workspaceId },
    );
  },

  match: (estimateId: UUID, workspaceId: string) =>
    apiFetch<MaterialMatchSession>(
      `/estimates/${estimateId}/match-materials/`,
      { method: "POST", workspaceId },
    ),

  apply: (
    estimateId: UUID,
    matches: Pick<MaterialMatchResult, "item_id" | "material_price">[],
    workspaceId: string,
  ) =>
    apiFetch<MaterialApplyResponse>(
      `/estimates/${estimateId}/match-materials/apply/`,
      { method: "POST", body: { matches }, workspaceId },
    ),
};
