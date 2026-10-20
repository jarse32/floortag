// ===== Veröffentlichte Syncs (gemeinsamer Sync pro Video) =====
// Server: api/sync.php. Veröffentlicht wird nur die Sync-Ebene, Tags bleiben im Browser.
// state.syncSource = { version, edited } merkt sich, auf welcher veröffentlichten Version der eigene Stand beruht
// und ob er seitdem verändert wurde. Der Bearbeitungsschlüssel liegt pro Video im Browser.
import { state } from './state.js';
import { buildSyncFile, applySyncFile, save } from './storage.js';

// Was beim Laden eines Spiels mit einem veröffentlichten Sync geschehen soll
//   adopt  – kein eigener Stand: veröffentlichten Sync übernehmen
//   update – eigener Stand beruht auf einer älteren Version und ist unverändert: still aktualisieren
//   offer  – eigener Stand ist verändert oder unabhängig entstanden: Übernehmen anbieten
//   none   – nichts zu tun
export function decideOnLoad({ hasLocal, source, pub }) {
  if (!pub) return 'none';
  if (!hasLocal) return 'adopt';
  const base = source ? source.version || 0 : 0;
  if (source && !source.edited && pub.latest > base) return 'update';
  if (pub.latest > base) return 'offer';
  return 'none';
}

// Veröffentlichten Sync in den eigenen Stand übernehmen
export function adoptPublished(pub, { edited = false } = {}) {
  applySyncFile(pub.sync);
  state.syncSource = { version: edited ? pub.latest : pub.version, edited };
  save();
}

// ===== Bearbeitungsschlüssel =====
const keyFor = video => `floortag-publish:${video}`;
export function getToken(video) {
  try { return (JSON.parse(localStorage.getItem(keyFor(video)) || '{}')).token || null; } catch (e) { return null; }
}
export function setToken(video, token) {
  try { localStorage.setItem(keyFor(video), JSON.stringify({ token })); } catch (e) { /* ohne Speicher nur für diese Sitzung */ }
}
export const tokenValid = t => /^[0-9a-f]{32}$/.test(String(t || '').trim());

// ===== Server =====
async function request(url, options) {
  const res = await fetch(url, options);
  const type = res.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) throw new Error('Der Server antwortet nicht wie erwartet.');
  const data = await res.json();
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data;
}
export const fetchPublished = (video, version) =>
  request(`api/sync.php?video=${encodeURIComponent(video)}${version ? `&v=${version}` : ''}`);
export const fetchVersions = video => request(`api/sync.php?video=${encodeURIComponent(video)}&versions=1`);
export const fetchIndex = () => request('api/sync.php?index=1');

// Eigenen Sync veröffentlichen bzw. als neue Version aktualisieren
export async function publishSync() {
  const token = getToken(state.videoId);
  const res = await request('api/sync.php', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game_id: state.game.id, video_id: state.videoId, sync: buildSyncFile(), ...(token ? { token } : {}) })
  });
  if (!res) throw new Error('Veröffentlichen fehlgeschlagen.');
  if (res.token) setToken(state.videoId, res.token);
  state.syncSource = { version: res.version, edited: false };
  save();
  return res;
}
