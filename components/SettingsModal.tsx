import React, { useState, useEffect } from 'react';
import { APISettings } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { testConnection } from '../services/geminiService';
import { BaseModal } from './ui/BaseModal';
import { toast } from '../hooks/useToastStore';

interface SettingsModalProps {
  settings: APISettings;
  onSave: (settings: APISettings) => void;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onSave, onClose }) => {
  const [currentSettings, setCurrentSettings] = useState<APISettings>(settings);
  const [testLoading, setTestLoading] = useState(false);
  const { t } = useLanguage();

  // Check for build-time environment variables to determine UI behavior
  const systemModel = import.meta.env.VITE_MODEL;
  const systemBaseUrl = import.meta.env.VITE_BASE_URL;
  const proxyAvailable = import.meta.env.VITE_USE_PROXY === 'true';
  const systemDeepgramKey = import.meta.env.VITE_DEEPGRAM_API_KEY;

  // Determine if the currently displayed settings are from the system fallback
  const isModelSystemInUse = !!systemModel && currentSettings.model === systemModel;
  const isBaseUrlSystemInUse = !!systemBaseUrl && currentSettings.baseUrl === systemBaseUrl;
  const isUsingProxy = !currentSettings.apiKey && proxyAvailable;

  useEffect(() => {
    // We receive the "effective" settings. We don't want to show system values in the input fields.
    const displaySettings = { ...settings };
    if (!!systemModel && settings.model === systemModel) {
      displaySettings.model = '';
    }
    if (!!systemBaseUrl && settings.baseUrl === systemBaseUrl) {
      displaySettings.baseUrl = '';
    }
    // Security: Never display system environment variable values in the UI
    if (!!systemDeepgramKey) {
      // If user's key matches system key, clear it to prevent exposing the system key
      // This prevents users from accidentally saving and displaying the system key
      if (settings.deepgramApiKey === systemDeepgramKey) {
        displaySettings.deepgramApiKey = '';
      }
    }

    setCurrentSettings(displaySettings);
  }, [settings, systemBaseUrl, systemModel, systemDeepgramKey]);

  const handleSettingChange = (update: Partial<APISettings>) => {
    setCurrentSettings(prev => ({ ...prev, ...update }));
  };

  const handleSave = () => {
    // When saving, if a field is empty but a system default exists,
    // we save it as an empty string to ensure the user's choice to override is respected.
    onSave(currentSettings);
  };
  
  const handleTest = async () => {
    setTestLoading(true);
    // For testing, we must use the effective settings
    const settingsToTest: APISettings = {
        ...currentSettings,
        model: currentSettings.model || systemModel || 'gemini-2.5-flash',
        baseUrl: currentSettings.baseUrl || systemBaseUrl,
        apiKey: currentSettings.apiKey,
        useProxy: !currentSettings.apiKey && proxyAvailable,
    }
    try {
      const result = await testConnection(settingsToTest);
      if (result.success) {
        toast.success({ title: t('testSuccess') });
      } else {
        toast.error({ 
          title: t('testFailure'), 
          description: t('testFailureDetails', result.message) 
        });
      }
    } catch (error) {
      toast.error({ 
        title: t('testFailure'), 
        description: error instanceof Error ? error.message : t('anErrorOccurred')
      });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <BaseModal open={true} onOpenChange={onClose} size="lg">
      <BaseModal.Header 
        title={t('settingsTitle')} 
        subtitle={t('settingsDescription')} 
      />
      <BaseModal.Body className="max-h-[70vh] overflow-y-auto custom-scrollbar space-y-6">
          {/* General */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">General</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="language-select" className="block text-xs font-medium text-slate-600 mb-1.5">
                  {t('language')}
                </label>
                <select
                  id="language-select"
                  value={currentSettings.language}
                  onChange={(e) => handleSettingChange({ language: e.target.value as 'en' | 'zh' })}
                  className="w-full rounded-2xl bg-slate-50 px-3 py-2.5 text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                >
                  <option value="en">English</option>
                  <option value="zh">中文</option>
                </select>
              </div>

              <div>
                <label htmlFor="provider-select" className="block text-xs font-medium text-slate-600 mb-1.5">
                  API Provider
                </label>
                <select
                  id="provider-select"
                  value={currentSettings.provider || 'gemini'}
                  onChange={(e) => handleSettingChange({ provider: e.target.value as any })}
                  className="w-full rounded-2xl bg-slate-50 px-3 py-2.5 text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="poe">Poe API</option>
                  <option value="custom">Custom API</option>
                </select>
              </div>
            </div>
            {currentSettings.provider === 'poe' && !currentSettings.useProxy && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/60">
                <p className="text-xs text-amber-700">
                  ⚠️ Poe API requires proxy mode. Please enable "Use Proxy" below.
                </p>
              </div>
            )}
            <div>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentSettings.useProxy || false}
                  onChange={(e) => handleSettingChange({ useProxy: e.target.checked })}
                  className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-900/20"
                />
                <span className="text-xs font-medium text-slate-700">Use Proxy Mode</span>
              </label>
              <p className="text-xs text-slate-500 mt-1">
                Enable for APIs requiring CORS proxy or server-side API keys
              </p>
            </div>
          </section>

          {/* Model & API */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Model & API</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="model-name" className="block text-xs font-medium text-slate-600 mb-1.5">
                  {t('modelName')}
                </label>
                <input
                  type="text"
                  id="model-name"
                  value={currentSettings.model || ''}
                  onChange={(e) => handleSettingChange({ model: e.target.value })}
                  placeholder={systemModel ? t('modelPlaceholderSystem', systemModel) : t('modelNamePlaceholder')}
                  className="w-full rounded-2xl bg-slate-50 px-3 py-2.5 text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                />
              </div>
              
              <div>
                <label htmlFor="base-url" className="block text-xs font-medium text-slate-600 mb-1.5">
                  {t('baseUrl')}
                </label>
                <input
                  type="text"
                  id="base-url"
                  value={currentSettings.baseUrl || ''}
                  onChange={(e) => handleSettingChange({ baseUrl: e.target.value.trim() })}
                  placeholder={systemBaseUrl ? t('baseUrlPlaceholderSystem') : t('baseUrlPlaceholder')}
                  className="w-full rounded-2xl bg-slate-50 px-3 py-2.5 text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                />
                <p className="text-xs text-slate-500 mt-1">{t('baseUrlHelpText')}</p>
              </div>

              <div>
                <label htmlFor="api-key" className="block text-xs font-medium text-slate-600 mb-1.5">
                  {t('apiKey')}
                </label>
                <input
                  type="password"
                  id="api-key"
                  value={currentSettings.apiKey || ''}
                  onChange={(e) => handleSettingChange({ apiKey: e.target.value })}
                  placeholder={proxyAvailable ? t('apiKeyPlaceholderSystem') : t('apiKeyPlaceholder')}
                  className="w-full rounded-2xl bg-slate-50 px-3 py-2.5 text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                />
                <p className="text-xs text-slate-500 mt-1">{t('apiKeyHelpText')}</p>
              </div>
            </div>
          </section>

          {/* Speech-to-Text */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('speechToText')}</h3>
              <div className="rounded-2xl bg-slate-50 p-4 space-y-2">
                <label htmlFor="deepgram-api-key" className="block text-xs font-medium text-slate-700">
                  {t('deepgramApiKey')}
                </label>
                <input
                  type="password"
                  id="deepgram-api-key"
                  value={currentSettings.deepgramApiKey || ''}
                  onChange={(e) => handleSettingChange({ deepgramApiKey: e.target.value })}
                  placeholder="..."
                  className="w-full rounded-xl bg-white px-3 py-2 text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                />
                <p className="text-xs text-slate-500">
                  {t('deepgramApiKeyDescription')} <a href="https://console.deepgram.com" target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:underline">{t('deepgramGetKey')}</a>
                </p>
              </div>

              {/* <div className="rounded-2xl bg-slate-50 p-4 space-y-2">
                <label htmlFor="openai-api-key" className="block text-xs font-medium text-slate-700">
                  {t('openaiApiKey')}
                </label>
                <input
                  type="password"
                  id="openai-api-key"
                  value={currentSettings.openaiApiKey || ''}
                  onChange={(e) => handleSettingChange({ openaiApiKey: e.target.value })}
                  placeholder="sk-..."
                  className="w-full rounded-xl bg-white px-3 py-2 text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                />
                <p className="text-xs text-slate-500">
                  {t('openaiApiKeyDescription')}
                </p>
              </div> */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/60">
              <p className="text-xs text-slate-600">
                <strong className="font-medium">{t('smartRouting')}</strong> {t('smartRoutingDescription')}
              </p>
            </div>
          </section>

          {/* Environment Status (only show in development mode) */}
          {import.meta.env.DEV && (
            <section className="space-y-2">
              <div className={`p-3 rounded-2xl ${proxyAvailable ? 'bg-emerald-50 border border-emerald-200/60' : 'bg-amber-50 border border-amber-200/60'}`}>
                <div className="flex items-start space-x-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 flex-shrink-0 mt-0.5 ${proxyAvailable ? 'text-emerald-600' : 'text-amber-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <p className={`text-xs font-semibold ${proxyAvailable ? 'text-emerald-800' : 'text-amber-800'}`}>
                      {proxyAvailable ? (isUsingProxy ? t('usingProxyMode') : t('proxyAvailable')) : t('proxyNotAvailable')}
                    </p>
                    <p className={`text-[11px] mt-0.5 ${proxyAvailable ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {proxyAvailable 
                        ? (isUsingProxy 
                            ? t('proxyModeExplanation')
                            : t('ownKeyExplanation'))
                        : t('configureOwnKey')}
                    </p>
                    <details className="mt-2">
                      <summary className={`text-[11px] cursor-pointer ${proxyAvailable ? 'text-emerald-600' : 'text-amber-600'} hover:underline`}>
                        {t('showDebugInfo')}
                      </summary>
                      <div className="mt-2 p-2 bg-white/80 rounded-lg text-[11px] font-mono space-y-1">
                        <div>VITE_USE_PROXY: <span className="font-bold">{import.meta.env.VITE_USE_PROXY || 'undefined'}</span></div>
                        <div>VITE_MODEL: {import.meta.env.VITE_MODEL || 'undefined'}</div>
                        <div>VITE_BASE_URL: {import.meta.env.VITE_BASE_URL || 'undefined'}</div>
                        <div>Has API Key: {currentSettings.apiKey ? 'Yes' : 'No'}</div>
                        <div>Using Proxy: {isUsingProxy ? 'Yes' : 'No'}</div>
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            </section>
          )}
      </BaseModal.Body>
      <BaseModal.Footer>
        <div className="flex items-center gap-3">
          <button
            onClick={handleTest}
            disabled={testLoading}
            className="h-9 px-4 text-xs font-medium rounded-full bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 disabled:opacity-60 transition"
          >
            {testLoading ? t('testingConnection') : t('testConnection')}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="h-9 px-4 text-xs font-medium rounded-full text-slate-600 hover:bg-slate-100 transition"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSave}
            className="h-9 px-5 text-xs font-medium rounded-full bg-slate-900 text-white hover:bg-slate-800 shadow-sm transition"
          >
            {t('saveChanges')}
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  );
};

export default SettingsModal;