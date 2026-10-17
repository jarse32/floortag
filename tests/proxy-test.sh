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
SM_KEY=test-key SM_UPSTREAM="http://127.0.0.1:$UP/" php -S 127.0.0.1:$PX -t web >/dev/null 2>&1 & PXPID=$!; disown
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
