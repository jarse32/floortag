# web

Frontend von FloorTag. Native ES-Module, kein Build-Schritt.

Start im Repo-Wurzelverzeichnis mit `python3 -m http.server 8000`, dann `http://localhost:8000/web/` öffnen.

## Aufbau

- `index.html` – Markup
- `css/tokens.css` – Farb- und Schrift-Tokens für Hell- und Dunkelmodus
- `css/app.css` – Layout und Komponenten
- `js/main.js` – Einstieg: Spiel laden, Event-Handler, Tastatur
- `js/state.js` – Zustand (gespeichert) und UI-Zustand
- `js/format.js` – reine Helfer: Zeitformate, Escaping, Video-ID
- `js/game.js` – Saisonmanager-Daten: Ereignisse, Abschnitte, Beschriftungen
- `js/sync.js` – Sync-Logik: Anker, Interpolation, Grenzen, Vorschläge
- `js/chapters.js` – YouTube-Kapitelmarken
- `js/storage.js` – localStorage und Sync-Datei
- `js/player.js` – YouTube-IFrame-API
- `js/render.js` – Darstellung
