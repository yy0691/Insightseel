import * as JSZip from 'jszip';
import { Video, Subtitles, Analysis, Note, ChatHistory } from '../types';
import { videoDB, subtitleDB, analysisDB, noteDB, chatDB } from './dbService';

interface ExportData {
  version: string;
  exportDate: string;
  videos: Array<{
    metadata: Omit<Video, 'file'>;
    subtitles?: Subtitles;
    analyses: Analysis[];
    note?: Note;
    chat?: ChatHistory;
    videoFile?: Blob;
  }>;
}

export const exportService = {
  async exportAllData(includeVideos: boolean = false): Promise<Blob> {
    const videos = await videoDB.getAll();

    const exportData: ExportData = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      videos: [],
    };

    for (const video of videos) {
      const videoData: ExportData['videos'][0] = {
        metadata: {
          id: video.id,
          name: video.name,
          duration: video.duration,
          size: video.size,
          hash: video.hash,
          folderPath: video.folderPath,
          language: video.language,
        },
        analyses: [],
      };

      const subtitle = await subtitleDB.get(video.id);
      if (subtitle) {
        videoData.subtitles = subtitle;
      }

      const analyses = await analysisDB.getByVideoId(video.id);
      videoData.analyses = analyses;

      const note = await noteDB.get(video.id);
      if (note) {
        videoData.note = note;
      }

      const chat = await chatDB.get(video.id);
      if (chat) {
        videoData.chat = chat;
      }

      if (includeVideos) {
        videoData.videoFile = video.file;
      }

      exportData.videos.push(videoData);
    }

    if (includeVideos) {
      const zip = new JSZip();

      zip.file('data.json', JSON.stringify({
        ...exportData,
        videos: exportData.videos.map(v => ({
          ...v,
          videoFile: undefined,
        })),
      }, null, 2));

      for (const videoData of exportData.videos) {
        if (videoData.videoFile) {
          const sanitizedName = videoData.metadata.name.replace(/[^a-z0-9]/gi, '_');
          const fileName = `videos/${sanitizedName}_${videoData.metadata.id}.mp4`;
          zip.file(fileName, videoData.videoFile);
        }
      }

      return await zip.generateAsync({ type: 'blob' });
    } else {
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      return blob;
    }
  },

  async exportVideo(videoId: string, includeVideoFile: boolean = false): Promise<Blob> {
    const video = await videoDB.get(videoId);
    if (!video) throw new Error('Video not found');

    const exportData: ExportData = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      videos: [],
    };

    const videoData: ExportData['videos'][0] = {
      metadata: {
        id: video.id,
        name: video.name,
        duration: video.duration,
        size: video.size,
        hash: video.hash,
        folderPath: video.folderPath,
        language: video.language,
      },
      analyses: [],
    };

    const subtitle = await subtitleDB.get(video.id);
    if (subtitle) {
      videoData.subtitles = subtitle;
    }

    const analyses = await analysisDB.getByVideoId(video.id);
    videoData.analyses = analyses;

    const note = await noteDB.get(video.id);
    if (note) {
      videoData.note = note;
    }

    const chat = await chatDB.get(video.id);
    if (chat) {
      videoData.chat = chat;
    }

    exportData.videos.push(videoData);

    if (includeVideoFile) {
      const zip = new JSZip();

      zip.file('data.json', JSON.stringify(exportData, null, 2));

      const sanitizedName = video.name.replace(/[^a-z0-9]/gi, '_');
      const fileName = `${sanitizedName}_${video.id}.mp4`;
      zip.file(fileName, video.file);

      return await zip.generateAsync({ type: 'blob' });
    } else {
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      return blob;
    }
  },

  async downloadExport(blob: Blob, filename: string): Promise<void> {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  async exportAllDataAndDownload(includeVideos: boolean = false): Promise<void> {
    const blob = await this.exportAllData(includeVideos);
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = includeVideos
      ? `insightreel-export-with-videos-${timestamp}.zip`
      : `insightreel-export-${timestamp}.json`;

    await this.downloadExport(blob, filename);
  },

  async exportVideoAndDownload(videoId: string, includeVideoFile: boolean = false): Promise<void> {
    const video = await videoDB.get(videoId);
    if (!video) throw new Error('Video not found');

    const blob = await this.exportVideo(videoId, includeVideoFile);
    const sanitizedName = video.name.replace(/[^a-z0-9]/gi, '_');
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = includeVideoFile
      ? `${sanitizedName}-export-${timestamp}.zip`
      : `${sanitizedName}-export-${timestamp}.json`;

    await this.downloadExport(blob, filename);
  },

  async importFromJSON(jsonString: string): Promise<{
    success: boolean;
    imported: number;
    errors: string[];
  }> {
    const result = {
      success: true,
      imported: 0,
      errors: [] as string[],
    };

    try {
      const data: ExportData = JSON.parse(jsonString);

      if (!data.version || !data.videos) {
        throw new Error('Invalid export file format');
      }

      for (const videoData of data.videos) {
        try {
          if (videoData.subtitles) {
            await subtitleDB.put(videoData.subtitles);
          }

          for (const analysis of videoData.analyses) {
            await analysisDB.put(analysis);
          }

          if (videoData.note) {
            await noteDB.put(videoData.note);
          }

          if (videoData.chat) {
            await chatDB.put(videoData.chat);
          }

          result.imported++;
        } catch (error) {
          const errorMsg = `Failed to import ${videoData.metadata.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMsg);
          console.error(errorMsg);
        }
      }
    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  },
};
