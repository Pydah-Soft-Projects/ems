'use strict';

const crypto = require('node:crypto');
const {
  buildSignedEncryptedRequest,
  decryptEncryptData,
  publicCertHeaderValue,
} = require('./canara-crypto');
const { AppError } = require('../../common/errors');
const { operationLogger } = require('../../common/logger');

const log = operationLogger('canara-client');

function basicAuthHeader(clientId, clientSecret) {
  const token = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString(
    'base64',
  );
  return `Basic ${token}`;
}

function interactionId() {
  return `EMS${Date.now()}${crypto.randomBytes(3).toString('hex')}`.slice(0, 32);
}

class CanaraApiClient {
  constructor(canaraSettings) {
    this.canaraSettings = canaraSettings;
  }

  async getLiveConfig() {
    return this.canaraSettings.getConfig({ requireLive: false });
  }

  async getOauthConfig() {
    return this.canaraSettings.getOauthConfig();
  }

  /**
   * Exchange authorization code for tokens.
   */
  async exchangeAuthorizationCode({ code, redirectUri }) {
    const cfg = await this.getOauthConfig();
    const url = `${cfg.baseUrl.replace(/\/$/, '')}/v1/oauth2/token`;
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      redirect_uri: redirectUri || cfg.oauthRedirectUri,
      code: String(code),
      scope: cfg.scope || '',
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(cfg.clientId, cfg.clientSecret),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      log.warn(
        { event: 'canara.oauth.token_failed', status: res.status, data },
        'Canara token exchange failed',
      );
      throw AppError.badRequest(
        data.error_description ||
          data.message ||
          `Canara token exchange failed (${res.status})`,
      );
    }
    return normalizeTokenResponse(data);
  }

  async refreshAccessToken(refreshToken) {
    const cfg = await this.getLiveConfig();
    const url = `${cfg.baseUrl.replace(/\/$/, '')}/v1/oauth2/refresh-token`;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: String(refreshToken || cfg.refreshToken),
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(cfg.clientId, cfg.clientSecret),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      log.warn(
        { event: 'canara.oauth.refresh_failed', status: res.status, data },
        'Canara refresh token failed',
      );
      throw AppError.badRequest(
        data.error_description ||
          data.message ||
          `Canara refresh failed (${res.status})`,
      );
    }
    return normalizeTokenResponse(data);
  }

  /**
   * Ensure a valid access token is stored; refresh if needed.
   */
  async ensureAccessToken() {
    const cfg = await this.canaraSettings.getConfig({ requireLive: true });
    const expiresAt = cfg.tokenExpiresAt
      ? new Date(cfg.tokenExpiresAt).getTime()
      : 0;
    const skewMs = 60_000;
    if (cfg.accessToken && expiresAt > Date.now() + skewMs) {
      return cfg.accessToken;
    }
    if (!cfg.refreshToken) {
      throw AppError.badRequest(
        'Canara OAuth not connected. Complete OAuth authorize flow in Settings.',
      );
    }
    const tokens = await this.refreshAccessToken(cfg.refreshToken);
    await this.canaraSettings.saveTokens({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || cfg.refreshToken,
      expiresAt: tokens.expiresAt,
    });
    return tokens.accessToken;
  }

  buildAuthorizeUrl({ state } = {}) {
    return this.canaraSettings.getOauthConfig().then((cfg) => {
      const params = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: cfg.oauthRedirectUri,
        response_type: 'code',
        state: state || crypto.randomBytes(8).toString('hex'),
        scope: cfg.scope || '',
      });
      return {
        url: `${cfg.baseUrl.replace(/\/$/, '')}/v1/oauth2/authorize?${params}`,
        state: params.get('state'),
        redirectUri: cfg.oauthRedirectUri,
      };
    });
  }

  /**
   * POST encrypted business API.
   */
  async postEncrypted(path, encryptDataPlain) {
    const cfg = await this.canaraSettings.getConfig({ requireLive: false });
    const accessToken = await this.ensureAccessToken();
    const { body, signature } = await buildSignedEncryptedRequest(
      encryptDataPlain,
      cfg,
    );

    const url = `${cfg.baseUrl.replace(/\/$/, '')}${path}`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-client-id': cfg.clientId,
      'x-Client-Secret': cfg.clientSecret,
      'x-client-Certificate': publicCertHeaderValue(cfg.publicCertPem),
      'x-api-interaction-id': interactionId(),
      'x-timestamp': String(Math.floor(Date.now() / 1000)),
      'x-signature': signature,
      'x-forwarded-for': process.env.CANARA_FORWARD_IP || '127.0.0.1',
      Cookie: 'ems=1',
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      log.warn(
        { event: 'canara.api.error', path, status: res.status, raw },
        'Canara API error',
      );
      throw AppError.badRequest(
        raw.message ||
          raw.error ||
          `Canara API ${path} failed (${res.status})`,
      );
    }

    const encrypted =
      raw?.Response?.body?.encryptData ?? raw?.Request?.body?.encryptData;
    const decrypted = await decryptEncryptData(encrypted, cfg.symmetricKey);
    return { raw, decrypted };
  }

  generateQr(encryptDataPlain) {
    return this.postEncrypted('/v1/upi/qr-generation', encryptDataPlain);
  }

  txnStatusByExtId(encryptDataPlain) {
    return this.postEncrypted('/v1/upi/txnStatus-extid', encryptDataPlain);
  }
}

function normalizeTokenResponse(data) {
  const accessToken =
    data.access_token || data.accessToken || data.token || null;
  const refreshToken =
    data.refresh_token || data.refreshToken || null;
  const expiresIn = parseInt(
    String(data.expires_in || data.expiresIn || 86400),
    10,
  );
  const expiresAt = new Date(
    Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 86400) * 1000,
  );
  if (!accessToken) {
    throw AppError.badRequest('Canara token response missing access_token');
  }
  return { accessToken, refreshToken, expiresAt, raw: data };
}

module.exports = { CanaraApiClient };
