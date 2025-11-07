import { GoogleGenAI, Content } from '@google/genai';
import { fileToBase64 } from '../utils/helpers';
import { getEffectiveSettings } from './dbService';
import { APISettings } from '../types';

const DEFAULT_MODEL = 'gemini-2.5-flash';

async function getAIConfig(): Promise<{ai: GoogleGenAI, settings: APISettings, apiKey: string}> {
    const settings = await getEffectiveSettings();
    const apiKey = settings.apiKey;
    if (!apiKey) {
        throw new Error("API Key is not configured. Please set it in the settings or configure the system environment variable.");
    }
    const ai = new GoogleGenAI({ apiKey });
    return { ai, settings, apiKey };
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

export async function generateSubtitles(videoFile: File, prompt: string): Promise<string> {
    const { ai, settings, apiKey } = await getAIConfig();
    const base64Video = await fileToBase64(videoFile);

    const videoPart = {
      inlineData: {
        mimeType: videoFile.type,
        data: base64Video,
      },
    };
    const textPart = {
        text: prompt,
    };
    
    if (settings.baseUrl) {
        return await generateContentWithCustomAPI(settings, apiKey, { parts: [videoPart, textPart] });
    }

    const response = await ai.models.generateContent({
        model: settings.model,
        contents: { parts: [videoPart, textPart] }
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
    // This is a special case where we use the settings passed directly for the test
    const env = (typeof process !== 'undefined' ? process.env : {}) as any;
    
    // Prioritize settings from the UI, then fallback to environment variables
    const apiKey = settings.apiKey !== undefined ? settings.apiKey : env.API_KEY;
    const modelName = settings.model || env.MODEL || DEFAULT_MODEL;
    const baseUrl = settings.baseUrl !== undefined ? settings.baseUrl : env.BASE_URL;

    if (!apiKey) {
        return { success: false, message: "API Key is missing." };
    }

    try {
        if (baseUrl) {
            // Test custom API endpoint
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
            // Test official Google GenAI API
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