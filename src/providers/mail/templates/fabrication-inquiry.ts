import { env } from '../../../config/env.ts';

export function getFabricationInquirySubject(serviceType: string): string {
  return `Fabrication Inquiry Received - ${serviceType}`;
}

export function renderFabricationInquiryHtml(params: {
  customerName: string;
  serviceType: string;
  inquiryDetails: string;
}): string {
  const config = env();
  const businessEmail = config.businessEmail;
  const businessPhone = config.businessPhone;

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
        <h2 style="color: #1e3a8a; margin-top: 0;">Fabrication Inquiry Received</h2>
        <p>Dear ${params.customerName},</p>
        <p>Thank you for reaching out regarding our <strong>${params.serviceType}</strong> service. We have received your inquiry:</p>

        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0; white-space: pre-wrap;">${params.inquiryDetails}</p>
        </div>

        <p>Our engineering team will review your specifications and get back to you with an estimate and timeline.</p>

        <p style="margin-top: 24px; font-size: 0.9em; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 12px;">
          For urgent inquiries, contact us at <a href="mailto:${businessEmail}">${businessEmail}</a> or call ${businessPhone}.
        </p>
      </div>
    </body>
    </html>
  `;
}
