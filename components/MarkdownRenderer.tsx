import React, { useEffect, useMemo, useRef } from 'react';
import { marked } from 'marked';

interface MarkdownRendererProps {
  content: string;
  onTimestampClick?: (timeInSeconds: number) => void;
}

// Basic styling for rendered markdown
const markdownStyles = `
  .markdown-content > *:first-child { margin-top: 0; }
  .markdown-content > *:last-child { margin-bottom: 0; }
  .markdown-content ul, .markdown-content ol { padding-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5rem; }
  .markdown-content ul { list-style-type: disc; }
  .markdown-content ol { list-style-type: decimal; }
  .markdown-content li { margin-bottom: 0.25rem; }
  .markdown-content strong { font-weight: 600; }
  .markdown-content pre { background-color: #f5f5f5; padding: 0.75rem; border-radius: 0.375rem; overflow-x: auto; font-family: monospace; font-size: 0.875rem; }
  .markdown-content code { font-family: monospace; background-color: #f5f5f5; padding: 0.125rem 0.25rem; border-radius: 0.25rem; }
  .markdown-content pre code { background-color: transparent; padding: 0; }
  .markdown-content p { margin-bottom: 0.5rem; }
  .markdown-content a.timestamp-link { color: #1d4ed8; text-decoration: underline; cursor: pointer; font-weight: 500; }
  .markdown-content a.timestamp-link:hover { color: #1e40af; }
`;

const timestampRegex = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;

const parseTimestamp = (timestamp: string): number | null => {
  const parts = timestamp.split(':').map(Number);

  if (parts.some(part => Number.isNaN(part))) {
    return null;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, onTimestampClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const parsedHtml = useMemo(() => {
    const contentWithClickableTimestamps = content.replace(timestampRegex, (match, timecode: string) => {
      const seconds = parseTimestamp(timecode);

      if (seconds === null) {
        return match;
      }

      return `<a href="#" class="timestamp-link" data-timestamp="${seconds}">${match}</a>`;
    });

    return marked.parse(contentWithClickableTimestamps, { gfm: true, breaks: true, async: false });
  }, [content]);

  useEffect(() => {
    if (!onTimestampClick) {
      return;
    }

    const element = containerRef.current;

    if (!element) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const link = target.closest('a.timestamp-link') as HTMLAnchorElement | null;

      if (!link) {
        return;
      }

      event.preventDefault();
      const timestamp = Number(link.dataset.timestamp);

      if (!Number.isNaN(timestamp)) {
        onTimestampClick(timestamp);
      }
    };

    element.addEventListener('click', handleClick);

    return () => {
      element.removeEventListener('click', handleClick);
    };
  }, [onTimestampClick]);

  return (
    <>
        <style>{markdownStyles}</style>
        <div
            className="markdown-content"
            ref={containerRef}
            dangerouslySetInnerHTML={{ __html: parsedHtml as string }}
        />
    </>
  );
};

export default MarkdownRenderer;