export type ActionResult<T = null> =
  | { ok: true; message: string; data: T }
  | {
      ok: false;
      message: string;
      fieldErrors: Record<string, string>;
      /** The 2FA challenge expired; the user must start over from the password step. */
      challengeExpired?: boolean;
    };

export function fail(
  message: string,
  fieldErrors: Record<string, string> = {},
): Extract<ActionResult, { ok: false }> {
  return { ok: false, message, fieldErrors };
}

export function succeed<T>(message: string, data: T): ActionResult<T> {
  return { ok: true, message, data };
}
