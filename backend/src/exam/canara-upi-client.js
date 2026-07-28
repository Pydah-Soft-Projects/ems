'use strict';

const { randomUUID } = require('crypto');
const { AppError } = require('../common/errors');
const {
  buildEncryptedRequest,
  unwrapResponseBody,
  certHeaderValue,
  decryptToken,
  verifySignature,
} = require('./canara-upi-crypto');
const { operationLogger } = require('../common/logger');

const log = operationLogger('canara-upi-client');

const PATHS = {
  qrGeneration: '/v1/upi/qr-generation',
  txnStatusExtId: '/v1/upi/txnStatus-extid',
  qrStatusExtId: '/v1/upi/qrstatus-extid',
  qrStatusRrn: '/v1/upi/qrstatus-rrn',
};

function trimSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

function formatRequestTime(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

class CanaraUpiClient {
  constructor(credentials) {
    this.credentials = credentials;
    this.baseUrl = trimSlash(credentials.baseUrl || '');
  }

  buildHeaders(signature) {
    const c = this.credentials;
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-client-id': c.clientId || '',
      'x-Client-Secret': c.clientSecret || '',
      'x-client-Certificate': certHeaderValue(c.clientPublicCertPem || ''),
      'x-api-interaction-id': randomUUID(),
      'x-timestamp': String(Math.floor(Date.now() / 1000)),
      'x-signature': signature,
    };
    if (c.oauthAccessToken) {
      headers.Authorization = `Bearer ${c.oauthAccessToken}`;
    }
    return headers;
  }

  async postEncrypted(path, encryptDataFields) {
    if (!this.baseUrl) {
      throw AppError.badRequest('Canara baseUrl is not configured');
    }
    const { body, signature } = buildEncryptedRequest(
      encryptDataFields,
      this.credentials,
    );
    const url = `${this.baseUrl}${path}`;
    const headers = this.buildHeaders(signature);

    let res;
    let text;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      text = await res.text();
    } catch (err) {
      log.error(
        { event: 'canara.http_error', path, err: err.message },
        'Canara HTTP request failed',
      );
      throw AppError.serviceUnavailable(
        `Canara Bank API unreachable: ${err.message || 'network error'}`,
      );
    }

    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      log.error(
        {
          event: 'canara.invalid_json',
          path,
          status: res.status,
          bodyPreview: String(text).slice(0, 300),
        },
        'Canara returned non-JSON',
      );
      throw AppError.badRequest(
        `Canara Bank API returned non-JSON (HTTP ${res.status})`,
      );
    }

    let decrypted;
    try {
      decrypted = unwrapResponseBody(json, this.credentials.aesSecretKeyHex);
    } catch (err) {
      // Some error responses are plaintext
      if (!res.ok) {
        throw AppError.badRequest(
          `Canara Bank API error HTTP ${res.status}: ${text.slice(0, 240)}`,
        );
      }
      throw err;
    }

    const status =
      decrypted?.status ||
      decrypted?.Status ||
      decrypted?.respMessge ||
      decrypted?.respMessage;
    const respCode = String(
      decrypted?.respCode ?? decrypted?.respcode ?? '',
    );
    const okHttp = res.ok;
    const okBiz =
      respCode === '0' ||
      String(status || '')
        .toUpperCase()
        .includes('SUCCESS');

    if (!okHttp || (!okBiz && respCode && respCode !== '0')) {
      const msg =
        decrypted?.errorMsg ||
        decrypted?.respMessge ||
        decrypted?.respMessage ||
        decrypted?.message ||
        `Canara API failed (HTTP ${res.status})`;
      log.warn(
        {
          event: 'canara.api_rejected',
          path,
          status: res.status,
          respCode,
          msg,
        },
        'Canara API business failure',
      );
      throw AppError.badRequest(String(msg));
    }

    return { raw: json, data: decrypted, httpStatus: res.status };
  }

  async generateDynamicQr({
    amount,
    extTransactionId,
    remark,
    receiptUrl,
  }) {
    const c = this.credentials;
    const fields = {
      amount: Number(amount).toFixed(2),
      extTransactionId: String(extTransactionId).slice(0, 35),
      channel: 'api',
      remark: String(remark || 'Exam Fee').slice(0, 100),
      source: c.merchantMid,
      terminalId: c.terminalId,
      type: 'D',
      param1: '',
      Param2: '',
      param3: '',
      sid: c.merchantSid,
      upiId: c.upiId,
      requestTime: formatRequestTime(),
      reciept: receiptUrl || c.callbackUrl || 'https://localhost/receipt',
      checksum: '',
    };
    const result = await this.postEncrypted(PATHS.qrGeneration, fields);
    const qrString = result.data?.qrString || result.data?.qrstring || null;
    if (!qrString) {
      throw AppError.badRequest('Canara QR Generation did not return qrString');
    }
    return {
      qrString,
      extTransactionId: result.data.extTransactionId || fields.extTransactionId,
      amount: result.data.amount || fields.amount,
      upiId: result.data.upiId || c.upiId,
      raw: result.data,
    };
  }

  async getTxnStatusByExtId(extTransactionId) {
    const c = this.credentials;
    const fields = {
      mid: c.merchantMid,
      channel: 'api',
      sid: c.merchantSid,
      terminalId: c.terminalId,
      extTransactionId: String(extTransactionId).slice(0, 35),
      checksum: '',
    };
    // Prefer txnStatus-extid; fall back to qrstatus-extid path if needed
    try {
      return await this.postEncrypted(PATHS.txnStatusExtId, fields);
    } catch (firstErr) {
      try {
        return await this.postEncrypted(PATHS.qrStatusExtId, fields);
      } catch {
        throw firstErr;
      }
    }
  }

  async getTxnStatusByRrn(rrn) {
    const c = this.credentials;
    const fields = {
      rrn: String(rrn),
      channel: 'api',
      terminalId: c.terminalId,
      mid: c.merchantMid,
      sid: c.merchantSid,
      checksum: '',
    };
    return this.postEncrypted(PATHS.qrStatusRrn, fields);
  }

  /**
   * Parse inbound QR Call-Back body (may be encrypted or plain).
   */
  parseCallbackPayload(body, signatureHeader) {
    const c = this.credentials;
    let payload = body;
    if (body?.Request?.body?.encryptData != null) {
      payload = decryptToken(
        body.Request.body.encryptData,
        c.aesSecretKeyHex,
      );
    } else if (body?.encryptData != null) {
      payload = decryptToken(body.encryptData, c.aesSecretKeyHex);
    }

    if (signatureHeader && c.bankPublicCertPem) {
      const ok = verifySignature(
        body,
        signatureHeader,
        c.bankPublicCertPem,
      );
      if (!ok) {
        throw AppError.forbidden('Invalid Canara callback signature');
      }
    }

    return payload;
  }
}

module.exports = { CanaraUpiClient, PATHS, formatRequestTime };
