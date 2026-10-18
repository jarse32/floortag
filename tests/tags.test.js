// Tests für eigene Tags (FloorTag-Standard v1), Tag-Datei und Export
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, codeOf, addTag, updateTag, setPlayer, removeTag, openPhase, nextShootoutTeam, shootoutScore, faceoffAdvantage } from '../web/js/tags.js';
import { buildTagFile, applyTagFile } from '../web/js/storage.js';
import { buildClips, tagClips, toSportscodeXml, toEdl } from '../web/js/export.js';
import { setup } from './helpers.js';

const names = { home: 'BAL', guest: 'TVEH' };
const label = (c, g) => Object.fromEntries(c.labels)[g];
const synced = () => { const s = setup(); s.periods[1] = { start: 300, end: 1920 }; return s; };

// ===== Katalog =====
test('Standard-Katalog: feste Schlüssel in fester Reihenfolge (Tastenkürzel 1–9)', () => {
  assert.deepEqual(CATALOG.map(c => c.key), ['shot', 'penalty_shot', 'faceoff', 'free_hit', 'turnover', 'counter', 'empty_net', 'special', 'goalie']);
  for (const c of CATALOG) assert.ok(c.label);
});

// ===== Bearbeiten =====
test('Tag anlegen, ändern, Spieler wählen und wieder abwählen, löschen', () => {
  const s = setup();
  const t = addTag({ code: 'shot', v: 100.04, team: 'guest', outcome: 'off' });
  assert.equal(t.v, 100);
  updateTag(t.id, { outcome: 'on', v: 101.27 });
  assert.equal(t.outcome, 'on');
  assert.equal(t.v, 101.3);
  setPlayer(t.id, 'guest', 17);
  assert.equal(t.players.guest, 17);
  setPlayer(t.id, 'guest', 17);
  assert.equal(t.players.guest, null);
  removeTag(t.id);
  assert.equal(s.tags.length, 0);
});

test('Tags sind nach Videozeit sortiert', () => {
  const s = setup();
  addTag({ code: 'turnover', v: 300 });
  addTag({ code: 'turnover', v: 100 });
  const late = addTag({ code: 'turnover', v: 200 });
  updateTag(late.id, { v: 50 });
  assert.deepEqual(s.tags.map(t => t.v), [50, 100, 300]);
});

test('Bully: Team ergibt sich aus dem Ergebnis', () => {
  setup();
  const t = addTag({ code: 'faceoff', v: 10, team: 'home', outcome: 'guest' });
  assert.equal(t.team, 'guest');
  updateTag(t.id, { outcome: 'draw' });
  assert.equal(t.team, null);
});

test('Bully-Vorteil nach Regelwerk: Mittellinie Gast, sonst das Team der Hälfte', () => {
  assert.equal(faceoffAdvantage({ place: 'center' }), 'guest');
  assert.equal(faceoffAdvantage({ place: 'half_home' }), 'home');
  assert.equal(faceoffAdvantage({ place: 'half_guest' }), 'guest');
  assert.equal(faceoffAdvantage({ place: null }), null);
});

test('Besonderes Ereignis darf ohne Team sein, andere Codes nicht', () => {
  setup();
  assert.equal(addTag({ code: 'special', v: 1 }).team, null);
  assert.equal(addTag({ code: 'shot', v: 1 }).team, 'home');
});

test('Phase „Torhüter raus“: offen, bis ein Ende gesetzt ist', () => {
  setup();
  const t = addTag({ code: 'empty_net', v: 5000, team: 'guest' });
  assert.equal(openPhase('empty_net', 'guest'), t);
  assert.equal(openPhase('empty_net', 'home'), undefined);
  updateTag(t.id, { end: 5040 });
  assert.equal(openPhase('empty_net', 'guest'), undefined);
  updateTag(t.id, { end: 4000 }); // Ende vor Beginn wird auf den Beginn gezogen
  assert.equal(t.end, 5000);
});

// ===== Penaltyschießen =====
test('Penaltyschießen: Teams wechseln ab, Stand wird gezählt', () => {
  setup();
  assert.equal(nextShootoutTeam('guest'), 'guest'); // erster Versuch: gewähltes Team
  addTag({ code: 'penalty_shot', v: 10, team: 'guest', outcome: 'goal', shootout: true });
  assert.equal(nextShootoutTeam('guest'), 'home');
  addTag({ code: 'penalty_shot', v: 40, team: 'home', outcome: 'miss', shootout: true });
  addTag({ code: 'penalty_shot', v: 70, team: 'guest', outcome: 'miss', shootout: true });
  addTag({ code: 'penalty_shot', v: 100, team: 'home', outcome: 'goal', shootout: true });
  addTag({ code: 'penalty_shot', v: 50, team: 'home', outcome: 'goal' }); // Penalty im Spiel zählt nicht mit
  assert.deepEqual(shootoutScore(), { home: 1, guest: 1, attempts: 4 });
  assert.equal(nextShootoutTeam('guest'), 'guest');
});

// ===== Export =====
test('Moment-Tag: Clip mit Vor- und Nachlauf, Labels für Team, Abschnitt, Spielzeit, Ergebnis, Spieler', () => {
  synced();
  const t = addTag({ code: 'shot', v: 900, team: 'home', outcome: 'off' });
  setPlayer(t.id, 'home', 38);
  const [c] = tagClips(t, names);
  assert.equal(c.code, 'Torschuss BAL');
  assert.deepEqual([c.start, c.end], [892, 905]);
  assert.equal(label(c, 'Abschnitt'), '1. Drittel');
  assert.equal(label(c, 'Spielzeit'), '07:24'); // 600 s Video nach Anpfiff, 27 Min. Video für 20 Min. Spielzeit: 600 × 1200/1620 ≈ 444 s
  assert.equal(label(c, 'Ergebnis'), 'daneben');
  assert.match(label(c, 'Spieler'), /^#38 /);
});

test('Gegenperspektive: Schuss aufs Tor → Save, geblockt → Block, daneben → nichts', () => {
  setup();
  const on = tagClips(addTag({ code: 'shot', v: 100, team: 'home', outcome: 'on' }), names);
  assert.deepEqual(on.map(c => c.code), ['Torschuss BAL', 'Save TVEH']);
  assert.equal(on[1].kind, 'tag-derived');
  assert.equal(label(on[1], 'Team'), 'TVEH');
  assert.deepEqual(tagClips(addTag({ code: 'shot', v: 200, team: 'home', outcome: 'blocked' }), names).map(c => c.code), ['Torschuss BAL', 'Block TVEH']);
  assert.deepEqual(tagClips(addTag({ code: 'shot', v: 300, team: 'home', outcome: 'off' }), names).map(c => c.code), ['Torschuss BAL']);
});

test('Gegenperspektive: Ballverlust, Freistoßabwehr, Konterabwehr, Penalty gehalten, Bully verloren', () => {
  setup();
  const codes = t => tagClips(t, names).map(c => c.code);
  assert.deepEqual(codes(addTag({ code: 'turnover', v: 1, team: 'guest' })), ['Ballgewinn TVEH', 'Ballverlust BAL']);
  assert.deepEqual(codes(addTag({ code: 'free_hit', v: 1, team: 'home', place: 'corner' })), ['Freistoß BAL', 'Freistoßabwehr TVEH']);
  assert.deepEqual(codes(addTag({ code: 'counter', v: 1, team: 'home' })), ['Konter BAL', 'Konterabwehr TVEH']);
  assert.deepEqual(codes(addTag({ code: 'penalty_shot', v: 1, team: 'home', outcome: 'miss' })), ['Penalty BAL', 'Penalty gehalten TVEH']);
  assert.deepEqual(codes(addTag({ code: 'penalty_shot', v: 1, team: 'home', outcome: 'goal' })), ['Penalty BAL']);
  assert.deepEqual(codes(addTag({ code: 'faceoff', v: 1, outcome: 'home' })), ['Bully BAL', 'Bully verloren TVEH']);
  assert.deepEqual(codes(addTag({ code: 'faceoff', v: 1, outcome: 'draw' })), ['Bully']);
});

test('Gegenperspektive tauscht Spieler und Gegenspieler', () => {
  setup();
  const t = addTag({ code: 'shot', v: 100, team: 'home', outcome: 'on' });
  setPlayer(t.id, 'home', 38);
  const [, save] = tagClips(t, names);
  assert.equal(label(save, 'Spieler'), undefined);
  assert.match(label(save, 'Gegenspieler'), /^#38 /);
});

test('Bully: beide Spieler, Ort und Vorteil im Export', () => {
  setup();
  const t = addTag({ code: 'faceoff', v: 100, outcome: 'home', place: 'center' });
  setPlayer(t.id, 'home', 38);
  setPlayer(t.id, 'guest', 17);
  const [c] = tagClips(t, names);
  assert.equal(label(c, 'Ort'), 'Mittellinie');
  assert.equal(label(c, 'Vorteil'), 'TVEH');
  assert.equal(label(c, 'Mit Vorteil gewonnen'), 'nein');
  assert.match(label(c, 'Spieler BAL'), /^#38 /);
  assert.match(label(c, 'Spieler TVEH'), /^#17 /);
  updateTag(t.id, { place: 'half_home' });
  assert.equal(label(tagClips(t, names)[0], 'Mit Vorteil gewonnen'), 'ja');
});

test('Konter: Clip ab Konterbeginn mit eingestellter Dauer', () => {
  const s = setup();
  const t = addTag({ code: 'counter', v: 500, team: 'home' });
  assert.deepEqual(tagClips(t, names).map(c => [c.start, c.end]), [[500, 510], [500, 510]]);
  s.counterLen = 15;
  assert.equal(tagClips(t, names)[0].end, 515);
});

test('Phase: Clip von Start bis Ende, offene Phase fehlt im Export', () => {
  setup();
  const t = addTag({ code: 'empty_net', v: 5000, team: 'guest' });
  assert.deepEqual(tagClips(t, names), []);
  updateTag(t.id, { end: 5045 });
  const [c] = tagClips(t, names);
  assert.deepEqual([c.code, c.start, c.end], ['Torhüter raus TVEH', 5000, 5045]);
});

test('Kommentar und Penaltyschießen landen als Label im Export', () => {
  setup();
  const t = addTag({ code: 'special', v: 100 });
  updateTag(t.id, { comment: 'Schiedsrichter verletzt' });
  assert.equal(label(tagClips(t, names)[0], 'Kommentar'), 'Schiedsrichter verletzt');
  assert.equal(tagClips(t, names)[0].code, 'Besonderes Ereignis');
  const p = addTag({ code: 'penalty_shot', v: 200, team: 'home', outcome: 'goal', shootout: true });
  assert.equal(label(tagClips(p, names)[0], 'Penaltyschießen'), 'ja');
});

test('Tags fließen in buildClips, XML und Schnittliste ein', () => {
  synced();
  addTag({ code: 'penalty_shot', v: 1000, team: 'home', outcome: 'miss', shootout: true });
  addTag({ code: 'penalty_shot', v: 1030, team: 'guest', outcome: 'goal', shootout: true });
  addTag({ code: 'shot', v: 1100, team: 'home', outcome: 'on' });
  const clips = buildClips();
  assert.equal(clips.filter(c => c.kind === 'tag').length, 3);
  assert.equal(clips.filter(c => c.kind === 'tag-derived').length, 2); // Penalty gehalten, Save
  assert.ok(toSportscodeXml(clips).includes('<code>Penalty gehalten TVEH</code>'));
  assert.equal(toEdl(clips, { scope: 'penaltyShots' }).count, 2);
  assert.equal(toEdl(clips, { scope: 'shots' }).count, 1);
  assert.equal(toEdl(clips, { scope: 'tags' }).count, 3); // ohne die abgeleiteten Doppelungen
});

// ===== Tag-Datei =====
test('Tag-Datei: Speichern und Laden ergibt denselben Stand', () => {
  const s = setup();
  const t = addTag({ code: 'faceoff', v: 100, outcome: 'guest', place: 'center' });
  setPlayer(t.id, 'guest', 17);
  addTag({ code: 'special', v: 50 });
  const before = structuredClone(s.tags);
  const file = JSON.parse(JSON.stringify(buildTagFile()));
  assert.equal(file.format, 'floortag-tags');
  assert.equal(file.standard, 1);
  setup();
  assert.deepEqual(applyTagFile(file), { loaded: 2, skipped: 0 });
  assert.deepEqual(s.tags, before);
});

test('Tag-Datei: unbekannte Codes werden übersprungen, falsches Spiel abgelehnt', () => {
  setup();
  const r = applyTagFile({ format: 'floortag-tags', version: 1, game_id: 58668, tags: [{ code: 'shot', v: 1, team: 'home' }, { code: 'gibtsnicht', v: 2 }] });
  assert.deepEqual(r, { loaded: 1, skipped: 1 });
  assert.throws(() => applyTagFile({ format: 'floortag-tags', version: 1, game_id: 1, tags: [] }), /gehört zu Spiel 1/);
  assert.throws(() => applyTagFile({ format: 'floortag-sync' }), /keine FloorTag-Tag-Datei/);
});

test('codeOf liefert Definitionen, unbekannte Codes werfen beim Anlegen', () => {
  assert.equal(codeOf('shot').label, 'Torschuss');
  setup();
  assert.throws(() => addTag({ code: 'gibtsnicht', v: 1 }), /Unbekannter Code/);
});
