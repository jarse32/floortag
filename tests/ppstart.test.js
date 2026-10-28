// Tests für den Beginn von Über- und Unterzahl nach einer Strafe
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../web/js/state.js';
import { events } from '../web/js/game.js';
import { timeOf } from '../web/js/sync.js';
import { buildClips } from '../web/js/export.js';
import { ppDelayEstimate, phaseOfPenalty, ppStartOf, setPpStart } from '../web/js/ppstart.js';
import { buildSyncFile, applySyncFile } from '../web/js/storage.js';
import { setup } from './helpers.js';

function synced(overrides = {}) {
  const s = setup(undefined, overrides);
  s.periods[1] = { start: 1000, end: 2600 };
  s.periods[2] = { start: 3200, end: 4800 };
  s.periods[3] = { start: 5400, end: 7000 };
  return s;
}
const pens = () => events().filter(e => e.event_type === 'penalty');
const box = () => buildClips().filter(c => c.kind === 'boxplay').map(c => Math.round(c.start * 10) / 10);

test('Geschätzter Beginn: Strafe plus Abstand, nicht für den Teil nach der Drittelpause', () => {
  synced({ ppDelay: 0 });
  const [a0, b0, c0] = box();
  state.ppDelay = 30;
  const [a, b, c] = box();
  assert.equal(Math.round(a - a0), 30); // Strafe TVEH bei 18:45 im 1. Drittel
  assert.equal(b, b0);                  // Rest ab Beginn des 2. Drittels
  assert.equal(Math.round(c - c0), 30);
});

test('Gesetzter Beginn gilt und verbessert die Schätzung der übrigen Strafen', () => {
  synced();
  const [first, second] = pens();
  setPpStart(first, timeOf(first) + 50);
  assert.deepEqual(ppStartOf(first), { v: Math.round((timeOf(first) + 50) * 10) / 10, set: true });
  assert.equal(ppDelayEstimate(), 50);
  assert.equal(Math.round(ppStartOf(second).v - timeOf(second)), 50);
  assert.equal(box()[0], state.ppStart[first.event_id]);
  setPpStart(first, null);
  assert.equal(ppDelayEstimate(), 30);
});

test('Nie vor der Strafe; jede Strafe dieses Spiels beginnt eine Phase', () => {
  synced();
  const [first] = pens();
  setPpStart(first, timeOf(first) - 20);
  assert.equal(state.ppStart[first.event_id], Math.round(timeOf(first) * 10) / 10);
  assert.ok(pens().every(e => phaseOfPenalty(e)));
  assert.equal(phaseOfPenalty(events().find(e => e.event_type === 'goal')), null);
});

test('Phase kürzer als der Abstand bleibt beim Pfiff', () => {
  synced({ ppDelay: 0 });
  const raw = box();
  state.ppDelay = 170; // länger als jede Phase im Video
  assert.deepEqual(box(), raw);
});

test('Sync-Datei enthält gesetzte Beginne und den Abstand', () => {
  synced({ ppDelay: 40 });
  const [first] = pens();
  setPpStart(first, timeOf(first) + 33);
  const file = buildSyncFile();
  assert.deepEqual(file.pp_starts, [{ event_id: first.event_id, video_sec: state.ppStart[first.event_id] }]);
  assert.equal(file.pp_delay_sec, 40);
  state.ppStart = {}; state.ppDelay = 30;
  applySyncFile(file);
  assert.equal(state.ppStart[first.event_id], file.pp_starts[0].video_sec);
  assert.equal(state.ppDelay, 40);
});
