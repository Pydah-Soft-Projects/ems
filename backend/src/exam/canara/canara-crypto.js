'use strict';

const crypto = require('node:crypto');
const { CompactEncrypt, compactDecrypt, importJWK } = require('jose');
const { AppError } = require('../../common/errors');

/**
 * Decode bank-provided symmetric key into raw bytes.
 * Accepts base64url, standard base64, or hex.
 */
function decodeSymmetricKeyBytes(raw) {
  const s = String(raw || '').trim();
  if (!s) {
    throw AppError.badRequest('Canara symmetric key is not configured');
  }

  // Hex (64 chars = 32 bytes for A256KW)
  if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) {
    return Buffer.from(s, 'hex');
  }

  // Base64 / base64url
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, 'base64');
}

async function importOctKey(rawKey, alg = 'A256KW') {
  const bytes = decodeSymmetricKeyBytes(rawKey);
  if (bytes.length !== 32) {
    throw AppError.badRequest(
      `Canara symmetric key must be 32 bytes for ${alg} (got ${bytes.length})`,
    );
  }
  return importJWK(
    {
      kty: 'oct',
      k: bytes.toString('base64url'),
      alg,
    },
    alg,
  );
}

/**
 * RSA-SHA256 sign plaintext JSON string → base64url (bank sample style).
 */
function signPayload(plaintext, privateKeyPem) {
  if (!privateKeyPem?.trim()) {
    throw AppError.badRequest('Canara RSA private key is not configured');
  }
  const data =
    typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  signer.end();
  const sig = signer.sign(privateKeyPem.trim());
  return sig.toString('base64url');
}

/**
 * Encrypt encryptData object → JWE compact string (A256KW + A128CBC-HS256).
 */
async function encryptEncryptData(encryptDataObj, symmetricKeyRaw) {
  const key = await importOctKey(symmetricKeyRaw, 'A256KW');
  const plaintext = JSON.stringify(encryptDataObj);
  return new CompactEncrypt(new TextEncoder().encode(plaintext))
    .setProtectedHeader({ alg: 'A256KW', enc: 'A128CBC-HS256' })
    .encrypt(key);
}

/**
 * Decrypt JWE compact string → object.
 */
async function decryptEncryptData(jweCompact, symmetricKeyRaw) {
  if (jweCompact == null) return null;
  if (typeof jweCompact === 'object') return jweCompact;

  const s = String(jweCompact).trim();
  if (!s) return null;

  // Already plaintext JSON (some callback samples)
  if (s.startsWith('{')) {
    try {
      return JSON.parse(s);
    } catch {
      /* fall through */
    }
  }

  // Not a JWE (no dots) — return as-is string wrapper
  if (!s.includes('.')) {
    return s;
  }

  const key = await importOctKey(symmetricKeyRaw, 'A256KW');
  const { plaintext } = await compactDecrypt(s, key);
  const text = new TextDecoder().decode(plaintext);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Build final bank request body + x-signature from plaintext encryptData fields.
 */
async function buildSignedEncryptedRequest(encryptDataPlain, cfg) {
  const plainForSign = JSON.stringify(encryptDataPlain);
  const signature = signPayload(plainForSign, cfg.privateKeyPem);
  const encrypted = await encryptEncryptData(
    encryptDataPlain,
    cfg.symmetricKey,
  );
  return {
    body: {
      Request: {
        body: {
          encryptData: encrypted,
        },
      },
    },
    signature,
    plaintextSigned: plainForSign,
  };
}

/**
 * Strip PEM headers for x-client-Certificate if bank expects bare base64.
 * Sends full PEM by default; callers may prefer either form.
 */
function publicCertHeaderValue(publicCertPem) {
  if (!publicCertPem?.trim()) return '';
  return publicCertPem.trim().replace(/\r\n/g, '\n');
}

/**
 * Normalize callback / response body into encryptData object (decrypted).
 */
async function extractEncryptData(payload, symmetricKeyRaw) {
  if (!payload || typeof payload !== 'object') {
    throw AppError.badRequest('Invalid Canara payload');
  }

  const nested =
    payload?.Request?.body?.encryptData ??
    payload?.Response?.body?.encryptData ??
    payload?.body?.encryptData ??
    payload?.encryptData ??
    payload;

  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    // Already object (callback sample in bank doc)
    if (
      nested.extTransactionId ||
      nested.status ||
      nested.amount ||
      nested.qrString ||
      nested.mid
    ) {
      return nested;
    }
  }

  return decryptEncryptData(nested, symmetricKeyRaw);
}

module.exports = {
  decodeSymmetricKeyBytes,
  signPayload,
  encryptEncryptData,
  decryptEncryptData,
  buildSignedEncryptedRequest,
  publicCertHeaderValue,
  extractEncryptData,
};
