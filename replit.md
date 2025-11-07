# InsightReel - Video Analysis Application

## Overview
InsightReel is a React-based web application that allows users to analyze videos using Google's Gemini AI. The app enables users to upload videos, generate transcripts, analyze content, and interact with an AI assistant about the video content.

**Current State**: Fully configured and running on Replit
**Last Updated**: November 7, 2025

## Core Features
- **Video Upload**: Support for MP4, WebM, OGG, and MOV formats
- **AI-Powered Analysis**: Uses Gemini API for video analysis and insights
- **Subtitle Generation**: Automatic transcript generation from video content
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
- **2025-11-07**: Footer and scrollbar improvements
  - Added global Footer component with TLDW attribution, author info, and feedback form
  - Modified global scrollbar styles to only show color on hover/scroll
  - Fixed Vercel environment variable issue with explicit define in vite.config.ts
  - Created .env.example template for environment variables
  - Updated VERCEL_DEPLOYMENT.md with deployment troubleshooting

- **2025-11-07**: Initial Replit setup
  - Configured Vite to run on port 5000
  - Set up dev-server workflow
  - Configured deployment settings
  - Added GEMINI_API_KEY secret
