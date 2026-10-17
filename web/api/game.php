<?php
/**
 * FloorTag – Saisonmanager-Proxy für ein einzelnes Spiel
 *
 * Aufruf: GET api/game.php?id=58668
 * Liefert die Spiel-JSON aus https://saisonmanager.de/api/v2/games/{id}.json.
 * Der API-Key bleibt ausschließlich hier im Backend.
 *
 * - Key aus der Umgebungsvariable SM_KEY (lokal) oder aus config.php (Hosting)
 * - Dateicache: abgeschlossene Spiele lange, laufende nur kurz; bei Ausfall
 *   des Saisonmanagers wird eine vorhandene alte Kopie ausgeliefert
 * - Globales Abrufbudget pro Minute statt IP-Sperren: schützt das Kontingent
 *   des Keys, ohne personenbezogene Daten zu speichern
 * - Kein CORS-Header: Nur das Frontend auf derselben Adresse darf lesen
 */

if (is_file(__DIR__ . '/config.php')) require_once __DIR__ . '/config.php';

const CACHE_DIR = __DIR__ . '/cache';
const TTL_CLOSED = 30 * 24 * 3600;   // abgeschlossene Spiele ändern sich kaum
const TTL_OPEN = 60;                 // laufende oder unvollständige Spiele
const UPSTREAM_TIMEOUT = 8;
const UPSTREAM_BUDGET_PER_MIN = 30;  // Abrufe beim Saisonmanager pro Minute, für alle Nutzer zusammen

function api_key(): string {
    $k = getenv('SM_KEY');
    if ($k) return $k;
    return defined('SAISONMANAGER_API_KEY') ? SAISONMANAGER_API_KEY : '';
}
function upstream_base(): string {
    // SM_UPSTREAM nur für Tests mit einem lokalen Fake-Server
    return getenv('SM_UPSTREAM') ?: 'https://saisonmanager.de/api/v2/';
}
function fail(int $status, string $message): never {
    http_response_code($status);
    header('Cache-Control: no-store');
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}
function is_closed(array $game): bool {
    return ($game['game_status'] ?? '') === 'match_record_closed' && !empty($game['ended']);
}
function send_game(string $body, bool $closed, string $cacheState): never {
    header('X-Cache: ' . $cacheState);
    header('Cache-Control: ' . ($closed ? 'public, max-age=86400' : 'no-store'));
    echo $body;
    exit;
}
// Zählt Abrufe pro Minute in einer Datei; false, wenn das Budget erschöpft ist
function take_budget(): bool {
    $f = fopen(CACHE_DIR . '/budget.json', 'c+');
    if (!$f) return true; // ohne Zähler lieber ausliefern als blockieren
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

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') fail(405, 'Nur GET-Anfragen sind erlaubt.');
$id = $_GET['id'] ?? '';
if (!preg_match('/^\d{1,9}$/', $id)) fail(400, 'Die Spiel-ID muss eine Zahl sein.');

if (!is_dir(CACHE_DIR)) @mkdir(CACHE_DIR, 0755, true);
$cacheFile = CACHE_DIR . "/game-$id.json";

// ── Cache ──
$cached = is_file($cacheFile) ? file_get_contents($cacheFile) : false;
$cachedGame = $cached !== false ? json_decode($cached, true) : null;
if (is_array($cachedGame)) {
    $closed = is_closed($cachedGame);
    $age = time() - filemtime($cacheFile);
    if ($age < ($closed ? TTL_CLOSED : TTL_OPEN)) send_game($cached, $closed, 'HIT');
}

// ── Saisonmanager ──
$key = api_key();
if ($key === '') fail(500, 'Der Proxy ist nicht eingerichtet (API-Key fehlt).');
if (!take_budget()) {
    if (is_array($cachedGame)) send_game($cached, is_closed($cachedGame), 'STALE');
    fail(429, 'Gerade kommen zu viele Anfragen an. Versuch es in einer Minute noch einmal.');
}

set_time_limit(UPSTREAM_TIMEOUT + 5);
$ch = curl_init(upstream_base() . "games/$id.json");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => UPSTREAM_TIMEOUT,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_USERAGENT => 'FloorTag/0.1 (tag.floorballdashboard.app)',
    CURLOPT_HTTPHEADER => ['X-Api-Key: ' . $key, 'Accept: application/json'],
]);
$response = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
// Kein curl_close(): seit PHP 8.0 wirkungslos, seit 8.5 deprecated

$game = ($response !== false && $status === 200) ? json_decode($response, true) : null;
if (is_array($game) && isset($game['id'])) {
    // Atomar schreiben, damit parallele Aufrufe nie eine halbe Datei lesen
    $tmp = $cacheFile . '.' . getmypid() . '.tmp';
    if (@file_put_contents($tmp, $response) !== false) @rename($tmp, $cacheFile);
    send_game($response, is_closed($game), 'MISS');
}

// Fehlschlag: alte Kopie ist besser als nichts
if (is_array($cachedGame)) send_game($cached, is_closed($cachedGame), 'STALE');
if ($status === 404) fail(404, "Spiel $id gibt es im Saisonmanager nicht.");
if ($status === 401 || $status === 403) fail(502, 'Der Saisonmanager hat den API-Key abgelehnt.');
fail(502, 'Der Saisonmanager ist gerade nicht erreichbar.');
