type HeadersInitLike = HeadersInit;

const ERP_API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api/v1';

const deriveKanbanBaseUrl = () => {
  // ERP base: http(s)://host/api/v1  ->  http(s)://host/kanban-api/v1
  const trimmed = ERP_API_BASE_URL.replace(/\/+$/, '');
  const origin = trimmed.replace(/\/api\/v1$/, '');
  return `${origin}/kanban-api/v1`;
};

const KANBAN_API_BASE_URL = (import.meta as any).env?.VITE_KANBAN_API_URL || deriveKanbanBaseUrl();

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

  async listBoards() {
    const resp = await this.request<PaginatedResponse<KanbanBoard> | KanbanBoard[]>('/boards/');
    return this.normalizeListResponse(resp);
  }

  async getBoardByKey(key: string) {
    const resp = await this.request<PaginatedResponse<KanbanBoard> | KanbanBoard[]>(`/boards/?key=${encodeURIComponent(key)}`);
    const boards = this.normalizeListResponse(resp);
    return boards[0] || null;
  }

  async listColumns(boardId: string) {
    const resp = await this.request<PaginatedResponse<KanbanColumn> | KanbanColumn[]>(`/columns/?board_id=${encodeURIComponent(boardId)}`);
    return this.normalizeListResponse(resp);
  }

  async listCards(boardId: string, type?: string) {
    const typeParam = type ? `&type=${encodeURIComponent(type)}` : '';
    const resp = await this.request<PaginatedResponse<KanbanCard> | KanbanCard[]>(`/cards/?board_id=${encodeURIComponent(boardId)}${typeParam}`);
    return this.normalizeListResponse(resp);
  }

  moveCard(cardId: string, toColumnKey: string) {
    return this.request<KanbanCard>(`/cards/${cardId}/move/`, {
      method: 'POST',
      body: JSON.stringify({ to_column_key: toColumnKey }),
    });
  }

  // Warehouse (V1)
  async listStockLocations() {
    const resp = await this.request<PaginatedResponse<StockLocation> | StockLocation[]>('/stock-locations/');
    return this.normalizeListResponse(resp);
  }

  getBalances(locationId: string) {
    return this.request<{ results: StockBalanceRow[] }>(`/stock-moves/balances/?location_id=${encodeURIComponent(locationId)}`);
  }
}

export const kanbanApi = new KanbanApiClient();

