# Sidecar test harness

Hits all seven sidecars over HTTP. Compose starts the set and points them at a fake
Composer API that records what they sent, so one script can check that they still
behave the same way.

## Running it

```bash
cd server

docker compose -f docker-compose.yml -f tests/docker-compose.test.yml up -d --build
node tests/check-ip-derivation.mjs
docker compose -f docker-compose.yml -f tests/docker-compose.test.yml down
```

No dependencies to install. The first run builds seven images and takes a while. The
Java and .NET sidecars are the slowest to become healthy; the script waits for them.

Building requires the sibling SDK repositories checked out next to this one, because
`docker-compose.yml` builds each sidecar against its local SDK source.

The script prints PASS/FAIL per probe and a final `n/n checks passed`. A non-zero exit
means something failed.

## What's here

| File | Purpose |
|------|---------|
| `fake-composer-api.mjs` | Stands in for the Composer API. Records every request and answers APPROVED so the SDKs don't poll. Serves recordings on `/__received`. |
| `docker-compose.test.yml` | Overlay that points each sidecar's `DODGEBALL_API_URL` at the fake API and supplies a throwaway key. |
| `check-ip-derivation.mjs` | Asserts each sidecar ignores a spoofed `X-Forwarded-For` and `body.ip` by default, then recreates them with `TRUSTED_PROXY_COUNT=1` and asserts they take the rightmost hop. Also asserts a malformed body and a missing `checkpointName` return 400 without calling Composer, and that a failed SDK call (200) and an invalid `TRUSTED_PROXY_COUNT` (500) return the generic `errorMessage` instead of the exception text. |
