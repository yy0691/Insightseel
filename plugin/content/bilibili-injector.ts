/**
 * Bilibili-specific content injector
 * Replaces the right sidebar with InsightReel UI and tabs
 */

function injectBilibiliSidebar() {
  // Find the right sidebar container (Bilibili's structure)
  // The sidebar is usually in a container with class containing "right" or "recommend"
  const sidebarSelectors = [
    '.bili-layout-right',
    '.right-container',
    '#app > div > div > div[class*="right"]',
    '.video-container .right',
  ];

  let originalSidebar: HTMLElement | null = null;
  let sidebarContainer: HTMLElement | null = null;

  // Try to find the sidebar container
  for (const selector of sidebarSelectors) {
    const element = document.querySelector(selector) as HTMLElement;
    if (element) {
      sidebarContainer = element;
      break;
    }
  }

  // Fallback: find by structure (look for common Bilibili layout patterns)
  if (!sidebarContainer) {
    const mainContainer = document.querySelector('.video-container, .bili-video-page, #app');
    if (mainContainer) {
      const children = Array.from(mainContainer.children);
      // Usually the right sidebar is the last or second-to-last child
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i] as HTMLElement;
        if (child && (child.offsetWidth < 400 || child.classList.toString().includes('right'))) {
          sidebarContainer = child;
          break;
        }
      }
    }
  }

  // If still not found, create a new container
  if (!sidebarContainer) {
    // Find the main content area
    const mainContent = document.querySelector('.video-container, .bili-video-page, #app > div > div');
    if (mainContent) {
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
      `;
      document.body.appendChild(sidebarContainer);
    } else {
      console.warn('InsightReel: Could not find sidebar container');
      return;
    }
  }

  // Store original content
  originalSidebar = sidebarContainer.cloneNode(true) as HTMLElement;
  originalSidebar.id = 'insightreel-original-sidebar';
  originalSidebar.style.display = 'none';
  document.body.appendChild(originalSidebar);

  // Clear the sidebar container
  sidebarContainer.innerHTML = '';
  sidebarContainer.id = 'insightreel-tab-container';

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
  `;

  // InsightReel tab
  const insightreelTab = document.createElement('button');
  insightreelTab.className = 'insightreel-tab active';
  insightreelTab.textContent = 'InsightReel';
  insightreelTab.style.cssText = `
    flex: 1;
    padding: 12px 16px;
    border: none;
    background: white;
    border-bottom: 2px solid #059669;
    color: #059669;
    font-weight: 600;
    cursor: pointer;
    font-size: 14px;
  `;

  // Recommendations tab
  const recommendationsTab = document.createElement('button');
  recommendationsTab.className = 'insightreel-tab';
  recommendationsTab.textContent = '推荐';
  recommendationsTab.style.cssText = `
    flex: 1;
    padding: 12px 16px;
    border: none;
    background: white;
    border-bottom: 2px solid transparent;
    color: #6b7280;
    font-weight: 500;
    cursor: pointer;
    font-size: 14px;
  `;

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
  `;

  // Recommendations content (original sidebar)
  const recommendationsContent = document.createElement('div');
  recommendationsContent.id = 'insightreel-recommendations';
  recommendationsContent.style.cssText = `
    display: none;
    padding: 16px;
  `;
  recommendationsContent.appendChild(originalSidebar.cloneNode(true));

  // Tab switching logic
  const switchTab = (tab: 'insightreel' | 'recommendations') => {
    if (tab === 'insightreel') {
      insightreelTab.style.borderBottomColor = '#059669';
      insightreelTab.style.color = '#059669';
      insightreelTab.style.fontWeight = '600';
      recommendationsTab.style.borderBottomColor = 'transparent';
      recommendationsTab.style.color = '#6b7280';
      recommendationsTab.style.fontWeight = '500';
      insightreelContent.style.display = 'block';
      recommendationsContent.style.display = 'none';
    } else {
      recommendationsTab.style.borderBottomColor = '#059669';
      recommendationsTab.style.color = '#059669';
      recommendationsTab.style.fontWeight = '600';
      insightreelTab.style.borderBottomColor = 'transparent';
      insightreelTab.style.color = '#6b7280';
      insightreelTab.style.fontWeight = '500';
      recommendationsContent.style.display = 'block';
      insightreelContent.style.display = 'none';
    }
  };

  insightreelTab.addEventListener('click', () => switchTab('insightreel'));
  recommendationsTab.addEventListener('click', () => switchTab('recommendations'));

  // Assemble the structure
  tabContainer.appendChild(insightreelTab);
  tabContainer.appendChild(recommendationsTab);
  contentArea.appendChild(insightreelContent);
  contentArea.appendChild(recommendationsContent);

  sidebarContainer.appendChild(tabContainer);
  sidebarContainer.appendChild(contentArea);

  // Adjust main content width to make room for sidebar
  const mainContent = document.querySelector('.video-container, .bili-video-page, #app > div > div');
  if (mainContent) {
    const mainEl = mainContent as HTMLElement;
    const currentWidth = mainEl.offsetWidth;
    if (currentWidth > 1200) {
      mainEl.style.width = `${currentWidth - 380}px`;
    }
  }

  // Load and inject the React component
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('bilibili-sidebar.js');
  script.type = 'module';
  script.onload = () => {
    // Dispatch event for React to mount
    window.dispatchEvent(new CustomEvent('insightreel-sidebar-ready', {
      detail: { containerId: 'insightreel-sidebar-root' }
    }));
  };
  document.head.appendChild(script);
}

// Wait for page to be ready
function initBilibiliInjector() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(injectBilibiliSidebar, 1000); // Wait a bit for Bilibili's dynamic content
    });
  } else {
    setTimeout(injectBilibiliSidebar, 1000);
  }
}

// Check if we're on Bilibili
if (window.location.hostname.includes('bilibili.com')) {
  initBilibiliInjector();
}

export { injectBilibiliSidebar };

