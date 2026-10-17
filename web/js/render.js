// ===== Darstellung =====
import { state, ui } from './state.js';
import { fmt, fmtGame, esc } from './format.js';
import { events, periodList, periodTitle, describe, teamShort as describeTeam } from './game.js';
import { timeOf, bounds, suggestStart, suggestEnd, gameTimeAt, videoTimeAt } from './sync.js';
import { buildChapters } from './chapters.js';
import { buildClips, EDL_SCOPES } from './export.js';
import { powerPlayPhases } from './phases.js';
import * as yt from './player.js';

export const $ = s => document.querySelector(s);

export function renderAll() {
  if (!state.game) return;
  renderSettings();
  renderPeriods();
  renderEvents();
  renderStrip();
  renderChapters();
  renderClipNote();
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
  $('#kleinfeldCheck').checked = state.kleinfeld;
  $('#leadOutInput').value = state.leadOut;
  $('#fpsInput').value = state.fps;
  const scope = $('#edlScopeInput');
  if (!scope.options.length) scope.innerHTML = Object.entries(EDL_SCOPES).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
  scope.value = state.edlScope;
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
    return `<div class="period"><h3>${esc(periodTitle(p))}</h3>${row('start', 'Anpfiff')}${p < 5 ? row('end', 'Ende') + anchorRows(p) : ''}</div>`;
  }).join('');
}
// Freie Anker eines Abschnitts und das Formular zum Setzen
function anchorRows(p) {
  const rows = (state.anchors[p] || []).map((a, i) => `
    <div class="mark anchor-row">
      <span class="lbl" title="Spielzeit">◆ ${fmtGame(a.g)}</span>
      <button class="timebtn" data-act="seekanchor" data-p="${p}" data-i="${i}" title="Zur Videozeit springen">${fmt(a.v)}</button>
      <span></span>
      <button class="btn small quiet" data-act="removeanchor" data-p="${p}" data-i="${i}" aria-label="Anker bei ${fmtGame(a.g)} entfernen">✕</button>
    </div>`).join('');
  const f = ui.anchorForm;
  if (f && f.p === p) {
    const g = gameTimeAt(p, f.v);
    return rows + `
      <form class="anchor-form" data-p="${p}">
        <label>Spielzeit bei Videozeit ${fmt(f.v)}
          <input name="g" type="text" inputmode="numeric" placeholder="mm:ss" value="${g != null ? fmtGame(g) : ''}" autocomplete="off">
        </label>
        <div class="row">
          <button class="btn small" type="submit">Anker setzen</button>
          <button class="btn small quiet" type="button" data-act="cancelanchor">Abbrechen</button>
        </div>
        <p class="hint">${f.error ? `<span class="error">${esc(f.error)}</span>` : 'Vorgeschlagen ist die geschätzte Spielzeit. Korrigiere sie, wenn du es genauer weißt.'}</p>
      </form>`;
  }
  return rows + `<button class="addanchor" data-act="openanchor" data-p="${p}">Freien Anker setzen</button>`;
}

function renderEvents() {
  const evs = events();
  const placedCount = evs.filter(e => state.placed[e.event_id] != null).length;
  const missingCount = evs.filter(e => state.missing[e.event_id]).length;
  $('#progress').textContent = `${placedCount} von ${evs.length} gesetzt` + (missingCount ? `, ${missingCount} nicht im Video` : '');
  $('#events').innerHTML = evs.map(e => {
    const d = describe(e), t = timeOf(e), isPlaced = state.placed[e.event_id] != null, isMissing = !!state.missing[e.event_id];
    const status = isMissing ? ['nicht im Video', 'st-missing'] : isPlaced ? ['gesetzt', 'st-placed'] : t != null ? ['geschätzt', 'st-est'] : ['offen', 'st-open'];
    const sel = e.event_id === ui.selectedId;
    let tools = '';
    if (sel && isMissing) {
      tools = `<div class="ev-tools">
        <div class="row"><button class="btn small" data-act="unmissing" data-id="${e.event_id}">Doch im Video</button></div>
        <span class="hint">Dieses Ereignis fehlt im Video, zum Beispiel wegen einer Streamlücke. Es bekommt keine Zeit und kein Kapitel.</span>
      </div>`;
    } else if (sel) {
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
          <button class="btn small quiet" data-act="missing" data-id="${e.event_id}">Nicht im Video</button>
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
  // Überzahlphasen als schmales Band: Heim oben, Gast unten
  for (const ph of powerPlayPhases()) {
    const a = videoTimeAt(ph.p, ph.from), b = videoTimeAt(ph.p, ph.to);
    if (a == null || b == null || b <= a) continue;
    html += `<div class="pp-band ${ph.team}" style="left:${pct(a)}%;width:${pct(b) - pct(a)}%" title="Überzahl ${esc(describeTeam(ph.team))} ${ph.strength[0]} gegen ${ph.strength[1]}"></div>`;
  }
  for (const [p, list] of Object.entries(state.anchors)) {
    for (const a of list) html += `<div class="anchor-pin" style="left:${pct(a.v)}%" title="Freier Anker: ${esc(periodTitle(Number(p), true))} ${fmtGame(a.g)} (${fmt(a.v)})"></div>`;
  }
  html += `<div class="playhead" id="playhead" style="left:${pct(yt.now())}%"></div>`;
  strip.innerHTML = html;
}
function renderChapters() {
  const c = buildChapters();
  $('#chapters').value = c.text;
  const notes = [];
  if (c.missing) notes.push(`${c.missing} Ereignis(se) noch ohne Zeit, sie fehlen in den Kapiteln.`);
  if (c.notInVideo) notes.push(`${c.notInVideo} Ereignis(se) sind als „nicht im Video“ markiert und haben kein Kapitel.`);
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

// Hinweis zum Analyse-Export: was in den Dateien landet
function renderClipNote() {
  const clips = buildClips();
  const count = kind => clips.filter(c => c.kind === kind).length;
  const scenes = count('goal') + count('penalty') + count('timeout'), periods = count('period'), pp = count('powerplay');
  const n = $('#clipNote');
  n.textContent = clips.length
    ? `Im Export: ${scenes} Szene(n), ${periods} Drittel und ${pp} Überzahlphase(n), jeweils auch als Unterzahl des Gegners. Szenen ohne Zeit oder „nicht im Video“ fehlen.`
    : 'Noch nichts zu exportieren. Setze zuerst Drittelgrenzen oder Ereignisse.';
  for (const id of ['#xmlBtn', '#csvBtn', '#edlBtn']) $(id).disabled = !clips.length;
}
