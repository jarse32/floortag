// Tests für Torhüter-Einsatz und „Torhüter raus“ in der Spielstärke
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTag, updateTag, setPlayer, goalieAt, goalkeepers } from '../web/js/tags.js';
import { powerPlayPhases, emptyNetWindows } from '../web/js/phases.js';
import { buildClips, tagClips } from '../web/js/export.js';
import { fmtGame } from '../web/js/format.js';
import { setup, miniGame } from './helpers.js';

const names = { home: 'BAL', guest: 'TVEH' };
const label = (c, g) => Object.fromEntries(c.labels)[g];
const show = () => powerPlayPhases().map(p => `${p.team} ${p.p} ${fmtGame(p.from)}–${fmtGame(p.to)} ${p.strength.join(':')}${p.emptyNet.length ? ' ohne TH ' + p.emptyNet.join(',') : ''}`);
// Drittel 1 bei Videozeit 1000–2200 im Verhältnis 1:1 (20 Min. Spielzeit = 20 Min. Video)
function linear(evts = []) {
  const s = setup(miniGame(evts));
  s.periods[1] = { start: 1000, end: 2200 };
  s.periods[2] = { start: 3000, end: 4200 };
  s.periods[3] = { start: 5000, end: 6200 };
  return s;
}
const goalieTag = (team, v, nr) => { const t = addTag({ code: 'goalie', v, team }); setPlayer(t.id, team, nr); return t; };
const emptyNet = (team, v, end) => { const t = addTag({ code: 'empty_net', v, team }); updateTag(t.id, { end }); return t; };

// ===== Torhüter =====
test('Ohne Torhüter-Tag gilt der einzige Torhüter im Kader', () => {
  setup();
  assert.deepEqual(goalkeepers('home').map(p => p.trikot_number), [19]);
  assert.equal(goalieAt('home', 500), 19);
  assert.equal(goalieAt('guest', 500), 1);
});

test('Ohne eindeutigen Torhüter im Kader ist der Torhüter unbekannt', () => {
  setup(miniGame([], { players: { home: [{ trikot_number: 1, goalkeeper: true }, { trikot_number: 30, goalkeeper: true }], guest: [] } }));
  assert.equal(goalieAt('home', 500), null);
  assert.equal(goalieAt('guest', 500), null);
});

test('Torhüterwechsel gilt ab der Szene des Tags', () => {
  setup();
  goalieTag('home', 3000, 99);
  assert.equal(goalieAt('home', 2999), 19);
  assert.equal(goalieAt('home', 3000), 99);
  goalieTag('home', 4000, 19); // zurückgewechselt
  assert.equal(goalieAt('home', 5000), 19);
  assert.equal(goalieAt('guest', 5000), 1); // anderes Team unberührt
});

test('Torhüter-Tags erzeugen keinen Clip', () => {
  setup();
  assert.deepEqual(tagClips(goalieTag('home', 100, 19), names), []);
});

test('Saves und gehaltene Penaltys tragen den Torhüter, der gerade im Tor stand', () => {
  setup();
  goalieTag('guest', 3000, 30);
  const before = tagClips(addTag({ code: 'shot', v: 2000, team: 'home', outcome: 'on' }), names)[1];
  const after = tagClips(addTag({ code: 'shot', v: 3500, team: 'home', outcome: 'on' }), names)[1];
  const pen = tagClips(addTag({ code: 'penalty_shot', v: 3600, team: 'home', outcome: 'miss' }), names)[1];
  assert.match(label(before, 'Torhüter'), /^#1 /);
  assert.equal(label(after, 'Torhüter'), '#30'); // nicht im Kader: nur Nummer
  assert.equal(label(pen, 'Torhüter'), '#30');
  // Ein Block hat keinen Torhüter-Bezug
  assert.equal(label(tagClips(addTag({ code: 'shot', v: 3700, team: 'home', outcome: 'blocked' }), names)[1], 'Torhüter'), undefined);
});

// ===== Torhüter raus =====
test('Torhüter-raus-Phase wird in Spielzeit umgerechnet', () => {
  linear();
  emptyNet('guest', 2140, 2190); // 1. Drittel 19:00–19:50
  assert.deepEqual(emptyNetWindows(), { home: [], guest: [{ start: 1140, end: 1190 }] });
});

test('Offene oder nicht zuordenbare Phasen zählen nicht', () => {
  linear();
  addTag({ code: 'empty_net', v: 2100, team: 'guest' });      // ohne Ende
  emptyNet('home', 2500, 2600);                                 // in der Drittelpause
  assert.deepEqual(emptyNetWindows(), { home: [], guest: [] });
});

test('6 gegen 5 ohne Strafen', () => {
  linear();
  emptyNet('guest', 2140, 2190);
  assert.deepEqual(show(), ['guest 1 19:00–19:50 6:5 ohne TH guest']);
});

test('Überzahl und Torhüter raus: 6 gegen 4', () => {
  linear([{ event_id: 1, event_type: 'penalty', event_team: 'home', period: 1, time: '18:30', penalty_type: 'penalty_2' }]);
  emptyNet('guest', 2140, 2190); // 19:00–19:50
  assert.deepEqual(show(), [
    'guest 1 18:30–19:00 5:4',
    'guest 1 19:00–19:50 6:4 ohne TH guest',
    'guest 1 19:50–20:00 5:4',
    'guest 2 00:00–00:30 5:4'
  ]);
});

test('Unterzahl mit Torhüter raus ist zahlenmäßig ausgeglichen', () => {
  linear([{ event_id: 1, event_type: 'penalty', event_team: 'home', period: 1, time: '18:30', penalty_type: 'penalty_2' }]);
  emptyNet('home', 2140, 2190); // das bestrafte Team nimmt den Torhüter raus
  assert.deepEqual(show(), ['guest 1 18:30–19:00 5:4', 'guest 1 19:50–20:00 5:4', 'guest 2 00:00–00:30 5:4']);
});

test('Kleinfeld: 4 gegen 3 mit Torhüter raus', () => {
  const s = linear();
  s.kleinfeld = true;
  emptyNet('home', 1100, 1160);
  assert.deepEqual(show(), ['home 1 01:40–02:40 4:3 ohne TH home']);
});

test('Export: Phase mit Torhüter raus trägt das Label', () => {
  linear();
  emptyNet('guest', 2140, 2190);
  const pp = buildClips().filter(c => c.kind === 'powerplay');
  assert.equal(pp.length, 1);
  assert.equal(pp[0].code, 'Überzahl GAST');
  assert.equal(label(pp[0], 'Stärke'), '6 gegen 5');
  assert.equal(label(pp[0], 'Torhüter raus'), 'GAST');
  assert.deepEqual([pp[0].start, pp[0].end], [2140, 2190]);
});
