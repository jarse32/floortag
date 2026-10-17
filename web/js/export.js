// ===== Export für Videoanalyse und Schnitt =====
// Gemeinsames Clip-Modell: jede Szene hat Code, Start, Ende (Videosekunden) und Labels.
// Ereignisse aus dem Saisonmanager bekommen Vor- und Nachlauf, Drittel sind Phasen mit Dauer.
// Spätere eigene Tags und Phasen (Etappe 5) werden einfach weitere Clips.
import { state } from './state.js';
import { fmtGame } from './format.js';
import { events, periodList, periodTitle, teamShort, personLabel } from './game.js';
import { timeOf } from './sync.js';

// Farben der Zeilen (0–255), für Sportscode auf 0–65535 umgerechnet
const COLORS = { home: [29, 106, 75], guest: [45, 85, 132], period: [140, 150, 145], timeout: [181, 118, 27] };

export function buildClips() {
  const clips = [];
  for (const p of periodList()) {
    const st = state.periods[p] || {};
    if (st.start != null && st.end != null && st.end > st.start) {
      clips.push({ code: 'Drittel', kind: 'period', color: COLORS.period, start: st.start, end: st.end,
        labels: [['Abschnitt', periodTitle(p)]] });
    }
  }
  for (const e of events()) {
    const t = timeOf(e);
    if (t == null || t < 0) continue; // ohne Zeit, nicht im Video oder vor Streambeginn
    const p = Math.floor(e.period), team = teamShort(e.event_team);
    const labels = [['Team', team], ['Abschnitt', periodTitle(p)]];
    if (p !== 5) labels.push(['Spielzeit', fmtGame(state.gs[e.event_id])]);
    let code, color = COLORS[e.event_team];
    if (e.event_type === 'goal') {
      code = `Tor ${team}`;
      labels.push(['Spielstand', `${e.home_goals}:${e.guest_goals}`], ['Spieler', personLabel(e.event_team, e.number)]);
      if (e.assist) labels.push(['Vorlage', personLabel(e.event_team, e.assist)]);
      if (e.goal_type && e.goal_type !== 'regular') labels.push(['Torart', e.goal_type_string]);
    } else if (e.event_type === 'penalty') {
      code = `Strafe ${team}`;
      labels.push(['Spieler', personLabel(e.event_team, e.number)], ['Strafe', e.penalty_type_string], ['Grund', e.penalty_reason_string]);
    } else {
      code = `Auszeit ${team}`;
      color = COLORS.timeout;
    }
    clips.push({ code, kind: e.event_type, color, eventId: e.event_id,
      start: Math.max(0, t - state.leadIn), end: t + state.leadOut,
      labels: labels.filter(([, v]) => v) });
  }
  clips.sort((a, b) => a.start - b.start || a.end - b.end);
  clips.forEach((c, i) => { c.id = i + 1; });
  return clips;
}

// ===== Sportscode-XML (Hudl Sportscode, Nacsport, Spiideo Perform) =====
const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sec = n => (Math.round(n * 100) / 100).toFixed(2);

export function toSportscodeXml(clips) {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<file>', '  <ALL_INSTANCES>'];
  for (const c of clips) {
    out.push('    <instance>', `      <ID>${c.id}</ID>`, `      <start>${sec(c.start)}</start>`, `      <end>${sec(c.end)}</end>`, `      <code>${xml(c.code)}</code>`);
    for (const [group, text] of c.labels) out.push(`      <label><group>${xml(group)}</group><text>${xml(text)}</text></label>`);
    out.push('    </instance>');
  }
  out.push('  </ALL_INSTANCES>', '  <ROWS>');
  const seen = new Set();
  for (const c of clips) {
    if (seen.has(c.code)) continue;
    seen.add(c.code);
    const [r, g, b] = c.color.map(v => v * 257);
    out.push(`    <row><code>${xml(c.code)}</code><R>${r}</R><G>${g}</G><B>${b}</B></row>`);
  }
  out.push('  </ROWS>', '</file>', '');
  return out.join('\n');
}

// ===== CSV für Tabellenkalkulation (Semikolon, Dezimalkomma) =====
const LABEL_COLUMNS = ['Team', 'Abschnitt', 'Spielzeit', 'Spielstand', 'Spieler', 'Vorlage'];
const DETAIL_GROUPS = ['Torart', 'Strafe', 'Grund'];

function hms(n) {
  const s = Math.round(n), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function cell(v) {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(clips) {
  const head = ['Nr', 'Code', 'Start', 'Ende', 'Start (s)', 'Ende (s)', ...LABEL_COLUMNS, 'Details'];
  const rows = clips.map(c => {
    const l = Object.fromEntries(c.labels);
    return [c.id, c.code, hms(c.start), hms(c.end), sec(c.start).replace('.', ','), sec(c.end).replace('.', ','),
      ...LABEL_COLUMNS.map(k => l[k]), DETAIL_GROUPS.map(k => l[k]).filter(Boolean).join(', ')];
  });
  return [head, ...rows].map(r => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

// ===== Schnittliste (CMX3600-EDL) für DaVinci Resolve und andere Schnittprogramme =====
// Jeder Clip wird ein Schnitt aus dem Quellvideo; die Timeline beginnt bei 01:00:00:00.
export const EDL_SCOPES = {
  goal: { label: 'Tore', kinds: ['goal'] },
  goalPenalty: { label: 'Tore und Strafen', kinds: ['goal', 'penalty'] },
  all: { label: 'Alle Ereignisse', kinds: ['goal', 'penalty', 'timeout'] }
};

// EDL ist ein altes Format: Kommentare nur in ASCII (ü → ue, ß → ss, übrige Akzente weg)
function ascii(s) {
  return String(s).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
}

function timecode(frames, fps) {
  const ff = frames % fps, total = Math.floor(frames / fps);
  const p = n => String(n).padStart(2, '0');
  return `${p(Math.floor(total / 3600))}:${p(Math.floor(total % 3600 / 60))}:${p(total % 60)}:${p(ff)}`;
}

export function toEdl(clips, { fps = 25, title = 'FloorTag', clipName = 'video.mp4', scope = 'goal' } = {}) {
  const kinds = (EDL_SCOPES[scope] || EDL_SCOPES.goal).kinds;
  const out = [`TITLE: ${title}`, 'FCM: NON-DROP FRAME', ''];
  let rec = 3600 * fps, n = 0;
  for (const c of clips) {
    if (!kinds.includes(c.kind)) continue;
    const srcIn = Math.round(c.start * fps), srcOut = Math.round(c.end * fps), len = srcOut - srcIn;
    if (len <= 0) continue;
    n++;
    out.push(`${String(n).padStart(3, '0')}  AX       V     C        ${timecode(srcIn, fps)} ${timecode(srcOut, fps)} ${timecode(rec, fps)} ${timecode(rec + len, fps)}`);
    out.push(`* FROM CLIP NAME: ${clipName}`);
    const detail = c.labels.filter(([g]) => ['Spielstand', 'Spieler'].includes(g)).map(([, t]) => t).join(' ');
    out.push(`* COMMENT: ${ascii(detail ? `${c.code} - ${detail}` : c.code)}`);
    out.push('');
    rec += len;
  }
  return { text: out.join('\n'), count: n };
}
