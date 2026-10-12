// Checks how every sidecar derives the client IP it sends to Composer, and that
// /checkpoint rejects a malformed body or a missing checkpointName with 400.
//
// IP is a signal the risk engine scores, so a caller must not be able to choose it. This exercises each sidecar
// through its real HTTP surface and reads back what the fake Composer API actually received.
//
// Default (TRUSTED_PROXY_COUNT=0), two probes per sidecar:
//   1. a spoofed X-Forwarded-For plus a caller-supplied body.ip
//   2. a spoofed X-Forwarded-For alone
// In both cases the sidecar must send the socket address, not those values, and must not fall
// back to the hardcoded literal.
//
// Then TRUSTED_PROXY_COUNT=1, one probe per sidecar: X-Forwarded-For is
// "<spoofed>, <proxy-appended>" plus body.ip. The sidecar must send the proxy-appended hop.
//
// Input validation, two probes per sidecar:
//   1. a body that is not JSON
//   2. valid JSON without checkpointName
// Both must return 400 and must not reach Composer.
//
// Usage (from `server/`):
//   docker compose -f docker-compose.yml -f tests/docker-compose.test.yml up -d --build
//   node tests/check-ip-derivation.mjs

import { spawnSync } from "node:child_process";

const FAKE_API = "http://localhost:3099";

const SIDECARS = [
  { name: "node-ts", port: 3020 },
  { name: "python", port: 3021 },
  { name: "php", port: 3022 },
  { name: "ruby", port: 3023 },
  { name: "go", port: 3024 },
  { name: "java", port: 3025 },
  { name: "dotnet", port: 3026 },
];

const SPOOFED_HEADER_IP = "9.9.9.9";
const SPOOFED_BODY_IP = "8.8.8.8";
const PROXY_APPENDED_IP = "203.0.113.50";
const HARDCODED_FALLBACK = "76.90.54.224";

const BOOT_TIMEOUT_MS = 180_000;
const COMPOSE_ARGS = ["compose", "-f", "docker-compose.yml", "-f", "tests/docker-compose.test.yml"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForHealth = async (sidecar) => {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://localhost:${sidecar.port}/healthz`);
      if (response.ok) return true;
    } catch {
      // Not listening yet. The JVM and .NET sidecars take the longest to come up.
    }
    await sleep(1000);
  }
  return false;
};

const setTrustedProxyCount = (count) => {
  const result = spawnSync("docker", [...COMPOSE_ARGS, "up", "-d"], {
    encoding: "utf8",
    env: { ...process.env, TRUSTED_PROXY_COUNT: String(count) },
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "docker compose up failed\n");
    throw new Error(`docker compose up failed (${result.status})`);
  }
};

const resetFakeApi = async () => {
  await fetch(`${FAKE_API}/__received`, { method: "DELETE" });
};

const lastCheckpointIp = async () => {
  const response = await fetch(`${FAKE_API}/__received`);
  const records = await response.json();
  const checkpoint = records.findLast((record) => record.path.endsWith("/checkpoint"));
  return checkpoint?.body?.event?.ip ?? null;
};

const callCheckpoint = async (sidecar, { includeBodyIp, forwardedFor }) => {
  const body = {
    checkpointName: "HARNESS_IP_CHECK",
    payload: { harness: true },
    sessionId: "harness-session",
  };
  if (includeBodyIp) body.ip = SPOOFED_BODY_IP;

  await fetch(`http://localhost:${sidecar.port}/checkpoint`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": forwardedFor,
    },
    body: JSON.stringify(body),
  });
};

const verdictForSocket = (derivedIp) => {
  if (derivedIp === null) return { ok: false, reason: "no checkpoint reached the API" };
  if (derivedIp === SPOOFED_HEADER_IP) return { ok: false, reason: "trusted the spoofed X-Forwarded-For" };
  if (derivedIp === SPOOFED_BODY_IP) return { ok: false, reason: "trusted the caller-supplied body.ip" };
  if (derivedIp === HARDCODED_FALLBACK) return { ok: false, reason: "fell back to the hardcoded literal" };
  return { ok: true, reason: "used the real connection address" };
};

const verdictForHop = (derivedIp) => {
  if (derivedIp === null) return { ok: false, reason: "no checkpoint reached the API" };
  if (derivedIp === PROXY_APPENDED_IP) return { ok: true, reason: "used the proxy-appended hop" };
  if (derivedIp === SPOOFED_HEADER_IP) return { ok: false, reason: "trusted the leftmost X-Forwarded-For hop" };
  if (derivedIp === SPOOFED_BODY_IP) return { ok: false, reason: "trusted the caller-supplied body.ip" };
  if (derivedIp === HARDCODED_FALLBACK) return { ok: false, reason: "fell back to the hardcoded literal" };
  return { ok: false, reason: "did not use the proxy-appended hop" };
};

const probe = async (sidecar, { includeBodyIp, forwardedFor, verdict }) => {
  await resetFakeApi();
  await callCheckpoint(sidecar, { includeBodyIp, forwardedFor });
  const derivedIp = await lastCheckpointIp();
  return { derivedIp, ...verdict(derivedIp) };
};

const probeValidation = async (sidecar, probeName, body) => {
  await resetFakeApi();
  let status = 0;
  try {
    const response = await fetch(`http://localhost:${sidecar.port}/checkpoint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    status = response.status;
  } catch {
    return { sidecar: sidecar.name, probe: probeName, ok: false, derivedIp: "-", reason: "request failed" };
  }
  const derivedIp = await lastCheckpointIp();
  if (status !== 400) {
    return {
      sidecar: sidecar.name,
      probe: probeName,
      ok: false,
      derivedIp: derivedIp ?? "-",
      reason: `expected 400, got ${status}`,
    };
  }
  if (derivedIp !== null) {
    return {
      sidecar: sidecar.name,
      probe: probeName,
      ok: false,
      derivedIp,
      reason: "forwarded a checkpoint despite 400",
    };
  }
  return { sidecar: sidecar.name, probe: probeName, ok: true, derivedIp: "-", reason: "rejected with 400" };
};

const probeEachValidation = async (probeName, body) => {
  const results = [];
  for (const sidecar of SIDECARS) {
    if (!(await waitForHealth(sidecar))) {
      results.push({ sidecar: sidecar.name, probe: "startup", ok: false, derivedIp: "-", reason: "never became healthy" });
      continue;
    }
    results.push(await probeValidation(sidecar, probeName, body));
  }
  return results;
};

const probeEach = async (probeName, options) => {
  const results = [];
  for (const sidecar of SIDECARS) {
    if (!(await waitForHealth(sidecar))) {
      results.push({ sidecar: sidecar.name, probe: "startup", ok: false, derivedIp: "-", reason: "never became healthy" });
      continue;
    }
    results.push({ sidecar: sidecar.name, probe: probeName, ...(await probe(sidecar, options)) });
  }
  return results;
};

const run = async () => {
  const results = [];

  results.push(
    ...(await probeEachValidation("malformed body", "not-json")),
    ...(await probeEachValidation("missing name", "{}")),
  );

  results.push(
    ...(await probeEach("header + body.ip", {
      includeBodyIp: true,
      forwardedFor: SPOOFED_HEADER_IP,
      verdict: verdictForSocket,
    })),
    ...(await probeEach("header only", {
      includeBodyIp: false,
      forwardedFor: SPOOFED_HEADER_IP,
      verdict: verdictForSocket,
    })),
  );

  try {
    setTrustedProxyCount(1);
    results.push(
      ...(await probeEach("hop from right", {
        includeBodyIp: true,
        forwardedFor: `${SPOOFED_HEADER_IP}, ${PROXY_APPENDED_IP}`,
        verdict: verdictForHop,
      })),
    );
  } finally {
    setTrustedProxyCount(0);
  }

  for (const result of results) {
    const mark = result.ok ? "PASS" : "FAIL";
    console.log(
      `${mark}  ${result.sidecar.padEnd(8)} ${result.probe.padEnd(16)} sent ${String(result.derivedIp).padEnd(15)} ${result.reason}`,
    );
  }

  const failures = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`);

  if (failures.length > 0) process.exitCode = 1;
};

run();
