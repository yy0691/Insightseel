import { supabase } from './authService';
import { Video, Subtitles, Analysis, Note, ChatHistory } from '../types';
import { videoDB, subtitleDB, analysisDB, noteDB, chatDB } from './dbService';

interface SyncStatus {
  lastSyncAt: string | null;
  isSyncing: boolean;
  error: string | null;
}

interface SyncResult {
  success: boolean;
  synced: {
    videos: number;
    subtitles: number;
    analyses: number;
    notes: number;
    chats: number;
  };
  error?: string;
}

export const syncService = {
  async syncToCloud(userId: string): Promise<SyncResult> {
    if (!supabase) {
      return {
        success: false,
        synced: { videos: 0, subtitles: 0, analyses: 0, notes: 0, chats: 0 },
        error: 'Supabase not configured',
      };
    }

    const result: SyncResult = {
      success: true,
      synced: { videos: 0, subtitles: 0, analyses: 0, notes: 0, chats: 0 },
    };

    try {
      const videos = await videoDB.getAll();

      for (const video of videos) {
        const videoMetadata = {
          id: video.id,
          user_id: userId,
          name: video.name,
          duration: video.duration,
          size: video.size,
          file_hash: video.hash,
          folder_path: video.folderPath,
          language: video.language,
        };

        const { error: videoError } = await supabase
          .from('video_metadata')
          .upsert(videoMetadata, { onConflict: 'id' });

        if (videoError) {
          console.error('Error syncing video metadata:', videoError);
          continue;
        }

        result.synced.videos++;

        const subtitle = await subtitleDB.get(video.id);
        if (subtitle) {
          const { error: subtitleError } = await supabase
            .from('subtitles')
            .upsert(
              {
                id: subtitle.id,
                video_id: video.id,
                user_id: userId,
                content: subtitle.content,
                language: subtitle.language || 'en',
                segments: subtitle.segments,
              },
              { onConflict: 'video_id,user_id' }
            );

          if (!subtitleError) result.synced.subtitles++;
        }

        const analyses = await analysisDB.getByVideoId(video.id);
        for (const analysis of analyses) {
          const { error: analysisError } = await supabase
            .from('analyses')
            .upsert(
              {
                id: analysis.id,
                video_id: video.id,
                user_id: userId,
                type: analysis.type,
                title: analysis.title,
                content: analysis.content,
              },
              { onConflict: 'id' }
            );

          if (!analysisError) result.synced.analyses++;
        }

        const note = await noteDB.get(video.id);
        if (note) {
          const { error: noteError } = await supabase
            .from('notes')
            .upsert(
              {
                id: note.id,
                video_id: video.id,
                user_id: userId,
                content: note.content,
              },
              { onConflict: 'video_id,user_id' }
            );

          if (!noteError) result.synced.notes++;
        }

        const chat = await chatDB.get(video.id);
        if (chat) {
          const { error: chatError } = await supabase
            .from('chat_history')
            .upsert(
              {
                id: chat.id,
                video_id: video.id,
                user_id: userId,
                messages: chat.messages,
              },
              { onConflict: 'video_id,user_id' }
            );

          if (!chatError) result.synced.chats++;
        }
      }

      this.setLastSyncTime();
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return result;
  },

  async syncFromCloud(userId: string): Promise<SyncResult> {
    if (!supabase) {
      return {
        success: false,
        synced: { videos: 0, subtitles: 0, analyses: 0, notes: 0, chats: 0 },
        error: 'Supabase not configured',
      };
    }

    const result: SyncResult = {
      success: true,
      synced: { videos: 0, subtitles: 0, analyses: 0, notes: 0, chats: 0 },
    };

    try {
      const { data: videoMetadataList, error: videosError } = await supabase
        .from('video_metadata')
        .select('*')
        .eq('user_id', userId);

      if (videosError) throw videosError;

      if (!videoMetadataList) return result;

      for (const metadata of videoMetadataList) {
        const existingVideo = await videoDB.get(metadata.id);
        if (existingVideo) {
          console.log(`Video ${metadata.name} already exists locally, skipping...`);
          continue;
        }

        console.warn(`Video file for "${metadata.name}" not found locally. Only metadata will be available.`);
        result.synced.videos++;

        const { data: subtitleData } = await supabase
          .from('subtitles')
          .select('*')
          .eq('video_id', metadata.id)
          .eq('user_id', userId)
          .maybeSingle();

        if (subtitleData) {
          await subtitleDB.put({
            id: subtitleData.id,
            videoId: metadata.id,
            content: subtitleData.content,
            language: subtitleData.language,
            segments: subtitleData.segments,
          });
          result.synced.subtitles++;
        }

        const { data: analysesData } = await supabase
          .from('analyses')
          .select('*')
          .eq('video_id', metadata.id)
          .eq('user_id', userId);

        if (analysesData) {
          for (const analysis of analysesData) {
            await analysisDB.put({
              id: analysis.id,
              videoId: metadata.id,
              type: analysis.type as 'summary' | 'key-info' | 'topics',
              title: analysis.title,
              content: analysis.content,
            });
            result.synced.analyses++;
          }
        }

        const { data: noteData } = await supabase
          .from('notes')
          .select('*')
          .eq('video_id', metadata.id)
          .eq('user_id', userId)
          .maybeSingle();

        if (noteData) {
          await noteDB.put({
            id: noteData.id,
            videoId: metadata.id,
            content: noteData.content,
          });
          result.synced.notes++;
        }

        const { data: chatData } = await supabase
          .from('chat_history')
          .select('*')
          .eq('video_id', metadata.id)
          .eq('user_id', userId)
          .maybeSingle();

        if (chatData) {
          await chatDB.put({
            id: chatData.id,
            videoId: metadata.id,
            messages: chatData.messages,
            updatedAt: chatData.updated_at,
          });
          result.synced.chats++;
        }
      }

      this.setLastSyncTime();
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return result;
  },

  async deleteFromCloud(userId: string, videoId: string): Promise<boolean> {
    if (!supabase) return false;

    try {
      const { error } = await supabase
        .from('video_metadata')
        .delete()
        .eq('id', videoId)
        .eq('user_id', userId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting from cloud:', error);
      return false;
    }
  },

  getLastSyncTime(): string | null {
    return localStorage.getItem('lastSyncTime');
  },

  setLastSyncTime(): void {
    localStorage.setItem('lastSyncTime', new Date().toISOString());
  },

  getSyncStatus(): SyncStatus {
    return {
      lastSyncAt: this.getLastSyncTime(),
      isSyncing: false,
      error: null,
    };
  },
};
