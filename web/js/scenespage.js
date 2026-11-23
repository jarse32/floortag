// ===== Seite „Szenen“: Szenen eines Teams über alle Spiele einer Liga =====
// Nur gesyncte Szenen: eigener Stand in diesem Browser (mit Tags) oder veröffentlichter Sync (ohne Tags).
// Es wird nichts gespeichert außer der zuletzt gewählten Liga und dem Team.
import { state } from './state.js';
import { fmt, esc } from './format.js';
import { SCENE_GROUPS, PERSON_ROLES, catLabel, collectScenes, countByCat, loadGameState, sideOf, teamsOf, hasSyncData, playersOf, matchesPlayer } from './scenes.js';
import { fetchIndex, fetchPublished } from './publish.js';
import { ppGaps } from './ppstart.js';
import { sceneUrl, gameUrl, canShareNative } from './scenelink.js';
import { hasConsent, giveConsent } from './consent.js';
import * as yt from './player.js';
import { overlayText } from './overlay.js';
import { mountStage, EMPTY_MODEL } from './stageview.js';
import { createRemote } from './remoteplayer.js';
import { SHARE_PREFIX, decodeShare, applySharePayload } from './share.js';
import { fetchLeagueInfo } from './leagueinfo.js';
import { ownVideos } from './storage.js';

const $ = s => document.querySelector(s);
const PREFS = 'floortag:scenes';
const view = {
  leagues: [], schedule: null, team: null, games: [], scenes: [], run: 0,
  filter: new Set(['goal']), gameFilter: 'all', tab: 'scenes',
  player: null, roles: new Set(['goal', 'assist']), // Spielerauswahl: Kennung (player_id) und Rollen
  current: null, playAll: false, pending: null, rate: 1, ppGap: null,
  loop: false, shuffle: false, rank: new Map(), // Dauerschleife, zufällige Reihenfolge (Zufallszahl pro Szene)
  present: false, stopped: null, black: false, // Präsentieren: aktiv, Szene, an deren Ende angehalten wurde, Bild schwarz
  ytControls: false, switching: null, // YouTube-Bedienung freigegeben; Szenenwechsel, bei dem das Bild schwarz bleibt, bis das Video läuft
  remote: false, // Präsentation im Beamer-Fenster, hier die Referentenansicht
  single: null, // Einzelspiel: { g, data, video, shared, pub, league } statt Liga
  overlayUntil: 0 // bis wann die Einblendung unten links steht (danach blendet sie aus, außer „Einblendung bleibt“)
};
// Vorlieben fürs Präsentieren (nur diese werden gespeichert)
const PRESENT_PREFS = 'floortag:present';
const pres = { stopAfter: true, overlay: true, overlayKeep: false, players: false };
try { Object.assign(pres, JSON.parse(localStorage.getItem(PRESENT_PREFS) || '{}')); } catch (e) { /* ignorieren */ }
function savePresent() { try { localStorage.setItem(PRESENT_PREFS, JSON.stringify(pres)); } catch (e) { /* ignorieren */ } }

async function getJson(url) {
  const res = await fetch(url);
  const type = res.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) throw new Error('Der Proxy antwortet nicht. Lokal muss die Seite über „php -S localhost:8000 -t web“ laufen.');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status} beim Laden.`);
  return data;
}
function showError(msg) { const e = $('#pageError'); e.textContent = msg; e.hidden = !msg; }
let toastTimer = null;
function showToast(text) {
  const t = $('#toast'); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
}
$('#toast').addEventListener('click', () => { $('#toast').hidden = true; });

function savePrefs() {
  // Im Einzelspiel bleiben Liga und Team der Ligaansicht erhalten, nur die Filter werden gemerkt
  const prev = view.single ? readPrefs() : null;
  const league = prev ? prev.league : $('#leagueSelect').value, team = prev ? prev.team : view.team;
  try { localStorage.setItem(PREFS, JSON.stringify({ league, team, filter: [...view.filter] })); } catch (e) { /* ignorieren */ }
}
function readPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch (e) { return {}; }
}
function updateUrl() {
  const url = new URL(location.href);
  url.search = '';
  if (view.single) {
    url.searchParams.set('spiel', view.single.g.id);
    url.searchParams.set('video', view.single.video);
  } else if ($('#leagueSelect').value) url.searchParams.set('liga', $('#leagueSelect').value);
  if (view.team) url.searchParams.set('team', view.team);
  if (view.filter.size) url.searchParams.set('filter', [...view.filter].join(','));
  if (view.player != null) { url.searchParams.set('spieler', view.player); url.searchParams.set('rolle', [...view.roles].join(',')); }
  history.replaceState(null, '', url);
}

// ===== Stände in diesem Browser =====
// Map Spiel-ID → [{ video, synced, tags }]
function scanLocal() {
  const map = new Map();
  for (let i = 0; i < localStorage.length; i++) {
    const m = (localStorage.key(i) || '').match(/^floortag:(\d+):(.+)$/);
    if (!m || m[2] === 'ohne-video') continue;
    let synced = false, tags = 0;
    try { synced = hasSyncData(JSON.parse(localStorage.getItem(m[0]) || '{}')); } catch (e) { /* kaputt */ }
    try {
      const d = JSON.parse(localStorage.getItem(`floortag-tags:${m[1]}:${m[2]}`) || 'null');
      tags = d ? (Array.isArray(d) ? d : d.tags || []).length : 0;
    } catch (e) { /* kaputt */ }
    const id = Number(m[1]);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push({ video: m[2], synced, tags });
  }
  return map;
}
// Ligen, die in eigenen Spielen vorkommen (falls nicht in der Liste von Floorball Deutschland)
function knownLeagues() {
  const map = new Map();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) || '';
    if (!k.startsWith('floortag-meta:')) continue;
    try { const m = JSON.parse(localStorage.getItem(k)); if (m && m.leagueId) map.set(String(m.leagueId), m.league || `Liga ${m.leagueId}`); } catch (e) { /* kaputt */ }
  }
  return map;
}

// ===== Liga und Team =====
async function loadLeagues() {
  try { view.leagues = (await getJson('api/league.php?list=1')).leagues || []; } catch (e) { view.leagues = []; }
  const listed = new Set(view.leagues.map(l => String(l.id)));
  const others = [...knownLeagues()].filter(([id]) => !listed.has(id));
  $('#leagueSelect').innerHTML = '<option value="">Liga wählen …</option>' +
    view.leagues.map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('') +
    (others.length ? `<optgroup label="Ligen deiner Spiele">${others.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('')}</optgroup>` : '');
}
async function loadSchedule(id, team = null) {
  view.schedule = null; view.team = null;
  $('#teamSelect').disabled = true;
  $('#teamSelect').innerHTML = '<option value="">Spielplan wird geladen …</option>';
  showError('');
  try {
    view.schedule = await getJson(`api/league.php?id=${encodeURIComponent(id)}`);
  } catch (e) { showError(e.message); $('#teamSelect').innerHTML = '<option value="">–</option>'; return; }
  const teams = teamsOf(view.schedule.games);
  $('#teamSelect').innerHTML = '<option value="">Team wählen …</option>' + teams.map(t => `<option ${t === team ? 'selected' : ''}>${esc(t)}</option>`).join('');
  $('#teamSelect').disabled = false;
  if (team && teams.includes(team)) loadTeam(team); else updateUrl();
}

// Spiele des Teams sammeln und die Szenen aller gesyncten Spiele laden
async function loadTeam(team) {
  const run = ++view.run;
  if (team !== view.team && view.team != null) view.player = null; // anderes Team, andere Spieler
  view.team = team; view.current = null; view.playAll = false;
  savePrefs(); updateUrl();
  const local = scanLocal();
  const pubByGame = new Map();
  try {
    for (const [video, entry] of Object.entries(await fetchIndex() || {})) {
      const prev = pubByGame.get(entry.game_id);
      if (!prev || entry.periods > prev.periods) pubByGame.set(entry.game_id, { ...entry, video });
    }
  } catch (e) { /* ohne veröffentlichte Syncs */ }
  view.games = view.schedule.games.filter(g => sideOf(g, team)).map(g => {
    const mine = local.get(Number(g.id)) || [];
    const own = mine.find(x => x.synced) || null;
    const pub = pubByGame.get(Number(g.id)) || null;
    return { ...g, side: sideOf(g, team), own, pub, tags: Math.max(0, ...mine.map(x => x.tags)), source: own ? 'own' : pub ? 'published' : null, scenes: 0, error: null };
  }).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  view.scenes = [];
  document.querySelector('.sc-tabs').hidden = false;
  render();

  const todo = view.games.filter(g => g.result && g.source);
  const loaded = [];
  for (const [n, g] of todo.entries()) {
    $('#loadNote').textContent = `Szenen werden geladen … ${n} von ${todo.length} Spielen`;
    try {
      const video = g.own ? g.own.video : g.pub.video;
      const data = await getJson(`api/game.php?id=${encodeURIComponent(g.id)}`);
      const pub = g.own ? null : ((await fetchPublished(video)) || {}).sync || null;
      if (run !== view.run) return; // inzwischen ein anderes Team gewählt
      loaded.push({ g, data, pub, video });
    } catch (e) { g.error = e.message; }
  }
  if (run !== view.run) return;
  // Abstand Strafe → Spielbeginn: wo gesetzt, gilt der eigene; sonst der Durchschnitt aus allen Spielen mit gesetzten Beginnen.
  // Laden und Auswerten jeweils ohne await dazwischen: der Zustand gehört in dieser Zeit diesem Spiel
  const load = x => loadGameState(x.data, x.video, { pub: x.pub, league: view.schedule.league });
  const gaps = loaded.flatMap(x => (load(x) ? ppGaps() : []));
  view.ppGap = gaps.length ? { sec: Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length), count: gaps.length } : null;
  for (const x of loaded) {
    const { g, video } = x;
    try {
      if (!load(x)) continue;
      if (view.ppGap && !ppGaps().length) state.ppDelay = view.ppGap.sec;
      const opp = g.side === 'home' ? g.guest : g.home;
      const list = collectScenes(g.side).map(c => ({ ...c, gameId: g.id, video, date: g.date, opp, home: g.side === 'home', result: g.result }));
      g.scenes = list.length; g.tags = state.tags.length; g.video = video;
      view.scenes.push(...list);
    } catch (e) { g.error = e.message; }
  }
  if (run !== view.run) return;
  const synced = view.games.filter(g => g.result && g.source).length, played = view.games.filter(g => g.result).length;
  const gapNote = view.ppGap ? ` · Über- und Unterzahl ohne gesetzten Beginn starten ${view.ppGap.sec} s nach der Strafe (Durchschnitt aus ${view.ppGap.count} gesetzten)` : '';
  $('#loadNote').textContent = `${synced} von ${played} gespielten Spielen mit Sync${gapNote}`;
  render();
}

// ===== Einzelspiel =====
// ?spiel=58668&video=… zeigt nur dieses Spiel, z. B. aus „Präsentieren“ in der Spielansicht.
// Mit #ft=… (Teilen-Link) gilt der Stand aus dem Link, mit Tags; sonst der eigene Stand, sonst der veröffentlichte Sync.
// Gespeichert wird dabei nichts (loadGameState setzt sharedView).
async function loadSingle(id, video, shared, team) {
  showError('');
  $('#leagueLabel').hidden = true;
  $('#loadNote').textContent = 'Spiel wird geladen …';
  let data;
  try { data = await getJson(`api/game.php?id=${encodeURIComponent(id)}`); }
  catch (e) { showError(e.message); $('#loadNote').textContent = ''; return; }
  const g = { id: data.id, home: data.home_team_name, guest: data.guest_team_name, date: data.date, result: data.result_string || '' };
  video = video || (shared && shared.vid) || ownVideos(id)[0] || null;
  if (!video) { showError('Zu diesem Spiel kenne ich kein Video. Öffne es zuerst in der Spielansicht.'); $('#loadNote').textContent = ''; return; }
  let league = null, pub = null;
  try { league = await fetchLeagueInfo(data.league_id); } catch (e) { /* Standardlängen */ }
  if (!shared) { try { pub = ((await fetchPublished(video)) || {}).sync || null; } catch (e) { /* ohne veröffentlichten Sync */ } }
  view.single = { g, data, video, shared, pub, league };
  const back = `./?spiel=${encodeURIComponent(g.id)}&video=${encodeURIComponent(video)}${shared ? location.hash : ''}`;
  $('#singleGame').hidden = false;
  $('#singleGame').innerHTML = `<strong>${esc(g.home)} <span class="score">${esc(g.result)}</span> ${esc(g.guest)}</strong> · ${esc(date(g.date))}
    · <a href="${esc(back)}">Zurück zum Spiel</a>${data.league_id ? ` · <a data-league-link href="szenen.html?liga=${esc(data.league_id)}">Alle Spiele der Liga</a>` : ''}`;
  $('#teamSelect').innerHTML = [g.home, g.guest].map(t => `<option>${esc(t)}</option>`).join('');
  $('#teamSelect').disabled = false;
  selectSingleTeam([g.home, g.guest].includes(team) ? team : g.home);
}
function selectSingleTeam(team) {
  const { g, data, video, shared, pub, league } = view.single;
  if (team !== view.team && view.team != null) view.player = null; // anderes Team, andere Spieler
  view.team = team; view.current = null; view.playAll = false;
  $('#teamSelect').value = team;
  const side = sideOf(g, team), opp = side === 'home' ? g.guest : g.home;
  let source = null;
  try {
    source = loadGameState(data, video, { pub, league });
    if (shared) { applySharePayload(shared); source = 'shared'; }
  } catch (e) { showError(`Der Stand lässt sich nicht laden: ${e.message}`); }
  view.scenes = source ? collectScenes(side).map(c => ({ ...c, gameId: g.id, video, date: g.date, opp, home: side === 'home', result: g.result })) : [];
  view.games = [{ ...g, side, source, video, scenes: view.scenes.length, tags: source ? state.tags.length : 0 }];
  const from = { shared: 'Stand aus dem geteilten Link, mit Tags', own: 'dein Stand aus diesem Browser', published: 'veröffentlichter Sync, ohne Tags' }[source];
  $('#loadNote').textContent = from ? `${view.scenes.length} Szenen · ${from}` : 'Zu diesem Spiel gibt es noch keinen Sync.';
  const ll = document.querySelector('[data-league-link]');
  if (ll) ll.href = `szenen.html?liga=${encodeURIComponent(data.league_id)}&team=${encodeURIComponent(team)}`;
  savePrefs(); updateUrl(); render();
}

// ===== Darstellung =====
const date = d => (d ? new Date(`${d}T12:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' }) : '');
const sceneKey = s => `${s.gameId}:${s.video}:${s.start}:${s.code}`;
// Szenen des gewählten Spielers (ohne Auswahl alle); Kategorien grenzen weiter ein, ohne Kategorie gilt beim Spieler alles
const byPlayer = () => view.scenes.filter(s => matchesPlayer(s, view.player, view.roles));
function filtered() {
  let list = byPlayer();
  if (view.player == null || view.filter.size) list = list.filter(s => s.cats.some(c => view.filter.has(c)));
  if (!view.shuffle) return list;
  const r = s => { const k = sceneKey(s); if (!view.rank.has(k)) view.rank.set(k, Math.random()); return view.rank.get(k); };
  return list.slice().sort((a, b) => r(a) - r(b));
}
// Neue Zufallsreihenfolge; die gerade laufende Szene bleibt vorn, damit nichts doppelt kommt
function reshuffle(keepFirst) {
  view.rank = new Map();
  if (keepFirst) view.rank.set(keepFirst, -1);
}

function render() {
  const list = filtered();
  $('#sceneCount').textContent = view.scenes.length ? `(${list.length})` : '';
  $('#gameCount').textContent = view.games.length ? `(${view.games.length})` : '';
  document.querySelectorAll('[data-stab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.stab === view.tab)));
  $('#scenesPanel').hidden = view.tab !== 'scenes' || !view.team;
  $('#gamesPanel').hidden = view.tab !== 'games' || !view.team;
  renderPlayerFilter();
  renderFilters();
  renderScenes(list);
  renderGames();
  renderNow();
}

function renderPlayerFilter() {
  const players = playersOf(view.scenes);
  if (!players.length) { $('#playerFilter').innerHTML = ''; return; }
  const count = (n, one, many) => (n ? `${n} ${n === 1 ? one : many}` : '');
  const opt = p => {
    const info = [count(p.goal, 'Tor', 'Tore'), count(p.assist, 'Vorlage', 'Vorlagen'), count(p.penalty, 'Strafe', 'Strafen')].filter(Boolean).join(', ');
    return `<option value="${esc(p.id)}" ${p.id === view.player ? 'selected' : ''}>${esc(p.label)}${info ? ` (${esc(info)})` : ''}</option>`;
  };
  $('#playerFilter').innerHTML = `<div class="sc-group"><span class="sc-gtitle">Spieler</span>
    <select id="playerSelect" aria-label="Spieler wählen"><option value="">Alle Spieler</option>${players.map(opt).join('')}</select>
    ${view.player != null ? PERSON_ROLES.map(([k, l]) => `<button class="sc-chip" data-role="${k}" aria-pressed="${view.roles.has(k)}">${l}</button>`).join('') : ''}</div>`;
}

function renderFilters() {
  const n = countByCat(byPlayer());
  const chip = k => `<button class="sc-chip" data-cat="${esc(k)}" aria-pressed="${view.filter.has(k)}" ${n[k] ? '' : 'disabled'}>${esc(catLabel(k))} <span>${n[k] || 0}</span></button>`;
  const tagCats = Object.keys(n).filter(k => k.startsWith('tag:')).sort((a, b) => catLabel(a).localeCompare(catLabel(b), 'de'));
  $('#filters').innerHTML = SCENE_GROUPS.map(g => `<div class="sc-group"><span class="sc-gtitle">${esc(g.title)}</span>${g.cats.map(([k]) => chip(k)).join('')}</div>`).join('') +
    `<div class="sc-group"><span class="sc-gtitle">Eigene Tags</span>${tagCats.length ? tagCats.map(chip).join('') : '<span class="note">Nur aus Spielen, die du in diesem Browser getaggt hast.</span>'}</div>` +
    (view.filter.size ? '<button class="btn small quiet sc-clear" data-clear>Auswahl aufheben</button>' : '');
}

function sceneText(s) {
  const l = Object.fromEntries(s.labels);
  const where = [l.Abschnitt, l.Spielzeit].filter(Boolean).join(' · ');
  const detail = ['Spielstand', 'Spieler', 'Vorlage', 'Ergebnis', 'Ort', 'Stärke', 'Spielsituation', 'Kommentar']
    .filter(k => l[k]).map(k => (k === 'Vorlage' ? `Vorlage ${l[k]}` : l[k])).join(' · ');
  return { where, detail };
}

const LINK_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/></svg>';
function renderScenes(list) {
  const el = $('#sceneList');
  if (!view.team) { el.innerHTML = ''; return; }
  if (!view.scenes.length) {
    el.innerHTML = `<li class="ov-empty">${view.games.some(g => g.source) ? 'Szenen werden geladen …' : 'Für dieses Team gibt es noch kein Spiel mit Sync. Unter „Spiele“ siehst du, welche Spiele noch fehlen.'}</li>`;
    return;
  }
  if (!view.filter.size && view.player == null) { el.innerHTML = '<li class="ov-empty">Wähl oben mindestens eine Kategorie oder einen Spieler.</li>'; return; }
  if (view.player != null && !view.roles.size) { el.innerHTML = '<li class="ov-empty">Wähl beim Spieler mindestens eine Rolle: Tore, Vorlagen oder Strafen.</li>'; return; }
  if (!list.length) { el.innerHTML = `<li class="ov-empty">Keine Szenen in dieser Auswahl.${view.player != null && view.filter.size ? ' Mit „Auswahl aufheben“ siehst du alle Szenen des Spielers.' : ''}</li>`; return; }
  const linkLabel = canShareNative() ? 'Szene teilen' : 'Link zur Szene kopieren';
  let html = '', lastGame = null;
  list.forEach((s, i) => {
    if (s.gameId !== lastGame) {
      lastGame = s.gameId;
      html += `<li class="sc-game">${esc(date(s.date))} · ${s.home ? 'gegen' : 'bei'} ${esc(s.opp)} <span class="score">${esc(s.result || '')}</span></li>`;
    }
    const { where, detail } = sceneText(s);
    const cur = view.current === sceneKey(s);
    html += `<li class="sc-row ${s.side || ''} ${cur ? 'sel' : ''}" data-i="${i}">
      <button class="sc-play" data-play="${i}">
        <span class="sc-where">${esc(where)}<small>${Math.round(s.end - s.start)} s</small></span>
        <span><span class="sc-code">${esc(s.code)}</span>${detail ? `<br><span class="sc-detail">${esc(detail)}</span>` : ''}</span>
      </button><button class="tr-link" data-link="${i}" title="${linkLabel}" aria-label="${linkLabel}">${LINK_ICON}</button></li>`;
  });
  el.innerHTML = html;
}

function renderGames() {
  if (!view.team) return;
  const played = view.games.filter(g => g.result);
  const groups = {
    all: ['Alle', view.games],
    untagged: ['Ohne Tags', played.filter(g => !g.tags)],
    unsynced: ['Ohne Sync', played.filter(g => !g.source)]
  };
  $('#gameFilter').innerHTML = Object.entries(groups).map(([k, [label, list]]) => `<button data-gfilter="${k}" aria-pressed="${view.gameFilter === k}">${label} (${list.length})</button>`).join('');
  const shown = groups[view.gameFilter][1];
  if (!shown.length) { $('#gameList').innerHTML = '<p class="ov-empty">Keine Spiele in dieser Auswahl.</p>'; return; }
  const syncCell = g => g.source === 'own' ? 'eigener Sync' : g.source === 'published' ? '<span class="ov-pub">öffentlicher Sync</span>' : g.result ? '<span class="te-info">kein Sync</span>' : '';
  $('#gameList').innerHTML = `<div class="ov-tablewrap"><table class="stats ov-table sc-games">
    <thead><tr><th>Datum</th><th>Spiel</th><th>Sync</th><th>Tags</th><th>Szenen</th><th></th></tr></thead>
    <tbody>${shown.map(g => `<tr class="${g.result ? '' : 'upcoming'}">
      <td class="ov-d">${esc(date(g.date))}</td>
      <td>${esc(g.home)} <span class="score">${esc(g.result || '–')}</span> ${esc(g.guest)}${g.error ? `<br><span class="error">${esc(g.error)}</span>` : ''}</td>
      <td>${syncCell(g)}</td>
      <td>${g.result ? (g.tags || '–') : ''}</td>
      <td>${g.source && g.result ? g.scenes : ''}</td>
      <td class="ov-a">${g.result ? `<a class="btn small ${g.source ? 'ghost' : ''}" href="${esc(gameUrl(g.id, g.video || (g.own && g.own.video) || (g.pub && g.pub.video)))}">${g.source ? 'Öffnen' : 'Syncen'}</a>` : '<span class="te-info">noch nicht gespielt</span>'}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function renderNow() {
  const list = filtered(), i = list.findIndex(s => sceneKey(s) === view.current);
  $('#playAllBtn').textContent = view.playAll ? 'Anhalten' : 'Alle abspielen';
  $('#playAllBtn').disabled = !list.length;
  $('#presentBtn').disabled = !list.length;
  $('#beamerBtn').disabled = !list.length;
  $('#prevBtn').disabled = i <= 0;
  $('#nextBtn').disabled = !list.length || (i >= list.length - 1 && !view.loop);
  $('#loopBtn').setAttribute('aria-pressed', String(view.loop));
  $('#shuffleBtn').setAttribute('aria-pressed', String(view.shuffle));
  const s = list[i];
  renderPresent(list, i);
  $('#nowPlaying').textContent = s ? `${i + 1} von ${list.length} · ${s.code} · ${date(s.date)} ${s.home ? 'gegen' : 'bei'} ${s.opp}` : list.length ? `${list.length} Szenen` : '';
}

// ===== Abspielen =====
// out ist der Player, der gerade spielt: hier im Fenster (player.js) oder im Beamer-Fenster (remoteplayer.js).
// Beide haben dieselbe Schnittstelle; alles Folgende spricht nur out an.
let out = yt, remote = null;
const playerHandlers = {
  onLoad: () => { $('#playerEmpty').hidden = true; $('#consent').hidden = true; },
  onReady: () => { if (view.pending) { const p = view.pending; view.pending = null; out.playAt(p.video, p.t); } },
  // Nach einem Videowechsel setzt YouTube das Tempo zurück
  onStateChange() {
    if (out.isPlaying() && out.getRate() !== view.rate) out.setRate(view.rate);
    if (view.present) { checkSwitch(); renderPresent(); }
  },
  onError: msg => showToast(msg)
};
yt.initPlayer('player', playerHandlers);
function play(i) {
  const s = filtered()[i]; if (!s) return;
  view.current = sceneKey(s);
  view.stopped = null; view.black = false;
  if (view.present) startSwitch(s);
  if (!hasConsent()) {
    view.pending = { video: s.video, t: s.start };
    $('#playerEmpty').hidden = true; $('#consent').hidden = false;
  } else if (!out.isReady()) {
    view.pending = { video: s.video, t: s.start };
    out.loadVideo(s.video);
  } else out.playAt(s.video, s.start);
  renderScenes(filtered()); renderNow();
  const row = document.querySelector(`.sc-row[data-i="${i}"]`);
  const box = document.querySelector('.sc-side');
  if (row && box && box.scrollHeight > box.clientHeight + 1 && getComputedStyle(box).overflowY !== 'visible') {
    const r = row.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (r.top < b.top || r.bottom > b.bottom) box.scrollTop += r.top - b.top - b.height / 3;
  } else if (row) row.scrollIntoView({ block: 'nearest' });
}
function step(dir) {
  const list = filtered(), i = list.findIndex(s => sceneKey(s) === view.current);
  const j = i + dir;
  if (j >= 0 && j < list.length) play(j);
  else if (dir > 0 && view.loop && list.length) {
    // Dauerschleife: wieder von vorn, gemischt in neuer Reihenfolge (die letzte Szene kommt nicht gleich wieder)
    if (view.shuffle && list.length > 1) { const last = view.current; reshuffle(); if (sceneKey(filtered()[0]) === last) view.rank.set(last, 2); }
    play(0);
  } else if (dir > 0 && view.present) { out.pause(); view.stopped = view.current; renderNow(); }
  else if (dir > 0 && view.playAll) { view.playAll = false; out.pause(); renderNow(); showToast('Alle Szenen abgespielt.'); }
}
$('#consentBtn').addEventListener('click', () => {
  giveConsent($('#consentRemember').checked);
  if (view.pending && view.present) startSwitch({ start: view.pending.t });
  if (view.pending) out.loadVideo(view.pending.video);
});
// Playlist: nach dem Nachlauf zur nächsten Szene
// Präsentieren: mit „Nach jeder Szene anhalten“ pausiert das Video am Ende, sonst geht es weiter.
// Wer danach mit der Leertaste weiterspielt, läuft über das Ende hinaus (kein zweites Anhalten).
setInterval(() => {
  if (remote && remote.win && remote.win.closed) { exitPresent(); return; }
  checkSwitch();
  if (view.remote) renderRemoteTime();
  if (!(view.playAll || view.present) || !view.current || !out.isPlaying()) return;
  const s = filtered().find(x => sceneKey(x) === view.current);
  if (!s || out.now() < s.end) return;
  if (view.present && pres.stopAfter) {
    if (view.stopped !== view.current) { view.stopped = view.current; out.pause(); renderNow(); }
  } else step(1);
}, 250);

// ===== Präsentieren =====
// Hier im Fenster: Vollbild des eigenen Rahmens um den Player (nicht YouTubes Vollbild, sonst wäre die Einblendung verdeckt).
// Auf zweitem Bildschirm: Video und Bühne im Beamer-Fenster (praesentation.html), hier die Referentenansicht.
const stage = $('#stage');
const renderStage = mountStage(stage);

// Was über dem Video liegt, als Modell für stageview.js (hier oder im Beamer-Fenster gezeichnet)
function presentModel(list, i) {
  if (!view.present) return EMPTY_MODEL;
  const s = list[i];
  const t = s ? overlayText(s, view.team, { players: pres.players }) : null;
  const carding = pres.overlay && !!s && !!view.switching && !view.black;
  const stoppedHere = s && view.stopped === view.current && !view.black;
  let pause = null;
  if (stoppedHere) {
    const next = list[i + 1] || (view.loop ? list[0] : null);
    pause = next
      ? `Szene ${i + 1} von ${list.length} · Weiter mit →: ${next.code}${next.gameId !== s.gameId ? ` · ${next.home ? 'gegen' : 'bei'} ${next.opp}` : ''}`
      : `Alle ${list.length} Szenen gezeigt · ← zurück, R noch einmal, Esc beendet`;
  }
  return {
    overlay: pres.overlay && s && !view.black && !carding ? { title: t.title, line: t.line, side: s.side || '', faded: !pres.overlayKeep && Date.now() >= view.overlayUntil } : null,
    // Ankündigung beim Szenenwechsel: groß die Szenenart, darunter Situation und Spiel
    card: carding ? { count: `Szene ${i + 1} von ${list.length}`, code: t.code, detail: t.detail, title: t.title, side: s.side || '' } : null,
    pause, black: view.black, switching: !!view.switching, ytControls: view.ytControls
  };
}
function renderPresent(list = filtered(), i = list.findIndex(s => sceneKey(s) === view.current)) {
  stage.classList.toggle('presenting', view.present && !view.remote);
  stage.classList.toggle('remote', view.present && view.remote);
  const model = presentModel(list, i);
  renderStage(view.remote ? EMPTY_MODEL : model);
  if (remote) remote.render(model);
  if (view.remote) renderRemote(list, i);
  const s = list[i];
  $('#prCount').textContent = s ? `${i + 1} / ${list.length}` : '';
  stage.querySelector('[data-pr="toggle"]').textContent = out.isPlaying() ? 'Pause' : 'Weiter';
  stage.querySelector('[data-pr="stop"]').setAttribute('aria-pressed', String(pres.stopAfter));
  stage.querySelector('[data-pr="overlay"]').setAttribute('aria-pressed', String(pres.overlay));
  stage.querySelector('[data-pr="players"]').setAttribute('aria-pressed', String(pres.players));
  stage.querySelector('[data-pr="keep"]').setAttribute('aria-pressed', String(pres.overlayKeep));
  const ytb = stage.querySelector('[data-pr="yt"]');
  ytb.setAttribute('aria-pressed', String(view.ytControls));
  ytb.textContent = view.ytControls ? 'Fertig' : 'YouTube-Bedienung';
}

// Referentenansicht im Hauptfenster, solange das Video im Beamer-Fenster läuft
function renderRemote(list, i) {
  const s = list[i], next = s ? (list[i + 1] || (view.loop ? list[0] : null)) : list[0];
  const t = s ? overlayText(s, view.team, { players: true }) : null;
  $('#prrStatus').textContent = !remote.connected() ? 'Beamer-Fenster wird geöffnet …'
    : !remote.started() ? 'Im Beamer-Fenster einmal auf „Präsentation starten“ klicken. Danach bedienst du alles hier.'
      : view.black ? 'Bild schwarz (B schaltet zurück)'
        : view.switching ? 'Ankündigung läuft'
          : view.stopped === view.current ? 'Angehalten am Szenenende'
            : out.isPlaying() ? 'Läuft' : 'Angehalten';
  $('#prrCount').textContent = s ? `Szene ${i + 1} von ${list.length}` : `${list.length} Szenen`;
  $('#prrCode').textContent = t ? t.code : 'Noch keine Szene gewählt';
  $('#prrDetail').textContent = t ? t.detail : '';
  $('#prrTitle').textContent = t ? t.title : '';
  $('#prrNext').textContent = next ? `Danach: ${next.code}${!s || next.gameId !== s.gameId ? ` · ${next.home ? 'gegen' : 'bei'} ${next.opp}` : ''}` : 'Danach: keine weitere Szene';
  renderRemoteTime();
}
function renderRemoteTime() {
  const s = filtered().find(x => sceneKey(x) === view.current);
  if (!s || !remote) { $('#prrTime').textContent = ''; return; }
  const left = Math.round(s.end - out.now());
  $('#prrTime').textContent = left > 0 ? `noch ${fmt(left)}` : 'Szene zu Ende';
}

// Szenenwechsel: Nach jedem Sprung puffert YouTube an der neuen Stelle. Statt Ladekreis und altem Bild
// bleibt das Bild schwarz, bis das Video dort läuft; dann kurze Aufblende.
// Mit Einblendung kündigt eine große Tafel die Szene an. Sie steht mindestens CARD_MIN ms, damit sie lesbar ist;
// ist das Video früher bereit, wird es so lange angehalten (kein Verlust beim Vorlauf).
const CARD_MIN = 1800, SWITCH_MAX = 5000;
// Die Einblendung unten links steht nach dem Szenenwechsel OVERLAY_MS lang und blendet dann aus
const OVERLAY_MS = 6000;
let switchTimer = null, overlayTimer = null;
function showOverlayFor() {
  view.overlayUntil = Date.now() + OVERLAY_MS;
  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => { if (view.present) renderPresent(); }, OVERLAY_MS + 50);
}
function startSwitch(s) {
  view.switching = { start: s.start, since: Date.now(), ready: false, held: false };
  clearTimeout(switchTimer);
  switchTimer = setTimeout(() => endSwitch(true), SWITCH_MAX); // spätestens dann wieder Bild, falls YouTube hängt
  if (view.present) renderPresent();
}
// resume: ein für die Tafel angehaltenes Video weiterspielen (nicht beim Beenden der Präsentation)
function endSwitch(resume = false) {
  const sw = view.switching;
  view.switching = null;
  clearTimeout(switchTimer);
  if (resume && sw && sw.held) out.play();
  if (sw && view.present) showOverlayFor();
  renderPresent();
}
function checkSwitch() {
  const sw = view.switching;
  if (!sw) return;
  if (!sw.ready && out.isPlaying()) {
    const t = out.rawNow();
    sw.ready = t >= sw.start - 0.5 && t <= sw.start + 3;
  }
  if (!sw.ready) return;
  if (pres.overlay && Date.now() - sw.since < CARD_MIN) {
    if (out.isPlaying()) { out.pause(); sw.held = true; }
    return;
  }
  endSwitch(true);
}
function setBlack(on) {
  view.black = on;
  if (on) out.pause();
}
// mode: 'here' (Vollbild in diesem Fenster) oder 'beamer' (zweites Fenster, hier die Referentenansicht)
function enterPresent(mode = 'here') {
  const list = filtered(); if (!list.length) return;
  if (view.present) exitPresent();
  if (mode === 'beamer') {
    if (typeof BroadcastChannel === 'undefined') { showToast('Dieser Browser kann kein zweites Fenster steuern. Nimm „Präsentieren“ oder Chrome.'); return; }
    const id = Math.random().toString(36).slice(2, 12).padEnd(8, '0');
    // Sofort öffnen (noch innerhalb des Klicks), sonst blockiert der Browser das Fenster
    const win = window.open(`praesentation.html#${id}`, 'floortag-beamer', 'popup,width=960,height=600');
    if (!win) { showToast('Der Browser hat das Beamer-Fenster blockiert. Erlaube Pop-ups für FloorTag und versuch es noch einmal.'); return; }
    if (yt.isPlaying()) yt.pause();
    remote = createRemote(id, {
      onHello: () => renderNow(),
      // Erst nach dem Startklick darf das Beamer-Fenster abspielen: aktuelle Szene dann neu ankündigen
      onStarted: () => { const l = filtered(), j = l.findIndex(s => sceneKey(s) === view.current); if (j >= 0) play(j); else renderNow(); },
      onKey: key => document.dispatchEvent(new KeyboardEvent('keydown', { key })),
      onBye: () => exitPresent()
    });
    remote.win = win;
    remote.initPlayer('player', playerHandlers);
    out = remote;
    view.remote = true;
    placeOnOtherScreen(win);
  } else {
    stage.appendChild($('#toast')); // Meldungen sind sonst im Vollbild unsichtbar
    // Ohne Fullscreen-API (iPhone) bleibt es bei der großen Ansicht im Fenster
    const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
    // Manche Umgebungen lehnen das Vollbild ab, ohne Fehler zu melden: dann füllt die Präsentation das Fenster
    const fallback = () => { if (view.present && !view.remote && !(document.fullscreenElement || document.webkitFullscreenElement)) stage.classList.add('pseudo-full'); };
    if (req) { Promise.resolve(req.call(stage)).catch(fallback); setTimeout(fallback, 600); }
    else fallback();
  }
  view.present = true; view.playAll = false;
  const i = list.findIndex(s => sceneKey(s) === view.current);
  play(i >= 0 ? i : 0);
  activity();
}
// Mit Erlaubnis („Fenster auf allen Bildschirmen verwalten“) legt Chrome das Beamer-Fenster auf den anderen Bildschirm
async function placeOnOtherScreen(win) {
  if (!window.screen.isExtended || !('getScreenDetails' in window)) return;
  try {
    const sd = await window.getScreenDetails();
    const other = sd.screens.find(x => x !== sd.currentScreen);
    if (!other || win.closed) return;
    win.moveTo(other.availLeft, other.availTop);
    win.resizeTo(other.availWidth, other.availHeight);
  } catch (e) { /* nicht erlaubt: Fenster bleibt hier und lässt sich hinüberziehen */ }
}
function exitPresent() {
  if (!view.present) return;
  view.present = false; view.stopped = null; view.black = false; view.ytControls = false; endSwitch();
  if (remote) {
    const r = remote, win = r.win;
    remote = null; out = yt; view.remote = false;
    r.close();
    try { if (win && !win.closed) win.close(); } catch (e) { /* schon zu */ }
    view.pending = null;
  }
  stage.classList.remove('pseudo-full', 'active');
  document.body.appendChild($('#toast'));
  if (document.fullscreenElement === stage) document.exitFullscreen().catch(() => {});
  else if (document.webkitFullscreenElement === stage) document.webkitExitFullscreen();
  renderNow();
}
const fsChange = () => { if (view.present && !view.remote && !(document.fullscreenElement || document.webkitFullscreenElement) && !stage.classList.contains('pseudo-full')) exitPresent(); };
document.addEventListener('fullscreenchange', fsChange);
document.addEventListener('webkitfullscreenchange', fsChange);
window.addEventListener('pagehide', () => { if (remote) exitPresent(); });
// Mauszeiger und Bedienleiste verschwinden nach zwei Sekunden ohne Bewegung (nur hier im Vollbild),
// mit dem Finger nach vier Sekunden, weil man die Leiste dort erst durch Tippen holt
let idleTimer = null, touchUi = false;
function activity() {
  if (!view.present || view.remote) return;
  stage.classList.add('active');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => stage.classList.remove('active'), touchUi ? 4000 : 2000);
}
stage.addEventListener('mousemove', e => { if (!touchUi) activity(); });
// Berührung erkennen: größere Tasten, und jedes Antippen der Leiste hält sie offen
stage.addEventListener('pointerdown', e => {
  touchUi = e.pointerType !== 'mouse';
  stage.classList.toggle('touch', touchUi);
  if (touchUi && e.target.closest('#prBar')) activity();
});
function presentAction(a) {
  const list = filtered(), i = list.findIndex(s => sceneKey(s) === view.current);
  if (a === 'next') { if (i < 0) play(0); else step(1); }
  else if (a === 'prev') step(-1);
  else if (a === 'again') { if (i >= 0) play(i); }
  else if (a === 'toggle') {
    if (view.black) setBlack(false);
    if (i < 0) play(0); else out.togglePlay();
  } else if (a === 'black') setBlack(!view.black);
  else if (a === 'stop') { pres.stopAfter = !pres.stopAfter; savePresent(); }
  else if (a === 'overlay') {
    // Ausgeblendet: erst wieder zeigen; sichtbar: ganz abschalten (bzw. wieder einschalten)
    const faded = pres.overlay && !pres.overlayKeep && Date.now() >= view.overlayUntil;
    if (!faded) { pres.overlay = !pres.overlay; savePresent(); }
    if (pres.overlay) showOverlayFor();
  } else if (a === 'keep') { pres.overlayKeep = !pres.overlayKeep; savePresent(); if (!pres.overlayKeep) showOverlayFor(); }
  else if (a === 'players') { pres.players = !pres.players; savePresent(); }
  else if (a === 'yt') view.ytControls = !view.ytControls;
  else if (a === 'exit') exitPresent();
  renderNow();
}
$('#presentBtn').addEventListener('click', () => enterPresent('here'));
$('#beamerBtn').addEventListener('click', () => enterPresent('beamer'));
stage.querySelector('#prBar').addEventListener('click', e => { const b = e.target.closest('[data-pr]'); if (b) presentAction(b.dataset.pr); });
// Klick aufs Video: Pause / weiter (die Klickfläche hält den Fokus auf der Seite, damit die Tasten ankommen).
// Mit dem Finger: Tippen holt zuerst nur die Leiste, erst ein zweites Tippen hält an bzw. spielt weiter;
// Wischen nach links zeigt die nächste Szene, nach rechts die vorige.
const SWIPE_MIN = 50;
let touchStart = null;
const shield = $('#prShield');
shield.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') touchStart = { x: e.clientX, y: e.clientY }; });
shield.addEventListener('pointercancel', () => { touchStart = null; });
shield.addEventListener('pointerup', e => {
  if (!touchStart) return;
  const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) presentAction(dx < 0 ? 'next' : 'prev');
  else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
    const shown = stage.classList.contains('active');
    activity();
    if (shown) presentAction('toggle');
  }
});
shield.addEventListener('click', () => { if (touchUi) return; activity(); presentAction('toggle'); });

// ===== Bedienung =====
async function shareScene(s) {
  const url = sceneUrl(new URL('./', location.href).toString(), { game: s.gameId, video: s.video, t: s.start, event: s.eventId ?? null });
  const text = `${s.code} · ${date(s.date)} ${s.home ? 'gegen' : 'bei'} ${s.opp}`;
  if (canShareNative()) { try { await navigator.share({ title: text, url }); } catch (e) { /* abgebrochen */ } return; }
  try { await navigator.clipboard.writeText(url); showToast(`Link zur Szene kopiert: ${text}`); }
  catch (e) { window.prompt('Link zur Szene', url); }
}

$('#leagueSelect').addEventListener('change', e => { view.games = []; view.scenes = []; render(); if (e.target.value) loadSchedule(e.target.value); savePrefs(); });
$('#teamSelect').addEventListener('change', e => { if (!e.target.value) return; if (view.single) selectSingleTeam(e.target.value); else loadTeam(e.target.value); });
$('#teamForm').addEventListener('submit', e => e.preventDefault());

document.querySelectorAll('[data-stab]').forEach(b => b.addEventListener('click', () => { view.tab = b.dataset.stab; render(); }));
$('#filters').addEventListener('click', e => {
  const b = e.target.closest('[data-cat]');
  if (b) { const k = b.dataset.cat; view.filter.has(k) ? view.filter.delete(k) : view.filter.add(k); }
  else if (e.target.closest('[data-clear]')) view.filter.clear();
  else return;
  view.playAll = false;
  savePrefs(); updateUrl(); render();
});
$('#playerFilter').addEventListener('change', e => {
  if (e.target.id !== 'playerSelect') return;
  view.player = e.target.value || null;
  view.playAll = false;
  updateUrl(); render();
});
$('#playerFilter').addEventListener('click', e => {
  const b = e.target.closest('[data-role]'); if (!b) return;
  const k = b.dataset.role; view.roles.has(k) ? view.roles.delete(k) : view.roles.add(k);
  view.playAll = false;
  updateUrl(); render();
});
$('#sceneList').addEventListener('click', e => {
  const p = e.target.closest('[data-play]');
  if (p) { play(Number(p.dataset.play)); return; }
  const l = e.target.closest('[data-link]');
  if (l) shareScene(filtered()[Number(l.dataset.link)]);
});
$('#gameFilter').addEventListener('click', e => {
  const b = e.target.closest('[data-gfilter]'); if (!b) return;
  view.gameFilter = b.dataset.gfilter; renderGames();
});
$('#playAllBtn').addEventListener('click', () => {
  view.playAll = !view.playAll;
  if (view.playAll) {
    const list = filtered(), i = list.findIndex(s => sceneKey(s) === view.current);
    play(i >= 0 ? i : 0);
  } else { out.pause(); renderNow(); }
});
$('#prevBtn').addEventListener('click', () => step(-1));
$('#loopBtn').addEventListener('click', () => { view.loop = !view.loop; renderNow(); });
// Zufällig: beim Einschalten neu mischen, die laufende Szene bleibt Nummer 1; beim Ausschalten wieder nach Datum
$('#shuffleBtn').addEventListener('click', () => {
  view.shuffle = !view.shuffle;
  if (view.shuffle) reshuffle(view.current);
  render();
});
// Spulen und Abspieltempo
document.querySelectorAll('[data-seek]').forEach(b => b.addEventListener('click', () => out.seek(out.now() + Number(b.dataset.seek))));
const RATES = [0.5, 1, 1.5, 2];
function setRate(r) {
  view.rate = r; out.setRate(r);
  document.querySelectorAll('[data-rate]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.rate) === r)));
}
document.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', () => setRate(Number(b.dataset.rate))));
$('#nextBtn').addEventListener('click', () => step(1));
document.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (view.present) {
    // Präsenter-Fernbedienungen senden Bild ab/auf, Pfeiltasten und B bzw. Punkt
    const map = { arrowright: 'next', pagedown: 'next', n: 'next', arrowleft: 'prev', pageup: 'prev', p: 'prev', r: 'again', b: 'black', '.': 'black', e: 'overlay', k: 'toggle', ' ': 'toggle', y: 'yt' };
    if (map[k]) { e.preventDefault(); presentAction(map[k]); return; }
    if (k === 'escape') { exitPresent(); return; }
  } else if (k === 'f') { enterPresent('here'); return; }
  if (k === 'k' || k === ' ') { e.preventDefault(); out.togglePlay(); }
  else if (k === 'n') step(1);
  else if (k === 'p') step(-1);
  else if (k === 'j' || k === 'l') out.seek(out.now() + (k === 'j' ? -5 : 5));
  else if (e.key === '-' || e.key === '+') {
    const i = RATES.indexOf(view.rate), next = RATES[Math.min(RATES.length - 1, Math.max(0, i + (e.key === '+' ? 1 : -1)))];
    if (next !== view.rate) setRate(next);
  }
});

// ===== Start: ?liga=…&team=…&filter=… hat Vorrang vor der letzten Wahl =====
async function init() {
  const params = new URLSearchParams(location.search), prefs = readPrefs();
  const filter = params.get('filter') ?? (Array.isArray(prefs.filter) ? prefs.filter.join(',') : null);
  if (filter != null) view.filter = new Set(filter.split(',').filter(Boolean));
  const pid = params.get('spieler');
  if (pid && /^n?\d{1,9}$/.test(pid)) view.player = pid;
  const roles = (params.get('rolle') || '').split(',').filter(r => PERSON_ROLES.some(([k]) => k === r));
  if (roles.length) view.roles = new Set(roles);
  // Einzelspiel aus der Spielansicht bzw. einem Teilen-Link
  const single = params.get('spiel');
  if (single && /^\d{1,9}$/.test(single)) {
    const vid = params.get('video');
    let shared = null;
    if (location.hash.startsWith(SHARE_PREFIX)) {
      try { shared = await decodeShare(location.hash.slice(SHARE_PREFIX.length)); }
      catch (e) { showError(`Der geteilte Link lässt sich nicht öffnen: ${e.message}`); return; }
    }
    await loadSingle(Number(single), vid && /^[\w-]{11}$/.test(vid) ? vid : null, shared, params.get('team'));
    return;
  }
  await loadLeagues();
  const league = params.get('liga') || prefs.league;
  const team = params.get('team') || prefs.team || null;
  if (league && /^\d{1,9}$/.test(league)) {
    if (![...$('#leagueSelect').options].some(o => o.value === league)) $('#leagueSelect').insertAdjacentHTML('beforeend', `<option value="${esc(league)}">Liga ${esc(league)}</option>`);
    $('#leagueSelect').value = league;
    loadSchedule(league, team);
  }
  render();
}
init();
