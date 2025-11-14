/**
 * Universal video page sidebar injector
 * Works on all video platforms (Bilibili, YouTube, Vimeo, etc.)
 */

function injectVideoSidebar() {
  // Check if already injected
  if (document.getElementById('insightreel-tab-container')) {
    return;
  }

  // Find the right sidebar container or create one
  let sidebarContainer: HTMLElement | null = null;
  let originalSidebar: HTMLElement | null = null;

  // Try to find existing sidebar (platform-specific selectors)
  const sidebarSelectors = [
    // Bilibili
    '.bili-layout-right',
    '.right-container',
    // YouTube
    '#secondary',
    '#related',
    // Vimeo
    '.vp-sidebar',
    '.sidebar',
    // Generic
    'aside',
    '[class*="sidebar"]',
    '[class*="right"]',
    '[id*="sidebar"]',
  ];

  for (const selector of sidebarSelectors) {
    try {
      const element = document.querySelector(selector) as HTMLElement;
      if (element && element.offsetWidth !== undefined) {
        if (element.offsetWidth < 500 || element.classList.toString().includes('sidebar') || element.classList.toString().includes('right')) {
          sidebarContainer = element;
          break;
        }
      }
    } catch (error) {
      // Skip this selector if it causes an error
      continue;
    }
  }

  // If not found, try to find by position (right side of main content)
  if (!sidebarContainer) {
    const mainContent = document.querySelector('main, [role="main"], .main-content, .content, #content, #app > div > div');
    if (mainContent) {
      const parent = mainContent.parentElement;
      if (parent) {
        const children = Array.from(parent.children);
        // Usually sidebar is the last child or second-to-last
        for (let i = children.length - 1; i >= Math.max(0, children.length - 3); i--) {
          try {
            const child = children[i] as HTMLElement;
            if (child && child !== mainContent && child.offsetWidth !== undefined && child.offsetWidth < 500) {
              sidebarContainer = child;
              break;
            }
          } catch (error) {
            // Skip this child if it causes an error
            continue;
          }
        }
      }
    }
  }

  // If still not found, create a new fixed sidebar
  if (!sidebarContainer) {
    sidebarContainer = document.createElement('div');
    sidebarContainer.className = 'insightreel-sidebar-container';
    sidebarContainer.style.cssText = `
      position: fixed;
      right: 0;
      top: 0;
      width: 380px;
      height: 100vh;
      background: white;
      z-index: 1000;
      overflow-y: auto;
      box-shadow: -2px 0 8px rgba(0,0,0,0.1);
    `;
    document.body.appendChild(sidebarContainer);
  } else {
    // Store original content
    originalSidebar = sidebarContainer.cloneNode(true) as HTMLElement;
    originalSidebar.id = 'insightreel-original-sidebar';
    originalSidebar.style.display = 'none';
    document.body.appendChild(originalSidebar);
  }

  // Ensure sidebarContainer exists
  if (!sidebarContainer) {
    console.error('InsightReel: Failed to create sidebar container');
    return;
  }

  // Clear the sidebar container
  const originalHTML = sidebarContainer.innerHTML;
  sidebarContainer.innerHTML = '';
  sidebarContainer.id = 'insightreel-tab-container';
  
  // Preserve existing styles if any
  const existingStyle = sidebarContainer.style.cssText || '';
  sidebarContainer.style.cssText = `
    ${existingStyle}
    background: white;
    overflow: visible;
  `;

  // Create tab system
  const tabContainer = document.createElement('div');
  tabContainer.className = 'insightreel-tabs';
  tabContainer.style.cssText = `
    display: flex;
    border-bottom: 1px solid #e5e7eb;
    background: white;
    position: sticky;
    top: 0;
    z-index: 10;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  `;

  // Tab buttons
  const tabs = [
    { id: 'insightreel', label: 'InsightReel', icon: '🔍' },
    { id: 'insights', label: '见解', icon: '💡' },
    { id: 'chat', label: '聊天', icon: '💬' },
    { id: 'original', label: '原内容', icon: '📋' },
  ];

  const tabButtons: HTMLElement[] = [];
  let activeTab = 'insightreel';

  tabs.forEach((tab, index) => {
    const button = document.createElement('button');
    button.className = `insightreel-tab ${index === 0 ? 'active' : ''}`;
    button.textContent = `${tab.icon} ${tab.label}`;
    button.dataset.tab = tab.id;
    button.style.cssText = `
      flex: 1;
      padding: 12px 8px;
      border: none;
      background: white;
      border-bottom: 2px solid ${index === 0 ? '#059669' : 'transparent'};
      color: ${index === 0 ? '#059669' : '#6b7280'};
      font-weight: ${index === 0 ? '600' : '500'};
      cursor: pointer;
      font-size: 13px;
      transition: all 0.2s;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;

    button.addEventListener('mouseenter', () => {
      if (activeTab !== tab.id) {
        button.style.backgroundColor = '#f9fafb';
      }
    });

    button.addEventListener('mouseleave', () => {
      if (activeTab !== tab.id) {
        button.style.backgroundColor = 'white';
      }
    });

    tabButtons.push(button);
    tabContainer.appendChild(button);
  });

  // Content area
  const contentArea = document.createElement('div');
  contentArea.className = 'insightreel-content';
  contentArea.style.cssText = `
    position: relative;
    min-height: 400px;
  `;

  // InsightReel content (will be injected by React)
  const insightreelContent = document.createElement('div');
  insightreelContent.id = 'insightreel-sidebar-root';
  insightreelContent.style.cssText = `
    padding: 16px;
    display: block;
  `;

  // Insights content (analysis results)
  const insightsContent = document.createElement('div');
  insightsContent.id = 'insightreel-insights';
  insightsContent.style.cssText = `
    display: none;
    padding: 16px;
  `;

  // Chat content
  const chatContent = document.createElement('div');
  chatContent.id = 'insightreel-chat';
  chatContent.style.cssText = `
    display: none;
    padding: 16px;
  `;

  // Original content
  const originalContent = document.createElement('div');
  originalContent.id = 'insightreel-original';
  originalContent.style.cssText = `
    display: none;
    padding: 16px;
  `;
  if (originalSidebar) {
    originalContent.appendChild(originalSidebar.cloneNode(true));
  } else if (originalHTML) {
    originalContent.innerHTML = originalHTML;
  }

  // Tab switching logic
  const switchTab = (tabId: string) => {
    activeTab = tabId;
    
    // Update button styles
    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === tabId;
      btn.style.borderBottomColor = isActive ? '#059669' : 'transparent';
      btn.style.color = isActive ? '#059669' : '#6b7280';
      btn.style.fontWeight = isActive ? '600' : '500';
      btn.style.backgroundColor = isActive ? 'white' : 'white';
    });

    // Show/hide content
    insightreelContent.style.display = tabId === 'insightreel' ? 'block' : 'none';
    insightsContent.style.display = tabId === 'insights' ? 'block' : 'none';
    chatContent.style.display = tabId === 'chat' ? 'block' : 'none';
    originalContent.style.display = tabId === 'original' ? 'block' : 'none';
  };

  // Add click handlers
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      switchTab(button.dataset.tab || 'insightreel');
    });
  });

  // Assemble the structure
  contentArea.appendChild(insightreelContent);
  contentArea.appendChild(insightsContent);
  contentArea.appendChild(chatContent);
  contentArea.appendChild(originalContent);

  sidebarContainer.appendChild(tabContainer);
  sidebarContainer.appendChild(contentArea);

  // Adjust main content width to make room for sidebar (if not fixed)
  try {
    if (sidebarContainer && sidebarContainer.style && sidebarContainer.style.position !== 'fixed') {
      const mainContent = document.querySelector('main, [role="main"], .main-content, .content, #content');
      if (mainContent) {
        const mainEl = mainContent as HTMLElement;
        if (mainEl && mainEl.offsetWidth) {
          const currentWidth = mainEl.offsetWidth;
          if (currentWidth > 1200) {
            mainEl.style.width = `${currentWidth - 380}px`;
            mainEl.style.maxWidth = `${currentWidth - 380}px`;
          }
        }
      }
    }
  } catch (error) {
    console.warn('InsightReel: Failed to adjust main content width', error);
  }

  // Load and inject the React component
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('bilibili-sidebar.js'); // Reuse the same bundle
    script.type = 'module';
    script.onload = () => {
      // Dispatch event for React to mount
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('insightreel-sidebar-ready', {
          detail: { 
            containerId: 'insightreel-sidebar-root',
            insightsContainerId: 'insightreel-insights',
            chatContainerId: 'insightreel-chat',
          }
        }));
      }, 100);
    };
    script.onerror = (error) => {
      console.error('InsightReel: Failed to load sidebar script', error);
      // Show error message in the container
      const container = document.getElementById('insightreel-sidebar-root');
      if (container) {
        container.innerHTML = `
          <div style="padding: 20px; text-align: center; color: #ef4444;">
            <p style="font-size: 14px; margin-bottom: 8px;">加载失败</p>
            <p style="font-size: 12px; color: #6b7280;">请刷新页面重试</p>
          </div>
        `;
      }
    };
    
    if (document.head) {
      document.head.appendChild(script);
    } else {
      // Fallback: wait for head to be available
      const observer = new MutationObserver(() => {
        if (document.head) {
          document.head.appendChild(script);
          observer.disconnect();
        }
      });
      observer.observe(document.documentElement, { childList: true });
    }
  } catch (error) {
    console.error('InsightReel: Error loading sidebar script', error);
  }
}

// Wait for page to be ready and check for videos
function initVideoSidebarInjector() {
  const checkAndInject = () => {
    // Check if page has video
    const hasVideo = 
      document.querySelector('video') !== null ||
      window.location.hostname.includes('youtube.com') ||
      window.location.hostname.includes('bilibili.com') ||
      window.location.hostname.includes('vimeo.com') ||
      document.querySelector('iframe[src*="youtube"], iframe[src*="vimeo"]') !== null;

    if (hasVideo) {
      injectVideoSidebar();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(checkAndInject, 1000); // Wait for dynamic content
    });
  } else {
    setTimeout(checkAndInject, 1000);
  }

  // Also listen for dynamic content changes (for SPA)
  // Use a debounce to avoid too many injections
  let injectTimeout: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    if (!document.getElementById('insightreel-tab-container')) {
      if (injectTimeout) {
        clearTimeout(injectTimeout);
      }
      injectTimeout = setTimeout(() => {
        checkAndInject();
      }, 2000); // Wait 2 seconds before trying again
    }
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  } else {
    // Wait for body to be available
    const bodyObserver = new MutationObserver(() => {
      if (document.body) {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
        bodyObserver.disconnect();
      }
    });
    bodyObserver.observe(document.documentElement, { childList: true });
  }
}

// Initialize
initVideoSidebarInjector();

export { injectVideoSidebar };

