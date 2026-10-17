// ===== Kapitelmarken für YouTube =====
import { state } from './state.js';
import { fmt } from './format.js';
import { events, periodList, periodTitle, pauseTitle, describe } from './game.js';
import { timeOf } from './sync.js';

export function buildChapters() {
  const items = [];
  let missing = 0;
  const ps = periodList();
  ps.forEach((p, i) => {
    const st = state.periods[p] || {};
    if (st.start != null) items.push({ t: st.start, label: periodTitle(p) });
    for (const e of events()) {
      if (Math.floor(e.period) !== p) continue;
      const d = describe(e);
      if (!d.chapter || (e.event_type === 'penalty' && !state.includePenalties)) continue;
      const t = timeOf(e);
      if (t == null) { missing++; continue; }
      items.push({ t: Math.max(0, t - state.leadIn), label: d.chapter });
    }
    if (st.end != null) {
      const last = i === ps.length - 1;
      items.push({ t: st.end, label: last ? 'Nach dem Spiel' : pauseTitle(p) });
    }
  });
  items.sort((a, b) => a.t - b.t);
  // YouTube verlangt ein erstes Kapitel bei 0:00
  if (!items.length || items[0].t >= 10) items.unshift({ t: 0, label: 'Vor dem Spiel' });
  else items[0].t = 0;
  // YouTube verlangt mindestens 10 Sekunden pro Kapitel
  let last = -Infinity, shifted = 0;
  for (const it of items) {
    let t = Math.round(it.t);
    if (t < last + 10) { t = last + 10; shifted++; }
    it.t = t; last = t;
  }
  return { text: items.map(it => `${fmt(it.t)} ${it.label}`).join('\n'), count: items.length, missing, shifted };
}
