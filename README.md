# FloorTag

Synchronisiert Floorball-Spielvideos auf YouTube mit den offiziellen Spieldaten aus dem Saisonmanager (Floorball Deutschland). Daraus entstehen springbare Szenen und YouTube-Kapitelmarken.

Nicht-kommerzielles Hobbyprojekt aus dem Floorball-Dashboard-Ökosystem.

## Prototyp starten

YouTube blockiert die Einbettung von `file://`, deshalb über einen lokalen Server starten:

```bash
python3 -m http.server 8000
```

Dann `http://localhost:8000/prototype/floortag-prototyp.html` öffnen und `fixtures/spiel_58668.json` hineinziehen.

## Aufbau

- `prototype/` – Single-File-Prototyp (Etappen 1 und 2), wird nicht mehr weiterentwickelt
- `web/` – Frontend nach der Aufteilung
- `proxy/` – API-Proxy für den Saisonmanager
- `fixtures/` – Testdaten

Daten: Saisonmanager / Floorball Deutschland
