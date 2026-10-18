import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../errors/appError.js";

// Minimal in-memory fixed-window limiter for OTP endpoints (Aadhaar/mobile OTP abuse protection).
// Single-instance only; swap for a shared store (e.g. Redis) if the API is scaled horizontally.
export const rateLimit = ({ windowMs, max }: { windowMs: number; max: number }) => {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${req.ip}:${req.path}`;
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
    } else {
      entry.count += 1;
      if (entry.count > max) {
        return next(new ApiError(429, "Too many requests. Please wait a minute and try again."));
      }
    }

    // Opportunistic cleanup so the map cannot grow without bound.
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    next();
  };
};
