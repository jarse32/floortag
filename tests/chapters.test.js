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
  let line = lines(buildChapters()).find(l => l.includes('1:0 Tor BAL'));
  assert.equal(toSec(line.split(' ')[0]), 900 - 8);
  s.leadIn = 20;
  line = lines(buildChapters()).find(l => l.includes('1:0 Tor BAL'));
  assert.equal(toSec(line.split(' ')[0]), 900 - 20);
});

test('Drittel, Pausen und Spielende erscheinen mit ihren Titeln', () => {
  fullySynced();
  const text = buildChapters().text;
  for (const t of ['1. Drittel', '1. Drittelpause · Stand ', '2. Drittel', '2. Drittelpause · Stand ', '3. Drittel', 'Spielende · Endstand 5:4']) {
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
  const line = lines(buildChapters()).find(l => l.includes('1:0 Tor BAL'));
  assert.match(line, /^\d+:\d{2} 1:0 Tor BAL · #38 \S+, Vorlage #15 \S+$/);
});

test('Jugendspieler erscheinen auch in Kapiteln nur mit Rückennummer', () => {
  fullySynced();
  const line = lines(buildChapters()).find(l => l.includes('2:1 Tor TVEH'));
  assert.match(line, /2:1 Tor TVEH · #6, Vorlage #7 \S+$/);
});

test('Besondere Torarten werden angehängt', () => {
  const s = setup(miniGame([
    { event_id: 1, event_type: 'goal', event_team: 'home', period: 1, time: '5:00', home_goals: 1, guest_goals: 0, number: 9, goal_type: 'penalty_shot', goal_type_string: 'Penalty' }
  ]));
  s.periods[1] = { start: 60 };
  // Anpfiff 60 s + 5:00 Spielzeit − 8 s Vorlauf = 5:52
  assert.ok(lines(buildChapters()).includes('5:52 1:0 Tor HEIM · #9 · Penalty'));
});

test('Tor-Kapitel tragen die Spielsituation', () => {
  fullySynced();
  const line = lines(buildChapters()).find(l => l.includes('4:4 Tor BAL'));
  assert.match(line, / · Unterzahl 4:5$/);
  // Tore bei gleicher Stärke bleiben ohne Zusatz
  assert.ok(!lines(buildChapters()).find(l => l.includes('1:0 Tor BAL')).includes('zahl'));
});

test('Penaltytore bekommen keinen doppelten Hinweis', () => {
  const s = setup(miniGame([
    { event_id: 1, event_type: 'goal', event_team: 'home', period: 1, time: '5:00', home_goals: 1, guest_goals: 0, number: 9, goal_type: 'penalty_shot', goal_type_string: 'Penalty' }
  ]));
  s.periods[1] = { start: 60 };
  assert.ok(lines(buildChapters()).includes('5:52 1:0 Tor HEIM · #9 · Penalty'));
});

test('Tor mit 6. Feldspieler im Kapitel', async () => {
  const { addTag, updateTag } = await import('../web/js/tags.js');
  const s = setup(miniGame([{ event_id: 1, event_type: 'goal', event_team: 'home', period: 3, time: '16:54', home_goals: 5, guest_goals: 6, number: 9 }]));
  s.periods = { 3: { start: 5000, end: 6200 } };
  const t = addTag({ code: 'empty_net', v: 5990, team: 'home' }); updateTag(t.id, { end: 6020 });
  assert.ok(lines(buildChapters()).some(l => l.endsWith(' · 6:5 ohne Torhüter')));
});

// ===== Strafen kurz, Tags als Kapitel =====
test('Strafen-Kapitel: Team, Spieler, kurze Dauer und Grund', () => {
  fullySynced();
  const line = lines(buildChapters()).find(l => l.includes('Strafe'));
  assert.match(line, /Strafe \S+ · #\d+.* · 2 Min\./);
});

test('Tags erscheinen nur, wenn sie ausgewählt sind', async () => {
  const { addTag, updateTag } = await import('../web/js/tags.js');
  const s = fullySynced();
  const miss = addTag({ code: 'penalty_shot', v: 1000, team: 'guest', outcome: 'miss' });
  updateTag(miss.id, { players: { home: null, guest: 7 } });
  addTag({ code: 'penalty_shot', v: 1100, team: 'home', outcome: 'goal' });  // verwandelt: kommt schon als Tor
  addTag({ code: 'empty_net', v: 6000, team: 'guest' });
  const sp = addTag({ code: 'special', v: 3000 }); updateTag(sp.id, { comment: 'Verletzungspause' });
  addTag({ code: 'shot', v: 1200, team: 'home', outcome: 'on' });           // Schüsse nie
  const before = buildChapters().count;
  assert.ok(!buildChapters().text.includes('Penalty TVEH'));
  s.chapterTags = ['penalty_miss', 'empty_net', 'special'];
  const t = lines(buildChapters());
  assert.equal(buildChapters().count, before + 3);
  assert.ok(t.some(l => /^16:32 Penalty TVEH · #7 \S+ · verschossen$/.test(l)), t.join('\n'));
  assert.ok(t.includes('1:40:00 Torhüter raus TVEH'));
  assert.ok(t.some(l => / Besonderes Ereignis · Verletzungspause$/.test(l)));
});

test('Getaggtes Penaltyschießen ersetzt das Siegtor aus dem Saisonmanager', async () => {
  const { addTag } = await import('../web/js/tags.js');
  const s = setup(miniGame([{ event_id: 1, event_type: 'goal', event_team: 'guest', period: 5, time: '10:00', home_goals: 3, guest_goals: 4, number: 18 }],
    { result: { overtime: true, home_goals: 3, guest_goals: 4, postfix: { short: 'n. PS' } } }));
  s.periods = { 5: { start: 7000, end: 7300 } };
  addTag({ code: 'penalty_shot', v: 7020, team: 'home', outcome: 'miss' });
  addTag({ code: 'penalty_shot', v: 7060, team: 'guest', outcome: 'goal' });
  assert.ok(buildChapters().text.includes('3:4 Tor GAST'));
  s.chapterTags = ['shootout'];
  const t = lines(buildChapters());
  assert.ok(!t.some(l => l.includes('3:4 Tor GAST')));
  assert.ok(t.includes('1:56:52 Penalty HEIM · nicht verwandelt · 0:0'));
  assert.ok(t.includes('1:57:32 Penalty GAST · verwandelt · 0:1'));
  assert.ok(t.includes('2:01:40 Spielende · Endstand 3:4 n. PS'));
});

test('Tor „nicht im Video“ steht trotzdem in den Kapiteln, an der geschätzten Stelle ohne Vorlauf', () => {
  const s = fullySynced();
  s.missing[2] = true; // 2:0 bei 12:27
  // Streamlücke: freie Anker direkt davor und danach (gleiche Videozeit)
  s.anchors = { 1: [{ g: 700, v: 1200 }, { g: 800, v: 1200 }] };
  const c = buildChapters();
  const line = lines(c).find(l => l.includes('2:0 Tor'));
  assert.ok(line, 'Kapitel für das fehlende Tor');
  assert.match(line, / · nicht im Video$/);
  assert.equal(toSec(line.split(' ')[0]) >= 1200, true);
  assert.equal(c.notInVideoGoals, 1);
  assert.equal(c.notInVideo, 0);
});

test('Strafe „nicht im Video“ bekommt weiter kein Kapitel', () => {
  const s = fullySynced();
  const penalties = c => lines(c).filter(l => l.includes(' Strafe ')).length;
  const before = penalties(buildChapters());
  s.missing[4] = true;
  const c = buildChapters();
  assert.equal(penalties(c), before - 1);
  assert.equal(c.notInVideo, 1);
});
