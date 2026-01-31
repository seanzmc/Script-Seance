import React, { useEffect, useState } from 'react';
import { Lock, AlertCircle } from 'lucide-react';
import { Button } from './Button';

export interface LoginModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  error?: string | null;
  onLogin: (password: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  isLoading,
  error,
  onLogin
}) => {
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPassword('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!password.trim()) return;
    onLogin(password);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-indigo-500/10 flex items-center justify-center">
            <Lock className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Admin Login</h2>
            <p className="text-xs text-gray-400">Enter the password to unlock AI features.</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/60 bg-red-900/30 text-red-200 px-3 py-2 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-widest text-gray-500">Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
              placeholder="password"
              autoFocus
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            loading={isLoading}
            disabled={isLoading || !password.trim()}
          >
            Unlock AI
          </Button>
        </form>
      </div>
    </div>
  );
};
