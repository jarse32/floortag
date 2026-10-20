#!/usr/bin/env bash
# Testet web/api/game.php gegen einen gefälschten Saisonmanager.
# Aufruf im Repo-Wurzelverzeichnis: bash tests/proxy-test.sh
set -u
cd "$(dirname "$0")/.."

UP=18790 PX=18791
TMP=$(mktemp -d)
HITS="$TMP/hits"; : > "$HITS"
CACHE=web/api/cache
BACKUP="$TMP/cache-backup"; mkdir -p "$BACKUP"
# Vorhandenen Cache sichern, Test startet leer
find "$CACHE" -maxdepth 1 -name '*.json' -exec mv {} "$BACKUP/" \;

HITS_FILE="$HITS" php -S 127.0.0.1:$UP tests/fake-upstream.php >/dev/null 2>&1 & UPID=$!; disown
SM_KEY=test-key SM_UPSTREAM="http://127.0.0.1:$UP/" FLOORTAG_DATA_DIR="$TMP/syncs" php -S 127.0.0.1:$PX -t web >/dev/null 2>&1 & PXPID=$!; disown
cleanup() {
  kill $UPID $PXPID 2>/dev/null
  rm -f "$CACHE"/*.json "$CACHE"/*.tmp
  find "$BACKUP" -name '*.json' -exec mv {} "$CACHE/" \;
  rm -rf "$TMP"
}
trap cleanup EXIT
sleep 0.7

FAILS=0
# check <Name> <erwarteter Status> <erwarteter X-Cache oder -> <URL-Pfad>
check() {
  local name=$1 want=$2 wantCache=$3 path=$4
  local out status cache
  out=$(curl -s -D "$TMP/h" -o "$TMP/body" -w '%{http_code}' "http://127.0.0.1:$PX$path")
  status=$out
  cache=$(grep -i '^x-cache:' "$TMP/h" | tr -d '\r' | awk '{print $2}')
  if [[ $status == "$want" && ( $wantCache == - || $cache == "$wantCache" ) ]]; then
    echo "ok    $name ($status ${cache:-})"
  else
    echo "FEHLER $name: erwartet $want/$wantCache, bekommen $status/${cache:-}"; FAILS=$((FAILS+1))
  fi
}
upstream_hits() { wc -l < "$HITS" | tr -d ' '; }

check "Erster Abruf geht zum Saisonmanager" 200 MISS "/api/game.php?id=58668"
check "Zweiter Abruf kommt aus dem Cache"   200 HIT  "/api/game.php?id=58668"
[[ $(upstream_hits) == 1 ]] && echo "ok    Saisonmanager nur einmal gefragt" || { echo "FEHLER Saisonmanager $(upstream_hits)-mal gefragt"; FAILS=$((FAILS+1)); }
grep -q '"id": *58668' "$TMP/body" && echo "ok    Antwort enthält das Spiel" || { echo "FEHLER Antwort ohne Spiel"; FAILS=$((FAILS+1)); }
grep -qi 'test-key' "$TMP/body" "$TMP/h" && { echo "FEHLER Key taucht in der Antwort auf"; FAILS=$((FAILS+1)); } || echo "ok    Key taucht nicht in der Antwort auf"
grep -qi '^access-control-allow-origin' "$TMP/h" && { echo "FEHLER CORS-Header gesetzt"; FAILS=$((FAILS+1)); } || echo "ok    Kein CORS-Header"

check "Ungültige ID"              400 - "/api/game.php?id=abc"
check "ID fehlt"                  400 - "/api/game.php"
check "Pfad-Trick wird abgewiesen" 400 - "/api/game.php?id=1/../../leagues"
check "Unbekanntes Spiel"         404 - "/api/game.php?id=123"
grep -q 'gibt es im Saisonmanager nicht' "$TMP/body" && echo "ok    Verständliche Fehlermeldung" || { echo "FEHLER Fehlermeldung: $(cat "$TMP/body")"; FAILS=$((FAILS+1)); }

check "Laufendes Spiel"           200 MISS "/api/game.php?id=77"
touch -t "$(date -v-2M +%Y%m%d%H%M.%S)" "$CACHE/game-77.json"
check "Laufendes Spiel nach 2 Min. neu geholt" 200 MISS "/api/game.php?id=77"

# Liga-Spielplan
check "Spielplan: erster Abruf"    200 MISS "/api/league.php?id=2449"
python3 -I - "$TMP/body" <<'PY' && echo "ok    Spielplan kompakt mit Liganame" || { echo "FEHLER Spielplan-Inhalt"; FAILS=$((FAILS+1)); }
import json, sys
d = json.load(open(sys.argv[1]))
assert d['league'] == {'id': 2449, 'name': '2. FBL Herren Nord/West'}, d['league']
assert [g['id'] for g in d['games']] == [58668, 58700]
assert d['games'][0] == {'id': 58668, 'date': '2026-10-10', 'time': '18:00', 'home': 'Baltic Storms', 'guest': 'TV Eiche Horn Bremen', 'result': '5:4', 'video': None}, d['games'][0]
assert d['games'][1]['result'] is None
assert 'referees' not in json.dumps(d) and 'logo' not in json.dumps(d)
PY
check "Spielplan aus dem Cache"     200 HIT  "/api/league.php?id=2449"
check "Spielplan: ungültige ID"     400 -    "/api/league.php?id=abc"
check "Spielplan: unbekannte Liga"  404 -    "/api/league.php?id=1"

# Veröffentlichte Syncs
# post <Name> <erwarteter Status> <JSON-Datei>
post() {
  local status
  status=$(curl -s -o "$TMP/body" -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data-binary "@$3" "http://127.0.0.1:$PX/api/sync.php")
  if [[ $status == "$2" ]]; then echo "ok    $1 ($status)"; else echo "FEHLER $1: erwartet $2, bekommen $status $(cat "$TMP/body")"; FAILS=$((FAILS+1)); fi
}
json() { python3 -I -c "import json,sys; d=json.load(open('$TMP/body')); print($1)"; }
cat > "$TMP/pub1.json" <<'J'
{"game_id": 58668, "video_id": "lfIFpRsE55I", "sync": {"format": "floortag-sync", "version": 2, "periods": {"1": {"start": 300, "end": 1920}, "9": {"start": 1}},
 "events": [{"event_id": 1, "period": 1, "time": "6:04", "video_sec": 900}, {"event_id": "x", "video_sec": 5}], "free_anchors": [], "not_in_video": [6],
 "period_length_sec": 1200, "tags": [{"code": "shot"}], "kommentar": "Max Mustermann"}}
J
post "Sync veröffentlichen"                 200 "$TMP/pub1.json"
TOKEN=$(json "d.get('token','')")
[[ ${#TOKEN} == 32 ]] && echo "ok    Bearbeitungsschlüssel erhalten" || { echo "FEHLER kein Schlüssel"; FAILS=$((FAILS+1)); }
check "Veröffentlichten Sync lesen"          200 - "/api/sync.php?video=lfIFpRsE55I"
python3 -I - "$TMP/body" <<'PY' && echo "ok    Nur Sync-Felder gespeichert" || { echo "FEHLER gespeicherter Inhalt"; FAILS=$((FAILS+1)); }
import json, sys
d = json.load(open(sys.argv[1])); s = d['sync']; raw = json.dumps(d)
assert d['version'] == 1 and d['game_id'] == 58668
assert list(s['periods']) == ['1'] and [e['event_id'] for e in s['events']] == [1] and s['not_in_video'] == [6]
assert 'tags' not in s and 'Mustermann' not in raw and 'token' not in raw
PY
post "Ändern ohne Schlüssel"                403 "$TMP/pub1.json"
python3 -I -c "import json;d=json.load(open('$TMP/pub1.json'));d['token']='$TOKEN';d['sync']['events'].append({'event_id':2,'video_sec':1100});json.dump(d,open('$TMP/pub2.json','w'))"
post "Ändern mit Schlüssel"                 200 "$TMP/pub2.json"
[[ $(json "d['version']") == 2 && -z $(json "d.get('token','')") ]] && echo "ok    Version 2, kein neuer Schlüssel" || { echo "FEHLER Version 2"; FAILS=$((FAILS+1)); }
check "Versionen auflisten"                  200 - "/api/sync.php?video=lfIFpRsE55I&versions=1"
[[ $(json "[v['version'] for v in d['versions']]") == "[2, 1]" ]] && echo "ok    Versionen 2 und 1" || { echo "FEHLER Versionsliste"; FAILS=$((FAILS+1)); }
check "Ältere Version lesen"                 200 - "/api/sync.php?video=lfIFpRsE55I&v=1"
[[ $(json "len(d['sync']['events'])") == 1 ]] && echo "ok    Version 1 unverändert" || { echo "FEHLER Version 1"; FAILS=$((FAILS+1)); }
check "Übersicht der Syncs"                  200 - "/api/sync.php?index=1"
[[ $(json "d['lfIFpRsE55I']['game_id'], d['lfIFpRsE55I']['version'], d['lfIFpRsE55I']['periods']") == "58668 2 1" ]] && echo "ok    Index aktuell" || { echo "FEHLER Index $(cat "$TMP/body")"; FAILS=$((FAILS+1)); }
check "Ohne Sync: 404"                       404 - "/api/sync.php?video=aaaaaaaaaaa"
check "Ungültige Video-ID"                   400 - "/api/sync.php?video=x"
python3 -I -c "import json;d=json.load(open('$TMP/pub1.json'));d['game_id']=123;d['video_id']='bbbbbbbbbbb';json.dump(d,open('$TMP/pub3.json','w'))"
post "Unbekanntes Spiel"                    404 "$TMP/pub3.json"
python3 -I -c "import json;d=json.load(open('$TMP/pub1.json'));d['video_id']='ccccccccccc';d['sync']['pad']='x'*250000;json.dump(d,open('$TMP/pub4.json','w'))"
post "Zu groß"                              413 "$TMP/pub4.json"
[[ -z $(find "$TMP/syncs" -name '*.json' -exec grep -l "$TOKEN" {} +) ]] && echo "ok    Schlüssel nicht im Klartext gespeichert" || { echo "FEHLER Schlüssel im Klartext"; FAILS=$((FAILS+1)); }

# Ausfall des Saisonmanagers: alte Kopie ausliefern
touch -t "$(date -v-2M +%Y%m%d%H%M.%S)" "$CACHE/game-77.json"
kill $UPID 2>/dev/null; sleep 0.3
check "Ausfall: alte Kopie wird geliefert" 200 STALE "/api/game.php?id=77"
check "Ausfall ohne Kopie"         502 - "/api/game.php?id=555"

# Budget: erschöpftes Budget blockiert neue Abrufe
echo "{\"minute\": $(( $(date +%s) / 60 )), \"count\": 999}" > "$CACHE/budget.json"
check "Budget erschöpft"           429 - "/api/game.php?id=556"
check "Budget erschöpft, Cache-Treffer geht trotzdem" 200 HIT "/api/game.php?id=58668"

echo
if (( FAILS )); then echo "$FAILS Test(s) fehlgeschlagen"; exit 1; fi
echo "Alle Tests bestanden"
