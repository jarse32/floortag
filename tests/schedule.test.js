// Tests für den Spielplan nach Spieltagen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByDay, defaultDay, dayRange } from '../web/js/schedule.js';

const g = (id, day, date, result = null, time = '18:00') => ({ id, day, date, time, result });
const games = [
  g(1, 2, '2026-09-27', '3:2'), g(2, 1, '2026-09-20', '5:4', '14:00'), g(3, 1, '2026-09-19', '1:7'),
  g(4, 3, '2026-10-31'), g(5, 3, '2026-11-01'), g(6, 2, '2026-09-26', '6:6')
];

test('Spiele nach Spieltag gruppiert und innerhalb nach Datum sortiert', () => {
  const days = groupByDay(games, { 1: '1. Spieltag', 2: 'Hinrunde 2' });
  assert.deepEqual(days.map(d => d.day), [1, 2, 3]);
  assert.deepEqual(days[0].games.map(x => x.id), [3, 2]);
  assert.equal(days[1].title, 'Hinrunde 2');
  assert.equal(days[2].title, '3. Spieltag'); // ohne Titel aus dem Saisonmanager
  assert.deepEqual([days[0].played, days[2].played], [2, 0]);
  assert.deepEqual([days[2].from, days[2].to], ['2026-10-31', '2026-11-01']);
});

test('Zuerst gezeigt: der letzte Spieltag mit Ergebnissen', () => {
  assert.equal(defaultDay(groupByDay(games)), 2);
  assert.equal(defaultDay(groupByDay([g(1, 4, '2027-01-01'), g(2, 5, '2027-01-08')])), 4); // noch nichts gespielt
  assert.equal(defaultDay([]), null);
});

test('Spiele ohne Spieltag landen am Ende', () => {
  const days = groupByDay([g(1, null, '2026-09-01', '1:0'), g(2, 1, '2026-09-02', '2:0')]);
  assert.deepEqual(days.map(d => [d.day, d.title]), [[1, '1. Spieltag'], [0, 'Ohne Spieltag']]);
});

test('Zeitraum eines Spieltags kurz', () => {
  assert.equal(dayRange('2026-10-10', '2026-10-10'), '10.10.');
  assert.equal(dayRange('2026-10-10', '2026-10-11'), '10.–11.10.');
  assert.equal(dayRange('2026-10-31', '2026-11-01'), '31.10.–1.11.');
  assert.equal(dayRange(null, null), '');
});
