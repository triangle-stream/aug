(() => {
  const observer = new MutationObserver(() => {
    const card = document.querySelector('.map-card');
    const copy = card?.querySelector('.coordinate-copy');
    if (!card || !copy || !copy.querySelector('.route-summary')) return;
    if (copy.querySelector('.route-source-coordinates')) return;

    const lat = Number(card.dataset.latitude);
    const lon = Number(card.dataset.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const source = document.createElement('strong');
    source.className = 'route-source-coordinates';
    source.textContent = `${lat}, ${lon}`;
    source.hidden = true;
    copy.prepend(source);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
