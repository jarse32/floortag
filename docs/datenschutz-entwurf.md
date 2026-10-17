# Entwurf: FloorTag in der Datenschutzerklärung

Ziel: `FloorballDashboard Website/datenschutz/index.html`. Stand des Entwurfs: 17.10.2026. Der Text beschreibt den Code zu diesem Zeitpunkt, also Proxy `web/api/game.php`, `web/js/storage.js`, `web/js/consent.js` und `web/js/player.js`.

Keine Rechtsberatung. Der Entwurf folgt dem Aufbau der bestehenden Erklärung und den üblichen Formulierungen für YouTube-Einbettungen mit Zwei-Klick-Lösung.

## Vor dem Einsetzen prüfen

- **Server-Logs:** Abschnitt 2 sagt, All-Inkl erfasst die IP-Adresse „anonymisiert“. Im KAS prüfen, ob das auch für die Subdomain `tag` eingestellt ist (Logfile-Einstellungen pro Domain).
- **Google Fonts auf der Hauptseite:** Abschnitt 4 erklärt Google Fonts für floorballdashboard.app. Das bleibt richtig, solange die Hauptseite die Schriften noch von Google lädt. FloorTag lädt sie selbst gehostet und braucht diesen Absatz nicht.
- **Neue Nummerierung:** Der neue Abschnitt wird 5. Danach werden „Cookies“ zu 6, „Ihre Rechte“ zu 7, „Beschwerderecht“ zu 8 und „Änderungen“ zu 9. Die Verweise im Text („Abschnitt 1 bis 4“) bleiben gültig.
- **Sprungmarke:** Der neue Block hat `id="floortag"`. Die Fußzeile von FloorTag verlinkt bereits auf `/datenschutz/#floortag`.

## 1. Zeile „Stand“ ersetzen (Zeile 39)

```html
  <p class="page-meta">Stand: Oktober 2026 &nbsp;·&nbsp; Gilt für die Webseite, die iOS- und Android-Apps „Floorball Dashboard" sowie FloorTag (tag.floorballdashboard.app)</p>
```

## 2. Neuer Abschnitt 5, nach Abschnitt 4 einfügen (nach Zeile 78)

```html
    <div class="legal-block" id="floortag">
      <h2><span class="num">5</span> FloorTag (tag.floorballdashboard.app)</h2>
      <p>FloorTag ist ein Werkzeug im Browser, mit dem sich Floorball-Spielvideos auf YouTube mit den offiziellen Spieldaten aus dem Saisonmanager verknüpfen lassen, etwa um Szenen anzuspringen oder Kapitelmarken für YouTube zu erstellen. FloorTag hat keine Nutzerkonten und fragt keine Angaben wie Name oder E-Mail-Adresse ab.</p>
      <p><strong>Aufruf der Seite:</strong> FloorTag wird wie diese Webseite bei All-Inkl.com – Neue Medien Münnich in Deutschland gehostet. Beim Aufruf fallen die in Abschnitt 2 beschriebenen Zugriffsdaten (Server-Logs) an. Schriftarten und alle übrigen Bestandteile der Seite werden ausschließlich von tag.floorballdashboard.app geladen. Bevor Sie der Einbettung eines Videos zustimmen (siehe unten), werden keine Server Dritter kontaktiert.</p>
      <p><strong>Spieldaten über einen eigenen Server:</strong> Wenn Sie ein Spiel laden, ruft FloorTag die Spieldaten nicht direkt beim Saisonmanager ab, sondern über einen eigenen Server unter tag.floorballdashboard.app, der die Anfrage an den Saisonmanager weiterleitet. Dabei wird technisch bedingt die IP-Adresse Ihres Geräts an diesen Server übermittelt, an den Saisonmanager wird sie nicht weitergegeben. Um den Saisonmanager zu entlasten, speichert der Server die abgerufenen Spieldaten zwischen: abgeschlossene Spiele bis zu 30 Tage, laufende Spiele bis zu 60 Sekunden. Dieser Zwischenspeicher enthält nur die öffentlichen Spieldaten und keine Angaben über Sie. Zum Schutz vor Überlastung zählt der Server lediglich, wie viele Anfragen pro Minute insgesamt an den Saisonmanager gehen; IP-Adressen werden dafür nicht gespeichert. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der Bereitstellung des Werkzeugs).</p>
      <p><strong>Daten von Spielerinnen und Spielern:</strong> FloorTag zeigt zu Toren und Strafen die Rückennummer und den Nachnamen aus dem Saisonmanager an. Spielerinnen und Spieler, die im Saisonmanager als Jugendliche gekennzeichnet sind, werden standardmäßig nur mit Rückennummer genannt. Im Übrigen gilt Abschnitt 3.</p>
      <p><strong>Speicherung in Ihrem Browser:</strong> Ihr Arbeitsstand (gesetzte Drittelgrenzen, Positionen der Ereignisse im Video und Ihre Einstellungen) wird im lokalen Speicher Ihres Browsers (localStorage) abgelegt, getrennt nach Spiel und Video. Wenn Sie bei der Videoeinbettung „Für FloorTag merken" wählen, wird dort außerdem diese Entscheidung gespeichert. Diese Daten verlassen Ihr Gerät nicht und werden nicht an uns übertragen. Sie bleiben gespeichert, bis Sie sie löschen, etwa über die Browsereinstellungen (Website-Daten für tag.floorballdashboard.app löschen). Die Speicherung ist für die von Ihnen gewünschte Funktion erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Eine Sync-Datei, die Sie über „Sync speichern" herunterladen, liegt allein auf Ihrem Gerät.</p>
      <p><strong>Eingebettete YouTube-Videos (Zwei-Klick-Lösung):</strong> Die Spielvideos liegen bei YouTube. Anbieter ist die Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland. FloorTag lädt den YouTube-Player erst, nachdem Sie auf „YouTube-Video laden" geklickt haben. Vorher werden keine Daten an YouTube oder Google übertragen, auch keine Vorschaubilder. Nach Ihrem Klick werden Inhalte von Servern von YouTube und Google geladen (u.&nbsp;a. youtube.com und youtube-nocookie.com). Dabei werden insbesondere Ihre IP-Adresse, die aufgerufene Seite und technische Angaben zu Ihrem Browser an Google übermittelt. FloorTag nutzt den erweiterten Datenschutzmodus von YouTube; YouTube kann dennoch Cookies oder ähnliche Techniken einsetzen, spätestens wenn Sie das Video abspielen. Eine Übermittlung in die USA ist möglich; Google LLC ist nach dem EU-US Data Privacy Framework zertifiziert. Rechtsgrundlage ist Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG). Ohne „Für FloorTag merken" gilt die Einwilligung nur, bis Sie die Seite neu laden oder schließen. Eine gemerkte Einwilligung können Sie jederzeit über den Link „YouTube-Zustimmung widerrufen" unten auf der FloorTag-Seite widerrufen; die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung bleibt davon unberührt. Weitere Informationen finden Sie in der <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Datenschutzerklärung von Google</a>.</p>
    </div>
```

## 3. Abschnitt „Cookies“ ersetzen (bisher Zeilen 80 bis 83, neue Nummer 6)

```html
    <div class="legal-block">
      <h2><span class="num">6</span> Cookies</h2>
      <p>Diese Webseite und FloorTag setzen selbst keine Cookies und verwenden keine Tracking-Technologien. FloorTag speichert Ihren Arbeitsstand im lokalen Speicher Ihres Browsers (siehe Abschnitt 5). Erst wenn Sie in FloorTag der Einbettung eines YouTube-Videos zustimmen, kann YouTube Cookies oder ähnliche Techniken einsetzen (siehe Abschnitt 5). Die Apps verwenden keine Cookies.</p>
    </div>
```

## 4. Abschnitt „Ihre Rechte“ (neue Nummer 7): Absatz ergänzen

Nummer im `<h2>` auf 7 ändern und nach dem Absatz „Für Daten von Spielerinnen und Spielern …“ (bisher Zeile 97) einfügen:

```html
      <p>Den Arbeitsstand und eine gemerkte YouTube-Einwilligung von FloorTag (siehe Abschnitt 5) speichert ausschließlich Ihr Browser; Sie können beides jederzeit selbst löschen. Bei uns liegen dazu keine Daten vor.</p>
```

## 5. Übrige Nummern anpassen

- „Beschwerderecht“: `<span class="num">8</span>`
- „Änderungen dieser Erklärung“: `<span class="num">9</span>`
