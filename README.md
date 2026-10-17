# FloorTag

Synchronisiert Floorball-Spielvideos auf YouTube mit den offiziellen Spieldaten aus dem Saisonmanager (Floorball Deutschland). Daraus entstehen springbare Szenen und YouTube-Kapitelmarken.

Nicht-kommerzielles Hobbyprojekt aus dem Floorball-Dashboard-Ökosystem.

## Starten

YouTube blockiert die Einbettung von `file://`, deshalb im Repo-Wurzelverzeichnis einen lokalen Server starten:

```bash
python3 -m http.server 8000
```

Dann `http://localhost:8000/web/` öffnen und `fixtures/spiel_58668.json` hineinziehen. Der alte Prototyp liegt unter `http://localhost:8000/prototype/floortag-prototyp.html`.

## Aufbau

- `prototype/` – Single-File-Prototyp (Etappen 1 und 2), wird nicht mehr weiterentwickelt
- `web/` – Frontend (ES-Module, kein Build-Schritt)
- `proxy/` – API-Proxy für den Saisonmanager
- `fixtures/` – Testdaten

Daten: Saisonmanager / Floorball Deutschland
