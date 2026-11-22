// ===== Einblendung unten links (Präsentieren, später auch beim MP4-Export) =====
// Reine Textfunktionen ohne DOM. Grundlage sind die Clip-Labels aus buildClips,
// dort greift schon der Jugendschutz (Jugendspieler nur mit Rückennummer).

// Kurzes Datum für die Einblendung, z. B. „Sa. 12.10.26“ (selbst gebaut, unabhängig von der Lokalisierung des Browsers)
const DAYS = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
export function shortDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
  if (!m) return '';
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DAYS[dt.getUTCDay()]} ${m[3]}.${m[2]}.${m[1].slice(2)}`;
}

const MAX_COMMENT = 80;
const clip = (t, n) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

// scene: Szene der Seite „Szenen“ (code, labels, date, opp, home), team: Name des gewählten Teams.
// players: Torschütze, Vorlage bzw. bestraften Spieler mit anzeigen.
// Ergebnis: { title: „Heim – Gast · Datum“, line: „Code · Abschnitt Zeit · Stand · Situation …“ }
export function overlayText(scene, team, { players = false } = {}) {
  const l = Object.fromEntries(scene.labels || []);
  const teams = scene.opp ? (scene.home ? [team, scene.opp] : [scene.opp, team]).filter(Boolean).join(' – ') : (team || '');
  const title = [teams, shortDate(scene.date)].filter(Boolean).join(' · ');
  const where = [l.Abschnitt, l.Spielzeit].filter(Boolean).join(' ');
  const parts = [scene.code, where, l.Spielstand, l.Spielsituation || l['Stärke']];
  if (players) parts.push(l.Spieler, l.Vorlage && `Vorlage ${l.Vorlage}`);
  parts.push(l.Ergebnis, l.Kommentar && clip(l.Kommentar, MAX_COMMENT));
  return { title, line: parts.filter(Boolean).join(' · ') };
}
