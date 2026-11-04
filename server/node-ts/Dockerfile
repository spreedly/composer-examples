# syntax=docker/dockerfile:1
#
# INTERIM BUILD. The Composer Node SDK (@spreedly/composer-sdk-server) is not yet
# published to npm. We bring its source in through the BuildKit named context "sdk"
# (wired up in ../docker-compose.yml) and build it inside the image.
#
# Once the SDK is published, delete the sdk-build stage and the SDK COPY below, and
# let package.json's dependency resolve normally from the registry.

# --- Stage 1: build the SDK from source ---------------------------------------
FROM node:25-slim AS sdk-build
WORKDIR /composer-sdk-server-node
COPY --from=sdk package.json package-lock.json* ./
RUN npm ci || npm install
COPY --from=sdk tsconfig.json ./
COPY --from=sdk config ./config
COPY --from=sdk tools ./tools
COPY --from=sdk src ./src
# Only the CJS (runtime) and types (compile-time import) outputs are needed here.
RUN npm run build:cjs && npm run build:types

# --- Stage 2: the sidecar -----------------------------------------------------
FROM node:25-slim AS app
WORKDIR /app
# package.json depends on the SDK via "file:../../../composer-sdk-server-node".
# Inside the image /app/../../../ collapses to /, so the built SDK must live at
# /composer-sdk-server-node for that relative path to resolve.
COPY --from=sdk-build /composer-sdk-server-node /composer-sdk-server-node
COPY package.json ./
# --install-links packs+copies the local file: SDK into node_modules instead of
# symlinking it. This avoids an npm arborist bug with linked deps and makes the
# image self-contained. The lockfile is intentionally not copied: it pins the SDK
# as a host-relative link that npm cannot reconcile inside the image.
RUN npm install --install-links
COPY tsconfig.json ./
COPY src ./src
ENV PORT=3020
ENV HOST=0.0.0.0
EXPOSE 3020
USER node
CMD ["./node_modules/.bin/ts-node", "src/index.ts"]
