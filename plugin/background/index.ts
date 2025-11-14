/**
 * Background Service Worker
 * Handles video processing and API requests
 */

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

    // Process task
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
        task.error = error.message;
        chrome.runtime.sendMessage({
          action: 'processingError',
          taskId,
          error: error.message,
        }).catch(() => {
          // Popup not open
        });
      });

    sendResponse({ taskId, status: 'processing' });
  } else if (message.action === 'getTaskStatus') {
    const { taskId } = message;
    const task = processingTasks.get(taskId);
    sendResponse(task || { status: 'unknown' });
  }
});

async function processVideoAnalysis(task: ProcessingTask): Promise<string> {
  const settings = await getPluginSettings();

  // Call the proxy API endpoint
  const response = await fetch('https://api.insightreel.app/api/analyze-video', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.apiKey && { 'X-API-Key': settings.apiKey }),
    },
    body: JSON.stringify({
      videoUrl: task.videoUrl,
      analysisType: task.type,
      provider: settings.apiProvider,
      model: settings.model,
      language: settings.language,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.result;
}

async function getPluginSettings() {
  return new Promise((resolve) => {
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
