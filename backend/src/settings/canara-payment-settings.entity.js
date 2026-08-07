'use strict';

const { EntitySchema } = require('typeorm');

/**
 * Dedicated Canara Bank Dynamic QR settings (separate from Razorpay / Self Online).
 * Table: canara_payment_settings
 */
const CanaraPaymentSettings = new EntitySchema({
  name: 'CanaraPaymentSettings',
  tableName: 'canara_payment_settings',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    enabled: { type: 'boolean', default: false },
    mockMode: { type: 'boolean', default: false },
    clientId: { type: 'varchar', length: 120, nullable: true },
    clientSecret: { type: 'varchar', length: 255, nullable: true },
    baseUrl: {
      type: 'varchar',
      length: 255,
      nullable: true,
      default: 'https://api.canarauat.bank.in',
    },
    scope: { type: 'varchar', length: 100, nullable: true },
    oauthRedirectUri: { type: 'varchar', length: 500, nullable: true },
    mid: { type: 'varchar', length: 20, nullable: true },
    accountNumber: { type: 'varchar', length: 30, nullable: true, default: '2400201001060' },
    ifscCode: { type: 'varchar', length: 20, nullable: true },
    merchantName: { type: 'varchar', length: 150, nullable: true },
    mcc: { type: 'varchar', length: 10, nullable: true, default: '0001' },
    bankName: { type: 'varchar', length: 100, nullable: true },
    channel: { type: 'varchar', length: 20, nullable: true, default: 'api' },
    // Merchant-level SID/terminal/UPI removed; use canara_vpas records for active SID/UPI
    symmetricKey: { type: 'text', nullable: true },
    privateKeyPem: { type: 'text', nullable: true },
    publicCertPem: { type: 'text', nullable: true },
    accessToken: { type: 'text', nullable: true },
    refreshToken: { type: 'text', nullable: true },
    tokenType: { type: 'varchar', length: 50, nullable: true },
    tokenExpiresAt: { type: 'datetime', nullable: true },
    refreshTokenExpiresAt: { type: 'datetime', nullable: true },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
});

module.exports = { CanaraPaymentSettings };
