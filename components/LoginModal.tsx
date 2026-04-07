import React, { useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { Lock, AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { modalVariants, overlayVariants } from './motion/primitives';

export interface LoginModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  error?: string | null;
  pendingEmail?: string | null;
  onLogin: (email: string) => void;
  onVerifyCode: (email: string, code: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  isLoading,
  error,
  pendingEmail,
  onLogin,
  onVerifyCode
}) => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setCode('');
    }
  }, [isOpen]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pendingEmail) {
      if (!code.trim()) return;
      onVerifyCode(pendingEmail, code);
      return;
    }
    if (!email.trim()) return;
    onLogin(email);
  };

  const isCodeStep = Boolean(pendingEmail);

  return (
    <AnimatePresence initial={false}>
      {isOpen ? (
        <div className="fixed inset-0 z-app-modal flex items-center justify-center p-4">
          <m.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={overlayVariants}
          />
          <m.div
            className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Sign in"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={modalVariants}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-indigo-500/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Sign In</h2>
                <p className="text-xs text-gray-400">
                  {isCodeStep ? `Enter the code sent to ${pendingEmail}.` : 'Enter your beta invite email.'}
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-500/60 bg-red-900/30 text-red-200 px-3 py-2 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {isCodeStep ? (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-gray-500">Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                    autoFocus
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-gray-500">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                    autoFocus
                  />
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                loading={isLoading}
                disabled={isLoading || (isCodeStep ? !code.trim() : !email.trim())}
              >
                {isCodeStep ? 'Verify Code' : 'Send Code'}
              </Button>
            </form>
          </m.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};
