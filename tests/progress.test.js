// Tests für den Fortschritt eines Spiels in Stufen (Übersicht)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeProgress, gameMeta, STAGES } from '../web/js/progress.js';
import { addTag, setPlayer } from '../web/js/tags.js';
import { setMissing, place } from '../web/js/sync.js';
import { toggleLineupPlayer } from '../web/js/lineups.js';
import { events } from '../web/js/game.js';
import { setup, ev } from './helpers.js';

const allPeriods = s => { s.periods = { 1: { start: 300, end: 1920 }, 2: { start: 2520, end: 4140 }, 3: { start: 4740, end: 6360 } }; };

test('Stufe 0: noch nichts gesetzt', () => {
  setup();
  const p = computeProgress();
  assert.equal(p.stage, 0);
  assert.deepEqual(p.sync, { done: 0, total: 13, periodsSet: 0, periodsTotal: 3, started: false, complete: false });
  assert.equal(STAGES[0], 'Video');
});

test('Stufe 1: Sync begonnen, fertig erst mit allen Abschnitten und Ereignissen', () => {
  const s = setup();
  s.periods = { 1: { start: 300 } };
  let p = computeProgress();
  assert.equal(p.stage, 1);
  assert.equal(p.sync.started, true);
  assert.equal(p.sync.complete, false);
  allPeriods(s);
  for (const e of events()) place(e, 400);
  setMissing(ev(6), true); // „nicht im Video“ zählt als erledigt
  p = computeProgress();
  assert.equal(p.sync.done, 13);
  assert.equal(p.sync.complete, true);
  assert.equal(p.stage, 1);
});

test('Stufe 2: eigene Tags vorhanden (Torhüter-Tags zählen nicht)', () => {
  const s = setup();
  allPeriods(s);
  const gk = addTag({ code: 'goalie', v: 300, team: 'home' }); setPlayer(gk.id, 'home', 19);
  assert.equal(computeProgress().stage, 1);
  addTag({ code: 'shot', v: 400, team: 'home', outcome: 'on' });
  const p = computeProgress();
  assert.equal(p.stage, 2);
  assert.equal(p.tags, 1);
});

test('Stufe 3: Schüsse vollständig und Aufstellung bei allen zählenden Toren', () => {
  const s = setup();
  allPeriods(s);
  addTag({ code: 'shot', v: 400, team: 'home', outcome: 'on' });
  s.complete = { 1: { home: true, guest: true }, 2: { home: true, guest: true }, 3: { home: true, guest: true } };
  let p = computeProgress();
  assert.equal(p.shotsComplete, true);
  assert.equal(p.stage, 2); // Aufstellungen fehlen noch
  assert.deepEqual(p.lineups, { covered: 0, total: 9 });
  for (const e of events().filter(x => x.event_type === 'goal')) {
    toggleLineupPlayer(e.event_id, 'home', 99);
    toggleLineupPlayer(e.event_id, 'guest', 98);
  }
  p = computeProgress();
  assert.equal(p.stage, 3);
  assert.equal(p.fullyAnalysed, true);
});

test('Eckdaten für die Übersicht', () => {
  const s = setup();
  s.videoId = 'lfIFpRsE55I';
  assert.deepEqual(gameMeta(), {
    id: 58668, video: 'lfIFpRsE55I', date: '2026-10-10', start: '18:00',
    home: 'Baltic Storms', guest: 'TV Eiche Horn Bremen', homeShort: 'BAL', guestShort: 'TVEH',
    result: '5:4', league: '2. FBL Herren Nord/West', leagueId: 2449
  });
});
