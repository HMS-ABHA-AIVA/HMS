import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../errors/appError.js";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  // Defaults to the client IP + route. Pass a function to key on something else (e.g. the login e-mail).
  key?: (req: Request) => string | undefined;
  message?: string;
}

// Minimal in-memory fixed-window limiter (OTP endpoints, logins).
// Single-instance only; swap for a shared store (e.g. Redis) if the API is scaled horizontally.
export const rateLimit = ({ windowMs, max, key: keyOf, message }: RateLimitOptions) => {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = keyOf ? keyOf(req) : `${req.ip}:${req.path}`;

    // Nothing to key on (e.g. login without an e-mail): let validation reject the request.
    if (!key) return next();

    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
    } else {
      entry.count += 1;
      if (entry.count > max) {
        return next(new ApiError(429, message ?? "Too many requests. Please wait a minute and try again.", [], "RATE_LIMITED"));
      }
    }

    // Opportunistic cleanup so the map cannot grow without bound.
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    next();
  };
};
