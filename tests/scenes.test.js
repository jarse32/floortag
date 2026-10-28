// Tests für Szenen eines Teams über mehrere Spiele
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { state } from '../web/js/state.js';
import { classify, collectScenes, countByCat, loadGameState, sideOf, teamsOf, hasSyncData } from '../web/js/scenes.js';
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

test('Überzahl beginnt nach der Strafe erst nach dem Versatz, nicht nach der Drittelpause', () => {
  synced();
  const pp = d => collectScenes('guest', { ppDelay: d }).filter(s => s.kind === 'powerplay').map(s => s.start);
  const without = pp(0), with30 = pp(30);
  assert.equal(without.length, with30.length);
  // Erste Phase: Strafe BAL im 2. Drittel bei 16:49 → 30 s später
  const d = with30.map((v, i) => Math.round(v - without[i]));
  assert.ok(d.every(x => x === 30 || x === 0));
  assert.ok(d.includes(30));
  // Unterzahl-Clip des Gegners hat denselben Beginn
  const sh = collectScenes('home', { ppDelay: 30 }).filter(s => s.kind === 'boxplay').map(s => s.start);
  assert.deepEqual(sh, with30);
});

test('Phase nach der Drittelpause wird nicht verschoben', () => {
  synced();
  const box = d => collectScenes('guest', { ppDelay: d }).filter(s => s.kind === 'boxplay').map(s => Math.round(s.start));
  const [first0, second0] = box(0), [first30, second30] = box(30);
  assert.equal(first30 - first0, 30);  // Strafe TVEH bei 18:45 im 1. Drittel
  assert.equal(second30, second0);     // Rest der Strafe ab Beginn des 2. Drittels
});
