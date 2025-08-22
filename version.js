(function () {
  async function appendVersion() {
    try {
      const res = await fetch('/version');
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
      document.body.appendChild(el);
    } catch (err) {
      console.error('Failed to fetch app version', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', appendVersion);
  } else {
    appendVersion();
  }
})();
