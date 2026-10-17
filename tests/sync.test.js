// Tests für Hilfsfunktionen, Spieldaten und Sync-Logik
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTime, fmt, fmtGame, esc, extractVideoId } from '../web/js/format.js';
import { events, periodList, periodLength, describe as describeEvent } from '../web/js/game.js';
import { timeOf, bounds, place, suggestEnd, suggestStart } from '../web/js/sync.js';
import { setup, ev, miniGame } from './helpers.js';

// Vergleich mit Toleranz für interpolierte Werte
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

// ===== format.js =====
test('parseTime liest m:ss', () => {
  assert.equal(parseTime('6:04'), 364);
  assert.equal(parseTime('18:55'), 1135);
  assert.equal(parseTime(''), 0);
  assert.equal(parseTime(undefined), 0);
});

test('fmt zeigt Videozeit, ab einer Stunde mit Stunden', () => {
  assert.equal(fmt(0), '0:00');
  assert.equal(fmt(65.4), '1:05');
  assert.equal(fmt(3725), '1:02:05');
  assert.equal(fmt(null), '–');
  assert.equal(fmt(-3), '0:00');
  assert.equal(fmtGame(364), '06:04');
});

test('esc entschärft HTML', () => {
  assert.equal(esc('<b>"A" & \'B\'</b>'), '&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt;');
  assert.equal(esc(null), '');
});

test('extractVideoId versteht die üblichen YouTube-Formen', () => {
  assert.equal(extractVideoId('lfIFpRsE55I'), 'lfIFpRsE55I');
  assert.equal(extractVideoId('https://www.youtube.com/watch?v=lfIFpRsE55I&t=10'), 'lfIFpRsE55I');
  assert.equal(extractVideoId('https://youtu.be/lfIFpRsE55I?si=x'), 'lfIFpRsE55I');
  assert.equal(extractVideoId('https://www.youtube.com/live/lfIFpRsE55I'), 'lfIFpRsE55I');
  assert.equal(extractVideoId('https://www.youtube.com/embed/lfIFpRsE55I'), 'lfIFpRsE55I');
  assert.equal(extractVideoId('kein link'), null);
  assert.equal(extractVideoId(''), null);
});

// ===== game.js =====
test('Ereignisse sind nach Abschnitt, Spielzeit und ID sortiert', () => {
  setup();
  const ids = events().map(e => e.event_id);
  assert.equal(ids.length, 13);
  assert.deepEqual(ids.slice(-2), [12, 9002]); // Tor und Auszeit bei 18:55
});

test('Abschnitte: drei Drittel, Verlängerung nur bei Bedarf', () => {
  setup();
  assert.deepEqual(periodList(), [1, 2, 3]);
  setup(miniGame([], { result: { overtime: true } }));
  assert.deepEqual(periodList(), [1, 2, 3, 4]);
  assert.equal(periodLength(4), 600);
  assert.equal(periodLength(5), 0);
});

test('Penaltyschießen wird mit 30 Sekunden pro Versuch geschätzt', () => {
  const s = setup(miniGame([
    { event_id: 1, event_type: 'goal', event_team: 'home', period: 5, time: '', home_goals: 1, guest_goals: 0 },
    { event_id: 2, event_type: 'goal', event_team: 'guest', period: 5, time: '', home_goals: 1, guest_goals: 1 },
    { event_id: 3, event_type: 'goal', event_team: 'home', period: 5, time: '', home_goals: 2, guest_goals: 1 }
  ]));
  assert.deepEqual([s.gs[1], s.gs[2], s.gs[3]], [0, 30, 60]);
  s.periods[5] = { start: 5000 };
  assert.deepEqual([1, 2, 3].map(id => timeOf(ev(id))), [5000, 5030, 5060]);
});

test('Jugendspieler erscheinen standardmäßig nur mit Rückennummer', () => {
  const s = setup();
  const d = describeEvent(ev(3)); // Tor TVEH durch #6 (Jugend), Vorlage #7
  assert.equal(d.text, 'Tor TVEH #6');
  assert.match(d.sub, /^Vorlage #7 \S+/);
  s.hideYouth = false;
  assert.notEqual(describeEvent(ev(3)).text, 'Tor TVEH #6');
});

test('Auszeiten erzeugen kein Kapitel', () => {
  setup();
  assert.equal(describeEvent(ev(9002)).chapter, null);
});

// ===== sync.js: Schätzung =====
test('Ohne Anker gibt es keine Schätzung', () => {
  setup();
  assert.equal(timeOf(ev(1)), null);
});

test('Nur Drittelbeginn gesetzt: Spielzeit läuft 1:1 mit der Videozeit', () => {
  const s = setup();
  s.periods[1] = { start: 100 };
  assert.equal(timeOf(ev(1)), 100 + 364);
});

test('Beginn und Ende gesetzt: lineare Interpolation', () => {
  const s = setup();
  s.periods[1] = { start: 100, end: 100 + 1620 }; // 20 Min. Spielzeit in 27 Min. Video
  near(timeOf(ev(1)), 100 + 364 * 1620 / 1200);
});

test('Nur Drittelende gesetzt: rückwärts 1:1', () => {
  const s = setup();
  s.periods[1] = { end: 2000 };
  assert.equal(timeOf(ev(4)), 2000 - (1200 - parseTime('18:45')));
});

test('Gesetztes Ereignis wird Anker und verbessert die Nachbarn', () => {
  const s = setup();
  s.periods[1] = { start: 0, end: 1800 };
  const before = timeOf(ev(2));
  place(ev(1), 600); // Tor 1 (6:04) liegt real später als geschätzt
  assert.equal(timeOf(ev(1)), 600);
  const after = timeOf(ev(2));
  assert.notEqual(after, before);
  // Tor 2 (12:27) liegt jetzt zwischen Tor 1 (6:04 → 600) und Drittelende (20:00 → 1800)
  near(after, 600 + (747 - 364) / (1200 - 364) * (1800 - 600));
});

test('Anker aus anderen Abschnitten beeinflussen die Schätzung nicht', () => {
  const s = setup();
  s.periods[1] = { start: 0 };
  s.periods[2] = { start: 3000 };
  const t = timeOf(ev(5));
  place(ev(1), 900);
  assert.equal(timeOf(ev(5)), t);
});

// ===== sync.js: Grenzen =====
test('Ein Ereignis kann nicht vor den vorherigen Anker gesetzt werden', () => {
  const s = setup();
  s.periods[1] = { start: 100, end: 1800 };
  place(ev(2), 800);
  place(ev(3), 500); // 15:37 darf nicht vor 12:27 (800) liegen
  assert.equal(s.placed[3], 800);
});

test('Ein Ereignis kann nicht hinter den nächsten Anker gesetzt werden', () => {
  const s = setup();
  s.periods[1] = { start: 100, end: 1800 };
  place(ev(4), 5000);
  assert.equal(s.placed[4], 1800);
});

test('Ereignisse mit gleicher Spielzeit dürfen auf derselben Videozeit liegen', () => {
  const s = setup();
  s.periods[3] = { start: 0, end: 1700 };
  place(ev(12), 1600);
  assert.equal(timeOf(ev(9002)), 1600); // Schätzung übernimmt die Position des Tors
  place(ev(9002), 1600);
  assert.equal(s.placed[9002], 1600);
  const b = bounds(ev(9002));
  assert.ok(b.lo <= 1600 && b.hi >= 1600);
});

test('Gesetzte Zeiten werden auf Zehntelsekunden gerundet und nie negativ', () => {
  const s = setup();
  s.periods[1] = {};
  place(ev(1), 12.3456);
  assert.equal(s.placed[1], 12.3);
  place(ev(1), -5);
  assert.equal(s.placed[1], 0);
});

// ===== sync.js: Vorschläge =====
test('Drittelende-Vorschlag: Startfaktor 1,35', () => {
  const s = setup();
  s.periods[1] = { start: 100 };
  assert.equal(suggestEnd(1), 100 + 1200 * 1.35);
  assert.equal(suggestEnd(2), null); // ohne Beginn kein Vorschlag
});

test('Drittelende-Vorschlag lernt aus fertig markierten Dritteln', () => {
  const s = setup();
  s.periods[1] = { start: 0, end: 1500 };           // Faktor 1,25
  s.periods[2] = { start: 2100, end: 2100 + 1860 }; // Faktor 1,55
  s.periods[3] = { start: 4500 };
  // Mittel 1,4 – bewusst nicht der Startwert 1,35
  near(suggestEnd(3), 4500 + 1200 * 1.4);
});

test('Drittelbeginn-Vorschlag: Ende des vorherigen Drittels plus Pause', () => {
  const s = setup();
  s.periods[1] = { start: 0, end: 1600 };
  assert.equal(suggestStart(1), null);
  assert.equal(suggestStart(2), 1600 + 600);
  assert.equal(suggestStart(3), null); // 2. Drittel hat noch kein Ende
  s.pauseLen = 900;
  assert.equal(suggestStart(2), 2500);
  assert.equal(suggestStart(4), null); // vor der Verlängerung kein Vorschlag
});
