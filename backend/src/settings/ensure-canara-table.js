'use strict';

/**
 * Ensures `canara_payment_settings` table exists.
 * Optionally copies legacy columns from payment_gateway_settings if present.
 */
async function ensureCanaraOauthAuditTable(dataSource, log = console) {
  if (!dataSource?.isInitialized) return { created: false };

  const tables = await dataSource.query(
    `SELECT TABLE_NAME AS name
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'canara_oauth_audit'`,
  );

  let created = false;
  if (!tables.length) {
    await dataSource.query(`
      CREATE TABLE canara_oauth_audit (
        id INT NOT NULL AUTO_INCREMENT,
        provider VARCHAR(50) NOT NULL DEFAULT 'canara',
        clientId VARCHAR(255) NULL,
        redirectUri VARCHAR(500) NULL,
        state VARCHAR(255) NULL,
        scope VARCHAR(255) NULL,
        authorizationCode TEXT NULL,
        callbackReceivedAt DATETIME NULL,
        stateVerified TINYINT(1) NOT NULL DEFAULT 0,
        codeExchangeStartedAt DATETIME NULL,
        codeExchangeCompletedAt DATETIME NULL,
        tokenResponseStatus VARCHAR(50) NULL,
        accessTokenHash VARCHAR(255) NULL,
        refreshTokenHash VARCHAR(255) NULL,
        tokenExpiresAt DATETIME NULL,
        requestIp VARCHAR(100) NULL,
        userAgent TEXT NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    created = true;
    if (typeof log.info === 'function') {
      log.info(
        { event: 'schema.canara_oauth_audit_created' },
        'Created canara_oauth_audit table',
      );
    }
  }

  return { created };
}

async function ensureCanaraPaymentSettingsTable(dataSource, log = console) {
  if (!dataSource?.isInitialized) return { created: false, migrated: false };

  const tables = await dataSource.query(
    `SELECT TABLE_NAME AS name
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'canara_payment_settings'`,
  );

  let created = false;
  if (!tables.length) {
    await dataSource.query(`
      CREATE TABLE canara_payment_settings (
        id INT NOT NULL AUTO_INCREMENT,
        enabled TINYINT(1) NOT NULL DEFAULT 0,
        mockMode TINYINT(1) NOT NULL DEFAULT 0,
        clientId VARCHAR(120) NULL,
        clientSecret VARCHAR(255) NULL,
        baseUrl VARCHAR(255) NULL DEFAULT 'https://api.canarauat.bank.in',
        scope VARCHAR(100) NULL,
        oauthRedirectUri VARCHAR(500) NULL,
        mid VARCHAR(20) NULL,
        sid VARCHAR(20) NULL,
        terminalId VARCHAR(20) NULL,
        upiId VARCHAR(150) NULL,
        symmetricKey TEXT NULL,
        privateKeyPem TEXT NULL,
        publicCertPem TEXT NULL,
        accessToken TEXT NULL,
        refreshToken TEXT NULL,
        tokenType VARCHAR(50) NULL,
        tokenExpiresAt DATETIME NULL,
        refreshTokenExpiresAt DATETIME NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    created = true;
    if (typeof log.info === 'function') {
      log.info(
        { event: 'schema.canara_payment_settings_created' },
        'Created canara_payment_settings table',
      );
    }
  }

  if (!created) {
    const schemaCols = await dataSource.query(
      `SELECT COLUMN_NAME AS name
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'canara_payment_settings'
         AND COLUMN_NAME IN ('tokenType','refreshTokenExpiresAt')`,
    );
    const existingCols = new Set(schemaCols.map((row) => row.name));
    let modified = false;

    if (!existingCols.has('tokenType')) {
      await dataSource.query(
        `ALTER TABLE canara_payment_settings ADD COLUMN tokenType VARCHAR(50) NULL`,
      );
      modified = true;
      if (typeof log.info === 'function') {
        log.info(
          { event: 'schema.canara_payment_settings_tokenType_added' },
          'Added tokenType column to canara_payment_settings',
        );
      }
    }

    if (!existingCols.has('refreshTokenExpiresAt')) {
      await dataSource.query(
        `ALTER TABLE canara_payment_settings ADD COLUMN refreshTokenExpiresAt DATETIME NULL`,
      );
      modified = true;
      if (typeof log.info === 'function') {
        log.info(
          { event: 'schema.canara_payment_settings_refreshTokenExpiresAt_added' },
          'Added refreshTokenExpiresAt column to canara_payment_settings',
        );
      }
    }

    if (modified) {
      created = true;
    }
  }

  // One-time migrate from legacy payment_gateway_settings.canara* columns
  let migrated = false;
  try {
    const legacyCols = await dataSource.query(
      `SELECT COLUMN_NAME AS name
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'payment_gateway_settings'
         AND COLUMN_NAME = 'canaraEnabled'`,
    );
    if (legacyCols.length) {
      const countRows = await dataSource.query(
        `SELECT COUNT(*) AS c FROM canara_payment_settings`,
      );
      const count = Number(countRows[0]?.c || 0);
      if (count === 0) {
        await dataSource.query(`
          INSERT INTO canara_payment_settings (
            enabled, mockMode, clientId, clientSecret, baseUrl, scope,
            oauthRedirectUri, mid, sid, terminalId, upiId,
            symmetricKey, privateKeyPem, publicCertPem,
            accessToken, refreshToken, tokenExpiresAt
          )
          SELECT
            COALESCE(canaraEnabled, 0),
            COALESCE(canaraMockMode, 0),
            canaraClientId, canaraClientSecret,
            COALESCE(canaraBaseUrl, 'https://api.canarauat.bank.in'),
            canaraScope, canaraOauthRedirectUri,
            canaraMid, canaraSid, canaraTerminalId, canaraUpiId,
            canaraSymmetricKey, canaraPrivateKeyPem, canaraPublicCertPem,
            canaraAccessToken, canaraRefreshToken, canaraTokenExpiresAt
          FROM payment_gateway_settings
          ORDER BY id ASC
          LIMIT 1
        `);
        migrated = true;
        if (typeof log.info === 'function') {
          log.info(
            { event: 'schema.canara_settings_migrated' },
            'Migrated Canara settings into canara_payment_settings',
          );
        }
      }
    }
  } catch (err) {
    if (typeof log.warn === 'function') {
      log.warn(
        { event: 'schema.canara_migrate_skipped', err: err.message },
        'Skipped legacy Canara column migration',
      );
    }
  }

  return { created, migrated };
}

module.exports = {
  ensureCanaraPaymentSettingsTable,
  ensureCanaraOauthAuditTable,
};
