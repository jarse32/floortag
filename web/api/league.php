<?php
/**
 * FloorTag – Saisonmanager-Proxy für den Spielplan einer Liga
 *
 * Aufruf: GET api/league.php?id=2449   kompakter Spielplan (mit Spieltag) und Ligadaten
 *        GET api/league.php?list=1     Ligen von Floorball Deutschland der aktuellen Saison (Cache 1 Tag)
 * Quelle: https://saisonmanager.de/api/v2/leagues/{id}/schedule.json, leagues/{id}.json, game_operations/1/leagues
 *
 * Gleiche Regeln wie game.php: Key nur im Backend, Dateicache (1 Stunde, bei Ausfall alte Kopie),
 * gemeinsames Abrufbudget pro Minute (budget.json), kein CORS-Header.
 */

if (is_file(__DIR__ . '/config.php')) require_once __DIR__ . '/config.php';

const CACHE_DIR = __DIR__ . '/cache';
const TTL_SCHEDULE = 3600;           // Spielplan ändert sich mit jedem gespielten Spiel
const TTL_LIST = 24 * 3600;          // Ligenliste ändert sich nur zum Saisonwechsel
const GAME_OPERATION = 1;            // Floorball Deutschland
const UPSTREAM_TIMEOUT = 8;
const UPSTREAM_BUDGET_PER_MIN = 30;  // gemeinsam mit game.php

function api_key(): string {
    $k = getenv('SM_KEY');
    if ($k) return $k;
    return defined('SAISONMANAGER_API_KEY') ? SAISONMANAGER_API_KEY : '';
}
function upstream_base(): string {
    return getenv('SM_UPSTREAM') ?: 'https://saisonmanager.de/api/v2/';
}
function fail(int $status, string $message): never {
    http_response_code($status);
    header('Cache-Control: no-store');
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}
function send(string $body, string $cacheState): never {
    header('X-Cache: ' . $cacheState);
    header('Cache-Control: public, max-age=600');
    echo $body;
    exit;
}
function take_budget(): bool {
    $f = fopen(CACHE_DIR . '/budget.json', 'c+');
    if (!$f) return true;
    flock($f, LOCK_EX);
    $minute = intdiv(time(), 60);
    $data = json_decode(stream_get_contents($f) ?: '', true) ?: [];
    $count = ($data['minute'] ?? null) === $minute ? (int) $data['count'] : 0;
    $ok = $count < UPSTREAM_BUDGET_PER_MIN;
    if ($ok) {
        ftruncate($f, 0);
        rewind($f);
        fwrite($f, json_encode(['minute' => $minute, 'count' => $count + 1]));
    }
    flock($f, LOCK_UN);
    fclose($f);
    return $ok;
}
function upstream(string $path, string $key): array {
    $ch = curl_init(upstream_base() . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => UPSTREAM_TIMEOUT,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_USERAGENT => 'FloorTag/0.1 (tag.floorballdashboard.app)',
        CURLOPT_HTTPHEADER => ['X-Api-Key: ' . $key, 'Accept: application/json'],
    ]);
    $response = curl_exec($ch);
    return [curl_getinfo($ch, CURLINFO_HTTP_CODE), $response === false ? null : json_decode($response, true)];
}
// Nur die Felder, die die Übersicht braucht
function compact_game(array $g): array {
    $result = $g['result_string'] ?? ($g['result'] ?? null);
    return [
        'id' => $g['game_id'] ?? ($g['id'] ?? null),
        'date' => $g['date'] ?? null,
        'time' => $g['start_time'] ?? ($g['time'] ?? null),
        'home' => $g['home_team_name'] ?? '',
        'guest' => $g['guest_team_name'] ?? '',
        'result' => is_string($result) ? $result : null,
        'video' => $g['vod_link'] ?? ($g['live_stream_link'] ?? null),
        'day' => is_int($g['game_day'] ?? null) ? $g['game_day'] : (is_array($g['game_day'] ?? null) ? ($g['game_day']['game_day_number'] ?? null) : null),
    ];
}
// Ligadaten, die die Übersicht braucht (auch Drittellänge für später)
function compact_league(array $l): array {
    $titles = [];
    foreach ((array) ($l['game_day_titles'] ?? []) as $t) if (is_array($t) && isset($t['game_day_number'])) $titles[(string) $t['game_day_number']] = (string) ($t['title'] ?? '');
    return [
        'id' => $l['id'] ?? null, 'name' => $l['name'] ?? null, 'short' => $l['short_name'] ?? null,
        'class' => $l['league_class_name'] ?? null, 'order' => $l['order_key'] ?? null, 'season' => $l['season_id'] ?? null,
        'periods' => $l['periods'] ?? null, 'period_length' => $l['period_length'] ?? null, 'overtime_length' => $l['overtime_length'] ?? null,
        'day_titles' => (object) $titles,
    ];
}
function cached_or_fetch(string $cacheFile, int $ttl, callable $build): never {
    $cached = is_file($cacheFile) ? file_get_contents($cacheFile) : false;
    if ($cached !== false && time() - filemtime($cacheFile) < $ttl) send($cached, 'HIT');
    $key = api_key();
    if ($key === '') fail(500, 'Der Proxy ist nicht eingerichtet (API-Key fehlt).');
    if (!take_budget()) {
        if ($cached !== false) send($cached, 'STALE');
        fail(429, 'Gerade kommen zu viele Anfragen an. Versuch es in einer Minute noch einmal.');
    }
    set_time_limit(2 * UPSTREAM_TIMEOUT + 5);
    [$status, $body] = $build($key);
    if ($body !== null) {
        $tmp = $cacheFile . '.' . getmypid() . '.tmp';
        if (@file_put_contents($tmp, $body) !== false) @rename($tmp, $cacheFile);
        send($body, 'MISS');
    }
    if ($cached !== false) send($cached, 'STALE');
    if ($status === 404) fail(404, 'Diese Liga gibt es im Saisonmanager nicht.');
    if ($status === 401 || $status === 403) fail(502, 'Der Saisonmanager hat den API-Key abgelehnt.');
    fail(502, 'Der Saisonmanager ist gerade nicht erreichbar.');
}

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') fail(405, 'Nur GET-Anfragen sind erlaubt.');
if (!is_dir(CACHE_DIR)) @mkdir(CACHE_DIR, 0755, true);
$enc = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

// Ligen von Floorball Deutschland (aktuelle Saison)
if (isset($_GET['list'])) {
    cached_or_fetch(CACHE_DIR . '/leagues-fd.json', TTL_LIST, function (string $key) use ($enc) {
        [$status, $list] = upstream('game_operations/' . GAME_OPERATION . '/leagues', $key);
        if ($status !== 200 || !is_array($list)) return [$status, null];
        $leagues = array_map('compact_league', array_values(array_filter($list, 'is_array')));
        $season = max(array_map(fn($l) => (int) $l['season'], $leagues) ?: [0]);
        $leagues = array_values(array_filter($leagues, fn($l) => (int) $l['season'] === $season));
        usort($leagues, fn($a, $b) => ($a['order'] ?? 999) <=> ($b['order'] ?? 999));
        return [200, json_encode(['leagues' => $leagues], $enc)];
    });
}

$id = $_GET['id'] ?? '';
if (!preg_match('/^\d{1,9}$/', $id)) fail(400, 'Die Liga-ID muss eine Zahl sein.');

// Spielplan einer Liga (Cache-Datei mit Formatversion, damit alte Fassungen ohne Spieltag nicht greifen)
cached_or_fetch(CACHE_DIR . "/league2-$id.json", TTL_SCHEDULE, function (string $key) use ($id, $enc) {
    [$status, $schedule] = upstream("leagues/$id/schedule.json", $key);
    if ($status !== 200 || !is_array($schedule)) return [$status, null];
    $list = isset($schedule['games']) && is_array($schedule['games']) ? $schedule['games'] : $schedule;
    $games = array_values(array_filter(array_map('compact_game', array_filter($list, 'is_array')), fn($g) => $g['id'] !== null));
    // Ligadaten: eigener kleiner Abruf, darf fehlen
    $league = ['id' => (int) $id, 'name' => null];
    if (take_budget()) {
        [$ls, $l] = upstream("leagues/$id.json", $key);
        if ($ls === 200 && is_array($l)) $league = ['id' => (int) $id] + array_diff_key(compact_league($l), ['id' => 1]);
    }
    return [200, json_encode(['league' => $league, 'games' => $games], $enc)];
});
