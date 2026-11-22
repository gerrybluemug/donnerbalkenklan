<?php
// Mitgliederecke der Donnerbalkenklan-Homepage:
// Bedarf an Gegenständen aus der Gildenbank anmelden, Anmeldung über Discord.
//
// Läuft auf normalem PHP-Webspace (PHP 8, SQLite). Einrichtung: siehe README.md
// im Repository, Abschnitt "Mitgliederecke".
//
// Aufrufe (alle mit ?action=…):
//   login     → weiter zu Discord          callback → Rückkehr von Discord
//   state     → angemeldeter Nutzer + offene Anmeldungen (GET)
//   add       → {item_id, item_name, note?}  remove → {id}   done → {id} (Offiziere)
//   profile   → {character}                  logout → {}

declare(strict_types=1);

$cfgFile = __DIR__ . '/config.php';
if (!is_file($cfgFile)) {
    http_response_code(500);
    exit('config.php fehlt – bitte config.sample.php kopieren und ausfüllen.');
}
$cfg = require $cfgFile;
$cfg += [
    'discord_api'       => 'https://discord.com/api/v10',
    'discord_authorize' => 'https://discord.com/oauth2/authorize',
    'data_dir'          => __DIR__ . '/data',
    'required_role'     => '',
    'officer_roles'     => [],
    'admin_ids'         => [],
];

const MAX_OPEN_PER_USER = 50;
const SESSION_DAYS = 30;

// ---------- Hilfsfunktionen ----------
function json_out($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $msg, int $code = 400): void { json_out(['error' => $msg], $code); }

function clean(string $s, int $max): string
{
    $s = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $s) ?? '');
    return mb_substr($s, 0, $max);
}

// Discord-IDs aus der Einstellung: '123', '123, 456', ['123', 456] … → ['123', '456']
function id_list($v): array
{
    $out = [];
    foreach ((array)$v as $x) {
        foreach (preg_split('/[\s,;]+/', (string)$x) as $id) if (preg_match('/^\d+$/', $id)) $out[] = $id;
    }
    return $out;
}

function http(string $method, string $url, array $headers = [], ?string $body = null): array
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_USERAGENT => 'DonnerbalkenklanHomepage (https://donnerbalkenklan.free-kick.de, 1.0)',
        ]);
        if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        $res = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return [$code, $res === false ? '' : $res];
    }
    $ctx = stream_context_create(['http' => [
        'method' => $method, 'header' => implode("\r\n", array_merge($headers, ['User-Agent: DonnerbalkenklanHomepage (1.0)'])),
        'content' => $body ?? '', 'ignore_errors' => true, 'timeout' => 15,
    ]]);
    $res = @file_get_contents($url, false, $ctx);
    $code = 0;
    foreach ($http_response_header ?? [] as $h) if (preg_match('#^HTTP/\S+ (\d+)#', $h, $m)) $code = (int)$m[1];
    return [$code, $res === false ? '' : $res];
}

function db(array $cfg): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    $dir = $cfg['data_dir'];
    if (!is_dir($dir)) mkdir($dir, 0700, true);
    if (!is_file("$dir/.htaccess")) file_put_contents("$dir/.htaccess", "Require all denied\n");
    $pdo = new PDO('sqlite:' . $dir . '/mitgliederecke.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->exec('CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT, character TEXT, officer INTEGER NOT NULL DEFAULT 0, last_login INTEGER)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS needs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, item_name TEXT NOT NULL,
        user_id TEXT NOT NULL, note TEXT, created INTEGER NOT NULL, done INTEGER, done_by TEXT)');
    $pdo->exec('CREATE UNIQUE INDEX IF NOT EXISTS needs_open ON needs(item_id, user_id) WHERE done IS NULL');
    return $pdo;
}

function current_user(array $cfg): ?array
{
    if (empty($_SESSION['uid'])) return null;
    $st = db($cfg)->prepare('SELECT id, name, avatar, character, officer FROM users WHERE id = ?');
    $st->execute([$_SESSION['uid']]);
    $u = $st->fetch(PDO::FETCH_ASSOC);
    if (!$u) return null;
    $u['officer'] = (bool)$u['officer'];
    return $u;
}

function back_to(string $url, array $cfg): string
{
    foreach ($cfg['site_origins'] as $o) {
        if ($url === $o || str_starts_with($url, $o . '/')) return $url;
    }
    return $cfg['site_origins'][0] . '/gildenbank.html';
}

function error_page(string $msg, string $back): void
{
    http_response_code(403);
    header('Content-Type: text/html; charset=utf-8');
    $m = htmlspecialchars($msg, ENT_QUOTES);
    $b = htmlspecialchars($back, ENT_QUOTES);
    echo "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Mitgliederecke</title>"
        . "<body style='font:16px system-ui;background:#120d0b;color:#eee3d3;display:grid;place-items:center;min-height:90vh;text-align:center'>"
        . "<div><p>$m</p><p><a style='color:#e2b65c' href='$b'>Zurück zur Gildenbank</a></p></div>";
    exit;
}

// ---------- CORS & Sitzung ----------
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$originOk = in_array($origin, $cfg['site_origins'], true);
if ($originOk) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Allow-Methods: GET, POST');
    header('Access-Control-Max-Age: 600');
}
header('Vary: Origin');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

$sessDir = $cfg['data_dir'] . '/sessions';
if (!is_dir($sessDir)) mkdir($sessDir, 0700, true);
session_save_path($sessDir);
ini_set('session.gc_maxlifetime', (string)(SESSION_DAYS * 86400));
ini_set('session.use_strict_mode', '1');
session_name('dbk_session');
session_set_cookie_params([
    'lifetime' => SESSION_DAYS * 86400,
    'path' => rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

$action = $_GET['action'] ?? 'state';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Schreibende Aufrufe nur per POST mit JSON von der eigenen Homepage (Schutz vor fremden Seiten)
$body = [];
if (in_array($action, ['add', 'remove', 'done', 'profile', 'logout'], true)) {
    if ($method !== 'POST') fail('Nur POST erlaubt.', 405);
    if (!$originOk) fail('Unbekannte Herkunft.', 403);
    if (!str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) fail('JSON erwartet.', 415);
    $body = json_decode(file_get_contents('php://input') ?: '{}', true);
    if (!is_array($body)) fail('Ungültiges JSON.');
}

try {
    switch ($action) {
        // ---------- Anmeldung über Discord ----------
        case 'login':
            $_SESSION['oauth_state'] = bin2hex(random_bytes(16));
            $_SESSION['return'] = back_to((string)($_GET['return'] ?? ''), $cfg);
            header('Location: ' . $cfg['discord_authorize'] . '?' . http_build_query([
                'response_type' => 'code',
                'client_id' => $cfg['client_id'],
                'scope' => 'identify guilds.members.read',
                'state' => $_SESSION['oauth_state'],
                'redirect_uri' => $cfg['redirect_uri'],
            ]));
            exit;

        case 'callback':
            $back = $_SESSION['return'] ?? back_to('', $cfg);
            $state = (string)($_GET['state'] ?? '');
            if (empty($_SESSION['oauth_state']) || !hash_equals($_SESSION['oauth_state'], $state)) {
                error_page('Die Anmeldung ist abgelaufen. Bitte noch einmal versuchen.', $back);
            }
            unset($_SESSION['oauth_state']);
            if (empty($_GET['code'])) error_page('Anmeldung bei Discord abgebrochen.', $back);

            [$code, $res] = http('POST', $cfg['discord_api'] . '/oauth2/token',
                ['Content-Type: application/x-www-form-urlencoded'],
                http_build_query([
                    'grant_type' => 'authorization_code', 'code' => (string)$_GET['code'], 'redirect_uri' => $cfg['redirect_uri'],
                    'client_id' => $cfg['client_id'], 'client_secret' => $cfg['client_secret'],
                ]));
            $tok = json_decode($res, true);
            if ($code !== 200 || empty($tok['access_token'])) error_page('Discord hat die Anmeldung nicht bestätigt.', $back);
            $auth = ['Authorization: Bearer ' . $tok['access_token']];

            [$code, $res] = http('GET', $cfg['discord_api'] . '/users/@me', $auth);
            $me = json_decode($res, true);
            if ($code !== 200 || empty($me['id'])) error_page('Discord-Konto konnte nicht gelesen werden.', $back);

            [$code, $res] = http('GET', $cfg['discord_api'] . '/users/@me/guilds/' . $cfg['guild_id'] . '/member', $auth);
            $member = json_decode($res, true);
            if ($code !== 200 || !is_array($member)) error_page('Die Mitgliederecke ist nur für Mitglieder unseres Discord-Servers.', $back);
            $roles = array_map('strval', $member['roles'] ?? []);
            $has = fn($list) => count(array_intersect($roles, id_list($list))) > 0;
            $officer = in_array((string)$me['id'], id_list($cfg['admin_ids']), true) || $has($cfg['officer_roles']);
            // Pflicht-Rolle(n): eine davon genügt; Offiziere und Admins dürfen immer
            if (id_list($cfg['required_role']) && !$officer && !$has($cfg['required_role'])) {
                error_page('Die Mitgliederecke ist nur für Gildenmitglieder (Discord-Rolle fehlt).', $back);
            }
            $name = clean((string)($member['nick'] ?? $me['global_name'] ?? $me['username'] ?? 'Unbekannt'), 50);
            $avatar = !empty($me['avatar']) ? "https://cdn.discordapp.com/avatars/{$me['id']}/{$me['avatar']}.png?size=64" : null;

            db($cfg)->prepare('INSERT INTO users (id, name, avatar, officer, last_login) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar, officer = excluded.officer, last_login = excluded.last_login')
                ->execute([(string)$me['id'], $name, $avatar, $officer ? 1 : 0, time()]);
            session_regenerate_id(true);
            $_SESSION['uid'] = (string)$me['id'];
            header('Location: ' . $back);
            exit;

        case 'logout':
            $_SESSION = [];
            session_destroy();
            json_out(['ok' => true]);

        // ---------- Daten ----------
        case 'state':
            $u = current_user($cfg);
            if (!$u) {
                // ohne Anmeldung nur, wie oft etwas angemeldet ist
                $counts = [];
                foreach (db($cfg)->query('SELECT item_id, COUNT(*) n FROM needs WHERE done IS NULL GROUP BY item_id') as $r) {
                    $counts[(string)$r['item_id']] = (int)$r['n'];
                }
                json_out(['user' => null, 'counts' => (object)$counts]);
            }
            $rows = db($cfg)->query('SELECT n.id, n.item_id, n.item_name, n.note, n.created, n.user_id, u.name user_name, u.character
                FROM needs n JOIN users u ON u.id = n.user_id WHERE n.done IS NULL ORDER BY n.created')->fetchAll(PDO::FETCH_ASSOC);
            $needs = array_map(fn($r) => [
                'id' => (int)$r['id'], 'item_id' => (int)$r['item_id'], 'item_name' => $r['item_name'], 'note' => $r['note'],
                'created' => (int)$r['created'], 'user_name' => $r['user_name'], 'character' => $r['character'],
                'mine' => $r['user_id'] === $u['id'],
            ], $rows);
            json_out(['user' => $u, 'needs' => $needs]);

        case 'add':
            $u = current_user($cfg) ?? fail('Bitte zuerst anmelden.', 401);
            $item = (int)($body['item_id'] ?? 0);
            $name = clean((string)($body['item_name'] ?? ''), 100);
            if ($item <= 0 || $name === '') fail('Unbekannter Gegenstand.');
            $st = db($cfg)->prepare('SELECT COUNT(*) FROM needs WHERE user_id = ? AND done IS NULL');
            $st->execute([$u['id']]);
            if ((int)$st->fetchColumn() >= MAX_OPEN_PER_USER) fail('Du hast schon ' . MAX_OPEN_PER_USER . ' offene Anmeldungen.');
            db($cfg)->prepare('INSERT OR IGNORE INTO needs (item_id, item_name, user_id, note, created) VALUES (?, ?, ?, ?, ?)')
                ->execute([$item, $name, $u['id'], clean((string)($body['note'] ?? ''), 200) ?: null, time()]);
            json_out(['ok' => true]);

        case 'remove':
            $u = current_user($cfg) ?? fail('Bitte zuerst anmelden.', 401);
            $st = db($cfg)->prepare('DELETE FROM needs WHERE id = ? AND done IS NULL AND (user_id = ? OR ? = 1)');
            $st->execute([(int)($body['id'] ?? 0), $u['id'], $u['officer'] ? 1 : 0]);
            json_out(['ok' => $st->rowCount() > 0]);

        case 'done':
            $u = current_user($cfg) ?? fail('Bitte zuerst anmelden.', 401);
            if (!$u['officer']) fail('Nur für Offiziere.', 403);
            $st = db($cfg)->prepare('UPDATE needs SET done = ?, done_by = ? WHERE id = ? AND done IS NULL');
            $st->execute([time(), $u['id'], (int)($body['id'] ?? 0)]);
            json_out(['ok' => $st->rowCount() > 0]);

        case 'profile':
            $u = current_user($cfg) ?? fail('Bitte zuerst anmelden.', 401);
            db($cfg)->prepare('UPDATE users SET character = ? WHERE id = ?')
                ->execute([clean((string)($body['character'] ?? ''), 50) ?: null, $u['id']]);
            json_out(['ok' => true]);

        default:
            fail('Unbekannte Aktion.', 404);
    }
} catch (Throwable $e) {
    error_log('Mitgliederecke: ' . $e->getMessage());
    fail('Interner Fehler.', 500);
}
