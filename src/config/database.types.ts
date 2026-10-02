/**
 * Stand-in for the shape `supabase gen types --linked` produces.
 *
 * Deliberately empty rather than `any`: supabase-js's unparameterised generic
 * resolves its table lookups to `any`, and an untyped database client is how a typo
 * in a column name becomes a runtime error instead of a compile error. Phase 3
 * replaces this file with the generated one, and the client below needs no change.
 */
export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};