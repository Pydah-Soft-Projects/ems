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
  async exchangeAuthorizationCode({ code, redirectUri, state, scope }) {
    const cfg = await this.getOauthConfig();
    const url = `${cfg.baseUrl.replace(/\/$/, '')}/v1/oauth2/token`;
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      // redirect_uri: redirectUri || cfg.oauthRedirectUri,
      
  redirect_uri: 'https://ems.pydah.edu.in/api/fees/canara/oauth/callback',
      code: String(code),
      scope: typeof scope === 'string' && String(scope).trim()
        ? String(scope).trim()
        : cfg.scope || '',
    });
    if (typeof state !== 'undefined' && state !== null && String(state).trim()) {
      body.set('state', String(state));
    }

    const requestBodyDebug = {
      grant_type: 'authorization_code',
     // redirect_uri: redirectUri || cfg.oauthRedirectUri,
     redirect_uri: 'https://ems.pydah.edu.in/api/fees/canara/oauth/callback',
      code: String(code),
      scope:
        typeof scope === 'string' && String(scope).trim()
          ? String(scope).trim()
          : cfg.scope || '',
    };
    if (typeof state !== 'undefined' && state !== null && String(state).trim()) {
      requestBodyDebug.state = String(state);
    }

    console.log('Canara token exchange request body:');
    console.log(JSON.stringify(requestBodyDebug, null, 2));

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
      const failureInfo = {
        request: requestBodyDebug,
        status: res.status,
        response: data,
      };
      log.warn(
        {
          event: 'canara.oauth.token_failed',
          status: res.status,
          requestBody: body.toString(),
          data,
        },
        'Canara token exchange failed',
      );
      console.warn('Canara token exchange failed:');
      console.warn(JSON.stringify(failureInfo, null, 2));
      throw AppError.badRequest(
        data.error_description ||
          data.message ||
          `Canara token exchange failed (${res.status})`,
      );
    }
    const tokenResponse = normalizeTokenResponse(data);
    if (!tokenResponse.accessToken) {
      const failureInfo = {
        request: requestBodyDebug,
        response: data,
      };
      log.warn(
        {
          event: 'canara.oauth.token_invalid_response',
          requestBody: body.toString(),
          data,
        },
        'Canara token response missing access_token',
      );
      console.warn('Canara token response missing access_token:');
      console.warn(JSON.stringify(failureInfo, null, 2));
    }
    return tokenResponse;
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
    const refreshTokenExpiresAt = cfg.refreshTokenExpiresAt
      ? new Date(cfg.refreshTokenExpiresAt).getTime()
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
    if (refreshTokenExpiresAt && refreshTokenExpiresAt <= Date.now() + skewMs) {
      throw AppError.badRequest(
        'Canara refresh token has expired. Reconnect Canara OAuth.',
      );
    }
    const tokens = await this.refreshAccessToken(cfg.refreshToken);
    await this.canaraSettings.saveTokens({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || cfg.refreshToken,
      tokenType: tokens.tokenType,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
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
    return this.postJson(path, encryptDataPlain, { wrapped: true });
  }

  async postPlainBody(path, payload) {
    return this.postJson(path, payload, { wrapped: false });
  }

  async postJson(path, payload, { wrapped = true } = {}) {
    const cfg = await this.canaraSettings.getConfig({ requireLive: false });
    const accessToken = await this.ensureAccessToken();

    const url = `${cfg.baseUrl.replace(/\/$/, '')}${path}`;
    const authScheme = String(cfg.tokenType || 'Bearer').trim() || 'Bearer';

    const signedRequest = await buildSignedEncryptedRequest(payload, cfg);
    const requestBody = wrapped ? signedRequest.body : payload;
    const headers = {
      Authorization: `${authScheme} ${accessToken}`,
      'Content-Type': 'application/json',
      'x-client-id': cfg.clientId,
      'x-Client-Secret': cfg.clientSecret,
      'x-client-Certificate': publicCertHeaderValue(cfg.publicCertPem),
      'x-api-interaction-id': interactionId(),
      'x-timestamp': String(Math.floor(Date.now() / 1000)),
      'x-signature': signedRequest.signature,
      'x-forwarded-for': process.env.CANARA_FORWARD_IP || '127.0.0.1',
      Cookie: 'ems=1',
    };

    console.log('===== Canara outbound request =====');
    console.log('Path:', path);
    console.log('URL:', url);
    console.log('Authorization header:', headers.Authorization);
    console.log('x-signature header:', headers['x-signature']);
    console.log('Headers JSON:');
    console.log(JSON.stringify(headers, null, 2));
    console.log('Headers raw object:');
    console.log(headers);
    console.log('Plaintext payload:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('Signed payload JSON string used for signature:');
    console.log(signedRequest.plaintextSigned);
    console.log('Request body:');
    console.log(JSON.stringify(requestBody, null, 2));

    const fetchInit = {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    };
    console.log('Fetch init:');
    console.log(JSON.stringify(fetchInit, null, 2));

    const res = await fetch(url, fetchInit);

    const responseText = await res.text();
    let parsed = {};
    if (responseText) {
      try {
        parsed = JSON.parse(responseText);
      } catch (error) {
        parsed = responseText;
      }
    }

    console.log('===== Canara inbound response =====');
    console.log('Path:', path);
    console.log('Status:', res.status);
    console.log('Response content-type:', res.headers.get('content-type') || 'n/a');
    console.log('Raw response text:');
    console.log(responseText || '<empty>');
    console.log('Parsed response:');
    console.log(JSON.stringify(parsed, null, 2));

    if (!res.ok) {
      console.error('===== Canara API error =====');
      console.error('Path:', path);
      console.error('Status:', res.status);
      console.error('Raw response text:', responseText || '<empty>');
      const errorMessage =
        (parsed && typeof parsed === 'object' && (parsed.message || parsed.error)) ||
        responseText ||
        `Canara API ${path} failed (${res.status})`;
      throw AppError.badRequest(errorMessage);
    }

    return { raw: parsed, decrypted: parsed, rawText: responseText };
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
  const tokenType = String(
    data.token_type || data.tokenType || 'Bearer',
  ).trim();
  const scope = data.scope || null;
  const refreshTokenExpiresIn =
    data.refresh_token_expires_in || data.refreshTokenExpiresIn || null;
  const refreshTokenExpiresAt =
    refreshTokenExpiresIn != null && Number.isFinite(Number(refreshTokenExpiresIn))
      ? new Date(Date.now() + Number(refreshTokenExpiresIn) * 1000)
      : null;
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
  return {
    accessToken,
    refreshToken,
    tokenType: tokenType || 'Bearer',
    scope,
    expiresAt,
    refreshTokenExpiresAt,
    raw: data,
  };
}

module.exports = { CanaraApiClient };
