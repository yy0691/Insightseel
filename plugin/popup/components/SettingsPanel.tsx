import React, { useState, useEffect } from 'react';
import { Settings, Save, Check, AlertCircle } from 'lucide-react';
import type { PluginSettings } from '../../shared/types';

interface SettingsPanelProps {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<PluginSettings>({
    apiProvider: 'gemini',
    model: 'gemini-2.0-flash',
    language: 'en',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  useEffect(() => {
    // Load settings
    chrome.storage.local.get('pluginSettings', (result) => {
      if (result.pluginSettings) {
        setSettings(result.pluginSettings);
      }
    });
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('saving');

    try {
      await chrome.storage.local.set({ pluginSettings: settings });
      setSaveStatus('success');
      setTimeout(() => {
        setSaveStatus('idle');
        onClose();
      }, 1000);
    } catch (error) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Settings className="w-4 h-4 text-gray-600" />
        <h2 className="text-sm font-semibold text-gray-900">Settings</h2>
      </div>

      {/* API Provider */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-700">API Provider</label>
        <select
          value={settings.apiProvider}
          onChange={(e) =>
            setSettings({
              ...settings,
              apiProvider: e.target.value as any,
            })
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="gemini">Google Gemini</option>
          <option value="openai">OpenAI</option>
          <option value="poe">Poe</option>
        </select>
      </div>

      {/* API Key */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-700">API Key</label>
        <input
          type="password"
          value={settings.apiKey || ''}
          onChange={(e) =>
            setSettings({
              ...settings,
              apiKey: e.target.value,
            })
          }
          placeholder="Enter your API key"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <p className="text-xs text-gray-500">
          Leave empty to use proxy API
        </p>
      </div>

      {/* Model */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-700">Model</label>
        <input
          type="text"
          value={settings.model}
          onChange={(e) =>
            setSettings({
              ...settings,
              model: e.target.value,
            })
          }
          placeholder="e.g., gemini-2.0-flash"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Language */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-700">Language</label>
        <select
          value={settings.language}
          onChange={(e) =>
            setSettings({
              ...settings,
              language: e.target.value as 'en' | 'zh',
            })
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
      </div>

      {/* Save Status */}
      {saveStatus !== 'idle' && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg text-xs ${
            saveStatus === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : saveStatus === 'error'
                ? 'bg-red-50 text-red-700'
                : 'bg-blue-50 text-blue-700'
          }`}
        >
          {saveStatus === 'saving' && <span className="animate-spin">⏳</span>}
          {saveStatus === 'success' && <Check className="w-4 h-4" />}
          {saveStatus === 'error' && <AlertCircle className="w-4 h-4" />}
          <span>
            {saveStatus === 'saving'
              ? 'Saving...'
              : saveStatus === 'success'
                ? 'Settings saved!'
                : 'Error saving settings'}
          </span>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-2 pt-4">
        <button
          onClick={onClose}
          className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex-1 px-3 py-2 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Info */}
      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-xs text-blue-700">
          💡 Use the proxy API to avoid CORS issues. Configure your API keys in settings.
        </p>
      </div>
    </div>
  );
}
