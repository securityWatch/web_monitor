const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/** Browser: same-origin via Nginx (/api). SSR: INTERNAL_API_URL or NEXT_PUBLIC_API_URL. */
export function getApiUrl(): string {
  if (typeof window !== 'undefined') {
    return '';
  }
  return process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  planTier: string;
  monitorQuota: number;
  seatQuota?: number;
  foundingMember?: boolean;
  role?: string;
}

export interface AuthData {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    displayName?: string;
    locale?: string;
    emailVerifiedAt?: string | null;
    notifyIncidents?: boolean;
    notifyDaily?: boolean;
    notifyWeekly?: boolean;
    notifyProduct?: boolean;
    notifySsl?: boolean;
  };
  organization: Organization;
  requiresTotp?: boolean;
  tempToken?: string;
}

export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export function getStoredAuth(): AuthData | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('pulsewatch_auth');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredAuth(data: AuthData) {
  localStorage.setItem('pulsewatch_auth', JSON.stringify(data));
}

export function clearStoredAuth() {
  localStorage.removeItem('pulsewatch_auth');
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const auth = getStoredAuth();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (auth?.accessToken) {
    headers['Authorization'] = `Bearer ${auth.accessToken}`;
  }

  const base = getApiUrl();
  const res = await fetch(`${base}${path}`, { ...options, headers });

  if (res.status === 401 && retry && auth?.refreshToken) {
    const refreshed = await fetch(`${base}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    });
    if (refreshed.ok) {
      const data = await refreshed.json();
      setStoredAuth(data);
      return apiFetch<T>(path, options, false);
    }
    clearStoredAuth();
    throw new ApiError('UNAUTHORIZED', 'UNAUTHORIZED');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(err.error || err.message || `HTTP ${res.status}`, err.code);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text);
}

export { API_URL };
