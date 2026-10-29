// ===== Szenen eines Teams über mehrere Spiele =====
// Grundlage sind nur gesyncte Szenen: eigener Stand in diesem Browser (mit Tags) oder ein veröffentlichter Sync.
// Pro Spiel wird der Stand in den globalen Zustand geladen und mit buildClips ausgewertet, ein Spiel nach dem anderen.
import { state } from './state.js';
import { prepareGame, findEvent, personLabel } from './game.js';
import { restore, applySyncFile } from './storage.js';
import { buildClips } from './export.js';
import { goalSituations } from './stats.js';
import { applyLeagueLengths, leagueLengths } from './leagueinfo.js';

// Feste Kategorien aus Saisonmanager-Daten und „Torhüter raus“, jeweils aus Sicht des gewählten Teams
export const SCENE_GROUPS = [
  { title: 'Tore', cats: [['goal', 'Tore'], ['goal_against', 'Gegentore']] },
  { title: 'Überzahl', cats: [['pp', 'Überzahlspiel'], ['pp_goal', 'Überzahltore'], ['pp_goal_against', 'Gegentore in Überzahl']] },
  { title: 'Unterzahl', cats: [['sh', 'Unterzahlspiel'], ['sh_goal', 'Unterzahltore'], ['sh_goal_against', 'Gegentore in Unterzahl']] },
  { title: 'Ohne Torhüter', cats: [['ea', 'Eigener Torhüter raus'], ['ea_goal', 'Tore mit 6. Feldspieler'], ['en_goal_against', 'Gegentore ins leere Tor'],
    ['ea_against', 'Gegner ohne Torhüter'], ['ea_goal_against', 'Gegentore gegen 6 Feldspieler'], ['en_goal', 'Tore ins leere Tor']] },
  { title: 'Penaltys', cats: [['ps_goal', 'Penaltytore'], ['ps_goal_against', 'Penalty-Gegentore']] },
  { title: 'Strafen und Auszeiten', cats: [['penalty', 'Strafen'], ['penalty_against', 'Strafen Gegner'], ['timeout', 'Auszeiten']] }
];
export const CAT_LABELS = Object.fromEntries(SCENE_GROUPS.flatMap(g => g.cats));
// Kategorien aus eigenen Tags heißen tag:<Bezeichnung>, z. B. tag:Torschuss oder tag:Save
export const catLabel = key => CAT_LABELS[key] || key.replace(/^tag:/, '');

// Kategorien eines Clips aus Sicht von side ('home' | 'guest'); sit = Spielsituation bei Toren
export function classify(clip, side, sit = null) {
  const own = clip.side === side, cats = [];
  if (clip.kind === 'goal') {
    cats.push(own ? 'goal' : 'goal_against');
    if (sit) {
      // Situation gilt aus Sicht des Schützen
      if (sit.powerPlay) cats.push(own ? 'pp_goal' : 'sh_goal_against');
      if (sit.shortHanded) cats.push(own ? 'sh_goal' : 'pp_goal_against');
      if (sit.extraAttacker) cats.push(own ? 'ea_goal' : 'ea_goal_against');
      if (sit.emptyNet) cats.push(own ? 'en_goal' : 'en_goal_against');
      if (sit.penaltyGoal) cats.push(own ? 'ps_goal' : 'ps_goal_against');
    }
  } else if (clip.kind === 'penalty') cats.push(own ? 'penalty' : 'penalty_against');
  else if (clip.kind === 'timeout') { if (own) cats.push('timeout'); }
  else if (clip.kind === 'powerplay') { if (own) cats.push('pp'); }
  else if (clip.kind === 'boxplay') { if (own) cats.push('sh'); }
  else if (clip.tagKey === 'empty_net') { if (clip.kind === 'tag' && clip.side) cats.push(own ? 'ea' : 'ea_against'); }
  else if ((clip.kind === 'tag' || clip.kind === 'tag-derived') && own) cats.push(`tag:${clip.label}`);
  return cats;
}

// Beteiligte Spieler des Teams an einer Szene: Torschütze, Vorlage, bestrafter Spieler.
// Kennung ist die Rückennummer im Team (über die Saison praktisch gleich, kein Name in der Adresse).
export const PERSON_ROLES = [['goal', 'Tore'], ['assist', 'Vorlagen'], ['penalty', 'Strafen']];
export function peopleOf(clip, side) {
  if (clip.eventId == null || clip.side !== side) return [];
  const e = findEvent(clip.eventId);
  if (!e) return [];
  const person = (nr, role) => ({ nr: Number(nr), label: personLabel(side, Number(nr)), role });
  if (e.event_type === 'goal') return [e.number && person(e.number, 'goal'), e.assist && person(e.assist, 'assist')].filter(Boolean);
  if (e.event_type === 'penalty' && e.number) return [person(e.number, 'penalty')];
  return [];
}

// Szenen des geladenen Spiels für ein Team
export function collectScenes(side) {
  const sits = goalSituations();
  return buildClips()
    .filter(c => c.kind !== 'period')
    .map(c => ({ ...c, cats: classify(c, side, c.eventId != null ? sits[c.eventId] : null), people: peopleOf(c, side) }))
    .filter(c => c.cats.length);
}

// Spieler über alle Szenen: Rückennummer → { nr, label, goal, assist, penalty }, nach Nummer sortiert.
// Steht dieselbe Nummer im Lauf der Saison für verschiedene Namen, werden sie zusammen genannt.
export function playersOf(scenes) {
  const map = new Map();
  for (const s of scenes) for (const p of s.people || []) {
    const x = map.get(p.nr) || { nr: p.nr, labels: new Set(), goal: 0, assist: 0, penalty: 0 };
    x.labels.add(p.label.replace(/^#\d+\s*/, ''));
    x[p.role]++;
    map.set(p.nr, x);
  }
  return [...map.values()].sort((a, b) => a.nr - b.nr).map(({ labels, ...x }) => {
    const names = [...labels].filter(Boolean);
    return { ...x, label: names.length ? `#${x.nr} ${names.join(' / ')}` : `#${x.nr}` };
  });
}

// Passt eine Szene zur Spielerauswahl? nr = Rückennummer oder null (alle), roles = Set der Rollen
export function matchesPlayer(scene, nr, roles) {
  if (nr == null) return true;
  return (scene.people || []).some(p => p.nr === nr && roles.has(p.role));
}

// Gibt es im geladenen Zustand einen Sync?
export function hasSyncData(s = state) {
  return Object.values(s.periods || {}).some(p => p && p.start != null) || Object.keys(s.placed || {}).length > 0 || Object.keys(s.anchors || {}).length > 0;
}

// Einstellungen, die pro Spiel neu beginnen (sonst erbt ein Spiel die Längen des vorherigen)
const SETTINGS = ['periodLen', 'otLen', 'pauseLen', 'ppDelay', 'leadIn', 'leadOut', 'counterLen', 'kleinfeld', 'hideYouth', 'lengthSource', 'syncSource'];
const DEFAULTS = Object.fromEntries(SETTINGS.map(k => [k, state[k]]));

// Lädt ein Spiel mit eigenem Stand (aus diesem Browser) oder veröffentlichtem Sync; speichert nie etwas
export function loadGameState(data, video, { pub = null, league = null } = {}) {
  prepareGame(data);
  Object.assign(state, DEFAULTS);
  state.videoId = video;
  state.sharedView = true; // Schutz: save() und saveTags() schreiben in diesem Zustand nicht
  if (league) applyLeagueLengths(leagueLengths(league));
  restore();
  const source = hasSyncData() ? 'own' : pub ? 'published' : null;
  if (source === 'published') applySyncFile(pub);
  return source;
}

// Spiel des Teams aus Sicht des Teams: 'home', 'guest' oder null
export function sideOf(game, team) {
  if (game.home === team || game.home_team_name === team) return 'home';
  if (game.guest === team || game.guest_team_name === team) return 'guest';
  return null;
}

// Alle Teams eines Spielplans, alphabetisch
export function teamsOf(games) {
  return [...new Set(games.flatMap(g => [g.home, g.guest]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
}

// Zählt Szenen je Kategorie
export function countByCat(scenes) {
  const n = {};
  for (const s of scenes) for (const c of s.cats) n[c] = (n[c] || 0) + 1;
  return n;
}
