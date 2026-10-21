// Tests für die Korrektur falscher Spielzeiten aus dem Saisonmanager
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { events, gameSec } from '../web/js/game.js';
import { place, gameTimeFor, correctGameTime, timeOf } from '../web/js/sync.js';
import { buildSyncFile, applySyncFile } from '../web/js/storage.js';
import { buildSharePayload, applySharePayload } from '../web/js/share.js';
import { absTime } from '../web/js/phases.js';
import { setup, miniGame } from './helpers.js';

// Fall aus Spiel 58665: Gasttor laut Saisonmanager bei 3:13, im Video aber nach dem Heimtor (6:33)
const goal = (id, team, time) => ({ event_id: id, event_type: 'goal', event_team: team, period: 1, time, home_goals: 0, guest_goals: 0 });
function game() {
  const s = setup(miniGame([goal(2, 'guest', '3:13'), goal(1, 'home', '6:33'), goal(4, 'guest', '15:19')]));
  s.periods[1] = { start: 1000, end: 2600 };
  place(events().find(e => e.event_id === 1), 1500); // 6:33
  return s;
}
const ev = id => events().find(e => e.event_id === id);

test('Setzen außerhalb der Reihenfolge meldet die gewünschte Stelle', () => {
  const s = game();
  assert.equal(place(ev(2), 1560), 1560);     // nach dem 6:33-Tor gewünscht
  assert.equal(s.placed[2], 1500);            // landet am Rand
  assert.equal(place(ev(2), 1300), null);     // innerhalb der Reihenfolge: keine Meldung
});

test('Geschätzte Spielzeit zur gewünschten Stelle, ohne das Ereignis selbst', () => {
  game();
  const g = gameTimeFor(ev(2), 1560);
  assert.ok(g > 393 && g < 1200, `Spielzeit ${g} sollte nach 6:33 liegen`);
});

test('Korrektur ändert Spielzeit, Reihenfolge und Grenzen', () => {
  const s = game();
  correctGameTime(ev(2), 7 * 60 + 5, 1560);
  assert.equal(gameSec(ev(2)), 425);
  assert.equal(s.placed[2], 1560);
  assert.deepEqual(events().map(e => e.event_id), [1, 2, 4]);
  assert.equal(absTime(ev(2)), 425);
  // Zurücksetzen: Saisonmanager-Zeit, Position wird wieder an den Rand gesetzt
  correctGameTime(ev(2), null);
  assert.equal(gameSec(ev(2)), 193);
  assert.deepEqual(events().map(e => e.event_id), [2, 1, 4]);
  assert.equal(s.placed[2], 1500);
});

test('Korrektur wirkt auf die Schätzung anderer Ereignisse', () => {
  game();
  const before = timeOf(ev(4));
  correctGameTime(ev(2), 425, 1560);
  assert.notEqual(timeOf(ev(4)), before);
});

test('Korrektur steht in Sync-Datei und Teilen-Link', () => {
  const s = game();
  correctGameTime(ev(2), 425, 1560);
  const file = buildSyncFile();
  assert.deepEqual(file.game_time_fixes, [{ event_id: 2, time: '07:05' }]);
  const link = JSON.parse(JSON.stringify(buildSharePayload()));
  s.gsFix = {};
  applySyncFile(file);
  assert.equal(gameSec(ev(2)), 425);
  s.gsFix = {};
  applySharePayload(link);
  assert.equal(gameSec(ev(2)), 425);
});
