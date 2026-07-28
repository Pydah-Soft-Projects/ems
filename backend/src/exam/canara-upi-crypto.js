'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { AppError } = require('../common/errors');

/**
 * Canara Bank API Banking crypto helpers (Node sample pattern):
 * - RSA-SHA256 sign/verify
 * - AES-128-CBC encrypt + HS256 JWT wrap for encryptData
 */
function normalizePem(pem) {
  if (!pem || typeof pem !== 'string') return '';
  let s = pem.trim().replace(/\\n/g, '\n');
  // Allow paste without headers (raw base64 body)
  if (!s.includes('BEGIN')) {
    s = `-----BEGIN PRIVATE KEY-----\n${s}\n-----END PRIVATE KEY-----`;
  }
  return s;
}

function normalizeCertPem(pem) {
  if (!pem || typeof pem !== 'string') return '';
  let s = pem.trim().replace(/\\n/g, '\n');
  if (!s.includes('BEGIN')) {
    s = `-----BEGIN CERTIFICATE-----\n${s}\n-----END CERTIFICATE-----`;
  }
  return s;
}

function parseAesKey(aesSecretKeyHex) {
  const hex = String(aesSecretKeyHex || '')
    .trim()
    .replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw AppError.badRequest('Invalid Canara AES secret key (expected hex)');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 16) {
    throw AppError.badRequest(
      `Canara AES key must be 16 bytes (32 hex chars); got ${key.length} bytes`,
    );
  }
  return key;
}

function signPayload(plaintext, privateKeyPem) {
  const data =
    typeof plaintext === 'string'
      ? Buffer.from(plaintext, 'utf8')
      : Buffer.from(JSON.stringify(plaintext), 'utf8');
  const key = crypto.createPrivateKey(normalizePem(privateKeyPem));
  const sign = crypto.sign('SHA256', data, key);
  return sign.toString('base64');
}

function verifySignature(plaintext, signatureBase64, bankPublicCertPem) {
  if (!signatureBase64 || !bankPublicCertPem) return false;
  try {
    const data =
      typeof plaintext === 'string'
        ? Buffer.from(plaintext, 'utf8')
        : Buffer.from(JSON.stringify(plaintext), 'utf8');
    const cert = new crypto.X509Certificate(normalizeCertPem(bankPublicCertPem));
    const pub = cert.publicKey;
    const sig = Buffer.from(String(signatureBase64), 'base64');
    return crypto.verify('SHA256', data, pub, sig);
  } catch {
    return false;
  }
}

/**
 * Encrypt inner encryptData object → JWT string (iv + encryptedData).
 */
function encryptDataObject(obj, aesSecretKeyHex) {
  const secretKey = parseAesKey(aesSecretKeyHex);
  const dataToEncrypt =
    typeof obj === 'string' ? obj : JSON.stringify(obj);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-128-cbc', secretKey, iv);
  let encryptedData = cipher.update(dataToEncrypt, 'utf-8', 'base64');
  encryptedData += cipher.final('base64');
  return jwt.sign({ iv, encryptedData }, secretKey, { algorithm: 'HS256' });
}

/**
 * Decrypt JWT encryptData token → object or string.
 */
function decryptToken(token, aesSecretKeyHex) {
  if (token == null) return null;
  if (typeof token === 'object') return token;

  const secretKey = parseAesKey(aesSecretKeyHex);
  const str = String(token).trim();

  // Plain JSON (some UAT responses)
  if (str.startsWith('{') || str.startsWith('[')) {
    try {
      return JSON.parse(str);
    } catch {
      /* fall through */
    }
  }

  try {
    const decoded = jwt.verify(str, secretKey);
    let iv = decoded.iv;
    if (iv && typeof iv === 'object' && Array.isArray(iv.data)) {
      iv = Buffer.from(iv.data);
    } else if (typeof iv === 'string') {
      iv = Buffer.from(iv, 'base64');
    } else if (Buffer.isBuffer(iv)) {
      /* ok */
    } else if (iv && iv.type === 'Buffer' && Array.isArray(iv.data)) {
      iv = Buffer.from(iv.data);
    } else {
      throw new Error('Missing IV in encrypted token');
    }
    const encryptedData = decoded.encryptedData;
    const decipher = crypto.createDecipheriv('aes-128-cbc', secretKey, iv);
    let decrypted = decipher.update(encryptedData, 'base64', 'utf-8');
    decrypted += decipher.final('utf-8');
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch (err) {
    throw AppError.badRequest(
      `Failed to decrypt Canara payload: ${err.message || 'unknown'}`,
    );
  }
}

/**
 * Build Request envelope: encrypt inner fields, sign plaintext wrapper.
 */
function buildEncryptedRequest(encryptDataFields, credentials) {
  const encrypted = encryptDataObject(
    encryptDataFields,
    credentials.aesSecretKeyHex,
  );
  const requestBody = {
    Request: {
      body: {
        encryptData: encrypted,
      },
    },
  };
  // Sign the request body object (plaintext JSON)
  const signature = signPayload(requestBody, credentials.privateKeyPem);
  return { body: requestBody, signature, encrypted };
}

/**
 * Unwrap bank Response.encryptData (string JWT or object).
 */
function unwrapResponseBody(responseJson, aesSecretKeyHex) {
  const encrypted =
    responseJson?.Response?.body?.encryptData ??
    responseJson?.response?.body?.encryptData ??
    responseJson?.encryptData ??
    responseJson;
  return decryptToken(encrypted, aesSecretKeyHex);
}

function certHeaderValue(clientPublicCertPem) {
  // Banks often want PEM as single-line or base64 body
  const pem = normalizeCertPem(clientPublicCertPem);
  return pem.replace(/\r?\n/g, '');
}

module.exports = {
  normalizePem,
  normalizeCertPem,
  parseAesKey,
  signPayload,
  verifySignature,
  encryptDataObject,
  decryptToken,
  buildEncryptedRequest,
  unwrapResponseBody,
  certHeaderValue,
};
