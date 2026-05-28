const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface AuthData {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; displayName?: string; locale?: string };
  organization: { id: string; name: string; slug: string; planTier: string; monitorQuota: number };
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

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401 && retry && auth?.refreshToken) {
    const refreshed = await fetch(`${API_URL}/api/v1/auth/refresh`, {
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
    throw new Error('UNAUTHORIZED');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export { API_URL };
