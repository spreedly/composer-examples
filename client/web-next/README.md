# Next.js Example of how to use the Composer Client SDK

This example demonstrates how to use the Composer Client SDK,
[`@spreedly/composer-sdk-client`](https://www.npmjs.com/package/@spreedly/composer-sdk-client),
in a Next.js application.

## Prerequisites

1. A Composer account and a **public API key** from the Developer Center (distinct from the server secret key).
2. Your API base URL (sandbox: `https://api.sandbox.dodgeballhq.com`, production: `https://api.dodgeballhq.com`).

## Configuration

Copy `.env.example` to `.env` in this folder and fill in your values:

```bash
NEXT_PUBLIC_DODGEBALL_API_URL=https://api.sandbox.dodgeballhq.com
NEXT_PUBLIC_DODGEBALL_PUBLIC_API_KEY=your_public_api_key
```

Next.js only exposes environment variables prefixed with `NEXT_PUBLIC_` to browser code, which is why the Composer Client SDK settings use that prefix.

`NEXT_PUBLIC_SPREEDLY_API_URL` and `NEXT_PUBLIC_SPREEDLY_PUBLIC_API_KEY` are also accepted when the `NEXT_PUBLIC_DODGEBALL_*` names are unset.

Optional MFA demo values (only needed if you exercise MFA in the UI):

```bash
NEXT_PUBLIC_TEST_MFA_PHONE=+15551234567
NEXT_PUBLIC_TEST_MFA_EMAIL=test@example.com
```

## How this demo fits together

Checkpoint calls belong on your server with your secret API key, not in the browser. This app wires up both SDKs: the Composer Client SDK runs client-side to collect signals and fetch a source token. **Call Checkpoint** POSTs to `http://localhost:3020/checkpoint`, where the [node-ts sidecar](../../server/node-ts) invokes Composer with your secret key.

Start that sidecar before using this UI. Only node-ts is set up for browser calls in local dev. The other sidecars under `server/` share the same endpoint and are meant for server-side or `curl` testing. See [server/README.md](../../server/README.md).

## Running the example

1. Start the node-ts sidecar: `cd ../../server/node-ts && npm install && npm start`
1. Go to this directory: `cd ./client/web-next`
1. Add a `.env` file based on `.env.example` (see **Configuration** above).
1. Run `npm install` to install the dependencies.
1. Run `npm run dev` to start the development server. If you want to use a specific port, you can run `npm run dev -- --port <port>`, and set `CORS_ORIGIN=http://localhost:<port>` in `server/node-ts/.env` so the sidecar allows browser calls from it.
1. Visit `http://localhost:<port>` in your browser, you will see an error in the same terminal where you ran `npm run dev` - it will show simple information about Composer Client SDK initialization, and let you get a source token on demand.

## What is special about Next JS and Composer?

The Composer Client SDK must access end-user browser information to gather signals that relate to fraud risk. This information is only available on the client side, so the SDK must be initialized on the client side.

When the SDK is initialized on the server side, it throws an error because the server does not have access to the end-user browser information.

Since Next.js has a hybrid server and client side rendering model, you can initialize the SDK on the client side, but you need to make sure that you do it in a way that does not conflict with Next.js.

This example demonstrates how to do this by using a React Context to manage the Composer Client SDK instance.

For more information on how to use this Context approach with Next.js, see the [Next.js Documentation on Context Providers](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns#using-context-providers).
