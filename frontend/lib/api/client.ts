import {
  createAuthService,
  createCoreService,
  createContractsService,
  createPaymentsService,
  createEstimatesService,
  createProposalsService,
  createPricelistsService,
  createCatalogService,
  createWorklogService,
  createPersonnelService,
  createBankingService,
  createSupplyService,
  createKanbanService,
  createSectionFeedbackService,
  createMarketingService,
} from './services';

const API_BASE_URL = '/api/erp';

export class ApiClient {
  private baseUrl = API_BASE_URL;
  private isRefreshing = false;
  private refreshSubscribers: Array<(token: string) => void> = [];

  // ── Domain services ──────────────────────────────────────────────
  readonly auth: ReturnType<typeof createAuthService>;
  readonly core: ReturnType<typeof createCoreService>;
  readonly contracts: ReturnType<typeof createContractsService>;
  readonly payments: ReturnType<typeof createPaymentsService>;
  readonly estimates: ReturnType<typeof createEstimatesService>;
  readonly proposals: ReturnType<typeof createProposalsService>;
  readonly pricelists: ReturnType<typeof createPricelistsService>;
  readonly catalog: ReturnType<typeof createCatalogService>;
  readonly worklog: ReturnType<typeof createWorklogService>;
  readonly personnel: ReturnType<typeof createPersonnelService>;
  readonly banking: ReturnType<typeof createBankingService>;
  readonly supply: ReturnType<typeof createSupplyService>;
  readonly kanban: ReturnType<typeof createKanbanService>;
  readonly sectionFeedback: ReturnType<typeof createSectionFeedbackService>;
  readonly marketing: ReturnType<typeof createMarketingService>;

  constructor() {
    const boundRequest = this.request.bind(this);
    this.auth = createAuthService(boundRequest);
    this.core = createCoreService(boundRequest);
    this.contracts = createContractsService(boundRequest);
    this.payments = createPaymentsService(boundRequest);
    this.estimates = createEstimatesService(boundRequest);
    this.proposals = createProposalsService(boundRequest);
    this.pricelists = createPricelistsService(boundRequest);
    this.catalog = createCatalogService(boundRequest);
    this.worklog = createWorklogService(boundRequest);
    this.personnel = createPersonnelService(boundRequest);
    this.banking = createBankingService(boundRequest);
    this.supply = createSupplyService(boundRequest);
    this.kanban = createKanbanService(boundRequest);
    this.sectionFeedback = createSectionFeedbackService(boundRequest);
    this.marketing = createMarketingService(boundRequest);
  }

  // ── Auth & Transport ─────────────────────────────────────────────

  private getAuthHeader(): HeadersInit {
    const token = localStorage.getItem('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private subscribeTokenRefresh(cb: (token: string) => void) {
    this.refreshSubscribers.push(cb);
  }

  private onTokenRefreshed(token: string) {
    this.refreshSubscribers.forEach(cb => cb(token));
    this.refreshSubscribers = [];
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    const headers: Record<string, string> = {
      ...(this.getAuthHeader() as Record<string, string>),
      ...(options.headers as Record<string, string>),
    };

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;

    try {
      response = await fetch(url, {
        ...options,
        headers,
      });
    } catch (networkError) {
      throw new Error(`Сетевая ошибка: ${networkError instanceof Error ? networkError.message : 'Неизвестная ошибка'}. Проверьте подключение к серверу ${API_BASE_URL}`);
    }

    if (response.status === 401) {
      if (this.isRefreshing) {
        return new Promise((resolve, reject) => {
          this.subscribeTokenRefresh((token: string) => {
            this.request<T>(endpoint, options).then(resolve).catch(reject);
          });
        });
      }

      this.isRefreshing = true;

      const refreshed = await this.refreshToken();

      this.isRefreshing = false;

      if (refreshed) {
        const newToken = localStorage.getItem('access_token') || '';
        this.onTokenRefreshed(newToken);
        return this.request(endpoint, options);
      } else {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        throw new Error('Unauthorized');
      }
    }

    if (!response.ok) {
      let error;

      try {
        const text = await response.text();

        if (text) {
          try {
            error = JSON.parse(text);
          } catch (e) {
            error = { detail: text || 'Unknown error' };
          }
        } else {
          error = { detail: `HTTP ${response.status}: ${response.statusText}` };
        }
      } catch (e) {
        error = { detail: `HTTP ${response.status}: ${response.statusText}` };
      }

      let errorMessage = '';
      if (typeof error === 'object' && error !== null) {
        const errors = Object.entries(error).map(([field, messages]) => {
          const msgArray = Array.isArray(messages) ? messages : [messages];
          return `${field}: ${msgArray.join(', ')}`;
        });
        errorMessage = errors.join('; ');
      } else if (error.detail) {
        errorMessage = error.detail;
      } else if (error.message) {
        errorMessage = error.message;
      } else {
        errorMessage = 'API Error';
      }

      throw new Error(errorMessage);
    }

    if (response.status === 204 || options.method === 'DELETE') {
      return undefined as T;
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      return data;
    }

    return undefined as T;
  }

  // ── Internal: token refresh (called by request() on 401) ────────

  private async refreshToken(): Promise<boolean> {
    return this.auth.refreshToken();
  }
}
