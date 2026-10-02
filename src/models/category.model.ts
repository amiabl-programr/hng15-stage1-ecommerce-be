import { publicDb } from '../config/supabase.ts';
import type { Database } from '../config/database.types.ts';
import { InternalError } from '../lib/errors.ts';

export type CategoryRow = Database['public']['Tables']['categories']['Row'];

export async function listAllCategories(): Promise<CategoryRow[]> {
  const { data, error } = await publicDb
    .from('categories')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    throw new InternalError(error);
  }

  return (data as CategoryRow[]) ?? [];
}

export async function findCategoryBySlug(slug: string): Promise<CategoryRow | null> {
  const { data, error } = await publicDb
    .from('categories')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    throw new InternalError(error);
  }

  return (data as CategoryRow | null) ?? null;
}

export async function findCategoryById(id: string): Promise<CategoryRow | null> {
  const { data, error } = await publicDb
    .from('categories')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new InternalError(error);
  }

  return (data as CategoryRow | null) ?? null;
}

export const categoryModel = {
  listAllCategories,
  findCategoryBySlug,
  findCategoryById,
};
