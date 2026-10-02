import { db } from '../config/supabase.ts';
import type { Database, Json } from '../config/database.types.ts';
import { InternalError } from '../lib/errors.ts';

export type AuditLogInsert = Database['public']['Tables']['audit_log']['Insert'];
export type AuditLogRow = Database['public']['Tables']['audit_log']['Row'];

export async function insertAuditLog(entry: {
  actor_id?: string | null | undefined;
  action: string;
  entity_type: string;
  entity_id?: string | null | undefined;
  before?: Json | null | undefined;
  after?: Json | null | undefined;
  ip?: string | null | undefined;
}): Promise<void> {
  const { error } = await db.from('audit_log').insert(entry);

  if (error) {
    throw new InternalError(error, `Failed to write audit log: ${error.message}`);
  }
}

export const auditModel = {
  insertAuditLog,
};
