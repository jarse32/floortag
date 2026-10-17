# web

Alles, was auf `tag.floorballdashboard.app` hochgeladen wird. Native ES-Module, kein Build-Schritt.

Start im Repo-Wurzelverzeichnis mit `php -S localhost:8000 -t web`, dann `http://localhost:8000/` öffnen.

## Aufbau

- `index.html` – Markup
- `api/game.php` – Proxy zum Saisonmanager mit Dateicache (`api/cache/`), Key aus `SM_KEY` oder `api/config.php`
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
- `js/phases.js` – Über- und Unterzahlphasen aus den Strafen (Regeln wie im Dashboard)
- `js/export.js` – Clip-Modell und Export für Videoanalyse (Sportscode-XML, CSV) und Schnitt (EDL)
- `js/player.js` – YouTube-IFrame-API
- `js/render.js` – Darstellung
