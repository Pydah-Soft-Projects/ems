'use strict';

const { AppError } = require('../common/errors');
const {
  CanaraUpiCredentialVersion,
} = require('./canara-upi-credential-version.entity');

const CREDENTIAL_ROTATION_MONTHS = 6;

/** Fields that count as secret rotation (reset credentialExpiresAt). */
const SECRET_ROTATION_FIELDS = new Set([
  'clientId',
  'clientSecret',
  'aesSecretKeyHex',
  'privateKeyPem',
  'clientPublicCertPem',
  'bankPublicCertPem',
]);

/** Patchable columns (excluding id / audit timestamps managed by service). */
const PATCHABLE_FIELDS = [
  'enabled',
  'environment',
  'baseUrl',
  'clientId',
  'clientSecret',
  'oauthAccessToken',
  'aesSecretKeyHex',
  'privateKeyPem',
  'clientPublicCertPem',
  'bankPublicCertPem',
  'merchantMid',
  'merchantSid',
  'terminalId',
  'upiId',
  'merchantName',
  'accountNumber',
  'ifscCode',
  'mcc',
  'mobileNumber',
  'bankName',
  'callbackUrl',
  'credentialExpiresAt',
];

const SECRET_FIELDS = new Set([
  'clientSecret',
  'aesSecretKeyHex',
  'privateKeyPem',
  'clientPublicCertPem',
  'bankPublicCertPem',
  'oauthAccessToken',
]);

function maskSecret(value) {
  if (!value) return null;
  const s = String(value);
  if (s.length <= 4) return '••••';
  return `••••${s.slice(-4)}`;
}

function isMaskedOrBlank(value) {
  if (value == null) return true;
  const s = String(value).trim();
  if (!s) return true;
  if (s.startsWith('••••')) return true;
  return false;
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function normalizeEnvironment(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (v === 'production' || v === 'prod') return 'production';
  return 'uat';
}

function parseChangedFieldsJson(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

class CanaraUpiSettingsService {
  constructor(repo) {
    this.repo = repo;
  }

  emptyDefaults() {
    return {
      isActive: true,
      enabled: false,
      environment: 'uat',
      baseUrl: 'https://api.canarauat.bank.in',
      clientId: null,
      clientSecret: null,
      oauthAccessToken: null,
      oauthTokenExpiresAt: null,
      aesSecretKeyHex: null,
      privateKeyPem: null,
      clientPublicCertPem: null,
      bankPublicCertPem: null,
      merchantMid: null,
      merchantSid: null,
      terminalId: null,
      upiId: null,
      merchantName: null,
      accountNumber: null,
      ifscCode: null,
      mcc: null,
      mobileNumber: null,
      bankName: 'Canara Bank',
      callbackUrl: null,
      credentialExpiresAt: null,
      activatedAt: null,
      deactivatedAt: null,
      changeReason: null,
      changedFields: null,
      changedByUserId: null,
    };
  }

  async getActiveRow() {
    const rows = await this.repo.find({
      where: { isActive: true },
      order: { id: 'DESC' },
      take: 1,
    });
    return rows[0] || null;
  }

  /**
   * Full credentials for bank API calls (never return to frontend).
   */
  async getActiveCredentials() {
    return this.getActiveRow();
  }

  readinessFromRow(row) {
    if (!row) {
      return {
        enabled: false,
        configured: false,
        ready: false,
        missing: ['no_active_version'],
      };
    }
    const required = [
      ['clientId', row.clientId],
      ['clientSecret', row.clientSecret],
      ['aesSecretKeyHex', row.aesSecretKeyHex],
      ['privateKeyPem', row.privateKeyPem],
      ['clientPublicCertPem', row.clientPublicCertPem],
      ['merchantMid', row.merchantMid],
      ['merchantSid', row.merchantSid],
      ['terminalId', row.terminalId],
      ['upiId', row.upiId],
      ['baseUrl', row.baseUrl],
    ];
    const missing = required.filter(([, v]) => !String(v || '').trim()).map(([k]) => k);
    const configured = missing.length === 0;
    const enabled = Boolean(row.enabled);
    return {
      enabled,
      configured,
      ready: enabled && configured,
      missing,
      credentialExpiresAt: row.credentialExpiresAt || null,
      rotationDueSoon: row.credentialExpiresAt
        ? new Date(row.credentialExpiresAt).getTime() - Date.now() <
          14 * 24 * 60 * 60 * 1000
        : false,
    };
  }

  toPublic(row) {
    if (!row) {
      return {
        hasVersion: false,
        ...this.readinessFromRow(null),
        version: null,
      };
    }
    const readiness = this.readinessFromRow(row);
    return {
      hasVersion: true,
      ...readiness,
      version: {
        id: row.id,
        isActive: Boolean(row.isActive),
        enabled: Boolean(row.enabled),
        environment: row.environment || 'uat',
        baseUrl: row.baseUrl || null,
        clientId: row.clientId || null,
        clientSecretMasked: maskSecret(row.clientSecret),
        aesSecretKeyHexMasked: maskSecret(row.aesSecretKeyHex),
        privateKeyPemMasked: maskSecret(row.privateKeyPem),
        clientPublicCertPemMasked: maskSecret(row.clientPublicCertPem),
        bankPublicCertPemMasked: maskSecret(row.bankPublicCertPem),
        merchantMid: row.merchantMid || null,
        merchantSid: row.merchantSid || null,
        terminalId: row.terminalId || null,
        upiId: row.upiId || null,
        merchantName: row.merchantName || null,
        accountNumber: row.accountNumber || null,
        ifscCode: row.ifscCode || null,
        mcc: row.mcc || null,
        mobileNumber: row.mobileNumber || null,
        bankName: row.bankName || null,
        callbackUrl: row.callbackUrl || null,
        credentialExpiresAt: row.credentialExpiresAt || null,
        activatedAt: row.activatedAt || null,
        deactivatedAt: row.deactivatedAt || null,
        changeReason: row.changeReason || null,
        changedFields: parseChangedFieldsJson(row.changedFields),
        changedByUserId: row.changedByUserId ?? null,
        createdAt: row.createdAt || null,
        updatedAt: row.updatedAt || null,
      },
    };
  }

  async getPublicActive() {
    const row = await this.getActiveRow();
    return this.toPublic(row);
  }

  async listVersionsPublic({ take = 50 } = {}) {
    const limit = Math.min(Math.max(parseInt(String(take), 10) || 50, 1), 200);
    const rows = await this.repo.find({
      order: { id: 'DESC' },
      take: limit,
    });
    return {
      versions: rows.map((row) => ({
        ...this.toPublic(row).version,
        isActive: Boolean(row.isActive),
      })),
    };
  }

  /**
   * Copy-on-write: clone active (or defaults), apply patch, activate new row.
   */
  async saveNewVersion(dto = {}, { userId = null } = {}) {
    const previous = await this.getActiveRow();
    const base = previous
      ? { ...previous }
      : { ...this.emptyDefaults() };

    // Strip TypeORM / identity fields before cloning into a new entity
    delete base.id;
    delete base.createdAt;
    delete base.updatedAt;

    const changedFields = [];
    const next = { ...base };

    for (const field of PATCHABLE_FIELDS) {
      if (!(field in dto) || dto[field] === undefined) continue;

      if (field === 'enabled') {
        const v = Boolean(dto.enabled);
        if (Boolean(next.enabled) !== v) {
          next.enabled = v;
          changedFields.push(field);
        }
        continue;
      }

      if (field === 'environment') {
        const v = normalizeEnvironment(dto.environment);
        if ((next.environment || 'uat') !== v) {
          next.environment = v;
          changedFields.push(field);
        }
        continue;
      }

      if (field === 'credentialExpiresAt') {
        if (dto.credentialExpiresAt === null || dto.credentialExpiresAt === '') {
          if (next.credentialExpiresAt) {
            next.credentialExpiresAt = null;
            changedFields.push(field);
          }
          continue;
        }
        const parsed = new Date(dto.credentialExpiresAt);
        if (Number.isNaN(parsed.getTime())) {
          throw AppError.badRequest('credentialExpiresAt must be a valid date');
        }
        const prevMs = next.credentialExpiresAt
          ? new Date(next.credentialExpiresAt).getTime()
          : null;
        if (prevMs !== parsed.getTime()) {
          next.credentialExpiresAt = parsed;
          changedFields.push(field);
        }
        continue;
      }

      const raw = dto[field];
      if (SECRET_FIELDS.has(field) || field === 'clientId') {
        if (isMaskedOrBlank(raw)) continue;
      }

      const incoming =
        typeof raw === 'string' ? raw.trim() || null : raw == null ? null : raw;
      const prevVal =
        next[field] == null || next[field] === undefined
          ? null
          : typeof next[field] === 'string'
            ? next[field].trim() || null
            : next[field];

      if (String(prevVal ?? '') !== String(incoming ?? '')) {
        next[field] = incoming;
        changedFields.push(field);
      }
    }

    const changeReason =
      typeof dto.changeReason === 'string' && dto.changeReason.trim()
        ? dto.changeReason.trim().slice(0, 255)
        : null;

    if (changedFields.length === 0 && previous) {
      // No-op save — keep current active version
      return this.toPublic(previous);
    }

    const now = new Date();
    const secretsRotated = changedFields.some((f) =>
      SECRET_ROTATION_FIELDS.has(f),
    );

    if (secretsRotated && !changedFields.includes('credentialExpiresAt')) {
      next.credentialExpiresAt = addMonths(now, CREDENTIAL_ROTATION_MONTHS);
      changedFields.push('credentialExpiresAt');
    }

    if (!previous && !next.credentialExpiresAt) {
      next.credentialExpiresAt = addMonths(now, CREDENTIAL_ROTATION_MONTHS);
    }

    next.isActive = true;
    next.activatedAt = now;
    next.deactivatedAt = null;
    next.changeReason =
      changeReason ||
      (previous
        ? secretsRotated
          ? 'credential_rotation'
          : 'settings_update'
        : 'initial_setup');
    next.changedFields = JSON.stringify(
      previous ? changedFields : ['initial_setup'],
    );
    next.changedByUserId = userId != null ? Number(userId) || null : null;
    // Do not carry cached OAuth token across versions when secrets rotate
    if (secretsRotated) {
      next.oauthAccessToken = null;
      next.oauthTokenExpiresAt = null;
    }

    return this.repo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(CanaraUpiCredentialVersion);

      if (previous) {
        await repo.update(
          { id: previous.id },
          {
            isActive: false,
            deactivatedAt: now,
          },
        );
      }

      // Safety: clear any other active rows
      const extraActive = await repo.find({ where: { isActive: true } });
      for (const row of extraActive) {
        if (previous && row.id === previous.id) continue;
        await repo.update(
          { id: row.id },
          { isActive: false, deactivatedAt: now },
        );
      }

      const saved = await repo.save(repo.create(next));
      return this.toPublic(saved);
    });
  }
}

module.exports = {
  CanaraUpiSettingsService,
  CREDENTIAL_ROTATION_MONTHS,
  PATCHABLE_FIELDS,
  SECRET_FIELDS,
  maskSecret,
};
