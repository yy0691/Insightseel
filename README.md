<div align="center">

# Insightseel

**Turn any video into actionable insight** — AI-powered subtitles, translation, summaries, and chat for any video source.

English | [简体中文](./README.zh-CN.md)

</div>

---

## Features

- **Subtitle generation** — Deepgram speech-to-text or Gemini/OpenAI vision for any language
- **Translation** — Translate subtitles to Simplified Chinese, Traditional Chinese, or English with natural phrasing
- **AI Insights** — One-click summary, key information extraction, topic analysis
- **Chat with video** — Ask anything about the video; AI uses transcript + insights as context
- **Subtitle overlay** — Draggable, customisable overlay on the video player with fullscreen support
- **Picture-in-Picture** — Float video over other apps with subtitle overlay (Document PiP, Chrome 116+)
- **Recording** — Capture screen audio, microphone, or both and auto-transcribe
- **YouTube / Bilibili import** — Paste a URL to import captions directly
- **Cloud sync** — Optional Supabase backend for multi-device sync

---

## Quick Start (Local Dev)

**Prerequisites:** Node.js 18+, pnpm (or npm)

```bash
# 1. Install dependencies
pnpm install

# 2. Copy the example env file
cp .env.example .env.local

# 3. Fill in at minimum:
#   LLM_API_KEY=your_gemini_or_openai_key
#   VITE_DEEPGRAM_API_KEY=your_deepgram_key

# 4. Start dev server
pnpm dev
```

Open http://localhost:5173 and drag a video file onto the page.

---

## Environment Variables

All variables are set in `.env.local` (local dev) or **Vercel → Project Settings → Environment Variables** (production).

### LLM — AI text generation (summaries, insights, translation, chat)

| Variable | Required | Description |
|---|---|---|
| `LLM_API_KEY` | **Yes** | API key for your LLM provider (Gemini, OpenAI, or compatible) |
| `LLM_BASE_URL` | No | Base URL of the LLM API. Defaults to Gemini if omitted. |
| `LLM_MODEL` | No | Model name. Defaults to `gemini-2.5-flash`. |
| `VITE_USE_PROXY` | **Yes** (Vercel) | Set to `true` to route all LLM calls through `/api/proxy` (keeps your key server-side) |

**How to get an API key:**

- **Gemini (recommended):** https://aistudio.google.com/app/apikey — free tier available, no credit card required
- **OpenAI:** https://platform.openai.com/api-keys — pay-as-you-go pricing
- **OpenRouter (multi-model gateway):** https://openrouter.ai/keys — set `LLM_BASE_URL=https://openrouter.ai/api/v1`

**Common `LLM_BASE_URL` values:**

```
# Gemini (default — omit LLM_BASE_URL or set to):
https://generativelanguage.googleapis.com

# OpenAI:
https://api.openai.com/v1

# OpenRouter:
https://openrouter.ai/api/v1

# Local Ollama:
http://localhost:11434/v1
```

---

### Speech-to-Text — subtitle generation

| Variable | Required | Description |
|---|---|---|
| `VITE_DEEPGRAM_API_KEY` | **Yes** | Deepgram API key for audio transcription |

**How to get a Deepgram key:**  
1. Sign up at https://deepgram.com — **$200 free credit** on sign-up, no credit card required initially  
2. Go to **Console → API Keys → Create Key**  
3. Copy the key and set `VITE_DEEPGRAM_API_KEY`

Deepgram handles large audio files automatically. For very long videos (>60 min), audio is split into ≤3.5 MB chunks and transcribed in parallel.

---

### Cloud Sync — Supabase (optional)

Enables cross-device sync of subtitles, analyses, and chat history.

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | No | Supabase project URL (`https://xxxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | No | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Service role key — if set, enforces JWT auth on `/api/proxy` (recommended for shared deployments) |

**How to set up Supabase:**  
1. Create a free project at https://supabase.com  
2. Go to **Project Settings → API** and copy **Project URL** and **anon/public key**  
3. For auth gating, also copy the **service_role key** (keep this server-side only — never expose it to the browser)  
4. Run the database migrations in `/supabase/migrations/` (if any)

When `SUPABASE_SERVICE_ROLE_KEY` is set, the proxy requires a valid Supabase JWT. Users must log in to use the system API key; otherwise they configure their own key in Settings.

---

### Advanced / Optional

| Variable | Description |
|---|---|
| `VITE_MODEL` | Model name shown in the Settings UI (cosmetic only) |
| `VITE_FFMPEG_BASE_URL` | CDN URL for FFmpeg WASM (used for video segmentation). Self-hosted at `/ffmpeg` by default via `postinstall` script. |
| `GEMINI_API_KEY` | Legacy — falls back from `LLM_API_KEY` |
| `OPENAI_API_KEY` | Legacy — falls back from `LLM_API_KEY`; also used for OpenAI Whisper transcription |
| `CUSTOM_API_KEY` | Legacy — falls back from `LLM_API_KEY` |

---

## Deploy to Vercel

1. Push the repo to GitHub  
2. Import into Vercel: https://vercel.com/new  
3. Set environment variables in **Project Settings → Environment Variables**:

```
LLM_API_KEY          = your_gemini_or_openai_key
LLM_BASE_URL         = https://generativelanguage.googleapis.com   # or your provider
LLM_MODEL            = gemini-2.5-flash
VITE_USE_PROXY       = true
VITE_DEEPGRAM_API_KEY = your_deepgram_key

# Optional (cloud sync):
VITE_SUPABASE_URL       = https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY  = eyJ...
SUPABASE_SERVICE_ROLE_KEY = eyJ...  # enables auth gating
```

4. Deploy — Vercel auto-detects Vite and deploys the serverless functions in `/api/`

---

## Multi-Provider LLM

The app auto-routes requests based on `LLM_BASE_URL`:

| URL contains | Format used |
|---|---|
| `generativelanguage.googleapis.com` | Gemini API |
| anything else | OpenAI-compatible API |

This means you can use **OpenRouter, Azure OpenAI, Ollama, Together AI, Groq**, or any OpenAI-compatible API by setting `LLM_BASE_URL` accordingly.

---

## Architecture

```
Browser (React + Vite)
  ├── IndexedDB — videos, subtitles, analyses, notes, chat history
  ├── /api/proxy (Vercel serverless) — LLM calls (Gemini / OpenAI format)
  ├── /api/deepgram-proxy — Deepgram transcription
  ├── /api/youtube-captions — YouTube caption import (InnerTube API)
  └── Supabase (optional) — auth + cloud sync
```

---

## Development

```bash
pnpm dev          # start dev server with API proxy
pnpm build        # production build
pnpm typecheck    # TypeScript check
pnpm lint         # ESLint
pnpm test         # Vitest unit tests
```
