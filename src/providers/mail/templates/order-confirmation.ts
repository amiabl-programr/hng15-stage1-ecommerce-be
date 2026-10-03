import { env } from '../../../config/env.ts';
import { formatCurrency, formatDateTime } from '../../../lib/money.ts';
import type { Order } from '../../../contracts/schemas/checkout.ts';

export function getOrderConfirmationSubject(orderNumber: string): string {
  return `Order Confirmation #${orderNumber} - Roofing Construction Shop`;
}

export function renderOrderConfirmationHtml(order: Order): string {
  const config = env();
  const businessEmail = config.businessEmail;
  const businessPhone = config.businessPhone;

  const itemsHtml = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">
          <strong>${item.productName}</strong>
          ${item.customSpecs?.lengthMetres ? `<br><small>Length: ${item.customSpecs.lengthMetres}m</small>` : ''}
          ${item.customSpecs?.colour ? `<br><small>Colour: ${item.customSpecs.colour}</small>` : ''}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.unitPrice)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.lineTotal)}</td>
      </tr>
    `,
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
        <h2 style="color: #1e3a8a; margin-top: 0;">Thank you for your order!</h2>
        <p>Dear ${order.customerName},</p>
        <p>We have received your order <strong>#${order.orderNumber}</strong> placed on ${formatDateTime(order.createdAt)}.</p>

        <h3 style="border-bottom: 2px solid #1e3a8a; padding-bottom: 6px;">Order Summary</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="padding: 10px; text-align: left;">Item</th>
              <th style="padding: 10px; text-align: center;">Qty</th>
              <th style="padding: 10px; text-align: right;">Price</th>
              <th style="padding: 10px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding: 10px; text-align: right; font-weight: bold;">Subtotal:</td>
              <td style="padding: 10px; text-align: right;">${formatCurrency(order.subtotal)}</td>
            </tr>
            <tr>
              <td colspan="3" style="padding: 10px; text-align: right; font-weight: bold;">Delivery Fee:</td>
              <td style="padding: 10px; text-align: right;">${formatCurrency(order.deliveryFee)}</td>
            </tr>
            <tr style="background-color: #eff6ff; font-size: 1.1em;">
              <td colspan="3" style="padding: 10px; text-align: right; font-weight: bold; color: #1e3a8a;">Total:</td>
              <td style="padding: 10px; text-align: right; font-weight: bold; color: #1e3a8a;">${formatCurrency(order.total)}</td>
            </tr>
          </tfoot>
        </table>

        <h3 style="border-bottom: 2px solid #1e3a8a; padding-bottom: 6px;">Delivery Details</h3>
        <p>
          <strong>Address:</strong> ${order.deliveryAddress.streetAddress}, ${order.deliveryAddress.city}, ${order.deliveryAddress.state}<br>
          ${order.deliveryAddress.additionalInstructions ? `<strong>Instructions:</strong> ${order.deliveryAddress.additionalInstructions}<br>` : ''}
          <strong>Phone:</strong> ${order.customerPhone}
        </p>

        <p style="margin-top: 24px; font-size: 0.9em; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 12px;">
          If you have questions, contact us at <a href="mailto:${businessEmail}">${businessEmail}</a> or call ${businessPhone}.
        </p>
      </div>
    </body>
    </html>
  `;
}
