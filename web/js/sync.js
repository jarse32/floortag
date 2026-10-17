// ===== Sync-Logik: Ankerpunkte und Interpolation =====
import { state } from './state.js';
import { events, periodLength } from './game.js';

// Anker eines Abschnitts: Beginn, Ende und alle gesetzten Ereignisse
function anchors(p, excludeId) {
  const a = [], ps = state.periods[p] || {}, len = periodLength(p);
  if (ps.start != null) a.push({ g: 0, v: ps.start });
  if (ps.end != null && len > 0) a.push({ g: len, v: ps.end });
  for (const e of events()) {
    if (Math.floor(e.period) === p && e.event_id !== excludeId && state.placed[e.event_id] != null) {
      a.push({ g: state.gs[e.event_id], v: state.placed[e.event_id] });
    }
  }
  return a.sort((x, y) => x.g - y.g || x.v - y.v);
}
// Schätzt die Videozeit eines Ereignisses aus den umliegenden Ankerpunkten
function estimate(e) {
  const p = Math.floor(e.period), a = anchors(p, e.event_id), g = state.gs[e.event_id];
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
export function timeOf(e) {
  return state.placed[e.event_id] != null ? state.placed[e.event_id] : estimate(e);
}
// Grenzen: Ein Ereignis darf nicht vor dem vorherigen oder nach dem nächsten Anker liegen
export function bounds(e) {
  const p = Math.floor(e.period), a = anchors(p, e.event_id), g = state.gs[e.event_id];
  let lo = -Infinity, hi = Infinity;
  for (const x of a) {
    if (x.g < g) lo = Math.max(lo, x.v);
    if (x.g > g) hi = Math.min(hi, x.v);
  }
  return { lo, hi };
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

// Setzt ein Ereignis als Anker, begrenzt auf die benachbarten Anker
export function place(e, v) {
  const { lo, hi } = bounds(e);
  let val = v;
  if (isFinite(lo)) val = Math.max(lo, val);
  if (isFinite(hi)) val = Math.min(hi, val);
  state.placed[e.event_id] = Math.max(0, Math.round(val * 10) / 10);
}
