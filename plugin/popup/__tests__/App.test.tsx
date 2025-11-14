/**
 * Plugin UI Tests
 * Testing popup components and integration
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';

// Mock chrome API
const chromeMock = {
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
    },
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
};

global.chrome = chromeMock as any;

describe('InsightReel Plugin - App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders plugin header', () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 1 }]);
    chromeMock.tabs.sendMessage.mockResolvedValue({
      hasVideo: false,
      videos: [],
      pageTitle: 'Test Page',
      pageUrl: 'https://example.com',
    });

    render(<App />);
    expect(screen.getByText('InsightReel')).toBeDefined();
  });

  it('detects videos on page load', async () => {
    const mockVideoInfo = {
      hasVideo: true,
      videos: [
        {
          url: 'https://youtube.com/watch?v=test',
          type: 'video/mp4',
          provider: 'youtube' as const,
          title: 'Test Video',
        },
      ],
      pageTitle: 'Test Page',
      pageUrl: 'https://example.com',
    };

    chromeMock.tabs.query.mockResolvedValue([{ id: 1 }]);
    chromeMock.tabs.sendMessage.mockResolvedValue(mockVideoInfo);

    render(<App />);

    await waitFor(() => {
      expect(chromeMock.tabs.query).toHaveBeenCalledWith({
        active: true,
        currentWindow: true,
      });
    });
  });

  it('displays error when no video found', async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 1 }]);
    chromeMock.tabs.sendMessage.mockResolvedValue({
      hasVideo: false,
      videos: [],
      pageTitle: 'Test Page',
      pageUrl: 'https://example.com',
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/No video found/i)).toBeDefined();
    });
  });

  it('displays video selector when videos found', async () => {
    const mockVideoInfo = {
      hasVideo: true,
      videos: [
        {
          url: 'https://youtube.com/watch?v=test',
          type: 'video/mp4',
          provider: 'youtube' as const,
          title: 'Test Video',
        },
      ],
      pageTitle: 'Test Page',
      pageUrl: 'https://example.com',
    };

    chromeMock.tabs.query.mockResolvedValue([{ id: 1 }]);
    chromeMock.tabs.sendMessage.mockResolvedValue(mockVideoInfo);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/1 video found/i)).toBeDefined();
    });
  });

  it('navigates to analysis view when video selected', async () => {
    const mockVideoInfo = {
      hasVideo: true,
      videos: [
        {
          url: 'https://youtube.com/watch?v=test',
          type: 'video/mp4',
          provider: 'youtube' as const,
          title: 'Test Video',
        },
      ],
      pageTitle: 'Test Page',
      pageUrl: 'https://example.com',
    };

    chromeMock.tabs.query.mockResolvedValue([{ id: 1 }]);
    chromeMock.tabs.sendMessage.mockResolvedValue(mockVideoInfo);

    const { getByText } = render(<App />);

    await waitFor(() => {
      const videoButton = getByText('Test Video');
      expect(videoButton).toBeDefined();
    });
  });

  it('opens settings panel', async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 1 }]);
    chromeMock.tabs.sendMessage.mockResolvedValue({
      hasVideo: false,
      videos: [],
      pageTitle: 'Test Page',
      pageUrl: 'https://example.com',
    });

    const { getByText } = render(<App />);

    await waitFor(() => {
      const settingsButton = getByText('Settings');
      expect(settingsButton).toBeDefined();
    });
  });
});

describe('Video Selector Component', () => {
  it('displays multiple videos', () => {
    const videos = [
      {
        url: 'https://youtube.com/watch?v=1',
        type: 'video/mp4',
        provider: 'youtube' as const,
        title: 'Video 1',
      },
      {
        url: 'https://vimeo.com/123',
        type: 'video/mp4',
        provider: 'vimeo' as const,
        title: 'Video 2',
      },
    ];

    const onSelect = vi.fn();

    const { getByText } = render(
      <VideoSelector videos={videos} onSelectVideo={onSelect} />
    );

    expect(getByText(/2 videos found/i)).toBeDefined();
    expect(getByText('Video 1')).toBeDefined();
    expect(getByText('Video 2')).toBeDefined();
  });

  it('calls onSelect when video clicked', () => {
    const videos = [
      {
        url: 'https://youtube.com/watch?v=test',
        type: 'video/mp4',
        provider: 'youtube' as const,
        title: 'Test Video',
      },
    ];

    const onSelect = vi.fn();

    const { getByText } = render(
      <VideoSelector videos={videos} onSelectVideo={onSelect} />
    );

    fireEvent.click(getByText('Test Video'));
    expect(onSelect).toHaveBeenCalledWith(videos[0]);
  });
});

describe('Settings Panel Component', () => {
  beforeEach(() => {
    chromeMock.storage.local.get.mockImplementation((key, cb) => {
      cb({ pluginSettings: { provider: 'gemini', model: 'test' } });
    });
  });

  it('loads current settings', async () => {
    render(<SettingsPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(chromeMock.storage.local.get).toHaveBeenCalled();
    });
  });

  it('saves settings on submit', async () => {
    chromeMock.storage.local.set.mockResolvedValue(undefined);

    const { getByText } = render(<SettingsPanel onClose={vi.fn()} />);

    const saveButton = getByText('Save Settings');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(chromeMock.storage.local.set).toHaveBeenCalled();
    });
  });
});

describe('Analysis Panel Component', () => {
  const mockVideo = {
    url: 'https://youtube.com/watch?v=test',
    type: 'video/mp4',
    provider: 'youtube' as const,
    title: 'Test Video',
    pageTitle: 'Test Page',
    pageUrl: 'https://example.com',
  };

  it('displays analysis options', () => {
    render(
      <AnalysisPanel video={mockVideo} onClose={vi.fn()} />
    );

    expect(screen.getByText('Summary')).toBeDefined();
    expect(screen.getByText('Key Moments')).toBeDefined();
    expect(screen.getByText('Translate')).toBeDefined();
    expect(screen.getByText('Chat')).toBeDefined();
  });

  it('initiates analysis on button click', async () => {
    chromeMock.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.action === 'startProcessing') {
        callback({ taskId: 'task-123', status: 'processing' });
      }
    });

    const { getByText } = render(
      <AnalysisPanel video={mockVideo} onClose={vi.fn()} />
    );

    fireEvent.click(getByText('Summary'));

    await waitFor(() => {
      expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'startProcessing',
          analysisType: 'summary',
        }),
        expect.any(Function)
      );
    });
  });
});
