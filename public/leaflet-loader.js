(() => {
  const cssUrls = [
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css'
  ];
  const jsUrls = [
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'
  ];

  function loadCss(url) {
    if (document.querySelector('link[data-leaflet-dynamic]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.dataset.leafletDynamic = '1';
    document.head.appendChild(link);
  }

  function loadScript(index = 0) {
    if (window.L || index >= jsUrls.length) return;
    const script = document.createElement('script');
    script.src = jsUrls[index];
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      window.dispatchEvent(new CustomEvent('leaflet-ready'));
    };
    script.onerror = () => {
      script.remove();
      loadScript(index + 1);
    };
    document.head.appendChild(script);

    setTimeout(() => {
      if (!window.L && script.isConnected) {
        script.remove();
        loadScript(index + 1);
      }
    }, 3500);
  }

  loadCss(cssUrls[0]);
  loadScript();
})();