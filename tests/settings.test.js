// Tests für die Absicherung der Einstellungen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSettings, applySyncFile } from '../web/js/storage.js';
import { timeOf } from '../web/js/sync.js';
import { setup, ev } from './helpers.js';

test('Ungültige Einstellungen werden auf Standardwerte gesetzt', () => {
  const s = setup(undefined, { periodLen: 60, otLen: null, pauseLen: NaN, leadIn: -3, leadOut: '5', counterLen: 0, fps: 23 });
  assert.deepEqual(sanitizeSettings().sort(), ['counterLen', 'fps', 'leadIn', 'leadOut', 'otLen', 'pauseLen', 'periodLen']);
  assert.deepEqual([s.periodLen, s.otLen, s.pauseLen, s.leadIn, s.leadOut, s.counterLen, s.fps], [1200, 600, 600, 8, 5, 10, 25]);
});

test('Gültige Einstellungen bleiben unverändert', () => {
  const s = setup(undefined, { periodLen: 900, pauseLen: 300, leadIn: 0, fps: 50 });
  assert.deepEqual(sanitizeSettings(), []);
  assert.deepEqual([s.periodLen, s.pauseLen, s.leadIn, s.fps], [900, 300, 0, 50]);
});

test('Fall aus der Praxis: Drittellänge 60 s lässt Schätzungen hinter das Drittelende laufen', () => {
  const s = setup(undefined, { periodLen: 60 });
  s.periods[3] = { start: 6035, end: 7555 };
  s.placed = { 10: 7555 }; // Strafe bei 12:53 versehentlich aufs Drittelende gesetzt
  assert.ok(timeOf(ev(11)) > 7555, 'mit 60 s läuft die Schätzung hinter das Drittelende');
  sanitizeSettings();
  assert.ok(timeOf(ev(11)) <= 7555, 'mit 20 Min. bleibt die Schätzung im Drittel');
});

test('Sync-Datei mit ungültiger Drittellänge wird abgesichert', () => {
  const s = setup();
  applySyncFile({ format: 'floortag-sync', version: 2, game_id: 58668, period_length_sec: 30, periods: {}, events: [] });
  assert.equal(s.periodLen, 1200);
});
