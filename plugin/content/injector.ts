/**
 * Content Script Injector
 * Injects sidebar UI directly into the webpage
 */

function injectSidebar() {
  // Create container
  const container = document.createElement('div');
  container.id = 'insightreel-sidebar-root';
  container.style.cssText = `
    position: fixed;
    right: 0;
    top: 0;
    width: 384px;
    height: 100vh;
    z-index: 999999;
    font-family: -apple-system, system-ui, "SF Pro Text", sans-serif;
  `;

  document.body.appendChild(container);

  // Inject React app - this would be handled by webpack/vite in the actual build
  // For now, we'll dispatch an event that the background script can listen to
  window.postMessage(
    { type: 'INSIGHTREEL_INJECT_SIDEBAR', target: 'page' },
    '*'
  );
}

function createFloatingButton() {
  const button = document.createElement('button');
  button.id = 'insightreel-floating-button';
  button.innerHTML = '🎯';
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
    border: none;
    color: white;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);
    z-index: 999998;
    transition: all 0.3s ease;
    font-family: -apple-system, system-ui, sans-serif;
  `;

  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.1)';
    button.style.boxShadow = '0 6px 20px rgba(5, 150, 105, 0.4)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
    button.style.boxShadow = '0 4px 12px rgba(5, 150, 105, 0.3)';
  });

  button.addEventListener('click', () => {
    const existingSidebar = document.getElementById('insightreel-sidebar');
    if (existingSidebar) {
      existingSidebar.remove();
      button.innerHTML = '🎯';
    } else {
      injectSidebar();
      button.innerHTML = '✕';
    }
  });

  document.body.appendChild(button);
}

// Check if we should auto-inject based on settings
function shouldAutoInject(): boolean {
  return localStorage.getItem('insightreel_auto_inject') === 'true';
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'injectUI') {
    createFloatingButton();
    if (shouldAutoInject()) {
      injectSidebar();
    }
  }
});

// Notify that content script is ready
window.addEventListener('load', () => {
  chrome.runtime.sendMessage({ action: 'contentScriptReady' }).catch(() => {
    // Background script not ready
  });
});

export { injectSidebar, createFloatingButton };
