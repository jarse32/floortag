// Tests für die Aufstellung bei Toren und Plus/Minus (Eishockey-Regel)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forcedPlayers, lineupOf, hasLineup, toggleLineupPlayer, fieldPlayers } from '../web/js/lineups.js';
import { computeStats, statsAsTsv } from '../web/js/stats.js';
import { buildClips } from '../web/js/export.js';
import { buildTagFile, applyTagFile } from '../web/js/storage.js';
import { addTag, updateTag } from '../web/js/tags.js';
import { setup, miniGame } from './helpers.js';

// Kader: Heim Torhüter 1, Feldspieler 2–8; Gast Torhüter 30, Feldspieler 31–37
const roster = (gk, from) => [{ trikot_number: gk, goalkeeper: true, player_name: `TH${gk}` },
  ...Array.from({ length: 7 }, (_, i) => ({ trikot_number: from + i, player_name: `S${from + i}` }))];
const players = { home: roster(1, 2), guest: roster(30, 31) };
let id = 1;
const goal = (team, period, time, number, assist, goal_type = 'regular') => ({ event_id: id++, event_type: 'goal', event_team: team, period, time, number, assist, home_goals: 0, guest_goals: 0, goal_type });
const pen = (team, period, time) => ({ event_id: id++, event_type: 'penalty', event_team: team, period, time, penalty_type: 'penalty_2' });
function game(evts) {
  const s = setup(miniGame(evts, { players }));
  s.periods[1] = { start: 1000, end: 2200 };
  s.periods[2] = { start: 3000, end: 4200 };
  s.periods[3] = { start: 5000, end: 6200 };
  return s;
}
// Aufstellung eintragen (ohne Schütze/Vorlage, die kommen automatisch)
function setLineup(e, home, guest) {
  for (const nr of home) toggleLineupPlayer(e.event_id, 'home', nr);
  for (const nr of guest) toggleLineupPlayer(e.event_id, 'guest', nr);
}
const pm = (st, side) => Object.fromEntries(st.plusMinus[side].map(x => [x.nr, x.net]));

// ===== Aufstellung =====
test('Schütze und Vorlage stehen automatisch auf dem Feld', () => {
  const g = goal('home', 1, '5:00', 5, 6);
  game([g]);
  assert.deepEqual(forcedPlayers(g), { home: [5, 6], guest: [] });
  assert.deepEqual(lineupOf(g), { home: [5, 6], guest: [] });
  assert.equal(hasLineup(g), false); // erst erfasst, wenn für beide Teams ausgewählt
});

test('Auswahl an- und abwählen; leere Auswahl wird entfernt', () => {
  const g = goal('home', 1, '5:00', 5, null);
  const s = game([g]);
  setLineup(g, [3, 2], [31]);
  assert.deepEqual(lineupOf(g), { home: [2, 3, 5], guest: [31] });
  assert.equal(hasLineup(g), true);
  for (const nr of [2, 3]) toggleLineupPlayer(g.event_id, 'home', nr);
  toggleLineupPlayer(g.event_id, 'guest', 31);
  assert.equal(s.lineups[g.event_id], undefined);
});

test('Auswahl bietet nur Feldspieler, keine Torhüter', () => {
  game([]);
  assert.deepEqual(fieldPlayers('home').map(p => p.trikot_number), [2, 3, 4, 5, 6, 7, 8]);
  assert.ok(!fieldPlayers('guest').some(p => p.trikot_number === 30));
});

// ===== Plus/Minus =====
test('Tor bei gleicher Stärke: +1 für das erzielende Team, −1 für den Gegner', () => {
  const g = goal('home', 1, '5:00', 5, 6);
  game([g]);
  setLineup(g, [2, 3, 4], [31, 32, 33, 34, 35]);
  const st = computeStats('all');
  assert.deepEqual(pm(st, 'home'), { 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 });
  assert.deepEqual(pm(st, 'guest'), { 31: -1, 32: -1, 33: -1, 34: -1, 35: -1 });
  assert.deepEqual([st.pmGoals, st.pmCovered], [1, 1]);
});

test('Überzahltor zählt nicht, Unterzahltor schon', () => {
  const pp = goal('home', 1, '6:00', 5, null);   // Gast hat ab 5:00 eine Strafe
  const sh = goal('guest', 1, '6:30', 31, null); // Unterzahltor des Gastes
  game([pen('guest', 1, '5:00'), pp, sh]);
  setLineup(pp, [2, 3], [32]);
  setLineup(sh, [2, 3], [32]);
  const st = computeStats('all');
  assert.equal(st.pmGoals, 1);
  assert.deepEqual(pm(st, 'guest'), { 31: 1, 32: 1 });
  assert.deepEqual(pm(st, 'home'), { 2: -1, 3: -1 });
});

test('Penaltytore zählen nicht, Tore ins leere Tor schon', () => {
  const ps = goal('home', 1, '3:00', 5, null, 'penalty_shot');
  const en = goal('home', 3, '19:30', 6, null);
  game([ps, en]);
  const t = addTag({ code: 'empty_net', v: 6100, team: 'guest' }); updateTag(t.id, { end: 6200 });
  setLineup(ps, [2], [31]);
  setLineup(en, [2], [31]);
  const st = computeStats('all');
  assert.equal(st.pmGoals, 1);
  assert.deepEqual(pm(st, 'home'), { 2: 1, 6: 1 });
});

test('Torhüter bekommen kein Plus/Minus, auch wenn sie eingetragen sind', () => {
  const g = goal('home', 1, '5:00', 5, null);
  game([g]);
  setLineup(g, [1, 2], [30, 31]);
  const st = computeStats('all');
  assert.deepEqual(Object.keys(pm(st, 'home')).map(Number), [2, 5]);
  assert.deepEqual(Object.keys(pm(st, 'guest')).map(Number), [31]);
});

test('Erfassungsgrad: zählende Tore ohne Aufstellung werden gezählt, aber nicht bewertet', () => {
  const a = goal('home', 1, '5:00', 5, null), b = goal('guest', 2, '5:00', 31, null);
  game([a, b]);
  setLineup(a, [2], [32]);
  const st = computeStats('all');
  assert.deepEqual([st.pmGoals, st.pmCovered], [2, 1]);
  assert.equal(pm(st, 'guest')[31], undefined); // Tor b ohne Aufstellung
});

test('Plus/Minus je Abschnitt und nach Bilanz sortiert', () => {
  const a = goal('home', 1, '5:00', 5, null), b = goal('home', 2, '5:00', 5, null), c = goal('guest', 2, '9:00', 31, null);
  game([a, b, c]);
  setLineup(a, [2], [32]); setLineup(b, [3], [32]); setLineup(c, [3], [33]);
  const all = computeStats('all'), p2 = computeStats(2);
  assert.deepEqual(all.plusMinus.home.map(x => [x.nr, x.net]), [[5, 2], [2, 1], [3, 0]]);
  assert.deepEqual(pm(p2, 'home'), { 5: 1, 3: 0 });
});

// ===== Speicherung und Export =====
test('Aufstellungen stehen in der Tag-Datei und überstehen Speichern und Laden', () => {
  const g = goal('home', 1, '5:00', 5, null);
  const s = game([g]);
  setLineup(g, [2, 3], [31]);
  const file = JSON.parse(JSON.stringify(buildTagFile()));
  assert.deepEqual(file.lineups, { [g.event_id]: { home: [2, 3], guest: [31] } });
  s.lineups = {};
  applyTagFile(file);
  assert.deepEqual(lineupOf(g), { home: [2, 3, 5], guest: [31] });
});

test('Tor-Clips tragen die Aufstellung als Label', () => {
  const g = goal('home', 1, '5:00', 5, 6);
  game([g]);
  setLineup(g, [2], [31, 32]);
  const clip = buildClips().find(c => c.code === 'Tor HEIM');
  const labels = Object.fromEntries(clip.labels);
  assert.equal(labels['Auf dem Feld HEIM'], '#2 #5 #6');
  assert.equal(labels['Auf dem Feld GAST'], '#31 #32');
});

test('Kopierformat enthält den Plus/Minus-Block', () => {
  const g = goal('home', 1, '5:00', 5, null);
  game([g]);
  setLineup(g, [2], [31]);
  const text = statsAsTsv('all');
  assert.ok(text.includes('Plus/Minus\tAufstellung bei 1 von 1 zählenden Toren erfasst'));
  assert.ok(text.includes('HEIM\t#5 S5\t1\t0\t+1'));
  assert.ok(text.includes('GAST\t#31 S31\t0\t1\t−1'));
});
