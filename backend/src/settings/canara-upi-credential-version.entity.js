'use strict';

const { EntitySchema } = require('typeorm');

/**
 * Versioned Canara Bank UPI Collection credentials.
 * Exactly one row has isActive=true. Any settings change inserts a new row
 * (copy unchanged fields) and deactivates the previous active row.
 */
const CanaraUpiCredentialVersion = new EntitySchema({
  name: 'CanaraUpiCredentialVersion',
  tableName: 'canara_upi_credential_versions',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    isActive: { type: 'boolean', default: false },
    enabled: { type: 'boolean', default: false },
    environment: { type: 'varchar', length: 20, default: 'uat' },
    baseUrl: { type: 'varchar', length: 255, nullable: true },
    clientId: { type: 'varchar', length: 255, nullable: true },
    clientSecret: { type: 'varchar', length: 512, nullable: true },
    oauthAccessToken: { type: 'text', nullable: true },
    oauthTokenExpiresAt: { type: 'datetime', nullable: true },
    aesSecretKeyHex: { type: 'varchar', length: 128, nullable: true },
    privateKeyPem: { type: 'longtext', nullable: true },
    clientPublicCertPem: { type: 'longtext', nullable: true },
    bankPublicCertPem: { type: 'longtext', nullable: true },
    merchantMid: { type: 'varchar', length: 32, nullable: true },
    merchantSid: { type: 'varchar', length: 32, nullable: true },
    terminalId: { type: 'varchar', length: 32, nullable: true },
    upiId: { type: 'varchar', length: 150, nullable: true },
    merchantName: { type: 'varchar', length: 150, nullable: true },
    accountNumber: { type: 'varchar', length: 32, nullable: true },
    ifscCode: { type: 'varchar', length: 20, nullable: true },
    mcc: { type: 'varchar', length: 8, nullable: true },
    mobileNumber: { type: 'varchar', length: 15, nullable: true },
    bankName: { type: 'varchar', length: 100, nullable: true },
    callbackUrl: { type: 'varchar', length: 500, nullable: true },
    credentialExpiresAt: { type: 'datetime', nullable: true },
    activatedAt: { type: 'datetime', nullable: true },
    deactivatedAt: { type: 'datetime', nullable: true },
    changeReason: { type: 'varchar', length: 255, nullable: true },
    changedFields: { type: 'text', nullable: true },
    changedByUserId: { type: 'int', nullable: true },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
  indices: [
    { name: 'idx_canara_upi_active', columns: ['isActive'] },
    { name: 'idx_canara_upi_activated', columns: ['activatedAt'] },
  ],
});

module.exports = { CanaraUpiCredentialVersion };
