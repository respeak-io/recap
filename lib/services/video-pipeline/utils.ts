/** Sanitize Gemini JSON output by stripping control characters */
export function sanitizeJsonResponse(raw: string): string {
  return raw.replace(
    /[\x00-\x1f\x7f]/g,
    (ch) => (ch === "\n" || ch === "\r" || ch === "\t" ? ch : "")
  );
}
