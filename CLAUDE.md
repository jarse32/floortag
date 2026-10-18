# FloorTag

Browserbasiertes Werkzeug, das Floorball-Spielvideos auf YouTube mit den offiziellen Spieldaten aus dem Saisonmanager (Floorball Deutschland) synchronisiert. Daraus entstehen springbare Szenen, YouTube-Kapitelmarken und später gemeinsam gepflegte Analyse-Tags.

Teil des Floorball-Dashboard-Ökosystems, geplante Adresse: `tag.floorballdashboard.app`. Nicht-kommerzielles Hobbyprojekt.

## Konventionen

- Code-Kommentare, UI-Texte und Commit-Nachrichten auf Deutsch.
- UI-Texte: Satzbau aktiv und konkret, Buttons sagen, was passiert („Jetzt setzen“, „Kapitel kopieren“). Typografische Anführungszeichen („ “) und Apostroph (’) in sichtbarem Text.
- Hell- und Dunkelmodus über CSS-Variablen auf `:root`, Dunkelwerte unter `@media (prefers-color-scheme: dark)`.
- Erst kurz den Ansatz erklären, dann umsetzen. Verbesserungsvorschläge und Alternativen gern proaktiv nennen.
- Datenschutz (DSGVO) ist bei jeder Funktion mitzudenken, siehe eigener Abschnitt.

## Aktueller Stand

Das Frontend liegt in `web/` (native ES-Module, kein Build-Schritt, Aufbau siehe `web/README.md`). Funktionsumfang wie der Prototyp aus Etappen 1 und 2: Saisonmanager-JSON per Drag-and-drop laden, YouTube-Video wird aus `live_stream_link` übernommen, Drittelgrenzen setzen, Ereignisse schätzen und feinjustieren, YouTube-Kapitel und Sync-JSON exportieren. Zwischenstand liegt in `localStorage`. Der ursprüngliche Single-File-Prototyp liegt unverändert in `prototype/` und wird nicht weiterentwickelt.

Start lokal nur über einen Server, nicht per Doppelklick (YouTube blockiert Einbettung von `file://`, Fehler 153). Der PHP-Server liefert Frontend und Proxy zusammen aus:

```bash
php -S localhost:8000 -t web   # im Repo-Wurzelverzeichnis
# dann http://localhost:8000/?spiel=58668
```

Tests ohne Abhängigkeiten und ohne echten Key: `npm test` (Sync-Logik, freie Anker, Kapitel, Sync-Datei, Analyse-Export, Überzahlphasen, Tags; `node --test`) und `npm run test:proxy`. Änderungen an `sync.js`, `game.js` oder `chapters.js` immer mit `npm test` prüfen.

Testfall: Spiel 58668 (2. FBL Herren Nord/West, Baltic Storms – TV Eiche Horn Bremen, 5:4), Video `lfIFpRsE55I`. Die JSON liegt in `fixtures/spiel_58668.json`.

Repo: privat auf GitHub unter `jarse32/floortag`, Branch `main`.

## Etappenplan

0. Datenstruktur verstehen – erledigt.
1. Sync-Prototyp lokal – erledigt, wird getestet.
2. Kapitelmarken-Export – erledigt, wird getestet.
3. **In Arbeit:** Prototyp in sinnvolle Dateien aufteilen (erledigt), API-Proxy als PHP (erledigt, lokal getestet), Spiel per ID laden statt per Datei (erledigt). Online unter `https://tag.floorballdashboard.app` seit 17.10.2026.
4. Backend und gemeinsame Syncs: PocketBase (braucht einen eigenen Server, siehe Hosting), Accounts, ein gemeinsamer Sync pro Video mit Änderungshistorie, Deploy unter `tag.floorballdashboard.app`, geschlossene Beta mit wenigen Vereinen.
5. Analyse-Tags: Code-Panel mit Floorball-Taxonomie und Tastenkürzeln, auch Ereignisse, die nicht im Saisonmanager stehen (z. B. verschossene Penaltys, Save, Block, Konter), dazu Phasen mit Dauer (z. B. Überzahl/Unterzahl), eigene Layer pro Nutzer/Verein, Sichtbarkeit privat/Verein/öffentlich, Export über das bestehende Clip-Modell (Sportscode-XML, CSV, EDL).
6. Anschauen und Vernetzen: Filter, Playlists über mehrere Spiele, Deeplinks auf Szenen, Button „Szenen ansehen“ in der Floorball-Dashboard-App.

## Saisonmanager-API

- Endpunkt: `https://saisonmanager.de/api/v2/games/{id}.json`, Header `X-Api-Key`.
- Der Key kommt aus der Umgebungsvariable `SM_KEY` oder aus `web/api/config.php` (gitignored, auf dem Server per `.htaccess` gesperrt). **Der Key darf nie im Browser, im Repo oder in Logs landen.** Abfragen laufen ausschließlich über den Proxy `web/api/game.php`.
- Bis zum eigenen FloorTag-Key wird übergangsweise der Key des Floorball Dashboard genutzt (mit dem Nutzer abgestimmt).
- Für FloorTag wurde bzw. wird ein eigener Key beantragt, getrennt vom Key der App.
- Ohne Echtzeit-Freigabe liefert die API Live-Daten mit zehn Minuten Verzögerung. Für FloorTag irrelevant, weil nur abgeschlossene Spiele verarbeitet werden.
- Daten abgeschlossener Spiele (`game_status: "match_record_closed"`, `ended: true`) ändern sich kaum, also großzügig cachen.
- Quellenangabe „Daten: Saisonmanager / Floorball Deutschland“ in der Oberfläche anzeigen.

### Relevante Felder der Spiel-JSON

- `live_stream_link`, `vod_link`: YouTube-Links, `vod_link` hat Vorrang, wenn vorhanden.
- `events[]`: `event_id`, `event_type` (`goal`, `penalty`, `timeout`), `event_team` (`home`/`guest`), `period` (1–3, 4 = Verlängerung, 5 = Penaltyschießen), `time` (Spielzeit **innerhalb des Abschnitts**, Format `m:ss`), `sortkey` (`"2-05:53"`).
- Tore: `home_goals`/`guest_goals` (Stand nach dem Tor), `number` (Rückennummer Schütze), `assist` (Rückennummer Vorlage), `goal_type`/`goal_type_string`.
- Strafen: `number`, `penalty_type` (z. B. `penalty_2`), `penalty_type_string`, `penalty_reason_string`.
- Auszeiten haben eine eigene ID-Reihe (z. B. `9002`), nicht in die Nummerierung der übrigen Ereignisse einordnen.
- `players.home[]`/`players.guest[]`: Zuordnung über `trikot_number`; Felder `player_name`, `player_firstname`, `youth`, `goalkeeper`, `captain`.
- `period_titles[]`: Titel der Abschnitte und Pausen (`period` 1, 1.5, 2, …), `optional` für Verlängerung und Penaltyschießen.
- `result.overtime`: ob es eine Verlängerung gab.
- **Nicht enthalten:** die Drittellänge. Sie ist eine Einstellung (Standard 20 Minuten) und soll später pro Liga hinterlegbar sein.

## Sync-Logik

Pro Video gibt es eine Zuordnung Spielzeit → Videozeit, getrennt nach Abschnitten.

- **Anker** sind: Drittelbeginn (Spielzeit 0), Drittelende (Spielzeit = Drittellänge), jedes manuell gesetzte Ereignis und **freie Anker** („Spielzeit 15:00 liegt bei Videozeit 55:27“, `state.anchors`).
- **Schätzung** eines Ereignisses: lineare Interpolation zwischen dem nächsten Anker davor und danach im selben Abschnitt. Gibt es nur einen Anker auf einer Seite, läuft die Spielzeit 1:1 mit der Videozeit weiter.
- Jedes manuell gesetzte Ereignis wird selbst zum Anker und verbessert die Schätzung der übrigen.
- **Grenzen:** Ein Ereignis darf nicht vor dem vorherigen oder nach dem nächsten Anker liegen. Ereignisse mit gleicher Spielzeit (z. B. Tor und Auszeit bei 18:55) dürfen auf derselben Videozeit liegen.
- Penaltyschießen hat keine Spielzeit; dort wird pro Versuch mit 30 Sekunden Abstand geschätzt.

### Streamlücken und freie Anker

- Bei einem Livestream-Abbruch setzt man zwei freie Anker, einen direkt vor und einen direkt nach der Lücke. Das reicht, weil die Interpolation dann an der Lücke getrennt wird. Auch ein später Streambeginn lässt sich so abbilden (Anker statt Anpfiff).
- Die Videozeit wird beim Öffnen des Formulars festgehalten. Die Spielzeit ist mit der Rückwärtsschätzung (`gameTimeAt`) vorausgefüllt und korrigierbar. Die eingeblendete virtuelle Anzeigetafel stimmt nicht sicher 1:1 mit der echten Spieluhr überein.
- Ereignisse in der Lücke werden als **„nicht im Video“** markiert (`state.missing`): keine Zeit, kein Anker, kein Kapitel, im späteren Export nicht enthalten.
- Sync-Datei Version 2: `free_anchors`, `not_in_video` und `pause_length_sec`. Version 1 wird weiter gelesen.

### Erkenntnisse aus dem ersten Test

- Die echte Dauer eines Drittels ist deutlich länger als 20 Minuten (Uhr wird gestoppt). Das Drittelende wird deshalb mit einem Faktor geschätzt: Startwert 1,35, danach der Durchschnitt aus den bereits komplett markierten Dritteln dieses Videos.
- Die Pause zwischen den Dritteln entspricht ziemlich genau 10 Minuten. Der Drittelbeginn wird deshalb aus Ende des vorherigen Drittels plus Pausenlänge (Einstellung) vorgeschlagen.
- Vorschläge werden nie automatisch übernommen, sondern als „Vorschlag ansehen“ angeboten; gesetzt wird immer bewusst durch den Nutzer.

## YouTube

- IFrame Player API, Einbindung über `youtube-nocookie.com`, mit Zwei-Klick-Lösung (`web/js/consent.js`): Vor der Zustimmung wird nichts von YouTube geladen, auch kein Vorschaubild. Alle Wege zum Player laufen über `showVideo()` in `main.js`. Die Zustimmung wird nur auf Wunsch gemerkt (`localStorage`, Schlüssel `floortag:youtube-consent`) und lässt sich in der Fußzeile widerrufen.
- `getCurrentTime()`/`seekTo()` sind nicht framegenau; für Szenen reicht das.
- Kapitelmarken-Regeln: erstes Kapitel bei `0:00`, mindestens drei Kapitel, mindestens 10 Sekunden pro Kapitel. Kapitel zu Ereignissen beginnen mit einem einstellbaren Vorlauf (Standard 8 Sekunden) vor dem Ereignis.

## Export für Videoanalyse und Schnitt

- Gemeinsames Clip-Modell in `web/js/export.js` (`buildClips`): Jeder Clip hat Code, Start, Ende (Videosekunden) und Labels (Gruppe/Text). Ereignisse bekommen Vorlauf (`leadIn`, Standard 8 s) und Nachlauf (`leadOut`, Standard 5 s), Drittel werden Phasen mit echter Dauer. Eigene Tags und Phasen aus Etappe 5 sind weitere Clips, bei Phasen zählt die Dauer statt Vor- und Nachlauf.
- **Sportscode-XML** (`ALL_INSTANCES` mit `instance`/`code`/`label`, `ROWS` mit Farben 0–65535) für Nacsport, Spiideo Perform (nutzt Eiche Horn) und Hudl Sportscode. Spiideo richtet die Zeit beim Import über ein Bezugs-Tag aus, deshalb passt der Export auch zur eigenen Aufnahme.
- **CSV** mit Semikolon, Dezimalkomma und BOM für Excel.
- **EDL (CMX3600)** als echte Schnittliste für DaVinci Resolve: Timeline ab 01:00:00:00, Clips hintereinander, Umfang wählbar (Tore / Tore und Strafen / alle), Bildrate als Einstellung. Kommentare nur in ASCII. Der Import in Resolve ist noch nicht praktisch getestet.
- Codes heißen „Tor BAL“, „Strafe TVEH“, „Auszeit TVEH“. Jugendschutz gilt auch im Export.
- **Überzahl und Unterzahl** (`web/js/phases.js`) werden aus den Strafen abgeleitet, mit denselben Regeln wie `PPCalculator.swift` im Floorball Dashboard: `penalty_2` 2 Min (durch Überzahltor beendbar), `penalty_2and2` und Matchstrafen (`penalty_ms_tech`/`_full`, Regel seit 2025) 2 + 2 Min verknüpft, `penalty_5` 5 Min (nicht beendbar), `penalty_10` nur 2 Min Unterzahl. Stapelregel max. 2 gleichzeitige Strafen pro Team, Kleinfeld 1 (Einstellung, 3 statt 5 Feldspieler). Tore zählen nur bei echter Überzahl. Abweichend vom Dashboard gilt die eingestellte Drittellänge statt fest 20 Minuten. Strafzeit läuft über Drittelgrenzen weiter, im Video entstehen dann zwei Clips.
- Pro Phase entstehen zwei Clips, „Überzahl BAL“ und „Unterzahl TVEH“, mit Label „Stärke“ (5 gegen 4 bzw. 4 gegen 5). Die Schnittliste kann nur Überzahlphasen enthalten. Auf der Zeitleiste zeigt ein schmales Band die Überzahl (Heim oben, Gast unten).
- Ändern sich die Strafregeln, müssen `phases.js` und `PPCalculator.swift` gemeinsam angepasst werden.

## Eigene Tags (Etappe 5, begonnen)

- Standard-Katalog „FloorTag-Standard v1“ in `web/js/tags.js`, beschrieben in `docs/tag-standard.md`: Torschuss, Penalty, Bully (mit Ort, beiden Spielern und abgeleitetem Vorteil), Freistoß, Ballgewinn, Konter, Torhüter raus (Phase), Besonderes Ereignis (Kommentar).
- Grundsatz: Jede Szene wird einmal getaggt, aus Sicht des handelnden Teams; die Gegenperspektive (Save, Block, Ballverlust, Freistoßabwehr, Konterabwehr, Penalty gehalten, Bully verloren) entsteht im Export.
- Bedienung: Tag-Leiste unter dem Video (ein Klick = Code + Ergebnis bzw. Ort, Tasten 1–8, Q/W/E, T), Nachtragsleiste für Team, Spieler (Kader-Rückennummern), Ort, Kommentar, ±1 s. Reiter „Tags“ in der rechten Spalte. Modus Penaltyschießen mit automatischem Wechsel und Stand (Tasten V/X).
- Tags hängen an der Videozeit und liegen getrennt vom Sync (`floortag-tags:<Spiel>:<Video>` im `localStorage`, eigene Tag-Datei `floortag-tags`), weil sie zur Analyse-Ebene gehören.
- Code **Torhüter** (Taste 9): „ab dieser Szene steht #x im Tor“, für Torhüterwechsel. Ohne Tag gilt der einzige Torhüter laut Kader (`goalkeeper`). Saves und gehaltene Penaltys tragen im Export das Label „Torhüter“.
- **Torhüter raus** fließt in die Spielstärke ein (Feldspieler: Grundzahl − Strafen + 1 ohne Torhüter), z. B. 6 gegen 5 oder 6 gegen 4. Unterzahl mit Torhüter raus ist ausgeglichen und keine Überzahlphase. Das Beenden von Strafen durch Tore regelt weiter nur die Strafzählung wie im Dashboard.

### Fahrplan Etappe 5

1. Torhüter-Einsatz und „Torhüter raus“ in der Spielstärke – erledigt.
2. **Als Nächstes:** Auswertungsansicht „Statistik“ je Team und Drittel: Schüsse (aufs Tor/daneben/geblockt/Tore), Saves und Fangquote je Torhüter (Tore ins leere Tor zählen nicht gegen den Torhüter), Bully-Quote (auch mit/ohne Vorteil), Ballgewinne, Penaltys, Überzahl-Effizienz. Pro Drittel und Team ein Haken „Schüsse vollständig erfasst“; ohne ihn zeigt die Statistik „unvollständig“ statt einer Quote.
3. Aufstellung bei Toren („auf dem Feld“, beide Teams) und Plus/Minus nach Eishockey-Regel: Tore bei gleicher Stärke und Unterzahltore zählen (+1 für die Feldspieler des erzielenden Teams, −1 für die des Gegners), Überzahltore und Penaltytore nicht, Tore ins leere Tor schon.
4. Eigene Codes mit Farbe und Tastenkürzel, später als Katalog pro Verein.

Grundsatz: Standards aus dem Eishockey übernehmen, wo nichts Floorball-Eigenes dagegen spricht.

## Zusammenarbeit (ab Etappe 4)

Zwei getrennte Ebenen:

- **Sync-Ebene** (Drittelgrenzen, Positionen der offiziellen Ereignisse): objektiv, eine gemeinsame Version pro Video, wiki-artig mit Änderungshistorie, optional Status „bestätigt“ durch eine zweite Person.
- **Analyse-Ebene** (eigene Tags): subjektiv, eigene Layer pro Nutzer oder Verein, teilbar und abonnierbar, keine gemeinsame Bearbeitung.

Ein Sync gehört zu einem **Video**, nicht zu einem Spiel. Ein Spiel kann mehrere Videos haben.

## Datenschutz

- Jugendspieler (`youth: true`) werden in öffentlichen Ausgaben standardmäßig nur mit Rückennummer genannt.
- Vom Saisonmanager gesetzte Einschränkungen (z. B. gesperrte Scorerlisten) werden übernommen.
- Analyse-Tags mit Personenbezug sind Leistungsbewertungen und standardmäßig nur vereinsintern sichtbar.
- Hosting in der EU, Löschkonzept für Accounts und Tags.
- Fußzeile verlinkt Impressum und Datenschutz von floorballdashboard.app. **Offen:** Die Datenschutzerklärung erwähnt FloorTag noch nicht (YouTube-Einbettung, Proxy, localStorage). Schriften (Barlow, Barlow Condensed) sind selbst gehostet in `web/fonts/`; vor der YouTube-Zustimmung geht keine Anfrage an fremde Server.

## Repo-Struktur

```
floortag/
├── CLAUDE.md
├── README.md
├── prototype/floortag-prototyp.html   # Ausgangspunkt, nicht mehr weiterentwickeln
├── web/                               # Deploy-Ordner: Frontend (ES-Module ohne Build) + api/game.php
├── tests/                             # Tests: Sync-Logik, Kapitel, Proxy (Fake-Saisonmanager)
└── fixtures/spiel_58668.json          # Testdaten
```

## Hosting

- `floorballdashboard.app` liegt bei **All-Inkl** (Shared Hosting, PHP und Apache, Deploy per FTP), nicht auf einem VPS. Dauerhaft laufende Prozesse (Node, Python-Dienste, PocketBase) sind dort nicht möglich.
- Der FloorTag-Proxy ist deshalb PHP, nach dem Muster von `FloorballDashboard-iOS/server/saisonmanager/saisonmanager-proxy.php`, aber eigenständig: eigener Dateicache, kein CORS, globales Abrufbudget statt IP-Sperren (keine personenbezogenen Daten).
- Die Subdomain `tag.floorballdashboard.app` zeigt auf den Inhalt von `web/`. Deploy-Schritte stehen in der README.

## Offene Fragen

- Drittellänge und Pausenlänge pro Liga: Woher kommen die Werte (Tabelle im Projekt, Einstellung pro Liga, Ableitung aus Altersklasse)?
- Server für Etappe 4: PocketBase läuft nicht auf All-Inkl. Optionen: kleiner VPS in der EU (z. B. Hetzner), gehostetes PocketBase oder ein PHP- und MySQL-Backend auf All-Inkl.
- Öffentliches Repo ja oder nein; bei ja Fixtures anonymisieren.
