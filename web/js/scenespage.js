// ===== Seite „Szenen“: Szenen eines Teams über alle Spiele einer Liga =====
// Nur gesyncte Szenen: eigener Stand in diesem Browser (mit Tags) oder veröffentlichter Sync (ohne Tags).
// Es wird nichts gespeichert außer der zuletzt gewählten Liga und dem Team.
import { state } from './state.js';
import { fmt, esc } from './format.js';
import { SCENE_GROUPS, catLabel, collectScenes, countByCat, loadGameState, sideOf, teamsOf, hasSyncData } from './scenes.js';
import { fetchIndex, fetchPublished } from './publish.js';
import { sceneUrl, canShareNative } from './scenelink.js';
import { hasConsent, giveConsent } from './consent.js';
import * as yt from './player.js';

const $ = s => document.querySelector(s);
const PREFS = 'floortag:scenes';
const view = {
  leagues: [], schedule: null, team: null, games: [], scenes: [], run: 0,
  filter: new Set(['goal']), gameFilter: 'all', tab: 'scenes', ppDelay: 30,
  current: null, playAll: false, pending: null
};

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
  try { localStorage.setItem(PREFS, JSON.stringify({ league: $('#leagueSelect').value, team: view.team, filter: [...view.filter], ppDelay: view.ppDelay })); } catch (e) { /* ignorieren */ }
}
function readPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch (e) { return {}; }
}
function updateUrl() {
  const url = new URL(location.href);
  url.search = '';
  if ($('#leagueSelect').value) url.searchParams.set('liga', $('#leagueSelect').value);
  if (view.team) url.searchParams.set('team', view.team);
  if (view.filter.size) url.searchParams.set('filter', [...view.filter].join(','));
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
  for (const [i, g] of todo.entries()) {
    $('#loadNote').textContent = `Szenen werden geladen … ${i} von ${todo.length} Spielen`;
    try {
      const video = g.own ? g.own.video : g.pub.video;
      const data = await getJson(`api/game.php?id=${encodeURIComponent(g.id)}`);
      const pub = g.own ? null : ((await fetchPublished(video)) || {}).sync || null;
      if (run !== view.run) return; // inzwischen ein anderes Team gewählt
      // Laden und Auswerten ohne await dazwischen: der Zustand gehört in dieser Zeit diesem Spiel
      if (!loadGameState(data, video, { pub, league: view.schedule.league })) continue;
      const opp = g.side === 'home' ? g.guest : g.home;
      const list = collectScenes(g.side, { ppDelay: view.ppDelay }).map(c => ({ ...c, gameId: g.id, video, date: g.date, opp, home: g.side === 'home', result: g.result }));
      g.scenes = list.length; g.tags = state.tags.length; g.video = video;
      view.scenes.push(...list);
    } catch (e) { g.error = e.message; }
    render();
  }
  if (run !== view.run) return;
  const synced = view.games.filter(g => g.result && g.source).length, played = view.games.filter(g => g.result).length;
  $('#loadNote').textContent = `${synced} von ${played} gespielten Spielen mit Sync`;
  render();
}

// ===== Darstellung =====
const date = d => (d ? new Date(`${d}T12:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' }) : '');
const sceneKey = s => `${s.gameId}:${s.video}:${s.start}:${s.code}`;
function filtered() { return view.scenes.filter(s => s.cats.some(c => view.filter.has(c))); }

function render() {
  const list = filtered();
  $('#sceneCount').textContent = view.scenes.length ? `(${list.length})` : '';
  $('#gameCount').textContent = view.games.length ? `(${view.games.length})` : '';
  document.querySelectorAll('[data-stab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.stab === view.tab)));
  $('#scenesPanel').hidden = view.tab !== 'scenes' || !view.team;
  $('#gamesPanel').hidden = view.tab !== 'games' || !view.team;
  renderFilters();
  renderScenes(list);
  renderGames();
  renderNow();
}

function renderFilters() {
  const n = countByCat(view.scenes);
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
  if (!view.filter.size) { el.innerHTML = '<li class="ov-empty">Wähl oben mindestens eine Kategorie.</li>'; return; }
  if (!list.length) { el.innerHTML = '<li class="ov-empty">Keine Szenen in dieser Auswahl.</li>'; return; }
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
      <td class="ov-a">${g.result ? `<a class="btn small ${g.source ? 'ghost' : ''}" href="./?spiel=${esc(g.id)}">${g.source ? 'Öffnen' : 'Syncen'}</a>` : '<span class="te-info">noch nicht gespielt</span>'}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function renderNow() {
  const list = filtered(), i = list.findIndex(s => sceneKey(s) === view.current);
  $('#playAllBtn').textContent = view.playAll ? 'Anhalten' : 'Alle abspielen';
  $('#playAllBtn').disabled = !list.length;
  $('#prevBtn').disabled = i <= 0;
  $('#nextBtn').disabled = !list.length || i >= list.length - 1;
  const s = list[i];
  $('#nowPlaying').textContent = s ? `${i + 1} von ${list.length} · ${s.code} · ${date(s.date)} ${s.home ? 'gegen' : 'bei'} ${s.opp}` : list.length ? `${list.length} Szenen` : '';
}

// ===== Abspielen =====
yt.initPlayer('player', {
  onLoad: () => { $('#playerEmpty').hidden = true; $('#consent').hidden = true; },
  onReady: () => { if (view.pending) { const p = view.pending; view.pending = null; yt.playAt(p.video, p.t); } },
  onStateChange() {},
  onError: msg => showToast(msg)
});
function play(i) {
  const s = filtered()[i]; if (!s) return;
  view.current = sceneKey(s);
  if (!hasConsent()) {
    view.pending = { video: s.video, t: s.start };
    $('#playerEmpty').hidden = true; $('#consent').hidden = false;
  } else if (!yt.isReady()) {
    view.pending = { video: s.video, t: s.start };
    yt.loadVideo(s.video);
  } else yt.playAt(s.video, s.start);
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
  else if (dir > 0 && view.playAll) { view.playAll = false; yt.pause(); renderNow(); showToast('Alle Szenen abgespielt.'); }
}
$('#consentBtn').addEventListener('click', () => {
  giveConsent($('#consentRemember').checked);
  if (view.pending) yt.loadVideo(view.pending.video);
});
// Playlist: nach dem Nachlauf zur nächsten Szene
setInterval(() => {
  if (!view.playAll || !view.current || !yt.isPlaying()) return;
  const s = filtered().find(x => sceneKey(x) === view.current);
  if (s && yt.now() >= s.end) step(1);
}, 250);

// ===== Bedienung =====
async function shareScene(s) {
  const url = sceneUrl(new URL('./', location.href).toString(), { game: s.gameId, video: s.video, t: s.start, event: s.eventId ?? null });
  const text = `${s.code} · ${date(s.date)} ${s.home ? 'gegen' : 'bei'} ${s.opp}`;
  if (canShareNative()) { try { await navigator.share({ title: text, url }); } catch (e) { /* abgebrochen */ } return; }
  try { await navigator.clipboard.writeText(url); showToast(`Link zur Szene kopiert: ${text}`); }
  catch (e) { window.prompt('Link zur Szene', url); }
}

$('#leagueSelect').addEventListener('change', e => { view.games = []; view.scenes = []; render(); if (e.target.value) loadSchedule(e.target.value); savePrefs(); });
$('#teamSelect').addEventListener('change', e => { if (e.target.value) loadTeam(e.target.value); });
$('#teamForm').addEventListener('submit', e => e.preventDefault());
$('#ppDelayInput').addEventListener('change', e => {
  const v = Number(e.target.value);
  view.ppDelay = Number.isFinite(v) ? Math.min(120, Math.max(0, Math.round(v))) : 30;
  e.target.value = view.ppDelay;
  savePrefs();
  if (view.team) loadTeam(view.team);
});
document.querySelectorAll('[data-stab]').forEach(b => b.addEventListener('click', () => { view.tab = b.dataset.stab; render(); }));
$('#filters').addEventListener('click', e => {
  const b = e.target.closest('[data-cat]');
  if (b) { const k = b.dataset.cat; view.filter.has(k) ? view.filter.delete(k) : view.filter.add(k); }
  else if (e.target.closest('[data-clear]')) view.filter.clear();
  else return;
  view.playAll = false;
  savePrefs(); updateUrl(); render();
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
  } else { yt.pause(); renderNow(); }
});
$('#prevBtn').addEventListener('click', () => step(-1));
$('#nextBtn').addEventListener('click', () => step(1));
document.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'k' || k === ' ') { e.preventDefault(); yt.togglePlay(); }
  else if (k === 'n') step(1);
  else if (k === 'p') step(-1);
});

// ===== Start: ?liga=…&team=…&filter=… hat Vorrang vor der letzten Wahl =====
async function init() {
  const params = new URLSearchParams(location.search), prefs = readPrefs();
  const filter = params.get('filter') ?? (Array.isArray(prefs.filter) ? prefs.filter.join(',') : null);
  if (filter != null) view.filter = new Set(filter.split(',').filter(Boolean));
  if (Number.isFinite(prefs.ppDelay) && prefs.ppDelay >= 0 && prefs.ppDelay <= 120) view.ppDelay = prefs.ppDelay;
  $('#ppDelayInput').value = view.ppDelay;
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
