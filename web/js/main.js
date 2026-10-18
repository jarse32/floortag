// ===== Einstieg: Spiel laden und Bedienung verdrahten =====
import { state, ui } from './state.js';
import { extractVideoId, fmt, fmtGame, esc } from './format.js';
import { prepareGame, events, findEvent, periodLength } from './game.js';
import { timeOf, place, setMissing, addAnchor, removeAnchor } from './sync.js';
import { save, restore, buildSyncFile, syncFileName, applySyncFile, saveTags, buildTagFile, tagFileName, applyTagFile } from './storage.js';
import { CATALOG, codeOf, addTag, findTag, updateTag, setPlayer, removeTag, openPhase, nextShootoutTeam } from './tags.js';
import { buildClips, toSportscodeXml, toCsv, toEdl } from './export.js';
import * as yt from './player.js';
import { hasConsent, giveConsent, revokeConsent, isRemembered } from './consent.js';
import { $, renderAll, renderMatchline, renderStrip, updateClock, showPlayerMessage } from './render.js';
import { statsAsTsv } from './stats.js';
import { SHARE_PREFIX, decodeShare, applySharePayload, shareUrl } from './share.js';
import { GUIDES, introSeen, markIntroSeen } from './help.js';
import { toggleLineupPlayer } from './lineups.js';

// Zustand geändert: speichern und neu zeichnen
function commit() { save(); renderAll(); }

yt.initPlayer('player', {
  onLoad: () => { $('#playerEmpty').hidden = true; $('#consent').hidden = true; },
  onReady: () => { yt.setRate(ui.rate); renderAll(); renderRates(); },
  onRateChange: () => { ui.rate = yt.getRate(); renderRates(); },
  onStateChange: renderStrip,
  onError: showPlayerMessage
});

// ===== Modus: Ansehen, Sync, Analyse =====
// Wahl wird im Browser gemerkt; ?modus=ansehen|sync|analyse in der Adresse hat Vorrang
const MODES = { ansehen: 'view', sync: 'sync', analyse: 'analysis' };
function initMode() {
  let saved = null;
  try { saved = localStorage.getItem('floortag:mode'); } catch (e) { /* ignorieren */ }
  const fromUrl = MODES[new URLSearchParams(location.search).get('modus')];
  ui.mode = fromUrl || (Object.values(MODES).includes(saved) ? saved : 'sync');
}
document.querySelectorAll('.modes [data-mode]').forEach(b => b.addEventListener('click', () => {
  ui.mode = b.dataset.mode;
  try { localStorage.setItem('floortag:mode', ui.mode); } catch (e) { /* ignorieren */ }
  if (ui.mode !== 'analysis') ui.tagId = null;
  if (ui.mode === 'sync') ui.sideTab = 'events';
  ui.jumpFrom = null;
  const url = new URL(location.href); url.searchParams.delete('modus'); history.replaceState(null, '', url);
  renderAll();
  if (state.game && !introSeen(ui.mode)) openHelp(ui.mode);
}));
initMode();
renderAll();

// Ereignis auswählen. Ansehen: Szene ab Vorlauf abspielen. Sync/Analyse: zur Szene springen und
// die vorherige Stelle merken, damit man das Ereignis dort setzen kann („Dort setzen“).
function selectEvent(ev, toggleOff) {
  const t = timeOf(ev);
  if (ui.mode === 'view') {
    ui.selectedId = ev.event_id;
    if (t != null) { yt.seek(t - state.leadIn); yt.play(); }
    renderAll();
    return;
  }
  ui.selectedId = toggleOff ? null : ev.event_id;
  ui.jumpFrom = null;
  if (ui.selectedId && t != null) {
    const from = yt.now();
    if (yt.isReady() && Math.abs(from - (t - 3)) > 5) ui.jumpFrom = Math.round(from * 10) / 10;
    yt.seek(t - 3);
  }
  renderAll();
  const row = document.querySelector(`[data-row="${ev.event_id}"]`); if (row) row.scrollIntoView({ block: 'nearest' });
}

// ===== Anleitung =====
let helpMode = 'sync';
function openHelp(mode = ui.mode) {
  helpMode = GUIDES[mode] ? mode : 'sync';
  renderHelp();
  const d = $('#helpDialog');
  if (!d.open) d.showModal();
  markIntroSeen(helpMode);
}
function renderHelp() {
  const g = GUIDES[helpMode];
  // „Zeigen“ nur für Stellen, die im aktuellen Modus sichtbar sind
  const visible = sel => { const el = document.querySelector(sel); return !!el && el.offsetParent !== null; };
  $('#helpBody').innerHTML = `
    <div class="help-head"><h2 id="helpTitle">So funktioniert FloorTag</h2><button class="help-close" data-help-close aria-label="Anleitung schließen">✕</button></div>
    <div class="segbtns help-tabs">${Object.entries(GUIDES).map(([k, v]) => `<button data-help-mode="${k}" aria-pressed="${k === helpMode}">${esc(v.label)}</button>`).join('')}</div>
    <p class="help-intro">${esc(g.intro)}</p>
    <ol class="help-steps">${g.steps.map((s, i) => `<li><div class="step"><div><strong>${esc(s.title)}</strong><p>${esc(s.text)}</p></div>${
      s.target && visible(s.target) ? `<button class="btn small ghost" data-help-show="${i}">Zeigen</button>` : ''}</div></li>`).join('')}</ol>
    ${g.tips.length ? `<h3>Tipps</h3><ul class="help-tips">${g.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    <div class="help-foot"><button class="btn" data-help-close>Los geht’s</button></div>`;
}
$('#helpBtn').addEventListener('click', () => openHelp(ui.mode));
$('#helpDialog').addEventListener('click', e => {
  const d = $('#helpDialog');
  if (e.target === d || e.target.closest('[data-help-close]')) { d.close(); return; } // Klick auf den Hintergrund schließt
  const tab = e.target.closest('[data-help-mode]');
  if (tab) { helpMode = tab.dataset.helpMode; renderHelp(); return; }
  const show = e.target.closest('[data-help-show]');
  if (show) {
    const el = document.querySelector(GUIDES[helpMode].steps[Number(show.dataset.helpShow)].target);
    d.close();
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('spotlight'); void el.offsetWidth; el.classList.add('spotlight');
    setTimeout(() => el.classList.remove('spotlight'), 2600);
  }
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

// Eigenen Stand laden; in der geteilten Ansicht stattdessen den Stand aus dem Link
function restoreState() {
  restore();
  if (ui.shared) applySharePayload(ui.shared);
}
function setVideo(id) {
  state.videoId = id;
  restoreState();
  renderAll();
  showVideo(id);
}

// ===== Spiel laden =====
function loadGame(data) {
  prepareGame(data);
  ui.selectedId = null; ui.anchorForm = null; ui.tagId = null;
  renderMatchline();
  $('#loader').hidden = true;
  $('#app').hidden = false;
  const link = ui.shared && ui.shared.vid ? `https://www.youtube.com/watch?v=${ui.shared.vid}` : data.vod_link || data.live_stream_link || '';
  $('#videoInput').value = link;
  const id = extractVideoId(link);
  if (id) setVideo(id); else { state.videoId = null; restoreState(); renderAll(); }
  // Beim ersten Spiel in diesem Modus die Anleitung zeigen
  if (!introSeen(ui.mode)) openHelp(ui.mode);
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

// ===== Abspieltempo =====
const RATES = [0.5, 1, 1.5, 2];
function setRate(r) { ui.rate = r; yt.setRate(r); renderRates(); }
function stepRate(dir) {
  const i = RATES.indexOf(ui.rate), next = RATES[Math.min(RATES.length - 1, Math.max(0, (i < 0 ? 1 : i) + dir))];
  if (next !== ui.rate && isRateAvailable(next)) setRate(next);
}
function isRateAvailable(r) {
  const avail = yt.availableRates();
  return !avail.length || avail.includes(r);
}
function renderRates() {
  document.querySelectorAll('[data-rate]').forEach(b => {
    const r = Number(b.dataset.rate);
    b.setAttribute('aria-pressed', String(r === ui.rate));
    b.disabled = !isRateAvailable(r);
  });
}
document.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', () => setRate(Number(b.dataset.rate))));

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
  if (b.dataset.act !== 'select' && b.dataset.act !== 'placeback' && b.dataset.act !== 'goback') ui.jumpFrom = null;
  const ev = findEvent(b.dataset.id); if (!ev) return;
  const t = timeOf(ev);
  switch (b.dataset.act) {
    case 'select':
      selectEvent(ev, ui.selectedId === ev.event_id);
      break;
    case 'placeback': {
      // Ereignis an die Stelle vor dem Sprung setzen und dorthin zurück
      const back = ui.jumpFrom;
      if (back == null) break;
      place(ev, back); ui.jumpFrom = null; commit(); yt.seek(back);
      break;
    }
    case 'goback': if (ui.jumpFrom != null) { yt.seek(ui.jumpFrom); ui.jumpFrom = null; renderAll(); } break;
    case 'setnow': place(ev, yt.now()); commit(); break;
    case 'jump': yt.seek(t - state.leadIn); yt.play(); break;
    case 'nudge': place(ev, t + Number(b.dataset.d)); commit(); yt.seek(timeOf(ev) - 3); break;
    case 'unplace': delete state.placed[ev.event_id]; commit(); break;
    case 'missing': setMissing(ev, true); commit(); break;
    case 'unmissing': setMissing(ev, false); commit(); break;
  }
}
$('#events').addEventListener('click', e => {
  // Aufstellung bei einem Tor
  const chip = e.target.closest('[data-lineup]');
  if (chip) {
    const [side, nr] = chip.dataset.lineup.split(':');
    toggleLineupPlayer(Number(chip.closest('[data-row]').dataset.row), side, Number(nr));
    commitTags();
    return;
  }
  handleEventAction(e);
});
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

// ===== Eigene Tags =====
function commitTags() { saveTags(); renderAll(); }
// Neuer Tag an der aktuellen Videostelle; das Video läuft weiter
function createTag(code, outcome = null, place = null) {
  const def = codeOf(code);
  if (def.phase) {
    const open = openPhase(code, ui.tagTeam);
    if (open) { updateTag(open.id, { end: yt.now() }); ui.tagId = open.id; commitTags(); return; }
  }
  const shootout = ui.shootout && code === 'penalty_shot';
  const team = shootout ? nextShootoutTeam(ui.tagTeam) : ui.tagTeam;
  ui.tagId = addTag({ code, v: yt.now(), team, outcome, place, shootout }).id;
  commitTags();
}
$('#tagbar').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset, tag = ui.tagId && findTag(ui.tagId);
  if (d.tagteam) { ui.tagTeam = d.tagteam; renderAll(); return; }
  if (d.tag) { createTag(d.tag, d.outcome || null, d.place || null); return; }
  if (!tag) return;
  if ('editTeam' in d) updateTag(tag.id, { team: d.editTeam || null });
  else if (d.editOutcome) updateTag(tag.id, { outcome: tag.outcome === d.editOutcome ? null : d.editOutcome });
  else if (d.editPlace) updateTag(tag.id, { place: tag.place === d.editPlace ? null : d.editPlace });
  else if (d.editPlayer) { const [side, nr] = d.editPlayer.split(':'); setPlayer(tag.id, side, Number(nr)); }
  else if (d.tagact === 'nudge') updateTag(tag.id, { v: tag.v + Number(d.d) });
  else if (d.tagact === 'seek') { yt.seek(tag.v - 3); return; }
  else if (d.tagact === 'endnow') updateTag(tag.id, { end: yt.now() });
  else if (d.tagact === 'delete') { removeTag(tag.id); ui.tagId = null; }
  else if (d.tagact === 'close') { ui.tagId = null; renderAll(); return; }
  else return;
  commitTags();
});
$('#tagbar').addEventListener('change', e => {
  if (e.target.id === 'shootoutCheck') { ui.shootout = e.target.checked; renderAll(); return; }
  if ('editComment' in e.target.dataset && ui.tagId) { updateTag(ui.tagId, { comment: e.target.value.trim() }); commitTags(); }
});
// Rechte Spalte: Reiter und Tag-Liste
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { ui.sideTab = b.dataset.tab; renderAll(); }));
$('#tagList').addEventListener('click', e => {
  const b = e.target.closest('[data-act="selecttag"]'); if (!b) return;
  const tag = findTag(b.dataset.id); if (!tag) return;
  if (ui.mode === 'view') { yt.seek(tag.v - state.leadIn); yt.play(); return; }
  ui.tagId = tag.id; yt.seek(tag.v - 3); renderAll();
});
// Statistik: Abschnitt wählen, Vollständigkeit abhaken, kopieren
$('#statsPanel').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.scope) { ui.statScope = b.dataset.scope === 'all' ? 'all' : Number(b.dataset.scope); renderAll(); }
  if (b.id === 'copyStatsBtn') {
    const text = statsAsTsv(ui.statScope);
    try { await navigator.clipboard.writeText(text); b.textContent = 'Kopiert'; }
    catch (err) { b.textContent = 'Kopieren nicht möglich'; }
    setTimeout(() => { b.textContent = 'Als Tabelle kopieren'; }, 1500);
  }
});
$('#statsPanel').addEventListener('change', e => {
  const team = e.target.dataset.complete; if (!team) return;
  const p = ui.statScope;
  state.complete[p] = { ...(state.complete[p] || {}), [team]: e.target.checked };
  commitTags();
});
$('#saveTagsBtn').addEventListener('click', () => download(tagFileName(), JSON.stringify(buildTagFile(), null, 2), 'application/json'));
$('#tagsInput').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  const n = $('#tagNote');
  try {
    const r = applyTagFile(JSON.parse(await f.text()));
    ui.tagId = null; commitTags();
    n.textContent = `${r.loaded} Tag(s) geladen` + (r.skipped ? `, ${r.skipped} mit unbekanntem Code übersprungen.` : '.');
  } catch (err) { n.textContent = err.message; }
  e.target.value = '';
});

// ===== Einstellungen =====
// Zahl aus einem Eingabefeld übernehmen; leere oder ungültige Eingaben stellen den alten Wert wieder her
function numberSetting(sel, key, factor = 1) {
  $(sel).addEventListener('change', e => {
    const v = e.target.value.trim().replace(',', '.'), n = Number(v);
    const ok = v !== '' && isFinite(n) && n >= Number(e.target.min) && n <= Number(e.target.max);
    if (ok) { state[key] = Math.round(n * factor); commit(); } else renderAll();
  });
}
numberSetting('#periodLenInput', 'periodLen', 60);
numberSetting('#otLenInput', 'otLen', 60);
numberSetting('#pauseLenInput', 'pauseLen', 60);
numberSetting('#leadInput', 'leadIn');
$('#penaltyCheck').addEventListener('change', e => { state.includePenalties = e.target.checked; commit(); });
$('#youthCheck').addEventListener('change', e => { state.hideYouth = e.target.checked; commit(); });
$('#kleinfeldCheck').addEventListener('change', e => { state.kleinfeld = e.target.checked; commit(); });

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
numberSetting('#leadOutInput', 'leadOut');
numberSetting('#counterLenInput', 'counterLen');
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
  // Ansehen: nur Abspielen und Blättern; Sync: keine Tag-Kürzel
  if (ui.mode === 'view' && !['k', ' ', 'j', 'l', 'h', 'ö', ',', '.', '-', '+', 'n'].includes(k)) return;
  if (ui.mode === 'sync' && (/^[1-9]$/.test(k) || ['q', 'w', 'e', 't', 'v', 'x'].includes(k))) return;
  if (k === 'k' || k === ' ') { e.preventDefault(); yt.togglePlay(); }
  else if (k === 'j') yt.seek(yt.now() - 5);
  else if (k === 'l') yt.seek(yt.now() + 5);
  else if (k === 'h') yt.seek(yt.now() - 30); // H und Ö liegen außen neben J und L
  else if (k === 'ö') yt.seek(yt.now() + 30);
  else if (k === ',') yt.seek(yt.now() - 1);
  else if (k === '.') yt.seek(yt.now() + 1);
  else if (k === '-') stepRate(-1);
  else if (k === '+') stepRate(1);
  // Tags: Ziffer = Code, Q/W/E = Ergebnis, T = Team, V/X im Penaltyschießen, Esc schließt den Nachtrag
  else if (/^[1-9]$/.test(k) && CATALOG[Number(k) - 1]) createTag(CATALOG[Number(k) - 1].key);
  else if (['q', 'w', 'e'].includes(k) && ui.tagId) {
    const tag = findTag(ui.tagId), outcome = tag && (codeOf(tag.code).outcomes || [])[['q', 'w', 'e'].indexOf(k)];
    if (outcome) { updateTag(tag.id, { outcome: outcome[0] }); commitTags(); }
  }
  else if (k === 't') { ui.tagTeam = ui.tagTeam === 'home' ? 'guest' : 'home'; renderAll(); }
  else if (ui.shootout && (k === 'v' || k === 'x')) createTag('penalty_shot', k === 'v' ? 'goal' : 'miss');
  else if (k === 'escape' && ui.tagId) { ui.tagId = null; renderAll(); }
  else if (k === 'enter' && ui.selectedId != null) { e.preventDefault(); const ev = findEvent(ui.selectedId); if (ev) { place(ev, yt.now()); commit(); } }
  else if (k === 'n') {
    const evs = events(), i = evs.findIndex(x => x.event_id === ui.selectedId);
    const next = evs[(i + 1) % evs.length];
    selectEvent(next, false);
    const row = document.querySelector(`[data-row="${ui.selectedId}"]`); if (row) row.scrollIntoView({ block: 'nearest' });
  }
});

// Uhr und Abspielposition aktualisieren
setInterval(updateClock, 250);

// Spiel aus der Adresse laden, z. B. ?spiel=58668
// Geteilter Link (#ft=…) oder Spiel aus der Adresse (?spiel=58668)
if (location.hash.startsWith(SHARE_PREFIX)) {
  decodeShare(location.hash.slice(SHARE_PREFIX.length)).then(p => {
    ui.shared = p; ui.mode = 'view'; state.sharedView = true;
    document.body.dataset.shared = '1';
    $('#shareBanner').hidden = false;
    $('#idInput').value = String(p.g);
    loadById(String(p.g));
  }).catch(err => showLoadError(`Der geteilte Link lässt sich nicht öffnen: ${err.message}`));
} else {
  const startId = extractGameId(new URLSearchParams(location.search).get('spiel'));
  if (startId) { $('#idInput').value = startId; loadById(startId); }
}
// Ein Link, der sich nur im #-Teil unterscheidet, lädt die Seite nicht neu: dann selbst neu laden
window.addEventListener('hashchange', () => { if (location.hash.startsWith(SHARE_PREFIX) || state.sharedView) location.reload(); });
// Geteilte Ansicht verlassen bzw. übernehmen
const leaveShared = () => { const url = new URL(location.href); url.hash = ''; location.replace(url.toString().replace(/#$/, '')); };
$('#ownStateBtn').addEventListener('click', leaveShared);
$('#adoptBtn').addEventListener('click', () => {
  if (!confirm('Deinen eigenen Stand für dieses Spiel durch den geteilten ersetzen? Das lässt sich nicht rückgängig machen.')) return;
  state.sharedView = false;
  save(); saveTags();
  leaveShared();
});
// Link zum Ansehen erzeugen und kopieren
$('#shareBtn').addEventListener('click', async () => {
  const b = $('#shareBtn');
  if (!state.game) { showToast('Lade zuerst ein Spiel.'); return; }
  try {
    const url = await shareUrl(location.href);
    try { await navigator.clipboard.writeText(url); }
    catch (err) {
      // Kopieren nicht erlaubt (z. B. ohne Fokus): Link zum Markieren anzeigen
      window.prompt('Link zum Ansehen (markieren und kopieren):', url);
      return;
    }
    const kb = (url.length / 1024).toFixed(1).replace('.', ',');
    showToast(`Link kopiert (${kb} kB). Er öffnet Spiel, Sync und Tags zum Ansehen. Enthalten sind Rückennummern, aber keine Namen; Kommentare in Tags stehen mit drin.` +
      (url.length > 60000 ? ' Der Link ist sehr lang, manche Messenger kürzen ihn.' : ''));
    b.textContent = 'Kopiert';
  } catch (err) { showToast(`Der Link ließ sich nicht kopieren: ${err.message}`); }
  setTimeout(() => { b.textContent = 'Link teilen'; }, 1500);
});
// Kurze Meldung oben, verschwindet von selbst
let toastTimer = null;
function showToast(text) {
  const t = $('#toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 7000);
}
$('#toast').addEventListener('click', () => { $('#toast').hidden = true; });
