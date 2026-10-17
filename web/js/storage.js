// ===== Speichern: lokal im Browser und als Sync-Datei =====
import { state } from './state.js';
import { events } from './game.js';

function storageKey() { return `floortag:${state.game && state.game.id}:${state.videoId || 'ohne-video'}`; }

export function save() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify({
      periods: state.periods, placed: state.placed, periodLen: state.periodLen, otLen: state.otLen, pauseLen: state.pauseLen,
      leadIn: state.leadIn, includePenalties: state.includePenalties, hideYouth: state.hideYouth
    }));
  } catch (e) { /* Speicher nicht verfügbar */ }
}
export function restore() {
  state.periods = {}; state.placed = {};
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch (e) { /* ignorieren */ }
}

// Sync-Datei zum Herunterladen
export function buildSyncFile() {
  return {
    format: 'floortag-sync', version: 1,
    game_id: state.game.id, video_id: state.videoId, created: new Date().toISOString(),
    period_length_sec: state.periodLen, overtime_length_sec: state.otLen,
    periods: state.periods,
    events: events().filter(e => state.placed[e.event_id] != null).map(e => ({
      event_id: e.event_id, period: e.period, time: e.time, video_sec: state.placed[e.event_id]
    }))
  };
}
export function syncFileName() {
  return `floortag-sync-${state.game.id}-${state.videoId || 'ohne-video'}.json`;
}
// Übernimmt eine Sync-Datei in den Zustand; das Video wechselt der Aufrufer
export function applySyncFile(d) {
  if (d.format !== 'floortag-sync') throw new Error('Das ist keine FloorTag-Sync-Datei.');
  if (d.game_id !== state.game.id) throw new Error(`Die Sync-Datei gehört zu Spiel ${d.game_id}, geladen ist Spiel ${state.game.id}.`);
  state.periods = d.periods || {};
  state.placed = {};
  for (const x of d.events || []) state.placed[x.event_id] = x.video_sec;
  if (d.period_length_sec) state.periodLen = d.period_length_sec;
  if (d.overtime_length_sec) state.otLen = d.overtime_length_sec;
}
