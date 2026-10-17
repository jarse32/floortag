// ===== Überzahl- und Unterzahlphasen aus den Strafen =====
// Gleiche Regeln wie PPCalculator.swift im Floorball Dashboard, damit App und FloorTag
// ein Spiel gleich auslegen:
//   penalty_2              → 2 Min Unterzahl, durch Überzahltor beendbar
//   penalty_2and2          → 2 + 2 Min verknüpft; Tor beendet das erste, das zweite beginnt sofort
//   penalty_5              → 5 Min, nicht beendbar
//   penalty_10             → 2 Min Unterzahl (Spieler 10 Min gesperrt, Team nur 2 Min kurz)
//   penalty_ms_tech/_full  → 2 + 2 Min wie 2+2 (Matchstrafe, Regel seit 2025)
//   Stapelregel: max. 2 gleichzeitige Strafen pro Team (Kleinfeld: 1), weitere beginnen später
//   Tore zählen nur bei echter Überzahl (ungleiche Zahl laufender Strafen)
// Abweichend vom Dashboard rechnet FloorTag mit der eingestellten Drittellänge statt fest 20 Min.
import { state } from './state.js';
import { events, periodList, periodLength } from './game.js';

// Spielzeit über alle Abschnitte hinweg (Drittel 2 beginnt bei Drittellänge usw.)
function offset(p) {
  let o = 0;
  for (let q = 1; q < p; q++) o += periodLength(q);
  return o;
}
function absTime(e) {
  return offset(Math.floor(e.period)) + state.gs[e.event_id];
}
// Abschnitte mit Spielzeit (ohne Penaltyschießen) und ihre Grenzen auf der Gesamtspielzeit
function playedPeriods() {
  return periodList().filter(p => p <= 4 && periodLength(p) > 0).map(p => ({ p, from: offset(p), to: offset(p) + periodLength(p) }));
}

function penaltyWindows(type, typeString) {
  if (type === 'penalty_2and2' || type === 'penalty_ms_tech' || type === 'penalty_ms_full') return [2, 2];
  if (type === 'penalty_10') return [2];
  if (type === 'penalty_5') return [5];
  if (type === 'penalty_2') return [2];
  const mins = parseInt(String(typeString || '').replace(/\D/g, '').slice(0, 2), 10);
  return [mins || 2];
}

// Strafzeitfenster pro Team: { home: [{ start, end, minutes, canBeEnded, linkedTo }], guest: [...] }
export function penaltyWindowsByTeam() {
  const maxConcurrent = state.kleinfeld ? 1 : 2;
  const pens = { home: [], guest: [] };
  const add = (list, t, minutes, linkedTo = null) => {
    // Stapelregel iterativ: so lange hinter das früheste laufende Fenster schieben, bis Platz ist
    let start = t;
    for (let i = 0; i <= list.length; i++) {
      const active = list.filter(w => w.start <= start && w.end > start);
      if (active.length < maxConcurrent) break;
      start = Math.min(...active.map(w => w.end));
    }
    list.push({ start, end: start + minutes * 60, minutes, canBeEnded: minutes === 2, linkedTo });
    return list.length - 1;
  };
  const penalties = events().filter(e => e.event_type === 'penalty' && Math.floor(e.period) <= 4)
    .sort((a, b) => absTime(a) - absTime(b));
  for (const e of penalties) {
    const list = pens[e.event_team];
    if (!list) continue;
    const parts = penaltyWindows(e.penalty_type, e.penalty_type_string);
    const first = add(list, absTime(e), parts[0]);
    if (parts[1]) add(list, list[first].end, parts[1], first);
  }

  // Tore auswerten: Überzahltor beendet das früheste beendbare 2-Min-Fenster des Gegners
  const goals = events().filter(e => e.event_type === 'goal' && Math.floor(e.period) <= 4)
    .sort((a, b) => absTime(a) - absTime(b));
  for (const g of goals) {
    const t = absTime(g);
    const activeHome = pens.home.filter(w => w.start <= t && w.end >= t).length;
    const activeGuest = pens.guest.filter(w => w.start <= t && w.end >= t).length;
    if (activeHome === activeGuest) continue;
    const ppTeam = activeHome < activeGuest ? 'home' : 'guest';
    if (g.event_team !== ppTeam) continue; // Unterzahltor beendet nichts
    const bucket = pens[ppTeam === 'home' ? 'guest' : 'home'];
    const candidates = bucket.map((w, i) => i).filter(i => bucket[i].start <= t && bucket[i].end >= t && bucket[i].canBeEnded);
    if (!candidates.length) continue;
    const idx = candidates.reduce((a, b) => (bucket[b].start < bucket[a].start ? b : a));
    bucket[idx].end = t;
    for (const w of bucket) if (w.linkedTo === idx) { w.start = t; w.end = t + w.minutes * 60; }
  }

  // Fenster enden spätestens mit dem Spiel
  const periods = playedPeriods();
  const gameEnd = periods.length ? periods[periods.length - 1].to : 0;
  for (const list of Object.values(pens)) for (const w of list) w.end = Math.min(w.end, gameEnd);
  return pens;
}

// Phasen mit ungleicher Stärke, getrennt an Drittelgrenzen und bei Stärkewechsel:
// [{ team: 'home', p, from, to, strength: [5, 4] }]  (from/to = Spielzeit im Abschnitt)
export function powerPlayPhases() {
  const pens = penaltyWindowsByTeam();
  const base = state.kleinfeld ? 3 : 5;
  const phases = [];
  for (const { p, from, to } of playedPeriods()) {
    const cuts = new Set([from, to]);
    for (const list of Object.values(pens)) for (const w of list) {
      if (w.start > from && w.start < to) cuts.add(w.start);
      if (w.end > from && w.end < to) cuts.add(w.end);
    }
    const points = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1], mid = (a + b) / 2;
      const h = pens.home.filter(w => w.start <= mid && w.end > mid).length;
      const g = pens.guest.filter(w => w.start <= mid && w.end > mid).length;
      if (h === g) continue;
      const team = h < g ? 'home' : 'guest';
      const strength = team === 'home' ? [base - h, base - g] : [base - g, base - h];
      const last = phases[phases.length - 1];
      // Nahtlos anschließender Abschnitt mit gleicher Lage: verlängern
      if (last && last.p === p && last.team === team && last.to === a - from && last.strength.join() === strength.join()) last.to = b - from;
      else phases.push({ team, p, from: a - from, to: b - from, strength });
    }
  }
  return phases;
}
