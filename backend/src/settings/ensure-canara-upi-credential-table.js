'use strict';

/**
 * Ensures canara_upi_credential_versions exists (MySQL).
 * TypeORM synchronize may create it on fresh DBs; this covers older installs
 * where synchronize is off or the entity was added later.
 */
const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS canara_upi_credential_versions (
  id INT NOT NULL AUTO_INCREMENT,
  isActive TINYINT(1) NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  environment VARCHAR(20) NOT NULL DEFAULT 'uat',
  baseUrl VARCHAR(255) NULL,
  clientId VARCHAR(255) NULL,
  clientSecret VARCHAR(512) NULL,
  oauthAccessToken TEXT NULL,
  oauthTokenExpiresAt DATETIME NULL,
  aesSecretKeyHex VARCHAR(128) NULL,
  privateKeyPem LONGTEXT NULL,
  clientPublicCertPem LONGTEXT NULL,
  bankPublicCertPem LONGTEXT NULL,
  merchantMid VARCHAR(32) NULL,
  merchantSid VARCHAR(32) NULL,
  terminalId VARCHAR(32) NULL,
  upiId VARCHAR(150) NULL,
  merchantName VARCHAR(150) NULL,
  accountNumber VARCHAR(32) NULL,
  ifscCode VARCHAR(20) NULL,
  mcc VARCHAR(8) NULL,
  mobileNumber VARCHAR(15) NULL,
  bankName VARCHAR(100) NULL,
  callbackUrl VARCHAR(500) NULL,
  credentialExpiresAt DATETIME NULL,
  activatedAt DATETIME NULL,
  deactivatedAt DATETIME NULL,
  changeReason VARCHAR(255) NULL,
  changedFields TEXT NULL,
  changedByUserId INT NULL,
  createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_canara_upi_active (isActive),
  KEY idx_canara_upi_activated (activatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`.trim();

async function ensureCanaraUpiCredentialTable(dataSource, log = console) {
  if (!dataSource?.isInitialized) return { created: false, skipped: true };

  const rows = await dataSource.query(
    `SELECT TABLE_NAME AS name
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'canara_upi_credential_versions'`,
  );

  if (rows.length > 0) {
    return { created: false, skipped: false, existed: true };
  }

  await dataSource.query(CREATE_TABLE_SQL);

  if (typeof log.info === 'function') {
    log.info(
      { event: 'schema.canara_upi_credential_versions_created' },
      'Created canara_upi_credential_versions table',
    );
  }

  return { created: true, skipped: false, existed: false };
}

module.exports = {
  CREATE_TABLE_SQL,
  ensureCanaraUpiCredentialTable,
};
