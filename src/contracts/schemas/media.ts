import { z } from 'zod';

import {
  AltTextSchema,
  ImageRoleSchema,
  PermissionStatusSchema,
  UuidSchema,
  type ImageRole,
  type ProfileKind,
} from './common.ts';

/**
 * Admin media surface. Every write here can publish a licensed manufacturer image, so
 * the gate is the `permission_status` enum plus the `product_images_public` view — not
 * anything a service remembers to check.
 */

/** Whether the row belongs to a product or a category. Two tables, not a polymorphic one. */
export const EntityTypeSchema = z.enum(['product', 'category']);
export type EntityType = z.infer<typeof EntityTypeSchema>;

/** Row shape as returned by admin reads, which include pending and soft-deleted rows. */
export const AdminImageSchema = z.object({
  id: UuidSchema,
  entityType: EntityTypeSchema,
  entityId: UuidSchema,
  storagePath: z.string().min(1),
  altText: AltTextSchema,
  role: ImageRoleSchema,
  displayOrder: z.number().int().nonnegative(),
  isPrimary: z.boolean(),
  permissionStatus: PermissionStatusSchema,
  source: z.string().nullable(),
  licence: z.string().nullable(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().nonnegative(),
  blurhash: z.string(),
  deletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type AdminImage = z.infer<typeof AdminImageSchema>;

export const AdminImageListSchema = z.object({
  success: z.literal(true),
  items: z.array(AdminImageSchema),
});

export const UpdateImageSchema = z.strictObject({
  altText: AltTextSchema.optional(),
  role: ImageRoleSchema.optional(),
  displayOrder: z.number().int().nonnegative().optional(),
  source: z.string().trim().min(1).max(200).optional(),
  licence: z.string().trim().min(1).max(500).optional(),
});
export type UpdateImageInput = z.infer<typeof UpdateImageSchema>;

export const SetPermissionSchema = z.strictObject({
  permissionStatus: PermissionStatusSchema,
});
export type SetPermissionInput = z.infer<typeof SetPermissionSchema>;

export const UploadResponseSchema = z.object({
  success: z.literal(true),
  image: AdminImageSchema,
  /** Derived from columns, not from the deleted manifest. The admin confirms or replaces it. */
  suggestedAlt: z.string(),
});

/**
 * notes.md §7. Kept as a pure function beside the schema so the suggestion cannot drift
 * from the rule the database and the alt-text constraint already enforce.
 */
export function suggestAltText(input: {
  role: ImageRole;
  productName: string;
  profileKind: ProfileKind;
}): string {
  const text =
    input.role === 'profile'
      ? `Cross-section diagram of the ${input.profileKind} rib profile`
      : `Photograph of ${input.productName}`;

  // The 8–200 rule applies to the suggestion too: an admin who accepts it unchanged
  // must not be able to commit a row that violates the constraint.
  return text.slice(0, 200);
}