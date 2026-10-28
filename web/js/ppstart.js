// ===== Beginn von Über- und Unterzahl in Videozeit =====
// Bei einer Strafe steht die Uhr: Die Phase beginnt in Spielzeit beim Pfiff, gespielt wird aber erst später.
// Der Beginn lässt sich pro Strafe setzen (state.ppStart, Sync-Ebene). Sonst wird geschätzt:
// Strafe + Durchschnitt der bereits gesetzten Abstände in diesem Video, ohne gesetzte Abstände die Einstellung (state.ppDelay).
import { state } from './state.js';
import { events, gameSec } from './game.js';
import { timeOf } from './sync.js';
import { powerPlayPhases } from './phases.js';

// Geschätzter Abstand zwischen Pfiff und Spielbeginn in Sekunden
export function ppDelayEstimate() {
  const gaps = [];
  for (const e of events()) {
    const set = state.ppStart[e.event_id], t = timeOf(e);
    if (set != null && t != null && set >= t) gaps.push(set - t);
  }
  return gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : state.ppDelay;
}

// Strafen, mit denen eine Phase beginnt (gleicher Abschnitt, gleiche Spielzeit)
function penaltiesAt(p, g) {
  return events().filter(e => e.event_type === 'penalty' && Math.floor(e.period) === p && gameSec(e) === g);
}

// Beginnt mit dieser Strafe eine Über- oder Unterzahlphase? Liefert die Phase oder null
export function phaseOfPenalty(e, phases = powerPlayPhases()) {
  if (e.event_type !== 'penalty') return null;
  return phases.find(ph => ph.p === Math.floor(e.period) && ph.from === gameSec(e)) || null;
}

// Beginn für eine Strafe: { v, set } oder null ohne Videozeit
export function ppStartOf(e, delay = ppDelayEstimate()) {
  const set = state.ppStart[e.event_id];
  if (set != null) return { v: set, set: true };
  const t = timeOf(e);
  return t == null ? null : { v: t + delay, set: false };
}

// Videozeit, ab der eine Phase im Clip beginnt; raw = Beginn laut Interpolation (Pfiff), end = Ende der Phase
export function phaseStart(ph, raw, end, delay = ppDelayEstimate()) {
  const pens = penaltiesAt(ph.p, ph.from);
  if (!pens.length) return raw; // Teil nach der Drittelpause oder nach Ablauf einer Strafe
  const e = pens.find(x => state.ppStart[x.event_id] != null) || pens[0];
  const s = ppStartOf(e, delay);
  if (!s) return raw;
  if (s.set) return Math.min(Math.max(s.v, raw), end - 1);
  return s.v < end - 3 ? Math.max(s.v, raw) : raw; // Phase kürzer als der Abstand: beim Pfiff lassen
}

// Beginn setzen (null = wieder schätzen); nie vor der Strafe
export function setPpStart(e, v) {
  if (v == null) { delete state.ppStart[e.event_id]; return; }
  const t = timeOf(e);
  state.ppStart[e.event_id] = Math.round(Math.max(v, t ?? 0) * 10) / 10;
}
