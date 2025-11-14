# InsightReel Browser Plugin

A professional, AI-powered browser extension that analyzes videos directly from your browser. Detect any video, get instant summaries, translate subtitles, identify key moments, and ask questions—all without leaving the page.

## 🎯 Features

### Core Analysis Capabilities
- **📝 Summary**: AI-generated key points and takeaways
- **⚡ Key Moments**: Automatic highlight detection and timestamps
- **🌐 Translation**: Multi-language subtitle support
- **💬 Chat**: Context-aware questions and answers about video content

### Smart Video Detection
- YouTube videos
- Vimeo videos
- HTML5 video players
- Embedded iframe players
- Multiple videos per page

### Professional UI/UX
- Clean, minimal interface following enterprise design patterns
- Real-time processing feedback
- Responsive design for all screen sizes
- Bilingual interface (English & Chinese)
- Dark/light theme support (future)

## 📁 Project Structure

```
plugin/
├── manifest.json                    # Chrome Extension configuration
├── popup.html                       # Popup entry point
├── popup/
│   ├── index.tsx                   # React entry point
│   ├── App.tsx                     # Main popup component
│   ├── components/                 # UI components
│   │   ├── VideoSelector.tsx       # Video detection UI
│   │   ├── AnalysisPanel.tsx       # Analysis display
│   │   └── SettingsPanel.tsx       # Configuration
│   └── __tests__/
│       └── App.test.tsx            # Component tests
├── content/
│   ├── index.ts                    # Content script (video detection)
│   └── injector.ts                 # Sidebar injection logic
├── background/
│   └── index.ts                    # Service worker (processing)
├── injected/
│   └── sidebar.tsx                 # Embeddable sidebar component
├── shared/
│   └── types.ts                    # Shared TypeScript definitions
├── styles/
│   └── popup.css                   # Styling & design system
├── API_PROXY.md                    # API documentation
└── README.md                       # This file
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or pnpm
- Chrome browser (version 120+)

### Installation

1. **Clone and install dependencies:**
```bash
cd /path/to/insightreel
npm install
```

2. **Build the plugin:**
```bash
npm run build:plugin
```

3. **Load in Chrome:**
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top-right)
   - Click "Load unpacked"
   - Select the `dist/plugin/` folder

4. **Pin to toolbar:**
   - Click the puzzle icon
   - Find "InsightReel"
   - Click the pin icon

## 🛠️ Development

### Development Server

For development with hot reload:

```bash
# Terminal 1: Main app dev server
npm run dev

# Terminal 2: Watch plugin files (requires custom setup)
npx vite build --config plugin.vite.config.ts --watch
```

### Build for Production

```bash
npm run build:plugin
```

Output files: `dist/plugin/`

### Testing

```bash
# Run tests
npm test -- plugin

# Watch mode
npm test -- plugin --watch

# Coverage
npm test -- plugin --coverage
```

## 🔧 Configuration

### API Provider

The plugin supports multiple AI providers:

1. **Google Gemini** (Default)
   - Model: `gemini-2.0-flash`
   - Recommended for balanced speed/quality

2. **OpenAI**
   - Models: `gpt-4o`, `gpt-4-turbo`
   - Best for complex analysis

3. **Poe**
   - Multi-provider access
   - Custom model routing

### Settings

Configure via the plugin settings panel:

```typescript
{
  apiProvider: 'gemini' | 'openai' | 'poe',
  apiKey?: string,
  model: string,
  language: 'en' | 'zh',
  useProxy: boolean  // Recommended: true
}
```

## 📡 Architecture

### Communication Flow

```
Browser Page
     ↓
Content Script (Detects videos)
     ↓
Popup UI (User interface)
     ↓
Background Worker (Processes)
     ↓
Proxy API (Bridges to services)
     ↓
Main App Services (Video processing, AI)
```

### Video Detection Strategy

The plugin uses multiple detection methods:

1. **URL Analysis** (YouTube, Vimeo)
   - Parse URL parameters
   - Regex pattern matching

2. **DOM Queries** (HTML5 videos)
   - `<video>` element detection
   - `<source>` tag extraction

3. **Iframe Detection** (Embedded players)
   - Scan iframes for video hosts
   - Extract player URLs

## 🎨 Design System

### Colors
- **Primary**: `#059669` (Emerald green)
- **Background**: `#F5F5F7`
- **Surface**: `#FFFFFF`
- **Text**: `#111827`

### Typography
- **Font**: System fonts (-apple-system, system-ui, SF Pro Text)
- **Scale**: H3 (18px), Body (14px), Meta (12px)

### Components
- **Cards**: 20px border-radius, soft shadows
- **Buttons**: Pill-shaped (999px), smooth transitions
- **Icons**: Lucide React (line style)

### Animations
- **Duration**: 150-220ms
- **Easing**: `cubic-bezier(0.4, 0, 0.2, 1)`
- **GPU-accelerated**: transform, opacity only

## 📚 Documentation

### Main Guides
- [Browser Plugin Guide](../BROWSER_PLUGIN_GUIDE.md) - Overview and features
- [Plugin Implementation Guide](../PLUGIN_IMPLEMENTATION_GUIDE.md) - Architecture details
- [Plugin Integration Guide](../PLUGIN_INTEGRATION_WITH_EXISTING_SERVICES.md) - Service integration
- [API Proxy Documentation](./API_PROXY.md) - API endpoints

### Code Examples

**Content Script (Detect Videos):**
```typescript
const videoInfo = await chrome.tabs.sendMessage(tabId, {
  action: 'detectVideo'
});
// Returns: { hasVideo, videos, pageTitle, pageUrl }
```

**Start Analysis:**
```typescript
chrome.runtime.sendMessage({
  action: 'startProcessing',
  videoUrl: 'https://youtube.com/watch?v=...',
  analysisType: 'summary'
}, (response) => {
  console.log('Task ID:', response.taskId);
});
```

**Get Task Status:**
```typescript
chrome.runtime.sendMessage({
  action: 'getTaskStatus',
  taskId: 'task-123'
}, (task) => {
  if (task.status === 'completed') {
    console.log('Result:', task.result);
  }
});
```

## 🔐 Security & Privacy

### API Keys
- Stored locally in `chrome.storage.local`
- Never transmitted to third parties
- Optional: use proxy service without keys

### Video Data
- Video URLs only (not downloaded)
- Processed by main app services
- Subject to app privacy policy

### Permissions
- `activeTab`: Current tab detection
- `scripting`: Content script injection
- `storage`: Settings persistence
- `webRequest`: Request monitoring (optional)

## 🚢 Deployment

### Chrome Web Store

1. **Prepare for review:**
   ```bash
   npm run build:plugin
   # Create screenshot (1280x800)
   # Write description and privacy policy
   ```

2. **Package extension:**
   - Zip the `dist/plugin/` directory
   - Upload to Chrome Web Store Developer Dashboard

3. **Submission checklist:**
   - [ ] Screenshots and icons
   - [ ] Privacy policy
   - [ ] Detailed description
   - [ ] No tracking/analytics without consent
   - [ ] Secure API communication

### Version Management

Update version in `manifest.json`:
```json
{
  "version": "1.0.0"
}
```

## 🐛 Troubleshooting

### Video Not Detected
- Check if video is embedded in iframe
- Verify content script has permission for domain
- Inspect page with DevTools

### Analysis Fails
- Check API key in settings
- Verify proxy API is accessible
- Check browser console for errors

### Plugin Won't Load
- Clear browser cache
- Rebuild: `npm run build:plugin`
- Enable Developer mode in Chrome

### Slow Performance
- Check network speed
- Reduce video processing timeout
- Clear cache in chrome://extensions

## 📊 Performance Metrics

Target metrics:
- **Popup load**: < 500ms
- **Video detection**: < 200ms
- **Analysis start**: < 1s
- **Analysis complete**: 5-30s (depends on video length)

## 🔄 Browser Support

- ✅ Chrome 120+
- ✅ Edge 120+ (same engine)
- 🟡 Brave (requires manifest adjustment)
- 🟡 Firefox (requires manifest v2 compatibility)
- ❌ Safari (requires separate App Store setup)

## 📝 Changelog

### v1.0.0 (Initial Release)
- Video detection for YouTube, Vimeo, HTML5
- Analysis types: Summary, Key Moments, Translation
- Multi-language support (EN, ZH)
- API provider switching
- Settings panel

## 🤝 Contributing

When contributing to the plugin:

1. Follow existing code style
2. Use TypeScript for type safety
3. Add tests for new features
4. Update documentation
5. Test on multiple browsers

## 📄 License

Same as main InsightReel project.

## 🆘 Support

For issues or feature requests:
- GitHub Issues: [insightreel/issues](https://github.com/insightreel/issues)
- Email: support@insightreel.app
- Docs: https://docs.insightreel.app

## 🔗 Links

- **Main App**: https://insightreel.app
- **Chrome Web Store**: https://chrome.google.com/webstore/...
- **Documentation**: https://docs.insightreel.app
- **API Docs**: https://api.insightreel.app/docs

---

**Made with ❤️ by the InsightReel team**
