// ===== Statistik je Team und Abschnitt =====
// Quellen: Tore und Strafen aus dem Saisonmanager, alles Übrige aus den eigenen Tags.
// Festlegungen nach Eishockey-Vorbild:
//   - Überzahl-/Unterzahltor ergibt sich aus den laufenden Strafen (nicht aus „Torhüter raus“)
//   - Torschüsse = getaggte Schüsse + Tore; Penaltytore und Eigentore zählen nicht als Torschuss
//   - Fangquote = Saves / (Saves + Gegentore); Tore ins leere Tor und Penaltytore zählen nicht dagegen
//   - Überzahlchance = Strafzeitfenster des Gegners (wie PPCalculator im Dashboard, 2+2 = zwei Chancen)
import { state } from './state.js';
import { events, personLabel, teamShort } from './game.js';
import { timeOf, periodAtVideo } from './sync.js';
import { goalieAt, faceoffAdvantage } from './tags.js';
import { penaltyWindowsByTeam, emptyNetWindows, absTime, playedPeriods } from './phases.js';
import { lineupOf, hasLineup } from './lineups.js';

const TEAMS = ['home', 'guest'];
const isGoalkeeper = (side, nr) => ((state.game.players || {})[side] || []).some(p => p.trikot_number === nr && p.goalkeeper);
const other = t => (t === 'home' ? 'guest' : 'home');
const PENALTY_MINUTES = { penalty_2: 2, penalty_2and2: 4, penalty_5: 5, penalty_10: 10 };

// Abschnitte, die in der Auswahl erscheinen (ohne Penaltyschießen)
export function statPeriods() {
  return playedPeriods().map(x => x.p);
}
// Abschnitt zu einer Gesamtspielzeit
function periodOfAbs(t) {
  const list = playedPeriods();
  const hit = list.find(x => t >= x.from && t < x.to) || (list.length && t >= list[list.length - 1].to ? list[list.length - 1] : null);
  return hit ? hit.p : null;
}
// Vollständigkeit der Schusserfassung: state.complete = { 1: { home: true, guest: false }, … }
export function isComplete(team, scope) {
  const ps = scope === 'all' ? statPeriods() : [scope];
  return ps.length > 0 && ps.every(p => state.complete && state.complete[p] && state.complete[p][team]);
}

const emptyTeam = () => ({
  goals: 0, ppGoals: 0, shGoals: 0, enGoals: 0,
  shotsOn: 0, shotsOff: 0, shotsBlocked: 0, shotGoals: 0,
  saves: 0, goalsAgainst: 0,
  faceoffs: 0, faceoffsWon: 0, faceoffsLost: 0, faceoffsDraw: 0, advAttempts: 0, advWon: 0, noAdvAttempts: 0, noAdvWon: 0,
  turnovers: 0, freeHits: 0, counters: 0,
  penaltyShots: 0, penaltyShotGoals: 0, shootoutShots: 0, shootoutGoals: 0,
  penalties: 0, penaltyMinutes: 0, ppChances: 0
});

// Statistik für scope = 'all' oder eine Abschnittsnummer
export function computeStats(scope = 'all') {
  const res = { home: emptyTeam(), guest: emptyTeam(), goalies: { home: {}, guest: {} }, unassigned: 0,
    plusMinus: { home: {}, guest: {} }, pmGoals: 0, pmCovered: 0 };
  const inScope = p => (scope === 'all' ? p == null || p <= 4 : p === scope);
  const goalie = (team, nr) => (res.goalies[team][nr ?? '?'] = res.goalies[team][nr ?? '?'] || { nr, saves: 0, goalsAgainst: 0 });
  const pens = penaltyWindowsByTeam(), empty = emptyNetWindows();
  const activeAt = (list, t) => list.filter(w => w.start <= t && w.end >= t).length;

  // Tore aus dem Saisonmanager
  for (const e of events()) {
    const p = Math.floor(e.period);
    if (e.event_type !== 'goal' || p > 4 || !inScope(p)) continue;
    const team = e.event_team, opp = other(team), r = res[team];
    if (!res[team]) continue;
    const t = absTime(e);
    const penaltyGoal = /penalty/i.test(e.goal_type || ''), ownGoal = /own|eigen/i.test(e.goal_type || '');
    const enGoal = empty[opp].some(w => w.start <= t && w.end > t);
    r.goals++;
    const pt = activeAt(pens[team], t), po = activeAt(pens[opp], t);
    if (pt < po) r.ppGoals++;
    else if (pt > po) r.shGoals++;
    if (enGoal) r.enGoals++;
    // Plus/Minus nach Eishockey-Regel: kein Überzahltor, kein Penaltytor; Unterzahl und leeres Tor zählen
    if (!penaltyGoal && !(pt < po)) {
      res.pmGoals++;
      if (hasLineup(e)) {
        res.pmCovered++;
        const lineup = lineupOf(e);
        for (const side of TEAMS) for (const nr of lineup[side]) {
          if (isGoalkeeper(side, nr)) continue;
          const pm = res.plusMinus[side][nr] = res.plusMinus[side][nr] || { nr, plus: 0, minus: 0 };
          if (side === team) pm.plus++; else pm.minus++;
        }
      }
    }
    if (!penaltyGoal && !ownGoal) {
      r.shotGoals++;
      if (!enGoal) {
        res[opp].goalsAgainst++;
        const v = timeOf(e);
        goalie(opp, goalieAt(opp, v == null ? -1 : v)).goalsAgainst++;
      }
    }
  }

  // Strafen und Überzahlchancen
  for (const e of events()) {
    const p = Math.floor(e.period);
    if (e.event_type !== 'penalty' || p > 4 || !inScope(p) || !res[e.event_team]) continue;
    res[e.event_team].penalties++;
    res[e.event_team].penaltyMinutes += PENALTY_MINUTES[e.penalty_type] || 0;
  }
  for (const team of TEAMS) {
    for (const w of pens[other(team)]) if (inScope(periodOfAbs(w.start))) res[team].ppChances++;
  }

  // Eigene Tags
  for (const tag of state.tags || []) {
    const team = tag.team, r = res[team];
    if (tag.code === 'penalty_shot' && tag.shootout) {
      if (scope === 'all' && r) { r.shootoutShots++; if (tag.outcome === 'goal') r.shootoutGoals++; }
      continue;
    }
    const where = periodAtVideo(tag.v), p = where ? where.p : null;
    if (!inScope(p)) continue;
    if (p == null && tag.code !== 'goalie') res.unassigned++;
    switch (tag.code) {
      case 'shot':
        if (!r) break;
        if (tag.outcome === 'on') { r.shotsOn++; res[other(team)].saves++; goalie(other(team), goalieAt(other(team), tag.v)).saves++; }
        else if (tag.outcome === 'off') r.shotsOff++;
        else if (tag.outcome === 'blocked') r.shotsBlocked++;
        break;
      case 'faceoff': {
        const adv = faceoffAdvantage(tag);
        for (const side of TEAMS) {
          const s = res[side];
          s.faceoffs++;
          if (tag.outcome === side) s.faceoffsWon++;
          else if (tag.outcome === other(side)) s.faceoffsLost++;
          else if (tag.outcome === 'draw') s.faceoffsDraw++;
          if (adv === side) { s.advAttempts++; if (tag.outcome === side) s.advWon++; }
          if (adv === other(side)) { s.noAdvAttempts++; if (tag.outcome === side) s.noAdvWon++; }
        }
        break;
      }
      case 'turnover': if (r) r.turnovers++; break;
      case 'free_hit': if (r) r.freeHits++; break;
      case 'counter': if (r) r.counters++; break;
      case 'penalty_shot': if (r) { r.penaltyShots++; if (tag.outcome === 'goal') r.penaltyShotGoals++; } break;
    }
  }

  // Abgeleitete Werte
  for (const team of TEAMS) {
    const r = res[team], o = res[other(team)];
    r.shotsOnTarget = r.shotsOn + r.shotGoals;
    r.shots = r.shotsOnTarget + r.shotsOff + r.shotsBlocked;
    r.turnoversLost = o.turnovers;
    r.oppPpGoals = o.ppGoals;
    r.complete = isComplete(team, scope);
    r.savePctComplete = isComplete(other(team), scope); // Fangquote braucht alle Schüsse des Gegners
    res.goalies[team] = Object.values(res.goalies[team]).sort((a, b) => (a.nr ?? 999) - (b.nr ?? 999));
    res.plusMinus[team] = Object.values(res.plusMinus[team]).map(x => ({ ...x, net: x.plus - x.minus }))
      .sort((a, b) => b.net - a.net || b.plus - a.plus || a.nr - b.nr);
  }
  return res;
}

// Quote als Zahl 0–1 oder null, wenn der Nenner 0 ist
export const ratio = (a, b) => (b > 0 ? a / b : null);

// ===== Darstellung als Zeilen (Anzeige und Kopieren) =====
const pct = r => (r == null ? '–' : `${(r * 100).toFixed(1).replace('.', ',')} %`);
const ofN = (a, n) => (n ? `${a} von ${n} (${pct(a / n)})` : '–');

// Zeilen der Statistik: [Abschnitt] oder [Kennzahl, Heim, Gast]; gemeinsam für Anzeige und Kopieren
export function statRows(scope) {
  const st = computeStats(scope), h = st.home, g = st.guest, names = { home: teamShort('home'), guest: teamShort('guest') };
  const both = f => [f(h, 'home', g), f(g, 'guest', h)];
  const goalieText = (team, r) => {
    const list = st.goalies[team].filter(x => x.saves || x.goalsAgainst);
    if (!list.length) return ['–'];
    return list.map(x => `${x.nr != null ? personLabel(team, x.nr) : 'unbekannt'}: ${x.saves} ${x.saves === 1 ? 'Save' : 'Saves'}, ${x.goalsAgainst} ${x.goalsAgainst === 1 ? 'Gegentor' : 'Gegentore'}` +
      (r.savePctComplete ? ` (${pct(ratio(x.saves, x.saves + x.goalsAgainst))})` : ''));
  };
  const rows = [
    ['Tore und Schüsse'],
    ['Tore', ...both(r => r.goals)],
    ['davon in Überzahl', ...both(r => r.ppGoals)],
    ['davon in Unterzahl', ...both(r => r.shGoals)],
    ['davon ins leere Tor', ...both(r => r.enGoals)],
    ['Torschüsse', ...both(r => r.shots)],
    ['aufs Tor (inkl. Tore)', ...both(r => r.shotsOnTarget)],
    ['daneben', ...both(r => r.shotsOff)],
    ['geblockt', ...both(r => r.shotsBlocked)],
    ['Schusseffizienz', ...both(r => pct(ratio(r.shotGoals, r.shots)))],
    ['Torhüter'],
    ['Saves', ...both(r => r.saves)],
    ['Gegentore (ohne leeres Tor)', ...both(r => r.goalsAgainst)],
    ['Fangquote', ...both(r => (r.savePctComplete ? pct(ratio(r.saves, r.saves + r.goalsAgainst)) : 'unvollständig'))],
    ['je Torhüter', goalieText('home', h), goalieText('guest', g)],
    ['Bully'],
    ['gewonnen', ...both(r => r.faceoffsWon)],
    ['verloren', ...both(r => r.faceoffsLost)],
    ['unentschieden', ...both(r => r.faceoffsDraw)],
    ['Quote (ohne Unentschieden)', ...both(r => pct(ratio(r.faceoffsWon, r.faceoffsWon + r.faceoffsLost)))],
    ['mit Vorteil gewonnen', ...both(r => ofN(r.advWon, r.advAttempts))],
    ['ohne Vorteil gewonnen', ...both(r => ofN(r.noAdvWon, r.noAdvAttempts))],
    ['Spielgeschehen'],
    ['Ballgewinne', ...both(r => r.turnovers)],
    ['Ballverluste', ...both(r => r.turnoversLost)],
    ['Freistöße', ...both(r => r.freeHits)],
    ['Konter', ...both(r => r.counters)],
    ['Penaltys verwandelt', ...both(r => ofN(r.penaltyShotGoals, r.penaltyShots))]
  ];
  if (scope === 'all' && h.shootoutShots + g.shootoutShots) rows.push(['Penaltyschießen verwandelt', ...both(r => ofN(r.shootoutGoals, r.shootoutShots))]);
  rows.push(
    ['Strafen und Überzahl'],
    ['Strafen (Minuten)', ...both(r => `${r.penalties} (${r.penaltyMinutes} Min.)`)],
    ['Überzahl: Tore je Chance', ...both(r => (r.ppChances ? `${r.ppGoals} von ${r.ppChances} (${pct(r.ppGoals / r.ppChances)})` : '–'))],
    ['Unterzahl überstanden', ...both((r, t, o) => (o.ppChances ? pct(1 - o.ppGoals / o.ppChances) : '–'))]
  );
  return { rows, stats: st, names };
}

// Tabulatorgetrennt für Excel und Google Sheets
export function statsAsTsv(scope) {
  const { rows, names } = statRows(scope);
  const flat = v => (Array.isArray(v) ? v.join('; ') : String(v));
  const main = [['Kennzahl', names.home, names.guest], ...rows.map(r => (r.length === 1 ? [r[0], '', ''] : r.map(flat)))];
  const st = computeStats(scope), pm = [];
  if (st.pmGoals) {
    pm.push([], ['Plus/Minus', `Aufstellung bei ${st.pmCovered} von ${st.pmGoals} zählenden Toren erfasst`], ['Team', 'Spieler', '+', '−', '±']);
    for (const side of TEAMS) for (const x of st.plusMinus[side]) pm.push([names[side], personLabel(side, x.nr), x.plus, x.minus, signed(x.net)]);
  }
  return [...main, ...pm].map(r => r.join('\t')).join('\n');
}

// Plus/Minus mit Vorzeichen: +2, 0, −1
export const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
