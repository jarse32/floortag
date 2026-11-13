// ===== Speichern: lokal im Browser und als Sync-Datei =====
import { state } from './state.js';
import { events } from './game.js';
import { fmtGame, parseTime } from './format.js';
import { codeOf, TAG_STANDARD_VERSION } from './tags.js';
import { computeProgress, gameMeta } from './progress.js';

const SYNC_VERSION = 2;

function storageKey() { return `floortag:${state.game && state.game.id}:${state.videoId || 'ohne-video'}`; }

export function save() {
  if (state.sharedView) return; // geteilte Ansicht überschreibt nie den eigenen Stand
  try {
    localStorage.setItem(storageKey(), JSON.stringify({
      periods: state.periods, placed: state.placed, anchors: state.anchors, missing: state.missing, gsFix: state.gsFix, ppStart: state.ppStart,
      periodLen: state.periodLen, otLen: state.otLen, pauseLen: state.pauseLen, ppDelay: state.ppDelay,
      leadIn: state.leadIn, leadOut: state.leadOut, fps: state.fps, edlScope: state.edlScope, counterLen: state.counterLen,
      kleinfeld: state.kleinfeld, includePenalties: state.includePenalties, chapterPowerplay: state.chapterPowerplay, chapterTags: state.chapterTags, hideYouth: state.hideYouth,
      syncSource: state.syncSource, lengthSource: state.lengthSource
    }));
  } catch (e) { /* Speicher nicht verfügbar */ }
  saveMeta();
}

// ===== Eckdaten und Fortschritt für die Übersicht =====
// floortag-meta:<Spiel>:<Video> = { …Eckdaten, progress, updated }
export function metaKey(gameId = state.game && state.game.id, videoId = state.videoId) {
  return `floortag-meta:${gameId}:${videoId || 'ohne-video'}`;
}
export function saveMeta() {
  if (state.sharedView || !state.game) return;
  try {
    localStorage.setItem(metaKey(), JSON.stringify({ ...gameMeta(), progress: computeProgress(), updated: new Date().toISOString() }));
  } catch (e) { /* Speicher nicht verfügbar */ }
}
// Videos mit eigenem Stand zu einem Spiel in diesem Browser, zuletzt bearbeitetes zuerst
export function ownVideos(gameId, store = localStorage) {
  const found = new Map();
  try {
    for (let i = 0; i < store.length; i++) {
      const m = (store.key(i) || '').match(/^floortag(?:-tags|-meta)?:(\d+):(.+)$/);
      if (!m || Number(m[1]) !== Number(gameId) || m[2] === 'ohne-video') continue;
      let updated = '';
      try { updated = (JSON.parse(store.getItem(`floortag-meta:${m[1]}:${m[2]}`) || 'null') || {}).updated || ''; } catch (e) { /* ohne Datum */ }
      found.set(m[2], updated);
    }
  } catch (e) { /* Speicher nicht verfügbar */ }
  return [...found].sort((a, b) => b[1].localeCompare(a[1])).map(([v]) => v);
}

// ===== Von Hand gewähltes Video pro Spiel =====
// Der Video-Link im Saisonmanager ist manchmal falsch. Wer das Video von Hand wechselt,
// bekommt es beim nächsten Laden wieder: floortag-video:<Spiel> = Video-ID.
function choiceKey(gameId) { return `floortag-video:${gameId}`; }
export function videoChoice(gameId, store = localStorage) {
  try { return store.getItem(choiceKey(gameId)) || null; } catch (e) { return null; }
}
// Gleich dem Saisonmanager-Video: Wahl löschen, dann gilt wieder der Saisonmanager
export function setVideoChoice(gameId, videoId, smId, store = localStorage) {
  if (state.sharedView || !gameId) return;
  try {
    if (!videoId || videoId === smId) store.removeItem(choiceKey(gameId));
    else store.setItem(choiceKey(gameId), videoId);
  } catch (e) { /* Speicher nicht verfügbar */ }
}
// Gibt es zu diesem Video schon eigene Arbeit (Drittel, Ereignisse, Anker, „nicht im Video“ oder Tags)?
// Nur übernommene Ligalängen zählen nicht, die entstehen schon beim bloßen Öffnen.
export function hasOwnWork(gameId, videoId, store = localStorage) {
  const filled = o => !!o && typeof o === 'object' && Object.keys(o).length > 0;
  try {
    const s = JSON.parse(store.getItem(`floortag:${gameId}:${videoId}`) || 'null');
    if (s && (filled(s.periods) || filled(s.placed) || filled(s.anchors) || filled(s.missing))) return true;
    const t = JSON.parse(store.getItem(`floortag-tags:${gameId}:${videoId}`) || 'null');
    return Array.isArray(t) ? t.length > 0 : !!(t && t.tags && t.tags.length);
  } catch (e) { return false; }
}
// Welches Video beim Laden eines Spiels? Reihenfolge: Teilen-/Szenen-Link bzw. ?video=,
// von Hand gewählt, Saisonmanager – außer es gibt nur zu einem anderen Video eigene Arbeit –,
// zuletzt bearbeitetes eigenes Video. source: forced | choice | sm | own | null
export function pickVideo({ forced = null, choice = null, smId = null, own = [], hasWork = () => false }) {
  if (forced) return { id: forced, source: 'forced' };
  if (choice) return { id: choice, source: 'choice' };
  if (smId) {
    const other = own.find(v => v !== smId && hasWork(v));
    if (other && !hasWork(smId)) return { id: other, source: 'own' };
    return { id: smId, source: 'sm' };
  }
  if (own.length) return { id: own[0], source: 'own' };
  return { id: null, source: null };
}

// Liefert true, wenn es für dieses Spiel und Video einen eigenen Sync-Stand gab
export function restore() {
  state.periods = {}; state.placed = {}; state.anchors = {}; state.missing = {}; state.gsFix = {}; state.ppStart = {}; state.tags = []; state.complete = {}; state.lineups = {};
  state.syncSource = null; state.lengthSource = null;
  let hadLocal = false;
  try {
    const raw = localStorage.getItem(storageKey());
    hadLocal = !!raw;
    if (raw) { const { tags, ...rest } = JSON.parse(raw); Object.assign(state, rest); sanitizeSettings(); }
    const rawTags = localStorage.getItem(tagKey());
    if (rawTags) {
      const d = JSON.parse(rawTags);
      // Früher nur die Tag-Liste, jetzt { tags, complete }
      state.tags = Array.isArray(d) ? d : d.tags || [];
      state.complete = Array.isArray(d) ? {} : d.complete || {};
      state.lineups = Array.isArray(d) ? {} : d.lineups || {};
    }
  } catch (e) { /* ignorieren */ }
  return hadLocal;
}

// Einstellungen auf gültige Werte bringen (z. B. nach einem leeren Eingabefeld in einer älteren Version).
// Ohne gültige Drittellänge fehlt das Drittelende als Anker und alle Schätzungen verrutschen.
const SETTING_RULES = {
  periodLen: [300, 1800, 1200], otLen: [60, 1200, 600], pauseLen: [60, 1800, 600],
  leadIn: [0, 30, 8], leadOut: [0, 60, 5], counterLen: [2, 60, 10], ppDelay: [0, 180, 30]
};
export function sanitizeSettings() {
  const fixed = [];
  for (const [key, [min, max, def]] of Object.entries(SETTING_RULES)) {
    const v = state[key];
    if (typeof v !== 'number' || !isFinite(v) || v < min || v > max) { state[key] = def; fixed.push(key); }
  }
  if (![24, 25, 30, 50, 60].includes(state.fps)) { state.fps = 25; fixed.push('fps'); }
  // Ältere Stände ohne Auswahl: keine Tags als Kapitel
  state.chapterTags = Array.isArray(state.chapterTags) ? state.chapterTags.filter(k => typeof k === 'string') : [];
  state.chapterPowerplay = state.chapterPowerplay === true;
  return fixed;
}

// ===== Eigene Tags: eigene Ebene, eigener Speicherplatz und eigene Datei =====
// Getrennt vom Sync, weil Tags später pro Person oder Verein gehören (Etappe 4)
function tagKey() { return `floortag-tags:${state.game && state.game.id}:${state.videoId || 'ohne-video'}`; }
export function saveTags() {
  if (state.sharedView) return;
  try { localStorage.setItem(tagKey(), JSON.stringify({ tags: state.tags, complete: state.complete, lineups: state.lineups })); } catch (e) { /* Speicher nicht verfügbar */ }
  saveMeta();
}
export function buildTagFile() {
  return {
    format: 'floortag-tags', version: 1, standard: TAG_STANDARD_VERSION,
    game_id: state.game.id, video_id: state.videoId, created: new Date().toISOString(),
    tags: state.tags, complete: state.complete, lineups: state.lineups
  };
}
export function tagFileName() {
  return `floortag-tags-${state.game.id}-${state.videoId || 'ohne-video'}.json`;
}
// Übernimmt eine Tag-Datei; unbekannte Codes (z. B. aus einem neueren Standard) werden übersprungen
export function applyTagFile(d) {
  if (d.format !== 'floortag-tags') throw new Error('Das ist keine FloorTag-Tag-Datei.');
  if ((d.version || 1) > 1) throw new Error('Diese Tag-Datei stammt aus einer neueren FloorTag-Version.');
  if (d.game_id !== state.game.id) throw new Error(`Die Tag-Datei gehört zu Spiel ${d.game_id}, geladen ist Spiel ${state.game.id}.`);
  const tags = (d.tags || []).filter(t => t && codeOf(t.code) && typeof t.v === 'number');
  state.tags = tags.map(t => ({ players: { home: null, guest: null }, comment: '', place: null, outcome: null, ...t }))
    .sort((a, b) => a.v - b.v);
  state.complete = d.complete || {};
  state.lineups = d.lineups || {};
  return { loaded: state.tags.length, skipped: (d.tags || []).length - state.tags.length };
}

// Sync-Datei zum Herunterladen
// Version 2: freie Anker, „nicht im Video“ und Pausenlänge ergänzt
export function buildSyncFile() {
  const freeAnchors = [];
  for (const [p, list] of Object.entries(state.anchors)) {
    for (const a of list) freeAnchors.push({ period: Number(p), time: fmtGame(a.g), video_sec: a.v });
  }
  return {
    format: 'floortag-sync', version: SYNC_VERSION,
    game_id: state.game.id, video_id: state.videoId, created: new Date().toISOString(),
    period_length_sec: state.periodLen, overtime_length_sec: state.otLen, pause_length_sec: state.pauseLen,
    periods: state.periods,
    events: events().filter(e => state.placed[e.event_id] != null).map(e => ({
      event_id: e.event_id, period: e.period, time: e.time, video_sec: state.placed[e.event_id]
    })),
    free_anchors: freeAnchors,
    not_in_video: events().filter(e => state.missing[e.event_id]).map(e => e.event_id),
    // Spielzeiten, die im Saisonmanager falsch stehen (optional, ältere Versionen ignorieren das Feld)
    game_time_fixes: events().filter(e => state.gsFix[e.event_id] != null).map(e => ({ event_id: e.event_id, time: fmtGame(state.gsFix[e.event_id]) })),
    // Beginn der Über-/Unterzahl nach Strafen und geschätzter Abstand (optional)
    pp_starts: events().filter(e => state.ppStart[e.event_id] != null).map(e => ({ event_id: e.event_id, video_sec: state.ppStart[e.event_id] })),
    pp_delay_sec: state.ppDelay
  };
}
export function syncFileName() {
  return `floortag-sync-${state.game.id}-${state.videoId || 'ohne-video'}.json`;
}
// Übernimmt eine Sync-Datei (Version 1 oder 2) in den Zustand; das Video wechselt der Aufrufer
export function applySyncFile(d) {
  if (d.format !== 'floortag-sync') throw new Error('Das ist keine FloorTag-Sync-Datei.');
  if ((d.version || 1) > SYNC_VERSION) throw new Error('Diese Sync-Datei stammt aus einer neueren FloorTag-Version.');
  if (d.game_id !== state.game.id) throw new Error(`Die Sync-Datei gehört zu Spiel ${d.game_id}, geladen ist Spiel ${state.game.id}.`);
  state.periods = d.periods || {};
  state.placed = {};
  for (const x of d.events || []) state.placed[x.event_id] = x.video_sec;
  state.anchors = {};
  for (const a of d.free_anchors || []) {
    (state.anchors[a.period] = state.anchors[a.period] || []).push({ g: parseTime(a.time), v: a.video_sec });
  }
  for (const list of Object.values(state.anchors)) list.sort((x, y) => x.g - y.g);
  state.missing = {};
  for (const id of d.not_in_video || []) state.missing[id] = true;
  state.gsFix = {};
  for (const f of d.game_time_fixes || []) if (Number.isInteger(f.event_id) && /^\d{1,3}:\d{2}$/.test(f.time || '')) state.gsFix[f.event_id] = parseTime(f.time);
  state.ppStart = {};
  for (const x of d.pp_starts || []) if (Number.isInteger(x.event_id) && typeof x.video_sec === 'number' && x.video_sec >= 0) state.ppStart[x.event_id] = x.video_sec;
  if (typeof d.pp_delay_sec === 'number') state.ppDelay = d.pp_delay_sec;
  if (d.period_length_sec) state.periodLen = d.period_length_sec;
  if (d.overtime_length_sec) state.otLen = d.overtime_length_sec;
  if (d.pause_length_sec) state.pauseLen = d.pause_length_sec;
  sanitizeSettings();
}
