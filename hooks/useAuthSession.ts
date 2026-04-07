import { useCallback, useEffect, useState } from 'react';
import { AuthUser, getSession, logout, startLogin, verifyLogin } from '../services/auth';

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
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [pendingAuthEmail, setPendingAuthEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      try {
        const user = await getSession();
        if (active) {
          setAuthStatus('authenticated');
          setAuthUser(user);
          setAuthError(null);
        }
      } catch {
        if (active) {
          setAuthStatus('unauthenticated');
          setAuthUser(null);
        }
      }
    };
    void checkSession();
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = useCallback(async (email: string) => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const result = await startLogin(email);
      if (result.user) {
        setAuthUser(result.user);
        setPendingAuthEmail(null);
        setAuthStatus('authenticated');
      } else {
        setPendingAuthEmail(result.email || email);
      }
    } catch (err: unknown) {
      const { status, message } = getErrorMeta(err);
      if (status === 403) {
        setAuthError('That email is not on the beta invite list.');
      } else {
        setAuthError(message || 'Unable to send a sign-in code.');
      }
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  const handleVerifyCode = useCallback(async (email: string, code: string) => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const user = await verifyLogin(email, code);
      setAuthUser(user);
      setPendingAuthEmail(null);
      setAuthStatus('authenticated');
    } catch (err: unknown) {
      const { message } = getErrorMeta(err);
      setAuthError(message || 'Invalid or expired sign-in code.');
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      await logout();
    } finally {
      setAuthUser(null);
      setPendingAuthEmail(null);
      setAuthStatus('unauthenticated');
      setIsAuthLoading(false);
    }
  }, []);

  const requireAuthentication = useCallback((message = 'Session expired. Please log in again.') => {
    setAuthStatus('unauthenticated');
    setAuthUser(null);
    setAuthError(message);
  }, []);

  return {
    authStatus,
    authError,
    isAuthLoading,
    authUser,
    pendingAuthEmail,
    handleLogin,
    handleVerifyCode,
    handleLogout,
    requireAuthentication
  };
};
