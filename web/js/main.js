// ===== Einstieg: Spiel laden und Bedienung verdrahten =====
import { state, ui } from './state.js';
import { extractVideoId, fmt, fmtGame } from './format.js';
import { prepareGame, events, findEvent, periodLength } from './game.js';
import { timeOf, place, setMissing, addAnchor, removeAnchor } from './sync.js';
import { save, restore, buildSyncFile, syncFileName, applySyncFile } from './storage.js';
import { buildClips, toSportscodeXml, toCsv, toEdl } from './export.js';
import * as yt from './player.js';
import { hasConsent, giveConsent, revokeConsent, isRemembered } from './consent.js';
import { $, renderAll, renderMatchline, renderStrip, updateClock, showPlayerMessage } from './render.js';

// Zustand geändert: speichern und neu zeichnen
function commit() { save(); renderAll(); }

yt.initPlayer('player', {
  onLoad: () => { $('#playerEmpty').hidden = true; $('#consent').hidden = true; },
  onReady: renderAll,
  onStateChange: renderStrip,
  onError: showPlayerMessage
});

// ===== Zwei-Klick-Lösung =====
let consentVideo = null;
// Einziger Weg zum YouTube-Player: lädt nur mit Zustimmung, sonst Hinweis
function showVideo(id) {
  if (hasConsent()) { yt.loadVideo(id); return; }
  consentVideo = id;
  $('#playerEmpty').hidden = true;
  $('#consent').hidden = false;
}
function renderRevoke() { $('#revokeWrap').hidden = !isRemembered(); }
$('#consentBtn').addEventListener('click', () => {
  giveConsent($('#consentRemember').checked);
  renderRevoke();
  if (consentVideo) yt.loadVideo(consentVideo);
});
$('#revokeBtn').addEventListener('click', () => {
  revokeConsent();
  // Neu laden, damit der Player sicher verschwindet; ?spiel= lädt das Spiel wieder
  location.reload();
});
renderRevoke();

function setVideo(id) {
  state.videoId = id;
  restore();
  renderAll();
  showVideo(id);
}

// ===== Spiel laden =====
function loadGame(data) {
  prepareGame(data);
  ui.selectedId = null; ui.anchorForm = null;
  renderMatchline();
  $('#loader').hidden = true;
  $('#app').hidden = false;
  const link = data.vod_link || data.live_stream_link || '';
  $('#videoInput').value = link;
  const id = extractVideoId(link);
  if (id) setVideo(id); else { state.videoId = null; restore(); renderAll(); }
}
function showLoadError(msg) {
  const err = $('#loadError');
  err.textContent = msg; err.hidden = !msg;
}
function handleText(text) {
  try { loadGame(JSON.parse(text)); showLoadError(''); }
  catch (e) { showLoadError(e instanceof SyntaxError ? 'Die Datei enthält kein gültiges JSON.' : e.message); }
}

// Spiel-ID aus einer Eingabe: nackte Zahl oder Saisonmanager-Link
function extractGameId(input) {
  const s = String(input || '').trim();
  if (/^\d{1,9}$/.test(s)) return s;
  const m = s.match(/(?:game|games|spiel)\/(\d{1,9})/i) || s.match(/(\d{3,9})(?!.*\d)/);
  return m ? m[1] : null;
}
// Lädt ein Spiel über den Proxy (api/game.php) und merkt die ID in der Adresse
async function loadById(id) {
  const btn = $('#idBtn');
  btn.disabled = true; btn.textContent = 'Lädt …';
  try {
    const res = await fetch(`api/game.php?id=${encodeURIComponent(id)}`);
    const type = res.headers.get('Content-Type') || '';
    if (!type.includes('application/json')) throw new Error('Der Proxy antwortet nicht. Lokal muss das Frontend über „php -S localhost:8000 -t web“ laufen.');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Fehler ${res.status} beim Laden.`);
    loadGame(data);
    showLoadError('');
    const url = new URL(location.href);
    url.searchParams.set('spiel', id);
    history.replaceState(null, '', url);
  } catch (e) {
    showLoadError(e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Spiel laden';
  }
}
$('#idForm').addEventListener('submit', e => {
  e.preventDefault();
  const id = extractGameId($('#idInput').value);
  if (id) loadById(id);
  else showLoadError('Daraus konnte keine Spiel-ID gelesen werden. Gib eine Zahl wie 58668 ein.');
});

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
  const p = Number(b.dataset.p), kind = b.dataset.kind, i = Number(b.dataset.i);
  switch (b.dataset.act) {
    case 'setmark': (state.periods[p] = state.periods[p] || {})[kind] = Math.round(yt.now() * 10) / 10; commit(); break;
    case 'clearmark': if (state.periods[p]) { state.periods[p][kind] = null; commit(); } break;
    case 'seekmark': yt.seek(state.periods[p][kind]); break;
    case 'seeksuggest': yt.seek(Number(b.dataset.t) - 5); break;
    // Freie Anker: Videozeit wird beim Öffnen festgehalten, Spielzeit vorgeschlagen
    case 'openanchor': ui.anchorForm = { p, v: Math.round(yt.now() * 10) / 10 }; renderAll(); focusAnchorInput(); break;
    case 'cancelanchor': ui.anchorForm = null; renderAll(); break;
    case 'seekanchor': yt.seek(state.anchors[p][i].v); break;
    case 'removeanchor': removeAnchor(p, i); commit(); break;
  }
});
$('#periods').addEventListener('submit', e => {
  e.preventDefault();
  const f = ui.anchorForm; if (!f) return;
  const raw = e.target.elements.g.value.trim();
  const m = raw.match(/^(\d{1,2})[:.](\d{2})$/);
  const g = m && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
  const len = periodLength(f.p);
  if (g == null) f.error = 'Gib die Spielzeit als mm:ss ein, z. B. 14:30.';
  else if (len && g > len) f.error = `Die Spielzeit darf höchstens ${fmtGame(len)} sein.`;
  else { addAnchor(f.p, g, f.v); ui.anchorForm = null; commit(); return; }
  renderAll(); focusAnchorInput();
});
function focusAnchorInput() {
  const input = document.querySelector('.anchor-form input');
  if (input) { input.focus(); input.select(); }
}

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
    case 'missing': setMissing(ev, true); commit(); break;
    case 'unmissing': setMissing(ev, false); commit(); break;
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
// Datei im Browser zum Speichern anbieten
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
$('#saveSyncBtn').addEventListener('click', () => download(syncFileName(), JSON.stringify(buildSyncFile(), null, 2), 'application/json'));

// Analyse-Export
const exportBase = () => `floortag-${state.game.id}-${state.videoId || 'ohne-video'}`;
$('#xmlBtn').addEventListener('click', () => download(`${exportBase()}-sportscode.xml`, toSportscodeXml(buildClips()), 'application/xml'));
// BOM, damit Excel die Umlaute richtig liest
$('#csvBtn').addEventListener('click', () => download(`${exportBase()}.csv`, '\uFEFF' + toCsv(buildClips()), 'text/csv'));
$('#edlBtn').addEventListener('click', () => {
  const g = state.game;
  const edl = toEdl(buildClips(), { fps: state.fps, scope: state.edlScope, clipName: `${state.videoId || 'video'}.mp4`,
    title: `${g.home_team_short_name}-${g.guest_team_short_name} ${g.date || ''}`.trim() });
  if (!edl.count) { const n = $('#clipNote'); n.textContent = 'Für diese Auswahl gibt es noch keine Szenen mit Zeit.'; return; }
  download(`${exportBase()}-${state.edlScope}.edl`, edl.text, 'text/plain');
});
$('#leadOutInput').addEventListener('change', e => { state.leadOut = Math.max(0, Number(e.target.value)); commit(); });
$('#fpsInput').addEventListener('change', e => { state.fps = Number(e.target.value); commit(); });
$('#edlScopeInput').addEventListener('change', e => { state.edlScope = e.target.value; commit(); });
$('#syncInput').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  const n = $('#chapterNote');
  try {
    const d = JSON.parse(await f.text());
    applySyncFile(d);
    if (d.video_id && d.video_id !== state.videoId) { $('#videoInput').value = d.video_id; state.videoId = d.video_id; showVideo(d.video_id); }
    commit();
  } catch (err) { n.textContent = err.message; n.classList.add('warn'); }
  e.target.value = '';
});
$('#resetBtn').addEventListener('click', () => {
  state.game = null; ui.selectedId = null;
  yt.pause();
  $('#app').hidden = true; $('#loader').hidden = false; $('#matchline').innerHTML = '';
  const url = new URL(location.href);
  url.searchParams.delete('spiel');
  history.replaceState(null, '', url);
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

// Spiel aus der Adresse laden, z. B. ?spiel=58668
const startId = extractGameId(new URLSearchParams(location.search).get('spiel'));
if (startId) { $('#idInput').value = startId; loadById(startId); }
