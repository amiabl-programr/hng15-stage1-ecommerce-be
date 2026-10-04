import type {
  ContactPreference,
  FabricationRequest,
  FabricationStatus,
  ServiceType,
  UpdateFabricationStatusInput,
} from '../contracts/schemas/fabrication.ts';
import { NotFoundError } from '../lib/errors.ts';
import { auditModel } from '../models/audit.model.ts';
import { outboxModel } from '../models/outbox.model.ts';
import {
  fabricationModel,
  type FabricationRequestRow,
} from '../models/fabrication.model.ts';
import {
  getFabricationInquirySubject,
  renderFabricationInquiryHtml,
} from '../providers/mail/templates/fabrication-inquiry.ts';
import { mailClient } from '../providers/mail/index.ts';
import { logger } from '../lib/logger.ts';

export function mapToFabricationRow(row: FabricationRequestRow) {
  return {
    id: row.id,
    serviceType: row.service_type as ServiceType,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    city: row.city,
    state: row.state,
    description: row.description,
    measurements: row.measurements ?? undefined,
    budget: row.budget ? Number(row.budget) : undefined,
    preferredContact: (row.preferred_contact || 'email') as ContactPreference,
    status: row.status as FabricationStatus,
    estimatedQuote: row.estimated_quote ? Number(row.estimated_quote) : null,
    createdAt: row.created_at,
  };
}

export async function submitFabricationRequest(
  input: FabricationRequest,
): Promise<{ success: true; id: string; message: string }> {
  const created = await fabricationModel.createFabricationRequest({
    service_type: input.serviceType,
    full_name: input.fullName,
    email: input.email,
    phone: input.phone,
    city: input.city,
    state: input.state,
    description: input.description,
    measurements: input.measurements ?? null,
    budget: input.budget ?? null,
    preferred_contact: input.preferredContact,
    status: 'new',
  });

  // Enqueue confirmation email
  const subject = getFabricationInquirySubject(input.serviceType);
  const html = renderFabricationInquiryHtml({
    customerName: input.fullName,
    serviceType: input.serviceType,
    inquiryDetails: input.description,
  });

  await outboxModel
    .insertOutboxMessage({
      template: 'fabrication-inquiry',
      to_email: input.email,
      subject,
      html_body: html,
    })
    .catch((err) => {
      logger.error('failed to queue fabrication inquiry email in outbox', {
        id: created.id,
        to: input.email,
        error: err instanceof Error ? err.message : String(err),
      });
    });

  // Send direct email immediately
  void mailClient
    .sendMail({
      to: input.email,
      subject,
      html,
    })
    .catch((err) => {
      logger.error('failed to send direct fabrication inquiry email', {
        id: created.id,
        to: input.email,
        error: err instanceof Error ? err.message : String(err),
      });
    });

  return {
    success: true,
    id: created.id,
    message: 'Your fabrication request has been received. Our team will contact you shortly.',
  };
}

export async function listFabricationRequests(
  status?: FabricationStatus | undefined,
): Promise<ReturnType<typeof mapToFabricationRow>[]> {
  const rows = await fabricationModel.listFabricationRequests(status);
  return rows.map(mapToFabricationRow);
}

export async function updateFabricationStatus(
  id: string,
  input: UpdateFabricationStatusInput,
  actorId?: string | undefined,
  ip?: string | undefined,
): Promise<ReturnType<typeof mapToFabricationRow>> {
  const existing = await fabricationModel.findFabricationRequestById(id);
  if (!existing) {
    throw new NotFoundError(`Fabrication request with id '${id}' not found`);
  }

  const updated = await fabricationModel.updateFabricationStatus(id, {
    status: input.status,
    estimated_quote: input.estimatedQuote ?? existing.estimated_quote,
  });

  await auditModel.insertAuditLog({
    actor_id: actorId ?? null,
    action: 'fabrication.status_updated',
    entity_type: 'fabrication_requests',
    entity_id: id,
    before: { status: existing.status, estimated_quote: existing.estimated_quote },
    after: { status: input.status, estimated_quote: updated.estimated_quote },
    ip: ip ?? null,
  });

  return mapToFabricationRow(updated);
}

export const fabricationService = {
  submitFabricationRequest,
  listFabricationRequests,
  updateFabricationStatus,
};
