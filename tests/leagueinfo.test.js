// Tests für Drittellänge und Verlängerung aus den Ligadaten
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leagueLengths, shouldApplyLeague, applyLeagueLengths } from '../web/js/leagueinfo.js';
import { setup } from './helpers.js';

test('Ligadaten werden in Sekunden umgerechnet', () => {
  assert.deepEqual(leagueLengths({ periods: 3, period_length: 20, overtime_length: 10 }), { periodLen: 1200, otLen: 600, periods: 3 });
  assert.deepEqual(leagueLengths({ periods: 2, period_length: 15, overtime_length: null }), { periodLen: 900, otLen: null, periods: 2 });
});

test('Unbrauchbare Ligadaten werden ignoriert', () => {
  assert.equal(leagueLengths(null), null);
  assert.equal(leagueLengths({ period_length: null }), null);
  assert.equal(leagueLengths({ period_length: 2 }), null);
  assert.equal(leagueLengths({ period_length: 45 }), null);
});

test('Übernahme nur ohne Handeinstellung und nie im geteilten Link', () => {
  assert.equal(shouldApplyLeague({ hadLocal: false, lengthSource: null, shared: false }), true);
  assert.equal(shouldApplyLeague({ hadLocal: true, lengthSource: null, shared: false }), true);
  assert.equal(shouldApplyLeague({ hadLocal: true, lengthSource: 'league', shared: false }), true);
  assert.equal(shouldApplyLeague({ hadLocal: true, lengthSource: 'manual', shared: false }), false);
  assert.equal(shouldApplyLeague({ hadLocal: false, lengthSource: null, shared: true }), false);
});

test('Übernahme setzt Längen und Herkunft, meldet Änderungen', () => {
  const s = setup(undefined, { periodLen: 1200, otLen: 600 });
  assert.equal(applyLeagueLengths({ periodLen: 900, otLen: 300 }), true);
  assert.deepEqual([s.periodLen, s.otLen, s.lengthSource], [900, 300, 'league']);
  assert.equal(applyLeagueLengths({ periodLen: 900, otLen: 300 }), false);
  // ohne Verlängerungsangabe bleibt die bisherige
  assert.equal(applyLeagueLengths({ periodLen: 600, otLen: null }), true);
  assert.deepEqual([s.periodLen, s.otLen], [600, 300]);
  assert.equal(applyLeagueLengths(null), false);
});
