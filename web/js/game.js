// ===== Spieldaten aus dem Saisonmanager =====
import { state } from './state.js';
import { parseTime } from './format.js';

// Übernimmt eine Spiel-JSON und berechnet die Spielzeit jedes Ereignisses
export function prepareGame(data) {
  if (!data || !data.id || !Array.isArray(data.events)) throw new Error('Das sieht nicht nach einer Saisonmanager-Spiel-JSON aus (es fehlen id oder events).');
  state.game = data;
  state.gs = {};
  let shootout = 0;
  for (const e of events()) {
    // Im Penaltyschießen gibt es keine Spielzeit, dort wird pro Versuch geschätzt
    state.gs[e.event_id] = Math.floor(e.period) === 5 ? (shootout++) * 30 : parseTime(e.time);
  }
}

// Spielzeit im Abschnitt in Sekunden; eine Korrektur (state.gsFix) hat Vorrang vor dem Saisonmanager
export function gameSec(e) {
  const fix = state.gsFix && state.gsFix[e.event_id];
  return fix != null ? fix : state.gs[e.event_id];
}
export function isCorrected(e) {
  return !!state.gsFix && state.gsFix[e.event_id] != null;
}
export function events() {
  if (!state.game) return [];
  const t = e => isCorrected(e) ? state.gsFix[e.event_id] : parseTime(e.time);
  return (state.game.events || [])
    .filter(e => ['goal', 'penalty', 'timeout'].includes(e.event_type))
    .slice()
    .sort((a, b) => a.period - b.period || t(a) - t(b) || a.event_id - b.event_id);
}
export function findEvent(id) {
  return events().find(e => e.event_id === Number(id));
}
export function periodList() {
  const g = state.game, ps = new Set([1, 2, 3]);
  if (g.result && g.result.overtime) ps.add(4);
  for (const e of g.events || []) if (e.period >= 1) ps.add(Math.floor(e.period));
  return [...ps].sort((a, b) => a - b);
}
export function periodTitle(p, short) {
  const t = (state.game.period_titles || []).find(x => x.period === p);
  if (short) return p <= 3 ? `${p}. Dr.` : (t ? t.short_title : String(p));
  return t ? t.title : `${p}. Abschnitt`;
}
export function pauseTitle(p) {
  const t = (state.game.period_titles || []).find(x => x.period === p + 0.5);
  return t ? t.title : 'Pause';
}
export function periodLength(p) {
  if (p <= 3) return state.periodLen;
  if (p === 4) return state.otLen;
  return 0; // Penaltyschießen hat keine Spielzeit
}
export function teamShort(team) {
  return team === 'home' ? state.game.home_team_short_name : state.game.guest_team_short_name;
}
// Datenschutz: Jugendspieler auf Wunsch nur mit Rückennummer
export function personLabel(team, nr) {
  if (nr == null) return '';
  const p = ((state.game.players || {})[team] || []).find(x => x.trikot_number === nr);
  if (!p) return `#${nr}`;
  if (p.youth && state.hideYouth) return `#${nr}`;
  return `#${nr} ${p.player_name}`;
}
// Texte zu einem Ereignis für Liste, Zeitleiste und Kapitel
export function describe(e) {
  const short = teamShort(e.event_team);
  if (e.event_type === 'goal') {
    const score = `${e.home_goals}:${e.guest_goals}`;
    const scorer = personLabel(e.event_team, e.number);
    const assist = e.assist ? personLabel(e.event_team, e.assist) : '';
    const special = e.goal_type && e.goal_type !== 'regular' ? e.goal_type_string : '';
    return {
      score, text: `Tor ${short} ${scorer}`,
      sub: [assist ? `Vorlage ${assist}` : '', special].filter(Boolean).join(', '),
      chapter: `${score} ${short} – ${scorer}${assist ? ` (${assist})` : ''}${special ? ` [${special}]` : ''}`
    };
  }
  if (e.event_type === 'penalty') {
    const who = personLabel(e.event_team, e.number);
    return {
      score: '', text: `Strafe ${short} ${who}`,
      sub: [e.penalty_type_string, e.penalty_reason_string].filter(Boolean).join(', '),
      chapter: `Strafe ${short} – ${who} (${e.penalty_type_string || ''}${e.penalty_reason_string ? ', ' + e.penalty_reason_string : ''})`
    };
  }
  return { score: '', text: `Auszeit ${short}`, sub: '', chapter: null };
}
