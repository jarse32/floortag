// ===== Einstieg: Spiel laden und Bedienung verdrahten =====
import { state, ui } from './state.js';
import { extractVideoId, fmt } from './format.js';
import { prepareGame, events, findEvent } from './game.js';
import { timeOf, place } from './sync.js';
import { save, restore, buildSyncFile, syncFileName, applySyncFile } from './storage.js';
import * as yt from './player.js';
import { $, renderAll, renderMatchline, renderStrip, updateClock, showPlayerMessage } from './render.js';

// Zustand geändert: speichern und neu zeichnen
function commit() { save(); renderAll(); }

yt.initPlayer('player', {
  onLoad: () => { $('#playerEmpty').hidden = true; },
  onReady: renderAll,
  onStateChange: renderStrip,
  onError: showPlayerMessage
});

function setVideo(id) {
  state.videoId = id;
  restore();
  renderAll();
  yt.loadVideo(id);
}

// ===== Spiel laden =====
function loadGame(data) {
  prepareGame(data);
  ui.selectedId = null;
  renderMatchline();
  $('#loader').hidden = true;
  $('#app').hidden = false;
  const link = data.vod_link || data.live_stream_link || '';
  $('#videoInput').value = link;
  const id = extractVideoId(link);
  if (id) setVideo(id); else { state.videoId = null; restore(); renderAll(); }
}
function handleText(text) {
  const err = $('#loadError');
  try { loadGame(JSON.parse(text)); err.hidden = true; }
  catch (e) { err.textContent = e instanceof SyntaxError ? 'Die Datei enthält kein gültiges JSON.' : e.message; err.hidden = false; }
}

$('#fileInput').addEventListener('change', e => { const f = e.target.files[0]; if (f) f.text().then(handleText); });
const dz = $('#dropzone');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('over'));
dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) f.text().then(handleText); });
$('#pasteBtn').addEventListener('click', () => handleText($('#pasteArea').value));

// ===== Video und Transport =====
$('#videoBtn').addEventListener('click', () => {
  const id = extractVideoId($('#videoInput').value);
  if (id) setVideo(id);
  else showPlayerMessage('Daraus konnte keine YouTube-Video-ID gelesen werden.');
});
document.querySelectorAll('[data-seek]').forEach(b => b.addEventListener('click', () => yt.seek(yt.now() + Number(b.dataset.seek))));
$('#playBtn').addEventListener('click', yt.togglePlay);

// ===== Drittelgrenzen =====
$('#periods').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const p = Number(b.dataset.p), kind = b.dataset.kind;
  state.periods[p] = state.periods[p] || {};
  if (b.dataset.act === 'setmark') { state.periods[p][kind] = Math.round(yt.now() * 10) / 10; commit(); }
  if (b.dataset.act === 'clearmark') { state.periods[p][kind] = null; commit(); }
  if (b.dataset.act === 'seekmark') yt.seek(state.periods[p][kind]);
  if (b.dataset.act === 'seeksuggest') yt.seek(Number(b.dataset.t) - 5);
});

// ===== Ereignisse =====
function handleEventAction(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const ev = findEvent(b.dataset.id); if (!ev) return;
  const t = timeOf(ev);
  switch (b.dataset.act) {
    case 'select':
      ui.selectedId = ui.selectedId === ev.event_id ? null : ev.event_id;
      if (ui.selectedId && t != null) yt.seek(t - 3);
      renderAll();
      break;
    case 'setnow': place(ev, yt.now()); commit(); break;
    case 'jump': yt.seek(t - state.leadIn); yt.play(); break;
    case 'nudge': place(ev, t + Number(b.dataset.d)); commit(); yt.seek(timeOf(ev) - 3); break;
    case 'unplace': delete state.placed[ev.event_id]; commit(); break;
  }
}
$('#events').addEventListener('click', handleEventAction);
$('#strip').addEventListener('click', e => {
  if (e.target.closest('[data-act]')) { handleEventAction(e); return; }
  // Klick auf freie Fläche springt an diese Stelle im Video
  const r = $('#strip').getBoundingClientRect();
  if (yt.isReady()) yt.seek((e.clientX - r.left) / r.width * yt.duration());
});
// Regler: beim Ziehen Vorschau im Video, beim Loslassen übernehmen
$('#events').addEventListener('input', e => {
  if (e.target.type !== 'range') return;
  yt.seek(Number(e.target.value));
  const vt = e.target.closest('.event').querySelector('.ev-vt');
  vt.firstChild.textContent = fmt(Number(e.target.value));
});
$('#events').addEventListener('change', e => {
  if (e.target.type !== 'range') return;
  const ev = findEvent(e.target.dataset.id);
  if (ev) { place(ev, Number(e.target.value)); commit(); }
});

// ===== Einstellungen =====
$('#periodLenInput').addEventListener('change', e => { state.periodLen = Math.max(60, Number(e.target.value) * 60); commit(); });
$('#otLenInput').addEventListener('change', e => { state.otLen = Math.max(60, Number(e.target.value) * 60); commit(); });
$('#pauseLenInput').addEventListener('change', e => { state.pauseLen = Math.max(60, Number(e.target.value) * 60); commit(); });
$('#leadInput').addEventListener('change', e => { state.leadIn = Math.max(0, Number(e.target.value)); commit(); });
$('#penaltyCheck').addEventListener('change', e => { state.includePenalties = e.target.checked; commit(); });
$('#youthCheck').addEventListener('change', e => { state.hideYouth = e.target.checked; commit(); });

// ===== Export und Import =====
$('#copyBtn').addEventListener('click', async () => {
  const b = $('#copyBtn'), text = $('#chapters').value;
  try { await navigator.clipboard.writeText(text); }
  catch (e) { $('#chapters').select(); document.execCommand('copy'); }
  b.textContent = 'Kopiert';
  setTimeout(() => { b.textContent = 'Kapitel kopieren'; }, 1500);
});
$('#saveSyncBtn').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(buildSyncFile(), null, 2)], { type: 'application/json' }));
  a.download = syncFileName();
  a.click();
  URL.revokeObjectURL(a.href);
});
$('#syncInput').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  const n = $('#chapterNote');
  try {
    const d = JSON.parse(await f.text());
    applySyncFile(d);
    if (d.video_id && d.video_id !== state.videoId) { $('#videoInput').value = d.video_id; state.videoId = d.video_id; yt.loadVideo(d.video_id); }
    commit();
  } catch (err) { n.textContent = err.message; n.classList.add('warn'); }
  e.target.value = '';
});
$('#resetBtn').addEventListener('click', () => {
  state.game = null; ui.selectedId = null;
  yt.pause();
  $('#app').hidden = true; $('#loader').hidden = false; $('#matchline').innerHTML = '';
});

// ===== Tastatur =====
document.addEventListener('keydown', e => {
  if (!state.game || e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = e.target.tagName;
  if (tag === 'TEXTAREA' || (tag === 'INPUT' && !['range', 'checkbox'].includes(e.target.type))) return;
  const k = e.key.toLowerCase();
  if (k === 'k' || k === ' ') { e.preventDefault(); yt.togglePlay(); }
  else if (k === 'j') yt.seek(yt.now() - 5);
  else if (k === 'l') yt.seek(yt.now() + 5);
  else if (k === ',') yt.seek(yt.now() - 1);
  else if (k === '.') yt.seek(yt.now() + 1);
  else if (k === 'enter' && ui.selectedId != null) { e.preventDefault(); const ev = findEvent(ui.selectedId); if (ev) { place(ev, yt.now()); commit(); } }
  else if (k === 'n') {
    const evs = events(), i = evs.findIndex(x => x.event_id === ui.selectedId);
    const next = evs[(i + 1) % evs.length];
    ui.selectedId = next.event_id;
    const t = timeOf(next); if (t != null) yt.seek(t - 3);
    renderAll();
    const row = document.querySelector(`[data-row="${ui.selectedId}"]`); if (row) row.scrollIntoView({ block: 'nearest' });
  }
});

// Uhr und Abspielposition aktualisieren
setInterval(updateClock, 250);
