(() => {
  let copy = null;

  async function ensureCopy() {
    if (copy) return copy;
    copy = await fetch('/copy.json').then((r) => r.json()).catch(() => ({}));
    return copy;
  }

  async function patch() {
    const data = await ensureCopy();
    document.title = data.title || 'Tanti auguri polpetta!';

    const app = document.querySelector('#app');
    if (!app) return;

    const entry = app.querySelector('#activate');
    if (entry && !app.querySelector('#startHunt')) {
      const card = entry.closest('.story-card');
      const title = card?.querySelector('h1');
      const lead = card?.querySelector('.lead');
      if (title) title.textContent = data.title || 'Tanti auguri polpetta!';
      if (lead) lead.textContent = data.intro || '';

      card?.querySelector('.hero-index')?.remove();
      card?.querySelector('.question-box')?.remove();
      card?.querySelector('.eyebrow')?.remove();

      const input = entry.querySelector('input[name="answer"]');
      if (input) {
        input.required = false;
        input.value = '';
      }
      entry.classList.add('start-form');
      const row = entry.querySelector('.field-row');
      if (row) {
        row.innerHTML = '<button id="startHunt" class="start-button" type="submit">Inizia!</button>';
      }
      entry.querySelector('.field-label')?.remove();
    }

    const wordCard = app.querySelector('.word-card');
    if (wordCard && !wordCard.dataset.polpettaPatched) {
      wordCard.dataset.polpettaPatched = '1';
      wordCard.querySelector('.word-kicker')?.replaceChildren(document.createTextNode('piccola parola magica:'));
      wordCard.querySelector('h2')?.remove();
      const p = wordCard.querySelector(':scope > p:not(.form-error)');
      p?.remove();
    }

    const finish = app.querySelector('.finish-card');
    if (finish && !finish.dataset.polpettaPatched) {
      finish.dataset.polpettaPatched = '1';
      finish.innerHTML = '<p class="final-message"></p>';
      finish.querySelector('.final-message').textContent = data.final || '';
    }
  }

  const observer = new MutationObserver(() => patch().catch(() => {}));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  patch().catch(() => {});
})();