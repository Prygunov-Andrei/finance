// API проксируется через hvac-info.com/api/public/v1/ → 72.56.111.111:8000
const API_BASE = import.meta.env.VITE_API_URL || '/api/public/v1';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const resp = await fetch(`${API_BASE}${endpoint}`, { ...options, headers: { ...headers, ...options.headers as Record<string, string> } });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.detail || `Ошибка ${resp.status}`);
  }

  if (resp.status === 204) return {} as T;
  if (resp.status === 302) {
    const location = resp.headers.get('Location');
    if (location) window.location.href = location;
    return {} as T;
  }

  return resp.json();
}

export const api = {
  sendOTP: (email: string) =>
    request<{ detail: string }>('/verify-email/', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  confirmOTP: (email: string, code: string) =>
    request<{ verification_token: string }>('/verify-email/confirm/', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    }),

  createEstimateRequest: (data: FormData) =>
    request<{ access_token: string; status_url: string }>('/estimate-requests/', {
      method: 'POST',
      body: data,
    }),

  getRequestStatus: (token: string) =>
    request<RequestStatus>(`/estimate-requests/${token}/status/`),

  getRequestDetail: (token: string) =>
    request<RequestDetail>(`/estimate-requests/${token}/`),

  downloadEstimate: (token: string) => {
    // Redirect — браузер сам перейдёт по Location
    window.location.href = `${API_BASE}/estimate-requests/${token}/download/`;
  },

  submitCallback: (token: string, data: { phone: string; preferred_time?: string; comment?: string }) =>
    request<{ detail: string }>(`/estimate-requests/${token}/callback/`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export interface RequestStatus {
  status: string;
  progress_percent: number;
  total_files: number;
  processed_files: number;
  total_spec_items: number;
  matched_exact: number;
  matched_analog: number;
  unmatched: number;
  error_message: string;
  project_name: string;
  created_at: string;
  expires_at: string;
}

export interface RequestDetail extends RequestStatus {
  access_token: string;
  email: string;
  company_name: string;
  contact_name: string;
  phone: string;
  files: Array<{
    id: number;
    original_filename: string;
    file_type: string;
    parse_status: string;
    file_size: number;
  }>;
}
