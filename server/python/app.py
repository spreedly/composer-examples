import ipaddress
import os
import json
from dataclasses import asdict

import composer
from composer import Composer, ComposerConfig
from composer.types import CheckpointEvent
from dotenv import load_dotenv
from flask import Flask, jsonify, request

load_dotenv()

app = Flask(__name__)

MISSING_CONFIG_MESSAGE = (
    "Missing DODGEBALL_SECRET_KEY; copy .env.example to .env "
    "(SPREEDLY_SECRET_KEY also accepted)"
)
# Failures are logged server-side; the client only gets this generic message.
CHECKPOINT_ERROR_MESSAGE = "Checkpoint request failed"
INVALID_CHECKPOINT_BODY = (
    "Invalid checkpoint request: body must be JSON with a non-empty checkpointName string"
)


def env_or(primary: str, fallback: str) -> str | None:
    primary_value = os.environ.get(primary, "")
    if primary_value:
        return primary_value
    fallback_value = os.environ.get(fallback, "")
    return fallback_value or None


def is_api_key_configured() -> bool:
    api_key = env_or("DODGEBALL_SECRET_KEY", "SPREEDLY_SECRET_KEY") or ""
    return bool(api_key) and api_key != "UNSET_SECRET_KEY"


secret_key = env_or("DODGEBALL_SECRET_KEY", "SPREEDLY_SECRET_KEY") or "UNSET_SECRET_KEY"
api_url = env_or("DODGEBALL_API_URL", "SPREEDLY_API_URL") or ComposerConfig().api_url

client = Composer(
    secret_key,
    ComposerConfig(
        api_version="v1",
        api_url=api_url,
    ),
)


if not is_api_key_configured():
    print(f"warning: {MISSING_CONFIG_MESSAGE}")


# Client IP for the risk engine. Callers must not choose this value.
# Default (TRUSTED_PROXY_COUNT=0): socket address, ignore X-Forwarded-For.
# Positive count: that many hops from the right of X-Forwarded-For; the hop must be an IP.
def get_ip() -> str:
    raw = os.environ.get("TRUSTED_PROXY_COUNT") or "0"
    try:
        hops = int(raw)
    except ValueError:
        hops = -1
    if hops < 0:
        raise ValueError("Cannot derive client IP: TRUSTED_PROXY_COUNT is not a valid hop count")

    header = request.headers.get("X-Forwarded-For") or ""
    parts = [part.strip() for part in header.split(",")]
    if hops == 0:
        candidate = request.remote_addr
    elif hops <= len(parts):
        candidate = parts[len(parts) - hops]
    else:
        candidate = None

    try:
        if candidate:
            ipaddress.ip_address(candidate)
            return candidate
    except ValueError:
        pass
    raise ValueError("Cannot derive client IP: no valid IP for this TRUSTED_PROXY_COUNT")


# Mirror node-ts's SDK_META so every sidecar self-describes the same way.
SDK_META = {
    "language": "python",
    "package": "spreedly-composer-sdk-server",
    "version": getattr(composer, "__version__", "unknown"),
}


@app.get("/healthz")
def healthz():
    return jsonify({"ok": True, "sdk": SDK_META})


@app.get("/meta")
def meta():
    return jsonify(SDK_META)


@app.post("/checkpoint")
def checkpoint():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": INVALID_CHECKPOINT_BODY}), 400
    name = body.get("checkpointName")
    if not isinstance(name, str) or not name.strip():
        return jsonify({"error": INVALID_CHECKPOINT_BODY}), 400

    if not is_api_key_configured():
        return jsonify(
            {
                "success": False,
                "status": "isError",
                "verification": None,
                "errorMessage": MISSING_CONFIG_MESSAGE,
            }
        )

    try:
        ip = get_ip()
    except ValueError:
        app.logger.exception("client IP error")
        return (
            jsonify(
                {
                    "success": False,
                    "status": "isError",
                    "verification": None,
                    "errorMessage": CHECKPOINT_ERROR_MESSAGE,
                }
            ),
            500,
        )

    try:
        event = CheckpointEvent(
            ip=ip,
            data={**(body.get("payload") or {}), "exampleValueFromBackendOnly": "EXAMPLE_VALUE"},
        )
        response = client.checkpoint(
            checkpoint_name=body.get("checkpointName"),
            event=event,
            session_id=body.get("sessionId") or "",
            user_id=body.get("userId") or "",
            source_token=body.get("sourceToken") or "",
            use_verification_id=body.get("verificationId") or "",
        )

        verification = asdict(response.verification) if response.verification else None

        if client.is_allowed(response):
            status = "isAllowed"
        elif client.is_running(response):
            status = "isRunning"
        elif client.is_denied(response):
            status = "isDenied"
        else:
            status = "isError"

        result = {"success": True, "status": status, "verification": verification}
        if status == "isError":
            result["errorMessage"] = json.dumps([asdict(e) for e in response.errors])
        return jsonify(result)
    except Exception:
        app.logger.exception("checkpoint error")
        return jsonify(
            {
                "success": False,
                "status": "isError",
                "verification": None,
                "errorMessage": CHECKPOINT_ERROR_MESSAGE,
            }
        )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3021"))
    app.run(host="0.0.0.0", port=port)
