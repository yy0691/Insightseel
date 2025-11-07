import React, { useState, useEffect } from 'react';
import { APISettings } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { testConnection } from '../services/geminiService';

interface SettingsModalProps {
  settings: APISettings;
  onSave: (settings: APISettings) => void;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onSave, onClose }) => {
  const [currentSettings, setCurrentSettings] = useState<APISettings>(settings);
  const [testState, setTestState] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message: string }>({ status: 'idle', message: '' });
  const { t } = useLanguage();

  // Check for build-time environment variables to determine UI behavior
  const systemModel = process.env.MODEL_NAME;
  const systemBaseUrl = process.env.BASE_URL;
  const systemApiKey = process.env.API_KEY;

  // Determine if the currently displayed settings are from the system fallback
  const isModelSystemInUse = !!systemModel && currentSettings.model === systemModel;
  const isBaseUrlSystemInUse = !!systemBaseUrl && currentSettings.baseUrl === systemBaseUrl;
  const isApiKeySystemInUse = !!systemApiKey && currentSettings.apiKey === systemApiKey;

  useEffect(() => {
    // We receive the "effective" settings. We don't want to show system values in the input fields.
    const displaySettings = { ...settings };
    if (!!systemModel && settings.model === systemModel) {
      displaySettings.model = '';
    }
    if (!!systemBaseUrl && settings.baseUrl === systemBaseUrl) {
      displaySettings.baseUrl = '';
    }
    if (!!systemApiKey && settings.apiKey === systemApiKey) {
      displaySettings.apiKey = '';
    }

    setCurrentSettings(displaySettings);
    setTestState({ status: 'idle', message: '' }); // Reset on open
  }, [settings, systemApiKey, systemBaseUrl, systemModel]);

  const handleSettingChange = (update: Partial<APISettings>) => {
    setCurrentSettings(prev => ({ ...prev, ...update }));
    if (testState.status !== 'idle') {
      setTestState({ status: 'idle', message: '' });
    }
  };

  const handleSave = () => {
    // When saving, if a field is empty but a system default exists,
    // we save it as an empty string to ensure the user's choice to override is respected.
    onSave(currentSettings);
  };
  
  const handleTest = async () => {
    setTestState({ status: 'testing', message: t('testingConnection') });
    // For testing, we must use the effective settings, combining user input with system fallbacks
    const settingsToTest: APISettings = {
        ...currentSettings,
        model: currentSettings.model || systemModel || 'gemini-2.5-flash',
        baseUrl: currentSettings.baseUrl || systemBaseUrl,
        apiKey: currentSettings.apiKey || systemApiKey,
    }
    const result = await testConnection(settingsToTest);
    if (result.success) {
        setTestState({ status: 'success', message: t('testSuccess') });
    } else {
        setTestState({ status: 'error', message: t('testFailureDetails', result.message) });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-slate-50 to-slate-200 rounded-2xl shadow-2xl w-full max-w-lg border border-white/30 text-slate-800">
        <div className="p-6 border-b border-slate-300/50">
          <h2 className="text-xl font-semibold">{t('settingsTitle')}</h2>
          <p className="text-sm text-slate-500">{t('settingsDescription')}</p>
        </div>
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div>
            <label htmlFor="language-select" className="block text-sm font-medium text-slate-700 mb-1">
              {t('language')}
            </label>
            <select
              id="language-select"
              value={currentSettings.language}
              onChange={(e) => handleSettingChange({ language: e.target.value as 'en' | 'zh' })}
              className="w-full backdrop-blur-sm bg-white/50 border-slate-300/80 border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            >
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="model-name" className="block text-sm font-medium text-slate-700 mb-1">
              {t('modelName')}
            </label>
            <input
              type="text"
              id="model-name"
              value={currentSettings.model || ''}
              onChange={(e) => handleSettingChange({ model: e.target.value })}
              placeholder={systemModel ? t('modelPlaceholderSystem', systemModel) : t('modelNamePlaceholder')}
              className="w-full backdrop-blur-sm bg-white/50 border-slate-300/80 border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            />
          </div>
          
          <div>
            <label htmlFor="base-url" className="block text-sm font-medium text-slate-700 mb-1">
              {t('baseUrl')}
            </label>
            <input
              type="text"
              id="base-url"
              value={currentSettings.baseUrl || ''}
              onChange={(e) => handleSettingChange({ baseUrl: e.target.value.trim() })}
              placeholder={systemBaseUrl ? t('baseUrlPlaceholderSystem') : t('baseUrlPlaceholder')}
              className="w-full backdrop-blur-sm bg-white/50 border-slate-300/80 border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            />
            <p className="text-xs text-slate-500 mt-1">{t('baseUrlHelpText')}</p>
          </div>

          <div>
            <label htmlFor="api-key" className="block text-sm font-medium text-slate-700 mb-1">
              {t('apiKey')}
            </label>
            <input
              type="password"
              id="api-key"
              value={currentSettings.apiKey || ''}
              onChange={(e) => handleSettingChange({ apiKey: e.target.value })}
              placeholder={systemApiKey ? t('apiKeyPlaceholderSystem') : t('apiKeyPlaceholder')}
              className="w-full backdrop-blur-sm bg-white/50 border-slate-300/80 border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            />
            <p className="text-xs text-slate-500 mt-1">{t('apiKeyHelpText')}</p>
          </div>
        </div>
        <div className="p-4 bg-slate-200/50 flex justify-between items-center rounded-b-2xl">
            <div className="flex items-center space-x-3">
                 <button
                    onClick={handleTest}
                    disabled={testState.status === 'testing'}
                    className="h-10 px-5 text-sm font-medium rounded-xl transition-colors bg-white/80 text-slate-700 hover:bg-white border border-slate-300/80 shadow-sm disabled:opacity-50"
                >
                    {testState.status === 'testing' ? t('testingConnection') : t('testConnection')}
                </button>
                 {testState.status !== 'idle' && (
                    <p className={`text-xs font-medium transition-opacity ${
                      testState.status === 'success' ? 'text-green-600' :
                      testState.status === 'error' ? 'text-red-600' :
                      'text-slate-500 animate-pulse'
                    }`}>
                      {testState.message}
                    </p>
                )}
            </div>
            <div className="flex items-center space-x-3">
                <button
                    onClick={onClose}
                    className="h-10 px-5 text-sm font-medium rounded-xl transition-colors bg-transparent text-slate-700 hover:bg-slate-900/10"
                >
                    {t('cancel')}
                </button>
                <button
                    onClick={handleSave}
                    className="h-10 px-5 text-sm font-medium rounded-xl transition-colors bg-slate-900 text-slate-50 hover:bg-slate-900/90 shadow-sm"
                >
                    {t('saveChanges')}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;