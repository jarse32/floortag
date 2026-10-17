# FloorTag

Synchronisiert Floorball-Spielvideos auf YouTube mit den offiziellen Spieldaten aus dem Saisonmanager (Floorball Deutschland). Daraus entstehen springbare Szenen und YouTube-Kapitelmarken.

Nicht-kommerzielles Hobbyprojekt aus dem Floorball-Dashboard-Ökosystem.

## Lokal starten

Einmalig den API-Key hinterlegen, entweder als Umgebungsvariable `SM_KEY` oder in einer Datei `web/api/config.php` (Vorlage: `web/api/config.example.php`, ist gitignored).

```bash
php -S localhost:8000 -t web
```

Dann `http://localhost:8000/` öffnen und eine Spiel-ID eingeben (Testfall: `58668`) oder direkt `http://localhost:8000/?spiel=58668` aufrufen. Ohne Key lässt sich `fixtures/spiel_58668.json` weiterhin als Datei hineinziehen.

Tests (ohne Abhängigkeiten, brauchen keinen echten Key):

```bash
npm test             # Sync-Logik und Kapitelmarken (node --test)
npm run test:proxy   # Proxy gegen einen gefälschten Saisonmanager
```

## Aufbau

- `web/` – alles, was auf den Server kommt: Frontend (ES-Module, kein Build-Schritt) und `api/game.php` als Proxy zum Saisonmanager
- `prototype/` – Single-File-Prototyp (Etappen 1 und 2), wird nicht mehr weiterentwickelt
- `tests/` – Tests für Sync-Logik, Kapitelmarken und Proxy
- `fixtures/` – Testdaten

## Deploy auf All-Inkl (`tag.floorballdashboard.app`)

1. Im KAS unter „Domain“ → „Subdomain hinzufügen“ die Subdomain `tag` für `floorballdashboard.app` anlegen, Zielverzeichnis z. B. `/floortag/`.
2. Für die Subdomain SSL (Let’s Encrypt) aktivieren und PHP 8.2 oder neuer einstellen.
3. Den **Inhalt** von `web/` per FTP nach `/floortag/` hochladen, ohne den Ordner `api/cache/` mit lokalen Cache-Dateien (nur dessen `.htaccess`). Die versteckten `.htaccess`-Dateien müssen mit, und eine vom Hoster angelegte `index.htm` muss gelöscht werden.
4. Auf dem Server `api/config.php` aus `api/config.example.php` anlegen und den Key eintragen.
5. Prüfen:
   - `https://tag.floorballdashboard.app/api/game.php?id=58668` liefert JSON.
   - `https://tag.floorballdashboard.app/api/config.php` liefert 403.
   - `https://tag.floorballdashboard.app/api/cache/` liefert 403.

Daten: Saisonmanager / Floorball Deutschland
