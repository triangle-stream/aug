(() => {
  const prefix = location.pathname.startsWith('/auguri') ? '/auguri' : '';
  window.HUNT_PREFIX = prefix;

  if (!prefix) return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/')) {
      if (input.startsWith('/api/') || input === '/copy.json') {
        input = prefix + input;
      }
    } else if (input instanceof Request) {
      const url = new URL(input.url);
      if (url.origin === location.origin && (url.pathname.startsWith('/api/') || url.pathname === '/copy.json')) {
        url.pathname = prefix + url.pathname;
        input = new Request(url.toString(), input);
      }
    }
    return originalFetch(input, init);
  };
})();