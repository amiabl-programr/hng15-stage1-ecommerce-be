import { env } from '../../../config/env.ts';
import type { OrderStatus } from '../../../contracts/schemas/common.ts';

export function getOrderStatusSubject(orderNumber: string, status: OrderStatus | string): string {
  const statusUpper = status.toUpperCase().replaceAll('_', ' ');
  return `Update on Order #${orderNumber}: ${statusUpper}`;
}

export function renderOrderStatusHtml(params: {
  orderNumber: string;
  customerName: string;
  status: OrderStatus | string;
  notes?: string | null | undefined;
}): string {
  const config = env();
  const businessEmail = config.businessEmail;
  const businessPhone = config.businessPhone;
  const statusUpper = params.status.toUpperCase().replaceAll('_', ' ');

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
        <h2 style="color: #1e3a8a; margin-top: 0;">Order Status Update</h2>
        <p>Dear ${params.customerName},</p>
        <p>Your order <strong>#${params.orderNumber}</strong> status has been updated to:</p>

        <div style="background-color: #eff6ff; border-left: 4px solid #1e3a8a; padding: 16px; margin: 20px 0; font-size: 1.2em; font-weight: bold; color: #1e3a8a;">
          ${statusUpper}
        </div>

        ${params.notes ? `<p><strong>Update Notes:</strong> ${params.notes}</p>` : ''}

        <p style="margin-top: 24px; font-size: 0.9em; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 12px;">
          Need help? Contact our support team at <a href="mailto:${businessEmail}">${businessEmail}</a> or call ${businessPhone}.
        </p>
      </div>
    </body>
    </html>
  `;
}
