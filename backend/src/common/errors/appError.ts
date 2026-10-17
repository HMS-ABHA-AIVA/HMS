export class ApiError extends Error {
  statusCode: number;
  success: false;
  errors: unknown[];

  constructor(
    statusCode: number,
    message: string,
    errors: unknown[] = [],
  ) {
    super(message);

    this.statusCode = statusCode;
    this.success = false;
    this.errors = errors;

    Error.captureStackTrace(this, this.constructor);
  }
}

//EXAMPLE USAGE
// throw new ApiError(400, "client error", [
// "fix 1",
// "fix 2",
// ]);