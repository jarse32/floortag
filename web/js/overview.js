// ===== Übersicht: deine Spiele nach Stufen und Spielplan einer Liga =====
// Datenquelle für „Deine Spiele“ ist der Speicher dieses Browsers (floortag:…, floortag-tags:…, floortag-meta:…).
// Mit dem Backend (Etappe 4) kommen hier die gemeinsamen Stände dazu; die Stufen-Logik bleibt gleich.
import { state } from './state.js';
import { prepareGame } from './game.js';
import { restore, saveMeta, metaKey } from './storage.js';
import { STAGES } from './progress.js';
import { esc } from './format.js';
import { fetchIndex } from './publish.js';
import { groupByDay, defaultDay, dayRange } from './schedule.js';

const $ = s => document.querySelector(s);
const view = { tab: 'mine', filter: 'all', league: null, day: null, leagueData: null, leagues: [], published: new Map() };

// ===== Gespeicherte Spiele =====
function storedGames() {
  const found = new Map();
  for (let i = 0; i < localStorage.length; i++) {
    const m = (localStorage.key(i) || '').match(/^floortag(?:-tags|-meta)?:(\d+):(.+)$/);
    if (m) found.set(`${m[1]}:${m[2]}`, { gameId: Number(m[1]), video: m[2] });
  }
  return [...found.values()].map(g => {
    let meta = null;
    try { meta = JSON.parse(localStorage.getItem(metaKey(g.gameId, g.video)) || 'null'); } catch (e) { /* kaputt: neu berechnen */ }
    return { ...g, meta };
  });
}

// Ältere Stände ohne Eckdaten einmal nachberechnen (Spiel über den Proxy laden, Fortschritt speichern)
async function fillMissingMeta(games) {
  let changed = false;
  for (const g of games.filter(x => !x.meta)) {
    try {
      const res = await fetch(`api/game.php?id=${g.gameId}`);
      if (!res.ok) continue;
      prepareGame(await res.json());
      state.videoId = g.video === 'ohne-video' ? null : g.video;
      state.sharedView = false;
      restore();
      saveMeta();
      changed = true;
    } catch (e) { /* Spiel bleibt ohne Eckdaten, erscheint mit Hinweis */ }
  }
  return changed;
}

function removeGame(g) {
  for (const prefix of ['floortag', 'floortag-tags', 'floortag-meta']) {
    try { localStorage.removeItem(`${prefix}:${g.gameId}:${g.video}`); } catch (e) { /* ignorieren */ }
  }
}

// ===== Darstellung =====
const date = d => (d ? new Date(`${d}T12:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const shortDate = d => (d ? new Date(`${d}T12:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '');

function stageBadge(stage) {
  const steps = STAGES.map((_, i) => `<span class="ov-step ${i <= stage ? 'on' : ''}"></span>`).join('');
  return `<span class="ov-stage" title="Stufe ${stage}: ${esc(STAGES[stage])}"><span class="ov-steps">${steps}</span>Stufe ${stage} · ${esc(STAGES[stage])}</span>`;
}

function progressDetails(p) {
  const parts = [];
  if (p.sync.started || p.sync.done) {
    parts.push(`Sync ${p.sync.done} von ${p.sync.total} Ereignissen, ${p.sync.periodsSet} von ${p.sync.periodsTotal} Abschnitten${p.sync.complete ? ' ✓' : ''}`);
  } else parts.push('Noch kein Sync');
  if (p.tags) parts.push(`${p.tags} Tag${p.tags === 1 ? '' : 's'}`);
  if (p.tags && p.shotsComplete) parts.push('Schüsse vollständig');
  if (p.tags && p.lineups.total) parts.push(`Aufstellung ${p.lineups.covered} von ${p.lineups.total} Toren`);
  return parts.join(' · ');
}

function renderMine(games) {
  const counts = [0, 0, 0, 0];
  for (const g of games) if (g.meta) counts[g.meta.progress.stage]++;
  $('#mineFilter').innerHTML = [['all', `Alle (${games.length})`], ...STAGES.map((s, i) => [String(i), `${i} · ${s} (${counts[i]})`])]
    .map(([k, l]) => `<button data-filter="${k}" aria-pressed="${view.filter === k}">${esc(l)}</button>`).join('');
  const shown = games.filter(g => view.filter === 'all' || (g.meta && String(g.meta.progress.stage) === view.filter))
    .sort((a, b) => ((b.meta && b.meta.date) || '').localeCompare((a.meta && a.meta.date) || ''));
  if (!games.length) {
    $('#mineList').innerHTML = '<p class="ov-empty">Noch keine Spiele in diesem Browser. Lade ein Spiel und setz die ersten Drittelgrenzen, dann erscheint es hier.</p>';
    return;
  }
  if (!shown.length) { $('#mineList').innerHTML = '<p class="ov-empty">Kein Spiel in dieser Stufe.</p>'; return; }
  const multiVideo = id => games.filter(x => x.gameId === id).length > 1;
  $('#mineList').innerHTML = shown.map(g => {
    const m = g.meta;
    if (!m) return `<article class="ov-card"><div><strong>Spiel ${g.gameId}</strong><p class="note">Eckdaten konnten nicht geladen werden.</p></div>
      <div class="ov-actions"><a class="btn small" href="./?spiel=${g.gameId}">Öffnen</a></div></article>`;
    return `<article class="ov-card">
      <div class="ov-main">
        <div class="ov-date">${esc(date(m.date))}${m.league ? ` · ${esc(m.league)}` : ''}</div>
        <div class="ov-match"><span>${esc(m.home)}</span> <span class="score">${esc(m.result || '–')}</span> <span>${esc(m.guest)}</span></div>
        ${stageBadge(m.progress.stage)}
        <div class="ov-details">${esc(progressDetails(m.progress))}${multiVideo(g.gameId) ? ` · Video ${esc(g.video)}` : ''}</div>
      </div>
      <div class="ov-actions">
        <a class="btn small" href="./?spiel=${g.gameId}">Öffnen</a>
        ${m.leagueId ? `<button class="btn small ghost" data-open-league="${m.leagueId}">Liga ansehen</button>` : ''}
        <button class="btn small quiet" data-remove="${g.gameId}:${esc(g.video)}" aria-label="Spiel aus diesem Browser löschen">Löschen</button>
      </div>
    </article>`;
  }).join('');
}

// ===== Liga =====
function leagueIdFrom(input) {
  const s = String(input || '').trim();
  if (/^\d{1,9}$/.test(s)) return s;
  const m = s.match(/\/(\d{2,9})-[\w-]+/) || s.match(/(\d{3,9})/);
  return m ? m[1] : null;
}
function knownLeagues(games) {
  const map = new Map();
  for (const g of games) if (g.meta && g.meta.leagueId) map.set(g.meta.leagueId, g.meta.league || `Liga ${g.meta.leagueId}`);
  return [...map.entries()];
}
async function getJson(url) {
  const res = await fetch(url);
  const type = res.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) throw new Error('Der Proxy antwortet nicht. Lokal muss die Seite über „php -S localhost:8000 -t web“ laufen.');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status} beim Laden.`);
  return data;
}

// Buttons: Ligen von Floorball Deutschland (Bundesligen, Pokal) und weitere Ligen deiner Spiele
async function loadLeagueList(games) {
  try { view.leagues = (await getJson('api/league.php?list=1')).leagues || []; } catch (e) { view.leagues = []; }
  renderLeagueButtons(games);
}
function renderLeagueButtons(games) {
  const btn = (id, label) => `<button class="btn small ${String(view.league) === String(id) ? '' : 'ghost'}" data-open-league="${id}" aria-pressed="${String(view.league) === String(id)}">${esc(label)}</button>`;
  const groups = [
    ['Bundesligen', view.leagues.filter(l => /bundesliga/i.test(l.class || '') || /FBL/.test(l.name || ''))],
    ['Pokal', view.leagues.filter(l => /pokal/i.test(l.name || ''))]
  ];
  const listed = new Set(view.leagues.map(l => String(l.id)));
  const others = knownLeagues(games).filter(([id]) => !listed.has(String(id)));
  $('#leagueButtons').innerHTML = groups.filter(([, list]) => list.length)
    .map(([title, list]) => `<div class="ov-group"><span class="ov-group-title">${title}</span>${list.map(l => btn(l.id, l.name)).join('')}</div>`).join('') +
    (others.length ? `<div class="ov-group"><span class="ov-group-title">Ligen deiner Spiele</span>${others.map(([id, name]) => btn(id, name)).join('')}</div>` : '');
}

async function loadLeague(id, games, day = null) {
  view.league = String(id);
  view.day = day;
  try { localStorage.setItem('floortag:overview-league', id); } catch (e) { /* ignorieren */ }
  $('#leagueInput').value = id;
  $('#leagueError').hidden = true;
  renderLeagueButtons(games);
  $('#leagueResult').innerHTML = '<p class="note">Spielplan wird geladen …</p>';
  try {
    const data = await getJson(`api/league.php?id=${encodeURIComponent(id)}`);
    // Veröffentlichte Syncs aller: nach Spiel zusammenfassen (fehlt der Server, geht es ohne)
    view.published = new Map();
    try {
      for (const [video, entry] of Object.entries(await fetchIndex() || {})) {
        const prev = view.published.get(entry.game_id);
        if (!prev || entry.periods > prev.periods) view.published.set(entry.game_id, { ...entry, video });
      }
    } catch (e) { /* ohne Übersicht der Syncs */ }
    view.leagueData = data;
    renderLeague(games);
  } catch (e) {
    $('#leagueResult').innerHTML = '';
    const err = $('#leagueError'); err.textContent = e.message; err.hidden = false;
  }
}

function renderLeague(games) {
  const data = view.leagueData;
  const mine = new Map();
  for (const g of games) if (g.meta) {
    const prev = mine.get(g.gameId);
    if (!prev || g.meta.progress.stage > prev.progress.stage) mine.set(g.gameId, g.meta);
  }
  const days = groupByDay(data.games, data.league.day_titles || {});
  if (view.day == null || !days.some(d => d.day === view.day)) view.day = defaultDay(days);
  const idx = days.findIndex(d => d.day === view.day);
  const cur = days[idx];
  const url = new URL(location.href);
  url.searchParams.set('liga', view.league);
  if (cur && cur.day) url.searchParams.set('spieltag', cur.day); else url.searchParams.delete('spieltag');
  history.replaceState(null, '', url);

  const hasVideoInfo = data.games.some(g => g.video);
  const name = data.league.name || (knownLeagues(games).find(([id]) => String(id) === String(data.league.id)) || [])[1] || `Liga ${data.league.id}`;
  const played = data.games.filter(g => g.result).length;
  const rows = (cur ? cur.games : []).map(g => {
    const m = mine.get(Number(g.id)), pub = view.published.get(Number(g.id));
    const pubBadge = pub ? `<span class="ov-pub" title="Veröffentlicht, Version ${pub.version}">öffentlicher Sync · ${pub.periods} Abschnitt${pub.periods === 1 ? '' : 'e'}</span>` : '';
    const videoCell = hasVideoInfo ? (g.video ? '<span class="ov-video" title="Video vorhanden">▶</span>' : '<span class="ov-novideo" title="Kein Video im Saisonmanager">–</span>') : '';
    const status = m ? stageBadge(m.progress.stage) : g.result ? (pub ? '' : '<span class="te-info">nicht bearbeitet</span>') : '<span class="te-info">noch nicht gespielt</span>';
    return `<tr class="${g.result ? '' : 'upcoming'}">
      <td class="ov-d">${esc(shortDate(g.date))}${g.time ? `<br><span class="te-info">${esc(g.time)}</span>` : ''}</td>
      <td>${esc(g.home)} <span class="score">${esc(g.result || '–')}</span> ${esc(g.guest)}</td>
      ${hasVideoInfo ? `<td class="ov-v">${videoCell}</td>` : ''}
      <td>${status}${pubBadge}</td>
      <td class="ov-a">${g.result ? `<a class="btn small ${m || pub ? '' : 'ghost'}" href="./?spiel=${esc(g.id)}">${m || pub ? 'Öffnen' : 'Bearbeiten'}</a>` : ''}</td>
    </tr>`;
  }).join('');
  const options = days.map(d => `<option value="${d.day}" ${d.day === view.day ? 'selected' : ''}>${esc(d.title)}${d.from ? ` · ${esc(dayRange(d.from, d.to))}` : ''}${d.played ? '' : ' (offen)'}</option>`).join('');
  $('#leagueResult').innerHTML = `
    <h2 class="ov-league">${esc(name)}</h2>
    <p class="note">${data.games.length} Spiele, ${played} gespielt, ${data.games.filter(g => mine.has(Number(g.id))).length} von dir bearbeitet, ${data.games.filter(g => view.published.has(Number(g.id))).length} mit öffentlichem Sync. Die Stufen beziehen sich auf Stände in diesem Browser.</p>
    ${days.length ? `<div class="ov-daynav">
      <button class="btn ghost" data-day-step="-1" ${idx <= 0 ? 'disabled' : ''} aria-label="Vorheriger Spieltag">‹</button>
      <select id="daySelect" aria-label="Spieltag wählen">${options}</select>
      <button class="btn ghost" data-day-step="1" ${idx >= days.length - 1 ? 'disabled' : ''} aria-label="Nächster Spieltag">›</button>
    </div>` : ''}
    ${rows ? `<div class="ov-tablewrap"><table class="stats ov-table">
      <thead><tr><th>Datum</th><th>Spiel</th>${hasVideoInfo ? '<th>Video</th>' : ''}<th>Stufe</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>` : '<p class="ov-empty">Keine Spiele in dieser Liga.</p>'}`;
}
function stepDay(dir, games) {
  if (!view.leagueData) return;
  const days = groupByDay(view.leagueData.games, view.leagueData.league.day_titles || {});
  const i = days.findIndex(d => d.day === view.day) + dir;
  if (i >= 0 && i < days.length) { view.day = days[i].day; renderLeague(games); }
}

// ===== Ablauf =====
function setTab(tab) {
  view.tab = tab;
  document.querySelectorAll('[data-otab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.otab === tab)));
  $('#minePanel').hidden = tab !== 'mine';
  $('#leaguePanel').hidden = tab !== 'league';
}

async function init() {
  let games = storedGames();
  const params = new URLSearchParams(location.search);
  const fromUrl = leagueIdFrom(params.get('liga'));
  // Ohne eigene Spiele gleich die Ligen zeigen
  setTab(fromUrl || !games.length ? 'league' : 'mine');
  renderMine(games);
  loadLeagueList(games);
  if (await fillMissingMeta(games)) { games = storedGames(); renderMine(games); renderLeagueButtons(games); }

  document.querySelectorAll('[data-otab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.otab)));
  $('#mineFilter').addEventListener('click', e => {
    const b = e.target.closest('[data-filter]'); if (!b) return;
    view.filter = b.dataset.filter; renderMine(games);
  });
  document.addEventListener('click', e => {
    const lg = e.target.closest('[data-open-league]');
    if (lg) { setTab('league'); loadLeague(lg.dataset.openLeague, games); return; }
    const step = e.target.closest('[data-day-step]');
    if (step) { stepDay(Number(step.dataset.dayStep), games); return; }
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      const [gameId, ...video] = rm.dataset.remove.split(':');
      const g = games.find(x => x.gameId === Number(gameId) && x.video === video.join(':'));
      if (g && confirm('Sync, Tags und Fortschritt dieses Spiels aus diesem Browser löschen? Das lässt sich nicht rückgängig machen.')) {
        removeGame(g); games = storedGames(); renderMine(games); renderLeagueButtons(games);
      }
    }
  });
  $('#leagueResult').addEventListener('change', e => {
    if (e.target.id === 'daySelect') { view.day = Number(e.target.value); renderLeague(games); }
  });
  // Pfeiltasten blättern durch die Spieltage
  document.addEventListener('keydown', e => {
    if (view.tab !== 'league' || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowLeft') stepDay(-1, games);
    if (e.key === 'ArrowRight') stepDay(1, games);
  });
  $('#leagueForm').addEventListener('submit', e => {
    e.preventDefault();
    const id = leagueIdFrom($('#leagueInput').value);
    if (id) loadLeague(id, games);
    else { const err = $('#leagueError'); err.textContent = 'Daraus konnte keine Liga-ID gelesen werden, z. B. 2449.'; err.hidden = false; }
  });

  // ?liga=2449&spieltag=5 öffnet direkt; sonst die zuletzt angesehene Liga
  let last = null;
  try { last = localStorage.getItem('floortag:overview-league'); } catch (e) { /* ignorieren */ }
  const day = Number(params.get('spieltag')) || null;
  if (fromUrl) loadLeague(fromUrl, games, day);
  else if (last) loadLeague(last, games);
}
init();
