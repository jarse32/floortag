// Gemeinsame Helfer für die Logik-Tests
import { readFileSync } from 'node:fs';
import { state, ui } from '../web/js/state.js';
import { prepareGame, events } from '../web/js/game.js';

const FIXTURE = JSON.parse(readFileSync(new URL('../fixtures/spiel_58668.json', import.meta.url), 'utf8'));

// Setzt den Zustand auf Standardwerte und lädt ein Spiel (Standard: Fixture 58668)
export function setup(game = FIXTURE, overrides = {}) {
  Object.assign(state, {
    game: null, videoId: 'test', periodLen: 1200, otLen: 600, pauseLen: 600, leadIn: 8, leadOut: 5, fps: 25, edlScope: 'goal',
    kleinfeld: false, includePenalties: true, hideYouth: true, periods: {}, placed: {}, anchors: {}, missing: {}, gs: {}, counterLen: 10, tags: [], complete: {}, lineups: {}
  }, overrides);
  ui.selectedId = null; ui.anchorForm = null;
  prepareGame(structuredClone(game));
  return state;
}

export function ev(id) {
  return events().find(e => e.event_id === id);
}

// Kleines künstliches Spiel für gezielte Fälle
export function miniGame(evts, extra = {}) {
  return {
    id: 1, home_team_short_name: 'HEIM', guest_team_short_name: 'GAST',
    result: { overtime: false }, period_titles: [], players: { home: [], guest: [] },
    events: evts, ...extra
  };
}
