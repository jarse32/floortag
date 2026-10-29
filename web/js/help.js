// ===== Anleitung je Modus =====
// Wird beim ersten Mal je Modus automatisch gezeigt (gemerkt im Browser) und ist jederzeit über „?“ erreichbar.
// target: CSS-Selektor, zu dem „Zeigen“ scrollt und den es kurz hervorhebt.

export const GUIDES = {
  sync: {
    label: 'Sync',
    intro: 'Im Modus Sync verknüpfst du die Ereignisse aus dem Saisonmanager mit den Stellen im Video. Daraus entstehen springbare Szenen und YouTube-Kapitel.',
    steps: [
      { title: 'Video freigeben', text: 'Klick auf „YouTube-Video laden“. Erst dann wird das Video von YouTube geladen.', target: '.player-wrap' },
      { title: 'Drittelgrenzen setzen', text: 'Spul zum Anpfiff des 1. Drittels und klick bei „Anpfiff“ auf „Jetzt“. Genauso beim Drittelende. Für die folgenden Drittel schlägt FloorTag Zeiten vor, die du mit „Vorschlag ansehen“ prüfst.', target: '#periods' },
      { title: 'Ereignisse prüfen', text: 'Klick auf ein Tor oder eine Strafe springt zur geschätzten Stelle. Passt sie nicht, spul zur richtigen Stelle und klick auf „Auf aktuelle Videozeit setzen“. Warst du schon vorher an der richtigen Stelle, reicht „Dort setzen“.', target: '#events' },
      { title: 'Feinjustieren', text: 'Mit −1 s / +1 s oder dem Regler rückst du ein Ereignis zurecht. Jedes gesetzte Ereignis verbessert die Schätzung der übrigen.', target: '#events' },
      { title: 'Veröffentlichen', text: 'Unter „Veröffentlichen“ machst du deinen Sync für alle verfügbar, die dieses Spiel öffnen. Den Bearbeitungsschlüssel merkt sich dein Browser; für ein zweites Gerät oder einen Co-Trainer kopierst du ihn.', target: '#publishPanel' },
      { title: 'Kapitel und Link', text: 'Unter „Export“ kopierst du die YouTube-Kapitel für die Videobeschreibung. Mit „Link teilen“ schickst du Spiel und Szenen an andere.', target: '#chapters' }
    ],
    tips: [
      'Tastatur: K oder Leertaste Play/Pause, J/L ±5 s, H/Ö ±30 s, Komma/Punkt ±1 s, − / + Tempo, Enter setzt das gewählte Ereignis.',
      'Streamlücke? Setz in der Drittelkarte je einen „freien Anker“ vor und nach der Lücke. Ereignisse in der Lücke markierst du als „Nicht im Video“.',
      'Bei einer Strafe steht die Uhr. In der Zeile der Strafe setzt du, wann das Spiel in Über- und Unterzahl weitergeht; dort beginnen Clips und Szenen. Ohne gesetzten Beginn schätzt FloorTag (Einstellung, danach der Durchschnitt der gesetzten).',
      'Spielzeit im Saisonmanager falsch? Setz das Ereignis an die richtige Stelle. Passt sie nicht zur Reihenfolge, bietet FloorTag an, die Spielzeit zu korrigieren (markiert mit *).',
      'Eine einzelne Szene verschicken: Ereignis antippen und „Link zur Szene kopieren“ (auf dem Handy „Szene teilen“). Der Link öffnet das Spiel im Modus Ansehen ab der Szene.',
      'Unter „Übersicht“ siehst du alle Spiele dieses Browsers mit ihrer Stufe und den Spielplan einer Liga.',
      'Dein Stand wird automatisch in diesem Browser gespeichert, nicht auf anderen Geräten. Fürs Handy oder für andere schickst du einen Link über „Link teilen“. „Sync speichern“ legt zusätzlich eine Datei an.'
    ]
  },
  analysis: {
    label: 'Analyse',
    intro: 'Im Modus Analyse taggst du zusätzliche Szenen wie Torschüsse, Bullys oder Konter, siehst die Statistik und exportierst Clips für Videoanalyse und Schnitt.',
    steps: [
      { title: 'Zuerst die Drittelgrenzen', text: 'Setz im Modus Sync die Drittelgrenzen. Dann ordnet FloorTag Tags den Dritteln zu und die Statistik stimmt je Drittel.', target: '#periods' },
      { title: 'Taggen', text: 'Wähl bei „Neue Tags für“ das Team und klick beim Schauen auf den passenden Button, z. B. „Torschuss · aufs Tor“. Getaggt wird die aktuelle Videostelle, das Video läuft weiter. Tasten 1–9 gehen auch.', target: '#tagbar' },
      { title: 'Nachtragen', text: 'Nach jedem Tag erscheint darunter die Nachtragsleiste: Spieler per Rückennummer, Ort, Kommentar, ±1 s. Das geht auch später über den Reiter „Tags“. Löschen: ✕ in der Tag-Liste oder Entf beim ausgewählten Tag, danach lässt sich das rückgängig machen.', target: '#tagbar' },
      { title: 'Torhüter', text: '„Torhüter raus“ startest und beendest du per Klick. Bei einem Torhüterwechsel setzt du „Torhüter · Wechsel ab hier“. Saves werden dem Torhüter zugeordnet, der gerade im Tor steht.', target: '#tagbar' },
      { title: 'Statistik', text: 'Der Reiter „Statistik“ zeigt Schüsse, Fangquote, Bullys und Überzahl je Drittel. Hak „Schüsse vollständig erfasst“ ab, sobald du alle Schüsse eines Drittels getaggt hast, erst dann erscheint die Fangquote.', target: '[data-tab="stats"]' },
      { title: 'Plus/Minus', text: 'Klick in der Ereignisliste auf ein Tor und tipp unter „Auf dem Feld“ die Spieler an. Schütze und Vorlage sind schon markiert.', target: '#events' },
      { title: 'Export und Teilen', text: 'Unter „Videoanalyse und Schnitt“ lädst du Sportscode-XML (Nacsport, Spiideo), CSV oder eine Schnittliste für DaVinci Resolve herunter. „Link teilen“ öffnet Spiel und Tags für andere zum Ansehen.', target: '.export.analysis' }
    ],
    tips: [
      'Jede Szene wird einmal aus Sicht des handelnden Teams getaggt. Die Gegenseite (Save, Block, Ballverlust …) entsteht im Export automatisch.',
      'Penaltyschießen: Setz im Sync den Beginn des Penaltyschießens, dann zählt jeder Penalty-Tag danach als Versuch (ohne gesetzten Beginn das Häkchen „Penaltyschießen“ setzen). Pro Versuch V = verwandelt, X = nicht verwandelt, das Team wechselt automatisch. Der Saisonmanager kennt nur das entscheidende Tor, alle Versuche taggst du selbst.',
      'Das Kettensymbol in der Tag-Liste kopiert einen Link zur Szene des Tags. Wer ihn öffnet, sieht das Video ab dieser Stelle, aber nicht deine Tags; dafür gibt es „Link teilen“.',
      'Unter „Export“ wählst du, welche Tags zusätzlich als YouTube-Kapitel erscheinen: verschossene Penaltys, Penaltyschießen, Torhüter raus, besondere Ereignisse.',
      'Tags liegen nur in deinem Browser. Sichere sie zwischendurch über „Tags speichern“ im Reiter „Tags“.'
    ]
  },
  view: {
    label: 'Ansehen',
    intro: 'Im Modus Ansehen schaust du dir die Szenen eines Spiels an. Verändern lässt sich hier nichts.',
    steps: [
      { title: 'Video freigeben', text: 'Klick auf „YouTube-Video laden“.', target: '.player-wrap' },
      { title: 'Szenen abspielen', text: 'Klick auf ein Tor, eine Strafe oder einen Tag in der Ereignis- bzw. Tag-Liste. Das Video springt kurz vor die Szene und spielt sie ab.', target: '#events' },
      { title: 'Tags und Statistik', text: 'In den Reitern „Tags“ und „Statistik“ findest du die zusätzlichen Szenen und Auswertungen, sofern sie getaggt wurden.', target: '.tabs' },
      { title: 'Tempo', text: 'Mit 0,5× bis 2× siehst du Szenen langsamer oder schneller.', target: '.rates' }
    ],
    tips: ['Tastatur: K oder Leertaste Play/Pause, J/L ±5 s, H/Ö ±30 s, − / + Tempo, N nächstes Ereignis.', 'Szenen und Tags sind nur dort zu sehen, wo sie gesetzt wurden, oder über einen geteilten Link. Fehlt beides, bekommst du einen Hinweis in der Ereignisliste.', 'Eine Szene weiterschicken: Ereignis antippen und „Link zur Szene kopieren“ bzw. „Szene teilen“, bei Tags über das Kettensymbol.', 'Alle Szenen eines Teams über die ganze Saison, etwa alle Überzahlspiele oder alle Tore und Vorlagen eines Spielers, findest du oben unter „Szenen“. Dort erscheinen alle Spiele mit Sync.']
  }
};

// Wurde die Anleitung für diesen Modus schon automatisch gezeigt?
const KEY = 'floortag:intro-seen';
export function introSeen(mode) {
  try { return !!(JSON.parse(localStorage.getItem(KEY) || '{}')[mode]); } catch (e) { return true; }
}
export function markIntroSeen(mode) {
  try {
    const seen = JSON.parse(localStorage.getItem(KEY) || '{}');
    seen[mode] = true;
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch (e) { /* ohne Speicher erscheint die Anleitung eben erneut */ }
}
