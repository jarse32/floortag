// ===== Eigene Tags: FloorTag-Standard v1 =====
// Grundsatz: Jede Szene wird genau einmal getaggt, aus Sicht des handelnden Teams.
// Die Gegenperspektive (Save, Block, Ballverlust, Freistoßabwehr …) entsteht im Export automatisch.
// Tags hängen an der Videozeit, weil man sie im Video beobachtet; sie folgen also nicht dem Sync.
// Die festen Schlüssel (key) machen Analysen über Teams und Spiele hinweg vergleichbar.
// Beschreibung des Standards: docs/tag-standard.md
import { state } from './state.js';

export const TAG_STANDARD_VERSION = 1;

// {home}/{guest} in Texten werden durch die Kurznamen der Teams ersetzt
export const CATALOG = [
  { key: 'shot', label: 'Torschuss', players: 'team',
    outcomes: [['on', 'aufs Tor'], ['off', 'daneben'], ['blocked', 'geblockt']],
    derived: { on: 'Save', blocked: 'Block' } },
  { key: 'penalty_shot', label: 'Penalty', players: 'team',
    outcomes: [['goal', 'verwandelt'], ['miss', 'nicht verwandelt']],
    derived: { miss: 'Penalty gehalten' } },
  { key: 'faceoff', label: 'Bully', players: 'both', teamFromOutcome: true,
    outcomes: [['home', '{home} gewinnt'], ['guest', '{guest} gewinnt'], ['draw', 'unentschieden']],
    places: [['center', 'Mittellinie'], ['half_home', 'Hälfte {home}'], ['half_guest', 'Hälfte {guest}']],
    derived: { home: 'Bully verloren', guest: 'Bully verloren' } },
  { key: 'free_hit', label: 'Freistoß', players: 'team',
    places: [['corner', 'Ecke'], ['middle', 'Mitte'], ['own_half', 'eigene Hälfte']],
    derivedAll: 'Freistoßabwehr' },
  { key: 'turnover', label: 'Ballgewinn', players: 'team', derivedAll: 'Ballverlust' },
  { key: 'counter', label: 'Konter', players: 'team', duration: 'counterLen', derivedAll: 'Konterabwehr' },
  { key: 'empty_net', label: 'Torhüter raus', phase: true },
  { key: 'special', label: 'Besonderes Ereignis', players: 'team', teamOptional: true, comment: true },
  // Kein eigener Clip: legt fest, wer ab dieser Szene im Tor steht (Torhüterwechsel)
  { key: 'goalie', label: 'Torhüter', players: 'team', goalieOnly: true, noClip: true }
];

export function codeOf(key) { return CATALOG.find(c => c.key === key); }
export const other = team => (team === 'home' ? 'guest' : team === 'guest' ? 'home' : null);

// Texte mit Teamnamen füllen
export function fill(text, names) {
  return String(text).replace('{home}', names.home).replace('{guest}', names.guest);
}
export function outcomeLabel(code, key, names) {
  const o = (code.outcomes || []).find(([k]) => k === key);
  return o ? fill(o[1], names) : '';
}
export function placeLabel(code, key, names) {
  const p = (code.places || []).find(([k]) => k === key);
  return p ? fill(p[1], names) : '';
}

// Bully: Vorteil nach Regelwerk. Mittellinie → Gast setzt zuerst; eigene Hälfte → Team wählt die Seite
export function faceoffAdvantage(tag) {
  if (tag.place === 'center') return 'guest';
  if (tag.place === 'half_home') return 'home';
  if (tag.place === 'half_guest') return 'guest';
  return null;
}

// ===== Torhüter =====
// Torhüter laut Kader (Saisonmanager-Feld goalkeeper)
export function goalkeepers(team) {
  return ((state.game && state.game.players || {})[team] || []).filter(p => p.goalkeeper && p.trikot_number != null);
}
// Wer steht zur Videozeit v im Tor? Letzter Torhüter-Tag davor; ohne Tag der einzige Torhüter im Kader
export function goalieAt(team, v) {
  let nr = null;
  for (const t of state.tags) {
    if (t.code === 'goalie' && t.team === team && t.v <= v && t.players[team] != null) nr = t.players[team];
  }
  if (nr != null) return nr;
  const gks = goalkeepers(team);
  return gks.length === 1 ? gks[0].trikot_number : null;
}

// ===== Bearbeiten =====
let seq = 0;
const round1 = v => Math.max(0, Math.round(v * 10) / 10);
function sortTags() { state.tags.sort((a, b) => a.v - b.v); }
// Team bei Codes, deren Team sich aus dem Ergebnis ergibt (Bully-Gewinner)
function syncTeam(tag) {
  if (codeOf(tag.code).teamFromOutcome) tag.team = tag.outcome === 'home' || tag.outcome === 'guest' ? tag.outcome : null;
}

export function addTag({ code, v, team = null, outcome = null, place = null, shootout = false }) {
  const def = codeOf(code);
  if (!def) throw new Error(`Unbekannter Code: ${code}`);
  const tag = {
    id: `t${Date.now().toString(36)}${(seq++).toString(36)}`, code, v: round1(v),
    team: def.teamOptional ? team : team || 'home', outcome, place,
    players: { home: null, guest: null }, comment: ''
  };
  if (def.phase) tag.end = null;
  if (shootout) tag.shootout = true;
  syncTeam(tag);
  state.tags.push(tag);
  sortTags();
  return tag;
}
export function findTag(id) { return state.tags.find(t => t.id === id); }
export function updateTag(id, changes) {
  const tag = findTag(id);
  if (!tag) return null;
  Object.assign(tag, changes);
  if ('v' in changes) tag.v = round1(tag.v);
  if (tag.end != null) tag.end = round1(Math.max(tag.end, tag.v));
  syncTeam(tag);
  sortTags();
  return tag;
}
export function setPlayer(id, side, nr) {
  const tag = findTag(id);
  if (!tag) return;
  tag.players[side] = tag.players[side] === nr ? null : nr; // zweiter Klick nimmt die Auswahl zurück
}
export function removeTag(id) {
  state.tags = state.tags.filter(t => t.id !== id);
}
// Laufende Phase eines Teams (z. B. Torhüter raus ohne Ende)
export function openPhase(code, team) {
  return state.tags.find(t => t.code === code && t.team === team && t.end == null);
}

// ===== Penaltyschießen =====
const shootoutTags = () => state.tags.filter(t => t.code === 'penalty_shot' && t.shootout);
export function nextShootoutTeam(fallback = 'home') {
  const list = shootoutTags();
  return list.length ? other(list[list.length - 1].team) || fallback : fallback;
}
export function shootoutScore() {
  const list = shootoutTags(), score = { home: 0, guest: 0, attempts: list.length };
  for (const t of list) if (t.outcome === 'goal' && score[t.team] != null) score[t.team]++;
  return score;
}
