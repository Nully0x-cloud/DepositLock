/**
 * The error boundary between PostgREST and the application.
 *
 * Components never see a raw Postgres/PostgREST payload: repositories translate
 * every failure into one of five stable codes with copy that is safe to render.
 */

export type RepositoryErrorCode =
  | "not_found"
  | "permission_denied"
  | "validation"
  | "conflict"
  | "unknown";

export type RepositoryError = {
  code: RepositoryErrorCode;
  message: string;
  /** Raw driver detail — logged, never rendered. */
  detail?: string;
};

export type RepositoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: RepositoryError };

/** Shape PostgREST reports for a failed statement. */
type PostgrestErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

const MESSAGES: Record<RepositoryErrorCode, string> = {
  not_found: "That record could not be found.",
  permission_denied: "You do not have access to that record.",
  validation: "Those details are not valid for this record.",
  conflict: "That record conflicts with an existing one.",
  unknown: "Something went wrong. Please try again.",
};

const isPostgrestError = (value: unknown): value is PostgrestErrorLike =>
  typeof value === "object" &&
  value !== null &&
  "message" in value &&
  typeof (value as PostgrestErrorLike).message === "string";

/**
 * Maps a driver error onto the stable application codes.
 *
 * Recognised signals:
 * - `PGRST116` / "no rows"      → not_found
 * - SQLSTATE `P0002`            → not_found (our RPCs raise "not valid")
 * - SQLSTATE `42501` / `PGRST301` → permission_denied (RLS rejected the read)
 * - SQLSTATE `23xxx`            → validation, except `23505` → conflict
 * - everything else             → unknown
 */
export function mapRepositoryError(error: unknown): RepositoryError {
  if (!isPostgrestError(error)) {
    return { code: "unknown", message: MESSAGES.unknown };
  }

  const code = error.code ?? "";
  const message = error.message ?? "";

  if (code === "PGRST116" || /^0 rows/i.test(message)) {
    return { code: "not_found", message: MESSAGES.not_found, detail: message };
  }

  if (code === "P0002") {
    return { code: "not_found", message: MESSAGES.not_found, detail: message };
  }

  if (code === "42501" || code === "PGRST301" || /row-level security/i.test(message)) {
    return {
      code: "permission_denied",
      message: MESSAGES.permission_denied,
      detail: message,
    };
  }

  if (code === "23505") {
    return { code: "conflict", message: MESSAGES.conflict, detail: message };
  }

  if (code.startsWith("23")) {
    return { code: "validation", message: MESSAGES.validation, detail: message };
  }

  if (code === "42P01" || code === "42703") {
    return { code: "validation", message: MESSAGES.validation, detail: message };
  }

  return { code: "unknown", message: MESSAGES.unknown, detail: message };
}

export function repositoryError(
  code: RepositoryErrorCode,
  detail?: string,
): RepositoryError {
  return { code, message: MESSAGES[code], detail };
}

/**
 * Engine output that must never reach a user. Everything else in `detail`
 * was raised by our own SECURITY DEFINER RPCs (authored, human-readable
 * copy such as "This invitation has expired…") and is safe to render.
 */
const ENGINE_DETAIL =
  /constraint|relation |column |row-level security|syntax error|foreign key|duplicate key|violates|JSON object requested|multiple \(or no\) rows/i;

/**
 * The copy to render for a failed repository call: our authored RPC message
 * when it is safe, otherwise the stable generic message for the code.
 */
export function displayMessage(error: RepositoryError): string {
  const detail = error.detail;
  if (!detail || ENGINE_DETAIL.test(detail)) return error.message;
  return detail;
}

export function isRepositoryError(value: unknown): value is RepositoryError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    typeof (value as RepositoryError).code === "string"
  );
}
