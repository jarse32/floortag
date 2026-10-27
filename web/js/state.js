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
  chapterTags: [],     // eigene Tags als YouTube-Kapitel, Schlüssel aus CHAPTER_TAGS in chapters.js
  hideYouth: true,
  periods: {},         // { 1: { start, end }, ... } in Videosekunden
  placed: {},          // { event_id: videoSec } manuell gesetzte Ereignisse = Ankerpunkte
  anchors: {},         // { 2: [{ g, v }, ...] } freie Anker ohne Ereignis, z. B. vor und nach einer Streamlücke
  missing: {},         // { event_id: true } Ereignisse, die nicht im Video zu sehen sind
  gsFix: {},           // { event_id: Sekunden } korrigierte Spielzeit, wenn der Saisonmanager falsch liegt
  gs: {},              // { event_id: Spielsekunde im Abschnitt }
  counterLen: 10,      // Dauer eines Konter-Clips in Sekunden
  tags: [],            // eigene Tags (Analyse-Ebene), getrennt vom Sync gespeichert, siehe tags.js
  complete: {},        // { 1: { home: true, guest: false } } Schüsse vollständig erfasst, gehört zur Tag-Ebene
  lineups: {},         // { event_id: { home: [nr], guest: [nr] } } auf dem Feld bei Toren, gehört zur Tag-Ebene
  sharedView: false,   // geteilte Ansicht aus einem Link: nur ansehen, nichts im Browser speichern
  syncSource: null,    // { version, edited } Bezug zur veröffentlichten Version, siehe publish.js
  lengthSource: null   // Herkunft von Drittellänge/Verlängerung: 'league' | 'manual' | null, siehe leagueinfo.js
};

// Zustand der Oberfläche, wird nicht gespeichert
export const ui = {
  selectedId: null,
  scene: null,         // { t, video, event } aus einem geöffneten Szenen-Link, bis der Player dorthin gesprungen ist
  outOfOrder: null,    // { id, v, g } Ereignis sollte außerhalb der Reihenfolge liegen: Korrektur der Spielzeit anbieten
  rate: 1,             // Abspieltempo, bleibt beim Videowechsel, wird nicht gespeichert
  mode: 'sync',        // Modus: view (Ansehen) | sync | analysis
  jumpFrom: null,      // Videozeit vor dem Sprung zu einem Ereignis (für „Dort setzen“)
  published: null,     // veröffentlichter Sync dieses Videos (neueste Version) oder null
  leagueInfo: null,    // Ligadaten des geladenen Spiels (Name, Drittellänge …)
  publishOffer: false, // neuere veröffentlichte Version anbieten
  pubVersions: null,   // Liste der veröffentlichten Versionen, wenn aufgeklappt
  tagTeam: 'home',     // Team für neue Tags
  tagId: null,         // Tag in der Nachtragsleiste
  shootout: false,     // Modus Penaltyschießen
  sideTab: 'events',   // Reiter der rechten Spalte: events | tags | stats
  statScope: 'all',    // Statistik: 'all' oder Abschnittsnummer
  anchorForm: null     // { p, v } offenes Formular „Freien Anker setzen“
};
