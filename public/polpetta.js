(() => {
  let copyPromise;
  let scheduled = false;

  function getCopy() {
    if (!copyPromise) {
      copyPromise = fetch('/copy.json', { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}));
    }
    return copyPromise;
  }

  async function patch() {
    scheduled = false;
    const app = document.querySelector('#app');
    if (!app) return;

    const data = await getCopy();

    const entry = app.querySelector('#activate');
    if (entry && !entry.dataset.polpettaPatched) {
      entry.dataset.polpettaPatched = '1';

      const card = entry.closest('.story-card');
      const title = card?.querySelector('h1');
      const lead = card?.querySelector('.lead');

      if (title) title.textContent = data.title || 'Tanti auguri polpetta!';
      if (lead) {
        lead.textContent = data.intro || '';
        lead.classList.add('intro-copy');
      }

      card?.querySelector('.hero-index')?.remove();
      card?.querySelector('.question-box')?.remove();
      card?.querySelector('.eyebrow')?.remove();
      entry.querySelector('.field-label')?.remove();

      const input = entry.querySelector('input[name="answer"]');
      if (input) {
        input.required = false;
        input.value = '';
        input.type = 'hidden';
      }

      entry.classList.add('start-form');
      const row = entry.querySelector('.field-row');
      if (row) {
        row.innerHTML = '<button id="startHunt" class="start-button" type="submit">Inizia!</button>';
      }
    }

    const wordCard = app.querySelector('.word-card');
    if (wordCard && !wordCard.dataset.polpettaPatched) {
      wordCard.dataset.polpettaPatched = '1';

      const kicker = wordCard.querySelector('.word-kicker');
      if (kicker) kicker.textContent = 'piccola parola magica:';

      wordCard.querySelector('h2')?.remove();
      wordCard.querySelector(':scope > p:not(.form-error)')?.remove();
    }

    const finish = app.querySelector('.finish-card');
    if (finish && !finish.dataset.polpettaPatched) {
      finish.dataset.polpettaPatched = '1';
      finish.innerHTML = '';

      const message = document.createElement('p');
      message.className = 'final-message';
      message.textContent = data.final || '';
      finish.appendChild(message);
    }
  }

  function schedulePatch() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      patch().catch(() => {
        scheduled = false;
      });
    });
  }

  const app = document.querySelector('#app');
  if (app) {
    const observer = new MutationObserver(schedulePatch);
    observer.observe(app, { childList: true, subtree: true });
  }

  getCopy().then((data) => {
    if (data.title && document.title !== data.title) {
      document.title = data.title;
    }
    schedulePatch();
  });
})();