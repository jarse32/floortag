// Tests für die YouTube-Kapitelmarken
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChapters } from '../web/js/chapters.js';
import { place } from '../web/js/sync.js';
import { setup, ev, miniGame } from './helpers.js';

const lines = c => c.text.split('\n');
const toSec = s => s.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
const times = c => lines(c).map(l => toSec(l.split(' ')[0]));

// Alle drei Drittel mit realistischen Grenzen markiert
function fullySynced() {
  const s = setup();
  s.periods[1] = { start: 300, end: 300 + 1620 };
  s.periods[2] = { start: 2520, end: 2520 + 1620 };
  s.periods[3] = { start: 4740, end: 4740 + 1620 };
  return s;
}

test('Ohne Markierungen gibt es nur „Vor dem Spiel“', () => {
  setup();
  const c = buildChapters();
  assert.equal(c.text, '0:00 Vor dem Spiel');
  assert.equal(c.missing, 12); // 12 Tore und Strafen ohne Zeit, Auszeit zählt nicht
  assert.equal(c.count, 1);
});

test('Erstes Kapitel steht immer bei 0:00', () => {
  fullySynced();
  assert.equal(lines(buildChapters())[0], '0:00 Vor dem Spiel');
});

test('Beginnt das Spiel in den ersten 10 Sekunden, wird es selbst das 0:00-Kapitel', () => {
  const s = fullySynced();
  s.periods[1].start = 4;
  const first = lines(buildChapters())[0];
  assert.equal(first, '0:00 1. Drittel');
});

test('Kapitel liegen mindestens 10 Sekunden auseinander und sind aufsteigend', () => {
  fullySynced();
  const t = times(buildChapters());
  for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= 10, `Abstand vor Zeile ${i + 1}`);
});

test('Zu dichte Kapitel werden nach hinten verschoben und gezählt', () => {
  const s = fullySynced();
  // Tor 11 (13:35) und Strafe 10 (12:53) im 3. Drittel nur 3 Sekunden auseinander
  place(ev(10), 5600);
  place(ev(11), 5603);
  const c = buildChapters();
  assert.ok(c.shifted >= 1);
  const t = times(c);
  for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= 10);
});

test('Kapitel zu Ereignissen beginnen mit dem Vorlauf', () => {
  const s = fullySynced();
  place(ev(1), 900);
  let line = lines(buildChapters()).find(l => l.includes('1:0 BAL'));
  assert.equal(toSec(line.split(' ')[0]), 900 - 8);
  s.leadIn = 20;
  line = lines(buildChapters()).find(l => l.includes('1:0 BAL'));
  assert.equal(toSec(line.split(' ')[0]), 900 - 20);
});

test('Drittel, Pausen und Spielende erscheinen mit ihren Titeln', () => {
  fullySynced();
  const text = buildChapters().text;
  for (const t of ['1. Drittel', '1. Drittelpause', '2. Drittel', '2. Drittelpause', '3. Drittel', 'Nach dem Spiel']) {
    assert.ok(text.includes(` ${t}`), `fehlt: ${t}`);
  }
});

test('Strafen lassen sich aus den Kapiteln ausblenden, Auszeiten erscheinen nie', () => {
  const s = fullySynced();
  assert.equal(lines(buildChapters()).filter(l => l.includes('Strafe')).length, 3);
  assert.ok(!buildChapters().text.includes('Auszeit'));
  s.includePenalties = false;
  assert.equal(lines(buildChapters()).filter(l => l.includes('Strafe')).length, 0);
});

test('Tor-Kapitel nennen Stand, Team, Schütze und Vorlage', () => {
  fullySynced();
  const line = lines(buildChapters()).find(l => l.includes('1:0 BAL'));
  assert.match(line, /^\d+:\d{2} 1:0 BAL – #38 \S+ \(#15 \S+\)$/);
});

test('Jugendspieler erscheinen auch in Kapiteln nur mit Rückennummer', () => {
  fullySynced();
  const line = lines(buildChapters()).find(l => l.includes('2:1 TVEH'));
  assert.match(line, /2:1 TVEH – #6 \(#7 \S+\)$/);
});

test('Besondere Torarten werden angehängt', () => {
  const s = setup(miniGame([
    { event_id: 1, event_type: 'goal', event_team: 'home', period: 1, time: '5:00', home_goals: 1, guest_goals: 0, number: 9, goal_type: 'penalty_shot', goal_type_string: 'Penalty' }
  ]));
  s.periods[1] = { start: 60 };
  // Anpfiff 60 s + 5:00 Spielzeit − 8 s Vorlauf = 5:52
  assert.ok(lines(buildChapters()).includes('5:52 1:0 HEIM – #9 [Penalty]'));
});

test('Tor-Kapitel tragen die Spielsituation', () => {
  fullySynced();
  const line = lines(buildChapters()).find(l => l.includes('4:4 BAL'));
  assert.match(line, / \[Unterzahl 4:5\]$/);
  // Tore bei gleicher Stärke bleiben ohne Zusatz
  assert.ok(!lines(buildChapters()).find(l => l.includes('1:0 BAL')).includes('['));
});

test('Penaltytore bekommen keinen doppelten Hinweis', () => {
  const s = setup(miniGame([
    { event_id: 1, event_type: 'goal', event_team: 'home', period: 1, time: '5:00', home_goals: 1, guest_goals: 0, number: 9, goal_type: 'penalty_shot', goal_type_string: 'Penalty' }
  ]));
  s.periods[1] = { start: 60 };
  assert.ok(lines(buildChapters()).includes('5:52 1:0 HEIM – #9 [Penalty]'));
});
