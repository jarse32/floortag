// ===== Beamer-Fenster beim Präsentieren auf zweitem Bildschirm =====
// Zeigt nur Video und Bühne (Einblendung, Ankündigung …). Gesteuert wird von der Szenen-Seite im Hauptfenster
// (remoteplayer.js), die Verbindung läuft über BroadcastChannel. Tasten in diesem Fenster gehen dorthin weiter.
// Vor dem ersten Klick („Präsentation starten“) läuft nichts: Vollbild und Ton brauchen eine Geste in diesem Fenster.
import * as yt from './player.js';
import { mountStage } from './stageview.js';
import { channelName } from './remoteplayer.js';

const $ = s => document.querySelector(s);
const id = location.hash.slice(1);
const stage = $('#stage');
const render = mountStage(stage);

if (!/^[a-z0-9]{4,32}$/.test(id) || typeof BroadcastChannel === 'undefined') {
  $('#beamerStart').hidden = true;
  $('#beamerLost').hidden = false;
} else {
  const ch = new BroadcastChannel(channelName(id));
  const send = m => ch.postMessage(m);
  let started = false, deferred = null;

  const status = (changed = false) => send({
    type: 'status', changed, started,
    ready: yt.isReady(), playing: yt.isPlaying(), raw: yt.rawNow(), now: yt.now(), rate: yt.getRate()
  });
  // Befehle, die abspielen: vor dem Startklick nur merken (sonst blockiert der Browser den Ton)
  const PLAYS = new Set(['playAt', 'play', 'togglePlay']);
  const CMDS = {
    loadVideo: v => yt.loadVideo(v),
    playAt: (v, t) => yt.playAt(v, t),
    seek: t => yt.seek(t),
    play: () => yt.play(),
    pause: () => yt.pause(),
    togglePlay: () => yt.togglePlay(),
    setRate: r => yt.setRate(r)
  };
  function run(m) {
    if (PLAYS.has(m.fn) && (!started || !yt.isReady())) { deferred = m; return; }
    if (CMDS[m.fn]) CMDS[m.fn](...(m.args || []));
  }

  yt.initPlayer('player', {
    onLoad() {},
    onReady() { status(true); if (deferred && started) { const d = deferred; deferred = null; run(d); } },
    onStateChange() { status(true); },
    onError: msg => send({ type: 'error', msg })
  });

  ch.onmessage = e => {
    const m = e.data || {};
    if (m.type === 'cmd') run(m);
    else if (m.type === 'model') render(m.model);
    else if (m.type === 'close') window.close();
  };

  function start() {
    if (started) return;
    started = true;
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) Promise.resolve(req.call(el)).catch(() => {});
    $('#beamerStart').hidden = true;
    status(true);
    if (deferred && yt.isReady()) { const d = deferred; deferred = null; run(d); }
  }
  $('#startBtn').addEventListener('click', start);
  // Klick aufs Video: Pause / weiter wie im Hauptfenster
  $('#prShield').addEventListener('click', () => send({ type: 'key', key: ' ' }));
  // Wer in dieses Fenster geklickt hat, bedient weiter mit Tasten bzw. Fernbedienung
  document.addEventListener('keydown', e => {
    if (!started) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); } return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ([' ', 'PageDown', 'PageUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    send({ type: 'key', key: e.key });
  });
  window.addEventListener('pagehide', () => send({ type: 'bye' }));
  setInterval(() => status(), 200);
  send({ type: 'hello' });
}
