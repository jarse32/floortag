// Tests für freie Anker, „nicht im Video“ und die Sync-Datei
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeOf, place, setMissing, addAnchor, removeAnchor, gameTimeAt, bounds } from '../web/js/sync.js';
import { buildChapters } from '../web/js/chapters.js';
import { buildSyncFile, applySyncFile } from '../web/js/storage.js';
import { setup, ev } from './helpers.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

// 2. Drittel mit Streamlücke: zwischen 10:00 und 15:00 Spielzeit fehlen im Video 5 Minuten
function withGap() {
  const s = setup();
  s.periods[2] = { start: 0, end: 1700 };
  addAnchor(2, 600, 700); // letzter Moment vor der Lücke
  addAnchor(2, 900, 705); // erster Moment danach
  return s;
}

// ===== Freie Anker =====
test('Freie Anker teilen die Interpolation an der Lücke', () => {
  withGap();
  // Tor 5 (5:53) liegt vor der Lücke: zwischen Anpfiff und Anker 10:00
  near(timeOf(ev(5)), 353 * 700 / 600);
  // Tor 7 (18:51) liegt nach der Lücke: zwischen Anker 15:00 und Drittelende
  near(timeOf(ev(7)), 705 + (1131 - 900) / (1200 - 900) * (1700 - 705));
});

test('Ohne freie Anker würde die Lücke alles verschieben', () => {
  const s = withGap();
  const withAnchors = timeOf(ev(5));
  s.anchors = {};
  assert.ok(Math.abs(timeOf(ev(5)) - withAnchors) > 60, 'Schätzung sollte sich deutlich ändern');
});

test('Freie Anker reichen ohne Drittelbeginn (Stream startet zu spät)', () => {
  const s = setup();
  addAnchor(1, 600, 50); // Stream beginnt bei 10:00 im 1. Drittel
  assert.equal(timeOf(ev(2)), 50 + (747 - 600)); // 1:1 weiter
  assert.equal(timeOf(ev(1)), 50 - (600 - 364)); // vor dem Streambeginn: negativ, also nicht im Video
  assert.ok(timeOf(ev(1)) < 0);
  assert.equal(s.anchors[1].length, 1);
});

test('Freie Anker werden auf die benachbarten Anker begrenzt', () => {
  const s = setup();
  s.periods[1] = { start: 100, end: 1800 };
  place(ev(2), 900); // 12:27
  addAnchor(1, 900, 500); // 15:00 darf nicht vor 12:27 (900) liegen
  assert.equal(s.anchors[1][0].v, 900);
  addAnchor(1, 300, 2000); // 5:00 darf nicht hinter 12:27 liegen
  assert.deepEqual(s.anchors[1].map(a => a.g), [300, 900]); // nach Spielzeit sortiert
  assert.equal(s.anchors[1][0].v, 900);
});

test('Freie Anker begrenzen auch gesetzte Ereignisse', () => {
  withGap();
  const b = bounds(ev(6)); // Strafe 16:49 liegt nach dem Anker 15:00 (705)
  assert.equal(b.lo, 705);
  assert.equal(b.hi, 1700);
});

test('Freier Anker lässt sich entfernen', () => {
  const s = withGap();
  removeAnchor(2, 0);
  assert.deepEqual(s.anchors[2], [{ g: 900, v: 705 }]);
  removeAnchor(2, 0);
  assert.equal(s.anchors[2], undefined);
});

// ===== Rückwärtsschätzung =====
test('Spielzeit zur Videozeit wird rückwärts geschätzt', () => {
  const s = setup();
  assert.equal(gameTimeAt(1, 500), null); // ohne Anker kein Vorschlag
  s.periods[1] = { start: 0, end: 1620 };
  assert.equal(gameTimeAt(1, 810), 600);
  assert.equal(gameTimeAt(1, -100), 0);     // nicht vor 0:00
  assert.equal(gameTimeAt(1, 99999), 1200); // nicht nach Drittelende
});

test('Rückwärtsschätzung berücksichtigt freie Anker', () => {
  withGap();
  assert.equal(gameTimeAt(2, 350), 300);  // vor der Lücke
  assert.equal(gameTimeAt(2, 705), 900);  // genau am Anker nach der Lücke
  assert.equal(gameTimeAt(2, 1700), 1200);
});

// ===== Nicht im Video =====
test('„Nicht im Video“ entfernt Zeit und Anker eines Ereignisses', () => {
  const s = setup();
  s.periods[1] = { start: 0, end: 1620 };
  place(ev(2), 1000);
  setMissing(ev(2), true);
  assert.equal(timeOf(ev(2)), null);
  assert.equal(s.placed[2], undefined);
  // Tor 3 wird wieder nur aus Beginn und Ende geschätzt
  near(timeOf(ev(3)), 937 * 1620 / 1200);
});

test('Setzen nimmt „nicht im Video“ zurück', () => {
  const s = setup();
  s.periods[1] = { start: 0 };
  setMissing(ev(1), true);
  place(ev(1), 400);
  assert.equal(s.missing[1], undefined);
  assert.equal(timeOf(ev(1)), 400);
  setMissing(ev(2), true);
  setMissing(ev(2), false);
  assert.equal(timeOf(ev(2)), 400 + (747 - 364));
});

test('Kapitel lassen Ereignisse „nicht im Video“ weg und zählen sie getrennt', () => {
  const s = setup();
  s.periods[1] = { start: 300, end: 1920 };
  setMissing(ev(2), true);
  const c = buildChapters();
  assert.equal(c.notInVideo, 1);
  assert.ok(!c.text.includes('2:0 BAL'));
  assert.ok(c.text.includes('1:0 BAL'));
  assert.equal(c.missing, 8); // Drittel 2 und 3 (3 + 5 Tore und Strafen) haben noch keine Zeiten
});

// ===== Sync-Datei =====
test('Sync-Datei Version 2 enthält Anker, „nicht im Video“ und Pausenlänge', () => {
  const s = withGap();
  s.pauseLen = 660;
  place(ev(5), 400);
  setMissing(ev(6), true);
  const d = buildSyncFile();
  assert.equal(d.version, 2);
  assert.equal(d.pause_length_sec, 660);
  assert.deepEqual(d.free_anchors, [
    { period: 2, time: '10:00', video_sec: 700 },
    { period: 2, time: '15:00', video_sec: 705 }
  ]);
  assert.deepEqual(d.not_in_video, [6]);
  assert.deepEqual(d.events.map(e => e.event_id), [5]);
});

test('Sync-Datei übersteht Speichern und Laden unverändert', () => {
  const s = withGap();
  place(ev(5), 400);
  setMissing(ev(6), true);
  const d = JSON.parse(JSON.stringify(buildSyncFile()));
  const before = { anchors: structuredClone(s.anchors), placed: { ...s.placed }, missing: { ...s.missing }, periods: structuredClone(s.periods) };
  setup();
  applySyncFile(d);
  assert.deepEqual(s.anchors, before.anchors);
  assert.deepEqual(s.placed, before.placed);
  assert.deepEqual(s.missing, before.missing);
  assert.deepEqual(s.periods, before.periods);
});

test('Sync-Datei Version 1 lässt sich weiter laden', () => {
  const s = withGap();
  setMissing(ev(7), true);
  applySyncFile({
    format: 'floortag-sync', version: 1, game_id: 58668, video_id: 'test',
    period_length_sec: 1200, overtime_length_sec: 600,
    periods: { 1: { start: 10, end: 1700 } },
    events: [{ event_id: 1, period: 1, time: '6:04', video_sec: 500 }]
  });
  assert.deepEqual(s.anchors, {});  // alte Anker verworfen
  assert.deepEqual(s.missing, {});
  assert.equal(s.placed[1], 500);
  assert.equal(s.pauseLen, 600);    // bleibt, wenn die Datei keine Pausenlänge hat
});

test('Sync-Dateien aus einer neueren Version und zu anderen Spielen werden abgelehnt', () => {
  setup();
  assert.throws(() => applySyncFile({ format: 'floortag-sync', version: 3, game_id: 58668 }), /neueren FloorTag-Version/);
  assert.throws(() => applySyncFile({ format: 'floortag-sync', version: 2, game_id: 1 }), /gehört zu Spiel 1/);
  assert.throws(() => applySyncFile({ format: 'etwas-anderes' }), /keine FloorTag-Sync-Datei/);
});
