// ===== Sync-Logik: Ankerpunkte und Interpolation =====
import { state } from './state.js';
import { events, periodLength, periodList, gameSec } from './game.js';

// Anker eines Abschnitts: Beginn, Ende, freie Anker und alle gesetzten Ereignisse.
// exclude = { id } für ein Ereignis oder { anchor } für den Index eines freien Ankers
function anchors(p, exclude = {}) {
  const a = [], ps = state.periods[p] || {}, len = periodLength(p);
  if (ps.start != null) a.push({ g: 0, v: ps.start });
  if (ps.end != null && len > 0) a.push({ g: len, v: ps.end });
  (state.anchors[p] || []).forEach((x, i) => { if (i !== exclude.anchor) a.push({ g: x.g, v: x.v }); });
  for (const e of events()) {
    if (Math.floor(e.period) === p && e.event_id !== exclude.id && state.placed[e.event_id] != null && !state.missing[e.event_id]) {
      a.push({ g: gameSec(e), v: state.placed[e.event_id] });
    }
  }
  return a.sort((x, y) => x.g - y.g || x.v - y.v);
}
// Videozeit zu Spielzeit g aus den umliegenden Ankerpunkten
function interpolate(a, g) {
  if (!a.length) return null;
  let before = null, after = null;
  for (const x of a) {
    if (x.g <= g) before = x;
    if (x.g >= g && !after) after = x;
  }
  if (before && after) {
    if (after.g === before.g) return before.v;
    return before.v + (g - before.g) / (after.g - before.g) * (after.v - before.v);
  }
  // Nur ein Anker auf einer Seite: Spielzeit läuft 1:1 mit der Videozeit
  if (before) return before.v + (g - before.g);
  return after.v - (after.g - g);
}
// Schätzt die Videozeit eines Ereignisses
function estimate(e) {
  return interpolate(anchors(Math.floor(e.period), { id: e.event_id }), gameSec(e));
}
// Videozeit zu einer beliebigen Spielzeit g im Abschnitt p (z. B. Beginn und Ende von Phasen)
export function videoTimeAt(p, g) {
  return interpolate(anchors(p), g);
}
// Abschnitt und Spielzeit zu einer Videozeit, soweit die Drittelgrenzen das hergeben
export function periodAtVideo(v) {
  let found = null;
  for (const p of periodList()) {
    const st = state.periods[p] || {};
    if (st.start != null && v >= st.start && (st.end == null || v <= st.end)) found = p;
  }
  return found == null ? null : { p: found, g: gameTimeAt(found, v) };
}
// Videozeit eines Ereignisses; null, wenn unbekannt oder nicht im Video
export function timeOf(e) {
  if (state.missing[e.event_id]) return null;
  return state.placed[e.event_id] != null ? state.placed[e.event_id] : estimate(e);
}
// Rückwärts: geschätzte Spielzeit im Abschnitt p zur Videozeit v (für das Anker-Formular)
export function gameTimeAt(p, v) {
  const a = anchors(p).sort((x, y) => x.v - y.v || x.g - y.g);
  if (!a.length) return null;
  let before = null, after = null;
  for (const x of a) {
    if (x.v <= v) before = x;
    if (x.v >= v && !after) after = x;
  }
  let g;
  if (before && after) g = after.v === before.v ? before.g : before.g + (v - before.v) / (after.v - before.v) * (after.g - before.g);
  else if (before) g = before.g + (v - before.v);
  else g = after.g - (after.v - v);
  const len = periodLength(p);
  return Math.round(Math.min(Math.max(g, 0), len || Infinity));
}
// Grenzen zwischen den benachbarten Ankern für Spielzeit g
function boundsFor(a, g) {
  let lo = -Infinity, hi = Infinity;
  for (const x of a) {
    if (x.g < g) lo = Math.max(lo, x.v);
    if (x.g > g) hi = Math.min(hi, x.v);
  }
  return { lo, hi };
}
// Grenzen: Ein Ereignis darf nicht vor dem vorherigen oder nach dem nächsten Anker liegen
export function bounds(e) {
  return boundsFor(anchors(Math.floor(e.period), { id: e.event_id }), gameSec(e));
}
function clamp(v, { lo, hi }) {
  let val = v;
  if (isFinite(lo)) val = Math.max(lo, val);
  if (isFinite(hi)) val = Math.min(hi, val);
  return Math.max(0, Math.round(val * 10) / 10);
}
// Verhältnis echte Dauer zu Spielzeit, gelernt aus fertig markierten Dritteln
function durationFactor() {
  const r = [];
  for (const p of [1, 2, 3]) {
    const st = state.periods[p] || {};
    if (st.start != null && st.end != null && st.end > st.start) r.push((st.end - st.start) / periodLength(p));
  }
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 1.35; // Startwert ohne Erfahrung
}
export function suggestEnd(p) {
  const st = state.periods[p] || {};
  if (st.start == null || !periodLength(p)) return null;
  return st.start + periodLength(p) * durationFactor();
}
export function suggestStart(p) {
  if (p < 2 || p > 3) return null;
  const prev = state.periods[p - 1] || {};
  return prev.end != null ? prev.end + state.pauseLen : null;
}

// Setzt ein Ereignis als Anker, begrenzt auf die benachbarten Anker.
// Rückgabe: die gewünschte Videozeit, wenn sie mehr als 1 s außerhalb der Reihenfolge lag, sonst null
export function place(e, v) {
  delete state.missing[e.event_id];
  const val = clamp(v, bounds(e));
  state.placed[e.event_id] = val;
  return Math.abs(val - Math.max(0, v)) > 1 ? Math.max(0, Math.round(v * 10) / 10) : null;
}
// Spielzeit, die zur Videozeit v passen würde, geschätzt ohne das Ereignis selbst
export function gameTimeFor(e, v) {
  const p = Math.floor(e.period);
  const a = anchors(p, { id: e.event_id }).sort((x, y) => x.v - y.v || x.g - y.g);
  if (!a.length) return null;
  let before = null, after = null;
  for (const x of a) {
    if (x.v <= v) before = x;
    if (x.v >= v && !after) after = x;
  }
  let g;
  if (before && after) g = after.v === before.v ? before.g : before.g + (v - before.v) / (after.v - before.v) * (after.g - before.g);
  else if (before) g = before.g + (v - before.v);
  else g = after.g - (after.v - v);
  return Math.round(Math.min(Math.max(g, 0), periodLength(p) || Infinity));
}
// Spielzeit korrigieren (Saisonmanager falsch) und das Ereignis an Videozeit v setzen; g = null nimmt die Korrektur zurück
export function correctGameTime(e, g, v = null) {
  if (Math.floor(e.period) === 5) return;
  if (g == null || g === state.gs[e.event_id]) delete state.gsFix[e.event_id];
  else state.gsFix[e.event_id] = g;
  if (v != null) place(e, v);
  else if (state.placed[e.event_id] != null) place(e, state.placed[e.event_id]); // in die neuen Grenzen einpassen
}

// Ereignis als „nicht im Video“ markieren oder zurücknehmen; ein gesetzter Anker entfällt dabei
export function setMissing(e, missing) {
  if (missing) { state.missing[e.event_id] = true; delete state.placed[e.event_id]; }
  else delete state.missing[e.event_id];
}

// Freier Anker: Spielzeit g im Abschnitt p liegt bei Videozeit v (begrenzt auf die Nachbarn)
export function addAnchor(p, g, v) {
  const list = state.anchors[p] = state.anchors[p] || [];
  list.push({ g, v: clamp(v, boundsFor(anchors(p), g)) });
  list.sort((x, y) => x.g - y.g);
}
export function removeAnchor(p, i) {
  const list = state.anchors[p] || [];
  list.splice(i, 1);
  if (!list.length) delete state.anchors[p];
}
