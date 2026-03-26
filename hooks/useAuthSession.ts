import { useCallback, useEffect, useState } from 'react';
import { getSession, login } from '../services/auth';

const getErrorMeta = (err: unknown) => {
  if (!err || typeof err !== 'object') {
    return { status: undefined, message: undefined };
  }
  const record = err as Record<string, unknown>;
  return {
    status: typeof record.status === 'number' ? record.status : undefined,
    message: typeof record.message === 'string' ? record.message : undefined
  };
};

export const useAuthSession = () => {
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      try {
        await getSession();
        if (active) {
          setAuthStatus('authenticated');
          setAuthError(null);
        }
      } catch {
        if (active) {
          setAuthStatus('unauthenticated');
        }
      }
    };
    void checkSession();
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = useCallback(async (password: string) => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      await login(password);
      setAuthStatus('authenticated');
    } catch (err: unknown) {
      const { status, message } = getErrorMeta(err);
      if (status === 401) {
        setAuthError('Incorrect password.');
      } else {
        setAuthError(message || 'Login failed.');
      }
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  const requireAuthentication = useCallback((message = 'Session expired. Please log in again.') => {
    setAuthStatus('unauthenticated');
    setAuthError(message);
  }, []);

  return {
    authStatus,
    authError,
    isAuthLoading,
    handleLogin,
    requireAuthentication
  };
};
