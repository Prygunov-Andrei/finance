type HeadersInitLike = HeadersInit;

const ERP_API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api/v1';

const deriveKanbanBaseUrl = () => {
  const trimmed = ERP_API_BASE_URL.replace(/\/+$/, '');
  const origin = trimmed.replace(/\/api\/v1$/, '');
  return `${origin}/kanban-api/v1`;
};

const KANBAN_API_BASE_URL = (import.meta as any).env?.VITE_KANBAN_API_URL || deriveKanbanBaseUrl();

/* ---------- Types ---------- */

export type KanbanBoard = { id: string; key: string; title: string };
export type KanbanColumn = { id: string; board: string; key: string; title: string; order: number };

export type KanbanCard = {
  id: string;
  board: string;
  column: string;
  type: string;
  title: string;
  description: string;
  meta: Record<string, any>;
  due_date: string | null;
  assignee_user_id: number | null;
  assignee_username: string;
  created_by_user_id: number | null;
  created_by_username: string;
  created_at: string;
  updated_at: string;
};

export type CardColor = 'red' | 'yellow' | 'blue' | 'green' | null;

export type CommercialCase = {
  id: string;
  card: string;
  erp_object_id: number | null;
  erp_object_name: string;
  system_name: string;
  erp_counterparty_id: number | null;
  erp_counterparty_name: string;
  erp_tkp_ids: number[];
  contacts_info: string;
  comments: string;
  created_at: string;
  updated_at: string;
};

export type KanbanAttachment = {
  id: string;
  card: string;
  file: string;
  file_sha256: string;
  file_mime_type: string;
  file_original_filename: string;
  kind: 'document' | 'photo' | 'other';
  document_type: string;
  title: string;
  meta: Record<string, any>;
  created_by_user_id: number | null;
  created_by_username: string;
  created_at: string;
};

export type FileInitResponse = {
  file: { id: string; sha256: string; status: string; original_filename: string };
  upload_url: string;
  already_exists: boolean;
};

export type StockLocation = {
  id: string;
  kind: 'warehouse' | 'object';
  title: string;
  erp_object_id: number | null;
};

export type StockBalanceRow = {
  erp_product_id: number;
  product_name: string;
  unit: string;
  qty: string;
  ahhtung: boolean;
};

type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

/* ---------- Client ---------- */

class KanbanApiClient {
  private getAuthHeader(): HeadersInitLike {
    const token = localStorage.getItem('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${KANBAN_API_BASE_URL}${endpoint}`;
    const headers: HeadersInitLike = {
      ...this.getAuthHeader(),
      ...options.headers,
    };

    if (!(options.body instanceof FormData)) {
      (headers as any)['Content-Type'] = 'application/json';
    }

    const resp = await fetch(url, { ...options, headers });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(text || `HTTP ${resp.status}`);
    }

    if (resp.status === 204 || options.method === 'DELETE') {
      return undefined as T;
    }

    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return (await resp.json()) as T;
    }
    return undefined as T;
  }

  private normalizeListResponse<T>(resp: PaginatedResponse<T> | T[]): T[] {
    if (Array.isArray(resp)) return resp;
    if (resp && typeof resp === 'object' && Array.isArray((resp as any).results)) {
      return (resp as PaginatedResponse<T>).results;
    }
    return [];
  }

  /* --- Boards --- */

  async listBoards() {
    const resp = await this.request<PaginatedResponse<KanbanBoard> | KanbanBoard[]>('/boards/');
    return this.normalizeListResponse(resp);
  }

  async getBoardByKey(key: string) {
    const resp = await this.request<PaginatedResponse<KanbanBoard> | KanbanBoard[]>(`/boards/?key=${encodeURIComponent(key)}`);
    const boards = this.normalizeListResponse(resp);
    return boards[0] || null;
  }

  /* --- Columns --- */

  async listColumns(boardId: string) {
    const resp = await this.request<PaginatedResponse<KanbanColumn> | KanbanColumn[]>(`/columns/?board_id=${encodeURIComponent(boardId)}`);
    return this.normalizeListResponse(resp);
  }

  /* --- Cards --- */

  async listCards(boardId: string, type?: string) {
    const typeParam = type ? `&type=${encodeURIComponent(type)}` : '';
    const resp = await this.request<PaginatedResponse<KanbanCard> | KanbanCard[]>(`/cards/?board_id=${encodeURIComponent(boardId)}${typeParam}`);
    return this.normalizeListResponse(resp);
  }

  createCard(data: {
    board: string;
    column: string;
    type: string;
    title: string;
    description?: string;
    meta?: Record<string, any>;
  }) {
    return this.request<KanbanCard>('/cards/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateCard(cardId: string, data: Partial<{ title: string; description: string; meta: Record<string, any>; due_date: string | null }>) {
    return this.request<KanbanCard>(`/cards/${cardId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  moveCard(cardId: string, toColumnKey: string) {
    return this.request<KanbanCard>(`/cards/${cardId}/move/`, {
      method: 'POST',
      body: JSON.stringify({ to_column_key: toColumnKey }),
    });
  }

  /* --- Commercial Cases --- */

  async getCommercialCaseByCard(cardId: string): Promise<CommercialCase | null> {
    const resp = await this.request<PaginatedResponse<CommercialCase> | CommercialCase[]>(
      `/commercial/cases/?card=${encodeURIComponent(cardId)}`,
    );
    const list = this.normalizeListResponse(resp);
    return list[0] || null;
  }

  createCommercialCase(data: Omit<CommercialCase, 'id' | 'created_at' | 'updated_at'>) {
    return this.request<CommercialCase>('/commercial/cases/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateCommercialCase(caseId: string, data: Partial<Omit<CommercialCase, 'id' | 'card' | 'created_at' | 'updated_at'>>) {
    return this.request<CommercialCase>(`/commercial/cases/${caseId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /* --- Attachments --- */

  async getCardAttachments(cardId: string) {
    const resp = await this.request<PaginatedResponse<KanbanAttachment> | KanbanAttachment[]>(
      `/cards/${cardId}/attachments/`,
    );
    return Array.isArray(resp) ? resp : (resp as PaginatedResponse<KanbanAttachment>).results || resp;
  }

  attachFileToCard(cardId: string, fileId: string, extra?: { kind?: string; title?: string }) {
    return this.request<KanbanAttachment>(`/cards/${cardId}/attach_file/`, {
      method: 'POST',
      body: JSON.stringify({ file_id: fileId, ...extra }),
    });
  }

  /* --- File Upload (S3) --- */

  initFileUpload(data: { sha256: string; size_bytes: number; mime_type: string; original_filename: string }) {
    return this.request<FileInitResponse>('/files/init/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  finalizeFileUpload(fileId: string) {
    return this.request<{ id: string; status: string }>('/files/finalize/', {
      method: 'POST',
      body: JSON.stringify({ file_id: fileId }),
    });
  }

  getFileDownloadUrl(fileId: string) {
    return this.request<{ download_url: string }>(`/files/${fileId}/download_url/`, {
      method: 'POST',
    });
  }

  /* --- Warehouse (V1) --- */

  async listStockLocations() {
    const resp = await this.request<PaginatedResponse<StockLocation> | StockLocation[]>('/stock-locations/');
    return this.normalizeListResponse(resp);
  }

  getBalances(locationId: string) {
    return this.request<{ results: StockBalanceRow[] }>(`/stock-moves/balances/?location_id=${encodeURIComponent(locationId)}`);
  }
}

export const kanbanApi = new KanbanApiClient();
