# Browser Plugin Implementation Guide

## Overview

This guide explains the architecture and implementation details of the InsightReel browser plugin, which provides video analysis capabilities directly integrated into web browsers.

## Project Structure

```
plugin/
├── manifest.json                # Chrome Extension manifest
├── popup.html                   # Popup UI template
├── content/
│   ├── index.ts                # Main content script (video detection)
│   └── injector.ts             # Sidebar injection logic
├── popup/
│   ├── index.tsx               # React entry point
│   ├── App.tsx                 # Main popup component
│   └── components/
│       ├── VideoSelector.tsx   # Video selection UI
│       ├── AnalysisPanel.tsx   # Analysis display
│       └── SettingsPanel.tsx   # Settings configuration
├── injected/
│   └── sidebar.tsx             # Injected sidebar component
├── background/
│   └── index.ts                # Service worker script
├── shared/
│   └── types.ts                # Shared TypeScript types
└── styles/
    └── popup.css               # Tailwind + custom styles
```

## Component Architecture

### 1. Content Script (`content/index.ts`)

**Responsibilities:**
- Detects videos on the current webpage
- Communicates with popup via `chrome.runtime.sendMessage`
- Supports multiple video sources

**Video Detection Strategy:**
```typescript
1. YouTube Detection
   - Checks URL parameters for video ID
   - Returns YouTube video URL

2. Vimeo Detection
   - Regex matches on pathname
   - Returns Vimeo video URL

3. HTML5 Video Detection
   - Queries <video> elements
   - Extracts <source> tags
   - Returns video URLs and types

4. Iframe Detection
   - Scans for embedded players
   - Identifies YouTube/Vimeo iframes
   - Returns iframe source URLs
```

**Key Methods:**
- `detectYouTubeVideo()` - Detects YouTube videos
- `detectVimeoVideo()` - Detects Vimeo videos
- `detectHTML5Videos()` - Detects HTML5 video elements
- `detectIframeVideos()` - Detects embedded players
- `getPageVideoInfo()` - Aggregates all detected videos

### 2. Popup UI (`popup/`)

**Main App Component (`App.tsx`):**
- Manages overall UI state (view, loading, error)
- Calls content script to detect videos
- Routes between main, analysis, and settings views

**Views:**

a) **Main View**
   - Displays list of detected videos
   - Shows video provider and duration
   - Entry point to analysis

b) **Analysis View**
   - Shows analysis options (Summary, Key Moments, Translate, Chat)
   - Displays real-time analysis results
   - Status indicators (pending, processing, completed, error)

c) **Settings View**
   - API provider selection (Gemini, OpenAI, Poe)
   - API key configuration
   - Model selection
   - Language preference

**Component Hierarchy:**
```
App
├── Header (Logo + Navigation)
├── Content Area
│   ├── VideoSelector (Main view)
│   ├── AnalysisPanel (Analysis view)
│   └── SettingsPanel (Settings view)
└── Footer (Settings button)
```

### 3. Background Service Worker (`background/index.ts`)

**Responsibilities:**
- Handles video processing requests
- Communicates with proxy API
- Manages task queue and status tracking
- Stores settings in `chrome.storage.local`

**Key Functions:**
- `processVideoAnalysis()` - Calls proxy API
- `getPluginSettings()` - Retrieves stored settings
- Message listeners for popup communication

**Message Handlers:**
```typescript
'startProcessing' - Initiates analysis task
'getTaskStatus' - Checks task completion status
```

### 4. Sidebar Component (`injected/sidebar.tsx`)

**Features:**
- Can be injected directly into webpages
- Collapsible interface
- Independent from popup
- Real-time analysis results

**Usage:**
```typescript
// Can be injected via content script
injectSidebar()

// Creates floating button
createFloatingButton()
```

## Communication Flow

### User Clicks Plugin Icon → Analysis Result

```
1. User clicks plugin icon
   ↓
2. popup/App.tsx loads
   ↓
3. App calls chrome.tabs.sendMessage() to content script
   ↓
4. content/index.ts receives message
   ↓
5. Content script runs video detection
   ↓
6. Returns VideoInfo to popup
   ↓
7. Popup displays detected videos
   ↓
8. User selects video
   ↓
9. Popup calls chrome.runtime.sendMessage() to background
   ↓
10. background/index.ts receives 'startProcessing'
    ↓
11. Background script calls proxy API
    ↓
12. Awaits response
    ↓
13. Returns result to popup
    ↓
14. Popup displays analysis results
```

### Message Format

**Content Script ← → Popup:**
```typescript
// Detect video request
{
  action: 'detectVideo'
}

// Video info response
{
  hasVideo: boolean,
  videos: VideoSource[],
  pageTitle: string,
  pageUrl: string
}
```

**Popup ← → Background:**
```typescript
// Start processing
{
  action: 'startProcessing',
  videoUrl: string,
  analysisType: 'summary' | 'key-moments' | 'translation' | 'chat'
}

// Task status request
{
  action: 'getTaskStatus',
  taskId: string
}

// Task status response
{
  id: string,
  status: 'pending' | 'processing' | 'completed' | 'error',
  result?: string,
  error?: string
}
```

## Styling & Design System

### Color Palette
```css
--brand-primary: #059669 (Emerald green)
--brand-primary-dark: #047857
--brand-primary-soft: #ECFDF3
--bg-page: #F5F5F7 (Light gray background)
--bg-surface: #FFFFFF (Card background)
--text-main: #111827 (Primary text)
--text-muted: #6B7280 (Secondary text)
--text-light: #9CA3AF (Tertiary text)
```

### Typography
```
H1 (Hero): 32-36px, weight 600
H2 (Section): 24px, weight 600
H3 (Card): 18px, weight 500
Body (Text): 14px, line-height 1.6
Meta (Small): 11-12px
```

### Component Styling

**Cards:**
```css
border-radius: 20px
border: 1px solid #E5E7EB
background: #FFFFFF
box-shadow: 0 18px 45px rgba(15, 23, 42, 0.06)
padding: 16-24px
```

**Buttons:**
```css
Primary:
  - background: #059669
  - border-radius: 999px (pill)
  - height: 36-40px
  - hover: #047857

Secondary:
  - background: #ECFDF3
  - border: 1px solid #E5E7EB
  - border-radius: 8px
```

**Icons:**
- Library: Lucide React
- Size: 16px (nav), 20-24px (cards)
- Style: Line icons (outline)

### Animation Guidelines

**Transitions:**
- Duration: 150-220ms
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)`
- Properties: `transform` and `opacity` only

**Hover Effects:**
```css
Button:
  - transform: scale(1.02)
  - Transitions: 150ms

Card:
  - transform: translateY(-2px)
  - box-shadow enhancement
  - Transitions: 150ms
```

## Data Storage

### Chrome Storage
Settings stored in `chrome.storage.local`:
```typescript
{
  pluginSettings: {
    apiProvider: 'gemini' | 'openai' | 'poe',
    apiKey?: string,
    model: string,
    language: 'en' | 'zh',
    useProxy?: boolean
  },
  analysisCache?: {
    [key: string]: AnalysisResult
  }
}
```

### IndexedDB (Future)
For larger cache storage:
- Video analysis results
- Subtitle cache
- User notes
- Video bookmarks

## API Integration

### Proxy API Endpoint
```
POST https://api.insightreel.app/api/analyze-video
```

### Request Payload
```json
{
  "videoUrl": "https://youtube.com/watch?v=...",
  "analysisType": "summary",
  "provider": "gemini",
  "model": "gemini-2.0-flash",
  "language": "en"
}
```

### Response Format
```json
{
  "success": true,
  "result": "Generated analysis content...",
  "provider": "gemini",
  "processingTime": 2500
}
```

## Building & Deployment

### Build Command
```bash
npm run build:plugin
```

### Output Files
- `dist/plugin/manifest.json`
- `dist/plugin/content.js`
- `dist/plugin/background.js`
- `dist/plugin/popup.html`
- `dist/plugin/popup.js`
- `dist/plugin/styles/popup.css`

### Installation for Testing

1. Build the plugin:
   ```bash
   npm run build:plugin
   ```

2. Open `chrome://extensions/`

3. Enable "Developer mode"

4. Click "Load unpacked"

5. Select `dist/plugin/` directory

6. Pin extension to toolbar

## Development Workflow

### Adding New Analysis Type

1. **Update Types** (`plugin/shared/types.ts`):
   ```typescript
   export type AnalysisType = 'summary' | 'key-moments' | 'translation' | 'chat' | 'newType';
   ```

2. **Add UI** (`popup/components/AnalysisPanel.tsx`):
   ```typescript
   const analysisOptions = [
     // ... existing
     {
       id: 'newType',
       label: 'New Type',
       icon: <Icon />,
       description: 'Description'
     }
   ];
   ```

3. **Handle Processing** (`background/index.ts`):
   ```typescript
   // Add case in processVideoAnalysis or in the message handler
   ```

### Extending Video Detection

1. Create detection function in `content/index.ts`:
   ```typescript
   function detectNewPlatform(): VideoSource | null {
     // Detection logic
   }
   ```

2. Call in `getPageVideoInfo()`:
   ```typescript
   const newPlatformVideos = detectNewPlatform();
   if (newPlatformVideos) videos.push(newPlatformVideos);
   ```

3. Add icon in `VideoSelector.tsx`:
   ```typescript
   const providerIcons = {
     // ...
     newPlatform: <NewIcon className="w-4 h-4" />
   };
   ```

## Troubleshooting

### Common Issues

1. **Content Script Not Running**
   - Check manifest permissions
   - Verify page URL matches host_permissions
   - Check browser console for errors

2. **Video Not Detected**
   - Verify video element structure
   - Check iframe cross-origin policies
   - Test with different video platforms

3. **API Errors**
   - Validate API key in settings
   - Check proxy URL accessibility
   - Verify network connectivity

4. **UI Not Rendering**
   - Clear browser cache
   - Rebuild with `npm run build:plugin`
   - Check React DevTools

## Performance Considerations

### Optimization Tips

1. **Lazy Load Components**
   - Use code splitting for analysis types
   - Load settings only when needed

2. **Cache Results**
   - Store analysis in `chrome.storage`
   - Implement LRU cache for frequent queries

3. **Batch Requests**
   - Group multiple analyses
   - Debounce rapid requests

4. **Memory Management**
   - Clear old cache entries
   - Limit concurrent processes

## Security Considerations

### API Key Management
- Never log API keys
- Store only in `chrome.storage.local`
- Use HTTPS for all communications
- Validate API responses

### Content Security Policy
```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'"
}
```

### Cross-Origin Requests
- Use proxy API for CORS issues
- Validate response origins
- Sanitize external data

## Future Enhancements

- [ ] Offline analysis with cached models
- [ ] Batch processing for multiple videos
- [ ] Keyboard shortcuts
- [ ] Context menu integration
- [ ] Video bookmarking
- [ ] Transcript search
- [ ] Dark mode support
- [ ] Multiple language subtitle generation
- [ ] Custom hotkeys
- [ ] Export functionality

## Support & Maintenance

### Monitoring
- Check error logs via `chrome://extensions/errors`
- Monitor API response times
- Track user settings preferences

### Updates
- Push minor updates via Chrome Web Store
- Maintain backward compatibility
- Test on multiple Chrome versions

### User Feedback
- Collect via feedback modal
- Track common issues
- Prioritize feature requests
