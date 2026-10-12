# Contributing to Composer Examples

Thank you for your interest in contributing! This repository contains small example
applications that show how to integrate [Spreedly Composer](https://developer.spreedly.com/docs/about-composer) on
the server and client. This guide covers how to set up a local development environment
and run the examples against a Composer account.

## Prerequisites

- Node.js >= 18 and npm (for `server/node-ts` and `client/web-next`)
- JDK 25 and Maven (for `server/java`)
- A Spreedly **test** environment with API credentials ([credentials docs](https://developer.spreedly.com/docs/create-environments-and-access-secrets))

## Getting Started

```bash
git clone https://github.com/spreedly/composer-examples.git
cd composer-examples
```

Each example is self-contained. Copy the sample environment file, fill in your
**test** credentials, then start the example you want to work on.

### Node / TypeScript server (`server/node-ts`)

```bash
cd server/node-ts
cp .env.example .env   # then fill in your credentials
npm install
npm start              # express server on port 3020
```

### Next.js client (`client/web-next`)

```bash
cd client/web-next
cp .env.example .env   # then fill in your credentials
npm install
npm run dev
```

### Java sidecar (`server/java`)

```bash
cd server/java
cp .env.example .env   # then fill in your credentials
mvn package -DskipTests
java -jar target/java-sidecar-1.0.0.jar   # HTTP server on port 3025
```

## Security Guidelines for Contributors

### Use a test environment only

**Never** use production credentials for development. Create a dedicated test
environment from the [Spreedly dashboard](https://app.spreedly.com/). Test
environments use simulated gateways and cannot process real payments.

### Never commit credentials

Credentials must stay out of version control. This repo's `.gitignore` excludes
`.env` files. Before committing, verify you aren't including secrets:

```bash
git diff --cached  # review staged changes
```

| Approach                                      | Risk level         | Notes                                          |
| --------------------------------------------- | ------------------ | ---------------------------------------------- |
| Per-project `.env` (gitignored)               | Low                | The intended place for local credentials       |
| Environment variables in your shell profile   | Low                | e.g. `export DODGEBALL_SECRET_KEY=...`          |
| Hardcoded in source                           | **Do not do this** | Will be committed and exposed                  |

### If credentials are exposed

If you accidentally commit credentials:

1. **Rotate them immediately** in the [Spreedly dashboard](https://app.spreedly.com/)
2. Remove the commit from history (`git rebase` or `git filter-repo`)
3. Force-push the cleaned branch
4. Notify the team if it reached a shared branch

## Submitting Changes

1. Fork the repository
2. Create a feature branch from `main`
3. Make your change and verify the relevant example still builds and runs
4. Submit a pull request with a clear description of the change
