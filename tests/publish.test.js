// Tests für veröffentlichte Syncs: Entscheidung beim Laden und Übernehmen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideOnLoad, adoptPublished, tokenValid } from '../web/js/publish.js';
import { buildSyncFile } from '../web/js/storage.js';
import { place } from '../web/js/sync.js';
import { addTag } from '../web/js/tags.js';
import { setup, ev } from './helpers.js';

const pub = (latest, version = latest) => ({ latest, version });

test('Kein veröffentlichter Sync: nichts zu tun', () => {
  assert.equal(decideOnLoad({ hasLocal: false, source: null, pub: null }), 'none');
});

test('Kein eigener Stand: veröffentlichten Sync übernehmen', () => {
  assert.equal(decideOnLoad({ hasLocal: false, source: null, pub: pub(3) }), 'adopt');
});

test('Unveränderter Stand auf älterer Version: still aktualisieren', () => {
  assert.equal(decideOnLoad({ hasLocal: true, source: { version: 2, edited: false }, pub: pub(3) }), 'update');
  assert.equal(decideOnLoad({ hasLocal: true, source: { version: 3, edited: false }, pub: pub(3) }), 'none');
});

test('Veränderter oder unabhängiger Stand: Übernehmen nur anbieten', () => {
  assert.equal(decideOnLoad({ hasLocal: true, source: { version: 2, edited: true }, pub: pub(3) }), 'offer');
  assert.equal(decideOnLoad({ hasLocal: true, source: null, pub: pub(1) }), 'offer');
  // eigene, noch nicht veröffentlichte Änderungen auf der aktuellen Version: nichts überschreiben
  assert.equal(decideOnLoad({ hasLocal: true, source: { version: 3, edited: true }, pub: pub(3) }), 'none');
});

test('Übernehmen ersetzt den Sync, Tags bleiben', () => {
  const s = setup();
  s.periods = { 1: { start: 300, end: 1920 } };
  place(ev(1), 900);
  const published = { latest: 4, version: 4, sync: JSON.parse(JSON.stringify(buildSyncFile())) };
  setup(); // eigener, anderer Stand mit einem Tag
  addTag({ code: 'shot', v: 500, team: 'home', outcome: 'on' });
  adoptPublished(published);
  assert.deepEqual(s.periods, { 1: { start: 300, end: 1920 } });
  assert.equal(s.placed[1], 900);
  assert.equal(s.tags.length, 1);
  assert.deepEqual(s.syncSource, { version: 4, edited: false });
});

test('Ältere Version laden gilt als eigene Änderung', () => {
  const s = setup();
  const old = { latest: 5, version: 2, sync: JSON.parse(JSON.stringify(buildSyncFile())) };
  adoptPublished(old, { edited: true });
  assert.deepEqual(s.syncSource, { version: 5, edited: true });
  assert.equal(decideOnLoad({ hasLocal: true, source: s.syncSource, pub: pub(5) }), 'none'); // wird nicht still überschrieben
});

test('Bearbeitungsschlüssel: 32 Zeichen aus 0–9 und a–f', () => {
  assert.equal(tokenValid('0123456789abcdef0123456789abcdef'), true);
  assert.equal(tokenValid('0123456789ABCDEF0123456789abcdef'), false);
  assert.equal(tokenValid('zu kurz'), false);
});
