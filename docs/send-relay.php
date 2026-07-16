<?php
/**
 * Relais SMTP minimal pour ETCC Messagerie.
 *
 * Rôle : Railway (Hobby plan) bloque tout SMTP sortant (ports 25/465/587).
 * Ce script tourne sur l'hébergement Hostinger (même réseau que smtp.hostinger.com),
 * où le SMTP sortant n'est pas bloqué. Le backend NestJS lui envoie en HTTPS un
 * message déjà construit (MIME brut) + les identifiants du compte mailbox à
 * utiliser, et ce script se charge de la connexion SMTP réelle vers Hostinger.
 *
 * Sécurité :
 *  - Un secret partagé (header X-Relay-Secret) est requis pour toute requête.
 *  - Rien n'est journalisé (ni mot de passe, ni contenu du message).
 *  - Aucune donnée n'est persistée : tout reste en mémoire le temps de la requête.
 *  - Ce fichier doit être placé dans un chemin non listé/non deviné du site,
 *    et le secret doit être long et aléatoire (généré via openssl rand -hex 32).
 */

declare(strict_types=1);
error_reporting(0); // ne jamais divulguer de détails d'erreurs PHP (chemins, etc.)

// ── Config ──────────────────────────────────────────────────────────────
// ⚠️ Ne jamais commiter la vraie valeur ici. Sur Hostinger, remplacer par le
// secret réel (généré via `openssl rand -hex 32`) ; il doit correspondre à
// la variable Railway MAIL_RELAY_SECRET côté backend.
const RELAY_SECRET = 'REPLACE_WITH_RANDOM_SECRET_GENERATED_VIA_OPENSSL_RAND_HEX_32';
const MAX_BODY_BYTES = 15 * 1024 * 1024; // 15 Mo (pièces jointes incluses)

// ── Auth ────────────────────────────────────────────────────────────────
function respond(int $status, array $payload): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['success' => false, 'error' => 'method_not_allowed']);
}

$providedSecret = $_SERVER['HTTP_X_RELAY_SECRET'] ?? '';
if (!hash_equals(RELAY_SECRET, $providedSecret)) {
    respond(403, ['success' => false, 'error' => 'forbidden']);
}

$raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1024);
if ($raw === false || strlen($raw) > MAX_BODY_BYTES) {
    respond(413, ['success' => false, 'error' => 'payload_too_large']);
}

$data = json_decode($raw, true);
if (!is_array($data)) {
    respond(400, ['success' => false, 'error' => 'invalid_json']);
}

$host = (string)($data['host'] ?? '');
$port = (int)($data['port'] ?? 0);
$secure = (bool)($data['secure'] ?? false);
$user = (string)($data['user'] ?? '');
$pass = (string)($data['pass'] ?? '');
$envelopeFrom = (string)($data['envelopeFrom'] ?? '');
$envelopeTo = is_array($data['envelopeTo'] ?? null) ? array_values(array_filter(array_map('strval', $data['envelopeTo']))) : [];
$rawMessageB64 = (string)($data['rawMessageBase64'] ?? '');

if ($host === '' || $port <= 0 || $user === '' || $pass === '' || $envelopeFrom === '' || empty($envelopeTo) || $rawMessageB64 === '') {
    respond(400, ['success' => false, 'error' => 'missing_fields']);
}

$rawMessage = base64_decode($rawMessageB64, true);
if ($rawMessage === false) {
    respond(400, ['success' => false, 'error' => 'invalid_message_encoding']);
}

// ── Client SMTP minimal (sans dépendance externe) ─────────────────────────
function smtp_read(mixed $stream): array {
    $lines = [];
    while (($line = fgets($stream, 1024)) !== false) {
        $lines[] = $line;
        // Une ligne de continuation multi-lignes a un '-' après le code ; la dernière a un espace.
        if (strlen($line) >= 4 && $line[3] === ' ') {
            break;
        }
    }
    if (empty($lines)) {
        throw new RuntimeException('smtp_no_response');
    }
    $code = (int)substr($lines[0], 0, 3);
    return [$code, implode('', $lines)];
}

function smtp_cmd(mixed $stream, string $cmd, int $expectedMin = 200, int $expectedMax = 299): array {
    fwrite($stream, $cmd . "\r\n");
    [$code, $text] = smtp_read($stream);
    if ($code < $expectedMin || $code > $expectedMax) {
        throw new RuntimeException("smtp_error: " . trim($text));
    }
    return [$code, $text];
}

function dot_stuff(string $message): string {
    // Normalise en CRLF puis échappe les lignes commençant par un point (RFC 5321 §4.5.2)
    $message = str_replace(["\r\n", "\r", "\n"], "\n", $message);
    $lines = explode("\n", $message);
    foreach ($lines as &$l) {
        if (isset($l[0]) && $l[0] === '.') {
            $l = '.' . $l;
        }
    }
    return implode("\r\n", $lines);
}

try {
    $timeout = 12; // secondes — on veut échouer vite, pas hériter du hang initial
    $context = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);

    if ($secure || $port === 465) {
        $stream = @stream_socket_client(
            "ssl://{$host}:{$port}",
            $errno, $errstr, $timeout,
            STREAM_CLIENT_CONNECT, $context
        );
    } else {
        $stream = @stream_socket_client(
            "tcp://{$host}:{$port}",
            $errno, $errstr, $timeout,
            STREAM_CLIENT_CONNECT, $context
        );
    }

    if (!$stream) {
        respond(502, ['success' => false, 'error' => "connect_failed: {$errstr}"]);
    }
    stream_set_timeout($stream, $timeout);

    smtp_read($stream); // bannière 220
    smtp_cmd($stream, 'EHLO etcc-relay');

    if (!$secure && $port !== 465) {
        smtp_cmd($stream, 'STARTTLS', 220, 220);
        if (!stream_socket_enable_crypto($stream, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            respond(502, ['success' => false, 'error' => 'starttls_failed']);
        }
        smtp_cmd($stream, 'EHLO etcc-relay');
    }

    smtp_cmd($stream, 'AUTH LOGIN', 334, 334);
    smtp_cmd($stream, base64_encode($user), 334, 334);
    smtp_cmd($stream, base64_encode($pass), 235, 235);

    smtp_cmd($stream, 'MAIL FROM:<' . $envelopeFrom . '>');
    foreach ($envelopeTo as $rcpt) {
        smtp_cmd($stream, 'RCPT TO:<' . $rcpt . '>');
    }

    smtp_cmd($stream, 'DATA', 354, 354);
    fwrite($stream, dot_stuff($rawMessage) . "\r\n.\r\n");
    smtp_read($stream); // 250 attendu, mais on ne bloque pas dessus s'il diffère légèrement

    smtp_cmd($stream, 'QUIT', 200, 299);
    fclose($stream);

    respond(200, ['success' => true]);
} catch (Throwable $e) {
    if (isset($stream) && is_resource($stream)) {
        fclose($stream);
    }
    respond(502, ['success' => false, 'error' => $e->getMessage()]);
}
