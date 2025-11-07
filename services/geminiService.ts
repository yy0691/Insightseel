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
          ...frames.map(frameData => ({
            inlineData: {
              mimeType: 'image/jpeg',
              data: frameData,
            },
          })),
          { text: fullPrompt },
        ],
      };
    } else {
      throw new Error("Either frames or subtitlesText must be provided for analysis.");
    }
    
    if (settings.baseUrl) {
        return generateContentWithCustomAPI(settings, apiKey, contents);
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents,
    });

    return response.text;
  } catch (error) {
    console.error('Error analyzing video with AI:', error);
    if (error instanceof Error) {
        if (error.message.includes('API key not valid') || error.message.includes('API request failed')) {
             throw new Error("The provided API Key or Base URL is invalid. Please check your settings.");
        }
        throw error;
    }
    throw new Error('An unknown error occurred during analysis.');
  }
}

export async function generateChatResponse(
    history: Content[],
    userMessage: { text: string; imageB64DataUrl?: string },
    media: { frames?: string[] },
    subtitlesText: string | null,
    systemInstruction: string,
): Promise<string> {
    try {
        const { ai, settings, apiKey } = await getAIConfig();
        const modelName = settings.model;

        const userParts: any[] = [];
        const isFirstUserMessage = history.filter(h => h.role === 'user').length === 0;

        if (isFirstUserMessage && media.frames) {
            userParts.push(...media.frames.map(frameData => ({ 
                inlineData: { mimeType: 'image/jpeg', data: frameData }
            })));
            systemInstruction += "\n\nYou will be analyzing a video based on sampled frames. These frames will be provided in the user's first message.";
        }
        if (userMessage.imageB64DataUrl) {
            const [meta, data] = userMessage.imageB64DataUrl.split(',');
            const mimeType = meta.split(';')[0].split(':')[1];
            userParts.push({ inlineData: { mimeType, data } });
        }
        
        // Prepare user text, adding context only for the first message to avoid oversized instructions.
        let userText = userMessage.text;
        if (isFirstUserMessage && subtitlesText) {
            userText = `Please use the following transcript as the primary source of information for your answers.\n\nTRANSCRIPT:\n${subtitlesText}\n\n---\n\nQUESTION:\n${userMessage.text}`;
        }
        userParts.push({ text: userText });

        const contents = [...history, { role: 'user', parts: userParts }];
        
        if (settings.baseUrl) {
            return generateContentWithCustomAPI(settings, apiKey, contents, systemInstruction);
        }
        
        const response = await ai.models.generateContent({
            model: modelName,
            contents,
            config: { systemInstruction },
        });
        return response.text;
    } catch (error) {
        console.error('Error in chat response with AI:', error);
        if (error instanceof Error) {
            if (error.message.includes('API key not valid') || error.message.includes('API request failed')) {
                throw new Error("The provided API Key or Base URL is invalid. Please check your settings.");
            }
            throw error;
        }
        throw new Error('An unknown error occurred during chat response generation.');
    }
}


export async function generateSubtitles(
  videoFile: File,
  prompt: string
): Promise<string> {
  try {
    const { ai, settings, apiKey } = await getAIConfig();
    const modelName = settings.model;
    
    const videoBase64 = await fileToBase64(videoFile);
    
    const contents = {
        parts: [
          {
            inlineData: {
              mimeType: videoFile.type,
              data: videoBase64,
            },
          },
          { text: prompt },
        ],
    };

    if (settings.baseUrl) {
        return generateContentWithCustomAPI(settings, apiKey, contents);
    }
    
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
    });

    return response.text;
  } catch (error) {
    console.error('Error generating subtitles with AI:', error);
     if (error instanceof Error) {
        if (error.message.includes('API key not valid') || error.message.includes('API request failed')) {
             throw new Error("The provided API Key or Base URL is invalid. Please check your settings.");
        }
        throw new Error(`An error occurred during subtitle generation: ${error.message}`);
    }
    throw new Error('An unknown error occurred during subtitle generation.');
  }
}

export async function translateSubtitles(
  srtContent: string,
  targetLanguage: string
): Promise<string> {
  try {
    const { ai, settings, apiKey } = await getAIConfig();
    const modelName = settings.model;

    const prompt = `Translate the following SRT content to ${targetLanguage}. Preserve the SRT format perfectly, including timestamps and numbering. The final output must be only the translated SRT content, with no extra text, explanations, or code fences.\n\nSRT Content:\n${srtContent}`;
    
    const contents = { parts: [{ text: prompt }] };

    if (settings.baseUrl) {
        return generateContentWithCustomAPI(settings, apiKey, contents);
    }
    
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
    });

    // Clean up potential markdown code fences from the response
    const cleanedText = response.text.replace(/```srt\n|```/g, '').trim();
    return cleanedText;
  } catch (error) {
    console.error('Error translating subtitles with AI:', error);
     if (error instanceof Error) {
        if (error.message.includes('API key not valid') || error.message.includes('API request failed')) {
             throw new Error("The provided API Key or Base URL is invalid. Please check your settings.");
        }
        throw new Error(`An error occurred during subtitle translation: ${error.message}`);
    }
    throw new Error('An unknown error occurred during subtitle translation.');
  }
}

export async function testConnection(settings: APISettings): Promise<{ success: boolean; message: string }> {
    // For testing, we use the provided settings from the UI, but fallback to environment variables if a field is empty.
    const env = (import.meta as any).env || {};
    const apiKey = settings.apiKey || env.VITE_API_KEY;
    const baseUrl = settings.baseUrl || env.VITE_BASE_URL;
    const modelName = settings.model || env.VITE_MODEL || DEFAULT_MODEL;

    if (!apiKey) {
        return { success: false, message: 'API Key is missing from both settings and environment variables.' };
    }

    try {
        if (baseUrl) {
            const url = `${baseUrl.replace(/\/$/, '')}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: "test" }] }],
                    generationConfig: { maxOutputTokens: 1 }
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: { message: `Request failed with status ${response.status}` } }));
                throw new Error(errorData.error?.message || `Request failed with status ${response.status}`);
            }
        } else {
            const ai = new GoogleGenAI({ apiKey });
            await ai.models.generateContent({
                model: modelName,
                contents: 'test',
                config: { maxOutputTokens: 1 },
            });
        }
        return { success: true, message: 'Connection successful!' };

    } catch (error) {
        let errorMessage = 'An unknown error occurred.';
        if (error instanceof Error) {
            errorMessage = error.message;
             if (errorMessage.includes('API key not valid')) {
                errorMessage = "The provided API Key is invalid.";
            } else if (errorMessage.includes('fetch failed') || errorMessage.includes('Failed to fetch') || errorMessage.includes('CORS')) {
                 errorMessage = "Could not connect to the Base URL. Check the URL, network, and CORS policy.";
            } else if (errorMessage.includes('404')) {
                errorMessage = "Model not found. Please check the Model Name and Base URL.";
            }
        }
        return { success: false, message: errorMessage };
    }
}