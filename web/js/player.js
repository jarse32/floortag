// ===== YouTube-Player =====
// Kapselt die IFrame Player API; die Oberfläche hängt sich über Callbacks an.
// Geladen wird erst nach Zustimmung (Zwei-Klick-Lösung, siehe consent.js und showVideo in main.js).

let player = null, playerReady = false, apiReady = false, pendingVideo = null;
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
  if (player && playerReady) { player.cueVideoById(id); return; }
  player = new YT.Player(mountId, {
    videoId: id,
    host: 'https://www.youtube-nocookie.com',
    playerVars: { rel: 0, playsinline: 1 },
    events: {
      onReady: () => { playerReady = true; handlers.onReady(); },
      onStateChange: () => handlers.onStateChange(),
      onPlaybackRateChange: () => handlers.onRateChange && handlers.onRateChange(),
      onError: ev => handlers.onError(ERRORS[ev.data] || `YouTube meldet Fehler ${ev.data}.`)
    }
  });
}

export function isReady() { return playerReady; }
export function now() { return playerReady ? player.getCurrentTime() : 0; }
export function duration() { return playerReady ? player.getDuration() : 0; }
export function seek(t) { if (playerReady) player.seekTo(Math.max(0, t), true); }
export function play() { if (playerReady) player.playVideo(); }
export function pause() { if (playerReady) player.pauseVideo(); }
// Abspieltempo; YouTube bietet je nach Video nicht jedes Tempo an
export function setRate(r) { if (playerReady) player.setPlaybackRate(r); }
export function getRate() { return playerReady ? player.getPlaybackRate() : 1; }
export function availableRates() { return playerReady ? player.getAvailablePlaybackRates() : []; }
export function togglePlay() { if (!playerReady) return; player.getPlayerState() === 1 ? player.pauseVideo() : player.playVideo(); }
