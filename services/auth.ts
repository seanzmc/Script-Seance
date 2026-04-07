type ApiError = {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
};

type ApiResponse<T> =
  | { data: T; error?: never }
  | { data?: never; error: ApiError };

export type AuthUser = {
  id: string;
  email: string;
  status: 'invited' | 'active' | 'disabled';
};

const requestAuth = async <T>(path: string, options: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    credentials: 'include',
    ...options
  });

  const text = await response.text();
  if (!text) {
    throw new Error('Empty response from server');
  }

  let payload: ApiResponse<T>;
  try {
    payload = JSON.parse(text) as ApiResponse<T>;
  } catch {
    throw new Error('Invalid JSON response from server');
  }

  if (!response.ok || payload.error) {
    const apiError = payload.error;
    const message = apiError?.message || 'Auth request failed';
    const error = new Error(message) as Error & { code?: string; status?: number };
    if (apiError?.code) {
      error.code = apiError.code;
    }
    error.status = response.status;
    throw error;
  }

  return payload.data as T;
};

export const startLogin = async (email: string): Promise<{ email?: string; user?: AuthUser }> => {
  return requestAuth<{ ok: true; email?: string; user?: AuthUser }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
};

export const verifyLogin = async (email: string, code: string): Promise<AuthUser> => {
  const result = await requestAuth<{ ok: true; user: AuthUser }>('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code })
  });
  return result.user;
};

export const getSession = async (): Promise<AuthUser | null> => {
  const result = await requestAuth<{ ok: true; user?: AuthUser }>('/api/auth/session', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  return result.user ?? null;
};

export const logout = async (): Promise<void> => {
  await requestAuth<{ ok: true }>('/api/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
};
