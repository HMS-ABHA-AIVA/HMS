import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { ApiError } from "../errors/appError.js";


export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (err instanceof ApiError) {
    res.locals.errorCode = err.code; // read by the ABHA audit trail
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
      ...(err.code ? { code: err.code } : {}),
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: `Invalid request: ${err.issues.map((issue) => issue.message).join(", ")}`,
      errors: [],
    });
  }

  // body-parser failures (malformed JSON, payload too large ...) carry a 4xx status and a safe message.
  const httpErr = err as Error & { status?: number; statusCode?: number; type?: string };
  const clientStatus = httpErr.status ?? httpErr.statusCode;
  if (clientStatus && clientStatus >= 400 && clientStatus < 500) {
    return res.status(clientStatus).json({
      success: false,
      message: httpErr.type === "entity.parse.failed" ? "Invalid JSON in request body" : "Invalid request",
      errors: [],
    });
  }

  console.error(err);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};
