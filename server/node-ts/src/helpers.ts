import { Request } from "express";
import { isIP } from "net";

// Client IP for the risk engine. Callers must not choose this value.
// Default (TRUSTED_PROXY_COUNT=0): socket address, ignore X-Forwarded-For.
// Positive count: that many hops from the right of X-Forwarded-For; the hop must be an IP.
export const getIp = (req: Request): string => {
  const hops = Number(process.env.TRUSTED_PROXY_COUNT ?? "0");
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error("Cannot derive client IP: TRUSTED_PROXY_COUNT is not a valid hop count");
  }

  const header = req.headers["x-forwarded-for"];
  const parts = (Array.isArray(header) ? header.join(",") : (header ?? "")).split(",").map((part) => part.trim());
  const candidate =
    hops === 0 ? req.socket.remoteAddress : hops <= parts.length ? parts[parts.length - hops] : undefined;
  if (!candidate || !isIP(candidate)) {
    throw new Error("Cannot derive client IP: no valid IP for this TRUSTED_PROXY_COUNT");
  }
  return candidate;
};
