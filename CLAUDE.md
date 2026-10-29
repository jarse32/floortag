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
6. Anschauen und Vernetzen: Filter, Playlists über mehrere Spiele (begonnen: Seite „Szenen“), Deeplinks auf Szenen, Button „Szenen ansehen“ in der Floorball-Dashboard-App.

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
- Manchmal steht dort kein YouTube-Link (z. B. Twitch, Spiel 58959). `loadGame` wählt das Video deshalb so: Teilen-Link bzw. `?video=` (auch ohne Szenenzeit), dann YouTube-Link aus dem Saisonmanager, dann das zuletzt bearbeitete Video mit eigenem Stand zu diesem Spiel (`ownVideos` in `storage.js`), zuletzt das Video eines veröffentlichten Syncs zu diesem Spiel (`index.json`). „Öffnen“ in Übersicht, Spielplan und Szenen gibt `&video=` mit (`gameUrl` in `scenelink.js`).
- `events[]`: `event_id`, `event_type` (`goal`, `penalty`, `timeout`), `event_team` (`home`/`guest`), `period` (1–3, 4 = Verlängerung, 5 = Penaltyschießen), `time` (Spielzeit **innerhalb des Abschnitts**, Format `m:ss`), `sortkey` (`"2-05:53"`).
- Tore: `home_goals`/`guest_goals` (Stand nach dem Tor), `number` (Rückennummer Schütze), `assist` (Rückennummer Vorlage), `goal_type`/`goal_type_string`.
- Strafen: `number`, `penalty_type` (z. B. `penalty_2`), `penalty_type_string`, `penalty_reason_string`.
- Auszeiten haben eine eigene ID-Reihe (z. B. `9002`), nicht in die Nummerierung der übrigen Ereignisse einordnen.
- `players.home[]`/`players.guest[]`: Zuordnung über `trikot_number`; Felder `player_name`, `player_firstname`, `youth`, `goalkeeper`, `captain`.
- `period_titles[]`: Titel der Abschnitte und Pausen (`period` 1, 1.5, 2, …), `optional` für Verlängerung und Penaltyschießen.
- `result.overtime`: ob es eine Verlängerung gab.
- **Nicht enthalten:** die Drittellänge. Sie steht in den Ligadaten (`league_id` → `leagues/{id}.json`: `periods`, `period_length`, `overtime_length` in Minuten) und wird beim Laden automatisch übernommen (`web/js/leagueinfo.js`, im Browser einen Tag zwischengespeichert unter `floortag-league:<Liga>`). `state.lengthSource` merkt sich die Herkunft: `league` oder `manual`; von Hand eingestellte Längen werden nie überschrieben, im geteilten Link wird nichts übernommen. Ein Hinweis unter den Einstellungen nennt die Herkunft. Ligen mit zwei Halbzeiten bekommen die Länge, FloorTag rechnet aber weiter mit drei Dritteln (Hinweis).

## Modi der Oberfläche

- **Sync** (Standard): Saisonmanager-Ereignisse, Drittelgrenzen, freie Anker, Kapitel und Sync-Datei. Keine Tags.
- **Analyse:** zusätzlich Tag-Leiste, Tags, Statistik, Aufstellung bei Toren und der Export für Analyse und Schnitt.
- **Ansehen:** nur Video, Ereignisse, Tags und Statistik. Ein Klick spielt die Szene ab Vorlauf ab, nichts lässt sich verändern. Gedacht für Spielerinnen und Spieler, die Szenen eines Trainers ansehen.
- Sichtbarkeit über `data-modes="…"` im Markup und `body[data-mode]` im CSS. Die Wahl merkt sich der Browser (`floortag:mode`), `?modus=ansehen|sync|analyse` in der Adresse hat Vorrang.
- Auf breiten Bildschirmen (ab 961 px) scrollt die rechte Spalte für sich (`position: sticky`, eigene Scrollleiste); „N“ und Klicks auf der Zeitleiste scrollen nur die Liste (`showRow` in `main.js`), das Video bleibt im Bild.
- Tore in der Ereignisliste tragen Marken zur Spielsituation (Überzahl 5:4, Unterzahl 4:5, „6:5 ohne Torhüter“ für Tore des Teams mit 6. Feldspieler, leeres Tor für Tore ins leere Tor des Gegners, Penalty), berechnet wie in der Statistik (`goalSituations` in `stats.js`); im Export als Label „Spielsituation“ und in den YouTube-Kapiteln als Zusatz nach „·“ (z. B. „· Unterzahl 4:5“).
- **Startseite** (Ladebereich in `index.html`, solange kein Spiel geladen ist): drei Einstiege nach Ziel (Szenen ansehen → `szenen.html`, Spiel syncen → Eingabefeld und Modus Sync, Spiele finden → Übersicht), Spiel laden mit Beispielspiel 58668 und „Wo finde ich die Spiel-ID?“, die drei Ansichten, häufige Fragen; JSON-Import aufklappbar. Texte bei neuen Funktionen mitpflegen.
- **Anleitung** (`web/js/help.js`): „?“ in der Kopfzeile öffnet eine Anleitung je Modus mit „Zeigen“ (scrollt zur Stelle und hebt sie hervor). Beim ersten Spiel bzw. ersten Wechsel in einen Modus erscheint sie einmal automatisch (`floortag:intro-seen`). Texte bei neuen Funktionen mitpflegen.
- Klick auf ein Ereignis springt in Sync/Analyse zur Szene. War das Video vorher woanders, bietet die Zeile „Dort setzen“ (Ereignis an die vorherige Stelle) und „Zurück“ an. Ohne das ging die Position verloren, wenn man erst spulte und dann das Ereignis antippte.

## Übersicht

- Eigene Seite `web/uebersicht.html` (`js/overview.js`), erreichbar über „Übersicht“ in der Kopfzeile.
- **Deine Spiele:** alle Spiele mit Stand in diesem Browser, nach Stufen filterbar: 0 · Video, 1 · Sync (Fortschritt Ereignisse und Abschnitte), 2 · Tags, 3 · Vollständig analysiert (Schüsse aller Drittel vollständig und Aufstellung bei allen zählenden Toren). Berechnung in `js/progress.js`, beim Speichern als `floortag-meta:<Spiel>:<Video>` abgelegt; ältere Stände werden beim Öffnen der Übersicht einmal über den Proxy nachberechnet.
- **Liga-Spielplan:** Buttons für alle Ligen von Floorball Deutschland der aktuellen Saison (Bundesligen, Pokal; `api/league.php?list=1` über `game_operations/1/leagues`, Cache 1 Tag), weitere Ligen per ID. Spielplan über `api/league.php?id=…` (kompakt mit Spieltag und Ligadaten, Cache 1 Stunde, gemeinsames Abrufbudget mit `game.php`), angezeigt **pro Spieltag** mit ‹ › bzw. Pfeiltasten und Auswahlliste; zuerst der letzte Spieltag mit Ergebnissen (`js/schedule.js`). `?liga=2449&spieltag=5` öffnet direkt. Ohne eigene Spiele öffnet die Übersicht gleich den Liga-Spielplan. Der Spielplan des Saisonmanagers enthält **keine Video-Links**.
- Mit dem Backend (Etappe 4) kommen veröffentlichte Syncs anderer dazu; die Stufen-Logik bleibt.

## Szenen eines Teams (Beginn von Etappe 6)

- Eigene Seite `web/szenen.html` (`js/scenespage.js`, Logik in `js/scenes.js`), verlinkt in den Kopfzeilen. Liga und Team wählen (`?liga=2449&team=…&filter=goal,pp`; letzte Wahl unter `floortag:scenes`).
- **Nur gesyncte Szenen:** pro Spiel der eigene Stand aus diesem Browser (mit Tags), sonst der veröffentlichte Sync (ohne Tags). `loadGameState` lädt ein Spiel nach dem anderen in den globalen Zustand (Einstellungen auf Standard, Ligalängen, `sharedView = true`, damit nichts gespeichert wird), `collectScenes` wertet `buildClips` aus. Clips tragen dafür `side` (und bei Tags `label`).
- Kategorien aus Sicht des Teams (`classify`): Tore/Gegentore, Überzahlspiel, Überzahltore, Gegentore in Überzahl, Unterzahlspiel, Unterzahltore, Gegentore in Unterzahl, eigener Torhüter raus/Gegner ohne Torhüter mit den Toren dazu, leeres Tor, Penaltytore, Strafen, Auszeiten; eigene Tags als `tag:<Bezeichnung>` (auch die Gegenperspektive, z. B. Save). Mehrere Chips = Vereinigung.
- Über- und Unterzahl beginnen wie im Export beim gesetzten bzw. geschätzten Spielbeginn nach der Strafe (siehe „Beginn von Über- und Unterzahl“).
- **Spielerauswahl:** Tor-Szenen des Teams tragen Torschütze und Vorlage, Strafen den bestraften Spieler (`peopleOf`, `playersOf`, `matchesPlayer` in `scenes.js`). Kennung ist die `player_id` aus dem Kader des jeweiligen Spiels (Ereignisse nennen nur die Rückennummer, die zwischen Spielen oft wechselt), ohne Kadereintrag notfalls `n<Nummer>`. In der Adresse steht nur die Kennung, kein Name (`?spieler=7013&rolle=goal,assist,penalty`). Die Liste zeigt Vor- und Nachname aus dem Kader mit allen benutzten Nummern („Lars Schönfelder · #7, #17“), Jugendspieler nur mit Nummer(n), alphabetisch nach Nachname. Rollen Tore/Vorlagen/Strafen; Kategorie-Chips grenzen weiter ein, ohne Chip gelten alle Szenen des Spielers. Beim Teamwechsel wird der Spieler zurückgesetzt.
- Player mit Playlist: Klick spielt ab Vorlauf, „Alle abspielen“ schaltet nach dem Nachlauf weiter, auch über Videos hinweg (`playAt` in `player.js`), N/P. Szenen-Link pro Szene.
- Reiter „Spiele“: alle Spiele des Teams mit Sync-Quelle, Tags und Szenenzahl; Filter „Ohne Tags“ und „Ohne Sync“.

## Veröffentlichte Syncs (gemeinsamer Sync pro Video, Zwischenlösung bis Etappe 4)

- `api/sync.php` speichert pro Video den veröffentlichten Sync mit allen Versionen (max. 50) in `api/data/syncs/<Video>/` (per `.htaccess` gesperrt, gitignored), dazu `index.json` für die Übersicht. Lesen darf jeder, ändern nur mit **Bearbeitungsschlüssel** (beim ersten Veröffentlichen erzeugt, auf dem Server nur als SHA-256-Hash; im Browser unter `floortag-publish:<Video>`).
- Gespeichert wird nur die Sync-Ebene (Drittelgrenzen, Positionen der Saisonmanager-Ereignisse, freie Anker, „nicht im Video“, Längen); der Server verwirft alle anderen Felder. Keine Tags, keine Namen, keine IP-Adressen. Schutz: Spiel muss im Saisonmanager existieren, max. 200 kB, Schreibbudget 20/min.
- Beim Laden eines Spiels (`checkPublished` in `main.js`, Entscheidung `decideOnLoad` in `publish.js`): kein eigener Stand → übernehmen; eigener Stand unverändert auf älterer Version (`state.syncSource`) → still aktualisieren; eigener Stand verändert oder unabhängig → nur „Übernehmen“ anbieten. Tags bleiben immer unberührt.
- Bereich „Veröffentlichen“ (Sync und Analyse): veröffentlichen/aktualisieren, Schlüssel kopieren oder eingeben (zweites Gerät, Co-Trainer), ältere Versionen laden (gilt als eigene Änderung, lässt sich neu veröffentlichen). Der Liga-Spielplan der Übersicht zeigt öffentliche Syncs.

## Teilen-Link (Zwischenlösung bis Etappe 4)

- „Link teilen“ (Kopfzeile, Sync und Analyse) schreibt Sync, Tags, Haken und Aufstellungen kompakt und komprimiert (`deflate-raw`, base64url) in den Teil hinter `#ft=` (`web/js/share.js`). Der wird nie an den Server übertragen. Namen stehen nicht im Link, nur Rückennummern.
- Wer den Link öffnet, sieht das Spiel fest im Modus Ansehen. Es wird nichts im Browser gespeichert (`state.sharedView`), der eigene Stand bleibt unberührt. Jugendspieler erscheinen dort immer nur mit Rückennummer. Der Balken bietet „Eigenen Stand öffnen“ und „Als eigenen Stand übernehmen“ (mit Rückfrage).
- Größe: etwa 3 kB bei 400 Tags.

## Link zu einer Szene

- Jedes Ereignis (ausgewählt, mit Zeit) und jeder Tag (Kettensymbol in der Tag-Liste) lässt sich als Link verschicken: `?spiel=…&video=…&t=…&e=…&modus=ansehen` (`web/js/scenelink.js`). `t` ist die Startzeit in Videosekunden (Szene minus Vorlauf), `e` die Ereignis-ID (nur bei Saisonmanager-Ereignissen). Auf Touch-Geräten öffnet sich das Teilen-Menü (`navigator.share`), sonst wird kopiert.
- Beim Öffnen (`applyScene` in `main.js`): Modus Ansehen, das Ereignis ist ausgewählt, nach der YouTube-Zustimmung springt der Player an `t`; danach werden `t`, `e` und `video` aus der Adresse entfernt.
- Im Link stehen keine Namen und keine Tags. Wer die Tags mitsehen soll, braucht „Link teilen“. Die Zeiten der Ereignisliste kommen beim Empfänger aus dem eigenen bzw. veröffentlichten Sync; `t` gilt unabhängig davon.

## Sync-Logik

Pro Video gibt es eine Zuordnung Spielzeit → Videozeit, getrennt nach Abschnitten.

- **Anker** sind: Drittelbeginn (Spielzeit 0), Drittelende (Spielzeit = Drittellänge), jedes manuell gesetzte Ereignis und **freie Anker** („Spielzeit 15:00 liegt bei Videozeit 55:27“, `state.anchors`).
- **Schätzung** eines Ereignisses: lineare Interpolation zwischen dem nächsten Anker davor und danach im selben Abschnitt. Gibt es nur einen Anker auf einer Seite, läuft die Spielzeit 1:1 mit der Videozeit weiter.
- Jedes manuell gesetzte Ereignis wird selbst zum Anker und verbessert die Schätzung der übrigen.
- **Grenzen:** Ein Ereignis darf nicht vor dem vorherigen oder nach dem nächsten Anker liegen. Ereignisse mit gleicher Spielzeit (z. B. Tor und Auszeit bei 18:55) dürfen auf derselben Videozeit liegen.
- Penaltyschießen hat keine Spielzeit; dort wird pro Versuch mit 30 Sekunden Abstand geschätzt.
- **Falsche Spielzeit im Saisonmanager** (z. B. Tor zu früh eingetragen, Spiel 58665): Liegt die gewünschte Stelle mehr als 1 s außerhalb der Grenzen, setzt `place()` an den Rand und meldet die Stelle; die Ereigniszeile bietet „Spielzeit korrigieren und dort setzen“ an (vorausgefüllt mit `gameTimeFor`). Korrekturen liegen in `state.gsFix` (Sync-Ebene: gespeichert, im Teilen-Link, in der Sync-Datei als `game_time_fixes`, veröffentlicht über `sync.php`). Alle Rechnungen nutzen `gameSec(e)` aus `game.js` statt `state.gs`; die Liste zeigt korrigierte Zeiten mit *, die Saisonmanager-Zeit bleibt sichtbar und lässt sich wiederherstellen. Spielstände (`home_goals`/`guest_goals`) bleiben wie im Saisonmanager.

### Streamlücken und freie Anker

- Bei einem Livestream-Abbruch setzt man zwei freie Anker, einen direkt vor und einen direkt nach der Lücke. Das reicht, weil die Interpolation dann an der Lücke getrennt wird. Auch ein später Streambeginn lässt sich so abbilden (Anker statt Anpfiff).
- Die Videozeit wird beim Öffnen des Formulars festgehalten. Die Spielzeit ist mit der Rückwärtsschätzung (`gameTimeAt`) vorausgefüllt und korrigierbar. Die eingeblendete virtuelle Anzeigetafel stimmt nicht sicher 1:1 mit der echten Spieluhr überein.
- Ereignisse in der Lücke werden als **„nicht im Video“** markiert (`state.missing`): keine Zeit, kein Anker, im Export nicht enthalten. In der Kapitelliste stehen nur Tore, damit der Stand stimmt: als Zeile **ohne Zeitstempel** („Nicht im Video: 2:0 Tor BAL · …“, YouTube macht daraus kein Kapitel), einsortiert an der geschätzten Stelle (`videoTimeAt`). Die Zeile beginnt mit Text, damit YouTube den Stand nicht als Zeit liest. Strafen fehlen ganz.
- Sync-Datei Version 2: `free_anchors`, `not_in_video` und `pause_length_sec`. Version 1 wird weiter gelesen.

### Erkenntnisse aus dem ersten Test

- Die echte Dauer eines Drittels ist deutlich länger als 20 Minuten (Uhr wird gestoppt). Das Drittelende wird deshalb mit einem Faktor geschätzt: Startwert 1,35, danach der Durchschnitt aus den bereits komplett markierten Dritteln dieses Videos.
- Die Pause zwischen den Dritteln entspricht ziemlich genau 10 Minuten. Der Drittelbeginn wird deshalb aus Ende des vorherigen Drittels plus Pausenlänge (Einstellung) vorgeschlagen.
- Vorschläge werden nie automatisch übernommen, sondern als „Vorschlag ansehen“ angeboten; gesetzt wird immer bewusst durch den Nutzer.

## YouTube

- IFrame Player API, Einbindung über `youtube-nocookie.com`, mit Zwei-Klick-Lösung (`web/js/consent.js`): Vor der Zustimmung wird nichts von YouTube geladen, auch kein Vorschaubild. Alle Wege zum Player laufen über `showVideo()` in `main.js`. Die Zustimmung wird nur auf Wunsch gemerkt (`localStorage`, Schlüssel `floortag:youtube-consent`) und lässt sich in der Fußzeile widerrufen.
- `getCurrentTime()`/`seekTo()` sind nicht framegenau; für Szenen reicht das.
- iOS ignoriert `seekTo()`, solange das Video noch nie lief. `player.js` setzt dann stattdessen die Startzeit (`cueVideoById` mit `startSeconds`); Play beginnt an der Szene. Auf echtem iPhone zu prüfen, im eingebauten Browser nicht nachstellbar.
- Kapitelmarken-Regeln: erstes Kapitel bei `0:00`, mindestens drei Kapitel, mindestens 10 Sekunden pro Kapitel. Kapitel zu Ereignissen beginnen mit einem einstellbaren Vorlauf (Standard 8 Sekunden) vor dem Ereignis.
- Kapitelformat (`web/js/chapters.js`): einheitlich „Stand Art Team · Spieler, Vorlage · Zusatz“, z. B. „6:0 Tor EJB · #29 Sikiö, Vorlage #34 Mix · Überzahl 5:4“, „Strafe RSA · #93 Pohl · 2 Min., Stoßen“; Pausen mit „· Stand 4:0“, am Ende „Spielende · Endstand 12:5 n. PS“.
- Tags als Kapitel (Analyse, optional, `state.chapterTags`): verschossene Penaltys, Penaltyschießen (jeder Versuch mit laufendem Stand, ersetzt dann das einzelne Siegtor aus dem Saisonmanager), Torhüter raus (Beginn), besondere Ereignisse (mit Kommentar). Schüsse, Bullys usw. nie.

## Export für Videoanalyse und Schnitt

- Gemeinsames Clip-Modell in `web/js/export.js` (`buildClips`): Jeder Clip hat Code, Start, Ende (Videosekunden) und Labels (Gruppe/Text). Ereignisse bekommen Vorlauf (`leadIn`, Standard 8 s) und Nachlauf (`leadOut`, Standard 5 s), Drittel werden Phasen mit echter Dauer. Eigene Tags und Phasen aus Etappe 5 sind weitere Clips, bei Phasen zählt die Dauer statt Vor- und Nachlauf.
- **Sportscode-XML** (`ALL_INSTANCES` mit `instance`/`code`/`label`, `ROWS` mit Farben 0–65535) für Nacsport, Spiideo Perform (nutzt Eiche Horn) und Hudl Sportscode. Spiideo richtet die Zeit beim Import über ein Bezugs-Tag aus, deshalb passt der Export auch zur eigenen Aufnahme.
- **CSV** mit Semikolon, Dezimalkomma und BOM für Excel.
- **EDL (CMX3600)** als echte Schnittliste für DaVinci Resolve: Timeline ab 01:00:00:00, Clips hintereinander, Umfang wählbar (Tore / Tore und Strafen / alle), Bildrate als Einstellung. Kommentare nur in ASCII. Der Import in Resolve ist noch nicht praktisch getestet.
- Codes heißen „Tor BAL“, „Strafe TVEH“, „Auszeit TVEH“. Jugendschutz gilt auch im Export.
- **Überzahl und Unterzahl** (`web/js/phases.js`) werden aus den Strafen abgeleitet, mit denselben Regeln wie `PPCalculator.swift` im Floorball Dashboard: `penalty_2` 2 Min (durch Überzahltor beendbar), `penalty_2and2` und Matchstrafen (`penalty_ms_tech`/`_full`, Regel seit 2025) 2 + 2 Min verknüpft, `penalty_5` 5 Min (nicht beendbar), `penalty_10` nur 2 Min Unterzahl. Stapelregel max. 2 gleichzeitige Strafen pro Team, Kleinfeld 1 (Einstellung, 3 statt 5 Feldspieler). Tore zählen nur bei echter Überzahl. Abweichend vom Dashboard gilt die eingestellte Drittellänge statt fest 20 Minuten. Strafzeit läuft über Drittelgrenzen weiter, im Video entstehen dann zwei Clips.
- **Beginn von Über- und Unterzahl** (`web/js/ppstart.js`): Bei der Strafe steht die Uhr, in Spielzeit beginnt die Phase beim Pfiff, gespielt wird erst später. In der Zeile der Strafe lässt sich der Beginn setzen und mit ±1/±5 s feinjustieren (`state.ppStart`, Sync-Ebene: gespeichert, Teilen-Link, Sync-Datei `pp_starts`, veröffentlicht). Ohne gesetzten Beginn: Strafe + Durchschnitt der gesetzten Abstände in diesem Video, sonst die Einstellung `ppDelay` (Standard 30 s, Sync-Datei `pp_delay_sec`). Gilt für Clips, Export, Zeitleiste und Szenen; nur für Phasen, die mit einer Strafe beginnen (nicht nach der Drittelpause oder nach Ablauf einer Strafe). Ist eine Phase kürzer als der geschätzte Abstand, bleibt der Beginn beim Pfiff.
- Pro Phase entstehen zwei Clips, „Überzahl BAL“ und „Unterzahl TVEH“, mit Label „Stärke“ (5 gegen 4 bzw. 4 gegen 5). Die Schnittliste kann nur Überzahlphasen enthalten. Auf der Zeitleiste zeigt ein schmales Band die Überzahl (Heim oben, Gast unten).
- Ändern sich die Strafregeln, müssen `phases.js` und `PPCalculator.swift` gemeinsam angepasst werden.

## Eigene Tags (Etappe 5, begonnen)

- Standard-Katalog „FloorTag-Standard v1“ in `web/js/tags.js`, beschrieben in `docs/tag-standard.md`: Torschuss, Penalty, Bully (mit Ort, beiden Spielern und abgeleitetem Vorteil), Freistoß, Ballgewinn, Konter, Torhüter raus (Phase), Besonderes Ereignis (Kommentar).
- Grundsatz: Jede Szene wird einmal getaggt, aus Sicht des handelnden Teams; die Gegenperspektive (Save, Block, Ballverlust, Freistoßabwehr, Konterabwehr, Penalty gehalten, Bully verloren) entsteht im Export.
- Bedienung: Tag-Leiste unter dem Video (ein Klick = Code + Ergebnis bzw. Ort, Tasten 1–8, Q/W/E, T), Nachtragsleiste für Team, Spieler (Kader-Rückennummern), Ort, Kommentar, ±1 s. Reiter „Tags“ in der rechten Spalte. Modus Penaltyschießen mit automatischem Wechsel und Stand (Tasten V/X); Penalty-Tags nach dem gesetzten Beginn von Abschnitt 5 zählen automatisch als Penaltyschießen (`isShootout` in `tags.js`), das Häkchen braucht es nur ohne gesetzten Beginn. Löschen über ✕ in der Tag-Liste, „Löschen“ im Nachtrag oder Entf/Rücktaste beim ausgewählten Tag, jeweils mit „Rückgängig“ in der Meldung.
- Tags hängen an der Videozeit und liegen getrennt vom Sync (`floortag-tags:<Spiel>:<Video>` im `localStorage`, eigene Tag-Datei `floortag-tags`), weil sie zur Analyse-Ebene gehören.
- Code **Torhüter** (Taste 9): „ab dieser Szene steht #x im Tor“, für Torhüterwechsel. Ohne Tag gilt der einzige Torhüter laut Kader (`goalkeeper`). Saves und gehaltene Penaltys tragen im Export das Label „Torhüter“.
- **Torhüter raus** fließt in die Spielstärke ein (Feldspieler: Grundzahl − Strafen + 1 ohne Torhüter), z. B. 6 gegen 5 oder 6 gegen 4. Unterzahl mit Torhüter raus ist ausgeglichen und keine Überzahlphase. Ob ein Tor ins leere Tor ging, wird in Videozeit geprüft (Phasenende genau beim Tor zählt mit), weil die Spieluhr nach dem Tor steht; eine nicht beendete Phase gilt bis Spielende, ein Ende nach dem Drittelende (bzw. ein Beginn vor dem Anpfiff) zählt bis zur Drittelgrenze. Das Beenden von Strafen durch Tore regelt weiter nur die Strafzählung wie im Dashboard.

### Fahrplan Etappe 5

1. Torhüter-Einsatz und „Torhüter raus“ in der Spielstärke – erledigt.
2. Auswertungsansicht „Statistik“ – erledigt (`web/js/stats.js`, Reiter „Statistik“, „Als Tabelle kopieren“). Je Team und Drittel: Schüsse (aufs Tor/daneben/geblockt/Tore), Saves und Fangquote je Torhüter (Tore ins leere Tor zählen nicht gegen den Torhüter), Bully-Quote (auch mit/ohne Vorteil), Ballgewinne, Penaltys, Überzahl-Effizienz. Pro Drittel und Team ein Haken „Schüsse vollständig erfasst“; ohne ihn zeigt die Statistik „unvollständig“ statt einer Quote.
3. Aufstellung bei Toren und Plus/Minus – erledigt (`web/js/lineups.js`, Auswahl beim Tor in der Ereignisliste, Tabelle in der Statistik). Schütze und Vorlage sind automatisch auf dem Feld, Torhüter bekommen kein Plus/Minus, Aufstellungen liegen auf der Tag-Ebene. Regel: Tore bei gleicher Stärke und Unterzahltore zählen (+1 für die Feldspieler des erzielenden Teams, −1 für die des Gegners), Überzahltore und Penaltytore nicht, Tore ins leere Tor schon.
4. **Als Nächstes:** Eigene Codes mit Farbe und Tastenkürzel, später als Katalog pro Verein.

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
├── web/                               # Deploy-Ordner: Frontend (ES-Module ohne Build), uebersicht.html, api/game.php + api/league.php
├── tests/                             # Tests: Sync-Logik, Kapitel, Proxy (Fake-Saisonmanager)
└── fixtures/spiel_58668.json          # Testdaten
```

## Hosting

- `floorballdashboard.app` liegt bei **All-Inkl** (Shared Hosting, PHP und Apache, Deploy per FTP), nicht auf einem VPS. Dauerhaft laufende Prozesse (Node, Python-Dienste, PocketBase) sind dort nicht möglich.
- Der FloorTag-Proxy ist deshalb PHP, nach dem Muster von `FloorballDashboard-iOS/server/saisonmanager/saisonmanager-proxy.php`, aber eigenständig: eigener Dateicache, kein CORS, globales Abrufbudget statt IP-Sperren (keine personenbezogenen Daten).
- Die Subdomain `tag.floorballdashboard.app` zeigt auf den Inhalt von `web/`. Deploy-Schritte stehen in der README.

## Offene Fragen

- Pausenlänge pro Liga: liefert der Saisonmanager nicht (Drittellänge kommt inzwischen aus den Ligadaten). Spiele mit zwei Halbzeiten (`periods: 2`) sind noch nicht abgebildet.
- Server für Etappe 4: PocketBase läuft nicht auf All-Inkl. Optionen: kleiner VPS in der EU (z. B. Hetzner), gehostetes PocketBase oder ein PHP- und MySQL-Backend auf All-Inkl.
- Öffentliches Repo ja oder nein; bei ja Fixtures anonymisieren.
