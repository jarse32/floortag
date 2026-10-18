// ===== Zustand =====
// Wird pro Spiel und Video in localStorage gespeichert (siehe storage.js)
export const state = {
  game: null,
  videoId: null,
  periodLen: 1200,     // Drittellänge in Sekunden
  otLen: 600,          // Verlängerung in Sekunden
  pauseLen: 600,       // Drittelpause in Sekunden
  leadIn: 8,           // Vorlauf für Kapitelmarken und Clips in Sekunden
  leadOut: 5,          // Nachlauf für Clips im Analyse-Export in Sekunden
  fps: 25,             // Bildrate des Videos für die Schnittliste (EDL)
  edlScope: 'goal',    // Inhalt der Schnittliste, siehe EDL_SCOPES in export.js
  kleinfeld: false,    // Kleinfeld: max. 1 Strafe gleichzeitig, 3 Feldspieler
  includePenalties: true,
  hideYouth: true,
  periods: {},         // { 1: { start, end }, ... } in Videosekunden
  placed: {},          // { event_id: videoSec } manuell gesetzte Ereignisse = Ankerpunkte
  anchors: {},         // { 2: [{ g, v }, ...] } freie Anker ohne Ereignis, z. B. vor und nach einer Streamlücke
  missing: {},         // { event_id: true } Ereignisse, die nicht im Video zu sehen sind
  gs: {},              // { event_id: Spielsekunde im Abschnitt }
  counterLen: 10,      // Dauer eines Konter-Clips in Sekunden
  tags: [],            // eigene Tags (Analyse-Ebene), getrennt vom Sync gespeichert, siehe tags.js
  complete: {},        // { 1: { home: true, guest: false } } Schüsse vollständig erfasst, gehört zur Tag-Ebene
  lineups: {}          // { event_id: { home: [nr], guest: [nr] } } auf dem Feld bei Toren, gehört zur Tag-Ebene
};

// Zustand der Oberfläche, wird nicht gespeichert
export const ui = {
  selectedId: null,
  rate: 1,             // Abspieltempo, bleibt beim Videowechsel, wird nicht gespeichert
  mode: 'sync',        // Modus: view (Ansehen) | sync | analysis
  jumpFrom: null,      // Videozeit vor dem Sprung zu einem Ereignis (für „Dort setzen“)
  tagTeam: 'home',     // Team für neue Tags
  tagId: null,         // Tag in der Nachtragsleiste
  shootout: false,     // Modus Penaltyschießen
  sideTab: 'events',   // Reiter der rechten Spalte: events | tags | stats
  statScope: 'all',    // Statistik: 'all' oder Abschnittsnummer
  anchorForm: null     // { p, v } offenes Formular „Freien Anker setzen“
};
