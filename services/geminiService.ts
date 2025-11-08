import { GoogleGenAI, Content } from '@google/genai';
import { fileToBase64, extractAudioToBase64 } from '../utils/helpers';
import { getEffectiveSettings } from './dbService';
import { APISettings } from '../types';

const DEFAULT_MODEL = 'gemini-2.5-flash';

async function getAIConfig(): Promise<{ai: GoogleGenAI | null, settings: APISettings, apiKey: string}> {
    const settings = await getEffectiveSettings();
    
    if (settings.useProxy) {
        return { ai: null, settings, apiKey: '' };
    }
    
    const apiKey = settings.apiKey;
    if (!apiKey) {
        throw new Error("API Key is not configured. Please set it in the settings or configure the system environment variable.");
    }
    const ai = new GoogleGenAI({ apiKey });
    return { ai, settings, apiKey };
}

async function generateContentViaProxy(
    contents: any,
    systemInstruction?: string,
): Promise<string> {
    const payload: any = {
        contents: Array.isArray(contents) ? contents : [contents]
    };

    if (systemInstruction) {
        payload.systemInstruction = systemInstruction;
    }

    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Proxy request failed' }));
        throw new Error(`Proxy request failed: ${errorData.error || response.statusText}`);
    }

    const data = await response.json();
    
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
    if (!text && data.candidates?.[0]?.finishReason) {
        if (data.candidates[0].finishReason !== "STOP") {
             throw new Error(`Model returned no content. Finish reason: ${data.candidates[0].finishReason}`);
        }
    }
    
    return text;
}

async function generateContentStreamViaProxy(
    contents: any,
    onStreamText?: (text: string) => void,
    systemInstruction?: string,
): Promise<string> {
    const payload: any = {
        contents: Array.isArray(contents) ? contents : [contents],
        stream: true
    };

    if (systemInstruction) {
        payload.systemInstruction = systemInstruction;
    }

    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Proxy request failed' }));
        throw new Error(`Proxy request failed: ${errorData.error || response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const data = JSON.parse(line.slice(6));
                    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
                    fullText += text;
                    onStreamText?.(fullText);
                } catch (e) {
                    // Skip invalid JSON
                }
            }
        }
    }

    return fullText;
}

async function generateContentWithCustomAPI(
    settings: APISettings,
    apiKey: string,
    contents: any,
    systemInstruction?: string,
): Promise<string> {
    const baseUrl = settings.baseUrl;
    if (!baseUrl) {
        throw new Error("baseUrl is not defined for custom API call");
    }

    const modelName = settings.model || DEFAULT_MODEL;
    const url = `${baseUrl.replace(/\/$/, '')}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    
    const payload: any = {
        contents: Array.isArray(contents) ? contents : [contents]
    };

    if (systemInstruction) {
        payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(`API request failed: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
    if (!text && data.candidates?.[0]?.finishReason) {
        // If there's no text but a finish reason, it could be a safety block or other issue.
        if (data.candidates[0].finishReason !== "STOP") {
             throw new Error(`Model returned no content. Finish reason: ${data.candidates[0].finishReason}`);
        }
    }
    
    return text;
}


export async function analyzeVideo(params: {
  prompt: string;
  frames?: string[];
  subtitlesText?: string;
}): Promise<string> {
  const { prompt, frames, subtitlesText } = params;

  try {
    const { ai, settings, apiKey } = await getAIConfig();
    const modelName = settings.model;

    let fullPrompt: string;
    let contents: Content;

    if (subtitlesText) {
      // Use subtitles for analysis
      fullPrompt = `Analyze the following video transcript and respond to the request.\n\nTranscript:\n${subtitlesText}\n\nRequest: ${prompt}`;
      contents = { role: 'user', parts: [{ text: fullPrompt }] };
    } else if (frames) {
      // Fallback to frames
      fullPrompt = `Analyze these sampled frames from a video and respond to the following request. The frames are presented in chronological order.\n\nRequest: ${prompt}`;
      contents = {
        role: 'user',
        parts: [
          ...frames.map(frame => ({
            inlineData: {
              mimeType: 'image/jpeg',
              data: frame,
            },
          })),
          { text: fullPrompt },
        ],
      };
    } else {
      throw new Error("Either frames or subtitles must be provided for analysis.");
    }
    
    if (settings.useProxy) {
        return await generateContentViaProxy(contents);
    }
    
    if (settings.baseUrl) {
        return await generateContentWithCustomAPI(settings, apiKey, contents);
    }

    const response = await ai.models.generateContent({
        model: modelName,
        contents: contents,
    });
    
    return response.text;
  } catch (err) {
    console.error('Error analyzing video:', err);
    const message = err instanceof Error ? err.message : "An unknown error occurred during analysis.";
    throw new Error(`Analysis failed: ${message}`);
  }
}

export async function generateChatResponse(
  history: Content[],
  newMessage: { text: string; imageB64DataUrl?: string },
  videoContext: { frames?: string[] },
  subtitlesText: string | null,
  systemInstruction: string,
): Promise<string> {
  try {
    const { ai, settings, apiKey } = await getAIConfig();

    const userParts = [{ text: newMessage.text }];
    if (newMessage.imageB64DataUrl) {
        userParts.unshift({
            inlineData: {
                mimeType: 'image/jpeg',
                data: newMessage.imageB64DataUrl.split(',')[1]
            }
        } as any);
    }
    
    const newUserMessage: Content = { role: 'user', parts: userParts };

    let contents: Content[];
    
    // If it's the first user message, prepend context
    if (history.length === 0) {
        let contextText = "This is the context for our conversation. I have a video for you to analyze.";
        const contextParts: any[] = [];
        
        if (videoContext.frames && videoContext.frames.length > 0) {
             contextParts.push(...videoContext.frames.map(frame => ({
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: frame,
                },
            })));
        }

        if (subtitlesText) {
            contextText += `\n\nHere is the full transcript of the video:\n${subtitlesText}`;
        }
        
        contextParts.push({ text: contextText });

        contents = [
            { role: 'user', parts: contextParts },
            { role: 'model', parts: [{ text: 'Great! I have the video context. What would you like to know?' }]},
            ...history,
            newUserMessage,
        ];
    } else {
        contents = [...history, newUserMessage];
    }

    if (settings.useProxy) {
        return await generateContentViaProxy(contents, systemInstruction);
    }
    
    if (settings.baseUrl) {
        return await generateContentWithCustomAPI(settings, apiKey, contents, systemInstruction);
    }

    const response = await ai.models.generateContent({
        model: settings.model,
        contents: contents,
        config: { systemInstruction }
    });

    return response.text;
  } catch (err) {
    console.error('Error in chat response:', err);
    const message = err instanceof Error ? err.message : "An unknown error occurred in chat.";
    throw new Error(`Chat failed: ${message}`);
  }
}

/**
 * Generate subtitles with streaming support
 */
export async function generateSubtitlesStreaming(
  videoFile: File,
  prompt: string,
  onProgress?: (progress: number, stage: string) => void,
  onStreamText?: (text: string) => void
): Promise<string> {
    const { ai, settings, apiKey } = await getAIConfig();
    
    // Extract audio only to reduce file size (subtitles only need audio, not video)
    onProgress?.(0, 'Extracting audio from video...');
    const audioData = await extractAudioToBase64(videoFile, (audioProgress) => {
      // Map 0-100% of audio extraction to 0-80% of total progress
      onProgress?.(Math.round(audioProgress * 0.8), 'Extracting audio from video...');
    });
    
    console.log(`Audio extracted: ${audioData.sizeKB}KB (vs ${Math.round(videoFile.size / 1024)}KB original video)`);
    
    onProgress?.(80, 'Generating subtitles...');
    
    const audioPart = {
      inlineData: {
        mimeType: audioData.mimeType,
        data: audioData.data,
      },
    };
    const textPart = {
        text: prompt,
    };
    
    if (settings.useProxy) {
        return await generateContentStreamViaProxy({ parts: [audioPart, textPart] }, onStreamText);
    }
    
    if (settings.baseUrl) {
        // Custom API doesn't support streaming, fallback to regular
        return await generateContentWithCustomAPI(settings, apiKey, { parts: [audioPart, textPart] });
    }

    // Use streaming API
    const stream = await ai.models.generateContentStream({
        model: settings.model,
        contents: { parts: [audioPart, textPart] }
    });
    
    let fullText = '';
    for await (const chunk of stream) {
      const chunkText = chunk.text ?? '';
      fullText += chunkText;
      onStreamText?.(fullText);
    }
    
    return fullText;
}

export async function generateSubtitles(
  videoFile: File, 
  prompt: string,
  onProgress?: (progress: number, stage: string) => void
): Promise<string> {
    const { ai, settings, apiKey } = await getAIConfig();
    
    // Extract audio only to reduce file size (subtitles only need audio, not video)
    onProgress?.(0, 'Extracting audio from video...');
    const audioData = await extractAudioToBase64(videoFile, (audioProgress) => {
      // Map 0-100% of audio extraction to 0-80% of total progress
      onProgress?.(Math.round(audioProgress * 0.8), 'Extracting audio from video...');
    });
    
    console.log(`Audio extracted: ${audioData.sizeKB}KB (vs ${Math.round(videoFile.size / 1024)}KB original video)`);
    
    onProgress?.(80, 'Generating subtitles...');
    
    const audioPart = {
      inlineData: {
        mimeType: audioData.mimeType,
        data: audioData.data,
      },
    };
    const textPart = {
        text: prompt,
    };
    
    if (settings.useProxy) {
        return await generateContentViaProxy({ parts: [audioPart, textPart] });
    }
    
    if (settings.baseUrl) {
        return await generateContentWithCustomAPI(settings, apiKey, { parts: [audioPart, textPart] });
    }

    const response = await ai.models.generateContent({
        model: settings.model,
        contents: { parts: [audioPart, textPart] }
    });
    
    // The model might wrap the SRT in markdown, so we extract it.
    const srtContent = response.text.match(/```srt\n([\s\S]*?)```/);
    if (srtContent && srtContent[1]) {
        return srtContent[1].trim();
    }
    return response.text.trim();
}

export async function translateSubtitles(srtContent: string, targetLanguage: string): Promise<string> {
    const { ai, settings, apiKey } = await getAIConfig();
    const prompt = `Translate the following SRT content into ${targetLanguage}. Maintain the SRT format, including timestamps and numbering, perfectly. Only output the translated SRT content, with no extra explanations or markdown formatting.\n\n${srtContent}`;

    if (settings.useProxy) {
        return await generateContentViaProxy({ parts: [{ text: prompt }] });
    }
    
    if (settings.baseUrl) {
        return await generateContentWithCustomAPI(settings, apiKey, { parts: [{ text: prompt }] });
    }

    const response = await ai.models.generateContent({
        model: settings.model,
        contents: prompt
    });

    return response.text.trim();
}

export async function testConnection(settings: APISettings): Promise<{success: boolean, message: string}> {
    const modelName = settings.model || DEFAULT_MODEL;

    try {
        if (settings.useProxy) {
            const response = await fetch('/api/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    contents: [{ parts: [{ text: "Hello" }] }] 
                }),
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Proxy request failed' }));
                throw new Error(errorData.error || `Request failed with status ${response.status}`);
            }
            return { success: true, message: "Successfully connected via proxy!" };
        }

        const apiKey = settings.apiKey;
        const baseUrl = settings.baseUrl;

        if (!apiKey) {
            return { success: false, message: "API Key is missing." };
        }

        if (baseUrl) {
            const url = `${baseUrl.replace(/\/$/, '')}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: "Hello" }] }] }),
            });
            if (!response.ok) {
                 const errorData = await response.json().catch(() => ({}));
                 throw new Error(errorData.error?.message || `Request failed with status ${response.status}`);
            }
        } else {
            const ai = new GoogleGenAI({ apiKey });
            await ai.models.generateContent({
                model: modelName,
                contents: 'Hello'
            });
        }
        return { success: true, message: "Successfully connected!" };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'An unknown error occurred.';
        return { success: false, message };
    }
}