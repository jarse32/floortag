// Tests für die Fernsteuerung des Players im Beamer-Fenster (BroadcastChannel, in Node eingebaut)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRemote, channelName } from '../web/js/remoteplayer.js';

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));
// Gegenstelle wie beamer.js: sammelt Befehle, kann Zustand melden
function fakeBeamer(id) {
  const ch = new BroadcastChannel(channelName(id));
  const got = [];
  ch.onmessage = e => got.push(e.data);
  return { got, send: m => ch.postMessage(m), close: () => ch.close() };
}

test('Befehle vor dem „hello“ werden gesammelt und danach in Reihenfolge geschickt, mit dem letzten Modell', async () => {
  const id = 'test1abc', remote = createRemote(id), beamer = fakeBeamer(id);
  remote.loadVideo('vid1');
  remote.playAt('vid1', 100);
  remote.render({ overlay: null, black: true });
  await tick();
  assert.equal(beamer.got.length, 0);
  beamer.send({ type: 'hello' });
  await tick();
  assert.deepEqual(beamer.got.map(m => m.fn || m.type), ['loadVideo', 'playAt', 'model']);
  assert.deepEqual(beamer.got[1].args, ['vid1', 100]);
  assert.equal(beamer.got[2].model.black, true);
  remote.close(); beamer.close();
});

test('Zustand: onReady und onStarted einmal, Zeit läuft weiter, Sprungziel gilt bis zur ersten passenden Meldung', async () => {
  const id = 'test2abc', calls = [];
  const remote = createRemote(id, { onStarted: () => calls.push('started') });
  remote.initPlayer('player', { onReady: () => calls.push('ready'), onStateChange: () => calls.push('state') });
  const beamer = fakeBeamer(id);
  beamer.send({ type: 'hello' });
  beamer.send({ type: 'status', ready: true, started: true, playing: true, raw: 50, now: 50, rate: 1 });
  await tick();
  assert.deepEqual(calls, ['ready', 'started', 'state']);
  assert.ok(remote.isPlaying() && remote.now() >= 50 && remote.now() < 51);
  // Sprung: eine verspätete Meldung mit der alten Zeit ändert die Zeit nicht
  remote.playAt('vid1', 300);
  beamer.send({ type: 'status', ready: true, started: true, playing: true, raw: 50.2, now: 50.2, rate: 1 });
  await tick();
  assert.ok(remote.now() >= 300 && remote.now() < 301);
  assert.ok(remote.rawNow() < 51); // echte Position bleibt, damit die Blende auf das Video wartet
  // Anhalten gilt sofort
  remote.pause();
  assert.equal(remote.isPlaying(), false);
  remote.close(); beamer.close();
});

test('Tasten, Fehler und „bye“ aus dem Beamer-Fenster; nach close kommt nichts mehr an', async () => {
  const id = 'test3abc', seen = [];
  const remote = createRemote(id, { onKey: k => seen.push(`key:${k}`), onBye: () => seen.push('bye') });
  remote.initPlayer('player', { onError: msg => seen.push(`error:${msg}`) });
  const beamer = fakeBeamer(id);
  beamer.send({ type: 'hello' });
  beamer.send({ type: 'key', key: 'PageDown' });
  beamer.send({ type: 'error', msg: 'kaputt' });
  beamer.send({ type: 'bye' });
  await tick();
  assert.deepEqual(seen, ['key:PageDown', 'error:kaputt', 'bye']);
  remote.close();
  await tick();
  assert.equal(beamer.got.at(-1).type, 'close');
  const before = beamer.got.length;
  remote.play();
  await tick();
  assert.equal(beamer.got.length, before);
  beamer.close();
});
