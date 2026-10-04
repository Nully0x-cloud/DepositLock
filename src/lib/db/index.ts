/**
 * Data access entry point.
 *
 * Every function takes the Supabase client explicitly, so callers choose the
 * right one for their context (browser anon client, server anon client, or the
 * local development bridge) and tests can substitute a fake.
 *
 * No query is ever written inside a React component.
 */
export {
  createSupabaseServerClient,
  getSupabaseBrowserClient,
  isLocalSupabaseUrl,
  isSupabaseConfigured,
  readSupabaseConfig,
  type SupabaseConfig,
} from "./client";

export type { DbClient } from "./client-type";

export {
  isRepositoryError,
  mapRepositoryError,
  repositoryError,
  type RepositoryError,
  type RepositoryErrorCode,
  type RepositoryResult,
} from "./errors";

export { fromResult, type QueryLike } from "./from-result";

export * from "./models";

export * from "./profiles";
export * from "./properties";
export * from "./tenancies";
export * from "./evidence";
export * from "./deductions";
export * from "./disputes";
export * from "./settlements";
export * from "./activity";
export * from "./notifications";
