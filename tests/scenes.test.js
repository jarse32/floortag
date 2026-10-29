// Tests für Szenen eines Teams über mehrere Spiele
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { state } from '../web/js/state.js';
import { classify, collectScenes, countByCat, loadGameState, sideOf, teamsOf, hasSyncData, playersOf, matchesPlayer } from '../web/js/scenes.js';
import { buildSyncFile } from '../web/js/storage.js';
import { addTag, updateTag } from '../web/js/tags.js';
import { setup } from './helpers.js';

const FIXTURE = JSON.parse(readFileSync(new URL('../fixtures/spiel_58668.json', import.meta.url), 'utf8'));
function synced() {
  const s = setup();
  s.periods[1] = { start: 1000, end: 2600 };
  s.periods[2] = { start: 3200, end: 4800 };
  s.periods[3] = { start: 5400, end: 7000 };
  return s;
}

test('Tore: Situation aus Sicht des Schützen wird für den Gegner gespiegelt', () => {
  const goal = side => ({ kind: 'goal', side });
  assert.deepEqual(classify(goal('home'), 'home', { powerPlay: true }), ['goal', 'pp_goal']);
  assert.deepEqual(classify(goal('home'), 'guest', { powerPlay: true }), ['goal_against', 'sh_goal_against']);
  assert.deepEqual(classify(goal('guest'), 'home', { shortHanded: true }), ['goal_against', 'pp_goal_against']);
  assert.deepEqual(classify(goal('home'), 'home', { extraAttacker: true }), ['goal', 'ea_goal']);
  assert.deepEqual(classify(goal('home'), 'guest', { emptyNet: true }), ['goal_against', 'en_goal_against']);
  assert.deepEqual(classify(goal('guest'), 'guest', { penaltyGoal: true }), ['goal', 'ps_goal']);
});

test('Phasen, Strafen, Auszeiten und Tags', () => {
  assert.deepEqual(classify({ kind: 'powerplay', side: 'home' }, 'home'), ['pp']);
  assert.deepEqual(classify({ kind: 'powerplay', side: 'home' }, 'guest'), []);
  assert.deepEqual(classify({ kind: 'boxplay', side: 'guest' }, 'guest'), ['sh']);
  assert.deepEqual(classify({ kind: 'penalty', side: 'guest' }, 'home'), ['penalty_against']);
  assert.deepEqual(classify({ kind: 'timeout', side: 'guest' }, 'home'), []);
  assert.deepEqual(classify({ kind: 'tag', tagKey: 'empty_net', side: 'home' }, 'home'), ['ea']);
  assert.deepEqual(classify({ kind: 'tag', tagKey: 'empty_net', side: 'home' }, 'guest'), ['ea_against']);
  assert.deepEqual(classify({ kind: 'tag', tagKey: 'shot', side: 'home', label: 'Torschuss' }, 'home'), ['tag:Torschuss']);
  assert.deepEqual(classify({ kind: 'tag-derived', tagKey: 'shot', side: 'guest', label: 'Save' }, 'guest'), ['tag:Save']);
  assert.deepEqual(classify({ kind: 'tag', tagKey: 'shot', side: 'home', label: 'Torschuss' }, 'guest'), []);
});

test('Testspiel aus Sicht von TVEH (Gast)', () => {
  synced();
  const n = countByCat(collectScenes('guest'));
  assert.equal(n.goal, 4);
  assert.equal(n.goal_against, 5);
  assert.equal(n.pp_goal_against, 1); // BAL trifft in Unterzahl
  assert.equal(n.penalty, 1);
  assert.equal(n.penalty_against, 2);
  assert.equal(n.pp, 2);
  assert.equal(n.sh, 2); // Strafe bei 18:45 läuft ins 2. Drittel: zwei Clips
});

test('Tags mit Gegenperspektive und Torhüter raus', () => {
  const s = synced();
  addTag({ code: 'shot', v: 1100, team: 'guest', outcome: 'on' });
  const t = addTag({ code: 'empty_net', v: 6900, team: 'guest' }); updateTag(t.id, { end: 6950 });
  const guest = countByCat(collectScenes('guest')), home = countByCat(collectScenes('home'));
  assert.equal(guest['tag:Torschuss'], 1);
  assert.equal(guest.ea, 1);
  assert.equal(home.ea_against, 1);
  assert.ok(Object.keys(home).some(k => k.startsWith('tag:')), 'Gegenperspektive für BAL');
  assert.equal(s.tags.length, 2);
});

test('Veröffentlichter Sync wird geladen, Einstellungen beginnen pro Spiel neu', () => {
  synced();
  state.periodLen = 900;
  const file = buildSyncFile();
  state.periodLen = 1500; state.periods = {}; state.leadIn = 20;
  const source = loadGameState(structuredClone(FIXTURE), 'lfIFpRsE55I', { pub: file });
  assert.equal(source, 'published');
  assert.equal(state.periods[2].start, 3200);
  assert.equal(state.periodLen, 900);
  assert.equal(state.leadIn, 8, 'Vorlauf wieder Standard');
  assert.equal(state.sharedView, true, 'nichts wird gespeichert');
  assert.ok(hasSyncData());
});

test('Ohne Sync gibt es keine Quelle; Ligadaten setzen die Drittellänge', () => {
  const source = loadGameState(structuredClone(FIXTURE), 'x', { league: { period_length: 15, overtime_length: 5 } });
  assert.equal(source, null);
  assert.equal(state.periodLen, 900);
});

test('Teams und Seite im Spielplan', () => {
  const games = [{ home: 'B', guest: 'A' }, { home: 'A', guest: 'C' }];
  assert.deepEqual(teamsOf(games), ['A', 'B', 'C']);
  assert.equal(sideOf(games[0], 'A'), 'guest');
  assert.equal(sideOf({ home_team_name: 'A' }, 'A'), 'home');
  assert.equal(sideOf(games[0], 'X'), null);
});


test('Spieler an Szenen über die player_id; Namen aus dem Kader, Jugendspieler nur mit Nummer', () => {
  synced();
  const scenes = collectScenes('guest');
  const players = playersOf(scenes);
  const by = nr => players.find(p => p.numbers.includes(nr));
  const p7 = by(7), p6 = by(6), p17 = by(17);
  assert.equal(p7.id, String(FIXTURE.players.guest.find(p => p.trikot_number === 7).player_id));
  assert.deepEqual([p7.goal, p7.assist, p7.label], [0, 2, `${FIXTURE.players.guest.find(p => p.trikot_number === 7).player_firstname} Schönfelder · #7`]);
  assert.deepEqual([p6.goal, p6.assist, p6.label], [1, 1, '#6']); // youth: true
  assert.deepEqual([p17.goal, p17.penalty], [1, 1]);
  // Gegentore tragen keine eigenen Spieler
  assert.ok(scenes.filter(s => s.cats.includes('goal_against')).every(s => !s.people.length));
  // Spieler mit Namen zuerst, Jugendspieler dahinter
  assert.equal(players[players.length - 1].name, '');
});

test('Nummernwechsel: dieselbe player_id mit zwei Nummern ist ein Spieler', () => {
  const a = { people: [{ id: '42', nr: 7, name: 'Lars Beispiel', role: 'goal' }] };
  const b = { people: [{ id: '42', nr: 17, name: 'Lars Beispiel', role: 'assist' }, { id: 'n9', nr: 9, name: '', role: 'goal' }] };
  const players = playersOf([a, b]);
  assert.equal(players.length, 2);
  assert.deepEqual([players[0].label, players[0].goal, players[0].assist], ['Lars Beispiel · #7, #17', 1, 1]);
  assert.equal(players[1].label, '#9');
  assert.equal(matchesPlayer(b, '42', new Set(['goal'])), false);
  assert.equal(matchesPlayer(b, '42', new Set(['assist'])), true);
});

test('Spielerauswahl filtert nach Rolle', () => {
  synced();
  const scenes = collectScenes('guest');
  const id = nr => String(FIXTURE.players.guest.find(p => p.trikot_number === nr).player_id);
  const goals = new Set(['goal']), assists = new Set(['assist']), both = new Set(['goal', 'assist']);
  assert.equal(scenes.filter(s => matchesPlayer(s, id(7), goals)).length, 0);
  assert.equal(scenes.filter(s => matchesPlayer(s, id(7), assists)).length, 2);
  assert.equal(scenes.filter(s => matchesPlayer(s, id(6), both)).length, 2);
  assert.equal(scenes.filter(s => matchesPlayer(s, id(17), new Set(['penalty']))).length, 1);
  assert.equal(scenes.filter(s => matchesPlayer(s, null, goals)).length, scenes.length);
});
