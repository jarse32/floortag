// Tests für Beiträge ohne Schlüssel und lesbare Änderungsvorschläge
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeChange, contributionText } from '../web/js/publish.js';
import { setup } from './helpers.js';

test('Vorschläge werden lesbar beschrieben', () => {
  setup();
  assert.equal(describeChange({ key: 'e1', old: 900, new: 905 }), '1:0 Tor BAL #38 Jablonski (1. Dr. 6:04): 15:00 → 15:05');
  assert.equal(describeChange({ key: 'p2.start', old: null, new: 2500 }), '2. Drittel Anpfiff: neu bei 41:40');
  assert.match(describeChange({ key: 'm6', old: 1, new: null }), /„nicht im Video“ aufgehoben$/);
  assert.match(describeChange({ key: 'pp4', old: 2135, new: 2140 }), /^Beginn Überzahl nach Strafe TVEH/);
  assert.match(describeChange({ key: 'f2', old: null, new: '7:05' }), /^Spielzeit von .*: neu bei 7:05$/);
  assert.equal(describeChange({ key: 'a1:15:00', old: 3327, new: null }), 'Freier Anker 1. Dr. 15:00: entfernt (war 55:27)');
  assert.equal(describeChange({ key: 's.period_length_sec', old: 1200, new: 900 }), 'Drittellänge: 20 Min. → 15 Min.');
});

test('Rückmeldung nach dem Beitragen', () => {
  assert.match(contributionText({ unchanged: true }), /nichts beizutragen/);
  assert.equal(contributionText({ added: 2, changes: 0, proposal: null, version: 3 }), '2 Ergänzungen als Version 3 veröffentlicht.');
  assert.equal(contributionText({ added: 0, changes: 1, proposal: 'ab12cd34', version: 3 }),
    '1 Änderung an schon Gesetztem als Vorschlag abgelegt; darüber entscheidet, wer den Bearbeitungsschlüssel hat.');
  assert.match(contributionText({ added: 1, changes: 2, proposal: null, proposals_full: true, version: 4 }), /^1 Ergänzung als Version 4 veröffentlicht, deine Änderungen .* zu viele Vorschläge offen sind\.$/);
});
