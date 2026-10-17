// Tests für den Analyse-Export: Clips, Sportscode-XML, CSV und EDL
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClips, toSportscodeXml, toCsv, toEdl } from '../web/js/export.js';
import { place, setMissing } from '../web/js/sync.js';
import { setup, ev, miniGame } from './helpers.js';

// Alle drei Drittel markiert, wie nach einem fertigen Sync
function synced() {
  const s = setup();
  s.periods[1] = { start: 300, end: 1920 };
  s.periods[2] = { start: 2520, end: 4140 };
  s.periods[3] = { start: 4740, end: 6360 };
  return s;
}
const label = (c, g) => Object.fromEntries(c.labels)[g];

// ===== Clips =====
test('Ohne Zeiten gibt es keine Clips', () => {
  setup();
  assert.deepEqual(buildClips(), []);
});

test('Szenen bekommen Vor- und Nachlauf, Drittel werden Phasen', () => {
  const s = synced();
  place(ev(1), 900);
  const clips = buildClips();
  const goal = clips.find(c => c.eventId === 1);
  assert.equal(goal.start, 892);
  assert.equal(goal.end, 905);
  assert.equal(goal.code, 'Tor BAL');
  const periods = clips.filter(c => c.kind === 'period');
  assert.deepEqual(periods.map(c => [c.start, c.end]), [[300, 1920], [2520, 4140], [4740, 6360]]);
  s.leadIn = 3; s.leadOut = 12;
  const g2 = buildClips().find(c => c.eventId === 1);
  assert.deepEqual([g2.start, g2.end], [897, 912]);
});

test('Clips sind nach Start sortiert und fortlaufend nummeriert', () => {
  synced();
  const clips = buildClips();
  assert.equal(clips.length, 3 + 13 + 8); // Drittel, Ereignisse, 4 Phasen × Überzahl/Unterzahl
  clips.forEach((c, i) => {
    assert.equal(c.id, i + 1);
    if (i) assert.ok(c.start >= clips[i - 1].start);
  });
});

test('Labels: Team, Abschnitt, Spielzeit, Stand, Spieler, Vorlage', () => {
  synced();
  const goal = buildClips().find(c => c.eventId === 1);
  assert.equal(label(goal, 'Team'), 'BAL');
  assert.equal(label(goal, 'Abschnitt'), '1. Drittel');
  assert.equal(label(goal, 'Spielzeit'), '06:04');
  assert.equal(label(goal, 'Spielstand'), '1:0');
  assert.match(label(goal, 'Spieler'), /^#38 /);
  assert.match(label(goal, 'Vorlage'), /^#15 /);
  const pen = buildClips().find(c => c.eventId === 4);
  assert.equal(pen.code, 'Strafe TVEH');
  assert.ok(label(pen, 'Strafe'));
  assert.ok(label(pen, 'Grund'));
  assert.equal(buildClips().find(c => c.eventId === 9002).code, 'Auszeit TVEH');
});

test('Jugendspieler erscheinen auch im Export nur mit Rückennummer', () => {
  synced();
  assert.equal(label(buildClips().find(c => c.eventId === 3), 'Spieler'), '#6');
});

test('Szenen „nicht im Video“ und vor dem Streambeginn fehlen im Export', () => {
  const s = setup();
  s.periods[1] = { start: 100 }; // Tor 1 (6:04) liegt bei 464
  setMissing(ev(2), true);
  const ids = buildClips().map(c => c.eventId);
  assert.ok(ids.includes(1));
  assert.ok(!ids.includes(2));
  s.periods[1] = { end: 200 }; // Ende bei 200: frühe Ereignisse lägen vor 0
  assert.ok(!buildClips().some(c => c.eventId === 1));
});

// ===== Sportscode-XML =====
test('Sportscode-XML enthält Instanzen mit Start, Ende, Code und Labels', () => {
  synced();
  place(ev(1), 900);
  const x = toSportscodeXml(buildClips());
  assert.match(x, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<file>\n  <ALL_INSTANCES>/);
  assert.match(x, /<instance>\s*<ID>\d+<\/ID>\s*<start>892\.00<\/start>\s*<end>905\.00<\/end>\s*<code>Tor BAL<\/code>\s*<label><group>Team<\/group><text>BAL<\/text><\/label>/);
  assert.equal((x.match(/<instance>/g) || []).length, 24);
});

test('Sportscode-XML hat eine farbige Zeile pro Code', () => {
  synced();
  const x = toSportscodeXml(buildClips());
  const rows = [...x.matchAll(/<row><code>([^<]+)<\/code><R>(\d+)<\/R><G>(\d+)<\/G><B>(\d+)<\/B><\/row>/g)];
  assert.deepEqual(rows.map(r => r[1]).sort(), ['Auszeit TVEH', 'Drittel', 'Strafe BAL', 'Strafe TVEH', 'Tor BAL', 'Tor TVEH', 'Unterzahl BAL', 'Unterzahl TVEH', 'Überzahl BAL', 'Überzahl TVEH']);
  for (const r of rows) for (const v of r.slice(2)) assert.ok(Number(v) >= 0 && Number(v) <= 65535);
});

test('Sportscode-XML ist wohlgeformt, auch mit Sonderzeichen', () => {
  const s = setup(miniGame([
    { event_id: 1, event_type: 'penalty', event_team: 'home', period: 1, time: '1:00', number: 7, penalty_type_string: '2 Minuten', penalty_reason_string: 'Stock <hoch> & "gefährlich"' }
  ], { home_team_short_name: 'A&B' }));
  s.periods[1] = { start: 0 };
  const x = toSportscodeXml(buildClips());
  assert.ok(x.includes('<code>Strafe A&amp;B</code>'));
  assert.ok(x.includes('Stock &lt;hoch&gt; &amp; "gefährlich"'));
  // einfache Prüfung auf Wohlgeformtheit: jedes geöffnete Element wird geschlossen
  const stack = [];
  for (const [, close, name] of x.matchAll(/<(\/?)([A-Za-z_]+)>/g)) {
    if (close) assert.equal(stack.pop(), name); else stack.push(name);
  }
  assert.equal(stack.length, 0);
  assert.ok(!/&(?!amp;|lt;|gt;)/.test(x), 'unmaskiertes &');
});

// ===== CSV =====
test('CSV: Kopfzeile, Semikolon, Dezimalkomma, eine Zeile pro Clip', () => {
  synced();
  place(ev(1), 900.5);
  const csv = toCsv(buildClips());
  const lines = csv.trimEnd().split('\r\n');
  assert.equal(lines[0], 'Nr;Code;Start;Ende;Start (s);Ende (s);Team;Abschnitt;Spielzeit;Spielstand;Spieler;Vorlage;Details');
  assert.equal(lines.length, 1 + 24);
  const goal = lines.find(l => l.includes(';Tor BAL;') && l.includes('1:0'));
  assert.match(goal, /;0:14:53;0:15:06;892,50;905,50;BAL;1\. Drittel;06:04;1:0;#38 /);
});

test('CSV maskiert Semikolon und Anführungszeichen', () => {
  const s = setup(miniGame([
    { event_id: 1, event_type: 'penalty', event_team: 'home', period: 1, time: '1:00', number: 7, penalty_type_string: '2; Minuten', penalty_reason_string: 'zu "hart"' }
  ]));
  s.periods[1] = { start: 0 };
  const row = toCsv(buildClips()).split('\r\n')[1];
  assert.ok(row.endsWith(';"2; Minuten, zu ""hart"""'));
});

// ===== EDL =====
test('EDL: Schnitte aus dem Quellvideo hintereinander ab 01:00:00:00', () => {
  synced();
  place(ev(1), 900);  // Clip 892–905 = 13 s
  place(ev(2), 1200); // Clip 1192–1205 = 13 s
  const { text, count } = toEdl(buildClips(), { fps: 25, scope: 'goal', clipName: 'spiel.mp4', title: 'Test' });
  const lines = text.split('\n');
  assert.equal(lines[0], 'TITLE: Test');
  assert.equal(lines[1], 'FCM: NON-DROP FRAME');
  assert.equal(count, 9); // alle neun Tore des 5:4 haben eine Zeit
  assert.equal(lines[3], '001  AX       V     C        00:14:52:00 00:15:05:00 01:00:00:00 01:00:13:00');
  assert.equal(lines[4], '* FROM CLIP NAME: spiel.mp4');
  assert.match(lines[5], /^\* COMMENT: Tor BAL - 1:0 #38 /);
  assert.equal(lines[7], '002  AX       V     C        00:19:52:00 00:20:05:00 01:00:13:00 01:00:26:00');
});

test('EDL: Umfang wählbar, Drittel-Phasen nie enthalten', () => {
  synced();
  assert.equal(toEdl(buildClips(), { scope: 'goal' }).count, 9);
  assert.equal(toEdl(buildClips(), { scope: 'goalPenalty' }).count, 12);
  assert.equal(toEdl(buildClips(), { scope: 'all' }).count, 13);
});

test('EDL: Bildrate bestimmt die Frames im Zeitcode', () => {
  const s = setup();
  s.periods[1] = { start: 0 };
  place(ev(1), 10.5); // Start 2,5 s
  const line = toEdl(buildClips(), { fps: 50, scope: 'goal' }).text.split('\n')[3];
  assert.ok(line.includes('00:00:02:25 00:00:15:25'), line);
});

test('EDL-Kommentare bestehen nur aus ASCII', () => {
  synced();
  const text = toEdl(buildClips(), { scope: 'all' }).text;
  assert.ok(/^[\x0a\x20-\x7e]*$/.test(text), 'Nicht-ASCII-Zeichen in der EDL');
});
