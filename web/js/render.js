// ===== Darstellung =====
import { state, ui } from './state.js';
import { fmt, fmtGame, esc } from './format.js';
import { events, periodList, periodTitle, describe, teamShort as describeTeam, gameSec, isCorrected } from './game.js';
import { timeOf, bounds, suggestStart, suggestEnd, gameTimeAt, videoTimeAt } from './sync.js';
import { buildChapters, CHAPTER_TAGS } from './chapters.js';
import { buildClips, EDL_SCOPES } from './export.js';
import { powerPlayPhases } from './phases.js';
import { CATALOG, codeOf, fill, outcomeLabel, placeLabel, findTag, openPhase, shootoutScore, nextShootoutTeam, isShootout, faceoffAdvantage, goalieAt, goalkeepers } from './tags.js';
import { personLabel } from './game.js';
import { statPeriods, statRows, computeStats, signed, goalSituations, situationLabels } from './stats.js';
import { lineupOf, forcedPlayers, fieldPlayers } from './lineups.js';
import { getToken } from './publish.js';
import * as yt from './player.js';
import { canShareNative } from './scenelink.js';

export const $ = s => document.querySelector(s);

// Farbe der Marke zur Torsituation
function badgeClass(label) {
  if (label.startsWith('Überzahl')) return 'pp';
  if (label.startsWith('Unterzahl')) return 'sh';
  if (label === 'leeres Tor') return 'en';
  if (label.endsWith('ohne Torhüter')) return 'ea';
  if (label === 'Penalty') return 'ps';
  return '';
}

export function renderAll() {
  document.body.dataset.mode = ui.mode;
  document.querySelectorAll('.modes [data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === ui.mode)));
  $('#shareBtn').hidden = !state.game; // Teilen erst, wenn ein Spiel geladen ist
  if (!state.game) return;
  renderSettings();
  renderPeriods();
  renderEvents();
  renderStrip();
  renderChapters();
  renderClipNote();
  renderTagBar();
  renderTagList();
  renderPublish();
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
  $('#chapterTags').innerHTML = '<legend>Aus deinen Tags als Kapitel</legend>' + CHAPTER_TAGS.map(([k, l]) =>
    `<label class="check"><input type="checkbox" data-chapter-tag="${k}" ${state.chapterTags.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('');
  $('#youthCheck').checked = state.hideYouth;
  $('#kleinfeldCheck').checked = state.kleinfeld;
  $('#leadOutInput').value = state.leadOut;
  // Herkunft der Drittellänge
  const li = ui.leagueInfo, n = $('#lengthNote');
  if (n) {
    const ligaText = li && li.period_length ? `${esc(li.name || 'Liga')}: ${li.periods || 3} × ${li.period_length} Min.${li.overtime_length ? `, Verlängerung ${li.overtime_length} Min.` : ''}` : '';
    n.innerHTML = state.lengthSource === 'league' && ligaText ? `Drittellänge und Verlängerung aus den Ligadaten (${ligaText}).`
      : state.lengthSource === 'manual' ? `Drittellänge von Hand eingestellt${ligaText ? ` (laut Ligadaten ${ligaText})` : ''}.` : '';
    if (li && li.periods && li.periods !== 3) n.innerHTML += ` Diese Liga spielt ${li.periods} Abschnitte; FloorTag rechnet bisher mit drei Dritteln.`;
  }
  $('#counterLenInput').value = state.counterLen;
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
  const evs = events(), situations = goalSituations();
  const placedCount = evs.filter(e => state.placed[e.event_id] != null).length;
  const missingCount = evs.filter(e => state.missing[e.event_id]).length;
  $('#progress').textContent = `${placedCount} von ${evs.length} gesetzt` + (missingCount ? `, ${missingCount} nicht im Video` : '');
  // Ohne jeden Sync haben Ereignisse keine Zeit: oben erklären, was zu tun ist
  const synced = Object.values(state.periods).some(p => p && p.start != null) || Object.keys(state.placed).length > 0 || Object.keys(state.anchors).length > 0;
  const notice = synced ? '' : `<li class="events-notice">${ui.mode === 'view'
    ? 'Auf diesem Gerät gibt es noch keinen Sync für dieses Video. Sync und Tags liegen nur im Browser, in dem sie gesetzt wurden. Öffne dort „Link teilen“ und schick dir den Link, dann sind Szenen und Tags hier verfügbar.'
    : 'Noch kein Sync für dieses Video. Spul zum Anpfiff des 1. Drittels und klick in der Drittelkarte bei „Anpfiff“ auf „Jetzt“. Danach springt ein Klick auf ein Ereignis zur geschätzten Szene.'}</li>`;
  $('#events').innerHTML = notice + evs.map(e => {
    const d = describe(e), t = timeOf(e), isPlaced = state.placed[e.event_id] != null, isMissing = !!state.missing[e.event_id];
    const status = isMissing ? ['nicht im Video', 'st-missing'] : isPlaced ? ['gesetzt', 'st-placed'] : t != null ? ['geschätzt', 'st-est'] : ['offen', 'st-open'];
    const sel = e.event_id === ui.selectedId;
    let tools = '';
    const editable = ui.mode !== 'view';
    if (sel && editable && isMissing) {
      tools = `<div class="ev-tools">
        <div class="row"><button class="btn small" data-act="unmissing" data-id="${e.event_id}">Doch im Video</button></div>
        <span class="hint">Dieses Ereignis fehlt im Video, zum Beispiel wegen einer Streamlücke. Es bekommt keine Zeit und kein Kapitel.</span>
      </div>`;
    } else if (sel && editable) {
      const { lo, hi } = bounds(e);
      const c = t != null ? t : yt.now();
      const min = Math.max(isFinite(lo) ? lo : 0, c - 90), max = Math.min(isFinite(hi) ? hi : c + 90, c + 90);
      tools = `<div class="ev-tools">
        ${ui.jumpFrom != null ? `<div class="jumpback">Vor dem Sprung warst du bei <strong>${fmt(ui.jumpFrom)}</strong>
          <button class="btn small" data-act="placeback" data-id="${e.event_id}">Dort setzen</button>
          <button class="btn small ghost" data-act="goback" data-id="${e.event_id}">Zurück</button></div>` : ''}
        <div class="row">
          <button class="btn small" data-act="setnow" data-id="${e.event_id}">Auf aktuelle Videozeit setzen</button>
          <button class="btn small ghost" data-act="jump" data-id="${e.event_id}" ${t == null ? 'disabled' : ''}>Ab ${state.leadIn} s vorher abspielen</button>
          ${t != null ? linkBtn(e.event_id) : ''}
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
        ${fixHtml(e)}
        ${ui.mode === 'analysis' && e.event_type === 'goal' && Math.floor(e.period) <= 4 ? lineupHtml(e) : ''}
      </div>`;
    }
    else if (sel && t != null) tools = `<div class="ev-tools"><div class="row">${linkBtn(e.event_id)}</div></div>`;
    return `<li class="event ${e.event_team} ${sel ? 'sel' : ''}" data-row="${e.event_id}">
      <button class="ev-head" data-act="select" data-id="${e.event_id}" aria-expanded="${sel}">
        <span class="ev-gt">${esc(periodTitle(Math.floor(e.period), true))}<br>${isCorrected(e) ? `<span class="gt-fixed" title="Spielzeit korrigiert, laut Saisonmanager ${fmtGame(state.gs[e.event_id])}">${fmtGame(gameSec(e))}*</span>` : fmtGame(gameSec(e))}</span>
        <span><span class="ev-title">${d.score ? `<span class="sc">${esc(d.score)}</span>` : ''}${esc(d.text)}</span>${situationLabels(situations[e.event_id]).map(l => ` <span class="badge ${badgeClass(l)}">${esc(l)}</span>`).join('')}
          ${d.sub ? `<br><span class="ev-sub">${esc(d.sub)}</span>` : ''}</span>
        <span class="ev-vt ${status[1]}">${fmt(t)}<small>${status[0]}</small></span>
      </button>${tools}</li>`;
  }).join('');
}
// Link zur Szene: auf Handy und Tablet über das Teilen-Menü, sonst kopieren
const linkLabel = () => canShareNative() ? 'Szene teilen' : 'Link zur Szene kopieren';
const linkBtn = id => `<button class="btn small ghost" data-act="link" data-id="${id}">${linkLabel()}</button>`;
const LINK_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/></svg>';
// Spielzeit korrigieren: Angebot nach einem Setzen außerhalb der Reihenfolge, Hinweis bei bestehender Korrektur
function fixHtml(e) {
  const o = ui.outOfOrder && ui.outOfOrder.id === e.event_id ? ui.outOfOrder : null;
  let html = '';
  if (o && o.g != null) html += `<div class="fixbox">
      <span>Die Stelle ${fmt(o.v)} passt nicht zur Reihenfolge der Spielzeiten, das Ereignis liegt deshalb am Rand bei ${fmt(timeOf(e))}. Ist die Spielzeit im Saisonmanager falsch?</span>
      <div class="row"><label>Spielzeit <input type="text" class="fix-input" data-fix-input="${e.event_id}" value="${fmtGame(o.g)}" inputmode="numeric" aria-label="Korrigierte Spielzeit (Minuten:Sekunden)"></label>
        <button class="btn small" data-act="fixtime" data-id="${e.event_id}">Spielzeit korrigieren und bei ${fmt(o.v)} setzen</button>
        <button class="btn small quiet" data-act="fixdismiss" data-id="${e.event_id}">Nein, am Rand lassen</button></div>
    </div>`;
  if (isCorrected(e)) html += `<div class="fixnote">Spielzeit korrigiert auf <strong>${fmtGame(gameSec(e))}</strong>, laut Saisonmanager ${fmtGame(state.gs[e.event_id])}.
      <button class="btn small quiet" data-act="unfix" data-id="${e.event_id}">Saisonmanager-Zeit verwenden</button></div>`;
  return html;
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
  // Wer an der aktuellen Stelle im Tor steht
  const gi = document.getElementById('goalieInfo');
  if (gi) {
    const names = teamNames();
    const text = 'Im Tor: ' + ['home', 'guest'].map(s => { const nr = goalieAt(s, t); return `${names[s]} ${nr != null ? '#' + nr : '?'}`; }).join(' · ');
    if (gi.textContent !== text) gi.textContent = text;
  }
}

export function showPlayerMessage(msg) {
  const el = $('#playerEmpty'); el.textContent = msg; el.hidden = false;
}

// Hinweis zum Analyse-Export: was in den Dateien landet
function renderClipNote() {
  const clips = buildClips();
  const count = kind => clips.filter(c => c.kind === kind).length;
  const scenes = count('goal') + count('penalty') + count('timeout') + count('tag'), periods = count('period'), pp = count('powerplay');
  const n = $('#clipNote');
  n.textContent = clips.length
    ? `Im Export: ${scenes} Szene(n), ${periods} Drittel und ${pp} Überzahlphase(n), jeweils auch als Unterzahl des Gegners. Szenen ohne Zeit oder „nicht im Video“ fehlen.`
    : 'Noch nichts zu exportieren. Setze zuerst Drittelgrenzen oder Ereignisse.';
  for (const id of ['#xmlBtn', '#csvBtn', '#edlBtn']) $(id).disabled = !clips.length;
}

// ===== Eigene Tags =====
const teamNames = () => ({ home: describeTeam('home'), guest: describeTeam('guest') });
const seg = (attr, opts, current) => opts.map(([k, l]) =>
  `<button data-${attr}="${k}" aria-pressed="${current === k}">${esc(l)}</button>`).join('');

function renderTagBar() {
  const names = teamNames(), team = ui.tagTeam;
  const groups = CATALOG.map((c, i) => {
    let buttons;
    if (c.phase) buttons = `<button class="tagbtn" data-tag="${c.key}">${openPhase(c.key, team) ? 'beenden' : 'Start'}</button>`;
    else if (c.outcomes) buttons = c.outcomes.map(([k, l]) => `<button class="tagbtn" data-tag="${c.key}" data-outcome="${k}">${esc(fill(l, names))}</button>`).join('');
    else if (c.key === 'goalie') buttons = `<button class="tagbtn" data-tag="${c.key}">Wechsel ab hier</button>`;
    else if (c.places) buttons = c.places.map(([k, l]) => `<button class="tagbtn" data-tag="${c.key}" data-place="${k}">${esc(fill(l, names))}</button>`).join('');
    else buttons = `<button class="tagbtn" data-tag="${c.key}">Taggen</button>`;
    return `<div class="code-group"><span class="code-name"><kbd>${i + 1}</kbd> ${esc(c.label)}</span><div class="code-btns">${buttons}</div></div>`;
  }).join('');
  let so = '';
  if (ui.shootout || state.tags.some(isShootout)) {
    const sc = shootoutScore();
    so = `<span class="so-info">Stand ${sc.home}:${sc.guest} nach ${sc.attempts} Versuch${sc.attempts === 1 ? '' : 'en'}, als Nächstes ${esc(names[nextShootoutTeam(team)])}</span>`;
  }
  $('#tagbar').innerHTML = `
    <div class="tagbar-head">
      <span class="lbl">Neue Tags für</span>
      <div class="segbtns">${seg('tagteam', [['home', names.home], ['guest', names.guest]], team)}</div>
      <label class="check"><input type="checkbox" id="shootoutCheck" ${ui.shootout ? 'checked' : ''}> Penaltyschießen</label>
      <span class="so-hint">Nach dem gesetzten Beginn des Penaltyschießens automatisch</span>
      ${so}
      <span id="goalieInfo" class="goalie-info"></span>
    </div>
    <div class="codes">${groups}</div>
    ${tagEditor(names)}`;
}

// Nachtragsleiste: Team, Ergebnis, Ort, Spieler und Kommentar zum gewählten Tag
function tagEditor(names) {
  const tag = ui.tagId && findTag(ui.tagId);
  if (!tag) return '';
  const def = codeOf(tag.code), rows = [];
  if (!def.teamFromOutcome) {
    const opts = [['home', names.home], ['guest', names.guest]];
    if (def.teamOptional) opts.push(['', 'ohne Team']);
    rows.push(['Team', seg('edit-team', opts, tag.team || '')]);
  }
  if (def.outcomes) rows.push(['Ergebnis', seg('edit-outcome', def.outcomes.map(([k, l]) => [k, fill(l, names)]), tag.outcome)]);
  if (def.places) rows.push(['Ort', seg('edit-place', def.places.map(([k, l]) => [k, fill(l, names)]), tag.place)]);
  if (def.key === 'faceoff') {
    const adv = faceoffAdvantage(tag);
    if (adv) rows.push(['Vorteil', `<span class="te-info">${esc(names[adv])}${tag.team ? (tag.team === adv ? ' – mit Vorteil gewonnen' : ' – gegen den Vorteil gewonnen') : ''}</span>`]);
  }
  const sides = def.players === 'both' ? ['home', 'guest'] : def.players && tag.team ? [tag.team] : [];
  for (const side of sides) {
    const byNr = (a, b) => a.trikot_number - b.trikot_number;
    const all = ((state.game.players || {})[side] || []).filter(p => p.trikot_number != null).sort(byNr);
    // Beim Torhüter zuerst die Torhüter laut Kader, dahinter abgesetzt alle übrigen (Ersatz im Tor)
    const gks = def.goalieOnly ? goalkeepers(side).sort(byNr) : [];
    const roster = gks.length ? [...gks, ...all.filter(p => !p.goalkeeper)] : all;
    const chips = roster.map(p => `<button class="chip${gks.length && !p.goalkeeper ? ' minor' : ''}" data-edit-player="${side}:${p.trikot_number}" aria-pressed="${tag.players[side] === p.trikot_number}" title="${esc(personLabel(side, p.trikot_number))}">${p.trikot_number}</button>`).join('');
    rows.push([def.players === 'both' ? `Spieler ${names[side]}` : def.goalieOnly ? 'Torhüter' : 'Spieler', chips || '<span class="te-info">Kein Kader im Saisonmanager</span>']);
  }
  if (def.comment) rows.push(['Kommentar', `<input type="text" data-edit-comment value="${esc(tag.comment)}" placeholder="optional" maxlength="300">`]);
  if (def.phase) rows.push(['Ende', tag.end != null ? `<span class="te-info">${fmt(tag.end)}</span> <button data-tagact="endnow">Auf aktuelle Zeit setzen</button>` : '<button data-tagact="endnow">Jetzt beenden</button>']);
  const title = [def.label, tag.outcome && outcomeLabel(def, tag.outcome, names)].filter(Boolean).join(' · ');
  return `
    <div class="tag-editor">
      <div class="te-head">
        <strong>${esc(title)}</strong> <span class="te-time">bei ${fmt(tag.v)}</span>
        <span class="te-actions">
          <button data-tagact="nudge" data-d="-1">−1 s</button><button data-tagact="nudge" data-d="1">+1 s</button>
          <button data-tagact="seek">Ansehen</button><button data-tagact="delete" class="danger">Löschen</button>
          <button data-tagact="close" aria-label="Nachtrag schließen">✕</button>
        </span>
      </div>
      ${rows.map(([l, c]) => `<div class="te-row"><span class="te-lbl">${esc(l)}</span><div class="te-ctl">${c}</div></div>`).join('')}
    </div>`;
}

function renderTagList() {
  const names = teamNames();
  if (ui.mode === 'sync' && ui.sideTab !== 'events') ui.sideTab = 'events';
  $('#tagCount').textContent = state.tags.length ? `(${state.tags.length})` : '';
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === ui.sideTab)));
  $('#events').hidden = ui.sideTab !== 'events';
  $('#progress').hidden = ui.sideTab !== 'events';
  $('#tagPanel').hidden = ui.sideTab !== 'tags';
  $('#statsPanel').hidden = ui.sideTab !== 'stats';
  if (ui.sideTab === 'stats') renderStats();
  if (!state.tags.length) { $('#tagList').innerHTML = '<li class="empty">Noch keine Tags. Tagge über die Leiste unter dem Video.</li>'; return; }
  $('#tagList').innerHTML = state.tags.map(t => {
    const def = codeOf(t.code);
    const main = [def.label, t.outcome && outcomeLabel(def, t.outcome, names), t.place && placeLabel(def, t.place, names)].filter(Boolean).join(' · ');
    const players = ['home', 'guest'].filter(s => t.players[s] != null).map(s => personLabel(s, t.players[s])).join(', ');
    const sub = [t.team ? names[t.team] : '', players, isShootout(t) ? 'Penaltyschießen' : '', def.phase ? (t.end != null ? `bis ${fmt(t.end)}` : 'läuft') : '', t.comment].filter(Boolean).join(' · ');
    return `<li class="tagrow ${t.team || ''} ${t.id === ui.tagId ? 'sel' : ''}">
      <button data-act="selecttag" data-id="${t.id}">
        <span class="tr-time">${fmt(t.v)}</span>
        <span><span class="tr-main">${esc(main)}</span>${sub ? `<br><span class="tr-sub">${esc(sub)}</span>` : ''}</span>
      </button><button class="tr-link" data-act="linktag" data-id="${t.id}" title="${linkLabel()}" aria-label="${linkLabel()}">${LINK_ICON}</button><button class="tr-del" data-act="deltag" data-id="${t.id}" data-modes="analysis" title="Tag löschen" aria-label="Tag löschen">✕</button></li>`;
  }).join('');
}

// ===== Statistik =====
function renderStats() {
  const scope = ui.statScope, periods = statPeriods();
  const { rows, stats, names } = statRows(scope);
  const scopes = [['all', 'Gesamt'], ...periods.map(p => [String(p), periodTitle(p, true)])];
  let completeHtml;
  if (scope === 'all') {
    const done = t => periods.filter(p => state.complete[p] && state.complete[p][t]).length;
    completeHtml = `<p class="note">Schüsse vollständig erfasst: ${['home', 'guest'].map(t => `${esc(names[t])} ${done(t)} von ${periods.length} Abschnitten`).join(' · ')}. Abhaken je Drittel.</p>`;
  } else {
    completeHtml = `<div class="complete">Schüsse vollständig erfasst: ${['home', 'guest'].map(t =>
      `<label class="check"><input type="checkbox" data-complete="${t}" ${state.complete[scope] && state.complete[scope][t] ? 'checked' : ''} ${ui.mode === 'view' ? 'disabled' : ''}> ${esc(names[t])}</label>`).join('')}</div>`;
  }
  const cell = v => (Array.isArray(v) ? v.map(esc).join('<br>') : esc(v));
  const body = rows.map(r => r.length === 1
    ? `<tr class="sec"><th colspan="3">${esc(r[0])}</th></tr>`
    : `<tr><th scope="row">${esc(r[0])}</th><td>${cell(r[1])}</td><td>${cell(r[2])}</td></tr>`).join('');
  $('#statsPanel').innerHTML = `
    <div class="segbtns stat-scopes">${scopes.map(([k, l]) => `<button data-scope="${k}" aria-pressed="${String(scope) === k}">${esc(l)}</button>`).join('')}</div>
    ${completeHtml}
    ${stats.unassigned ? `<p class="note warn">${stats.unassigned} Tag(s) liegen in keinem markierten Drittel und zählen nur in „Gesamt“.</p>` : ''}
    <table class="stats"><thead><tr><th></th><th>${esc(names.home)}</th><th>${esc(names.guest)}</th></tr></thead><tbody>${body}</tbody></table>
    ${plusMinusHtml(scope, names)}
    <div class="export-actions"><button id="copyStatsBtn" class="btn ghost">Als Tabelle kopieren</button></div>
    <p class="note">Tore, Strafen und Überzahl stammen aus dem Saisonmanager, alles Übrige aus deinen Tags. Die Fangquote erscheint erst, wenn die Schüsse des Gegners vollständig erfasst sind.</p>`;
}

// Aufstellung bei einem Tor: Feldspieler beider Teams zum Antippen, Schütze und Vorlage fest
function lineupHtml(e) {
  const names = teamNames(), lineup = lineupOf(e), forced = forcedPlayers(e), base = state.kleinfeld ? 3 : 5;
  const rows = ['home', 'guest'].map(side => {
    const chips = fieldPlayers(side).map(p => {
      const nr = p.trikot_number, on = lineup[side].includes(nr), fixed = forced[side].includes(nr);
      return `<button class="chip" data-lineup="${side}:${nr}" aria-pressed="${on}" ${fixed ? 'disabled title="Schütze oder Vorlage, immer auf dem Feld"' : `title="${esc(personLabel(side, nr))}"`}>${nr}</button>`;
    }).join('');
    const n = lineup[side].length;
    return `<div class="lineup-row"><span class="lr-team">${esc(names[side])} <small class="${n > base + 1 ? 'warn' : ''}">${n} von ${base}</small></span><div class="te-ctl">${chips || '<span class="te-info">Kein Kader</span>'}</div></div>`;
  }).join('');
  const tooMany = ['home', 'guest'].some(side => lineup[side].length > base + 1);
  return `<div class="lineup"><span class="hint">Auf dem Feld (für Plus/Minus). Schütze und Vorlage sind fest markiert.</span>${rows}
    ${tooMany ? `<span class="hint warn">Mehr als ${base + 1} Feldspieler ausgewählt.</span>` : ''}</div>`;
}

function plusMinusHtml(scope, names) {
  const st = computeStats(scope);
  if (!st.pmGoals) return '';
  const note = `<p class="note ${st.pmCovered < st.pmGoals ? 'warn' : ''}">Aufstellung bei ${st.pmCovered} von ${st.pmGoals} zählenden Toren erfasst. Eintragen in der Ereignisliste beim jeweiligen Tor.</p>`;
  const table = side => {
    const list = st.plusMinus[side];
    if (!list.length) return '';
    return `<table class="stats pm"><thead><tr><th>${esc(names[side])}</th><th>+</th><th>−</th><th>±</th></tr></thead><tbody>${
      list.map(x => `<tr><th scope="row">${esc(personLabel(side, x.nr))}</th><td>${x.plus}</td><td>${x.minus}</td><td><strong>${signed(x.net)}</strong></td></tr>`).join('')}</tbody></table>`;
  };
  return `<h3 class="pm-title">Plus/Minus</h3>${note}<div class="pm-grid">${table('home')}${table('guest')}</div>`;
}

// ===== Veröffentlichen =====
const dateTime = iso => (iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

function renderPublish() {
  const el = $('#publishPanel');
  if (!el) return;
  if (!state.videoId) { el.innerHTML = '<p class="note">Zum Veröffentlichen braucht das Spiel ein Video.</p>'; return; }
  const p = ui.published, token = getToken(state.videoId), src = state.syncSource;
  const synced = Object.values(state.periods).some(x => x && x.start != null) || Object.keys(state.placed).length > 0;
  const edited = src ? src.edited : true;
  const parts = [];
  if (p && ui.publishOffer) {
    parts.push(`<div class="pub-offer">Es gibt eine veröffentlichte Version ${p.latest} vom ${esc(dateTime(p.updated))}${src ? ', die neuer ist als dein Stand' : ''}.
      <button class="btn small" data-pub="adopt">Übernehmen</button> <span class="note">ersetzt deinen Sync, deine Tags bleiben.</span></div>`);
  }
  if (!p) {
    parts.push(`<p>Noch nicht veröffentlicht. Veröffentliche deinen Sync, damit alle, die dieses Spiel öffnen, ihn direkt nutzen können.</p>
      <div class="export-actions"><button class="btn" data-pub="publish" ${synced ? '' : 'disabled'}>Sync veröffentlichen</button></div>
      ${synced ? '' : '<p class="note">Setz zuerst mindestens einen Anpfiff.</p>'}`);
  } else if (token) {
    parts.push(`<p>Veröffentlicht · Version ${p.latest} vom ${esc(dateTime(p.updated))}. ${edited ? 'Du hast Änderungen, die noch nicht veröffentlicht sind.' : 'Dein Stand entspricht der veröffentlichten Version.'}</p>
      <div class="export-actions"><button class="btn" data-pub="publish" ${edited ? '' : 'disabled'}>Änderungen veröffentlichen</button>
      <button class="btn ghost" data-pub="copykey">Bearbeitungsschlüssel kopieren</button></div>`);
  } else {
    parts.push(`<p>Für dieses Video gibt es einen veröffentlichten Sync (Version ${p.latest} vom ${esc(dateTime(p.updated))}). Ändern kann ihn, wer den Bearbeitungsschlüssel hat.</p>
      <form class="idform pub-key"><input name="key" type="text" placeholder="Bearbeitungsschlüssel einfügen" autocomplete="off" aria-label="Bearbeitungsschlüssel">
      <button class="btn ghost" type="submit">Schlüssel übernehmen</button></form>`);
  }
  if (p) {
    const list = ui.pubVersions;
    parts.push(list == null
      ? '<button class="addanchor" data-pub="versions">Ältere Versionen anzeigen</button>'
      : `<ul class="pub-versions">${list.map(v => `<li>Version ${v.version} · ${esc(dateTime(v.created))} · ${v.periods} Abschnitt(e), ${v.events} Ereignisse
          <button class="btn small ghost" data-pub="loadversion" data-v="${v.version}">Laden</button></li>`).join('')}</ul>`);
  }
  parts.push('<p class="note">Veröffentlicht werden nur Drittelgrenzen und Positionen der Saisonmanager-Ereignisse, keine Tags und keine Namen.</p>');
  el.innerHTML = parts.join('');
}
