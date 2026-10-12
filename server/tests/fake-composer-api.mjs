// A stand-in for the Composer API, used only by the sidecar test harness.
//
// Every sidecar already reads its API base URL from DODGEBALL_API_URL (or SPREEDLY_API_URL), so pointing all
// seven here lets the harness see exactly what each one sent — in particular which IP it
// derived for the caller. Requests are recorded in memory and served back on /__received.
//
// Responds APPROVED/COMPLETE so the SDKs never enter their polling loop.

import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 3099);

const received = [];

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });

const sendJson = (res, status, payload) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
};

const approvedResponse = (verificationId) => ({
  success: true,
  errors: [],
  version: "v1",
  verification: {
    id: verificationId,
    status: "COMPLETE",
    outcome: "APPROVED",
    stepData: {},
  },
});

const record = async (req) => {
  const raw = await readBody(req);
  let body = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = { unparseable: raw };
  }

  received.push({
    path: req.url,
    // Identifies which SDK called, which is how the harness attributes a request to a sidecar
    // when several are exercised in the same run.
    sdkSource: req.headers["composer-sdk-source"] ?? null,
    body,
    at: new Date().toISOString(),
  });

  return body;
};

const server = createServer(async (req, res) => {
  const path = (req.url ?? "").split("?")[0];

  if (path === "/__received") {
    if (req.method === "DELETE") {
      received.length = 0;
      return sendJson(res, 200, { cleared: true });
    }
    return sendJson(res, 200, received);
  }

  if (path === "/__healthz") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && path.endsWith("/checkpoint")) {
    await record(req);
    return sendJson(res, 200, approvedResponse(`ver_${received.length}`));
  }

  if (req.method === "POST" && path.endsWith("/track")) {
    await record(req);
    return sendJson(res, 200, { success: true, errors: [], version: "v1" });
  }

  // The sidecars shouldn't reach this: checkpoints come back already resolved.
  if (req.method === "GET" && path.includes("/verification/")) {
    return sendJson(res, 200, approvedResponse(path.split("/").pop()));
  }

  sendJson(res, 404, { success: false, errors: [{ code: 404, message: `No stub for ${req.method} ${path}` }] });
});

server.listen(PORT, () => {
  console.log(`fake composer api listening on ${PORT}`);
});
