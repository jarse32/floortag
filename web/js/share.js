// ===== Teilen-Link für den Modus Ansehen =====
// Sync, Tags, Haken und Aufstellungen werden kompakt, komprimiert und als #ft=… an die Adresse gehängt.
// Der Teil hinter # wird nie an den Server geschickt. Namen stehen nicht im Link, nur Rückennummern;
// sie kommen beim Öffnen wie immer aus dem Saisonmanager. Zwischenlösung bis zum Backend (Etappe 4).
import { state } from './state.js';
import { codeOf } from './tags.js';

export const SHARE_PREFIX = '#ft=';
const SETTINGS = ['periodLen', 'otLen', 'pauseLen', 'leadIn', 'leadOut', 'counterLen', 'kleinfeld'];

// Tags kompakt: nur gefüllte Felder, Kurznamen
function packTag(t) {
  const p = { c: t.code, v: Math.round(t.v * 10) / 10 };
  if (t.team) p.t = t.team === 'home' ? 'h' : 'g';
  if (t.outcome) p.o = t.outcome;
  if (t.place) p.p = t.place;
  if (t.players && t.players.home != null) p.h = t.players.home;
  if (t.players && t.players.guest != null) p.a = t.players.guest;
  if (t.comment) p.m = t.comment;
  if (t.end != null) p.e = Math.round(t.end * 10) / 10;
  if (t.shootout) p.s = 1;
  return p;
}
function unpackTag(p, i) {
  const t = { id: `s${i}`, code: p.c, v: p.v, team: p.t === 'h' ? 'home' : p.t === 'g' ? 'guest' : null,
    outcome: p.o || null, place: p.p || null, players: { home: p.h ?? null, guest: p.a ?? null }, comment: p.m || '' };
  if (codeOf(p.c) && codeOf(p.c).phase) t.end = p.e ?? null;
  if (p.s) t.shootout = true;
  return t;
}

export function buildSharePayload() {
  const settings = {};
  for (const k of SETTINGS) settings[k] = state[k];
  return {
    v: 1, g: state.game.id, vid: state.videoId,
    s: { periods: state.periods, placed: state.placed, anchors: state.anchors, missing: state.missing, gsFix: state.gsFix, ...settings },
    t: state.tags.map(packTag),
    c: state.complete, l: state.lineups
  };
}

// Übernimmt ein Paket in den Zustand. Jugendspieler in der geteilten Ansicht immer nur mit Nummer.
export function applySharePayload(p) {
  if (!p || p.v !== 1) throw new Error('Dieser Link stammt aus einer anderen FloorTag-Version.');
  if (p.g !== state.game.id) throw new Error(`Der Link gehört zu Spiel ${p.g}.`);
  const s = p.s || {};
  state.periods = s.periods || {}; state.placed = s.placed || {}; state.anchors = s.anchors || {}; state.missing = s.missing || {}; state.gsFix = s.gsFix || {};
  for (const k of SETTINGS) if (s[k] !== undefined) state[k] = s[k];
  state.tags = (p.t || []).filter(x => codeOf(x.c)).map(unpackTag).sort((a, b) => a.v - b.v);
  state.complete = p.c || {};
  state.lineups = p.l || {};
  state.hideYouth = true;
}

// ===== Kodierung: JSON → deflate-raw → base64url, Präfix z1. (ohne CompressionStream: j1.) =====
const toB64url = bytes => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = s => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, ch => ch.charCodeAt(0));
};
async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

export async function encodeShare(payload) {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream === 'function') return 'z1.' + toB64url(await pipe(json, new CompressionStream('deflate-raw')));
  return 'j1.' + toB64url(json);
}
export async function decodeShare(text) {
  const [kind, data] = [text.slice(0, 3), text.slice(3)];
  let bytes = fromB64url(data);
  if (kind === 'z1.') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  else if (kind !== 'j1.') throw new Error('Der Link ist unvollständig oder beschädigt.');
  return JSON.parse(new TextDecoder().decode(bytes));
}

// Fertiger Link zur aktuellen Seite
export async function shareUrl(base) {
  const url = new URL(base);
  url.search = `?spiel=${state.game.id}`;
  url.hash = '';
  return `${url}${SHARE_PREFIX}${await encodeShare(buildSharePayload())}`;
}
