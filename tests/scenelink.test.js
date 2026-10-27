import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneUrl, parseScene, stripScene } from '../web/js/scenelink.js';

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
