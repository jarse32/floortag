// ===== Darstellung =====
import { state, ui } from './state.js';
import { fmt, fmtGame, esc } from './format.js';
import { events, periodList, periodTitle, describe } from './game.js';
import { timeOf, bounds, suggestStart, suggestEnd } from './sync.js';
import { buildChapters } from './chapters.js';
import * as yt from './player.js';

export const $ = s => document.querySelector(s);

export function renderAll() {
  if (!state.game) return;
  renderSettings();
  renderPeriods();
  renderEvents();
  renderStrip();
  renderChapters();
}
export function renderMatchline() {
  const g = state.game;
  const date = g.date ? new Date(g.date + 'T12:00').toLocaleDateString('de-DE') : '';
  $('#matchline').innerHTML =
    `<span class="teams">${esc(g.home_team_name)}</span><span class="score">${esc(g.result_string || '–')}</span>` +
    `<span class="teams">${esc(g.guest_team_name)}</span><span class="meta">${esc(g.league_name)}, ${esc(date)}</span>`;
}
function renderSettings() {
  $('#periodLenInput').value = state.periodLen / 60;
  $('#otLenInput').value = state.otLen / 60;
  $('#pauseLenInput').value = state.pauseLen / 60;
  $('#leadInput').value = state.leadIn;
  $('#penaltyCheck').checked = state.includePenalties;
  $('#youthCheck').checked = state.hideYouth;
}
function renderPeriods() {
  $('#periods').innerHTML = periodList().map(p => {
    const st = state.periods[p] || {};
    const sugg = { start: suggestStart(p), end: suggestEnd(p) };
    const row = (kind, label) => `
      <div class="mark">
        <span class="lbl">${label}</span>
        <button class="timebtn" data-act="seekmark" data-p="${p}" data-kind="${kind}" ${st[kind] == null ? 'disabled' : ''}>${fmt(st[kind])}</button>
        <button class="btn small" data-act="setmark" data-p="${p}" data-kind="${kind}">Jetzt</button>
        <button class="btn small quiet" data-act="clearmark" data-p="${p}" data-kind="${kind}" aria-label="${label} entfernen" ${st[kind] == null ? 'hidden' : ''}>✕</button>
        ${st[kind] == null && sugg[kind] != null ? `<button class="suggest" data-act="seeksuggest" data-t="${sugg[kind]}">Vorschlag ${fmt(sugg[kind])} ansehen</button>` : ''}
      </div>`;
    return `<div class="period"><h3>${esc(periodTitle(p))}</h3>${row('start', 'Anpfiff')}${p < 5 ? row('end', 'Ende') : ''}</div>`;
  }).join('');
}
function renderEvents() {
  const evs = events();
  const placedCount = evs.filter(e => state.placed[e.event_id] != null).length;
  $('#progress').textContent = `${placedCount} von ${evs.length} gesetzt`;
  $('#events').innerHTML = evs.map(e => {
    const d = describe(e), t = timeOf(e), isPlaced = state.placed[e.event_id] != null;
    const status = isPlaced ? ['gesetzt', 'st-placed'] : t != null ? ['geschätzt', 'st-est'] : ['offen', 'st-open'];
    const sel = e.event_id === ui.selectedId;
    let tools = '';
    if (sel) {
      const { lo, hi } = bounds(e);
      const c = t != null ? t : yt.now();
      const min = Math.max(isFinite(lo) ? lo : 0, c - 90), max = Math.min(isFinite(hi) ? hi : c + 90, c + 90);
      tools = `<div class="ev-tools">
        <div class="row">
          <button class="btn small" data-act="setnow" data-id="${e.event_id}">Auf aktuelle Videozeit setzen</button>
          <button class="btn small ghost" data-act="jump" data-id="${e.event_id}" ${t == null ? 'disabled' : ''}>Ab ${state.leadIn} s vorher abspielen</button>
        </div>
        <div class="row">
          <button class="btn small ghost" data-act="nudge" data-d="-5" data-id="${e.event_id}" ${t == null ? 'disabled' : ''}>−5 s</button>
          <button class="btn small ghost" data-act="nudge" data-d="-1" data-id="${e.event_id}" ${t == null ? 'disabled' : ''}>−1 s</button>
          <button class="btn small ghost" data-act="nudge" data-d="1" data-id="${e.event_id}" ${t == null ? 'disabled' : ''}>+1 s</button>
          <button class="btn small ghost" data-act="nudge" data-d="5" data-id="${e.event_id}" ${t == null ? 'disabled' : ''}>+5 s</button>
          ${isPlaced ? `<button class="btn small quiet" data-act="unplace" data-id="${e.event_id}">Schätzung verwenden</button>` : ''}
        </div>
        ${t != null && max > min ? `<input type="range" data-id="${e.event_id}" min="${min}" max="${max}" step="0.5" value="${c}" aria-label="Videozeit feinjustieren">
        <span class="hint">Der Regler bleibt zwischen den benachbarten gesetzten Punkten.</span>` : '<span class="hint">Setze zuerst den Anpfiff des Abschnitts, dann wird die Position geschätzt.</span>'}
      </div>`;
    }
    return `<li class="event ${e.event_team} ${sel ? 'sel' : ''}" data-row="${e.event_id}">
      <button class="ev-head" data-act="select" data-id="${e.event_id}" aria-expanded="${sel}">
        <span class="ev-gt">${esc(periodTitle(Math.floor(e.period), true))}<br>${fmtGame(state.gs[e.event_id])}</span>
        <span><span class="ev-title">${d.score ? `<span class="sc">${esc(d.score)}</span>` : ''}${esc(d.text)}</span>
          ${d.sub ? `<br><span class="ev-sub">${esc(d.sub)}</span>` : ''}</span>
        <span class="ev-vt ${status[1]}">${fmt(t)}<small>${status[0]}</small></span>
      </button>${tools}</li>`;
  }).join('');
}
export function renderStrip() {
  const strip = $('#strip');
  const dur = yt.duration();
  if (!dur) { strip.hidden = true; return; }
  strip.hidden = false;
  const pct = v => Math.min(100, Math.max(0, v / dur * 100));
  let html = '';
  for (const p of periodList()) {
    const st = state.periods[p] || {};
    if (st.start == null) continue;
    const end = st.end != null ? st.end : (suggestEnd(p) || st.start + 300);
    html += `<div class="seg ${st.end == null ? 'open' : ''}" style="left:${pct(st.start)}%;width:${pct(end) - pct(st.start)}%"><span>${esc(periodTitle(p, true))}</span></div>`;
  }
  for (const e of events()) {
    const t = timeOf(e);
    if (t == null) continue;
    const cls = [e.event_type, e.event_team, state.placed[e.event_id] != null ? 'is-placed' : 'is-est', e.event_id === ui.selectedId ? 'sel' : ''].join(' ');
    html += `<button class="pin ${cls}" style="left:${pct(t)}%" data-act="select" data-id="${e.event_id}" title="${esc(describe(e).text)} (${fmt(t)})"></button>`;
  }
  html += `<div class="playhead" id="playhead" style="left:${pct(yt.now())}%"></div>`;
  strip.innerHTML = html;
}
function renderChapters() {
  const c = buildChapters();
  $('#chapters').value = c.text;
  const notes = [];
  if (c.missing) notes.push(`${c.missing} Ereignis(se) noch ohne Zeit, sie fehlen in den Kapiteln.`);
  if (c.shifted) notes.push(`${c.shifted} Kapitel wurden verschoben, weil YouTube mindestens 10 Sekunden Abstand verlangt.`);
  if (c.count < 3) notes.push('YouTube zeigt Kapitel erst ab drei Einträgen an.');
  const n = $('#chapterNote');
  n.textContent = notes.join(' ') || 'Kapitel sind bereit zum Einfügen in die Videobeschreibung.';
  n.classList.toggle('warn', notes.length > 0);
}

// Uhr und Abspielposition, wird regelmäßig aufgerufen
export function updateClock() {
  if (!yt.isReady() || !state.game) return;
  const t = yt.now(), dur = yt.duration();
  $('#clock').textContent = fmt(t);
  const ph = document.getElementById('playhead');
  if (ph && dur) ph.style.left = `${Math.min(100, t / dur * 100)}%`;
  else if (dur && $('#strip').hidden) renderStrip();
}

export function showPlayerMessage(msg) {
  const el = $('#playerEmpty'); el.textContent = msg; el.hidden = false;
}
