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
    sid: { type: 'varchar', length: 20, nullable: true },
    terminalId: { type: 'varchar', length: 20, nullable: true },
    upiId: { type: 'varchar', length: 150, nullable: true },
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
