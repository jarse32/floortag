// ===== Kapitelmarken für YouTube =====
// Jede Zeile nach demselben Muster: Stand, Art, Team, dann mit „·“ getrennt Spieler und Zusatz.
// Pausen und Spielende nennen den Stand. Ausgewählte eigene Tags kommen auf Wunsch dazu (state.chapterTags).
import { state } from './state.js';
import { fmt } from './format.js';
import { events, periodList, periodTitle, pauseTitle, teamShort, personLabel } from './game.js';
import { timeOf } from './sync.js';
import { goalSituations, situationLabels } from './stats.js';
import { isShootout } from './tags.js';

// Tag-Arten, die als Kapitel taugen (Schlüssel für state.chapterTags)
export const CHAPTER_TAGS = [
  ['penalty_miss', 'Verschossene Penaltys'],
  ['shootout', 'Penaltyschießen'],
  ['empty_net', 'Torhüter raus'],
  ['special', 'Besondere Ereignisse']
];

const SEP = ' · ';
const join = parts => parts.filter(Boolean).join(SEP);
const shortPenalty = s => String(s || '').replace(/Minuten?/g, 'Min.');

function goalLabel(e, sit) {
  const assist = e.assist ? `Vorlage ${personLabel(e.event_team, e.assist)}` : '';
  const special = e.goal_type && e.goal_type !== 'regular' ? e.goal_type_string : '';
  return join([`${e.home_goals}:${e.guest_goals} Tor ${teamShort(e.event_team)}`,
    [personLabel(e.event_team, e.number), assist].filter(Boolean).join(', '), special, ...sit]);
}
function penaltyLabel(e) {
  return join([`Strafe ${teamShort(e.event_team)}`, personLabel(e.event_team, e.number),
    [shortPenalty(e.penalty_type_string), e.penalty_reason_string].filter(Boolean).join(', ')]);
}
// Stand nach allen Toren bis einschließlich Abschnitt p (laut Saisonmanager)
function scoreAfter(p) {
  let score = '0:0';
  for (const e of events()) if (e.event_type === 'goal' && Math.floor(e.period) <= p) score = `${e.home_goals}:${e.guest_goals}`;
  return score;
}
function finalScore() {
  const r = state.game.result || {};
  const base = r.home_goals != null && r.guest_goals != null ? `${r.home_goals}:${r.guest_goals}` : scoreAfter(9);
  return r.postfix && r.postfix.short ? `${base} ${r.postfix.short}` : base;
}

// Kapitel aus den eigenen Tags
function tagItems(wanted) {
  const items = [], so = { home: 0, guest: 0 };
  const player = t => (t.team && t.players && t.players[t.team] != null ? personLabel(t.team, t.players[t.team]) : '');
  for (const t of state.tags || []) {
    if (t.code === 'penalty_shot' && isShootout(t)) {
      if (t.outcome === 'goal' && so[t.team] != null) so[t.team]++;
      if (!wanted.has('shootout')) continue;
      const result = t.outcome === 'goal' ? 'verwandelt' : t.outcome === 'miss' ? 'nicht verwandelt' : '';
      items.push({ t: t.v - state.leadIn, label: join([`Penalty ${teamShort(t.team)}`, player(t), result, `${so.home}:${so.guest}`]) });
    } else if (t.code === 'penalty_shot' && t.outcome === 'miss' && wanted.has('penalty_miss')) {
      items.push({ t: t.v - state.leadIn, label: join([`Penalty ${teamShort(t.team)}`, player(t), 'verschossen']) });
    } else if (t.code === 'empty_net' && wanted.has('empty_net')) {
      items.push({ t: t.v, label: `Torhüter raus ${teamShort(t.team)}` });
    } else if (t.code === 'special' && wanted.has('special')) {
      items.push({ t: t.v - state.leadIn, label: join(['Besonderes Ereignis', t.team ? teamShort(t.team) : '', t.comment]) });
    }
  }
  return items;
}

export function buildChapters() {
  const items = [];
  let missing = 0, notInVideo = 0;
  const situations = goalSituations();
  const wanted = new Set(state.chapterTags || []);
  // Getaggtes Penaltyschießen ersetzt das einzelne Siegtor aus dem Saisonmanager
  const taggedShootout = wanted.has('shootout') && (state.tags || []).some(isShootout);
  const ps = periodList();
  ps.forEach((p, i) => {
    const st = state.periods[p] || {};
    if (st.start != null) items.push({ t: st.start, label: periodTitle(p) });
    for (const e of events()) {
      if (Math.floor(e.period) !== p || e.event_type === 'timeout') continue;
      if (e.event_type === 'penalty' && !state.includePenalties) continue;
      if (p === 5 && taggedShootout) continue;
      if (state.missing[e.event_id]) { notInVideo++; continue; }
      const t = timeOf(e);
      if (t == null) { missing++; continue; }
      // Spielsituation bei Toren, z. B. „Überzahl 5:4“; Penalty steht schon als Torart im Text
      const sit = e.event_type === 'goal' ? situationLabels(situations[e.event_id]).filter(l => l !== 'Penalty') : [];
      items.push({ t: Math.max(0, t - state.leadIn), label: e.event_type === 'goal' ? goalLabel(e, sit) : penaltyLabel(e) });
    }
    if (st.end != null) {
      const last = i === ps.length - 1;
      items.push({ t: st.end, label: last ? join(['Spielende', `Endstand ${finalScore()}`]) : join([pauseTitle(p), `Stand ${scoreAfter(p)}`]) });
    }
  });
  for (const it of tagItems(wanted)) items.push({ t: Math.max(0, it.t), label: it.label });
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
  return { text: items.map(it => `${fmt(it.t)} ${it.label}`).join('\n'), count: items.length, missing, notInVideo, shifted };
}
