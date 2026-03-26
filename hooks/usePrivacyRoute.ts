import { useCallback, useEffect, useRef, useState } from 'react';

export const usePrivacyRoute = () => {
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const lastNonPrivacyPathRef = useRef('/');

  const openPrivacy = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname !== '/privacy') {
      lastNonPrivacyPathRef.current = window.location.pathname || '/';
      window.history.pushState({}, '', '/privacy');
    }
    setIsPrivacyOpen(true);
  }, []);

  const closePrivacy = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname === '/privacy') {
      const targetPath = lastNonPrivacyPathRef.current || '/';
      window.history.pushState({}, '', targetPath);
    }
    setIsPrivacyOpen(false);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentPath = window.location.pathname;
    lastNonPrivacyPathRef.current = currentPath === '/privacy' ? '/' : currentPath;
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path !== '/privacy') {
        lastNonPrivacyPathRef.current = path || '/';
      }
      setIsPrivacyOpen(path === '/privacy');
    };
    setIsPrivacyOpen(currentPath === '/privacy');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return {
    isPrivacyOpen,
    openPrivacy,
    closePrivacy
  };
};
