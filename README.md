# composer-examples

For server-side Composer SDK sidecars see [server/README.md](server/README.md).

## Purpose

This repository contains simple example applications to get you started with Composer.

## How to Use

To orchestrate and protect the full user-journey, Composer offers SDKs for both the server and client side.

The `client` folder contains all client-side examples (i.e. code that runs on the customer's device):

- [Web (Next)](#web-next)

The `server` folder contains Composer SDK sidecar examples — see [server/README.md](server/README.md).

You should use these examples along with the [official Spreedly documentation](https://developer.spreedly.com/) to experiment with your Composer account. You will need a [Spreedly account](https://app.spreedly.com/) to run these examples.

Once you have an account, login, visit the **Checkpoint Studio**, then create a new checkpoint called `PAYMENT`. Open the **Step Palette**, then drag and drop an *Allow* step into your checkpoint. Drag an arrow from the *PAYMENT* step to the *Allow* step to connect them. Then click the **Publish** button in the top-right of your screen.

Fantastic, now you're ready to experiment with Composer! Follow the instructions for your preferred server language. While running the Composer Client SDK in the browser is optional, using it is highly recommended to gather device intelligence and enable progressive user-friction.

## Server-Side Examples

Sidecars under `server/` each expose `/healthz`, `/meta`, and `/checkpoint` on a dedicated port.
Copy `.env.example` to `.env` in the folder you are running and set `DODGEBALL_SECRET_KEY`.

### Node (node-ts)

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

Requires Java 25+. See [server/README.md](server/README.md) for full build instructions.

```bash
cd server/java
mvn package -DskipTests
java -jar target/java-sidecar-1.0.0.jar
# http://localhost:3025
```

### .NET

Requires .NET 10+, or use Docker Compose.

```bash
cd server/dotnet
dotnet run
# http://localhost:3026
```

To run every sidecar together, see **Docker Compose** in [server/README.md](server/README.md).

## Client-Side Examples

### Web (Next)

The Web example is found in `client/web-next`. Copy `.env.example` to `.env` and set your **public API key** and API URL (`NEXT_PUBLIC_DODGEBALL_*` — see [client/web-next/README.md](client/web-next/README.md#configuration) for where to find them). Then:

```bash
cd client/web-next
npm install
npm run dev
```

This will start a Next.js app that allows you to easily call checkpoints and evaluate their responses. It is configured to send POST requests to the node-ts sidecar listening on `http://localhost:3020/checkpoint`.

## Security

See [SECURITY.md](SECURITY.md) for how to report a security vulnerability.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local development setup and contribution guidelines.

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
