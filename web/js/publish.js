// ===== Veröffentlichte Syncs (gemeinsamer Sync pro Video) =====
// Server: api/sync.php. Veröffentlicht wird nur die Sync-Ebene, Tags bleiben im Browser.
// state.syncSource = { version, edited } merkt sich, auf welcher veröffentlichten Version der eigene Stand beruht
// und ob er seitdem verändert wurde. Der Bearbeitungsschlüssel liegt pro Video im Browser.
import { state } from './state.js';
import { buildSyncFile, applySyncFile, save } from './storage.js';
import { findEvent, describe, periodTitle } from './game.js';
import { fmt } from './format.js';

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

export const fetchProposals = video => request(`api/sync.php?video=${encodeURIComponent(video)}&proposals=1`);

// Eigenen Sync veröffentlichen bzw. als neue Version aktualisieren.
// Ohne Schlüssel bei bestehendem Sync entscheidet der Server: Ergänzungen werden sofort neue Version,
// Änderungen an schon Gesetztem ein Vorschlag (res.added, res.changes, res.proposal).
export async function publishSync() {
  const token = getToken(state.videoId);
  const res = await request('api/sync.php', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game_id: state.game.id, video_id: state.videoId, sync: buildSyncFile(), ...(token ? { token } : {}) })
  });
  if (!res) throw new Error('Veröffentlichen fehlgeschlagen.');
  if (res.token) setToken(state.videoId, res.token);
  // Offene Änderungen bleiben eigene Änderungen, bis jemand mit Schlüssel sie übernimmt
  state.syncSource = { version: res.version, edited: !!res.changes };
  save();
  return res;
}

// Vorschlag übernehmen oder verwerfen (nur mit Schlüssel)
export async function decideProposal(id, action) {
  const res = await request('api/sync.php', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, video_id: state.videoId, proposal_id: id, token: getToken(state.videoId) })
  });
  if (!res) throw new Error('Diesen Vorschlag gibt es nicht mehr.');
  return res;
}

// Rückmeldung nach dem Beitragen ohne Schlüssel
export function contributionText(res) {
  if (res.unchanged) return 'Dein Stand entspricht dem veröffentlichten Sync, es gibt nichts beizutragen.';
  const parts = [];
  if (res.added) parts.push(`${res.added} ${res.added === 1 ? 'Ergänzung' : 'Ergänzungen'} als Version ${res.version} veröffentlicht`);
  if (res.proposal) parts.push(`${res.changes} ${res.changes === 1 ? 'Änderung' : 'Änderungen'} an schon Gesetztem als Vorschlag abgelegt; darüber entscheidet, wer den Bearbeitungsschlüssel hat`);
  else if (res.proposals_full) parts.push('deine Änderungen an schon Gesetztem konnten nicht abgelegt werden, weil schon zu viele Vorschläge offen sind');
  return `${parts.join(', ')}.`.replace(/^./, c => c.toUpperCase());
}

// ===== Vorschläge lesbar machen =====
// Schlüssel wie im Server: p1.start, e<id>, m<id>, pp<id>, f<id>, a<Abschnitt>:<Zeit>, s.<Feld>
const SETTING_NAMES = { period_length_sec: 'Drittellänge', overtime_length_sec: 'Verlängerung', pause_length_sec: 'Drittelpause', pp_delay_sec: 'Abstand Strafe bis Überzahl' };
function eventName(id) {
  const e = findEvent(id);
  if (!e) return `Ereignis ${id}`;
  const d = describe(e);
  return `${d.score ? `${d.score} ` : ''}${d.text} (${periodTitle(Math.floor(e.period), true)} ${e.time})`;
}
export function describeChange({ key, old, new: now }) {
  let m;
  const video = v => fmt(v);
  const change = (what, f = video) => old == null ? `${what}: neu bei ${f(now)}` : now == null ? `${what}: entfernt (war ${f(old)})` : `${what}: ${f(old)} → ${f(now)}`;
  if ((m = key.match(/^p(\d)\.(start|end)$/))) return change(`${periodTitle(Number(m[1]))} ${m[2] === 'start' ? 'Anpfiff' : 'Ende'}`);
  if ((m = key.match(/^e(\d+)$/))) return change(eventName(Number(m[1])));
  if ((m = key.match(/^m(\d+)$/))) return `${eventName(Number(m[1]))}: ${now == null ? '„nicht im Video“ aufgehoben' : 'als „nicht im Video“ markiert'}`;
  if ((m = key.match(/^pp(\d+)$/))) return change(`Beginn Überzahl nach ${eventName(Number(m[1]))}`);
  if ((m = key.match(/^f(\d+)$/))) return change(`Spielzeit von ${eventName(Number(m[1]))}`, t => t);
  if ((m = key.match(/^a(\d):(.+)$/))) return change(`Freier Anker ${periodTitle(Number(m[1]), true)} ${m[2]}`);
  if ((m = key.match(/^s\.(.+)$/))) return change(SETTING_NAMES[m[1]] || m[1], v => (m[1] === 'pp_delay_sec' ? `${v} s` : `${v / 60} Min.`));
  return key;
}
