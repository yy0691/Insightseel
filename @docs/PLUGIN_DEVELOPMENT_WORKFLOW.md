# Browser Plugin Development Workflow

Complete guide for developing, testing, and deploying the InsightReel browser plugin.

## Table of Contents
1. [Setup](#setup)
2. [Development](#development)
3. [Testing](#testing)
4. [Building](#building)
5. [Deployment](#deployment)
6. [Debugging](#debugging)
7. [CI/CD](#cicd)

## Setup

### Initial Setup

```bash
# Clone repository
git clone https://github.com/insightreel/insightreel.git
cd insightreel

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Configure environment variables
# Add: VITE_PLUGIN_API_URL=https://api.insightreel.app (or your proxy URL)
```

### Directory Structure for Development

```
insightreel/
├── plugin/                  # Plugin source
│   ├── manifest.json       # Extension config
│   ├── content/            # Content scripts
│   ├── popup/              # React popup UI
│   ├── background/         # Service worker
│   └── ...
├── dist/plugin/            # Built plugin (gitignored)
└── plugin.vite.config.ts   # Build config
```

## Development

### Development Commands

```bash
# Build plugin once
npm run build:plugin

# Watch mode (requires npm script)
npm run build:plugin -- --watch

# Development with hot reload (separate terminals)
# Terminal 1: Watch main app
npm run dev

# Terminal 2: Watch plugin
npm run build:plugin -- --watch
```

### Project Structure

```
plugin/
├── manifest.json              # v3 manifest configuration
│   ├── Permissions & host permissions
│   ├── Content script configuration
│   ├── Background service worker
│   └── Popup HTML entry point
│
├── content/
│   ├── index.ts              # Main content script
│   │   ├── Video detection (YouTube, Vimeo, HTML5)
│   │   ├── Message listeners
│   │   └── Window/DOM queries
│   │
│   └── injector.ts           # Optional UI injection
│       ├── Sidebar creation
│       └── Floating button
│
├── popup/
│   ├── index.tsx             # React entry point
│   ├── App.tsx               # Main component
│   │   ├── State management
│   │   ├── Tab communication
│   │   └── View routing
│   │
│   ├── components/
│   │   ├── VideoSelector.tsx  # Video list UI
│   │   ├── AnalysisPanel.tsx  # Analysis results
│   │   └── SettingsPanel.tsx  # Config UI
│   │
│   └── __tests__/
│       └── App.test.tsx       # Component tests
│
├── background/
│   └── index.ts              # Service worker
│       ├── Message handlers
│       ├── API communication
│       ├── Task queue management
│       └── Settings storage
│
├── shared/
│   └── types.ts              # TypeScript interfaces
│
├── styles/
│   └── popup.css             # Design system styles
│
├── assets/
│   └── icons.svg             # Plugin icons
│
└── API_PROXY.md              # API documentation
```

### File-by-File Development Guide

#### manifest.json
- Update version for releases
- Add new permissions if features require
- Update content script matches for new domains

**Example permission change:**
```json
{
  "host_permissions": [
    "<all_urls>",
    "https://example.com/*"
  ]
}
```

#### content/index.ts
- Handles video detection on webpages
- Communicates via `chrome.runtime.sendMessage`
- Should be lightweight (minimize CPU impact)

**Adding new video platform:**
```typescript
function detectNewPlatform(): VideoSource | null {
  // Detection logic
  if (condition) {
    return {
      url: videoUrl,
      provider: 'newplatform',
      type: 'video/mp4',
      title: videoTitle
    };
  }
  return null;
}

// Add to getPageVideoInfo()
const newVideos = detectNewPlatform();
if (newVideos) videos.push(newVideos);
```

#### popup/App.tsx
- Main state management
- View routing (main/analysis/settings)
- Error handling

**Key states:**
```typescript
const [view, setView] = useState<'main' | 'analysis' | 'settings'>('main');
const [videoInfo, setVideoInfo] = useState<PageVideoInfo | null>(null);
const [selectedVideo, setSelectedVideo] = useState<SelectedVideo | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
```

#### background/index.ts
- Long-running service worker
- Handles async processing
- Manages Chrome storage

**Lifecycle:**
```typescript
// Initialization
chrome.runtime.onInstalled.addListener(() => {
  // Set default settings
});

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startProcessing') {
    processVideoAnalysis(message)
      .then(sendResponse)
      .catch(error => sendResponse({ error }));
    return true; // Keep channel open for async response
  }
});
```

### Styling Development

The plugin uses Tailwind CSS with a custom design system.

**Tailwind classes used:**
- Colors: `emerald-*`, `gray-*`, `blue-*`, etc.
- Sizing: `w-*`, `h-*`, `p-*`, `m-*`
- Layout: `flex`, `grid`, `space-*`
- Effects: `rounded-*`, `shadow-*`, `border-*`

**Custom CSS in popup.css:**
```css
:root {
  --brand-primary: #059669;
  --bg-page: #F5F5F7;
  /* etc */
}
```

## Testing

### Unit Tests

```bash
# Run all tests
npm test -- plugin

# Run specific test file
npm test -- plugin/popup/__tests__/App.test.tsx

# Watch mode
npm test -- plugin --watch

# Coverage report
npm test -- plugin --coverage
```

### Writing Tests

**Example test structure:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';

describe('App Component', () => {
  beforeEach(() => {
    // Setup mocks
    vi.clearAllMocks();
  });

  it('renders correctly', () => {
    render(<App />);
    expect(screen.getByText('InsightReel')).toBeDefined();
  });

  it('detects videos', async () => {
    // Test video detection
  });
});
```

### Integration Testing

```typescript
// Test Chrome API integration
const chromeMock = {
  tabs: {
    query: vi.fn().mockResolvedValue([{ id: 1 }]),
    sendMessage: vi.fn().mockResolvedValue({
      hasVideo: true,
      videos: [{ /* video data */ }]
    })
  }
};

global.chrome = chromeMock as any;
```

### Manual Testing

1. **Load plugin:**
   ```bash
   npm run build:plugin
   # chrome://extensions/ → Load unpacked → dist/plugin/
   ```

2. **Test video detection:**
   - Visit YouTube video page
   - Click plugin icon
   - Verify video is detected

3. **Test analysis:**
   - Select video
   - Click analysis button
   - Monitor browser console for errors

4. **Test settings:**
   - Open settings panel
   - Change API provider
   - Verify settings save

## Building

### Build Process

```bash
# Development build
npm run build:plugin

# Production build (minified)
npm run build:plugin -- --mode production
```

### Build Output

```
dist/plugin/
├── manifest.json
├── content.js
├── background.js
├── popup.html
├── popup.js
├── styles/
│   └── popup.css
└── assets/
    └── icons.svg
```

### Build Optimization

**Size targets:**
- Total: < 500KB
- Content script: < 50KB
- Popup bundle: < 200KB
- Background script: < 50KB

**Optimization techniques:**
- Code splitting (Vite)
- Tree-shaking unused code
- Minification & compression
- Lazy loading components

## Deployment

### Local Testing

```bash
# Build plugin
npm run build:plugin

# Load in Chrome
# 1. chrome://extensions/
# 2. Enable "Developer mode"
# 3. "Load unpacked" → select dist/plugin/
```

### Chrome Web Store Submission

**Preparation:**
```bash
# Create ZIP for submission
cd dist
zip -r ../insightreel-plugin.zip plugin/
```

**Required assets:**
- Icon: 128x128 PNG
- Screenshots: 1280x800 PNG (up to 5)
- Privacy Policy: HTML/Text
- Detailed Description: 500+ chars

**Submission steps:**
1. Log in to Chrome Web Store Developer Dashboard
2. Create new item
3. Upload plugin ZIP
4. Fill out details (title, description, icons)
5. Set category, language, pricing
6. Submit for review

**Review guidelines:**
- No tracking without consent
- Secure API communication (HTTPS)
- Clear privacy policy
- Appropriate permissions
- Working functionality

### Version Management

**Semantic Versioning:**
```
major.minor.patch

1.0.0  - Initial release
1.1.0  - New feature
1.1.1  - Bug fix
2.0.0  - Breaking changes
```

**Update process:**
1. Update version in `manifest.json`
2. Update `CHANGELOG.md`
3. Commit and tag: `git tag v1.0.0`
4. Build and submit to store

## Debugging

### Browser DevTools

**Popup inspection:**
```
1. Right-click plugin icon
2. Select "Inspect popup"
3. DevTools opens for popup context
```

**Content script debugging:**
```
1. Open site where plugin runs
2. F12 → Sources
3. Find plugin content script
4. Set breakpoints
5. Reload page to debug
```

**Service worker debugging:**
```
1. chrome://extensions/
2. Click "Inspect" under plugin
3. Opens background context DevTools
```

### Logging

**Development logging:**
```typescript
// Content script
console.log('[InsightReel Content] Video detected:', video);

// Background script
console.log('[InsightReel Background] Processing:', videoUrl);

// Popup
console.error('[InsightReel Popup] Error:', error);
```

**Performance monitoring:**
```typescript
const startTime = performance.now();
// ... operation ...
const endTime = performance.now();
console.log(`Operation took ${endTime - startTime}ms`);
```

### Error Tracking

```typescript
// Catch and log errors
try {
  await analyzeVideo(url);
} catch (error) {
  console.error('Analysis failed:', error);
  // Send to error tracking service
  reportError(error);
}
```

### Common Issues & Solutions

**Issue: Content script not running**
```
Solution:
1. Check manifest host_permissions
2. Verify page URL matches pattern
3. Check browser console for errors
4. Reload extension
```

**Issue: Chrome storage not persisting**
```
Solution:
1. Check chrome.storage.local.set() callback
2. Verify storage quota not exceeded
3. Check DevTools → Application → Storage
```

**Issue: API requests failing**
```
Solution:
1. Check network tab in DevTools
2. Verify API endpoint URL
3. Check CORS headers
4. Test with curl/postman
```

## CI/CD

### GitHub Actions

**Build workflow:**
```yaml
name: Build Plugin
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build:plugin
      - uses: actions/upload-artifact@v3
        with:
          name: plugin
          path: dist/plugin/
```

**Test workflow:**
```yaml
name: Test Plugin
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm test -- plugin
      - uses: codecov/codecov-action@v3
```

### Pre-commit Hooks

```bash
# .husky/pre-commit
npm test -- plugin
npm run build:plugin
```

### Pre-push Hooks

```bash
# .husky/pre-push
npm run lint
npm test -- plugin
```

## Performance Optimization

### Bundle Analysis

```bash
# Analyze bundle size
npm run build:plugin -- --analyze
```

### Runtime Performance

**Content script:**
- Minimize DOM queries
- Debounce resize listeners
- Cache selectors

**Popup:**
- Lazy load heavy components
- Virtualize long lists
- Memoize expensive computations

**Service worker:**
- Cache API responses
- Limit concurrent tasks
- Clean up timers

## Security

### Code Review Checklist

- [ ] No API keys in code
- [ ] HTTPS only for API calls
- [ ] Input validation on all data
- [ ] No eval() or innerHTML injections
- [ ] Proper error handling
- [ ] No sensitive data in logs

### Dependency Management

```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Update dependencies
npm update
```

## Documentation

### Update When:
- Adding new feature
- Changing API endpoint
- Modifying component props
- Updating build process

### Documentation Files:
- `plugin/README.md` - Plugin overview
- `BROWSER_PLUGIN_GUIDE.md` - User guide
- `PLUGIN_IMPLEMENTATION_GUIDE.md` - Technical details
- `PLUGIN_INTEGRATION_WITH_EXISTING_SERVICES.md` - Integration
- `plugin/API_PROXY.md` - API documentation

## Release Checklist

- [ ] All tests passing
- [ ] No console errors/warnings
- [ ] Version bumped
- [ ] CHANGELOG updated
- [ ] Documentation updated
- [ ] Screenshots prepared
- [ ] Performance acceptable
- [ ] Security review complete
- [ ] Manual testing done
- [ ] Commit tagged and pushed
- [ ] Chrome Web Store submitted

## Additional Resources

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Vitest](https://vitest.dev/)

## Support

For development questions:
- Create GitHub issue with `plugin-dev` label
- Check existing documentation
- Review similar components for patterns
