// Tests für die Einblendung unten links (Präsentieren)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectScenes } from '../web/js/scenes.js';
import { overlayText, shortDate } from '../web/js/overlay.js';
import { setup } from './helpers.js';

function synced(overrides) {
  const s = setup(undefined, overrides);
  s.periods[1] = { start: 1000, end: 2600 };
  s.periods[2] = { start: 3200, end: 4800 };
  s.periods[3] = { start: 5400, end: 7000 };
  return s;
}
// Szene so, wie sie die Seite „Szenen“ zusammenstellt (TVEH ist Gast)
const asScene = c => ({ ...c, date: '2026-10-12', opp: 'Baltic Storms', home: false });
const goals = () => collectScenes('guest').filter(c => c.kind === 'goal').map(asScene);

test('Datum kurz mit Wochentag', () => {
  assert.equal(shortDate('2026-10-12'), 'Mo. 12.10.26');
  assert.equal(shortDate(''), '');
  assert.equal(shortDate('kaputt'), '');
});

test('Titel: Heim – Gast · Datum, auch aus Sicht des Gastteams', () => {
  synced();
  const [g] = goals();
  assert.equal(overlayText(g, 'TV Eiche Horn Bremen').title, 'Baltic Storms – TV Eiche Horn Bremen · Mo. 12.10.26');
  assert.equal(overlayText({ ...g, home: true }, 'TV Eiche Horn Bremen').title, 'TV Eiche Horn Bremen – Baltic Storms · Mo. 12.10.26');
});

test('Zeile: Code, Abschnitt mit Spielzeit, Stand; Spieler nur auf Wunsch', () => {
  synced();
  const g = goals().find(c => Object.fromEntries(c.labels).Spielzeit === '15:37');
  const { line } = overlayText(g, 'TVEH');
  assert.match(line, /^Tor \S+ · 1\. Drittel 15:37 · 2:1/);
  assert.doesNotMatch(line, /#/);
  assert.match(overlayText(g, 'TVEH', { players: true }).line, /#6 · Vorlage #7/);
});

test('Jugendspieler nur mit Rückennummer, auch mit Spielern in der Einblendung', () => {
  synced({ hideYouth: true });
  const g = goals().find(c => Object.fromEntries(c.labels).Spielzeit === '15:37');
  const { line } = overlayText(g, 'TVEH', { players: true });
  assert.match(line, /#6 ·/);
  assert.doesNotMatch(line, /Mohme/);
});

test('Phasen mit Stärke, Tags mit Ergebnis und gekürztem Kommentar', () => {
  synced();
  const pp = collectScenes('guest').find(c => c.kind === 'powerplay');
  assert.match(overlayText(asScene(pp), 'TVEH').line, /^Überzahl \S+ · .+ · 5 gegen 4$/);
  const tag = { code: 'Besonderes Ereignis', labels: [['Abschnitt', '2. Drittel'], ['Kommentar', 'x'.repeat(120)]] };
  const { title, line } = overlayText(tag, 'TVEH');
  assert.equal(title, 'TVEH');
  assert.ok(line.endsWith('…'));
  assert.ok(line.length < 120);
});
