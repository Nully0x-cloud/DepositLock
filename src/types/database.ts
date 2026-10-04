/**
 * Raw database types.
 *
 * This module is the boundary between SQL and TypeScript: everything here
 * describes the database exactly as Postgres reports it — snake_case columns,
 * `numeric` amounts as strings, timestamps as ISO strings. It never carries
 * UI vocabulary. Three layers exist on purpose:
 *
 *   1. `Database` — the Supabase client schema, generated from the local
 *      database by `npm run db:types` (`supabase gen types typescript --local`).
 *   2. `Profile`, `Tenancy`, … — the raw `Row` shapes pulled out of `Database`
 *      so repositories can name a row without repeating the index path.
 *   3. `*Record` in `src/lib/db/models.ts` — the camelCase mapping the
 *      application consumes, produced by each repository.
 *
 * Regenerate `database.generated.ts` after any migration: the file is
 * committed so the type layer can be reviewed alongside the schema it came
 * from, but it is never edited by hand.
 */
import type { Database as GeneratedDatabase } from "./database.generated";

export type Database = GeneratedDatabase;
export type { Json } from "./database.generated";

type Public = GeneratedDatabase["public"];

export type Profile = Public["Tables"]["profiles"]["Row"];
export type ProfileInsert = Public["Tables"]["profiles"]["Insert"];
export type ProfileUpdate = Public["Tables"]["profiles"]["Update"];

export type Property = Public["Tables"]["properties"]["Row"];
export type PropertyInsert = Public["Tables"]["properties"]["Insert"];

export type Tenancy = Public["Tables"]["tenancies"]["Row"];
export type TenancyInsert = Public["Tables"]["tenancies"]["Insert"];
export type TenancyUpdate = Public["Tables"]["tenancies"]["Update"];

export type TenancyParticipant = Public["Tables"]["tenancy_participants"]["Row"];

export type Evidence = Public["Tables"]["evidence"]["Row"];
export type EvidenceInsert = Public["Tables"]["evidence"]["Insert"];

export type Deduction = Public["Tables"]["deductions"]["Row"];
export type DeductionInsert = Public["Tables"]["deductions"]["Insert"];
export type DeductionUpdate = Public["Tables"]["deductions"]["Update"];

export type Dispute = Public["Tables"]["disputes"]["Row"];
export type DisputeInsert = Public["Tables"]["disputes"]["Insert"];
export type DisputeUpdate = Public["Tables"]["disputes"]["Update"];

export type Settlement = Public["Tables"]["settlements"]["Row"];

export type ActivityEvent = Public["Tables"]["activity_events"]["Row"];
export type ActivityEventInsert = Public["Tables"]["activity_events"]["Insert"];

export type Notification = Public["Tables"]["notifications"]["Row"];
export type NotificationUpdate = Public["Tables"]["notifications"]["Update"];

export type SharedProfile = Public["Views"]["v_shared_profiles"]["Row"];
