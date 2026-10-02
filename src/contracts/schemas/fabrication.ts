import { z } from 'zod';

import { MoneySchema, UuidSchema } from './common.ts';

/**
 * Custom fabrication work: no catalogue product, no stock, a conversation instead of a
 * checkout. notes.md §10 sends a `fabrication-inquiry` email, so the intake form is the
 * only place these details are captured.
 */

export const SERVICE_TYPES = ['roof', 'gutter', 'skylight', 'cladding', 'other'] as const;
export const ServiceTypeSchema = z.enum(SERVICE_TYPES);
export type ServiceType = z.infer<typeof ServiceTypeSchema>;

export const FABRICATION_STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'] as const;
export const FabricationStatusSchema = z.enum(FABRICATION_STATUSES);
export type FabricationStatus = z.infer<typeof FabricationStatusSchema>;

export const CONTACT_PREFERENCES = ['email', 'phone', 'whatsapp'] as const;
export const ContactPreferenceSchema = z.enum(CONTACT_PREFERENCES);
export type ContactPreference = z.infer<typeof ContactPreferenceSchema>;

export const FabricationRequestSchema = z.strictObject({
  serviceType: ServiceTypeSchema,
  fullName: z.string().trim().min(2).max(200),
  email: z.email(),
  phone: z.string().trim().min(5).max(40),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(120),
  /** What they want built, in their words. Not a controlled vocabulary on purpose. */
  description: z.string().trim().min(20, 'please describe the work in at least 20 characters').max(5000),
  /** Free measurements. Parsed later; captured as typed so nothing is silently lost. */
  measurements: z.string().trim().max(2000).optional(),
  budget: MoneySchema.optional(),
  preferredContact: ContactPreferenceSchema.default('email'),
});
export type FabricationRequest = z.infer<typeof FabricationRequestSchema>;

export const FabricationRequestRowSchema = FabricationRequestSchema.extend({
  id: UuidSchema,
  status: FabricationStatusSchema,
  estimatedQuote: MoneySchema.nullable(),
  createdAt: z.string().datetime(),
});

export const UpdateFabricationStatusSchema = z.strictObject({
  status: FabricationStatusSchema,
  estimatedQuote: MoneySchema.optional(),
});
export type UpdateFabricationStatusInput = z.infer<typeof UpdateFabricationStatusSchema>;

export const FabricationSubmittedSchema = z.object({
  success: z.literal(true),
  id: UuidSchema,
  message: z.string(),
});