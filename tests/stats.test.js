// Tests für die Statistik je Team und Abschnitt
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, statRows, statsAsTsv, statPeriods, isComplete } from '../web/js/stats.js';
import { addTag, updateTag, setPlayer } from '../web/js/tags.js';
import { setup, miniGame } from './helpers.js';

// Drittel 1–3 im Verhältnis 1:1: Videozeit = 1000/3000/5000 + Spielzeit
function linear(evts = [], extra = {}) {
  const s = setup(miniGame(evts, extra));
  s.periods[1] = { start: 1000, end: 2200 };
  s.periods[2] = { start: 3000, end: 4200 };
  s.periods[3] = { start: 5000, end: 6200 };
  return s;
}
let id = 1;
const goal = (team, period, time, goal_type = 'regular') => ({ event_id: id++, event_type: 'goal', event_team: team, period, time, home_goals: 0, guest_goals: 0, goal_type });
const pen = (team, period, time, type = 'penalty_2') => ({ event_id: id++, event_type: 'penalty', event_team: team, period, time, penalty_type: type });
const shot = (team, v, outcome) => addTag({ code: 'shot', v, team, outcome });
const row = (rows, name) => rows.find(r => r[0] === name);

// ===== Testspiel 58668, nur Saisonmanager-Daten =====
test('Testspiel: Tore, Unterzahltor, Strafen und Überzahlchancen', () => {
  setup();
  const st = computeStats('all');
  assert.equal(st.home.goals, 5);
  assert.equal(st.guest.goals, 4);
  assert.equal(st.home.shGoals, 1);  // BAL trifft bei 13:35 im 3. Drittel in Unterzahl
  assert.equal(st.home.ppGoals + st.guest.ppGoals, 0);
  assert.deepEqual([st.home.penalties, st.home.penaltyMinutes, st.guest.penalties, st.guest.penaltyMinutes], [2, 4, 1, 2]);
  assert.equal(st.home.ppChances, 1); // eine Strafe TVEH
  assert.equal(st.guest.ppChances, 2); // zwei Strafen BAL
  assert.equal(st.home.shots, 5);     // ohne Tags: Torschüsse = Tore
  assert.equal(st.guest.goalsAgainst, 5);
  assert.deepEqual(st.goalies.guest.map(g => [g.nr, g.goalsAgainst]), [[1, 5]]);
  assert.deepEqual(st.goalies.home.map(g => [g.nr, g.goalsAgainst]), [[19, 4]]);
});

test('Testspiel: Abschnitte getrennt, Überzahlchance zählt im Drittel ihres Beginns', () => {
  setup();
  assert.deepEqual(statPeriods(), [1, 2, 3]);
  const p1 = computeStats(1), p2 = computeStats(2);
  assert.deepEqual([p1.home.goals, p1.guest.goals], [2, 1]);
  assert.equal(p1.home.ppChances, 1); // Strafe TVEH bei 18:45 im 1. Drittel
  assert.equal(p2.home.ppChances, 0);
  assert.equal(p2.guest.ppChances, 1);
});

// ===== Schüsse und Torhüter =====
test('Schüsse: aufs Tor, daneben, geblockt, Tore zählen als Schuss aufs Tor', () => {
  linear([goal('home', 1, '10:00')]);
  shot('home', 1100, 'on'); shot('home', 1200, 'off'); shot('home', 1300, 'blocked'); shot('home', 1400, 'on');
  const h = computeStats('all').home;
  assert.deepEqual([h.shotsOn, h.shotsOff, h.shotsBlocked, h.shotGoals], [2, 1, 1, 1]);
  assert.equal(h.shotsOnTarget, 3);
  assert.equal(h.shots, 5);
});

test('Penaltytore und Eigentore sind keine Torschüsse und zählen nicht gegen den Torhüter', () => {
  linear([goal('home', 1, '5:00', 'penalty_shot'), goal('home', 1, '6:00', 'own_goal'), goal('home', 1, '7:00')]);
  const st = computeStats('all');
  assert.equal(st.home.goals, 3);
  assert.equal(st.home.shotGoals, 1);
  assert.equal(st.guest.goalsAgainst, 1);
});

test('Saves und Gegentore je Torhüter, Wechsel ab der Szene', () => {
  linear([goal('home', 1, '15:00')], { players: { home: [], guest: [{ trikot_number: 1, goalkeeper: true, player_name: 'Eins' }, { trikot_number: 30, goalkeeper: true, player_name: 'Dreißig' }] } });
  const g1 = addTag({ code: 'goalie', v: 1000, team: 'guest' }); setPlayer(g1.id, 'guest', 1);
  const g2 = addTag({ code: 'goalie', v: 1800, team: 'guest' }); setPlayer(g2.id, 'guest', 30);
  shot('home', 1100, 'on'); shot('home', 1200, 'on'); shot('home', 1900, 'on');
  const st = computeStats('all');
  assert.deepEqual(st.goalies.guest.map(g => [g.nr, g.saves, g.goalsAgainst]), [[1, 2, 0], [30, 1, 1]]); // Tor bei 15:00 = Video 1900
  assert.equal(st.guest.saves, 3);
});

test('Fangquote nur bei vollständig erfassten Schüssen des Gegners', () => {
  const s = linear([goal('home', 1, '15:00')]);
  shot('home', 1100, 'on'); shot('home', 1200, 'on'); shot('home', 1300, 'on');
  let rows = statRows(1).rows;
  assert.equal(row(rows, 'Fangquote')[2], 'unvollständig');
  s.complete = { 1: { home: true } }; // Schüsse von BAL im 1. Drittel vollständig
  rows = statRows(1).rows;
  assert.equal(row(rows, 'Fangquote')[2], '75,0 %'); // 3 Saves, 1 Gegentor
  assert.equal(row(rows, 'Fangquote')[1], 'unvollständig'); // Schüsse von TVEH fehlen
  assert.equal(statRows('all').rows.find(r => r[0] === 'Fangquote')[2], 'unvollständig'); // Gesamt braucht alle Drittel
  s.complete = { 1: { home: true }, 2: { home: true }, 3: { home: true } };
  assert.equal(isComplete('home', 'all'), true);
  assert.equal(row(statRows('all').rows, 'Fangquote')[2], '75,0 %');
});

test('Tor ins leere Tor zählt nicht gegen den Torhüter', () => {
  linear([goal('home', 3, '19:30')]);
  const t = addTag({ code: 'empty_net', v: 6100, team: 'guest' }); updateTag(t.id, { end: 6200 }); // 3. Drittel 18:20–20:00
  const st = computeStats('all');
  assert.equal(st.home.enGoals, 1);
  assert.equal(st.guest.goalsAgainst, 0);
  assert.equal(st.home.shotGoals, 1); // als Torschuss zählt es trotzdem
});

test('Überzahl- und Unterzahltore aus den Strafen, Torhüter raus ändert das nicht', () => {
  linear([pen('guest', 1, '5:00'), goal('home', 1, '6:00'), pen('home', 1, '10:00'), goal('home', 1, '11:00')]);
  const t = addTag({ code: 'empty_net', v: 1650, team: 'guest' }); updateTag(t.id, { end: 1700 });
  const st = computeStats('all');
  assert.equal(st.home.ppGoals, 1);
  assert.equal(st.home.shGoals, 1);
  const rows = statRows('all').rows;
  assert.equal(row(rows, 'Überzahl: Tore je Chance')[1], '1 von 1 (100,0 %)');
  assert.equal(row(rows, 'Unterzahl überstanden')[1], '100,0 %'); // BAL übersteht die eigene Strafe ohne Gegentor
  assert.equal(row(rows, 'Unterzahl überstanden')[2], '0,0 %');   // BAL nutzt seine einzige Überzahl
});

// ===== Bully, Ballgewinne, Penaltys =====
test('Bully: gewonnen, verloren, unentschieden und Quoten mit und ohne Vorteil', () => {
  linear();
  addTag({ code: 'faceoff', v: 1100, outcome: 'home', place: 'center' });     // Vorteil Gast, Heim gewinnt
  addTag({ code: 'faceoff', v: 1200, outcome: 'guest', place: 'center' });    // Vorteil Gast, Gast gewinnt
  addTag({ code: 'faceoff', v: 1300, outcome: 'home', place: 'half_home' });  // Vorteil Heim, Heim gewinnt
  addTag({ code: 'faceoff', v: 1400, outcome: 'draw', place: 'half_guest' }); // Vorteil Gast, unentschieden
  const { home: h, guest: g } = computeStats('all');
  assert.deepEqual([h.faceoffsWon, h.faceoffsLost, h.faceoffsDraw, h.faceoffs], [2, 1, 1, 4]);
  assert.deepEqual([h.advWon, h.advAttempts, h.noAdvWon, h.noAdvAttempts], [1, 1, 1, 3]);
  assert.deepEqual([g.advWon, g.advAttempts, g.noAdvWon, g.noAdvAttempts], [1, 3, 0, 1]);
  const rows = statRows('all').rows;
  assert.equal(row(rows, 'Quote (ohne Unentschieden)')[1], '66,7 %');
  assert.equal(row(rows, 'ohne Vorteil gewonnen')[1], '1 von 3 (33,3 %)');
});

test('Ballgewinne des einen sind Ballverluste des anderen', () => {
  linear();
  addTag({ code: 'turnover', v: 1100, team: 'home' });
  addTag({ code: 'turnover', v: 1200, team: 'home' });
  addTag({ code: 'turnover', v: 1300, team: 'guest' });
  const st = computeStats('all');
  assert.deepEqual([st.home.turnovers, st.home.turnoversLost, st.guest.turnovers, st.guest.turnoversLost], [2, 1, 1, 2]);
});

test('Penaltys im Spiel und im Penaltyschießen getrennt; Penaltyschießen nur in Gesamt', () => {
  linear();
  addTag({ code: 'penalty_shot', v: 1100, team: 'home', outcome: 'goal' });
  addTag({ code: 'penalty_shot', v: 1200, team: 'home', outcome: 'miss' });
  addTag({ code: 'penalty_shot', v: 7000, team: 'home', outcome: 'goal', shootout: true });
  addTag({ code: 'penalty_shot', v: 7030, team: 'guest', outcome: 'miss', shootout: true });
  const all = computeStats('all'), p1 = computeStats(1);
  assert.deepEqual([all.home.penaltyShots, all.home.penaltyShotGoals, all.home.shootoutShots, all.home.shootoutGoals], [2, 1, 1, 1]);
  assert.equal(p1.home.shootoutShots, 0);
  assert.ok(row(statRows('all').rows, 'Penaltyschießen verwandelt'));
  assert.equal(row(statRows(1).rows, 'Penaltyschießen verwandelt'), undefined);
});

test('Tags außerhalb markierter Drittel zählen nur in Gesamt und werden gemeldet', () => {
  linear();
  shot('home', 500, 'off');  // vor dem 1. Drittel
  shot('home', 1100, 'off');
  assert.equal(computeStats('all').home.shotsOff, 2);
  assert.equal(computeStats('all').unassigned, 1);
  assert.equal(computeStats(1).home.shotsOff, 1);
});

// ===== Kopieren =====
test('Kopierformat: tabulatorgetrennt mit Kopfzeile und Abschnitten', () => {
  setup();
  const lines = statsAsTsv('all').split('\n');
  assert.equal(lines[0], 'Kennzahl\tBAL\tTVEH');
  assert.equal(lines[1], 'Tore und Schüsse\t\t');
  assert.equal(lines[2], 'Tore\t5\t4');
  // Hauptblock bis zur Leerzeile hat drei Spalten, danach folgt der Plus/Minus-Block
  const main = lines.slice(0, lines.indexOf(''));
  assert.ok(main.every(l => l.split('\t').length === 3));
});
