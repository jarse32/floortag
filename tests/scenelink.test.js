import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneUrl, parseScene, stripScene, gameUrl, parseVideoParam } from '../web/js/scenelink.js';
import { ownVideos } from '../web/js/storage.js';

const BASE = 'https://tag.floorballdashboard.app/?spiel=1&modus=analyse#ft=abc';

test('Szenen-Link enthält Spiel, Video, Startzeit, Ereignis und Modus Ansehen', () => {
  const url = new URL(sceneUrl(BASE, { game: 58665, video: 'lfIFpRsE55I', t: 4523.6, event: 1234 }));
  assert.equal(url.searchParams.get('spiel'), '58665');
  assert.equal(url.searchParams.get('video'), 'lfIFpRsE55I');
  assert.equal(url.searchParams.get('t'), '4524');
  assert.equal(url.searchParams.get('e'), '1234');
  assert.equal(url.searchParams.get('modus'), 'ansehen');
  assert.equal(url.hash, '', 'kein geteilter Stand im Szenen-Link');
});

test('Szenen-Link ohne Ereignis (Tag) und nie vor 0', () => {
  const url = new URL(sceneUrl(BASE, { game: 1, video: 'lfIFpRsE55I', t: -3 }));
  assert.equal(url.searchParams.get('t'), '0');
  assert.equal(url.searchParams.has('e'), false);
});

test('Szene lesen: hin und zurück', () => {
  const s = parseScene(new URL(sceneUrl(BASE, { game: 1, video: 'lfIFpRsE55I', t: 90, event: 7 })).search);
  assert.deepEqual(s, { t: 90, video: 'lfIFpRsE55I', event: 7 });
});

test('Ungültige Angaben werden ignoriert', () => {
  assert.equal(parseScene('?spiel=1'), null);
  assert.equal(parseScene('?spiel=1&t=abc'), null);
  assert.deepEqual(parseScene('?t=5&video=<script>&e=x'), { t: 5, video: null, event: null });
});

test('Szenen-Angaben entfernen, Spiel und Modus bleiben', () => {
  const url = new URL(stripScene('https://x.test/?spiel=1&video=lfIFpRsE55I&t=5&e=2&modus=ansehen'));
  assert.equal(url.search, '?spiel=1&modus=ansehen');
});

test('Spiel-Link gibt das Video nur mit gültiger ID mit', () => {
  assert.equal(gameUrl(58959, 'lfIFpRsE55I'), './?spiel=58959&video=lfIFpRsE55I');
  assert.equal(gameUrl(58959, null), './?spiel=58959');
  assert.equal(gameUrl(58959, 'ohne-video'), './?spiel=58959');
});

test('Video aus der Adresse auch ohne Szenenzeit', () => {
  assert.equal(parseVideoParam('?spiel=58959&video=lfIFpRsE55I'), 'lfIFpRsE55I');
  assert.equal(parseScene('?spiel=58959&video=lfIFpRsE55I'), null);
  assert.equal(parseVideoParam('?spiel=58959&video=<script>'), null);
  assert.equal(parseVideoParam('?spiel=58959'), null);
});

// Einfacher Ersatz für localStorage
function fakeStore(entries) {
  const keys = Object.keys(entries);
  return { length: keys.length, key: i => keys[i], getItem: k => entries[k] ?? null };
}

test('Eigene Videos zu einem Spiel: zuletzt bearbeitetes zuerst, ohne „ohne-video“ und andere Spiele', () => {
  const store = fakeStore({
    'floortag:58959:aaaaaaaaaaa': '{}',
    'floortag-meta:58959:aaaaaaaaaaa': JSON.stringify({ updated: '2026-10-01T10:00:00Z' }),
    'floortag-tags:58959:bbbbbbbbbbb': '[]',
    'floortag-meta:58959:bbbbbbbbbbb': JSON.stringify({ updated: '2026-10-20T10:00:00Z' }),
    'floortag:58959:ohne-video': '{}',
    'floortag:58668:ccccccccccc': '{}',
    'floortag:mode': 'sync'
  });
  assert.deepEqual(ownVideos(58959, store), ['bbbbbbbbbbb', 'aaaaaaaaaaa']);
  assert.deepEqual(ownVideos(1, store), []);
});
