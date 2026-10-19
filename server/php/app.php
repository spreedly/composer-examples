<?php

declare(strict_types=1);

require __DIR__ . '/vendor/autoload.php';

use Dotenv\Dotenv;
use Spreedly\ComposerSdk\CheckpointEvent;
use Spreedly\ComposerSdk\CheckpointOptions;
use Spreedly\ComposerSdk\Composer;
use Spreedly\ComposerSdk\ComposerApiVersion;
use Spreedly\ComposerSdk\ComposerConfig;
use Spreedly\ComposerSdk\ComposerVerification;
use Spreedly\ComposerSdk\Constants;

Dotenv::createImmutable(__DIR__)->safeLoad();

function envOr(string $primary, string $fallback): ?string
{
    $primaryValue = $_ENV[$primary] ?? '';
    if ($primaryValue !== '') {
        return $primaryValue;
    }

    $fallbackValue = $_ENV[$fallback] ?? '';
    return $fallbackValue !== '' ? $fallbackValue : null;
}

$defaultConfig = Constants::getDefaultConfig();
$apiUrl = envOr('DODGEBALL_API_URL', 'SPREEDLY_API_URL') ?? $defaultConfig->apiUrl;
$secretKey = envOr('DODGEBALL_SECRET_KEY', 'SPREEDLY_SECRET_KEY') ?? 'UNSET_SECRET_KEY';
$config = new ComposerConfig(
    apiVersion: ComposerApiVersion::V1,
    apiUrl: $apiUrl,
);

$client = new Composer(
    $secretKey,
    $config,
);

const SDK_META = [
    'language' => 'php',
    'package' => 'spreedly/composer-sdk-server',
    'version' => '1.0.0',
];

const MISSING_CONFIG_MESSAGE =
    'Missing DODGEBALL_SECRET_KEY; copy .env.example to .env (SPREEDLY_SECRET_KEY also accepted)';
// Failures are logged server-side; the client only gets this generic message.
const CHECKPOINT_ERROR_MESSAGE = 'Checkpoint request failed';
const INVALID_CHECKPOINT_BODY = 'Invalid checkpoint request: body must be JSON with a non-empty checkpointName string';

function is_api_key_configured(): bool
{
    $apiKey = envOr('DODGEBALL_SECRET_KEY', 'SPREEDLY_SECRET_KEY') ?? '';
    return $apiKey !== '' && $apiKey !== 'UNSET_SECRET_KEY';
}

if (!is_api_key_configured()) {
    error_log('warning: ' . MISSING_CONFIG_MESSAGE);
}

// Client IP for the risk engine. Callers must not choose this value.
// Default (TRUSTED_PROXY_COUNT=0): socket address, ignore X-Forwarded-For.
// Positive count: that many hops from the right of X-Forwarded-For; the hop must be an IP.
function request_ip(): string
{
    $raw = $_ENV['TRUSTED_PROXY_COUNT'] ?? getenv('TRUSTED_PROXY_COUNT');
    if ($raw === false || $raw === null || $raw === '') {
        $raw = '0';
    }
    $hops = filter_var($raw, FILTER_VALIDATE_INT);
    if ($hops === false || $hops < 0) {
        throw new RuntimeException('Cannot derive client IP: TRUSTED_PROXY_COUNT is not a valid hop count');
    }

    $header = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    $parts = array_map('trim', explode(',', $header));
    if ($hops === 0) {
        $candidate = $_SERVER['REMOTE_ADDR'] ?? '';
    } elseif ($hops <= count($parts)) {
        $candidate = $parts[count($parts) - $hops];
    } else {
        $candidate = '';
    }

    if ($candidate === '' || filter_var($candidate, FILTER_VALIDATE_IP) === false) {
        throw new RuntimeException('Cannot derive client IP: no valid IP for this TRUSTED_PROXY_COUNT');
    }
    return $candidate;
}

function verification_to_array(?ComposerVerification $verification): ?array
{
    if ($verification === null) {
        return null;
    }

    return [
        'id' => $verification->id,
        'status' => $verification->status,
        'outcome' => $verification->outcome,
        'step_data' => $verification->stepData,
    ];
}

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($payload);
}

if (php_sapi_name() === 'cli-server') {
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/';
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET' && $path === '/healthz') {
        json_response(['ok' => true, 'sdk' => SDK_META]);
        return;
    }

    if ($method === 'GET' && $path === '/meta') {
        json_response(SDK_META);
        return;
    }

    if ($method === 'POST' && $path === '/checkpoint') {
        $raw = file_get_contents('php://input') ?: '';
        // Decode objects as stdClass, not arrays: a PHP array can't tell {} from [] or {"0":..} from a list,
        // and json_encode would send them back changed.
        $body = json_decode($raw);
        $name = $body instanceof stdClass ? ($body->checkpointName ?? null) : null;
        if (!is_string($name) || trim($name) === '') {
            json_response(['error' => INVALID_CHECKPOINT_BODY], 400);
            return;
        }

        if (!is_api_key_configured()) {
            json_response([
                'success' => false,
                'status' => 'isError',
                'verification' => null,
                'errorMessage' => MISSING_CONFIG_MESSAGE,
            ]);
            return;
        }

        try {
            $ip = request_ip();
        } catch (Throwable $e) {
            error_log('client IP error: ' . $e);
            json_response([
                'success' => false,
                'status' => 'isError',
                'verification' => null,
                'errorMessage' => CHECKPOINT_ERROR_MESSAGE,
            ], 500);
            return;
        }

        try {
            // An object payload becomes the array the SDK requires; nested objects stay stdClass so json_encode keeps them as objects.
            // A top-level {"0":...} would turn into a list here; it stays an object only because of the field added below.
            $payload = $body->payload ?? null;
            if ($payload instanceof stdClass) {
                $payload = get_object_vars($payload);
            } elseif (!is_array($payload)) {
                $payload = [];
            }
            $payload['exampleValueFromBackendOnly'] = 'EXAMPLE_VALUE';

            $response = $client->checkpoint(new CheckpointOptions(
                checkpointName: $name,
                event: new CheckpointEvent(ip: $ip, data: $payload),
                sourceToken: $body->sourceToken ?? null,
                sessionId: $body->sessionId ?? null,
                userId: $body->userId ?? null,
                useVerificationId: $body->verificationId ?? null,
            ));

            if ($client->isAllowed($response)) {
                $status = 'isAllowed';
            } elseif ($client->isRunning($response)) {
                $status = 'isRunning';
            } elseif ($client->isDenied($response)) {
                $status = 'isDenied';
            } else {
                $status = 'isError';
            }

            $result = [
                'success' => true,
                'status' => $status,
                'verification' => verification_to_array($response->verification),
            ];

            if ($status === 'isError') {
                $result['errorMessage'] = json_encode(array_map(
                    fn ($error) => ['code' => $error->code, 'message' => $error->message],
                    $response->errors
                ));
            }

            json_response($result);
        } catch (Throwable $e) {
            error_log('checkpoint error: ' . $e);
            json_response([
                'success' => false,
                'status' => 'isError',
                'verification' => null,
                'errorMessage' => CHECKPOINT_ERROR_MESSAGE,
            ]);
        }
        return;
    }

    http_response_code(404);
    return;
}
