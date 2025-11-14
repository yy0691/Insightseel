# InsightReel Browser Plugin

A professional AI-powered browser plugin for analyzing videos directly from your browser. Get summaries, translated subtitles, key moments, and ask questions—all without leaving the page.

## Features

✨ **Intelligent Video Detection**
- Automatically detects videos on YouTube, Vimeo, and any HTML5 video
- Supports multiple videos per page
- Works with embedded players

🎯 **Core Analysis**
- **Summary**: AI-generated key points from video content
- **Key Moments**: Identifies important highlights and scenes
- **Translation**: Multi-language subtitle support
- **Chat**: Ask questions about video content with context-aware answers

🔧 **Configuration**
- Support for multiple AI providers (Gemini, OpenAI, Poe)
- Bilingual interface (English & Chinese)
- Flexible API key management
- Proxy API support for CORS compatibility

## Architecture

### Directory Structure

```
plugin/
├── manifest.json              # Plugin configuration
├── popup.html                 # Popup UI entry point
├── content/
│   └── index.ts              # Content script (page detection)
├── popup/
│   ├── index.tsx             # React entry point
│   ├── App.tsx               # Main popup component
│   └── components/
│       ├── VideoSelector.tsx  # Video detection UI
│       ├── AnalysisPanel.tsx  # Analysis display
│       └── SettingsPanel.tsx  # Configuration UI
├── background/
│   └── index.ts              # Service worker (processing)
├── shared/
│   └── types.ts              # Shared type definitions
└── styles/
    └── popup.css             # Styling with design system
```

### Key Components

1. **Content Script** (`content/index.ts`)
   - Runs on every page
   - Detects videos using multiple strategies
   - Communicates with popup via `chrome.runtime.sendMessage`
   - Supports: YouTube, Vimeo, HTML5 video, iframes

2. **Popup UI** (`popup/`)
   - React-based responsive interface
   - Video selector for multiple videos
   - Analysis panel with real-time processing feedback
   - Settings management
   - Adheres to professional design system

3. **Background Service Worker** (`background/index.ts`)
   - Handles video analysis requests
   - Communicates with proxy API
   - Manages async processing with task tracking
   - Updates popup with results

## Design System

The plugin follows the professional InsightReel design system:

### Colors
- **Primary**: `#059669` (Emerald green)
- **Background**: `#F5F5F7` (Light gray)
- **Surface**: `#FFFFFF` (White)
- **Text**: `#111827` (Dark)

### Typography
- Font: System fonts (-apple-system, system-ui, SF Pro Text)
- Scale: H3 (18px), Body (14px), Meta (12px)

### Components
- Rounded corners: `20px` (card style)
- Shadows: Soft shadow with opacity `0.06`
- Icons: Lucide React (line icons)

### Animation
- Duration: 150-220ms
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)`
- Properties: Only `transform` and `opacity`

## Building the Plugin

### Requirements
- Node.js 18+
- npm or pnpm
- TypeScript 5.8+

### Build Steps

```bash
# Install dependencies (from main project)
npm install

# Build plugin with Vite
npm run build:plugin

# Or manually with Vite
vite build --config plugin.vite.config.ts
```

### Output
Generated files in `dist/plugin/`:
- `manifest.json` - Unchanged from source
- `content.js` - Compiled content script
- `background.js` - Compiled service worker
- `popup.html` - HTML entry point
- `popup.js` - React popup bundle
- `styles/popup.css` - Compiled styles

## Installation

### Development (Local Testing)

1. Build the plugin:
   ```bash
   npm run build:plugin
   ```

2. Open Chrome Extensions:
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (toggle top-right)

3. Load unpacked:
   - Click "Load unpacked"
   - Select `dist/plugin/` folder

### Distribution (Chrome Web Store)

1. Create a `.crx` file using Chrome
2. Submit to Chrome Web Store

## API Integration

The plugin connects to the InsightReel proxy API for video analysis:

```
POST https://api.insightreel.app/api/analyze-video
```

### Request Body
```json
{
  "videoUrl": "https://youtube.com/watch?v=...",
  "analysisType": "summary|key-moments|translation|chat",
  "provider": "gemini|openai|poe",
  "model": "gemini-2.0-flash",
  "language": "en|zh"
}
```

### Headers
```
X-API-Key: your-api-key (optional, uses proxy if not provided)
Content-Type: application/json
```

## Configuration

Settings are stored in `chrome.storage.local`:

```typescript
interface PluginSettings {
  apiProvider: 'gemini' | 'openai' | 'poe' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  model: string;
  language: 'en' | 'zh';
  useProxy?: boolean;
}
```

Users can configure in the plugin settings panel:
- Select AI provider
- Enter API key (or use proxy)
- Choose model
- Set interface language

## Development Workflow

### Adding New Analysis Types

1. Update `AnalysisType` in `shared/types.ts`
2. Add analysis option to `analysisOptions` array in `AnalysisPanel.tsx`
3. Handle in background worker processing logic

### Extending Video Detection

1. Add detection function in `content/index.ts`
2. Update `getPageVideoInfo()` to include new provider
3. Add icon in `VideoSelector.tsx` if needed

### Styling

- Use Tailwind CSS classes from `plugin/styles/popup.css`
- Maintain consistency with design system colors
- Follow animation guidelines for micro-interactions

## Troubleshooting

### Video Not Detected
- Ensure content script has permission for the page
- Check if video is in iframe (cross-origin restrictions apply)
- Verify video element is properly structured

### API Errors
- Check API key is valid in settings
- Verify proxy API is accessible
- Check browser console for detailed error messages

### CORS Issues
- Enable "Use Proxy API" in settings
- Ensure proxy server has proper CORS headers
- Test API endpoint directly

## Future Enhancements

- [ ] Offline mode with IndexedDB caching
- [ ] Batch analysis for multiple videos
- [ ] Video timestamp bookmarking
- [ ] Export analysis to various formats
- [ ] Multi-language subtitle generation
- [ ] Custom hotkeys for quick analysis
- [ ] Dark mode support
- [ ] Advanced search within video transcripts

## Contributing

When contributing to the plugin:

1. Follow the existing code style and structure
2. Use TypeScript for type safety
3. Maintain design system consistency
4. Test on multiple browsers
5. Update this documentation

## License

Same as main InsightReel project.
