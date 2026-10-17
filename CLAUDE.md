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

Proxy-Tests ohne echten Key: `bash tests/proxy-test.sh`.

Testfall: Spiel 58668 (2. FBL Herren Nord/West, Baltic Storms – TV Eiche Horn Bremen, 5:4), Video `lfIFpRsE55I`. Die JSON liegt in `fixtures/spiel_58668.json`.

Repo: privat auf GitHub unter `jarse32/floortag`, Branch `main`.

## Etappenplan

0. Datenstruktur verstehen – erledigt.
1. Sync-Prototyp lokal – erledigt, wird getestet.
2. Kapitelmarken-Export – erledigt, wird getestet.
3. **In Arbeit:** Prototyp in sinnvolle Dateien aufteilen (erledigt), API-Proxy als PHP (erledigt, lokal getestet), Spiel per ID laden statt per Datei (erledigt). Offen: Subdomain `tag.floorballdashboard.app` anlegen und erster Deploy.
4. Backend und gemeinsame Syncs: PocketBase (braucht einen eigenen Server, siehe Hosting), Accounts, ein gemeinsamer Sync pro Video mit Änderungshistorie, Deploy unter `tag.floorballdashboard.app`, geschlossene Beta mit wenigen Vereinen.
5. Analyse-Tags: Code-Panel mit Floorball-Taxonomie und Tastenkürzeln, eigene Layer pro Nutzer/Verein, Sichtbarkeit privat/Verein/öffentlich, Export als Sportscode-XML.
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

- **Anker** sind: Drittelbeginn (Spielzeit 0), Drittelende (Spielzeit = Drittellänge) und jedes manuell gesetzte Ereignis.
- **Schätzung** eines Ereignisses: lineare Interpolation zwischen dem nächsten Anker davor und danach im selben Abschnitt. Gibt es nur einen Anker auf einer Seite, läuft die Spielzeit 1:1 mit der Videozeit weiter.
- Jedes manuell gesetzte Ereignis wird selbst zum Anker und verbessert die Schätzung der übrigen.
- **Grenzen:** Ein Ereignis darf nicht vor dem vorherigen oder nach dem nächsten Anker liegen. Ereignisse mit gleicher Spielzeit (z. B. Tor und Auszeit bei 18:55) dürfen auf derselben Videozeit liegen.
- Penaltyschießen hat keine Spielzeit; dort wird pro Versuch mit 30 Sekunden Abstand geschätzt.

### Erkenntnisse aus dem ersten Test

- Die echte Dauer eines Drittels ist deutlich länger als 20 Minuten (Uhr wird gestoppt). Das Drittelende wird deshalb mit einem Faktor geschätzt: Startwert 1,35, danach der Durchschnitt aus den bereits komplett markierten Dritteln dieses Videos.
- Die Pause zwischen den Dritteln entspricht ziemlich genau 10 Minuten. Der Drittelbeginn wird deshalb aus Ende des vorherigen Drittels plus Pausenlänge (Einstellung) vorgeschlagen.
- Vorschläge werden nie automatisch übernommen, sondern als „Vorschlag ansehen“ angeboten; gesetzt wird immer bewusst durch den Nutzer.

## YouTube

- IFrame Player API, Einbindung über `youtube-nocookie.com`. Im fertigen Produkt mit Zwei-Klick-Lösung (Video erst nach Zustimmung laden).
- `getCurrentTime()`/`seekTo()` sind nicht framegenau; für Szenen reicht das.
- Kapitelmarken-Regeln: erstes Kapitel bei `0:00`, mindestens drei Kapitel, mindestens 10 Sekunden pro Kapitel. Kapitel zu Ereignissen beginnen mit einem einstellbaren Vorlauf (Standard 8 Sekunden) vor dem Ereignis.

## Zusammenarbeit (ab Etappe 4)

Zwei getrennte Ebenen:

- **Sync-Ebene** (Drittelgrenzen, Positionen der offiziellen Ereignisse): objektiv, eine gemeinsame Version pro Video, wiki-artig mit Änderungshistorie, optional Status „bestätigt“ durch eine zweite Person.
- **Analyse-Ebene** (eigene Tags): subjektiv, eigene Layer pro Nutzer oder Verein, teilbar und abonnierbar, keine gemeinsame Bearbeitung.

Ein Sync gehört zu einem **Video**, nicht zu einem Spiel. Ein Spiel kann mehrere Videos haben.

## Datenschutz

- Jugendspieler (`youth: true`) werden in öffentlichen Ausgaben standardmäßig nur mit Rückennummer genannt.
- Vom Saisonmanager gesetzte Einschränkungen (z. B. gesperrte Scorerlisten) werden übernommen.
- Analyse-Tags mit Personenbezug sind Leistungsbewertungen und standardmäßig nur vereinsintern sichtbar.
- Hosting in der EU, Löschkonzept für Accounts und Tags, Datenschutzerklärung von floorballdashboard.app vor dem Livegang erweitern.

## Repo-Struktur

```
floortag/
├── CLAUDE.md
├── README.md
├── prototype/floortag-prototyp.html   # Ausgangspunkt, nicht mehr weiterentwickeln
├── web/                               # Deploy-Ordner: Frontend (ES-Module ohne Build) + api/game.php
├── tests/                             # Proxy-Tests mit Fake-Saisonmanager
└── fixtures/spiel_58668.json          # Testdaten
```

## Hosting

- `floorballdashboard.app` liegt bei **All-Inkl** (Shared Hosting, PHP und Apache, Deploy per FTP), nicht auf einem VPS. Dauerhaft laufende Prozesse (Node, Python-Dienste, PocketBase) sind dort nicht möglich.
- Der FloorTag-Proxy ist deshalb PHP, nach dem Muster von `FloorballDashboard-iOS/server/saisonmanager/saisonmanager-proxy.php`, aber eigenständig: eigener Dateicache, kein CORS, globales Abrufbudget statt IP-Sperren (keine personenbezogenen Daten).
- Die Subdomain `tag.floorballdashboard.app` zeigt auf den Inhalt von `web/`. Deploy-Schritte stehen in der README.

## Offene Fragen

- Drittellänge und Pausenlänge pro Liga: Woher kommen die Werte (Tabelle im Projekt, Einstellung pro Liga, Ableitung aus Altersklasse)?
- Livestream-Abbrüche: zusätzliche freie Anker („hier ist 14:30 im 2. Drittel“) einführen.
- Server für Etappe 4: PocketBase läuft nicht auf All-Inkl. Optionen: kleiner VPS in der EU (z. B. Hetzner), gehostetes PocketBase oder ein PHP- und MySQL-Backend auf All-Inkl.
- Öffentliches Repo ja oder nein; bei ja Fixtures anonymisieren.
