import { db } from '../config/supabase.ts';
import { InternalError } from '../lib/errors.ts';
import type { ProfileRow } from './profile.model.ts';

export interface SessionRow {
  id: string;
  token_hash: string;
  profile_id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
  user_agent: string | null;
  ip: string | null;
}

export interface ActiveSessionWithProfile extends SessionRow {
  profiles: ProfileRow;
}

export async function findActiveSessionByTokenHash(
  tokenHash: string,
): Promise<ActiveSessionWithProfile | null> {
  const now = new Date().toISOString();

  const { data, error } = await db
    .from('sessions')
    .select('*, profiles!inner(*)')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .gt('expires_at', now)
    .maybeSingle();

  if (error) {
    throw new InternalError(error);
  }

  return (data as unknown as ActiveSessionWithProfile | null) ?? null;
}

export async function createSession(data: {
  profileId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null | undefined;
  ip?: string | null | undefined;
}): Promise<SessionRow> {
  const { data: created, error } = await db
    .from('sessions')
    .insert({
      profile_id: data.profileId,
      token_hash: data.tokenHash,
      expires_at: data.expiresAt.toISOString(),
      user_agent: data.userAgent ?? null,
      ip: data.ip ?? null,
    })
    .select('*')
    .single();

  if (error || !created) {
    throw new InternalError(error ?? new Error('Failed to create session'));
  }

  return created as SessionRow;
}

export async function updateSessionTouchAndExpiry(
  id: string,
  newExpiresAt: Date,
): Promise<void> {
  const { error } = await db
    .from('sessions')
    .update({
      last_seen_at: new Date().toISOString(),
      expires_at: newExpiresAt.toISOString(),
    })
    .eq('id', id);

  if (error) {
    throw new InternalError(error);
  }
}

export async function touchSession(id: string): Promise<void> {
  const { error } = await db
    .from('sessions')
    .update({
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    throw new InternalError(error);
  }
}

export async function revokeSessionByTokenHash(tokenHash: string): Promise<void> {
  const { error } = await db
    .from('sessions')
    .update({
      revoked_at: new Date().toISOString(),
    })
    .eq('token_hash', tokenHash)
    .is('revoked_at', null);

  if (error) {
    throw new InternalError(error);
  }
}

export async function revokeSessionById(
  id: string,
  profileId?: string | undefined,
): Promise<boolean> {
  let query = db
    .from('sessions')
    .update({
      revoked_at: new Date().toISOString(),
    })
    .eq('id', id)
    .is('revoked_at', null);

  if (profileId !== undefined) {
    query = query.eq('profile_id', profileId);
  }

  const { error, count } = await query;

  if (error) {
    throw new InternalError(error);
  }

  return (count ?? 0) > 0;
}

export async function findActiveSessionsByProfileId(
  profileId: string,
): Promise<SessionRow[]> {
  const now = new Date().toISOString();

  const { data, error } = await db
    .from('sessions')
    .select('*')
    .eq('profile_id', profileId)
    .is('revoked_at', null)
    .gt('expires_at', now)
    .order('last_seen_at', { ascending: false });

  if (error) {
    throw new InternalError(error);
  }

  return (data as SessionRow[]) ?? [];
}

export const sessionModel = {
  findActiveSessionByTokenHash,
  createSession,
  updateSessionTouchAndExpiry,
  touchSession,
  revokeSessionByTokenHash,
  revokeSessionById,
  findActiveSessionsByProfileId,
};
