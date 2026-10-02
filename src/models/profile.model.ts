import { db } from '../config/supabase.ts';
import type { UserRole } from '../contracts/schemas/common.ts';
import { InternalError } from '../lib/errors.ts';

export interface ProfileRow {
  id: string;
  google_id: string | null;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export async function findProfileById(id: string): Promise<ProfileRow | null> {
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new InternalError(error);
  }

  return (data as ProfileRow | null) ?? null;
}

export async function findProfileByGoogleId(googleId: string): Promise<ProfileRow | null> {
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('google_id', googleId)
    .maybeSingle();

  if (error) {
    throw new InternalError(error);
  }

  return (data as ProfileRow | null) ?? null;
}

export async function findProfileByEmail(email: string): Promise<ProfileRow | null> {
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    throw new InternalError(error);
  }

  return (data as ProfileRow | null) ?? null;
}

export async function createProfile(data: {
  email: string;
  fullName?: string | null | undefined;
  avatarUrl?: string | null | undefined;
  googleId?: string | null | undefined;
  role?: UserRole | undefined;
}): Promise<ProfileRow> {
  const { data: created, error } = await db
    .from('profiles')
    .insert({
      email: data.email,
      full_name: data.fullName ?? null,
      avatar_url: data.avatarUrl ?? null,
      google_id: data.googleId ?? null,
      role: data.role ?? 'customer',
    })
    .select('*')
    .single();

  if (error || !created) {
    throw new InternalError(error ?? new Error('Failed to create profile'));
  }

  return created as ProfileRow;
}

export async function updateProfile(
  id: string,
  data: {
    fullName?: string | null | undefined;
    avatarUrl?: string | null | undefined;
    googleId?: string | null | undefined;
    role?: UserRole | undefined;
  },
): Promise<ProfileRow> {
  const payload: {
    updated_at: string;
    full_name?: string | null | undefined;
    avatar_url?: string | null | undefined;
    google_id?: string | null | undefined;
    role?: UserRole | undefined;
  } = {
    updated_at: new Date().toISOString(),
  };

  if (data.fullName !== undefined) payload.full_name = data.fullName;
  if (data.avatarUrl !== undefined) payload.avatar_url = data.avatarUrl;
  if (data.googleId !== undefined) payload.google_id = data.googleId;
  if (data.role !== undefined) payload.role = data.role;

  const { data: updated, error } = await db
    .from('profiles')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !updated) {
    throw new InternalError(error ?? new Error('Failed to update profile'));
  }

  return updated as ProfileRow;
}

export const profileModel = {
  findProfileById,
  findProfileByGoogleId,
  findProfileByEmail,
  createProfile,
  updateProfile,
};
