import { openDB, DBSchema } from 'idb';
import { Video, Subtitles, Analysis, Note, APISettings, ChatHistory } from '../types';

const DB_NAME = 'LocalVideoAnalyzerDB';
const DB_VERSION = 4;

interface AppDB extends DBSchema {
  videos: {
    key: string;
    value: Video;
  };
  subtitles: {
    key: string;
    value: Subtitles;
  };
  analyses: {
    key: string;
    value: Analysis;
    indexes: { 'by-videoId': string };
  };
  notes: {
    key: string;
    value: Note;
  };
  settings: {
    key: string;
    value: APISettings;
  };
  chatHistory: {
    key: string;
    value: ChatHistory;
  };
}

const dbPromise = openDB<AppDB>(DB_NAME, DB_VERSION, {
  upgrade(db, oldVersion) {
    if (!db.objectStoreNames.contains('videos')) {
      db.createObjectStore('videos', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('subtitles')) {
      db.createObjectStore('subtitles', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('analyses')) {
      const analysesStore = db.createObjectStore('analyses', { keyPath: 'id' });
      analysesStore.createIndex('by-videoId', 'videoId');
    }
     if (!db.objectStoreNames.contains('notes')) {
      db.createObjectStore('notes', { keyPath: 'id' });
    }
    if (oldVersion < 3) {
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
    }
    if (oldVersion < 4) {
      if (!db.objectStoreNames.contains('chatHistory')) {
        db.createObjectStore('chatHistory', { keyPath: 'id' });
      }
    }
  },
});

export const videoDB = {
  async getAll() {
    return (await dbPromise).getAll('videos');
  },
  async get(id: string) {
    return (await dbPromise).get('videos', id);
  },
  async put(video: Video) {
    return (await dbPromise).put('videos', video);
  },
  async delete(id: string) {
    return (await dbPromise).delete('videos', id);
  },
};

export const subtitleDB = {
    async get(id: string) {
        return (await dbPromise).get('subtitles', id);
    },
    async put(subtitles: Subtitles) {
        return (await dbPromise).put('subtitles', subtitles);
    },
    async delete(id: string) {
        return (await dbPromise).delete('subtitles', id);
    }
};

export const analysisDB = {
  async getByVideoId(videoId: string) {
    return (await dbPromise).getAllFromIndex('analyses', 'by-videoId', videoId);
  },
  async put(analysis: Analysis) {
    return (await dbPromise).put('analyses', analysis);
  },
  async delete(id: string) {
      return (await dbPromise).delete('analyses', id);
  }
};

export const noteDB = {
  async get(id: string) {
    return (await dbPromise).get('notes', id);
  },
  async put(note: Note) {
    return (await dbPromise).put('notes', note);
  },
};

export const chatDB = {
  async get(id: string) {
    return (await dbPromise).get('chatHistory', id);
  },
  async put(chatHistory: ChatHistory) {
    return (await dbPromise).put('chatHistory', chatHistory);
  },
  async delete(id: string) {
    return (await dbPromise).delete('chatHistory', id);
  },
};

export const settingsDB = {
  async get(id: 'user-settings' = 'user-settings') {
    return (await dbPromise).get('settings', id);
  },
  async put(settings: APISettings) {
    return (await dbPromise).put('settings', settings);
  },
};

export const appDB = {
  async deleteVideo(videoId: string) {
    const db = await dbPromise;
    const analysesToDelete = await db.getAllFromIndex('analyses', 'by-videoId', videoId);

    const tx = db.transaction(['videos', 'subtitles', 'analyses', 'notes', 'chatHistory'], 'readwrite');

    await Promise.all([
      tx.objectStore('videos').delete(videoId),
      tx.objectStore('subtitles').delete(videoId),
      ...analysesToDelete.map(a => tx.objectStore('analyses').delete(a.id)),
      tx.objectStore('notes').delete(videoId),
      tx.objectStore('chatHistory').delete(videoId),
    ]);

    return tx.done;
  }
};

export async function getEffectiveSettings(): Promise<APISettings> {
    const userSettings = (await settingsDB.get('user-settings')) as Partial<APISettings> | undefined;
    
    // Check if proxy is available (safe frontend signal)
    const proxyAvailable = import.meta.env.VITE_USE_PROXY === 'true';
    const systemBaseUrl = import.meta.env.VITE_BASE_URL;
    const systemModel = import.meta.env.VITE_MODEL;
    const systemHttpReferer = import.meta.env.VITE_HTTP_REFERER;
    const systemXTitle = import.meta.env.VITE_X_TITLE;
    const DEFAULT_MODEL = 'gemini-2.5-flash';

    const provider = userSettings?.provider || 'gemini';
    const providerDefaults = {
        gemini: { baseUrl: 'https://generativelanguage.googleapis.com', model: DEFAULT_MODEL },
        openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
        openai_compatible: { baseUrl: '', model: 'gpt-4o-mini' },
        xiaomi_mimo: { baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1', model: 'mimo-v2-omni' },
        poe: { baseUrl: 'https://api.poe.com/v1', model: 'GPT-4o' },
        custom: { baseUrl: '', model: 'default' },
    } as const;
    const defaults = providerDefaults[provider] || providerDefaults.gemini;
    const finalBaseUrl = userSettings?.baseUrl || systemBaseUrl || defaults.baseUrl;
    const finalModel = userSettings?.model || systemModel || defaults.model;
    
    const useProxy = userSettings?.useProxy ?? (!userSettings?.apiKey && proxyAvailable);

    return {
        id: 'user-settings',
        provider,
        language: userSettings?.language || (navigator.language.startsWith('zh') ? 'zh' : 'en'),
        model: finalModel,
        baseUrl: finalBaseUrl,
        apiKey: userSettings?.apiKey,
        useProxy,
        openaiApiKey: userSettings?.openaiApiKey,
        useWhisper: userSettings?.useWhisper,
        deepgramApiKey: userSettings?.deepgramApiKey,
        httpReferer: userSettings?.httpReferer || systemHttpReferer,
        xTitle: userSettings?.xTitle || systemXTitle,
    };
}
