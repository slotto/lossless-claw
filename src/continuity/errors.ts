export const ErrorCodes = {
  INVALID_REQUEST: "INVALID_REQUEST",
  UNAVAILABLE: "UNAVAILABLE",
} as const;

export function errorShape(code: string, message: string): { code: string; message: string } {
  return { code, message };
}
