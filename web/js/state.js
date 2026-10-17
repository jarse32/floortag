// ===== Zustand =====
// Wird pro Spiel und Video in localStorage gespeichert (siehe storage.js)
export const state = {
  game: null,
  videoId: null,
  periodLen: 1200,     // Drittellänge in Sekunden
  otLen: 600,          // Verlängerung in Sekunden
  pauseLen: 600,       // Drittelpause in Sekunden
  leadIn: 8,           // Vorlauf für Kapitelmarken in Sekunden
  includePenalties: true,
  hideYouth: true,
  periods: {},         // { 1: { start, end }, ... } in Videosekunden
  placed: {},          // { event_id: videoSec } manuell gesetzte Ereignisse = Ankerpunkte
  anchors: {},         // { 2: [{ g, v }, ...] } freie Anker ohne Ereignis, z. B. vor und nach einer Streamlücke
  missing: {},         // { event_id: true } Ereignisse, die nicht im Video zu sehen sind
  gs: {}               // { event_id: Spielsekunde im Abschnitt }
};

// Zustand der Oberfläche, wird nicht gespeichert
export const ui = {
  selectedId: null,
  anchorForm: null     // { p, v } offenes Formular „Freien Anker setzen“
};
