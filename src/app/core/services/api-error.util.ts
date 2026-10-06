/** The message the API put in a failed response (`{ error: "…" }`), if any. */
export function apiErrorMessage(error: unknown): string | undefined {
  return (error as { error?: { error?: string } } | null)?.error?.error;
}
