'use strict';

/**
 * Parse merchant statement text / tabular rows into normalized txn objects.
 * PDF text is primary; CSV/XLS rows are secondary.
 */

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function normalizeRef(value) {
  if (value == null) return null;
  const s = String(value).trim().toUpperCase();
  return s || null;
}

/** Extract SO… / FM… / order-like tokens from free text */
function extractOrderRefs(text) {
  if (!text) return [];
  const found = new Set();
  const re = /\b(SO\d{4}\d{4,}|SO-\d+|FM\d{4}\d{4,})\b/gi;
  let m;
  while ((m = re.exec(String(text))) !== null) {
    found.add(m[1].toUpperCase());
  }
  return [...found];
}

/**
 * Extract UTR from bank / UPI narration.
 * Common SBI-style: UPI/CR/696846634477/PayerName/...
 */
function extractUtr(text) {
  if (!text) return null;
  const patterns = [
    /\bUPI\/(?:CR|DR)\/([0-9]{10,22})\b/i,
    /\bUTR[:\s#.\-\/]*([A-Z0-9]{8,22})\b/i,
    /\bUPI[:\s#\-]*Ref[:\s#.\-\/]*([A-Z0-9]{8,22})\b/i,
    /\bRef(?:erence)?(?:\s*No)?[:\s#.\-\/]*([A-Z0-9]{8,22})\b/i,
    /\b([0-9]{12,22})\b/,
  ];
  for (const re of patterns) {
    const m = String(text).match(re);
    if (m?.[1]) return m[1].toUpperCase();
  }
  return null;
}

function extractAmount(text) {
  if (!text) return null;
  const s = String(text);
  // Prefer trailing money columns: "... -- 1.00 1.36" or "... 1.00 Cr"
  const trailing = s.match(
    /(?:--|−|-)?\s*([0-9]+(?:,[0-9]{3})*\.[0-9]{2})\s*(?:[0-9]+(?:,[0-9]{3})*\.[0-9]{2})?\s*(?:CR|DR|Cr|Dr)?\s*$/,
  );
  if (trailing?.[1]) {
    return roundMoney(trailing[1].replace(/,/g, ''));
  }
  const patterns = [
    /(?:INR|Rs\.?|₹)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i,
    /\b([0-9]+(?:,[0-9]{3})*\.[0-9]{2})\b/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) {
      return roundMoney(m[1].replace(/,/g, ''));
    }
  }
  return null;
}

/**
 * Parse a single pasted bank narration line into a txn candidate.
 */
function parseBankNarrationLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return null;
  const amount = extractAmount(raw);
  const utr = extractUtr(raw);
  const refs = extractOrderRefs(raw);
  if (amount == null && !utr) return null;
  return {
    utr,
    merchantReference: refs[0] || null,
    transactionReference: refs[0] || null,
    amount: amount != null ? amount : null,
    txnDate: parseDateLoose(raw.slice(0, 40)),
    payerName: null,
    payerUpi: null,
    statusRaw: 'success',
    rawLine: raw.slice(0, 2000),
  };
}

function parseDateLoose(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value).trim();
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  const m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    const dt = new Date(year, month, day);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return null;
}

/**
 * Split PDF / plain text into candidate transaction lines and parse.
 */
function parseStatementText(rawText) {
  const text = String(rawText || '');
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 8);

  const rows = [];
  for (const line of lines) {
    const parsed = parseBankNarrationLine(line);
    if (!parsed || parsed.amount == null || parsed.amount <= 0) continue;
    rows.push(parsed);
  }
  return dedupeRows(rows);
}

/**
 * Parse array of objects from CSV/XLS (header-normalized keys).
 */
function parseTabularRows(objects) {
  const rows = [];
  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;
    const map = {};
    for (const [k, v] of Object.entries(obj)) {
      map[String(k).trim().toLowerCase().replace(/\s+/g, '_')] = v;
    }
    const amountRaw =
      map.amount ??
      map.txn_amount ??
      map.transaction_amount ??
      map.credit ??
      map.paid_amount ??
      map.credit_amount;
    if (amountRaw == null || amountRaw === '') continue;
    const amount = roundMoney(String(amountRaw).replace(/,/g, '').replace(/[₹rs\.]/gi, ''));
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const utr = normalizeRef(
      map.utr ??
        map.utr_number ??
        map.upi_ref ??
        map.upi_transaction_id ??
        map.rrn ??
        map.bank_rrn,
    );
    const merchantReference = normalizeRef(
      map.merchant_reference ??
        map.merchant_ref ??
        map.order_id ??
        map.transaction_note ??
        map.remarks ??
        map.tr ??
        map.reference,
    );
    const transactionReference = normalizeRef(
      map.transaction_reference ??
        map.txn_ref ??
        map.transaction_id ??
        merchantReference,
    );
    const txnDate = parseDateLoose(
      map.date ??
        map.txn_date ??
        map.transaction_date ??
        map.payment_date ??
        map.time,
    );
    const statusRaw = String(
      map.status ?? map.txn_status ?? map.payment_status ?? 'success',
    ).toLowerCase();

    rows.push({
      utr,
      merchantReference,
      transactionReference,
      amount,
      txnDate,
      payerName: map.payer_name ?? map.customer_name ?? map.name ?? null,
      payerUpi: map.payer_upi ?? map.upi_id ?? map.vpa ?? null,
      statusRaw,
      rawLine: JSON.stringify(obj).slice(0, 2000),
    });
  }
  return dedupeRows(rows);
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const key = `${r.utr || ''}|${r.merchantReference || ''}|${r.amount}|${
      r.txnDate ? new Date(r.txnDate).toISOString().slice(0, 10) : ''
    }|${(r.rawLine || '').slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

module.exports = {
  parseStatementText,
  parseTabularRows,
  parseBankNarrationLine,
  extractOrderRefs,
  extractUtr,
  extractAmount,
  normalizeRef,
  roundMoney,
};
