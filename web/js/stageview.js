// ===== Bühne beim Präsentieren: was über dem Video liegt =====
// Einblendung unten links, große Ankündigung beim Szenenwechsel, Pausenleiste, Schwarzbild.
// Die Szenen-Seite berechnet ein Modell (presentModel in scenespage.js); gezeichnet wird es hier,
// im eigenen Fenster genauso wie im Beamer-Fenster (praesentation.html).

export const EMPTY_MODEL = { overlay: null, card: null, pause: null, black: false, switching: false, ytControls: false };

// stage: Element mit Klasse sc-stage, darin .player-wrap. Gibt render(model) zurück.
export function mountStage(stage) {
  const wrap = stage.querySelector('.player-wrap');
  wrap.insertAdjacentHTML('beforeend', `
    <div class="pr-overlay" hidden><span class="pr-title"></span><span class="pr-line"></span></div>
    <div class="pr-card" hidden><span class="pr-card-count"></span><span class="pr-card-code"></span><span class="pr-card-detail"></span><span class="pr-card-title"></span></div>
    <div class="pr-pause" role="status" hidden></div>
    <div class="pr-black" hidden></div>`);
  const ov = wrap.querySelector('.pr-overlay'), card = wrap.querySelector('.pr-card');
  const pause = wrap.querySelector('.pr-pause'), black = wrap.querySelector('.pr-black');
  const text = (el, sel, t) => { el.querySelector(sel).textContent = t || ''; };

  return function render(m = EMPTY_MODEL) {
    stage.classList.toggle('switching', !!m.switching);
    stage.classList.toggle('yt-controls', !!m.ytControls);
    ov.hidden = !m.overlay;
    if (m.overlay) {
      text(ov, '.pr-title', m.overlay.title);
      text(ov, '.pr-line', m.overlay.line);
      ov.className = `pr-overlay ${m.overlay.side || ''}`;
    }
    card.hidden = !m.card;
    if (m.card) {
      text(card, '.pr-card-count', m.card.count);
      text(card, '.pr-card-code', m.card.code);
      text(card, '.pr-card-detail', m.card.detail);
      text(card, '.pr-card-title', m.card.title);
      card.className = `pr-card ${m.card.side || ''}`;
    }
    pause.hidden = !m.pause;
    pause.textContent = m.pause || '';
    black.hidden = !m.black;
  };
}
