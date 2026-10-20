// ===== Spielplan nach Spieltagen (für die Übersicht) =====
// Reine Funktionen ohne DOM, damit sie sich testen lassen.

const when = g => `${g.date || ''} ${g.time || ''}`;

// Spiele nach Spieltag gruppieren: [{ day, title, games, played, from, to }]
export function groupByDay(games, titles = {}) {
  const map = new Map();
  for (const g of games) {
    const day = Number.isInteger(g.day) ? g.day : 0;
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(g);
  }
  return [...map.entries()].sort((a, b) => (a[0] || 999) - (b[0] || 999)).map(([day, list]) => {
    list.sort((a, b) => when(a).localeCompare(when(b)));
    const dates = list.map(g => g.date).filter(Boolean).sort();
    return {
      day, title: titles[day] || titles[String(day)] || (day ? `${day}. Spieltag` : 'Ohne Spieltag'),
      games: list, played: list.filter(g => g.result).length,
      from: dates[0] || null, to: dates[dates.length - 1] || null
    };
  });
}

// Spieltag, der zuerst gezeigt wird: der letzte mit mindestens einem Ergebnis, sonst der erste
export function defaultDay(groups) {
  const played = groups.filter(g => g.played > 0);
  const pick = played.length ? played[played.length - 1] : groups[0];
  return pick ? pick.day : null;
}

// Zeitraum eines Spieltags kurz: „10.10.“ oder „10.–11.10.“ oder „31.10.–1.11.“
export function dayRange(from, to) {
  if (!from) return '';
  const [, fm, fd] = from.split('-').map(Number);
  const [, tm, td] = (to || from).split('-').map(Number);
  if (from === to || !to) return `${fd}.${fm}.`;
  return fm === tm ? `${fd}.–${td}.${tm}.` : `${fd}.${fm}.–${td}.${tm}.`;
}
