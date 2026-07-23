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

function looksLikePaymentNarration(text) {
  if (!text) return false;
  const s = String(text).trim();
  if (s.length < 10) return false;
  const compact = s.replace(/[^A-Z0-9]/gi, '');
  const hasAmount = /(?:INR|Rs\.?|₹|\bCR\b|\bDR\b)/i.test(s) || /\b\d+(?:,\d{3})*(?:\.\d{1,2})\b/.test(s) || /\b\d+\.\d{2}\b/.test(compact);
  const hasIdentifier = /\b(?:UPI|UTR|REF|REFNO|ORDER|SO\d|FM\d|CR|DR|NEFT|IMPS|RTGS|HDFC|IFSC)\b/i.test(s) || /\b(?:SO|FM)\d{4,}\b/i.test(s) || /(SO|FM)\d{4,}/i.test(compact);
  const hasCommonNoise = /\b(balance|closing balance|opening balance|interest|charges|tax|service|statement|txn|credit|debit)\b/i.test(s);
  if (hasCommonNoise && !hasIdentifier) return false;
  return hasAmount && (hasIdentifier || /\b(?:UPI|CR|DR|NEFT|IMPS|RTGS)\//.test(s));
}

/** Extract SO… / FM… / order-like tokens from free text */
function extractOrderRefs(text) {
  if (!text) return [];
  const found = new Set();
  const re = /\b(SO[-\s]?\d{4,}|FM[-\s]?\d{4,}|SO-\d+|FM-\d+|SO|FM)\b/gi;
  let m;
  while ((m = re.exec(String(text))) !== null) {
    found.add(m[1].replace(/\s+/g, '').toUpperCase());
  }
  const compact = String(text).replace(/[^A-Z0-9]/gi, '');
  const compactMatches = compact.match(/(SO\d{4,}|FM\d{4,})/gi) || [];
  for (const match of compactMatches) {
    found.add(String(match).toUpperCase());
  }
  return [...found];
}

function extractPayerName(text) {
  if (!text) return null;
  const s = String(text).trim();
  const direct = s.match(/UPI\/(?:CR|DR)\/[0-9]{8,22}\/?([^/\n]+)/i);
  if (direct?.[1]) {
    return direct[1].replace(/\s+/g, ' ').trim();
  }
  const fallback = s.match(/(?:^|\s)([A-Z][A-Z .'-]{2,})(?:\s+\d{2}\/)/i);
  if (fallback?.[1]) {
    return fallback[1].replace(/\s+/g, ' ').trim();
  }
  return null;
}
function extractNarrationTokens(text) {
  if (!text) return [];
  const s = String(text)
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = s
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  return tokens;
}

function extractIfsc(text) {
  if (!text) return null;
  const match = String(text).match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/i);
  return match?.[1]?.toUpperCase() || null;
}

function extractNeftReference(text) {
  if (!text) return null;
  const match = String(text).match(/(?:NEFT|IMPS|RTGS)[^\n]*?([A-Z0-9]{6,20})/i);
  return match?.[1]?.toUpperCase() || null;
}

function extractTerminal(text) {
  if (!text) return null;
  const match = String(text).match(/AT\s*([A-Z0-9-]{2,10})/i);
  return match?.[1]?.toUpperCase() || null;
}

function extractLocation(text) {
  if (!text) return null;
  let s = String(text);
  s = s.replace(/--.*$/, '').trim();
  const match = s.match(/\b([A-Z][A-Z\s(\)\-]{2,80})\b$/i);
  return match?.[1]?.trim() || null;
}
/**
 * Extract UTR from bank / UPI narration.
 * Common SBI-style: UPI/CR/696846634477/PayerName/...
 */
function extractUtr(text) {
  if (!text) return null;
  const patterns = [
    /\bNEFT\*[^*]*\*([A-Z0-9]{8,20})\*/i,
    /\b([A-Z]{4}\d{10,14})\b/i,
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
  const normalized = raw.replace(/\s+/g, ' ');
  if (!looksLikePaymentNarration(normalized)) return null;
  const amount = extractAmount(normalized);
  const utr = extractUtr(normalized);
  const refs = extractOrderRefs(normalized);
  const payerName = extractPayerName(normalized);
  const ifsc = extractIfsc(normalized);
  const neftRef = extractNeftReference(normalized);
  const terminal = extractTerminal(normalized);
  const location = extractLocation(normalized);
  const hasIdentifier = Boolean(utr || refs.length || payerName || ifsc || neftRef || terminal || location);
  if (amount == null && !hasIdentifier) return null;
  return {
    utr: utr || neftRef || null,
    merchantReference: refs[0] || null,
    transactionReference: refs[0] || neftRef || null,
    amount: amount != null ? amount : null,
    txnDate: parseDateLoose(raw.slice(0, 40)),
    payerName: payerName || null,
    payerUpi: null,
    statusRaw: 'success',
    rawLine: normalized.slice(0, 2000),
    ifsc,
    terminal,
    location,
    narrationTokens: extractNarrationTokens(normalized),
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
  const blocks = text
    .split(/\n(?=\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 20);

  const rows = [];
  for (const block of blocks) {
    const parsed = parseBankNarrationLine(block);
    if (!parsed) continue;
    if (parsed.amount != null && parsed.amount <= 0) continue;
    if (!parsed.utr && !parsed.merchantReference && !parsed.transactionReference) continue;
    rows.push(parsed);
  }

  if (!rows.length) {
    const segments = text
      .split(/(?=\bUPI\/(?:CR|DR)\/)/gi)
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter((s) => s.length > 12);
    for (const segment of segments) {
      const parsed = parseBankNarrationLine(segment);
      if (!parsed) continue;
      if (parsed.amount != null && parsed.amount <= 0) continue;
      if (!parsed.utr && !parsed.merchantReference && !parsed.transactionReference) continue;
      rows.push(parsed);
    }
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
    
    const details = String(map.details || map.transaction_details || map.description || '').trim();
    
    let amountRaw = map.credit ?? map.debit ?? map.amount ?? map.txn_amount ?? map.transaction_amount ?? map.paid_amount ?? map.credit_amount;
    if (amountRaw == null || amountRaw === '') continue;
    const amount = roundMoney(String(amountRaw).replace(/,/g, '').replace(/[₹rs\.]/gi, ''));
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const refNo = normalizeRef(
      map.ref_no ??
        map.reference_no ??
        map.cheque_no ??
        map.utr ??
        map.utr_number ??
        map.upi_ref,
    );
    const utr = refNo || extractUtr(details);
    const refs = extractOrderRefs(details);
    const payerName = extractPayerName(details);
    const ifsc = extractIfsc(details);
    const neftRef = extractNeftReference(details);
    const terminal = extractTerminal(details);
    const location = extractLocation(details);
    
    const merchantReference = normalizeRef(
      refs[0] ??
        map.merchant_reference ??
        map.merchant_ref ??
        map.order_id ??
        map.transaction_note ??
        map.remarks ??
        map.tr,
    );
    const transactionReference = normalizeRef(
      refs[0] ??
        map.transaction_reference ??
        map.txn_ref ??
        map.transaction_id ??
        merchantReference,
    );
    
    const txnDate = parseDateLoose(
      map.value_date ??
        map.post_date ??
        map.date ??
        map.txn_date ??
        map.transaction_date ??
        map.payment_date ??
        map.time,
    );
    const statusRaw = String(
      map.status ?? map.txn_status ?? map.payment_status ?? 'success',
    ).toLowerCase();

    const balance = map.balance ? roundMoney(String(map.balance).replace(/,/g, '')) : null;

    rows.push({
      utr: utr || neftRef || null,
      merchantReference: merchantReference || null,
      transactionReference: transactionReference || null,
      amount,
      txnDate,
      payerName: payerName || null,
      payerUpi: map.payer_upi ?? map.upi_id ?? map.vpa ?? null,
      statusRaw,
      rawLine: details.slice(0, 2000),
      ifsc,
      terminal,
      location,
      balance,
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
