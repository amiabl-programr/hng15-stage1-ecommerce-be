import { db } from '../config/supabase.ts';
import type { Database } from '../config/database.types.ts';
import { InternalError } from '../lib/errors.ts';

export type EmailOutboxRow = Database['public']['Tables']['email_outbox']['Row'];
export type EmailOutboxInsert = Database['public']['Tables']['email_outbox']['Insert'];

export async function findPendingOutboxMessages(limit = 10): Promise<EmailOutboxRow[]> {
  const { data, error } = await db
    .from('email_outbox')
    .select('*')
    .is('sent_at', null)
    .lt('attempts', 5)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new InternalError(error);
  }

  return (data as EmailOutboxRow[]) ?? [];
}

export async function markOutboxSent(id: string): Promise<void> {
  const { error } = await db
    .from('email_outbox')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    throw new InternalError(error);
  }
}

export async function markOutboxFailed(
  id: string,
  attempts: number,
  lastError: string,
): Promise<void> {
  const { error } = await db
    .from('email_outbox')
    .update({ attempts, last_error: lastError })
    .eq('id', id);

  if (error) {
    throw new InternalError(error);
  }
}

export async function insertOutboxMessage(entry: {
  template: string;
  to_email: string;
  subject: string;
  html_body: string;
  text_body?: string | null | undefined;
  order_id?: string | null | undefined;
}): Promise<EmailOutboxRow> {
  const { data, error } = await db
    .from('email_outbox')
    .insert(entry)
    .select('*')
    .single();

  if (error) {
    throw new InternalError(error);
  }

  return data as EmailOutboxRow;
}

export const outboxModel = {
  findPendingOutboxMessages,
  markOutboxSent,
  markOutboxFailed,
  insertOutboxMessage,
};
