<?php
// Gefälschter Saisonmanager für tests/proxy-test.sh
// Zählt jeden Abruf in $HITS_FILE, damit der Test Cache-Treffer erkennt.
$hits = getenv('HITS_FILE');
if ($hits) file_put_contents($hits, $_SERVER['REQUEST_URI'] . "\n", FILE_APPEND);

header('Content-Type: application/json');
if (($_SERVER['HTTP_X_API_KEY'] ?? '') !== 'test-key') { http_response_code(401); echo '{"message":"Unauthorized"}'; exit; }

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/games/58668.json') { readfile(__DIR__ . '/../fixtures/spiel_58668.json'); exit; }
if ($path === '/games/77.json') {
    // laufendes Spiel: kurzer Cache
    $g = json_decode(file_get_contents(__DIR__ . '/../fixtures/spiel_58668.json'), true);
    $g['id'] = 77; $g['game_status'] = 'running'; $g['ended'] = false;
    echo json_encode($g); exit;
}
if ($path === '/leagues/2449/schedule.json') {
    // Aufbau wie der echte Spielplan, mit Feldern, die der Proxy weglassen soll
    echo json_encode([
        ['game_id' => 58668, 'date' => '2026-10-10', 'time' => '18:00', 'home_team_name' => 'Baltic Storms', 'guest_team_name' => 'TV Eiche Horn Bremen',
         'result_string' => '5:4', 'result' => ['home_goals' => 5], 'referees' => [['first_name' => 'Volker']], 'home_team_logo' => '/logo.png'],
        ['game_id' => 58700, 'date' => '2026-12-01', 'time' => '19:00', 'home_team_name' => 'A', 'guest_team_name' => 'B', 'result_string' => null, 'result' => null],
    ]);
    exit;
}
if ($path === '/leagues/2449.json') { echo json_encode(['name' => '2. FBL Herren Nord/West', 'short_name' => '2. FBL H NW']); exit; }
http_response_code(404);
echo '{"message":"Not found"}';
