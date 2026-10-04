import { mapRepositoryError, repositoryError, type RepositoryResult } from "./errors";

/**
 * The shape PostgREST resolves a query to. Kept structural so repositories can
 * be unit tested with a fake builder instead of a live connection.
 */
export type QueryLike<T> = PromiseLike<{
  data: T | null;
  error: {
    code?: string | null;
    message?: string | null;
    details?: string | null;
    hint?: string | null;
  } | null;
}>;

/**
 * Awaits a PostgREST query and converts its outcome into a `RepositoryResult`.
 *
 * - driver error     → mapped stable code (never leaked to the UI)
 * - `null` data      → `not_found`
 * - empty array      → `not_found` when `emptyAsMissing` is set
 * - thrown exception → mapped as `unknown`
 */
export async function fromResult<T>(
  query: QueryLike<T>,
  options: { emptyAsMissing?: boolean; allowNull?: boolean } = {},
): Promise<RepositoryResult<T>> {
  try {
    const { data, error } = await query;

    if (error) return { ok: false, error: mapRepositoryError(error) };
    if (data === null) {
      if (options.allowNull) return { ok: true, data: data as T };
      return { ok: false, error: repositoryError("not_found") };
    }
    if (
      options.emptyAsMissing &&
      Array.isArray(data) &&
      data.length === 0
    ) {
      return { ok: false, error: repositoryError("not_found") };
    }

    return { ok: true, data };
  } catch (cause) {
    return { ok: false, error: mapRepositoryError(cause) };
  }
}
