export const API = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

let csrf = '';
export function setCsrf(token: string) {
  csrf = token;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Credentialed calls to the admin API. Writes carry the CSRF token from the session. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const res = await fetch(`${API}/admin/v1${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string; details?: unknown };
  if (!res.ok) throw new ApiError(res.status, json.error ?? 'error', json.message ?? `Request failed (${res.status})`, json.details);
  return json as T;
}

export interface User {
  id: string;
  email: string;
  role: 'viewer' | 'editor' | 'publisher' | 'owner';
  totpEnabled: boolean;
  mustChangePassword: boolean;
}
export interface Me {
  user: User;
  csrfToken: string;
  totpVerified: boolean;
  require2fa: boolean;
}
export interface Report {
  from: string;
  to: string;
  containsDemoData: boolean;
  totals: Record<string, number>;
  days: { day: string; pageViews: number; uniqueEst: number }[];
  funnel: { stage: string; count: number }[];
  worlds: Record<string, number>;
  stations: { world: string; station: string; count: number }[];
  devices: Record<string, number>;
  profiles: Record<string, number>;
  sources: Record<string, number>;
  fps: Record<string, number>;
  perf: { deviceClass: string; metric: 'fcp' | 'hub'; samples: number; p50: number | null; p75: number | null }[];
  errorsPer1000: number;
  feedback: { haa: number; qayb: number; maya: number; total: number; comments: number };
  alerts: { level: 'warning' | 'info' | 'ok'; title: string; detail: string }[];
}
export const RANK = { viewer: 1, editor: 2, publisher: 3, owner: 4 } as const;
