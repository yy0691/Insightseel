/**
 * Background Service Worker
 * Handles video processing and API requests
 */

import type { PluginSettings } from '../shared/types';

interface ProcessingTask {
  id: string;
  videoUrl: string;
  type: 'summary' | 'key-moments' | 'translation' | 'chat';
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: string;
  error?: string;
}

const processingTasks = new Map<string, ProcessingTask>();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startProcessing') {
    const { videoUrl, analysisType } = message;
    const taskId = `${videoUrl}-${analysisType}-${Date.now()}`;

    const task: ProcessingTask = {
      id: taskId,
      videoUrl,
      type: analysisType,
      status: 'pending',
    };

    processingTasks.set(taskId, task);

    // Process task asynchronously
    processVideoAnalysis(task)
      .then((result) => {
        task.status = 'completed';
        task.result = result;
        chrome.runtime.sendMessage({
          action: 'processingComplete',
          taskId,
          result,
        }).catch(() => {
          // Popup not open
        });
      })
      .catch((error) => {
        task.status = 'error';
        task.error = error.message || 'Failed to fetch';
        chrome.runtime.sendMessage({
          action: 'processingError',
          taskId,
          error: error.message || 'Failed to fetch',
        }).catch(() => {
          // Popup not open
        });
      });

    // Return true to indicate we will send a response asynchronously
    sendResponse({ taskId, status: 'processing' });
    return true; // Keep the message channel open for async response
  } else if (message.action === 'getTaskStatus') {
    const { taskId } = message;
    const task = processingTasks.get(taskId);
    sendResponse(task || { status: 'unknown' });
    return true;
  }
  return false;
});

async function processVideoAnalysis(task: ProcessingTask): Promise<string> {
  const settings = await getPluginSettings();

  // Determine API endpoint - use localhost for development or configured baseUrl
  const baseUrl = settings.baseUrl || 'http://localhost:5000';
  const apiUrl = `${baseUrl}/api/proxy`;

  try {
    // Call the proxy API endpoint
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.apiKey && { 'X-API-Key': settings.apiKey }),
      },
      body: JSON.stringify({
        videoUrl: task.videoUrl,
        analysisType: task.type,
        provider: settings.apiProvider || 'gemini',
        model: settings.model || 'gemini-2.0-flash',
        language: settings.language || 'en',
        contents: [{
          role: 'user',
          parts: [{
            text: getPromptForAnalysisType(task.type, task.videoUrl)
          }]
        }]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText || response.statusText}`);
    }

    const data = await response.json();
    
    // Handle different response formats
    if (data.text) {
      return data.text;
    } else if (data.result) {
      return data.result;
    } else if (typeof data === 'string') {
      return data;
    } else {
      throw new Error('Unexpected API response format');
    }
  } catch (error) {
    console.error('Error processing video analysis:', error);
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Unable to connect to API. Please check your connection and API settings.');
    }
    throw error;
  }
}

function getPromptForAnalysisType(type: string, videoUrl: string): string {
  const prompts = {
    'summary': `Please provide a comprehensive summary of the video at ${videoUrl}. Include the main topics, key points, and important information discussed.`,
    'key-moments': `Identify and describe the key moments or highlights in the video at ${videoUrl}. List them in chronological order with timestamps if possible.`,
    'translation': `Translate the content of the video at ${videoUrl} to the requested language. Provide a clear and accurate translation.`,
    'chat': `Analyze the video at ${videoUrl} and be ready to answer questions about it.`
  };
  return prompts[type as keyof typeof prompts] || `Analyze the video at ${videoUrl}.`;
}

async function getPluginSettings(): Promise<PluginSettings> {
  return new Promise<PluginSettings>((resolve) => {
    chrome.storage.local.get('pluginSettings', (result) => {
      resolve(
        result.pluginSettings || {
          apiProvider: 'gemini',
          model: 'gemini-2.0-flash',
          language: 'en',
        }
      );
    });
  });
}

// Initialize plugin
chrome.runtime.onInstalled.addListener(async () => {
  const defaultSettings = {
    apiProvider: 'gemini',
    model: 'gemini-2.0-flash',
    language: 'en',
    useProxy: true,
  };

  await chrome.storage.local.set({ pluginSettings: defaultSettings });
  console.log('InsightReel plugin installed');
});
