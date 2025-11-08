# InsightReel - Video Analysis Application

## Overview
InsightReel is a React-based web application that allows users to analyze videos using Google's Gemini AI. The app enables users to upload videos, generate transcripts, analyze content, and interact with an AI assistant about the video content.

**Current State**: Fully configured and running on Replit
**Last Updated**: November 7, 2025

## Core Features
- **Video Upload**: Support for MP4, WebM, OGG, and MOV formats
- **AI-Powered Analysis**: Uses Gemini API for video analysis and insights
- **Professional Subtitle Generation**: 
  - **Whisper API Integration** (Optional): Professional speech-to-text with 99+ language support
    - Note: Whisper API has a 25MB file size limit (automatically falls back to Gemini for larger files)
    - For files >25MB, uses Gemini with audio-only extraction (~1/10-1/20 original size)
  - **Streaming Generation**: Real-time subtitle display during generation
  - **Resilient Processing**: Auto-retry with exponential backoff, incremental saving
- **Subtitle Translation**: Translate subtitles to any language
- **Interactive Chat**: Chat with AI about video content
- **Local Storage**: All data stored locally using IndexedDB for privacy
- **Multi-language Support**: English and Chinese language options

## Technology Stack
- **Frontend**: React 19.2.0 + TypeScript
- **Build Tool**: Vite 6.2.0
- **Database**: IndexedDB (via idb library)
- **AI Service**: Google Gemini API (@google/genai)
- **Markdown Rendering**: marked library
- **Styling**: Tailwind CSS (CDN - should be replaced in production)

## Project Structure
```
.
├── components/          # React components
│   ├── AnalysisPanels.tsx
│   ├── ChatPanel.tsx
│   ├── FeedbackModal.tsx
│   ├── MarkdownRenderer.tsx
│   ├── NotesPanel.tsx
│   ├── SettingsModal.tsx
│   ├── Sidebar.tsx
│   ├── VideoDetail.tsx
│   └── WelcomeScreen.tsx
├── contexts/           # React contexts
│   └── LanguageContext.tsx
├── i18n/              # Internationalization
│   └── locales/
│       ├── en.ts
│       └── zh.ts
├── services/          # Core services
│   ├── dbService.ts   # IndexedDB operations
│   └── geminiService.ts # Gemini API integration
├── utils/             # Utility functions
│   └── helpers.ts
├── App.tsx            # Main application component
├── index.tsx          # Application entry point
├── types.ts           # TypeScript type definitions
└── vite.config.ts     # Vite configuration
```

## Environment Configuration

### Required Secrets
- **GEMINI_API_KEY**: Google Gemini API key (configured in Replit Secrets)
- **OPENAI_API_KEY** (Optional): OpenAI API key for Whisper subtitle generation
  - When configured, automatically uses Whisper API (faster, more accurate) for files ≤25MB
  - Falls back to Gemini for larger files or if API key not configured
  - Cost: $0.006/minute (vs ~$0.05/minute with Gemini)
  - Whisper API file limit: 25MB (OpenAI restriction)

### Development Server
- **Port**: 5000
- **Host**: 0.0.0.0
- **Hot Module Replacement**: Enabled on port 5000

## Replit Configuration

### Workflow
- **Name**: dev-server
- **Command**: npm run dev
- **Port**: 5000
- **Output**: webview

### Deployment Settings
- **Target**: autoscale (for stateless web apps)
- **Build**: npm run build
- **Run**: npm run preview

## Development Notes

### API Key Configuration
The application loads the Gemini API key in the following order:
1. User settings stored in IndexedDB
2. System environment variable (GEMINI_API_KEY)

Users can configure custom API endpoints and models through the Settings modal.

### Data Storage
All user data is stored locally in IndexedDB:
- **videos**: Video metadata
- **subtitles**: Generated transcripts
- **analyses**: AI-generated analysis results
- **notes**: User notes for videos
- **settings**: API configuration and preferences

### Privacy
All video processing happens locally in the browser. Only the necessary data (frames/transcripts) is sent to the Gemini API for analysis.

## Known Issues & Improvements

### Production Recommendations
1. **Tailwind CSS**: Currently using CDN version. Should install as a PostCSS plugin for production.
2. **Error Handling**: Enhanced error handling for API failures
3. **File Size Limits**: Consider implementing file size validation for large videos
4. **Browser Compatibility**: Tested on modern browsers; may need polyfills for older browsers

## User Preferences
None configured yet.

## Recent Changes
- **2025-11-08**: Major subtitle generation improvements
  - Integrated OpenAI Whisper API for professional speech-to-text
    - 10x faster than LLM-based transcription
    - 6.6% WER accuracy (vs ~15% with Gemini)
    - Supports 99+ languages
  - Implemented streaming subtitle generation with real-time display
  - Added resilient processing with auto-retry and exponential backoff
  - Implemented incremental saving during streaming (saves partial results)
  - Eliminated video size limits by extracting audio-only
  - Created proxy endpoints for secure Whisper API access
  - Updated UI to show progress, streaming content, and Whisper status
  - Created resilientService.ts for retry logic and error handling
  - Created whisperService.ts for Whisper API integration


- **2025-11-07**: Mobile sidebar readability improvement
  - Increased sidebar background opacity from bg-white/40 to bg-white/90
  - Text is now much more readable on mobile devices
  - Maintains backdrop blur for premium visual effect

- **2025-11-07**: Complete gradient background unification
  - Fixed critical layout issue causing color break between main content and Footer
  - Moved gradient background from <body> to React root container (App.tsx)
  - Changed from h-screen to min-h-screen to allow natural page flow
  - Restored overflow-y-auto to main element to enable sticky positioning for video and key moments
  - Result: seamless gradient from top to bottom, with proper sticky behavior for video player and analysis panels
  - Now entire application shares one continuous gradient background

- **2025-11-07**: Welcome screen complete color unification
  - Achieved seamless gradient integration with ultra-transparent overlays
  - Upload area: reduced to bg-white/5 (from bg-white/30) for near-invisible blend
  - Upload area border: changed to border-white/20 for soft, barely-visible outline
  - Upload icon: completely transparent background (bg-transparent) with subtle hover
  - Secondary button: replaced solid bg-white with transparent bg-slate-900/5
  - Feature card icon: removed all backgrounds/borders for natural flow
  - Result: zero visual breaks, complete harmony from top to bottom

- **2025-11-07**: Welcome screen redesign
  - Completely refactored WelcomeScreen component with minimalist, premium design
  - Maintained gradient background (bg-gradient-to-br from-slate-50 to-slate-200)
  - Increased white space and improved visual hierarchy
  - Enhanced upload area with subtle hover and drag interactions
  - Improved button design with primary/secondary distinction
  - Removed debug panel code for cleaner production-ready UI
  - Maintained full drag-and-drop and folder upload functionality

- **2025-11-07**: Footer and scrollbar improvements
  - Added global Footer component with TLDW attribution, author info, and feedback form
  - Adjusted Footer styling to blend seamlessly with gradient background
  - Modified global scrollbar styles to only show color on hover/scroll
  - Enhanced `.custom-scrollbar` class for sidebar and chat input to completely hide scrollbars
  - Fixed chat input send button vertical centering issue
  - Fixed Vercel environment variable issue with explicit define in vite.config.ts
  - Created .env.example template for environment variables
  - Updated VERCEL_DEPLOYMENT.md with deployment troubleshooting

- **2025-11-07**: Initial Replit setup
  - Configured Vite to run on port 5000
  - Set up dev-server workflow
  - Configured deployment settings
  - Added GEMINI_API_KEY secret
