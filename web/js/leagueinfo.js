// ===== Ligadaten: Drittellänge und Verlängerung =====
// Der Saisonmanager liefert sie pro Liga (periods, period_length, overtime_length in Minuten).
// state.lengthSource: 'league' (aus den Ligadaten), 'manual' (von Hand eingestellt) oder null (älterer Stand)
import { state } from './state.js';

// Gültige Längen in Sekunden aus den Ligadaten, sonst null
export function leagueLengths(info) {
  if (!info) return null;
  const pl = Number(info.period_length), ol = Number(info.overtime_length);
  if (!Number.isFinite(pl) || pl < 5 || pl > 30) return null;
  return {
    periodLen: Math.round(pl * 60),
    otLen: Number.isFinite(ol) && ol >= 1 && ol <= 20 ? Math.round(ol * 60) : null,
    periods: Number.isInteger(info.periods) ? info.periods : null
  };
}

// Ligadaten nur übernehmen, wenn die Länge nicht von Hand eingestellt wurde
export function shouldApplyLeague({ hadLocal, lengthSource, shared }) {
  if (shared) return false;
  return !hadLocal || lengthSource !== 'manual';
}

// Übernimmt die Längen; true, wenn sich etwas geändert hat
export function applyLeagueLengths(lengths) {
  if (!lengths) return false;
  const before = [state.periodLen, state.otLen, state.lengthSource].join();
  state.periodLen = lengths.periodLen;
  if (lengths.otLen) state.otLen = lengths.otLen;
  state.lengthSource = 'league';
  return before !== [state.periodLen, state.otLen, state.lengthSource].join();
}

// Ligadaten über den Proxy, im Browser einen Tag zwischengespeichert
const TTL = 24 * 3600 * 1000;
export async function fetchLeagueInfo(id) {
  if (!id) return null;
  const key = `floortag-league:${id}`;
  try {
    const cached = JSON.parse(localStorage.getItem(key) || 'null');
    if (cached && Date.now() - cached.at < TTL) return cached.info;
  } catch (e) { /* ignorieren */ }
  const res = await fetch(`api/league.php?id=${encodeURIComponent(id)}`);
  if (!res.ok || !(res.headers.get('Content-Type') || '').includes('application/json')) return null;
  const info = (await res.json()).league || null;
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), info })); } catch (e) { /* ohne Zwischenspeicher */ }
  return info;
}
