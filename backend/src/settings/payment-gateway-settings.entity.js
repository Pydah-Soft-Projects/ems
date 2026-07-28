'use strict';

const { EntitySchema } = require('typeorm');

const PaymentGatewaySettings = new EntitySchema({
  name: 'PaymentGatewaySettings',
  tableName: 'payment_gateway_settings',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    enabled: { type: 'boolean', default: false },
    razorpayKeyId: { type: 'varchar', length: 100, nullable: true },
    razorpayKeySecret: { type: 'varchar', length: 255, nullable: true },
    razorpayWebhookSecret: { type: 'varchar', length: 255, nullable: true },
    /** Self Online (college UPI QR) — no gateway */
    selfOnlineEnabled: { type: 'boolean', default: false },
    selfOnlineUpiId: { type: 'varchar', length: 150, nullable: true },
    selfOnlineMerchantName: { type: 'varchar', length: 150, nullable: true },
    selfOnlinePaymentNote: { type: 'varchar', length: 100, nullable: true },
    selfOnlineExpiryHours: { type: 'int', default: 48 },
    /**
     * When true, students with overdue Fee Management dues cannot submit
     * exam applications or access hall tickets (unless staff override).
     */
    restrictExamApplyOnFeeDues: { type: 'boolean', default: true },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
});

module.exports = { PaymentGatewaySettings };
