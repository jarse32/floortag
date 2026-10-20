<?php
/**
 * FloorTag – veröffentlichte Syncs (gemeinsamer Sync pro Video, Zwischenlösung bis Etappe 4)
 *
 * GET  api/sync.php?video=ID              neueste Version   → { game_id, video_id, version, updated, versions, sync }
 * GET  api/sync.php?video=ID&v=3          bestimmte Version
 * GET  api/sync.php?video=ID&versions=1   Liste der Versionen
 * GET  api/sync.php?index=1               alle veröffentlichten Syncs kurz (für die Übersicht)
 * POST api/sync.php                       { game_id, video_id, sync, token? } → { version, updated, token? }
 *
 * - Gespeichert wird nur die Sync-Ebene (Drittelgrenzen, Positionen der Saisonmanager-Ereignisse,
 *   freie Anker, „nicht im Video“, Längen). Keine Tags, keine Namen, keine IP-Adressen.
 * - Beim ersten Veröffentlichen entsteht ein Bearbeitungsschlüssel; gespeichert wird nur sein SHA-256-Hash.
 * - Jede Version bleibt erhalten (bis MAX_VERSIONS), damit sich Fehler zurückdrehen lassen.
 * - Schutz: Spiel muss im Saisonmanager existieren, Größengrenze, Schreibbudget pro Minute, kein CORS.
 */

if (is_file(__DIR__ . '/config.php')) require_once __DIR__ . '/config.php';

define('DATA_DIR', getenv('FLOORTAG_DATA_DIR') ?: __DIR__ . '/data/syncs'); // Umgebungsvariable nur für Tests
const CACHE_DIR = __DIR__ . '/cache';
const MAX_BODY = 200000;
const MAX_VERSIONS = 50;
const WRITE_BUDGET_PER_MIN = 20;
const UPSTREAM_TIMEOUT = 8;

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function fail(int $status, string $message): never {
    http_response_code($status);
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}
function out(array $data): never {
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function video_ok(string $v): bool { return (bool) preg_match('/^[\w-]{11}$/', $v); }
function read_json(string $file): ?array {
    if (!is_file($file)) return null;
    $d = json_decode((string) file_get_contents($file), true);
    return is_array($d) ? $d : null;
}
function write_json(string $file, array $data): void {
    $tmp = $file . '.' . getmypid() . '.tmp';
    file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    rename($tmp, $file);
}
function num($v, float $min, float $max): ?float {
    return (is_int($v) || is_float($v)) && $v >= $min && $v <= $max ? round((float) $v, 1) : null;
}

// Nur bekannte Felder der Sync-Datei übernehmen
function sanitize_sync(array $s, int $gameId, string $video): array {
    $periods = [];
    foreach ((array) ($s['periods'] ?? []) as $p => $b) {
        if (!in_array((string) $p, ['1', '2', '3', '4', '5'], true) || !is_array($b)) continue;
        $start = num($b['start'] ?? null, 0, 86400); $end = num($b['end'] ?? null, 0, 86400);
        if ($start === null && $end === null) continue;
        $periods[(string) $p] = ['start' => $start, 'end' => $end];
    }
    $events = [];
    foreach ((array) ($s['events'] ?? []) as $e) {
        if (!is_array($e) || !is_int($e['event_id'] ?? null)) continue;
        $v = num($e['video_sec'] ?? null, 0, 86400);
        if ($v === null) continue;
        $events[] = ['event_id' => $e['event_id'], 'period' => is_numeric($e['period'] ?? null) ? $e['period'] + 0 : null,
            'time' => is_string($e['time'] ?? null) ? substr($e['time'], 0, 8) : null, 'video_sec' => $v];
        if (count($events) >= 500) break;
    }
    $anchors = [];
    foreach ((array) ($s['free_anchors'] ?? []) as $a) {
        if (!is_array($a) || !is_int($a['period'] ?? null) || !preg_match('/^\d{1,3}:\d{2}$/', (string) ($a['time'] ?? ''))) continue;
        $v = num($a['video_sec'] ?? null, 0, 86400);
        if ($v !== null) $anchors[] = ['period' => $a['period'], 'time' => $a['time'], 'video_sec' => $v];
        if (count($anchors) >= 100) break;
    }
    $missing = array_values(array_slice(array_filter((array) ($s['not_in_video'] ?? []), 'is_int'), 0, 500));
    $len = fn($k, $min, $max) => is_int($s[$k] ?? null) && $s[$k] >= $min && $s[$k] <= $max ? $s[$k] : null;
    return [
        'format' => 'floortag-sync', 'version' => 2, 'game_id' => $gameId, 'video_id' => $video,
        'period_length_sec' => $len('period_length_sec', 300, 1800), 'overtime_length_sec' => $len('overtime_length_sec', 60, 1200),
        'pause_length_sec' => $len('pause_length_sec', 60, 1800),
        'periods' => (object) $periods, 'events' => $events, 'free_anchors' => $anchors, 'not_in_video' => $missing
    ];
}
function summary(array $sync): array {
    $done = 0;
    foreach ((array) $sync['periods'] as $b) if (($b['start'] ?? null) !== null && ($b['end'] ?? null) !== null) $done++;
    return ['events' => count($sync['events']) + count($sync['not_in_video']), 'periods' => $done];
}

// Schreibbudget pro Minute für alle zusammen (keine IP-Adressen)
function take_write_budget(): bool {
    @mkdir(DATA_DIR, 0755, true);
    $f = fopen(DATA_DIR . '/budget.json', 'c+');
    if (!$f) return true;
    flock($f, LOCK_EX);
    $minute = intdiv(time(), 60);
    $d = json_decode(stream_get_contents($f) ?: '', true) ?: [];
    $count = ($d['minute'] ?? null) === $minute ? (int) $d['count'] : 0;
    $ok = $count < WRITE_BUDGET_PER_MIN;
    if ($ok) { ftruncate($f, 0); rewind($f); fwrite($f, json_encode(['minute' => $minute, 'count' => $count + 1])); }
    flock($f, LOCK_UN); fclose($f);
    return $ok;
}

// Gibt es das Spiel im Saisonmanager? Zuerst der Cache von game.php, sonst kurzer Abruf
function game_exists(int $id): bool {
    if (is_file(CACHE_DIR . "/game-$id.json")) return true;
    $key = getenv('SM_KEY') ?: (defined('SAISONMANAGER_API_KEY') ? SAISONMANAGER_API_KEY : '');
    if ($key === '') return false;
    $ch = curl_init((getenv('SM_UPSTREAM') ?: 'https://saisonmanager.de/api/v2/') . "games/$id.json");
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => UPSTREAM_TIMEOUT, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_USERAGENT => 'FloorTag/0.1 (tag.floorballdashboard.app)', CURLOPT_HTTPHEADER => ['X-Api-Key: ' . $key]]);
    $body = curl_exec($ch);
    $game = curl_getinfo($ch, CURLINFO_HTTP_CODE) === 200 ? json_decode((string) $body, true) : null;
    return is_array($game) && ($game['id'] ?? null) === $id;
}

$method = $_SERVER['REQUEST_METHOD'];

// ===== Lesen =====
if ($method === 'GET') {
    if (isset($_GET['index'])) out(read_json(DATA_DIR . '/index.json') ?? []);
    $video = (string) ($_GET['video'] ?? '');
    if (!video_ok($video)) fail(400, 'Ungültige Video-ID.');
    $meta = read_json(DATA_DIR . "/$video/meta.json");
    if (!$meta) fail(404, 'Für dieses Video gibt es noch keinen veröffentlichten Sync.');
    if (isset($_GET['versions'])) {
        $list = [];
        for ($n = $meta['versions']; $n >= 1; $n--) {
            $v = read_json(DATA_DIR . "/$video/v$n.json");
            if ($v) $list[] = ['version' => $n, 'created' => $v['created']] + summary($v['sync']);
        }
        out(['video_id' => $video, 'versions' => $list]);
    }
    $n = isset($_GET['v']) && ctype_digit((string) $_GET['v']) ? (int) $_GET['v'] : $meta['versions'];
    $v = read_json(DATA_DIR . "/$video/v$n.json");
    if (!$v) fail(404, "Version $n gibt es nicht (mehr).");
    out(['game_id' => $meta['game_id'], 'video_id' => $video, 'version' => $n, 'latest' => $meta['versions'],
        'updated' => $v['created'], 'sync' => $v['sync']]);
}

// ===== Veröffentlichen =====
if ($method !== 'POST') fail(405, 'Nur GET und POST sind erlaubt.');
$raw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
if (strlen((string) $raw) > MAX_BODY) fail(413, 'Der Sync ist zu groß.');
$in = json_decode((string) $raw, true);
if (!is_array($in) || !is_array($in['sync'] ?? null)) fail(400, 'Ungültige Anfrage.');
$video = (string) ($in['video_id'] ?? '');
$gameId = $in['game_id'] ?? null;
if (!video_ok($video)) fail(400, 'Ungültige Video-ID.');
if (!is_int($gameId) || $gameId <= 0) fail(400, 'Ungültige Spiel-ID.');
if (($in['sync']['format'] ?? '') !== 'floortag-sync') fail(400, 'Das ist keine FloorTag-Sync-Datei.');
if (!take_write_budget()) fail(429, 'Gerade wird viel veröffentlicht. Versuch es in einer Minute noch einmal.');

$dir = DATA_DIR . "/$video";
@mkdir($dir, 0755, true);
$lock = fopen("$dir/.lock", 'c');
flock($lock, LOCK_EX);
$meta = read_json("$dir/meta.json");
$token = null;
if ($meta) {
    $given = (string) ($in['token'] ?? '');
    if ($given === '' || !hash_equals($meta['token_hash'], hash('sha256', $given))) fail(403, 'Der Bearbeitungsschlüssel fehlt oder passt nicht.');
    if ($meta['game_id'] !== $gameId) fail(409, 'Dieses Video gehört zu einem anderen Spiel.');
} else {
    if (!game_exists($gameId)) fail(404, "Spiel $gameId gibt es im Saisonmanager nicht.");
    $token = bin2hex(random_bytes(16));
    $meta = ['game_id' => $gameId, 'video_id' => $video, 'token_hash' => hash('sha256', $token), 'versions' => 0, 'created' => date('c')];
}

$sync = sanitize_sync($in['sync'], $gameId, $video);
$n = $meta['versions'] + 1;
$now = date('c');
write_json("$dir/v$n.json", ['version' => $n, 'created' => $now, 'sync' => $sync]);
if ($n - MAX_VERSIONS >= 1) @unlink("$dir/v" . ($n - MAX_VERSIONS) . '.json');
$meta['versions'] = $n;
$meta['updated'] = $now;
write_json("$dir/meta.json", $meta);

// Übersicht aller veröffentlichten Syncs
$idxFile = DATA_DIR . '/index.json';
$idx = read_json($idxFile) ?? [];
$idx[$video] = ['game_id' => $gameId, 'version' => $n, 'updated' => $now] + summary($sync);
write_json($idxFile, $idx);
flock($lock, LOCK_UN);

out(['version' => $n, 'updated' => $now] + ($token ? ['token' => $token] : []));
