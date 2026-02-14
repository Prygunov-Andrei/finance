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

  listBoards() {
    return this.request<KanbanBoard[]>('/boards/');
  }

  async getBoardByKey(key: string) {
    const boards = await this.request<KanbanBoard[]>(`/boards/?key=${encodeURIComponent(key)}`);
    return boards[0] || null;
  }

  listColumns(boardId: string) {
    return this.request<KanbanColumn[]>(`/columns/?board_id=${encodeURIComponent(boardId)}`);
  }

  listCards(boardId: string, type?: string) {
    const typeParam = type ? `&type=${encodeURIComponent(type)}` : '';
    return this.request<KanbanCard[]>(`/cards/?board_id=${encodeURIComponent(boardId)}${typeParam}`);
  }

  moveCard(cardId: string, toColumnKey: string) {
    return this.request<KanbanCard>(`/cards/${cardId}/move/`, {
      method: 'POST',
      body: JSON.stringify({ to_column_key: toColumnKey }),
    });
  }

  // Warehouse (V1)
  listStockLocations() {
    return this.request<StockLocation[]>('/stock-locations/');
  }

  getBalances(locationId: string) {
    return this.request<{ results: StockBalanceRow[] }>(`/stock-moves/balances/?location_id=${encodeURIComponent(locationId)}`);
  }
}

export const kanbanApi = new KanbanApiClient();

