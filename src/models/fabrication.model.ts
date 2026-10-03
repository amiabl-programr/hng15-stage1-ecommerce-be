import { db } from '../config/supabase.ts';
import type { Database } from '../config/database.types.ts';
import { InternalError } from '../lib/errors.ts';

export type FabricationRequestRow = Database['public']['Tables']['fabrication_requests']['Row'];
export type FabricationRequestInsert = Database['public']['Tables']['fabrication_requests']['Insert'];
export type FabricationRequestUpdate = Database['public']['Tables']['fabrication_requests']['Update'];

export async function createFabricationRequest(
  data: FabricationRequestInsert,
): Promise<FabricationRequestRow> {
  const { data: created, error } = await db
    .from('fabrication_requests')
    .insert(data)
    .select('*')
    .single();

  if (error) {
    throw new InternalError(error, `Failed to create fabrication request: ${error.message}`);
  }

  return created as FabricationRequestRow;
}

export async function findFabricationRequestById(
  id: string,
): Promise<FabricationRequestRow | null> {
  const { data, error } = await db
    .from('fabrication_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new InternalError(error);
  }

  return (data as FabricationRequestRow | null) ?? null;
}

export async function listFabricationRequests(
  status?: string | undefined,
  limit = 50,
): Promise<FabricationRequestRow[]> {
  let query = db
    .from('fabrication_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    throw new InternalError(error);
  }

  return (data as FabricationRequestRow[]) ?? [];
}

export async function updateFabricationStatus(
  id: string,
  patch: FabricationRequestUpdate,
): Promise<FabricationRequestRow> {
  const { data, error } = await db
    .from('fabrication_requests')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new InternalError(error, `Failed to update fabrication request: ${error.message}`);
  }

  return data as FabricationRequestRow;
}

export const fabricationModel = {
  createFabricationRequest,
  findFabricationRequestById,
  listFabricationRequests,
  updateFabricationStatus,
};
