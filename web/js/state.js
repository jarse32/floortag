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
  gs: {}               // { event_id: Spielsekunde im Abschnitt }
};

// Zustand der Oberfläche, wird nicht gespeichert
export const ui = {
  selectedId: null
};
