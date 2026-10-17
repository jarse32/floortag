// ===== Speichern: lokal im Browser und als Sync-Datei =====
import { state } from './state.js';
import { events } from './game.js';
import { fmtGame, parseTime } from './format.js';

const SYNC_VERSION = 2;

function storageKey() { return `floortag:${state.game && state.game.id}:${state.videoId || 'ohne-video'}`; }

export function save() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify({
      periods: state.periods, placed: state.placed, anchors: state.anchors, missing: state.missing,
      periodLen: state.periodLen, otLen: state.otLen, pauseLen: state.pauseLen,
      leadIn: state.leadIn, includePenalties: state.includePenalties, hideYouth: state.hideYouth
    }));
  } catch (e) { /* Speicher nicht verfügbar */ }
}
export function restore() {
  state.periods = {}; state.placed = {}; state.anchors = {}; state.missing = {};
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch (e) { /* ignorieren */ }
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
    not_in_video: events().filter(e => state.missing[e.event_id]).map(e => e.event_id)
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
  if (d.period_length_sec) state.periodLen = d.period_length_sec;
  if (d.overtime_length_sec) state.otLen = d.overtime_length_sec;
  if (d.pause_length_sec) state.pauseLen = d.pause_length_sec;
}
