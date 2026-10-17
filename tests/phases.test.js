// Tests für Über- und Unterzahlphasen (gleiche Regeln wie PPCalculator.swift im Dashboard)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { powerPlayPhases } from '../web/js/phases.js';
import { buildClips, toEdl } from '../web/js/export.js';
import { fmtGame } from '../web/js/format.js';
import { setup, miniGame } from './helpers.js';

let nextId = 1;
const pen = (team, period, time, type = 'penalty_2') => ({ event_id: nextId++, event_type: 'penalty', event_team: team, period, time, penalty_type: type, penalty_type_string: '' });
const goal = (team, period, time) => ({ event_id: nextId++, event_type: 'goal', event_team: team, period, time, home_goals: 0, guest_goals: 0 });
// Phasen kompakt: "guest 1 05:00–06:00 5:4"
const show = () => powerPlayPhases().map(p => `${p.team} ${p.p} ${fmtGame(p.from)}–${fmtGame(p.to)} ${p.strength.join(':')}`);
const run = (evts, overrides) => { setup(miniGame(evts), overrides); return show(); };

// ===== Testspiel 58668 =====
test('Testspiel: drei 2-Minuten-Strafen, eine über die Drittelpause', () => {
  setup();
  assert.deepEqual(show(), [
    'home 1 18:45–20:00 5:4', // Strafe TVEH 18:45 im 1. Drittel …
    'home 2 00:00–00:45 5:4', // … läuft im 2. Drittel weiter
    'guest 2 16:49–18:49 5:4', // Tor TVEH bei 18:51 kommt 2 s zu spät
    'guest 3 12:53–14:53 5:4'  // Unterzahltor BAL bei 13:35 beendet nichts
  ]);
});

// ===== Strafarten =====
test('2 Minuten: Überzahltor beendet die Strafe', () => {
  assert.deepEqual(run([pen('home', 1, '5:00'), goal('guest', 1, '6:00')]), ['guest 1 05:00–06:00 5:4']);
});

test('Unterzahltor beendet nichts', () => {
  assert.deepEqual(run([pen('home', 1, '5:00'), goal('home', 1, '6:00')]), ['guest 1 05:00–07:00 5:4']);
});

test('5 Minuten: Tore beenden die Strafe nicht', () => {
  assert.deepEqual(run([pen('home', 1, '5:00', 'penalty_5'), goal('guest', 1, '6:00'), goal('guest', 1, '7:00')]), ['guest 1 05:00–10:00 5:4']);
});

test('2+2: ohne Tor 4 Minuten', () => {
  assert.deepEqual(run([pen('home', 1, '5:00', 'penalty_2and2')]), ['guest 1 05:00–09:00 5:4']);
});

test('2+2: Tor im ersten Teil startet sofort den zweiten', () => {
  assert.deepEqual(run([pen('home', 1, '5:00', 'penalty_2and2'), goal('guest', 1, '6:00')]), ['guest 1 05:00–08:00 5:4']);
});

test('2+2: Tor im zweiten Teil beendet die Strafe', () => {
  assert.deepEqual(run([pen('home', 1, '5:00', 'penalty_2and2'), goal('guest', 1, '7:30')]), ['guest 1 05:00–07:30 5:4']);
});

test('Matchstrafe wird wie 2+2 gerechnet', () => {
  assert.deepEqual(run([pen('home', 1, '5:00', 'penalty_ms_full')]), ['guest 1 05:00–09:00 5:4']);
  assert.deepEqual(run([pen('home', 1, '5:00', 'penalty_ms_tech'), goal('guest', 1, '5:30')]), ['guest 1 05:00–07:30 5:4']);
});

test('10 Minuten: Team nur 2 Minuten in Unterzahl', () => {
  assert.deepEqual(run([pen('home', 1, '5:00', 'penalty_10')]), ['guest 1 05:00–07:00 5:4']);
});

// ===== Stapelregel und Stärke =====
test('Stapelregel: dritte Strafe beginnt erst, wenn die erste endet', () => {
  assert.deepEqual(run([pen('home', 1, '5:00'), pen('home', 1, '5:10'), pen('home', 1, '5:20')]), [
    'guest 1 05:00–05:10 5:4',
    'guest 1 05:10–07:10 5:3', // ab 7:00 läuft die dritte Strafe statt der ersten
    'guest 1 07:10–09:00 5:4'
  ]);
});

test('Kleinfeld: nur eine Strafe gleichzeitig, 3 Feldspieler', () => {
  assert.deepEqual(run([pen('home', 1, '5:00'), pen('home', 1, '5:30')], { kleinfeld: true }), ['guest 1 05:00–09:00 3:2']);
});

test('Gleiche Stärke ist keine Überzahl, Tore beenden dann nichts', () => {
  assert.deepEqual(run([pen('home', 1, '5:00'), pen('guest', 1, '5:00'), goal('home', 1, '6:00')]), []);
  // zusätzliche Heimstrafe: 4 gegen 3 für den Gast, nach Ablauf der beiden ersten Strafen 5 gegen 4
  assert.deepEqual(run([pen('home', 1, '5:00'), pen('guest', 1, '5:00'), pen('home', 1, '5:30')]), ['guest 1 05:30–07:00 4:3', 'guest 1 07:00–07:30 5:4']);
});

// ===== Zeit =====
test('Strafe läuft über das Drittelende ins nächste Drittel', () => {
  assert.deepEqual(run([pen('guest', 1, '19:00')]), ['home 1 19:00–20:00 5:4', 'home 2 00:00–01:00 5:4']);
});

test('Strafe endet spätestens mit dem Spiel', () => {
  assert.deepEqual(run([pen('guest', 3, '19:30')]), ['home 3 19:30–20:00 5:4']);
});

test('Eingestellte Drittellänge wird berücksichtigt', () => {
  assert.deepEqual(run([pen('guest', 1, '14:00')], { periodLen: 900 }), ['home 1 14:00–15:00 5:4', 'home 2 00:00–01:00 5:4']);
});

test('Strafe kurz vor Ende des 3. Drittels läuft in der Verlängerung weiter', () => {
  setup(miniGame([pen('home', 3, '19:00')], { result: { overtime: true } }));
  assert.deepEqual(show(), ['guest 3 19:00–20:00 5:4', 'guest 4 00:00–01:00 5:4']);
});

// ===== Export =====
test('Export: zwei Clips pro Phase, Überzahl und Unterzahl', () => {
  const s = setup();
  s.periods[1] = { start: 300, end: 1920 };
  s.periods[2] = { start: 2520, end: 4140 };
  const pp = buildClips().filter(c => c.kind === 'powerplay' || c.kind === 'boxplay');
  // Phase 1. Drittel (18:45–20:00) und ihre Fortsetzung im 2. Drittel, dazu die Phase 16:49–18:49
  assert.deepEqual(pp.map(c => c.code), ['Überzahl BAL', 'Unterzahl TVEH', 'Überzahl BAL', 'Unterzahl TVEH', 'Überzahl TVEH', 'Unterzahl BAL']);
  const first = pp[0];
  assert.equal(first.end, 1920); // endet mit dem 1. Drittel
  assert.equal(Object.fromEntries(first.labels)['Stärke'], '5 gegen 4');
  assert.equal(Object.fromEntries(pp[1].labels)['Stärke'], '4 gegen 5');
  assert.equal(Object.fromEntries(pp[1].labels)['Spielzeit'], '18:45–20:00');
});

test('Export: Phasen ohne Videozeit fehlen', () => {
  setup(); // keine Drittelgrenzen gesetzt
  assert.equal(buildClips().filter(c => c.kind === 'powerplay').length, 0);
});

test('Schnittliste „Überzahlphasen“ enthält nur die Überzahl-Clips', () => {
  const s = setup();
  s.periods[1] = { start: 300, end: 1920 };
  s.periods[2] = { start: 2520, end: 4140 };
  s.periods[3] = { start: 4740, end: 6360 };
  const { text, count } = toEdl(buildClips(), { scope: 'powerplay' });
  assert.equal(count, 4);
  assert.ok(text.includes('* COMMENT: Ueberzahl BAL'));
});
