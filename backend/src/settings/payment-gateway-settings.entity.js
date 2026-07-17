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
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
});

module.exports = { PaymentGatewaySettings };
