(function () {
  function getVersionBaseUrl() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isLocal ? 'http://localhost:8080' : 'https://align-ai-moderator.onrender.com';
  }

  async function appendVersion() {
    try {
      const base = getVersionBaseUrl();
      const res = await fetch(`${base}/version`, { mode: 'cors' });
      // Only attempt JSON if server indicates JSON
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        throw new Error(`Unexpected response for /version: ${res.status} ${contentType}`);
      }
      const data = await res.json();
      const version = data.version || 'dev';
      window.APP_VERSION = version;
      const el = document.createElement('div');
      el.textContent = `v${version}`;
      el.style.position = 'fixed';
      el.style.bottom = '10px';
      el.style.right = '10px';
      el.style.fontSize = '12px';
      el.style.color = '#64748b';
      el.style.fontFamily = 'Inter, sans-serif';
      el.setAttribute('aria-label', `App version ${version}`);
      document.body.appendChild(el);
    } catch (err) {
      // Fail silently in production to avoid noisy console
      // but keep a minimal log for debugging
      console.warn('Version badge unavailable:', err.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', appendVersion);
  } else {
    appendVersion();
  }
})();
