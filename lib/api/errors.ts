export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "INTERNAL";

export function apiError(
  message: string,
  code: ApiErrorCode,
  status: number
): Response {
  return Response.json({ error: message, code }, { status });
}

export const notFound = (msg = "Not found") => apiError(msg, "NOT_FOUND", 404);
export const unauthorized = (msg = "Unauthorized") =>
  apiError(msg, "UNAUTHORIZED", 401);
export const validationError = (msg: string) =>
  apiError(msg, "VALIDATION_ERROR", 422);
export const conflict = (msg: string) => apiError(msg, "CONFLICT", 409);
export const forbidden = (msg = "Forbidden") =>
  apiError(msg, "FORBIDDEN", 403);
export const internal = (msg = "Internal error") =>
  apiError(msg, "INTERNAL", 500);
