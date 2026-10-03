import fs from 'node:fs';
import path from 'node:path';

import {
  getOrderConfirmationSubject,
  renderOrderConfirmationHtml,
} from '../../../../src/providers/mail/templates/order-confirmation.ts';
import {
  getOrderStatusSubject,
  renderOrderStatusHtml,
} from '../../../../src/providers/mail/templates/order-status.ts';
import {
  getFabricationInquirySubject,
  renderFabricationInquiryHtml,
} from '../../../../src/providers/mail/templates/fabrication-inquiry.ts';
import type { Order } from '../../../../src/contracts/schemas/checkout.ts';

const sampleOrder: Order = {
  id: '33333333-3333-4333-8333-333333333333',
  orderNumber: 'RC-1001',
  status: 'pending',
  paymentStatus: 'pending',
  paymentMethod: 'transfer',
  customerName: 'Jane Customer',
  customerEmail: 'customer@roofingco.com',
  customerPhone: '08012345678',
  deliveryAddress: {
    streetAddress: '12 Commercial Avenue',
    city: 'Yaba',
    state: 'Lagos',
    additionalInstructions: 'Leave with security',
  },
  items: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      productId: '11111111-1111-4111-8111-111111111111',
      variantId: null,
      productName: 'Longspan Sheet',
      unitPrice: 50000,
      quantity: 2,
      lineTotal: 100000,
      customSpecs: { lengthMetres: 4, colour: 'Traffic Black' },
    },
  ],
  subtotal: 100000,
  deliveryFee: 15000,
  total: 115000,
  notes: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('email templates', () => {
  it('generates the exact required subject strings (§10)', () => {
    expect(getOrderConfirmationSubject('RC-1001')).toBe(
      'Order Confirmation #RC-1001 - Roofing Construction Shop',
    );
    expect(getOrderStatusSubject('RC-1001', 'shipped')).toBe(
      'Update on Order #RC-1001: SHIPPED',
    );
    expect(getFabricationInquirySubject('Custom Bending')).toBe(
      'Fabrication Inquiry Received - Custom Bending',
    );
  });

  it('renders order confirmation HTML with order details and dynamic business contact', () => {
    const html = renderOrderConfirmationHtml(sampleOrder);

    expect(html).toContain('RC-1001');
    expect(html).toContain('Jane Customer');
    expect(html).toContain('Longspan Sheet');
    expect(html).toContain('₦100,000');
    expect(html).toContain('₦115,000');
    expect(html).toContain('support@roofingco.com');
    expect(html).toContain('+2348007663464');
  });

  it('renders order status HTML with status and notes', () => {
    const html = renderOrderStatusHtml({
      orderNumber: 'RC-1001',
      customerName: 'Jane Customer',
      status: 'ready_for_delivery',
      notes: 'Driver assigned to vehicle #4',
    });

    expect(html).toContain('RC-1001');
    expect(html).toContain('READY FOR DELIVERY');
    expect(html).toContain('Driver assigned to vehicle #4');
  });

  it('renders fabrication inquiry HTML', () => {
    const html = renderFabricationInquiryHtml({
      customerName: 'Alice Architect',
      serviceType: 'Roll Forming',
      inquiryDetails: 'Need 500 metres of 0.55mm aluminium step-tile profile',
    });

    expect(html).toContain('Alice Architect');
    expect(html).toContain('Roll Forming');
    expect(html).toContain('500 metres of 0.55mm aluminium');
  });

  it('ensures no hardcoded old dummy phone "+234 800 766 3464" (with spaces) survives in src/ templates', () => {
    const srcDir = path.resolve('src/providers/mail/templates');
    const files = fs.readdirSync(srcDir);

    for (const file of files) {
      const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
      expect(content).not.toContain('+234 800 766 3464');
    }
  });
});
