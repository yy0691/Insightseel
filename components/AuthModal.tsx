import React, { useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { buildLinuxDoAuthUrl } from '../services/linuxDoAuthService';
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

  const handleLinuxDoSignIn = async () => {
    setError(null);
    setLoading(true);

    try {
      // 构建回调 URL
      const redirectUri = `${window.location.origin}/auth/linuxdo/callback`;
      
      // 构建授权 URL
      const authUrl = await buildLinuxDoAuthUrl(redirectUri);
      
      // 在当前窗口跳转到授权页面（OAuth 标准流程）
      window.location.href = authUrl;
      
      // 注意：这里不会执行到，因为页面会跳转
      // 如果跳转失败，下面的代码才会执行
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-md p-4">
      <div className="relative w-full max-w-xl overflow-hidden rounded-[32px] bg-white/95 backdrop-blur-xl shadow-[0_18px_80px_rgba(15,23,42,0.32)] border border-white/20 text-slate-900">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100/80 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="border-b border-slate-100 px-8 py-6">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            {mode === 'signin' && t('signIn')}
            {mode === 'signup' && t('createAccount')}
            {mode === 'reset' && t('resetPassword')}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{t(subtitleKey)}</p>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-8 py-6 space-y-4 custom-scrollbar">
          {error && (
            <div className="rounded-2xl border border-rose-200/60 bg-rose-50 px-4 py-3 text-xs text-rose-700">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">{t('fullName')}</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('fullNamePlaceholder')}
                  className="w-full rounded-2xl bg-slate-50 px-3 py-2.5 text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('email')}</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                className="w-full rounded-2xl bg-slate-50 px-3 py-2.5 text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
              />
            </div>

            {mode !== 'reset' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">{t('password')}</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('passwordPlaceholder')}
                  className="w-full rounded-2xl bg-slate-50 px-3 py-2.5 text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-slate-900 px-4 h-10 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? t('loading') : mode === 'signin' ? t('signIn') : mode === 'signup' ? t('signUp') : t('sendResetEmail')}
            </button>
          </form>

          {mode !== 'reset' && (
            <div className="space-y-3">
              <div className="relative flex items-center">
                <div className="h-px w-full bg-slate-200" />
                <span className="absolute bg-white px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                  {t('orContinueWith')}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => handleOAuthSignIn('google')}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 transition"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
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
                  className="flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 transition"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                  </svg>
                  GitHub
                </button>

                <button
                  type="button"
                  onClick={handleLinuxDoSignIn}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 transition"
                  title={t('linuxDoLogin')}
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                  </svg>
                  <span className="hidden sm:inline">{t('linuxDo')}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50/60 px-8 py-4 text-center text-xs text-slate-600">
          {mode === 'signin' && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-center">
              <button
                type="button"
                onClick={() => setMode('reset')}
                className="text-slate-600 transition hover:text-slate-900"
              >
                {t('forgotPassword')}
              </button>
              <span className="hidden sm:inline text-slate-300">•</span>
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="text-slate-600 transition hover:text-slate-900"
              >
                {t('createAccount')}
              </button>
            </div>
          )}
          {mode === 'signup' && (
            <button
              type="button"
              onClick={() => setMode('signin')}
              className="text-slate-600 transition hover:text-slate-900"
            >
              {t('alreadyHaveAccount')} {t('signIn')}
            </button>
          )}
          {mode === 'reset' && (
            <button
              type="button"
              onClick={() => setMode('signin')}
              className="text-slate-600 transition hover:text-slate-900"
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
