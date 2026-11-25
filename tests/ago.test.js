import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ago } from '../web/js/format.js';

test('ago: relative Zeitangaben für „Zuletzt gesynct“', () => {
  const now = Date.parse('2026-11-25T12:00:00Z');
  assert.equal(ago('2026-11-25T11:59:40Z', now), 'gerade eben');
  assert.equal(ago('2026-11-25T11:15:00Z', now), 'vor 45 Min.');
  assert.equal(ago('2026-11-25T09:00:00Z', now), 'vor 3 Std.');
  assert.equal(ago('2026-11-24T10:00:00Z', now), 'gestern');
  assert.equal(ago('2026-11-21T12:00:00Z', now), 'vor 4 Tagen');
  assert.equal(ago('2026-10-01T12:00:00Z', now), '01.10.26');
  assert.equal(ago('kaputt', now), '');
});
