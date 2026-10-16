using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using DotNetEnv;
using Spreedly.ComposerSdk;

Env.Load();

const string missingConfigMessage =
    "Missing DODGEBALL_SECRET_KEY; copy .env.example to .env (SPREEDLY_SECRET_KEY also accepted)";
// Failures are logged server-side; the client only gets this generic message.
const string checkpointErrorMessage = "Checkpoint request failed";
const string invalidCheckpointBody =
    "Invalid checkpoint request: body must be JSON with a non-empty checkpointName string";

var sdkMeta = new SdkMeta("dotnet", "Spreedly.ComposerSdk.Server", "1.0.0");

var port = EnvOrDefault("PORT", "3026");
Environment.SetEnvironmentVariable("ASPNETCORE_URLS", $"http://0.0.0.0:{port}");

var secretKey = EnvOr("DODGEBALL_SECRET_KEY", "SPREEDLY_SECRET_KEY");
if (!IsApiKeyConfigured(secretKey))
{
    Console.WriteLine($"warning: {missingConfigMessage}");
}

var composerConfig = new ComposerConfig
{
    ApiUrl = EnvOr("DODGEBALL_API_URL", "SPREEDLY_API_URL") is { Length: > 0 } apiUrl
        ? apiUrl
        : Constants.DefaultApiUrl,
    LogLevel = ComposerLogLevel.Info,
};

var composer = new ComposerClient(
    secretKey is { Length: > 0 } ? secretKey : "UNSET_SECRET_KEY",
    composerConfig
);

var jsonOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
};

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/healthz", () => Results.Json(new { ok = true, sdk = sdkMeta }, jsonOptions));
app.MapGet("/meta", () => Results.Json(sdkMeta, jsonOptions));
app.MapPost("/checkpoint", async (HttpContext context) =>
{
    CheckpointRequestBody? body;
    try
    {
        body = await JsonSerializer.DeserializeAsync<CheckpointRequestBody>(
            context.Request.Body,
            jsonOptions
        );
    }
    catch (JsonException)
    {
        return Results.Json(new { error = invalidCheckpointBody }, jsonOptions, statusCode: 400);
    }

    if (body is null || string.IsNullOrWhiteSpace(body.CheckpointName))
    {
        return Results.Json(new { error = invalidCheckpointBody }, jsonOptions, statusCode: 400);
    }

    if (!IsApiKeyConfigured(secretKey))
    {
        return Results.Json(CheckpointError(null, missingConfigMessage), jsonOptions);
    }

    string ip;
    try
    {
        ip = RequestIp(context);
    }
    catch (InvalidOperationException ex)
    {
        app.Logger.LogError(ex, "client IP error");
        return Results.Json(CheckpointError(null, checkpointErrorMessage), jsonOptions, statusCode: 500);
    }

    // Convert System.Text.Json JsonElement values to plain CLR objects; the SDK
    // serializes with Newtonsoft.Json, which can't serialize JsonElement.
    var payload = new Dictionary<string, object>();
    if (body.Payload is not null)
    {
        foreach (var entry in body.Payload)
        {
            payload[entry.Key] = NormalizeJsonValue(entry.Value)!;
        }
    }
    payload["exampleValueFromBackendOnly"] = "EXAMPLE_VALUE";

    try
    {
        var response = await composer.CheckpointAsync(
            body.CheckpointName ?? "",
            new CheckpointEvent { Ip = ip, Data = payload },
            body.SessionId,
            body.UserId,
            body.SourceToken,
            body.VerificationId,
            new CheckpointResponseOptions { Sync = false }
        );

        var status = "isError";
        if (ComposerClient.IsAllowed(response))
        {
            status = "isAllowed";
        }
        else if (ComposerClient.IsRunning(response))
        {
            status = "isRunning";
        }
        else if (ComposerClient.IsDenied(response))
        {
            status = "isDenied";
        }

        var result = new CheckpointSidecarResponse
        {
            Success = true,
            Status = status,
            Verification = VerificationToSidecar(response.Verification),
        };

        if (status == "isError")
        {
            result.ErrorMessage = JsonSerializer.Serialize(response.Errors, jsonOptions);
        }

        return Results.Json(result, jsonOptions);
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "checkpoint error");
        return Results.Json(CheckpointError(null, checkpointErrorMessage), jsonOptions);
    }
});

app.Run();

// Recursively convert JsonElement values to plain CLR objects the SDK can serialize.
static object? NormalizeJsonValue(object? value)
{
    if (value is not JsonElement element)
    {
        return value;
    }

    switch (element.ValueKind)
    {
        case JsonValueKind.Object:
            var map = new Dictionary<string, object?>();
            foreach (var property in element.EnumerateObject())
            {
                map[property.Name] = NormalizeJsonValue(property.Value);
            }
            return map;
        case JsonValueKind.Array:
            var list = new List<object?>();
            foreach (var item in element.EnumerateArray())
            {
                list.Add(NormalizeJsonValue(item));
            }
            return list;
        case JsonValueKind.String:
            return element.GetString();
        case JsonValueKind.Number:
            return element.TryGetInt64(out var longValue) ? longValue : element.GetDouble();
        case JsonValueKind.True:
            return true;
        case JsonValueKind.False:
            return false;
        case JsonValueKind.Null:
        case JsonValueKind.Undefined:
            return null;
        default:
            return element.ToString();
    }
}

static bool IsApiKeyConfigured(string apiKey) =>
    !string.IsNullOrWhiteSpace(apiKey) && apiKey != "UNSET_SECRET_KEY";

static string EnvOr(string primary, string fallback)
{
    var primaryValue = EnvOrDefault(primary, "");
    if (!string.IsNullOrWhiteSpace(primaryValue))
    {
        return primaryValue;
    }

    return EnvOrDefault(fallback, "");
}

static string EnvOrDefault(string key, string defaultValue)
{
    var fromDotenv = Env.GetString(key, null);
    if (!string.IsNullOrWhiteSpace(fromDotenv))
    {
        return fromDotenv;
    }

    var fromEnv = Environment.GetEnvironmentVariable(key);
    return !string.IsNullOrWhiteSpace(fromEnv) ? fromEnv : defaultValue;
}

// Client IP for the risk engine. Callers must not choose this value.
// Default (TRUSTED_PROXY_COUNT=0): socket address, ignore X-Forwarded-For.
// Positive count: that many hops from the right of X-Forwarded-For; the hop must be an IP.
static string RequestIp(HttpContext context)
{
    var raw = EnvOrDefault("TRUSTED_PROXY_COUNT", "0");
    if (!int.TryParse(raw, out var hops) || hops < 0)
    {
        throw new InvalidOperationException(
            "Cannot derive client IP: TRUSTED_PROXY_COUNT is not a valid hop count"
        );
    }

    var header = context.Request.Headers["X-Forwarded-For"].FirstOrDefault() ?? "";
    var parts = header.Split(',').Select(part => part.Trim()).ToArray();

    string? candidate;
    if (hops == 0)
    {
        candidate = context.Connection.RemoteIpAddress?.ToString();
    }
    else if (hops <= parts.Length)
    {
        candidate = parts[parts.Length - hops];
    }
    else
    {
        candidate = null;
    }

    if (candidate is null || !IPAddress.TryParse(candidate, out _))
    {
        throw new InvalidOperationException(
            "Cannot derive client IP: no valid IP for this TRUSTED_PROXY_COUNT"
        );
    }

    return candidate;
}

static SidecarVerification? VerificationToSidecar(Verification? verification)
{
    if (verification is null)
    {
        return null;
    }

    var stepData = verification.StepData ?? new Dictionary<string, object>();

    return new SidecarVerification(
        verification.Id,
        verification.Status,
        verification.Outcome,
        stepData
    );
}

static CheckpointSidecarResponse CheckpointError(SidecarVerification? verification, string errorMessage) =>
    new()
    {
        Success = false,
        Status = "isError",
        Verification = verification,
        ErrorMessage = errorMessage,
    };

record SdkMeta(string Language, string Package, string Version);

record CheckpointRequestBody
{
    public string? CheckpointName { get; set; }
    public Dictionary<string, object>? Payload { get; set; }
    public string? SessionId { get; set; }
    public string? UserId { get; set; }
    public string? SourceToken { get; set; }
    public string? VerificationId { get; set; }
}

record SidecarVerification(
    string Id,
    string Status,
    string Outcome,
    [property: JsonPropertyName("step_data")] Dictionary<string, object> StepData
);

class CheckpointSidecarResponse
{
    public bool Success { get; set; }
    public string Status { get; set; } = "";
    public SidecarVerification? Verification { get; set; }
    public string? ErrorMessage { get; set; }
}
