// ===== Hilfsfunktionen ohne Abhängigkeiten =====

// „m:ss“ aus dem Saisonmanager in Sekunden
export function parseTime(t) {
  const [m, s] = String(t || '0:00').split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
}

// Videozeit für die Anzeige, ab einer Stunde mit Stunden
export function fmt(sec) {
  if (sec == null || isNaN(sec)) return '–';
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

// Spielzeit im Abschnitt als „mm:ss“
export function fmtGame(g) {
  return `${String(Math.floor(g / 60)).padStart(2, '0')}:${String(g % 60).padStart(2, '0')}`;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Liest die Video-ID aus einem YouTube-Link oder nimmt eine nackte ID
export function extractVideoId(input) {
  if (!input) return null;
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1, 12);
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const m = u.pathname.match(/\/(live|embed|shorts)\/([\w-]{11})/);
    if (m) return m[2];
  } catch (e) { /* kein gültiger Link */ }
  return null;
}
