// ===== YouTube-Player =====
// Kapselt die IFrame Player API; die Oberfläche hängt sich über Callbacks an.
// Geladen wird erst nach Zustimmung (Zwei-Klick-Lösung, siehe consent.js und showVideo in main.js).

let player = null, playerReady = false, apiReady = false, pendingVideo = null, currentId = null;
// iPhone/iPad (auch iPadOS, das sich als Mac ausgibt)
const isIOS = typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
// YouTube schaltet bei manchen Videos die automatisch erzeugten Untertitel von selbst ein.
// Sobald das Untertitelmodul geladen ist, wird die Spur einmal pro Video abgewählt
// (unloadModule reicht dafür nicht). Über das CC-Symbol lassen sie sich wieder einschalten.
let captionsHandled = false;
function hideCaptionsOnce() {
  if (captionsHandled || !playerReady || !player.getOptions().includes('captions')) return;
  captionsHandled = true;
  try { player.setOption('captions', 'track', {}); } catch (e) { /* Modul nicht bereit */ }
}
let mountId = 'player';
const handlers = { onReady() {}, onStateChange() {}, onError() {}, onLoad() {} };

const ERRORS = {
  2: 'Die Video-ID ist ungültig.',
  100: 'Das Video wurde nicht gefunden oder ist privat.',
  101: 'Das Video darf nicht eingebettet werden.',
  150: 'Das Video darf nicht eingebettet werden.',
  153: 'YouTube verweigert die Wiedergabe. Öffne die Datei über einen lokalen Server statt per Doppelklick.'
};

export function initPlayer(id, callbacks) {
  mountId = id;
  Object.assign(handlers, callbacks);
}

function loadYouTubeApi() {
  if (window.YT && window.YT.Player) { apiReady = true; return; }
  if (document.getElementById('yt-api')) return;
  const s = document.createElement('script');
  s.id = 'yt-api';
  s.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(s);
}
window.onYouTubeIframeAPIReady = () => {
  apiReady = true;
  if (pendingVideo) createPlayer(pendingVideo);
};

export function loadVideo(id) {
  if (!apiReady) { pendingVideo = id; loadYouTubeApi(); if (!apiReady) return; }
  createPlayer(id);
}
function createPlayer(id) {
  handlers.onLoad();
  captionsHandled = false;
  currentId = id;
  if (player && playerReady) { player.cueVideoById(id); return; }
  player = new YT.Player(mountId, {
    videoId: id,
    host: 'https://www.youtube-nocookie.com',
    playerVars: { rel: 0, playsinline: 1 },
    events: {
      onReady: () => { playerReady = true; handlers.onReady(); },
      onStateChange: () => handlers.onStateChange(),
      onApiChange: hideCaptionsOnce,
      onPlaybackRateChange: () => handlers.onRateChange && handlers.onRateChange(),
      onError: ev => handlers.onError(ERRORS[ev.data] || `YouTube meldet Fehler ${ev.data}.`)
    }
  });
}

export function isReady() { return playerReady; }
// Direkt nach einem Sprung meldet der Player kurz noch die alte Zeit. Bis er aufgeholt hat,
// gilt das Sprungziel, damit schnell wiederholte Sprünge (H, H, H) sich aufaddieren.
let seekTarget = null, seekAt = 0;
export function now() {
  if (!playerReady) return 0;
  const real = player.getCurrentTime();
  if (seekTarget != null && Date.now() - seekAt < 1000 && Math.abs(real - seekTarget) > 1.5) return seekTarget;
  // iOS: vorbereitetes, noch nie gestartetes Video meldet 0 – dann gilt die gesetzte Startzeit
  if (isIOS && seekTarget != null && [-1, 5].includes(player.getPlayerState()) && real < 1) return seekTarget;
  return real;
}
export function duration() { return playerReady ? player.getDuration() : 0; }
export function seek(t) {
  if (!playerReady) return;
  seekTarget = Math.max(0, t); seekAt = Date.now();
  // iOS ignoriert seekTo, solange das Video noch nie lief (nicht gestartet oder nur vorbereitet).
  // Dann stattdessen die Startzeit setzen: Beim Antippen von Play beginnt das Video an der Szene.
  const st = player.getPlayerState();
  if (isIOS && currentId && (st === -1 || st === 5)) {
    player.cueVideoById({ videoId: currentId, startSeconds: seekTarget });
    return;
  }
  player.seekTo(seekTarget, true);
}
export function play() { if (playerReady) player.playVideo(); }
export function pause() { if (playerReady) player.pauseVideo(); }
// Abspieltempo; YouTube bietet je nach Video nicht jedes Tempo an
export function setRate(r) { if (playerReady) player.setPlaybackRate(r); }
export function getRate() { return playerReady ? player.getPlaybackRate() : 1; }
export function availableRates() { return playerReady ? player.getAvailablePlaybackRates() : []; }
export function togglePlay() { if (!playerReady) return; player.getPlayerState() === 1 ? player.pauseVideo() : player.playVideo(); }
