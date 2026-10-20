<?php
/**
 * FloorTag – Saisonmanager-Proxy für den Spielplan einer Liga
 *
 * Aufruf: GET api/league.php?id=2449
 * Liefert eine kompakte Fassung von https://saisonmanager.de/api/v2/leagues/{id}/schedule.json
 * (nur die Felder, die die Übersicht braucht) und, soweit verfügbar, den Liganamen.
 *
 * Gleiche Regeln wie game.php: Key nur im Backend, Dateicache (1 Stunde, bei Ausfall alte Kopie),
 * gemeinsames Abrufbudget pro Minute (budget.json), kein CORS-Header.
 */

if (is_file(__DIR__ . '/config.php')) require_once __DIR__ . '/config.php';

const CACHE_DIR = __DIR__ . '/cache';
const TTL_SCHEDULE = 3600;           // Spielplan ändert sich mit jedem gespielten Spiel
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
    ];
}

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') fail(405, 'Nur GET-Anfragen sind erlaubt.');
$id = $_GET['id'] ?? '';
if (!preg_match('/^\d{1,9}$/', $id)) fail(400, 'Die Liga-ID muss eine Zahl sein.');

if (!is_dir(CACHE_DIR)) @mkdir(CACHE_DIR, 0755, true);
$cacheFile = CACHE_DIR . "/league-$id.json";
$cached = is_file($cacheFile) ? file_get_contents($cacheFile) : false;
if ($cached !== false && time() - filemtime($cacheFile) < TTL_SCHEDULE) send($cached, 'HIT');

$key = api_key();
if ($key === '') fail(500, 'Der Proxy ist nicht eingerichtet (API-Key fehlt).');
if (!take_budget()) {
    if ($cached !== false) send($cached, 'STALE');
    fail(429, 'Gerade kommen zu viele Anfragen an. Versuch es in einer Minute noch einmal.');
}

set_time_limit(2 * UPSTREAM_TIMEOUT + 5);
[$status, $schedule] = upstream("leagues/$id/schedule.json", $key);
if ($status === 200 && is_array($schedule)) {
    $list = isset($schedule['games']) && is_array($schedule['games']) ? $schedule['games'] : $schedule;
    $games = array_values(array_filter(array_map('compact_game', array_filter($list, 'is_array')), fn($g) => $g['id'] !== null));
    // Liganame: eigener kleiner Abruf, darf fehlen
    $name = null;
    if (take_budget()) {
        [$ls, $league] = upstream("leagues/$id.json", $key);
        if ($ls === 200 && is_array($league)) $name = $league['name'] ?? ($league['league_name'] ?? null);
    }
    $body = json_encode(['league' => ['id' => (int) $id, 'name' => $name], 'games' => $games], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $tmp = $cacheFile . '.' . getmypid() . '.tmp';
    if (@file_put_contents($tmp, $body) !== false) @rename($tmp, $cacheFile);
    send($body, 'MISS');
}

if ($cached !== false) send($cached, 'STALE');
if ($status === 404) fail(404, "Liga $id gibt es im Saisonmanager nicht.");
if ($status === 401 || $status === 403) fail(502, 'Der Saisonmanager hat den API-Key abgelehnt.');
fail(502, 'Der Saisonmanager ist gerade nicht erreichbar.');
