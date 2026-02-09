const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

let accessToken: string | null = null;

export const setAccessToken = (token: string) => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;

const request = async <T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || error.error || 'API Error');
  }

  return response.json();
};

// =============================================================================
// Auth
// =============================================================================

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  worker: Worker;
  is_contractor: boolean;
}

/**
 * Декодирует payload JWT-токена (без проверки подписи).
 * Используется для чтения claims на клиенте.
 */
export const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

export interface Worker {
  id: string;
  telegram_id: number;
  name: string;
  phone: string;
  photo_url: string;
  role: 'worker' | 'brigadier';
  language: string;
  contractor: number;
  contractor_name: string;
  bot_started: boolean;
}

export const authenticateWithTelegram = (initData: string): Promise<AuthResponse> =>
  request('/worklog/auth/telegram/', {
    method: 'POST',
    body: JSON.stringify({ init_data: initData }),
  });

// =============================================================================
// Shifts
// =============================================================================

export interface Shift {
  id: string;
  object: number;
  object_name: string;
  contractor: number;
  contractor_name: string;
  date: string;
  shift_type: string;
  start_time: string;
  end_time: string;
  qr_code: string;
  qr_token: string;
  status: 'scheduled' | 'active' | 'closed';
  registrations_count: number;
  teams_count: number;
}

export const getShifts = (params?: Record<string, string>): Promise<{ results: Shift[] }> => {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return request(`/worklog/shifts/${query}`);
};

export const getShift = (id: string): Promise<Shift> =>
  request(`/worklog/shifts/${id}/`);

export const createShift = (data: Partial<Shift>): Promise<Shift> =>
  request('/worklog/shifts/', { method: 'POST', body: JSON.stringify(data) });

export const registerForShift = async (shiftId: string, data: { qr_token: string; latitude: number; longitude: number }): Promise<{ geo_valid?: boolean; warning?: string }> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const response = await fetch(`${API_BASE}/worklog/shifts/${shiftId}/register/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });

  const body = await response.json().catch(() => ({ detail: response.statusText }));

  if (!response.ok) {
    throw new Error(body.error || body.detail || 'Ошибка регистрации');
  }

  return body;
};

// =============================================================================
// Teams
// =============================================================================

export interface TeamMember {
  id: string;
  worker: string;
  worker_name: string;
  worker_role: string;
  worker_photo: string;
  joined_at: string;
  left_at: string | null;
}

export interface Team {
  id: string;
  object_name: string;
  shift: string;
  topic_id: number | null;
  topic_name: string;
  brigadier: string | null;
  brigadier_name: string | null;
  status: 'active' | 'closed';
  is_solo: boolean;
  memberships: TeamMember[];
  media_count: number;
}

export const getTeams = (params?: Record<string, string>): Promise<{ results: Team[] }> => {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return request(`/worklog/teams/${query}`);
};

export const getTeam = (id: string): Promise<Team> =>
  request(`/worklog/teams/${id}/`);

export const createTeam = (data: { shift_id: string; member_ids: string[]; brigadier_id: string }): Promise<Team> =>
  request('/worklog/teams/', { method: 'POST', body: JSON.stringify(data) });

// =============================================================================
// Media
// =============================================================================

export interface MediaItem {
  id: string;
  team: string | null;
  team_name: string | null;
  author: string;
  author_name: string;
  media_type: string;
  tag: string;
  file_url: string;
  thumbnail_url: string;
  text_content: string;
  status: string;
  created_at: string;
}

export const getMedia = (params?: Record<string, string>): Promise<{ results: MediaItem[] }> => {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return request(`/worklog/media/${query}`);
};

// =============================================================================
// Reports
// =============================================================================

export interface Report {
  id: string;
  team: string;
  team_name: string | null;
  shift: string;
  report_number: number;
  report_type: 'intermediate' | 'final' | 'supplement';
  trigger: string;
  media_count: number;
  status: string;
  created_at: string;
}

export const getReports = (params?: Record<string, string>): Promise<{ results: Report[] }> => {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return request(`/worklog/reports/${query}`);
};

export const getReport = (id: string): Promise<Report> =>
  request(`/worklog/reports/${id}/`);

export const createReport = (data: {
  team_id: string;
  report_type: 'intermediate' | 'final' | 'supplement';
  media_ids?: string[];
  text?: string;
}): Promise<Report> =>
  request('/worklog/reports/', { method: 'POST', body: JSON.stringify(data) });

export const supplementReport = (reportId: string, data: {
  text?: string;
  media_ids?: string[];
}): Promise<Report> =>
  request(`/worklog/reports/${reportId}/supplement/`, { method: 'POST', body: JSON.stringify(data) });

// =============================================================================
// Questions
// =============================================================================

export interface Question {
  id: string;
  report: string;
  author: string;
  author_name: string;
  text: string;
  status: 'pending' | 'answered';
  created_at: string;
  answers: Answer[];
}

export interface Answer {
  id: string;
  question: string;
  author: string;
  author_name: string;
  text: string;
  created_at: string;
}

export const getQuestions = (params?: Record<string, string>): Promise<{ results: Question[] }> => {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return request(`/worklog/questions/${query}`);
};

export const createQuestion = (data: { report_id: string; text: string }): Promise<Question> =>
  request('/worklog/questions/', { method: 'POST', body: JSON.stringify(data) });

export const answerQuestion = (questionId: string, data: { text: string }): Promise<Answer> =>
  request(`/worklog/questions/${questionId}/answer/`, { method: 'POST', body: JSON.stringify(data) });

// =============================================================================
// Team management
// =============================================================================

export const addTeamMember = (teamId: string, data: { worker_id: string }): Promise<TeamMember> =>
  request(`/worklog/teams/${teamId}/add_member/`, { method: 'POST', body: JSON.stringify(data) });

export const removeTeamMember = (teamId: string, membershipId: string): Promise<void> =>
  request(`/worklog/teams/${teamId}/remove_member/`, { method: 'POST', body: JSON.stringify({ membership_id: membershipId }) });

// =============================================================================
// Workers
// =============================================================================

export const getWorkers = (params?: Record<string, string>): Promise<{ results: Worker[] }> => {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return request(`/worklog/workers/${query}`);
};

export const createWorker = (data: Partial<Worker>): Promise<Worker> =>
  request('/worklog/workers/', { method: 'POST', body: JSON.stringify(data) });

// =============================================================================
// Shift Registrations
// =============================================================================

export const getShiftRegistrations = (shiftId: string) =>
  request(`/worklog/shifts/${shiftId}/registrations/`);
