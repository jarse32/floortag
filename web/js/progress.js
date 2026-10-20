// ===== Fortschritt eines Spiels in Stufen =====
// 0 · Video: noch nichts gesetzt
// 1 · Sync: Saisonmanager-Ereignisse werden im Video verortet (fertig, wenn alle Drittel markiert
//     und alle Ereignisse gesetzt oder als „nicht im Video“ markiert sind)
// 2 · Tags: eigene Tags vorhanden
// 3 · Vollständig analysiert: Schüsse aller Drittel vollständig erfasst und Aufstellung bei allen zählenden Toren
import { state } from './state.js';
import { events, periodList } from './game.js';
import { computeStats, isComplete } from './stats.js';

export const STAGES = ['Video', 'Sync', 'Tags', 'Vollständig analysiert'];

export function computeProgress() {
  const evs = events();
  const done = evs.filter(e => state.placed[e.event_id] != null || state.missing[e.event_id]).length;
  const periods = periodList().filter(p => p <= 4);
  const marked = p => state.periods[p] && state.periods[p].start != null && state.periods[p].end != null;
  const periodsSet = periods.filter(marked).length;
  const syncStarted = done > 0 || Object.keys(state.anchors || {}).length > 0 ||
    periods.some(p => state.periods[p] && state.periods[p].start != null);
  const syncComplete = periods.length > 0 && periodsSet === periods.length && done === evs.length;
  const tags = (state.tags || []).filter(t => t.code !== 'goalie').length;
  const st = computeStats('all');
  const fullyAnalysed = tags > 0 && isComplete('home', 'all') && isComplete('guest', 'all') && st.pmCovered === st.pmGoals;
  const stage = fullyAnalysed ? 3 : tags > 0 ? 2 : syncStarted ? 1 : 0;
  return {
    stage,
    sync: { done, total: evs.length, periodsSet, periodsTotal: periods.length, started: syncStarted, complete: syncComplete },
    tags,
    shotsComplete: isComplete('home', 'all') && isComplete('guest', 'all'),
    lineups: { covered: st.pmCovered, total: st.pmGoals },
    fullyAnalysed
  };
}

// Eckdaten für die Übersicht, damit sie ohne erneuten Abruf auskommt
export function gameMeta() {
  const g = state.game;
  return {
    id: g.id, video: state.videoId, date: g.date || null, start: g.start_time || null,
    home: g.home_team_name, guest: g.guest_team_name, homeShort: g.home_team_short_name, guestShort: g.guest_team_short_name,
    result: g.result_string || '', league: g.league_name || '', leagueId: g.league_id || null
  };
}
