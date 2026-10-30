# FloorTag-Standard für Tags (Version 1)

Gemeinsamer Katalog, damit Analysen über Teams, Vereine und Spiele hinweg vergleichbar sind. Eigene Codes kommen später dazu, ersetzen den Standard aber nicht. Umsetzung: `web/js/tags.js`.

## Grundsätze

- **Jede Szene wird genau einmal getaggt, aus Sicht des handelnden Teams.** Die Gegenperspektive erzeugt FloorTag im Export automatisch, z. B. aus „Torschuss aufs Tor“ von Team A das „Save“ von Team B. So entstehen keine widersprüchlichen Doppelungen.
- **Tags hängen an der Videozeit**, weil man sie im Video beobachtet. Abschnitt und Spielzeit werden im Export aus dem Sync berechnet, sofern die Drittelgrenzen gesetzt sind.
- **Feste Schlüssel** (`key`) bleiben über alle Versionen gleich. Texte dürfen sich ändern, Schlüssel nicht.
- **Tags gehören zur Analyse-Ebene**, nicht zum Sync. Sie werden getrennt gespeichert (`localStorage` und Tag-Datei `floortag-tags`) und sind später pro Person oder Verein sichtbar. Tags mit Spielerbezug sind Leistungsbewertungen und standardmäßig nur vereinsintern.

## Codes

| Schlüssel | Code | Team = | Ergebnis / Ort | Art | Gegenperspektive |
|---|---|---|---|---|---|
| `shot` | Torschuss | schießendes Team | aufs Tor · daneben · geblockt | Moment | aufs Tor → Save, geblockt → Block |
| `penalty_shot` | Penalty | schießendes Team | verwandelt · nicht verwandelt | Moment | nicht verwandelt → Penalty gehalten |
| `faceoff` | Bully | Gewinner (aus dem Ergebnis) | Heim gewinnt · Gast gewinnt · unentschieden; Ort: Mittellinie · Hälfte Heim · Hälfte Gast | Moment | Bully verloren |
| `free_hit` | Freistoß | ausführendes Team (mit Ball), ohne Spieler | Ecke (Angriffsecke) · außen (seitlich in der Angriffshälfte) · Mitte (Mittelzone) · eigene Hälfte | Moment | Freistoßabwehr (gegen den Ball) |
| `turnover` | Ballgewinn | gewinnendes Team | – | Moment | Ballverlust |
| `counter` | Konter | konterndes Team | – | Zeitpunkt + Dauer (Standard 10 s) | Konterabwehr |
| `empty_net` | Torhüter raus | Team ohne Torhüter | – | Phase (Start/Ende) | – |
| `special` | Besonderes Ereignis | optional | Kommentar (optional) | Moment | – |
| `goalie` | Torhüter | Team des Torhüters | Spieler = Torhüter | ab dieser Szene (kein Clip) | – |

Gleichwertige Ausgänge sind bewusst zusammengefasst: verschossen und gehalten beim Penalty, aufs Tor beim Schuss und Save beim Gegner, geblockt beim Schuss und Block beim Gegner.

### Bully und Vorteil

Den Vorteil leitet FloorTag aus dem Regelwerk ab:

- **Mittellinie:** Die Gastmannschaft setzt zuerst und hat den Vorteil.
- **Hälfte eines Teams:** Das Team, dem die Hälfte gehört, wählt die Seite und hat den Vorteil.

Im Export stehen „Vorteil“ und „Mit Vorteil gewonnen: ja/nein“, dazu die Rückennummern beider beteiligten Spieler („Spieler BAL“, „Spieler TVEH“).

### Torhüter

Ein Torhüter-Tag legt fest, wer ab dieser Szene im Tor steht, z. B. nach einem Wechsel. Ohne Tag gilt der einzige Torhüter laut Kader. Saves und gehaltene Penaltys tragen im Export das Label „Torhüter“. „Torhüter raus“ fließt in die Spielstärke ein: Ein Team ohne Torhüter hat einen Feldspieler mehr (6 gegen 5, mit Strafen auch 6 gegen 4). Nimmt ein Team in Unterzahl den Torhüter raus, ist die Stärke ausgeglichen.

Tore werden dabei unterschieden: Trifft das Team **ohne** Torhüter (6. Feldspieler), trägt das Tor „6:5 ohne Torhüter“ und zählt in der Statistik unter „davon mit 6. Feldspieler“. Trifft der Gegner ins leere Tor, heißt es „leeres Tor“ und zählt nicht gegen den Torhüter. Getaggt wird in beiden Fällen dieselbe Phase „Torhüter raus“ beim Team, das den Torhüter herausnimmt.

### Penaltyschießen

Im Modus Penaltyschießen wechselt das Team automatisch ab. Das Team des ersten Versuchs wählt man über „Neue Tags für“. Der Stand wird mitgezählt. Die Tags tragen das Label „Penaltyschießen: ja“. Der Saisonmanager liefert davon meist nur den entscheidenden Treffer.

## Aus dem Saisonmanager (nicht taggen)

Tor, Strafe, Auszeit und die Drittel kommen aus dem Saisonmanager. Über- und Unterzahl berechnet FloorTag aus den Strafen. Tore zählen in Auswertungen als „Torschuss: Tor“.

## Statistik

Die Ansicht „Statistik“ wertet Tags und Saisonmanager-Daten je Team und Abschnitt aus. Die Fangquote erscheint nur, wenn die Schüsse des Gegners für alle gewählten Abschnitte als „vollständig erfasst“ abgehakt sind. Die Haken gehören zur Tag-Ebene und stehen in der Tag-Datei (`complete`). Festlegungen nach Eishockey-Vorbild: Penaltytore und Eigentore sind keine Torschüsse, Tore ins leere Tor und Penaltytore zählen nicht gegen den Torhüter, Überzahl und Unterzahl ergeben sich aus den Strafen.

## Aufstellung bei Toren und Plus/Minus

Bei jedem Tor aus dem Saisonmanager lassen sich die Feldspieler beider Teams eintragen, die auf dem Feld standen. Schütze und Vorlage sind automatisch dabei, Torhüter bekommen kein Plus/Minus. Es zählen Tore bei gleicher Stärke, Unterzahltore und Tore ins leere Tor (+1 für das erzielende Team, −1 für den Gegner). Überzahltore, Penaltytore und das Penaltyschießen zählen nicht. Ein Tor gilt als erfasst, wenn für beide Teams Spieler ausgewählt sind. Die Statistik zeigt, bei wie vielen zählenden Toren das der Fall ist. Aufstellungen gehören zur Tag-Ebene (`lineups` in der Tag-Datei), Tor-Clips tragen sie als Label „Auf dem Feld <Team>“.

## Teilen

Tags lassen sich über einen Link teilen, der Sync und Tags im Teil hinter `#ft=` trägt. Er öffnet das Spiel nur zum Ansehen. Kommentare in Tags stehen mit im Link, Namen nicht. Jugendspieler erscheinen dort immer nur mit Rückennummer.

## Labels im Export

Team, Abschnitt, Spielzeit, Ergebnis, Ort, Spieler / Gegenspieler (bzw. „Spieler <Team>“ beim Bully), Vorteil, Mit Vorteil gewonnen, Penaltyschießen, Kommentar. In der Gegenperspektive tauschen „Spieler“ und „Gegenspieler“.

## Offen

- Eigene Codes mit Farbe und Tastenkürzel, später als Katalog pro Verein.
