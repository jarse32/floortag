// ===== Link zu einer Szene =====
// ?spiel=58665&video=…&t=4523&e=…&modus=ansehen öffnet das Spiel im Modus Ansehen ab dieser Videozeit.
// Im Link stehen nur Spiel, Video, Startzeit und Ereignis-ID: keine Namen, keine Tags.

const VIDEO_ID = /^[\w-]{11}$/;

// t ist die Startzeit in Videosekunden (Szene minus Vorlauf)
export function sceneUrl(base, { game, video = null, t, event = null }) {
  const url = new URL(base);
  url.search = ''; url.hash = '';
  url.searchParams.set('spiel', String(game));
  if (video && VIDEO_ID.test(video)) url.searchParams.set('video', video);
  url.searchParams.set('t', String(Math.max(0, Math.round(t))));
  if (event != null) url.searchParams.set('e', String(event));
  url.searchParams.set('modus', 'ansehen');
  return url.toString();
}

// Link zu einem Spiel, mit Video, wenn bekannt (z. B. wenn im Saisonmanager kein YouTube-Link steht)
export function gameUrl(game, video = null) {
  const v = video && VIDEO_ID.test(video) ? `&video=${video}` : '';
  return `./?spiel=${encodeURIComponent(game)}${v}`;
}

// Video aus der Adresse, auch ohne Szenenzeit (?spiel=…&video=…)
export function parseVideoParam(search) {
  const v = new URLSearchParams(search).get('video');
  return v && VIDEO_ID.test(v) ? v : null;
}

// Liest die Szene aus der Adresse; ohne gültiges t gibt es keine Szene
export function parseScene(search) {
  const p = new URLSearchParams(search);
  const t = p.get('t');
  if (t == null || !/^\d{1,6}$/.test(t)) return null;
  const video = p.get('video'), e = p.get('e');
  return {
    t: Number(t),
    video: video && VIDEO_ID.test(video) ? video : null,
    event: e && /^\d{1,9}$/.test(e) ? Number(e) : null
  };
}

// Entfernt die Szenen-Angaben, damit Neuladen nicht wieder springt
export function stripScene(href) {
  const url = new URL(href);
  ['t', 'e', 'video'].forEach(k => url.searchParams.delete(k));
  return url.toString();
}

// Auf Handy und Tablet öffnet sich das Teilen-Menü, sonst wird kopiert
export function canShareNative() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function' &&
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}
