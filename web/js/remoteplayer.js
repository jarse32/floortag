// ===== Player im Beamer-Fenster fernsteuern =====
// Gleiche Schnittstelle wie player.js (isReady, playAt, now …), damit die Szenen-Seite nicht unterscheiden muss,
// wo das Video läuft. Verbindung über BroadcastChannel im Browser, ohne Server.
// Das Beamer-Fenster (beamer.js) meldet sich mit „hello“, schickt laufend seinen Zustand und führt Befehle aus.

export const channelName = id => `floortag-beamer-${id}`;

// on: { onHello, onStarted, onKey(key), onBye } für Ereignisse aus dem Beamer-Fenster
export function createRemote(id, on = {}) {
  const ch = new BroadcastChannel(channelName(id));
  let H = {}; // Callbacks wie bei player.initPlayer
  let st = { ready: false, playing: false, raw: 0, now: 0, rate: 1, started: false, at: 0 };
  let connected = false, queue = [], lastModel = null, closed = false;
  // Nach einem Sprung kommt evtl. noch ein Zustand mit der alten Zeit an; bis dahin gilt das Sprungziel
  let seek = null;
  const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const post = m => { if (closed) return; if (connected) ch.postMessage(m); else queue.push(m); };
  const cmd = (fn, ...args) => post({ type: 'cmd', fn, args });

  ch.onmessage = e => {
    const m = e.data || {};
    if (m.type === 'hello') {
      connected = true;
      for (const x of queue) ch.postMessage(x);
      queue = [];
      if (lastModel) ch.postMessage({ type: 'model', model: lastModel });
      on.onHello && on.onHello();
    } else if (m.type === 'status') {
      const was = st;
      let now = m.now;
      if (seek && clock() < seek.until && Math.abs(now - seek.t) > 1.5) now = seek.t;
      st = { ready: !!m.ready, playing: !!m.playing, raw: m.raw || 0, now, rate: m.rate || 1, started: !!m.started, at: clock() };
      if (!was.ready && st.ready) H.onReady && H.onReady();
      if (!was.started && st.started) on.onStarted && on.onStarted();
      if (m.changed || was.playing !== st.playing) H.onStateChange && H.onStateChange();
    } else if (m.type === 'error') H.onError && H.onError(m.msg);
    else if (m.type === 'key') on.onKey && on.onKey(m.key);
    else if (m.type === 'bye') on.onBye && on.onBye();
  };

  // Zeit seit dem letzten Zustand weiterrechnen, solange das Video läuft
  const ahead = () => (st.playing ? ((clock() - st.at) / 1000) * st.rate : 0);
  const jump = t => { seek = { t: Math.max(0, t), until: clock() + 1000 }; st = { ...st, now: seek.t, at: clock() }; };

  return {
    initPlayer(_, handlers) { H = handlers || {}; },
    connected: () => connected,
    started: () => st.started,
    isReady: () => st.ready,
    isPlaying: () => st.playing,
    now: () => st.now + ahead(),
    rawNow: () => st.raw + ahead(),
    getRate: () => st.rate,
    loadVideo(video) { H.onLoad && H.onLoad(); cmd('loadVideo', video); },
    playAt(video, t) { jump(t); cmd('playAt', video, t); },
    seek(t) { jump(t); cmd('seek', t); },
    play() { cmd('play'); },
    // Sofort als angehalten werten, damit die Szenen-Seite nicht mehrfach anhält
    pause() { st = { ...st, now: st.now + ahead(), playing: false, at: clock() }; cmd('pause'); },
    togglePlay() { cmd('togglePlay'); },
    setRate(r) { cmd('setRate', r); },
    render(model) { lastModel = model; if (connected && !closed) ch.postMessage({ type: 'model', model }); },
    close() {
      if (closed) return;
      if (connected) ch.postMessage({ type: 'close' });
      closed = true;
      ch.close();
    }
  };
}
