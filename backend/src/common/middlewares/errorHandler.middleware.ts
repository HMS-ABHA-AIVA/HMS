import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../errors/appError.js";


export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
    });
  }

  console.error(err);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};