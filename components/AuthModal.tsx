import React, { useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { useLanguage } from '../contexts/LanguageContext';
import type { Translations } from '../i18n/locales/en';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialMode?: AuthMode;
}

type AuthMode = 'signin' | 'signup' | 'reset';

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess, initialMode = 'signin' }) => {
  const { t } = useLanguage();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
    }
  }, [initialMode, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === 'signin') {
        await authService.signInWithEmail(email, password);
        setMessage(t('signedInSuccessfully'));
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1000);
      } else if (mode === 'signup') {
        await authService.signUpWithEmail(email, password, fullName);
        setMessage(t('accountCreatedCheckEmail'));
        setTimeout(() => {
          setMode('signin');
          setMessage(null);
        }, 3000);
      } else if (mode === 'reset') {
        await authService.resetPassword(email);
        setMessage(t('passwordResetEmailSent'));
        setTimeout(() => {
          setMode('signin');
          setMessage(null);
        }, 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('anErrorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: 'google' | 'github') => {
    setError(null);
    setLoading(true);

    try {
      if (provider === 'google') {
        await authService.signInWithGoogle();
      } else {
        await authService.signInWithGithub();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('anErrorOccurred'));
      setLoading(false);
    }
  };

  const subtitleKey: keyof Translations =
    mode === 'signin'
      ? 'authSubtitleSignIn'
      : mode === 'signup'
        ? 'authSubtitleSignUp'
        : 'authSubtitleReset';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/30 bg-gradient-to-br from-slate-50 to-slate-200 text-slate-800 shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-slate-300/60 bg-white/70 text-slate-500 transition hover:bg-white hover:text-slate-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="border-b border-slate-300/50 bg-white/60 px-6 py-5">
          <h2 className="text-xl font-semibold text-slate-900">
            {mode === 'signin' && t('signIn')}
            {mode === 'signup' && t('createAccount')}
            {mode === 'reset' && t('resetPassword')}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{t(subtitleKey)}</p>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-6 space-y-5 custom-scrollbar">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">{t('fullName')}</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('fullNamePlaceholder')}
                  className="w-full rounded-xl border border-slate-300/70 bg-white/70 px-4 py-2.5 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">{t('email')}</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                className="w-full rounded-xl border border-slate-300/70 bg-white/70 px-4 py-2.5 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>

            {mode !== 'reset' && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">{t('password')}</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('passwordPlaceholder')}
                  className="w-full rounded-xl border border-slate-300/70 bg-white/70 px-4 py-2.5 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-50 shadow-sm transition hover:bg-slate-900/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? t('loading') : mode === 'signin' ? t('signIn') : mode === 'signup' ? t('signUp') : t('sendResetEmail')}
            </button>
          </form>

          {mode !== 'reset' && (
            <div className="space-y-3">
              <div className="relative flex items-center justify-center">
                <div className="h-px w-full bg-slate-300/60" />
                <span className="absolute bg-white/80 px-3 text-xs font-medium uppercase tracking-[0.3em] text-slate-500">
                  {t('orContinueWith')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleOAuthSignIn('google')}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-300/80 bg-white/80 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Google
                </button>

                <button
                  type="button"
                  onClick={() => handleOAuthSignIn('github')}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-300/80 bg-white/80 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                  </svg>
                  GitHub
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-300/40 bg-white/60 px-6 py-4 text-center text-sm text-slate-600">
          {mode === 'signin' && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-center">
              <button
                type="button"
                onClick={() => setMode('reset')}
                className="text-emerald-600 transition hover:text-emerald-700"
              >
                {t('forgotPassword')}
              </button>
              <span className="hidden sm:inline text-slate-400">•</span>
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="text-emerald-600 transition hover:text-emerald-700"
              >
                {t('createAccount')}
              </button>
            </div>
          )}
          {mode === 'signup' && (
            <button
              type="button"
              onClick={() => setMode('signin')}
              className="text-emerald-600 transition hover:text-emerald-700"
            >
              {t('alreadyHaveAccount')} {t('signIn')}
            </button>
          )}
          {mode === 'reset' && (
            <button
              type="button"
              onClick={() => setMode('signin')}
              className="text-emerald-600 transition hover:text-emerald-700"
            >
              {t('backToSignIn')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
