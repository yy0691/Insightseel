import { openDB, DBSchema } from 'idb';
import { Video, Subtitles, Analysis, Note, APISettings } from '../types';

const DB_NAME = 'LocalVideoAnalyzerDB';
const DB_VERSION = 3;

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
    
    const tx = db.transaction(['videos', 'subtitles', 'analyses', 'notes'], 'readwrite');
    
    await Promise.all([
      tx.objectStore('videos').delete(videoId),
      tx.objectStore('subtitles').delete(videoId),
      ...analysesToDelete.map(a => tx.objectStore('analyses').delete(a.id)),
      tx.objectStore('notes').delete(videoId),
    ]);

    return tx.done;
  }
};

export async function getEffectiveSettings(): Promise<APISettings> {
    const userSettings = await settingsDB.get('user-settings') || {};
    const DEFAULT_MODEL = 'gemini-2.5-flash';
    
    // In environments like Vercel, environment variables are available on process.env.
    // We assume this is available in the execution environment as per project requirements.
    const env = (typeof process !== 'undefined' ? process.env : {}) as any;

    return {
        id: 'user-settings',
        provider: 'gemini',
        language: userSettings.language || (navigator.language.startsWith('zh') ? 'zh' : 'en'),
        model: userSettings.model || env.MODEL || DEFAULT_MODEL,
        baseUrl: userSettings.baseUrl || env.BASE_URL,
        apiKey: userSettings.apiKey || env.API_KEY,
    };
}