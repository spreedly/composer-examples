# Server-side examples

Each folder under `server/` is a small backend that shows how to call a Composer
checkpoint from that language. Use these as a starting point for your own
protected service — copy the pattern into your app, install the published SDK for
your stack, and point it at your Composer API key and base URL.

| Folder    | Language | Default port |
| --------- | -------- | ------------ |
| `node-ts` | Node.js  | 3020         |
| `python`  | Python   | 3021         |
| `php`     | PHP      | 3022         |
| `ruby`    | Ruby     | 3023         |
| `go`      | Go       | 3024         |
| `java`    | Java     | 3025         |
| `dotnet`  | .NET     | 3026         |

## Prerequisites

1. A Composer account and a **secret API key** from the Developer Center.
2. Your API base URL (sandbox: `https://api.sandbox.dodgeballhq.com`, production: `https://api.dodgeballhq.com`).
3. A published checkpoint to call (create and publish one in Checkpoint Studio).

## Configuration

Copy `.env.example` to `.env` in the folder you are running and fill in your values:

```bash
DODGEBALL_API_URL=https://api.sandbox.dodgeballhq.com
DODGEBALL_SECRET_KEY=your_secret_key
```

`SPREEDLY_API_URL` and `SPREEDLY_SECRET_KEY` are also accepted when the `DODGEBALL_*` names are unset.

The servers listen on `127.0.0.1`, so only this machine can reach them. Set `HOST=0.0.0.0` to accept connections from other machines, for example in a container or behind a load balancer. The Docker images already set it. For PHP, change the address in the `php -S` command.

## Run locally

### Node (TypeScript)

```bash
cd server/node-ts
npm install
npm start
# http://localhost:3020
```

### Python

```bash
cd server/python
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py
# http://localhost:3021
```

### PHP

Requires PHP 8.2+.

```bash
cd server/php
composer install
php -S 127.0.0.1:3022 -t . app.php
# http://localhost:3022
```

### Ruby

```bash
cd server/ruby
bundle install
bundle exec ruby app.rb
# http://localhost:3023
```

### Go

```bash
cd server/go
go run .
# http://localhost:3024
```

### Java

Requires Java 25+.

```bash
cd server/java
mvn package -DskipTests
java -jar target/java-sidecar-1.0.0.jar
# http://localhost:3025
```

### .NET

Requires .NET 10+.

```bash
cd server/dotnet
dotnet run
# http://localhost:3026
```

## What the example does

Each sidecar exposes a minimal HTTP API around one checkpoint call:

| Method | Path          | Purpose                                      |
| ------ | ------------- | -------------------------------------------- |
| GET    | `/healthz`    | Liveness check                               |
| GET    | `/meta`       | SDK language, package name, and version      |
| POST   | `/checkpoint` | Run a checkpoint and return the result       |

**`POST /checkpoint` body** (JSON):

```json
{
  "checkpointName": "YOUR_CHECKPOINT",
  "payload": {},
  "sessionId": "session-id",
  "userId": "user-id",
  "sourceToken": "source-token-from-client-sdk",
  "verificationId": "optional-for-follow-up-checks"
}
```

**Response:**

```json
{
  "success": true,
  "status": "isAllowed",
  "verification": { },
  "errorMessage": "only when status is isError"
}
```

`status` is one of `isAllowed`, `isRunning`, `isDenied`, or `isError`.

On `isError`, `errorMessage` holds the errors the Composer API returned. If the sidecar itself fails (for example, the SDK call throws or the client IP can't be derived), `errorMessage` is the fixed string `Checkpoint request failed` and the details go to the server log.

## Quick smoke test

```bash
curl -s http://localhost:3020/healthz
curl -s -X POST http://localhost:3020/checkpoint \
  -H 'content-type: application/json' \
  -d '{"checkpointName":"YOUR_CHECKPOINT","payload":{},"sessionId":"sess-1","sourceToken":"<token>"}'
```

Replace the port with `3021` for Python, `3022` for PHP, `3023` for Ruby, `3024` for Go, `3025` for Java, or `3026` for .NET.

## Adapting this for your app

You do **not** need to run our example server in production. Typical integration:

1. Install the Composer server SDK for your language.
2. Instantiate the client with your secret key and API URL.
3. On the server, at the moment you need a trust decision, call `checkpoint()`
   with the session, user, device IP, and transaction payload from the request.
4. Branch on `isAllowed` / `isRunning` / `isDenied` and return the verification
   to your frontend when additional steps are required.
5. When something fails, log the exception on the server and return a generic
   message. Exception text can describe your configuration and internals, so
   don't send it to the client.

The `node-ts`, `python`, `php`, `ruby`, `go`, `java`, and `dotnet` folders show that flow in Express, Flask,
PHP's built-in server, Sinatra, Go's `net/http` package, a minimal Java HTTP server, and ASP.NET minimal APIs.

Call `checkpoint` from a route that already authenticates the user, such as `POST /api/orders`. Do not expose an unauthenticated `/checkpoint`.

The node example allows browser calls from `http://localhost:3000`, the origin of the web-next client in `client/`. If you run web-next on another port or open it at `http://127.0.0.1:3000`, set `CORS_ORIGIN` to match. If a browser will call your API, set `Access-Control-Allow-Origin` to your frontend origin.

## SDK repositories

- Node: [composer-sdk-server-node](https://github.com/spreedly/composer-sdk-server-node)
- Python: [composer-sdk-server-python](https://github.com/spreedly/composer-sdk-server-python)
- PHP: [composer-sdk-server-php](https://github.com/spreedly/composer-sdk-server-php)
- Ruby: [composer-sdk-server-ruby](https://github.com/spreedly/composer-sdk-server-ruby)
- Go: [composer-sdk-server-go](https://github.com/spreedly/composer-sdk-server-go)
- Java: [composer-sdk-server-java](https://github.com/spreedly/composer-sdk-server-java)
- .NET: [composer-sdk-server-dotnet](https://github.com/spreedly/composer-sdk-server-dotnet)
