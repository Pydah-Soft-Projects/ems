'use strict';

const { config } = require('../config');
const { AppError } = require('../common/errors');

function maskSecret(value) {
  if (!value) return null;
  if (value.length <= 4) return '••••';
  return `••••${value.slice(-4)}`;
}

function fallbackCanaraApiUrl() {
  const publicApiUrl = (config.publicApiUrl || '').trim();
  if (!publicApiUrl) {
    return 'https://ems.pydah.edu.in';
  }
  const normalized = publicApiUrl.replace(/\/$/, '');
  if (/^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(normalized)) {
    return 'https://ems.pydah.edu.in';
  }
  return normalized;
}

/**
 * Canara Bank Dynamic QR settings — own table `canara_payment_settings`.
 */
class CanaraSettingsService {
  constructor(canaraRepo, oauthAuditRepo = null) {
    this.canaraRepo = canaraRepo;
    this.oauthAuditRepo = oauthAuditRepo;
  }

  async getOrCreateRow() {
    const existing = await this.canaraRepo.find({
      order: { id: 'ASC' },
      take: 1,
    });
    let row = existing[0];
    if (!row) {
      row = this.canaraRepo.create({
        enabled: false,
        mockMode: false,
        clientId: null,
        clientSecret: null,
        baseUrl: 'https://api.canarauat.bank.in',
        scope: null,
        oauthRedirectUri: null,
        mid: null,
        sid: null,
        terminalId: null,
        upiId: null,
        symmetricKey: null,
        privateKeyPem: null,
        publicCertPem: null,
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
      });
      row = await this.canaraRepo.save(row);
    }
    return row;
  }

  publicFromRow(row) {
    const env = config.canara || {};
    const mockMode = Boolean(row.mockMode) || Boolean(env.mockMode);
    const clientId = row.clientId?.trim() || env.clientId?.trim() || '';
    const hasSecret = Boolean(
      row.clientSecret?.trim() || env.clientSecret?.trim(),
    );
    const mid = row.mid?.trim() || env.mid?.trim() || '';
    const sid = row.sid?.trim() || env.sid?.trim() || '';
    const terminalId =
      row.terminalId?.trim() || env.terminalId?.trim() || '';
    const upiId = row.upiId?.trim() || env.upiId?.trim() || '';
    const hasCrypto = Boolean(
      (row.symmetricKey?.trim() || env.symmetricKey?.trim()) &&
        (row.privateKeyPem?.trim() || env.privateKeyPem?.trim()),
    );
    const hasToken = Boolean(row.accessToken?.trim());
    const enabledFlag =
      Boolean(row.enabled) || (!row.clientId?.trim() && Boolean(env.enabled));
    const merchantReady = Boolean(mid && sid && terminalId && upiId);

    // Real bank credentials always required. mockMode = test mode only
    // (bank QR/callback still real; fee dues are NOT marked paid).
    const testMode = mockMode;
    const configured = Boolean(
      clientId && hasSecret && merchantReady && hasCrypto,
    );
    const oauthReady = hasToken || Boolean(row.refreshToken?.trim());
    const ready = Boolean(enabledFlag && configured && oauthReady);

    const missing = [];
    if (!enabledFlag) missing.push('enabled');
    if (!clientId) missing.push('clientId');
    if (!hasSecret) missing.push('clientSecret');
    if (!mid) missing.push('mid');
    if (!sid) missing.push('sid');
    if (!terminalId) missing.push('terminalId');
    if (!upiId) missing.push('upiId');
    if (!hasCrypto) missing.push('symmetricKey+privateKey');
    if (!oauthReady) missing.push('oauth');

    const baseUrl =
      row.baseUrl?.trim() ||
      env.baseUrl?.trim() ||
      'https://api.canarauat.bank.in';
    const fallbackApiUrl = fallbackCanaraApiUrl();
    const oauthRedirectUri =
      row.oauthRedirectUri?.trim() ||
      env.oauthRedirectUri?.trim() ||
      `${fallbackApiUrl}/api/fees/canara/oauth/callback`;
    const qrCallbackUrl =
      row.qrCallbackUrl?.trim() ||
      env.qrCallbackUrl?.trim() ||
      `${fallbackApiUrl}/api/fees/canara/qr-callback`;

    return {
      enabled: enabledFlag,
      mockMode: testMode,
      testMode,
      configured,
      ready,
      oauthReady,
      merchantReady,
      missing,
      hasClientSecret: hasSecret,
      hasSymmetricKey: Boolean(
        row.symmetricKey?.trim() || env.symmetricKey?.trim(),
      ),
      hasPrivateKey: Boolean(
        row.privateKeyPem?.trim() || env.privateKeyPem?.trim(),
      ),
      hasPublicCert: Boolean(
        row.publicCertPem?.trim() || env.publicCertPem?.trim(),
      ),
      hasAccessToken: hasToken,
      clientId: clientId || null,
      clientSecretMasked: maskSecret(
        row.clientSecret?.trim() || env.clientSecret?.trim() || null,
      ),
      baseUrl,
      scope: row.scope?.trim() || env.scope?.trim() || null,
      oauthRedirectUri,
      qrCallbackUrl,
      mid: mid || null,
      sid: sid || null,
      terminalId: terminalId || null,
      upiId: upiId || null,
      tokenType: row.tokenType?.trim() || null,
      tokenExpiresAt: row.tokenExpiresAt || null,
      refreshTokenExpiresAt: row.refreshTokenExpiresAt || null,
    };
  }

  async getStatus() {
    const row = await this.getOrCreateRow();
    return this.publicFromRow(row);
  }

  /** Alias for settings routes */
  async getCanaraSettingsPublic() {
    return this.getStatus();
  }

  async getConfig({ requireLive = false } = {}) {
    const row = await this.getOrCreateRow();
    const pub = this.publicFromRow(row);
    const env = config.canara || {};

    if (!pub.enabled) {
      throw AppError.badRequest(
        'Canara Dynamic QR is disabled. Enable it in Settings → Canara Bank Dynamic QR.',
      );
    }

    if (!pub.configured) {
      throw AppError.badRequest(
        `Canara credentials incomplete. Missing: ${(pub.missing || []).join(', ') || 'merchant / crypto / client fields'}`,
      );
    }

    if (requireLive && !pub.oauthReady) {
      throw AppError.badRequest(
        'Canara OAuth not connected. Use Connect Canara OAuth in Settings.',
      );
    }

    return {
      ...pub,
      clientId: row.clientId?.trim() || env.clientId?.trim() || '',
      clientSecret: row.clientSecret?.trim() || env.clientSecret?.trim() || '',
      symmetricKey: row.symmetricKey?.trim() || env.symmetricKey?.trim() || '',
      privateKeyPem:
        row.privateKeyPem?.trim() || env.privateKeyPem?.trim() || '',
      publicCertPem:
        row.publicCertPem?.trim() || env.publicCertPem?.trim() || '',
      accessToken: row.accessToken?.trim() || '',
      refreshToken: row.refreshToken?.trim() || '',
      tokenType: row.tokenType?.trim() || null,
      tokenExpiresAt: row.tokenExpiresAt || null,
      refreshTokenExpiresAt: row.refreshTokenExpiresAt || null,
      _rowId: row.id,
    };
  }

  async getOauthConfig() {
    const row = await this.getOrCreateRow();
    const env = config.canara || {};
    const baseUrl = row.baseUrl?.trim() || env.baseUrl?.trim() || 'https://api.canarauat.bank.in';
    const oauthRedirectUri = row.oauthRedirectUri?.trim() || env.oauthRedirectUri?.trim() || `${(config.publicApiUrl || '').replace(/\/$/, '')}/api/fees/canara/oauth/callback`;
    const clientId = row.clientId?.trim() || env.clientId?.trim() || '';
    const clientSecret = row.clientSecret?.trim() || env.clientSecret?.trim() || '';
    const scope = row.scope?.trim() || env.scope?.trim() || '';

    if (!clientId || !clientSecret) {
      throw AppError.badRequest('Canara OAuth client credentials are incomplete. Missing clientId or clientSecret.');
    }

    return {
      clientId,
      clientSecret,
      baseUrl,
      oauthRedirectUri,
      scope,
      accessToken: row.accessToken?.trim() || '',
      refreshToken: row.refreshToken?.trim() || '',
      tokenExpiresAt: row.tokenExpiresAt || null,
      _rowId: row.id,
    };
  }

  async updateSettings(dto = {}) {
    const row = await this.getOrCreateRow();
    const patch = {};
    const str = (v) => (typeof v === 'string' ? v.trim() : null);

    if (typeof dto.enabled === 'boolean') patch.enabled = dto.enabled;
    if (typeof dto.canaraEnabled === 'boolean') patch.enabled = dto.canaraEnabled;
    if (typeof dto.mockMode === 'boolean') patch.mockMode = dto.mockMode;
    if (typeof dto.testMode === 'boolean') patch.mockMode = dto.testMode;
    if (typeof dto.canaraMockMode === 'boolean') {
      patch.mockMode = dto.canaraMockMode;
    }

    const mapStr = [
      ['clientId', 'canaraClientId', 'clientId'],
      ['baseUrl', 'canaraBaseUrl', 'baseUrl'],
      ['scope', 'canaraScope', 'scope'],
      ['oauthRedirectUri', 'canaraOauthRedirectUri', 'oauthRedirectUri'],
      ['mid', 'canaraMid', 'mid'],
      ['sid', 'canaraSid', 'sid'],
      ['terminalId', 'canaraTerminalId', 'terminalId'],
      ['upiId', 'canaraUpiId', 'upiId'],
    ];
    for (const [col, a, b] of mapStr) {
      const raw = dto[a] ?? dto[b];
      if (typeof raw === 'string') {
        patch[col] =
          col === 'baseUrl'
            ? str(raw) || 'https://api.canarauat.bank.in'
            : str(raw) || null;
      }
    }

    const secrets = [
      ['clientSecret', 'canaraClientSecret', 'clientSecret'],
      ['symmetricKey', 'canaraSymmetricKey', 'symmetricKey'],
      ['privateKeyPem', 'canaraPrivateKeyPem', 'privateKeyPem'],
      ['publicCertPem', 'canaraPublicCertPem', 'publicCertPem'],
    ];
    for (const [col, a, b] of secrets) {
      const raw = dto[a] ?? dto[b];
      if (typeof raw === 'string') {
        const v = str(raw);
        if (v && !v.startsWith('••••')) patch[col] = v;
      }
    }

    if (Object.keys(patch).length > 0) {
      // Merge + save so booleans persist reliably (avoid empty update edge cases)
      Object.assign(row, patch);
      await this.canaraRepo.save(row);
    }
    return this.getStatus();
  }

  async saveTokens({ accessToken, refreshToken, expiresAt, tokenType, refreshTokenExpiresAt, scope }) {
    const row = await this.getOrCreateRow();
    const patch = {};
    if (accessToken != null) patch.accessToken = accessToken || null;
    if (refreshToken != null) patch.refreshToken = refreshToken || null;
    if (tokenType != null) patch.tokenType = tokenType || null;
    if (refreshTokenExpiresAt !== undefined)
      patch.refreshTokenExpiresAt = refreshTokenExpiresAt;
    if (expiresAt !== undefined) patch.tokenExpiresAt = expiresAt;
    if (scope != null) patch.scope = scope || null;
    await this.canaraRepo.update({ id: row.id }, patch);
    return this.getStatus();
  }

  async recordOauthCallbackAudit({
    code,
    state,
    scope,
    redirectUri,
    requestIp,
    userAgent,
    callbackReceivedAt,
  } = {}) {
    if (!this.oauthAuditRepo) {
      return { id: null };
    }

    const row = this.oauthAuditRepo.create({
      provider: 'canara',
      clientId: null,
      redirectUri: redirectUri || null,
      state: state || null,
      scope: scope || null,
      authorizationCode: code || null,
      callbackReceivedAt: callbackReceivedAt || new Date(),
      requestIp: requestIp || null,
      userAgent: userAgent || null,
      stateVerified: false,
      tokenResponseStatus: null,
    });

    const saved = await this.oauthAuditRepo.save(row);
    return { id: saved?.id ?? null };
  }

  async finalizeOauthCallbackAudit({
    auditId,
    accessToken,
    refreshToken,
    expiresAt,
    status,
    stateVerified,
  } = {}) {
    if (!this.oauthAuditRepo || !auditId) {
      return { ok: true };
    }

    const patch = {
      codeExchangeCompletedAt: new Date(),
      tokenResponseStatus: status || 'success',
      accessTokenHash: accessToken ? this.hashValue(accessToken) : null,
      refreshTokenHash: refreshToken ? this.hashValue(refreshToken) : null,
      tokenExpiresAt: expiresAt || null,
      stateVerified: stateVerified === true,
      updatedAt: new Date(),
    };

    await this.oauthAuditRepo.update({ id: auditId }, patch);
    return { ok: true };
  }

  hashValue(value) {
    if (!value) return null;
    return require('node:crypto').createHash('sha256').update(String(value)).digest('hex');
  }

  /** Fee desk / student — slim readiness only */
  async getReadyStatus() {
    const s = await this.getStatus();
    return {
      enabled: s.enabled,
      mockMode: s.mockMode,
      testMode: s.testMode,
      configured: s.configured,
      ready: s.ready,
      oauthReady: s.oauthReady,
      upiId: s.upiId,
      qrCallbackUrl: s.qrCallbackUrl,
      missing: s.missing || [],
    };
  }
}

module.exports = { CanaraSettingsService };
