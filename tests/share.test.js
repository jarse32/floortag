// Tests für den Teilen-Link (Modus Ansehen)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSharePayload, applySharePayload, encodeShare, decodeShare, shareUrl, SHARE_PREFIX } from '../web/js/share.js';
import { addTag, setPlayer, updateTag } from '../web/js/tags.js';
import { toggleLineupPlayer } from '../web/js/lineups.js';
import { place } from '../web/js/sync.js';
import { setup, ev } from './helpers.js';

// Ein typischer Arbeitsstand: Sync, Anker, Tags aller Art, Haken, Aufstellung
function workState() {
  const s = setup(undefined, { periodLen: 1200, kleinfeld: false, hideYouth: false });
  s.videoId = 'lfIFpRsE55I';
  s.periods = { 1: { start: 300, end: 1920 }, 2: { start: 2520, end: 4140 } };
  place(ev(1), 900);
  s.anchors = { 2: [{ g: 600, v: 3200 }] };
  s.missing = { 6: true };
  const shot = addTag({ code: 'shot', v: 950.04, team: 'guest', outcome: 'on' });
  setPlayer(shot.id, 'guest', 17);
  const fo = addTag({ code: 'faceoff', v: 310, outcome: 'home', place: 'center' });
  setPlayer(fo.id, 'home', 38); setPlayer(fo.id, 'guest', 17);
  updateTag(addTag({ code: 'special', v: 1000 }).id, { comment: 'Taktik: Pressing ab hier' });
  updateTag(addTag({ code: 'empty_net', v: 1880, team: 'guest' }).id, { end: 1915 });
  addTag({ code: 'penalty_shot', v: 7000, team: 'home', outcome: 'goal', shootout: true });
  s.complete = { 1: { home: true, guest: true } };
  toggleLineupPlayer(1, 'home', 14); toggleLineupPlayer(1, 'guest', 7);
  return s;
}
const snapshot = s => JSON.parse(JSON.stringify({
  periods: s.periods, placed: s.placed, anchors: s.anchors, missing: s.missing, periodLen: s.periodLen,
  tags: s.tags.map(({ id, ...t }) => t), complete: s.complete, lineups: s.lineups
}));

test('Hin und zurück: der geteilte Stand ist derselbe wie der eigene', async () => {
  const s = workState();
  const before = snapshot(s);
  const text = await encodeShare(buildSharePayload());
  assert.ok(text.startsWith('z1.'));
  assert.match(text, /^[\w.-]+$/, 'nur URL-sichere Zeichen');
  setup(); // anderer, leerer Stand
  applySharePayload(await decodeShare(text));
  const after = snapshot(s);
  // gerundete Videozeit 950.04 → 950
  before.tags.find(t => t.code === 'shot').v = 950;
  assert.deepEqual(after, before);
});

test('Geteilte Ansicht zeigt Jugendspieler immer nur mit Rückennummer', async () => {
  const s = workState();
  assert.equal(s.hideYouth, false);
  const p = await decodeShare(await encodeShare(buildSharePayload()));
  applySharePayload(p);
  assert.equal(s.hideYouth, true);
});

test('Im Link stehen keine Namen', async () => {
  workState();
  const json = JSON.stringify(buildSharePayload());
  assert.ok(!json.includes('Jablonski') && !json.includes('Komarov'));
});

test('Link gehört zu einem anderen Spiel oder einer anderen Version', () => {
  setup();
  assert.throws(() => applySharePayload({ v: 1, g: 1 }), /gehört zu Spiel 1/);
  assert.throws(() => applySharePayload({ v: 2, g: 58668 }), /anderen FloorTag-Version/);
});

test('Beschädigte Links werden erkannt, unkomprimierte (j1) gelesen', async () => {
  await assert.rejects(() => decodeShare('xx.abc'), /unvollständig oder beschädigt/);
  const raw = 'j1.' + Buffer.from(JSON.stringify({ v: 1, g: 58668 })).toString('base64url');
  assert.deepEqual(await decodeShare(raw), { v: 1, g: 58668 });
});

test('Fertiger Link: ?spiel= und #ft=, alte Parameter und Anker entfallen', async () => {
  workState();
  const url = await shareUrl('https://tag.floorballdashboard.app/?spiel=1&modus=analyse#alt');
  assert.ok(url.startsWith(`https://tag.floorballdashboard.app/?spiel=58668${SHARE_PREFIX}z1.`));
});

test('Linklänge bei einem voll getaggten Spiel bleibt handlich', async () => {
  const s = workState();
  for (let i = 0; i < 400; i++) {
    const codes = ['shot', 'turnover', 'faceoff', 'free_hit', 'counter'];
    const t = addTag({ code: codes[i % 5], v: 400 + i * 14.3, team: i % 2 ? 'home' : 'guest', outcome: ['on', null, 'home', null, null][i % 5], place: i % 5 === 3 ? 'corner' : null });
    if (i % 3 === 0) setPlayer(t.id, t.team || 'home', 10 + (i % 20));
  }
  const url = await shareUrl('https://tag.floorballdashboard.app/');
  assert.equal(s.tags.length, 405);
  assert.ok(url.length < 20000, `Link ist ${url.length} Zeichen lang`);
});
