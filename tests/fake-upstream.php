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
http_response_code(404);
echo '{"message":"Not found"}';
