# web

Alles, was auf `tag.floorballdashboard.app` hochgeladen wird. Native ES-Module, kein Build-Schritt.

Start im Repo-Wurzelverzeichnis mit `php -S localhost:8000 -t web`, dann `http://localhost:8000/` öffnen.

## Aufbau

- `index.html` – Spielansicht
- `uebersicht.html` – Übersicht: deine Spiele nach Stufen und Liga-Spielpläne
- `api/game.php` – Proxy zum Saisonmanager mit Dateicache (`api/cache/`), Key aus `SM_KEY` oder `api/config.php`
- `api/league.php` – Proxy für den Spielplan einer Liga (kompakt, Cache 1 Stunde)
- `api/sync.php` – veröffentlichte Syncs pro Video mit Versionen und Bearbeitungsschlüssel (`api/data/`, gesperrt)
- `css/fonts.css`, `fonts/` – selbst gehostete Schriften Barlow und Barlow Condensed (OFL 1.1)
- `css/tokens.css` – Farb- und Schrift-Tokens für Hell- und Dunkelmodus
- `css/app.css` – Layout und Komponenten
- `js/main.js` – Einstieg: Spiel laden (per ID, Datei oder `?spiel=`), Event-Handler, Tastatur
- `js/state.js` – Zustand (gespeichert) und UI-Zustand
- `js/format.js` – reine Helfer: Zeitformate, Escaping, Video-ID
- `js/game.js` – Saisonmanager-Daten: Ereignisse, Abschnitte, Beschriftungen
- `js/sync.js` – Sync-Logik: Anker, Interpolation, Grenzen, Vorschläge
- `js/chapters.js` – YouTube-Kapitelmarken
- `js/storage.js` – localStorage und Sync-Datei
- `js/tags.js` – eigene Tags: Standard-Katalog, Bearbeiten, Penaltyschießen (siehe docs/tag-standard.md)
- `js/help.js` – Anleitung je Modus (Texte, einmalig automatisch)
- `js/overview.js` – Übersichtsseite
- `js/progress.js` – Fortschritt eines Spiels in Stufen (für die Übersicht)
- `js/publish.js` – Sync veröffentlichen, beim Laden übernehmen oder anbieten
- `js/share.js` – Teilen-Link für den Modus Ansehen (Stand komprimiert im #-Teil der Adresse)
- `js/lineups.js` – Aufstellung bei Toren („auf dem Feld“) für Plus/Minus
- `js/stats.js` – Statistik je Team und Abschnitt (Schüsse, Torhüter, Bully, Überzahl …) und Kopierformat
- `js/phases.js` – Über- und Unterzahlphasen aus den Strafen (Regeln wie im Dashboard)
- `js/export.js` – Clip-Modell und Export für Videoanalyse (Sportscode-XML, CSV) und Schnitt (EDL)
- `js/player.js` – YouTube-IFrame-API
- `js/render.js` – Darstellung
