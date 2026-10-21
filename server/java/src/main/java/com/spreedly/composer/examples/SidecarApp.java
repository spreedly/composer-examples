package com.spreedly.composer.examples;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import com.spreedly.composer.Composer;
import com.spreedly.composer.Logger;
import com.spreedly.composer.messages.CheckpointRequest;
import com.spreedly.composer.messages.CheckpointResponse;
import com.spreedly.composer.messages.CheckpointResponseOptions;
import com.spreedly.composer.messages.ComposerApiError;
import com.spreedly.composer.messages.ComposerVerification;
import com.spreedly.composer.messages.Event;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import io.github.cdimascio.dotenv.Dotenv;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Type;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public final class SidecarApp {
    private static final String MISSING_CONFIG_MESSAGE =
        "Missing DODGEBALL_SECRET_KEY; copy .env.example to .env (SPREEDLY_SECRET_KEY also accepted)";
    // Failures are logged server-side; the client only gets this generic message.
    private static final String CHECKPOINT_ERROR_MESSAGE = "Checkpoint request failed";
    private static final String INVALID_CHECKPOINT_BODY =
        "Invalid checkpoint request: body must be JSON with a non-empty checkpointName string";
    private static final Gson gson = new GsonBuilder().create();
    private static final Type mapType = new TypeToken<Map<String, Object>>() {}.getType();
    private static final Dotenv dotenv = Dotenv.configure().ignoreIfMissing().load();

    private static final Map<String, String> SDK_META = Map.of(
        "language", "java",
        "package", "com.spreedly:composer-sdk-server",
        "version", "1.0.0"
    );

    public static void main(String[] args) throws Exception {
        String port = envOrDefault("PORT", "3025");
        String host = envOrDefault("HOST", "127.0.0.1");
        String secretKey = envOr("DODGEBALL_SECRET_KEY", "SPREEDLY_SECRET_KEY");
        if (!isApiKeyConfigured(secretKey)) {
            System.out.println("warning: " + MISSING_CONFIG_MESSAGE);
        }

        Composer composer = buildComposer(secretKey);

        HttpServer server = HttpServer.create(new InetSocketAddress(host, Integer.parseInt(port)), 0);
        server.createContext("/healthz", exchange -> {
            if (!"GET".equals(exchange.getRequestMethod())) {
                sendText(exchange, 405, "Method not allowed");
                return;
            }
            Map<String, Object> payload = new HashMap<>();
            payload.put("ok", true);
            payload.put("sdk", SDK_META);
            sendJson(exchange, 200, payload);
        });
        server.createContext("/meta", exchange -> {
            if (!"GET".equals(exchange.getRequestMethod())) {
                sendText(exchange, 405, "Method not allowed");
                return;
            }
            sendJson(exchange, 200, SDK_META);
        });
        server.createContext("/checkpoint", exchange -> handleCheckpoint(exchange, composer, secretKey));
        server.setExecutor(null);
        server.start();

        System.out.println("Server is running on http://localhost:" + port);
    }

    private static void handleCheckpoint(HttpExchange exchange, Composer composer, String secretKey)
        throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            sendText(exchange, 405, "Method not allowed");
            return;
        }

        String rawBody = readBody(exchange.getRequestBody());
        Map<String, Object> body = parseBody(rawBody);
        Object checkpointName = body == null ? null : body.get("checkpointName");
        if (body == null || !(checkpointName instanceof String name) || name.trim().isEmpty()) {
            sendJson(exchange, 400, Map.of("error", INVALID_CHECKPOINT_BODY));
            return;
        }

        if (!isApiKeyConfigured(secretKey)) {
            sendJson(exchange, 200, checkpointError(null, MISSING_CONFIG_MESSAGE));
            return;
        }

        String ip;
        try {
            ip = requestIp(exchange);
        } catch (IllegalStateException e) {
            System.err.println("client IP error: " + e.getMessage());
            sendJson(exchange, 500, checkpointError(null, CHECKPOINT_ERROR_MESSAGE));
            return;
        }

        Map<String, Object> payload = mapValue(body.get("payload"));
        payload.put("exampleValueFromBackendOnly", "EXAMPLE_VALUE");

        Event event = new Event(ip, payload);
        CheckpointRequest request = new CheckpointRequest(
            event,
            stringValue(body.get("checkpointName")),
            stringValue(body.get("sessionId")),
            stringValue(body.get("userId")),
            stringValue(body.get("sourceToken")),
            stringValue(body.get("verificationId"))
        );
        request.options = new CheckpointResponseOptions(false, null);

        try {
            CheckpointResponse response = composer.checkpoint(request).join();
            String status;
            if (Composer.isAllowed(response)) {
                status = "isAllowed";
            } else if (Composer.isRunning(response)) {
                status = "isRunning";
            } else if (Composer.isDenied(response)) {
                status = "isDenied";
            } else {
                status = "isError";
            }

            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("status", status);
            result.put("verification", verificationToSidecar(response.verification));
            if ("isError".equals(status) && response.errors != null) {
                result.put("errorMessage", gson.toJson(response.errors));
            }
            sendJson(exchange, 200, result);
        } catch (Exception e) {
            System.err.println("checkpoint error:");
            e.printStackTrace();
            sendJson(exchange, 200, checkpointError(null, CHECKPOINT_ERROR_MESSAGE));
        }
    }

    private static Composer buildComposer(String secretKey) {
        Composer.Builder builder = Composer.builder()
            .setApiKeys(secretKey.isEmpty() ? "UNSET_SECRET_KEY" : secretKey)
            .setLogLevel(Logger.ComposerLogLevel.INFO);

        String apiUrl = envOr("DODGEBALL_API_URL", "SPREEDLY_API_URL");
        if (!apiUrl.isEmpty()) {
            builder.setApiUrl(apiUrl);
        }

        return builder.build();
    }

    private static Map<String, Object> verificationToSidecar(ComposerVerification verification) {
        if (verification == null) {
            return null;
        }

        Map<String, Object> stepData = verification.stepData != null
            ? verification.stepData
            : Map.of();

        Map<String, Object> mapped = new HashMap<>();
        mapped.put("id", verification.id);
        mapped.put("status", verification.status);
        mapped.put("outcome", verification.outcome);
        mapped.put("step_data", stepData);
        return mapped;
    }

    private static Map<String, Object> checkpointError(Object verification, String errorMessage) {
        Map<String, Object> result = new HashMap<>();
        result.put("success", false);
        result.put("status", "isError");
        result.put("verification", verification);
        result.put("errorMessage", errorMessage);
        return result;
    }

    // Client IP for the risk engine. Callers must not choose this value.
    // Default (TRUSTED_PROXY_COUNT=0): socket address, ignore X-Forwarded-For.
    // Positive count: that many hops from the right of X-Forwarded-For; the hop must be an IP.
    private static String requestIp(HttpExchange exchange) {
        String raw = envOrDefault("TRUSTED_PROXY_COUNT", "0");
        int hops;
        try {
            hops = Integer.parseInt(raw);
        } catch (NumberFormatException e) {
            hops = -1;
        }
        if (hops < 0) {
            throw new IllegalStateException(
                "Cannot derive client IP: TRUSTED_PROXY_COUNT is not a valid hop count"
            );
        }

        String header = exchange.getRequestHeaders().getFirst("X-Forwarded-For");
        if (header == null) {
            header = "";
        }
        String[] parts = header.split(",");
        for (int i = 0; i < parts.length; i++) {
            parts[i] = parts[i].trim();
        }

        String candidate;
        if (hops == 0) {
            candidate = exchange.getRemoteAddress().getAddress().getHostAddress();
        } else if (hops <= parts.length) {
            candidate = parts[parts.length - hops];
        } else {
            candidate = null;
        }

        if (!isIp(candidate)) {
            throw new IllegalStateException(
                "Cannot derive client IP: no valid IP for this TRUSTED_PROXY_COUNT"
            );
        }
        return candidate;
    }

    private static boolean isIp(String value) {
        if (value == null || value.isEmpty()) {
            return false;
        }
        try {
            InetAddress.ofLiteral(value);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static Map<String, Object> parseBody(String rawBody) {
        if (rawBody == null || rawBody.isBlank()) {
            return null;
        }
        try {
            return gson.fromJson(rawBody, mapType);
        } catch (Exception e) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> mapValue(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> copy = new HashMap<>();
            map.forEach((key, entryValue) -> copy.put(String.valueOf(key), entryValue));
            return copy;
        }
        return new HashMap<>();
    }

    private static String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static boolean isApiKeyConfigured(String secretKey) {
        return !secretKey.isEmpty() && !"UNSET_SECRET_KEY".equals(secretKey);
    }

    private static String envOr(String primary, String fallback) {
        String primaryValue = envOrDefault(primary, "");
        if (!primaryValue.isEmpty()) {
            return primaryValue;
        }
        return envOrDefault(fallback, "");
    }

    private static String envOrDefault(String key, String defaultValue) {
        String fromDotenv = dotenv.get(key);
        if (fromDotenv != null && !fromDotenv.isEmpty()) {
            return fromDotenv;
        }
        String fromEnv = System.getenv(key);
        return fromEnv != null && !fromEnv.isEmpty() ? fromEnv : defaultValue;
    }

    private static String readBody(InputStream inputStream) throws IOException {
        return new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
    }

    private static void sendJson(HttpExchange exchange, int status, Object payload) throws IOException {
        byte[] bytes = gson.toJson(payload).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(bytes);
        }
    }

    private static void sendText(HttpExchange exchange, int status, String message) throws IOException {
        byte[] bytes = message.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(bytes);
        }
    }
}
