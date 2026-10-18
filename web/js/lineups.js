// ===== Aufstellung bei Toren („auf dem Feld“) =====
// Gehört zur Analyse-Ebene und wird mit den Tags gespeichert: state.lineups = { event_id: { home: [nr], guest: [nr] } }
// Schütze und Vorlage stehen immer auf dem Feld und werden automatisch ergänzt.
// Torhüter bekommen wie im Eishockey kein Plus/Minus und erscheinen nicht in der Auswahl.
import { state } from './state.js';

const sides = ['home', 'guest'];

// Feste Spieler eines Tors: Schütze und Vorlage des erzielenden Teams
export function forcedPlayers(e) {
  const out = { home: [], guest: [] };
  if (e.event_type !== 'goal' || !out[e.event_team]) return out;
  for (const nr of [e.number, e.assist]) if (nr != null && !out[e.event_team].includes(nr)) out[e.event_team].push(nr);
  return out;
}
// Gespeicherte Auswahl ohne die festen Spieler
export function storedLineup(eventId) {
  const l = (state.lineups || {})[eventId] || {};
  return { home: [...(l.home || [])], guest: [...(l.guest || [])] };
}
// Vollständige Aufstellung: Auswahl plus Schütze und Vorlage, sortiert
export function lineupOf(e) {
  const stored = storedLineup(e.event_id), forced = forcedPlayers(e), out = {};
  for (const s of sides) out[s] = [...new Set([...forced[s], ...stored[s]])].sort((a, b) => a - b);
  return out;
}
// Erfasst heißt: für beide Teams mindestens ein Spieler über Schütze und Vorlage hinaus ausgewählt
export function hasLineup(e) {
  const stored = storedLineup(e.event_id);
  return stored.home.length > 0 && stored.guest.length > 0;
}
export function toggleLineupPlayer(eventId, side, nr) {
  state.lineups = state.lineups || {};
  const l = state.lineups[eventId] = state.lineups[eventId] || { home: [], guest: [] };
  l[side] = l[side].includes(nr) ? l[side].filter(x => x !== nr) : [...l[side], nr].sort((a, b) => a - b);
  if (!l.home.length && !l.guest.length) delete state.lineups[eventId];
}
// Feldspieler laut Kader (ohne Torhüter), nach Rückennummer
export function fieldPlayers(side) {
  return ((state.game && state.game.players || {})[side] || [])
    .filter(p => p.trikot_number != null && !p.goalkeeper)
    .sort((a, b) => a.trikot_number - b.trikot_number);
}
