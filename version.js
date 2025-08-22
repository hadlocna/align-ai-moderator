(function() {
  const version = '1.0.1';
  window.APP_VERSION = version;
  function appendVersion() {
    const el = document.createElement('div');
    el.textContent = `v${version}`;
    el.style.position = 'fixed';
    el.style.bottom = '10px';
    el.style.right = '10px';
    el.style.fontSize = '12px';
    el.style.color = '#64748b';
    el.style.fontFamily = 'Inter, sans-serif';
    document.body.appendChild(el);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', appendVersion);
  } else {
    appendVersion();
  }
})();
