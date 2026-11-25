<?php
/**
 * FloorTag – veröffentlichte Syncs (gemeinsamer Sync pro Video, Zwischenlösung bis Etappe 4)
 *
 * GET  api/sync.php?video=ID              neueste Version   → { game_id, video_id, version, updated, versions, sync }
 * GET  api/sync.php?video=ID&v=3          bestimmte Version
 * GET  api/sync.php?video=ID&versions=1   Liste der Versionen
 * GET  api/sync.php?index=1               alle veröffentlichten Syncs kurz (für die Übersicht)
 * GET  api/sync.php?video=ID&proposals=1  offene Änderungsvorschläge
 * POST api/sync.php                       { game_id, video_id, sync, token? } → { version, updated, token? }
 *      ohne Schlüssel bei bestehendem Sync: Ergänzungen werden sofort neue Version, Änderungen an schon
 *      Gesetztem werden ein Vorschlag → { version, added, changes, proposal, unchanged }
 * POST api/sync.php                       { action: accept|reject, video_id, proposal_id, token } (nur mit Schlüssel)
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
const MAX_PROPOSALS = 20;
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
    $fixes = [];
    foreach ((array) ($s['game_time_fixes'] ?? []) as $f) {
        if (!is_array($f) || !is_int($f['event_id'] ?? null) || !preg_match('/^\d{1,3}:\d{2}$/', (string) ($f['time'] ?? ''))) continue;
        $fixes[] = ['event_id' => $f['event_id'], 'time' => $f['time']];
        if (count($fixes) >= 100) break;
    }
    $ppStarts = [];
    foreach ((array) ($s['pp_starts'] ?? []) as $x) {
        if (!is_array($x) || !is_int($x['event_id'] ?? null)) continue;
        $v = num($x['video_sec'] ?? null, 0, 86400);
        if ($v !== null) $ppStarts[] = ['event_id' => $x['event_id'], 'video_sec' => $v];
        if (count($ppStarts) >= 100) break;
    }
    $len = fn($k, $min, $max) => is_int($s[$k] ?? null) && $s[$k] >= $min && $s[$k] <= $max ? $s[$k] : null;
    return [
        'format' => 'floortag-sync', 'version' => 2, 'game_id' => $gameId, 'video_id' => $video,
        'period_length_sec' => $len('period_length_sec', 300, 1800), 'overtime_length_sec' => $len('overtime_length_sec', 60, 1200),
        'pause_length_sec' => $len('pause_length_sec', 60, 1800), 'pp_delay_sec' => $len('pp_delay_sec', 0, 180),
        'periods' => (object) $periods, 'events' => $events, 'free_anchors' => $anchors, 'not_in_video' => $missing, 'game_time_fixes' => $fixes, 'pp_starts' => $ppStarts
    ];
}
function summary(array $sync): array {
    $done = 0;
    foreach ((array) $sync['periods'] as $b) if (($b['start'] ?? null) !== null && ($b['end'] ?? null) !== null) $done++;
    return ['events' => count($sync['events']) + count($sync['not_in_video']), 'periods' => $done];
}

// ===== Ergänzungen und Änderungen =====
// Ein Sync als Liste einzelner Einträge: Schlüssel → [Vergleichswert, Datensatz].
// p1.start / p1.end, e<id> (gesetztes Ereignis), m<id> („nicht im Video“), pp<id> (Beginn Überzahl),
// f<id> (Spielzeitkorrektur), a<Abschnitt>:<Zeit> (freier Anker), s.<Feld> (Längen und Einstellungen).
const SETTING_FIELDS = ['period_length_sec', 'overtime_length_sec', 'pause_length_sec', 'pp_delay_sec'];
function sync_items(array $s): array {
    $items = [];
    foreach ((array) $s['periods'] as $p => $b) foreach (['start', 'end'] as $k) {
        if (($b[$k] ?? null) !== null) $items["p$p.$k"] = [$b[$k], $b[$k]];
    }
    foreach ($s['events'] as $e) $items["e{$e['event_id']}"] = [$e['video_sec'], $e];
    foreach ($s['not_in_video'] as $id) $items["m$id"] = [1, $id];
    foreach ($s['pp_starts'] as $x) $items["pp{$x['event_id']}"] = [$x['video_sec'], $x];
    foreach ($s['game_time_fixes'] as $f) $items["f{$f['event_id']}"] = [$f['time'], $f];
    foreach ($s['free_anchors'] as $a) $items["a{$a['period']}:{$a['time']}"] = [$a['video_sec'], $a];
    foreach (SETTING_FIELDS as $k) if (($s[$k] ?? null) !== null) $items["s.$k"] = [$s[$k], $s[$k]];
    return $items;
}
function items_sync(array $items, int $gameId, string $video): array {
    $s = ['periods' => [], 'events' => [], 'not_in_video' => [], 'pp_starts' => [], 'game_time_fixes' => [], 'free_anchors' => []];
    foreach ($items as $key => [, $rec]) {
        if (preg_match('/^p(\d)\.(start|end)$/', $key, $m)) $s['periods'][$m[1]][$m[2]] = $rec;
        elseif ($key[0] === 'e') $s['events'][] = $rec;
        elseif ($key[0] === 'm') $s['not_in_video'][] = $rec;
        elseif (str_starts_with($key, 'pp')) $s['pp_starts'][] = $rec;
        elseif ($key[0] === 'f') $s['game_time_fixes'][] = $rec;
        elseif ($key[0] === 'a') $s['free_anchors'][] = $rec;
        elseif (str_starts_with($key, 's.')) $s[substr($key, 2)] = $rec;
    }
    usort($s['events'], fn($a, $b) => $a['video_sec'] <=> $b['video_sec']);
    return sanitize_sync($s + ['format' => 'floortag-sync'], $gameId, $video);
}
function same_value($a, $b): bool {
    return is_float($a) || is_float($b) || is_int($a) || is_int($b) ? abs((float) $a - (float) $b) < 0.05 : $a === $b;
}
// Vergleich mit dem veröffentlichten Stand: [Ergänzungen, Änderungen].
// Ergänzung = neuer Eintrag, der nichts Bestehendes berührt. Änderung = anderer Wert, entfernter Eintrag,
// Ereignis gesetzt, das als „nicht im Video“ markiert war (und umgekehrt), oder eine Spielzeitkorrektur.
// Längen und Einstellungen, die im neuen Stand fehlen, bleiben einfach, wie sie sind.
function diff_items(array $old, array $new): array {
    $adds = []; $changes = [];
    foreach ($new as $key => [$v, $rec]) {
        if (isset($old[$key])) {
            if (!same_value($old[$key][0], $v)) $changes[] = ['key' => $key, 'old' => $old[$key][0], 'new' => $v, 'rec' => $rec];
            continue;
        }
        $id = preg_replace('/^(e|m)/', '', $key);
        $clash = ($key[0] === 'e' && isset($old["m$id"])) || ($key[0] === 'm' && isset($old["e$id"])) || $key[0] === 'f';
        if ($clash) $changes[] = ['key' => $key, 'old' => null, 'new' => $v, 'rec' => $rec];
        else $adds[$key] = [$v, $rec];
    }
    foreach ($old as $key => [$v]) {
        if (!isset($new[$key]) && !str_starts_with($key, 's.')) $changes[] = ['key' => $key, 'old' => $v, 'new' => null, 'rec' => null];
    }
    return [$adds, $changes];
}
function apply_changes(array $items, array $changes): array {
    foreach ($changes as $c) {
        if ($c['new'] === null) unset($items[$c['key']]); else $items[$c['key']] = [$c['new'], $c['rec']];
    }
    return $items;
}
// Eckdaten des Spiels für die Übersicht „Zuletzt gesynct“ aus dem Cache von game.php (nur Teams, Liga, Datum, Ergebnis)
function game_info(int $id): array {
    $g = read_json(CACHE_DIR . "/game-$id.json");
    if (!is_array($g) || ($g['id'] ?? null) !== $id) return [];
    $str = fn($v) => is_string($v) ? mb_substr($v, 0, 80) : null;
    return array_filter(['home' => $str($g['home_team_name'] ?? null), 'guest' => $str($g['guest_team_name'] ?? null),
        'date' => $str($g['date'] ?? null), 'league' => $str($g['league_name'] ?? null),
        'league_id' => is_int($g['league_id'] ?? null) ? $g['league_id'] : null, 'result' => $str($g['result_string'] ?? null)],
        fn($v) => $v !== null);
}

// Neue Version schreiben und den Index nachziehen; gibt die Versionsnummer zurück
function write_version(string $dir, array &$meta, array $sync): int {
    $n = $meta['versions'] + 1;
    $now = date('c');
    write_json("$dir/v$n.json", ['version' => $n, 'created' => $now, 'sync' => $sync]);
    if ($n - MAX_VERSIONS >= 1) @unlink("$dir/v" . ($n - MAX_VERSIONS) . '.json');
    $meta['versions'] = $n;
    $meta['updated'] = $now;
    write_json("$dir/meta.json", $meta);
    $idxFile = DATA_DIR . '/index.json';
    $idx = read_json($idxFile) ?? [];
    $idx[$meta['video_id']] = ['game_id' => $meta['game_id'], 'version' => $n, 'updated' => $now] + summary($sync) + game_info($meta['game_id']);
    write_json($idxFile, $idx);
    return $n;
}
function latest_sync(string $dir, array $meta): array {
    return (read_json("$dir/v{$meta['versions']}.json") ?? [])['sync'] ?? items_sync([], $meta['game_id'], $meta['video_id']);
}
// Für die Anzeige: Änderungen ohne Datensatz
function public_changes(array $changes): array {
    return array_map(fn($c) => ['key' => $c['key'], 'old' => $c['old'], 'new' => $c['new']], $changes);
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
    if (isset($_GET['index'])) {
        // Ältere Einträge ohne Eckdaten einmal aus dem Cache von game.php ergänzen
        $idx = read_json(DATA_DIR . '/index.json') ?? [];
        $changed = false;
        foreach ($idx as $v => $e) {
            if (isset($e['home']) || !is_int($e['game_id'] ?? null)) continue;
            $info = game_info($e['game_id']);
            if ($info) { $idx[$v] = $e + $info; $changed = true; }
        }
        if ($changed) write_json(DATA_DIR . '/index.json', $idx);
        out($idx);
    }
    $video = (string) ($_GET['video'] ?? '');
    if (!video_ok($video)) fail(400, 'Ungültige Video-ID.');
    $meta = read_json(DATA_DIR . "/$video/meta.json");
    if (!$meta) fail(404, 'Für dieses Video gibt es noch keinen veröffentlichten Sync.');
    if (isset($_GET['proposals'])) {
        $list = read_json(DATA_DIR . "/$video/proposals.json") ?? [];
        out(['video_id' => $video, 'proposals' => array_map(fn($p) => ['id' => $p['id'], 'created' => $p['created'], 'base' => $p['base'],
            'changes' => public_changes($p['changes'])], $list)]);
    }
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
if (!is_array($in)) fail(400, 'Ungültige Anfrage.');
$video = (string) ($in['video_id'] ?? '');
if (!video_ok($video)) fail(400, 'Ungültige Video-ID.');
$dir = DATA_DIR . "/$video";
$given = (string) ($in['token'] ?? '');
$tokenOk = fn(array $meta) => $given !== '' && hash_equals($meta['token_hash'], hash('sha256', $given));

// ===== Vorschläge übernehmen oder verwerfen (nur mit Schlüssel) =====
$action = $in['action'] ?? null;
if ($action === 'accept' || $action === 'reject') {
    $meta = read_json("$dir/meta.json");
    if (!$meta) fail(404, 'Für dieses Video gibt es noch keinen veröffentlichten Sync.');
    if (!$tokenOk($meta)) fail(403, 'Der Bearbeitungsschlüssel fehlt oder passt nicht.');
    $lock = fopen("$dir/.lock", 'c');
    flock($lock, LOCK_EX);
    $meta = read_json("$dir/meta.json");
    $list = read_json("$dir/proposals.json") ?? [];
    $pid = (string) ($in['proposal_id'] ?? '');
    $prop = null;
    foreach ($list as $p) if ($p['id'] === $pid) $prop = $p;
    if (!$prop) fail(404, 'Diesen Vorschlag gibt es nicht (mehr).');
    write_json("$dir/proposals.json", array_values(array_filter($list, fn($p) => $p['id'] !== $pid)));
    if ($action === 'reject') out(['rejected' => $pid, 'version' => $meta['versions']]);
    // Eintragsweise auf den neuesten Stand anwenden, damit Ergänzungen anderer erhalten bleiben
    $items = apply_changes(sync_items(latest_sync($dir, $meta)), $prop['changes']);
    $n = write_version($dir, $meta, items_sync($items, $meta['game_id'], $video));
    out(['accepted' => $pid, 'version' => $n, 'updated' => $meta['updated']]);
}

// ===== Veröffentlichen =====
$gameId = $in['game_id'] ?? null;
if (!is_array($in['sync'] ?? null)) fail(400, 'Ungültige Anfrage.');
if (!is_int($gameId) || $gameId <= 0) fail(400, 'Ungültige Spiel-ID.');
if (($in['sync']['format'] ?? '') !== 'floortag-sync') fail(400, 'Das ist keine FloorTag-Sync-Datei.');
if (!take_write_budget()) fail(429, 'Gerade wird viel veröffentlicht. Versuch es in einer Minute noch einmal.');

@mkdir($dir, 0755, true);
$lock = fopen("$dir/.lock", 'c');
flock($lock, LOCK_EX);
$meta = read_json("$dir/meta.json");
$token = null;
$sync = null;
if ($meta) {
    if ($meta['game_id'] !== $gameId) fail(409, 'Dieses Video gehört zu einem anderen Spiel.');
    if (!$tokenOk($meta)) {
        if ($given !== '') fail(403, 'Der Bearbeitungsschlüssel passt nicht.');
        // Ohne Schlüssel: Ergänzungen sofort übernehmen, Änderungen als Vorschlag ablegen
        $old = sync_items(latest_sync($dir, $meta));
        [$adds, $changes] = diff_items($old, sync_items(sanitize_sync($in['sync'], $gameId, $video)));
        $n = $meta['versions'];
        if ($adds) $n = write_version($dir, $meta, items_sync($old + $adds, $gameId, $video));
        $proposal = null; $full = false;
        if ($changes) {
            $list = read_json("$dir/proposals.json") ?? [];
            $sig = hash('sha256', json_encode(public_changes($changes)));
            foreach ($list as $p) if (($p['sig'] ?? '') === $sig) $proposal = $p['id'];  // derselbe Vorschlag schon offen
            if (!$proposal && count($list) >= MAX_PROPOSALS) $full = true;
            elseif (!$proposal) {
                $proposal = bin2hex(random_bytes(4));
                $list[] = ['id' => $proposal, 'created' => date('c'), 'base' => $n, 'sig' => $sig, 'changes' => $changes];
                write_json("$dir/proposals.json", $list);
            }
        }
        out(['version' => $n, 'updated' => $meta['updated'] ?? null, 'added' => count($adds), 'changes' => count($changes),
            'proposal' => $proposal, 'proposals_full' => $full, 'unchanged' => !$adds && !$changes]);
    }
} else {
    if (!game_exists($gameId)) fail(404, "Spiel $gameId gibt es im Saisonmanager nicht.");
    $token = bin2hex(random_bytes(16));
    $meta = ['game_id' => $gameId, 'video_id' => $video, 'token_hash' => hash('sha256', $token), 'versions' => 0, 'created' => date('c')];
}

$n = write_version($dir, $meta, sanitize_sync($in['sync'], $gameId, $video));
flock($lock, LOCK_UN);

out(['version' => $n, 'updated' => $meta['updated']] + ($token ? ['token' => $token] : []));
