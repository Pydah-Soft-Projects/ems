'use strict';

/**
 * Parse merchant statement text / tabular rows into normalized txn objects.
 * Supports SBI and Canara account statement PDFs; CSV/XLS and pasted lines too.
 */

function roundMoney(n) {
  if (n == null || n === '') return null;
  const v = Math.round(Number(n) * 100) / 100;
  return Number.isFinite(v) ? v : null;
}

function normalizeRef(value) {
  if (value == null) return null;
  const s = String(value).trim().toUpperCase();
  return s || null;
}

function parseDateLoose(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value).trim();
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(s)) return iso;

  const dmy = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10) - 1;
    let year = parseInt(dmy[3], 10);
    if (year < 100) year += 2000;
    const hour = dmy[4] != null ? parseInt(dmy[4], 10) : 0;
    const min = dmy[5] != null ? parseInt(dmy[5], 10) : 0;
    const sec = dmy[6] != null ? parseInt(dmy[6], 10) : 0;
    const dt = new Date(year, month, day, hour, min, sec);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const mon = s.match(
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i,
  );
  if (mon) {
    const months = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const dt = new Date(
      parseInt(mon[3], 10),
      months[mon[2].slice(0, 3).toLowerCase()],
      parseInt(mon[1], 10),
    );
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  return null;
}

/** EMS order refs only — avoid false positives like bare "SO" + bank internal ref */
function extractOrderRefs(text) {
  if (!text) return [];
  const found = new Set();
  const patterns = [
    /\b(SO20\d{2}\d{6,})\b/gi,
    /\b(FM20\d{2}\d{6,})\b/gi,
    /\b(SO[-\s]?20\d{2}[-\s]?\d{4,})\b/gi,
    // E018 (base36 short) and longer notes like E0131802 — must include a digit
    /\b(E\d[0-9A-Z]{2,11})\b/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(String(text))) !== null) {
      found.add(m[1].replace(/[\s-]/g, '').toUpperCase());
    }
  }
  return [...found];
}

/** Strip Indian/Western thousand separators from money tokens */
function parseMoneyToken(token) {
  if (token == null || token === '') return null;
  return roundMoney(String(token).replace(/,/g, ''));
}

function detectStatementBank(rawText) {
  const text = String(rawText || '');
  if (
    /Canara Bank/i.test(text) ||
    /\bIFSC Code\s*CNRB/i.test(text) ||
    (/\bCNRB\d{7}\b/i.test(text) &&
      /Current & Saving Account Statement/i.test(text))
  ) {
    return 'canara';
  }
  if (/State Bank of India/i.test(text) || /\bSBIN\d{7}\b/i.test(text)) {
    return 'sbi';
  }
  return 'unknown';
}

function parseAmountColumns(text) {
  const s = String(text).trim();
  // Prefer Western SBI shapes first (debit/credit dash columns)
  let m = s.match(
    /-\s*-\s*([0-9]+(?:,[0-9]{3})*\.[0-9]{2})\s+([0-9]+(?:,[0-9]{3})*\.[0-9]{2})\s*(?:CR|DR)?\s*$/i,
  );
  if (m) {
    const creditAmount = parseMoneyToken(m[1]);
    return {
      debitAmount: null,
      creditAmount,
      runningBalance: parseMoneyToken(m[2]),
      txnDirection: 'credit',
      amount: creditAmount,
    };
  }
  m = s.match(
    /--\s*([0-9]+(?:,[0-9]{3})*\.[0-9]{2})\s+([0-9]+(?:,[0-9]{3})*\.[0-9]{2})\s*(?:CR|DR)?\s*$/i,
  );
  if (m) {
    const creditAmount = parseMoneyToken(m[1]);
    return {
      debitAmount: null,
      creditAmount,
      runningBalance: parseMoneyToken(m[2]),
      txnDirection: 'credit',
      amount: creditAmount,
    };
  }
  m = s.match(
    /-\s*([0-9]+(?:,[0-9]{3})*\.[0-9]{2})\s*-\s*([0-9]+(?:,[0-9]{3})*\.[0-9]{2})\s*(?:CR|DR)?\s*$/i,
  );
  if (m) {
    const debitAmount = parseMoneyToken(m[1]);
    return {
      debitAmount,
      creditAmount: null,
      runningBalance: parseMoneyToken(m[2]),
      txnDirection: 'debit',
      amount: debitAmount,
    };
  }
  return null;
}

/**
 * Canara trailing columns: BranchCode [Debit] Credit Balance
 * Amounts may use Indian grouping (2,70,510.00).
 */
function parseCanaraTrailingAmounts(text) {
  const s = String(text || '').trim();
  const three = s.match(
    /\b(\d{1,5})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/,
  );
  if (three) {
    const debitAmount = parseMoneyToken(three[2]);
    const creditAmount = parseMoneyToken(three[3]);
    return {
      branchCode: three[1],
      debitAmount,
      creditAmount,
      runningBalance: parseMoneyToken(three[4]),
      txnDirection: creditAmount != null && creditAmount > 0 ? 'credit' : 'debit',
      amount: creditAmount != null && creditAmount > 0 ? creditAmount : debitAmount,
    };
  }
  const two = s.match(/\b(\d{1,5})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/);
  if (two) {
    const creditAmount = parseMoneyToken(two[2]);
    return {
      branchCode: two[1],
      debitAmount: null,
      creditAmount,
      runningBalance: parseMoneyToken(two[3]),
      txnDirection: 'credit',
      amount: creditAmount,
    };
  }
  return null;
}

function repairBrokenUpiNarration(text) {
  return String(text || '')
    .replace(/\/([A-Z]{1,3})\s+IN\//gi, '/$1IN/')
    .replace(/\/([A-Z]{1,4})\s+(\d{6,15})\//gi, '/$1/$2/')
    // Canara PDF wraps mid-path: ".../KOTE PRUD/\nCNRB/**37772@..."
    .replace(/\/\s+([A-Z]{4})\//gi, '/$1/')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPaymentNote(note) {
  if (!note) return null;
  let s = String(note).trim();
  // Canara UPI notes sit before the PSP id: E0131802//AXL...
  s = s.split('//')[0].trim();
  s = s.split(/\s+\d{13}\s+AT\s+/i)[0].trim();
  s = s.split(/\s+(?:DEP TFR|WDL TFR|CEMTEX DEP)\b/i)[0].trim();
  s = s.split(/\s+\d{2}\/\d{2}\/\d{4}\b/)[0].trim();
  s = s.split(/\s+-\s+-?\s*[0-9]/)[0].trim();
  // Drop trailing path fragments left from wrap/repair
  s = s.replace(/\/+$/, '').trim();
  if (!s) return null;
  const token = s.split(/\s+/)[0];
  return token.slice(0, 100) || null;
}

function parseUpiNarration(rawNarration, fallbackDirection) {
  const flat = repairBrokenUpiNarration(rawNarration);
  const trimmed = flat.replace(/\s+\d{13}\s+AT\s+[\s\S]*$/i, '').trim();
  const match = trimmed.match(
    /\bUPI\/(CR|DR|DRC)\/([0-9]{10,22})(?:\/([^/]*))?(?:\/([^/]*))?(?:\/([^/]*))?(?:\/(.*))?/i,
  );
  if (!match) return null;

  const rail = `UPI/${match[1].toUpperCase()}`;
  const utr = match[2];
  const name = (match[3] || '').trim() || null;
  const bankCode = (match[4] || '').trim().toUpperCase() || null;
  const vpaOrMobile = (match[5] || '').trim() || null;
  const note = cleanPaymentNote((match[6] || '').trim() || null);

  let txnDirection = fallbackDirection;
  if (match[1].toUpperCase() === 'CR' || match[1].toUpperCase() === 'DRC') {
    txnDirection = 'credit';
  } else if (match[1].toUpperCase() === 'DR') {
    txnDirection = 'debit';
  }

  const isCredit = txnDirection === 'credit';

  return {
    paymentMethod: 'UPI',
    paymentRail: rail,
    txnDirection,
    utr,
    payerName: isCredit ? name : null,
    payeeName: isCredit ? null : name,
    payerBankCode: bankCode,
    payerUpi: vpaOrMobile,
    paymentNote: note,
  };
}

function parseNeftNarration(rawNarration) {
  const flat = String(rawNarration || '').replace(/\s+/g, ' ').trim();
  const match = flat.match(/\bNEFT\*([^*]+)\*([^*]+)\*(.+?)(?:\s+\d{13}\s+AT|\s*$)/i);
  if (!match) return null;

  return {
    paymentMethod: 'NEFT',
    paymentRail: 'NEFT',
    txnDirection: 'credit',
    ifsc: match[1].trim().toUpperCase(),
    utr: match[2].trim().toUpperCase(),
    payerName: match[3].trim() || null,
    payeeName: null,
    payerBankCode: match[1].trim().slice(0, 4).toUpperCase(),
    payerUpi: null,
    paymentNote: null,
  };
}

function parseImpsNarration(rawNarration) {
  const flat = String(rawNarration || '').replace(/\s+/g, ' ').trim();
  if (!/\bIMPS\b/i.test(flat)) return null;
  const utr = flat.match(/\bIMPS[^A-Z0-9]*([A-Z0-9]{8,20})\b/i)?.[1]?.toUpperCase();
  if (!utr) return null;
  return {
    paymentMethod: 'IMPS',
    paymentRail: 'IMPS',
    txnDirection: flat.includes('/DR/') ? 'debit' : 'credit',
    utr,
    payerName: null,
    payeeName: null,
    payerBankCode: null,
    payerUpi: null,
    paymentNote: null,
    ifsc: extractIfsc(flat),
  };
}

function extractIfsc(text) {
  if (!text) return null;
  const match = String(text).match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/i);
  return match?.[1]?.toUpperCase() || null;
}

function extractInternalBankRef(text) {
  const match = String(text).match(/\b(\d{13})\s+AT\s+(\d{4,5})\b/i);
  if (!match) return { internalBankRef: null, terminal: null };
  return {
    internalBankRef: match[1],
    terminal: match[2],
  };
}

function extractBranchLocation(text) {
  const match = String(text).match(
    /\b([A-Z][A-Z0-9\s(\)\-/]{2,80})\s+-\s*(?:[0-9]|$)/,
  );
  if (match) return match[1].replace(/\s+/g, ' ').trim();
  const loc = String(text).match(
    /AT\s+\d{4,5}\s+([A-Z][A-Z0-9\s(\)\-/]{2,80}?)(?:\s+-|\s+\d|\s*$)/i,
  );
  return loc?.[1]?.replace(/\s+/g, ' ').trim() || null;
}

function isNoiseBlock(block) {
  const s = String(block || '');
  if (/Account Summary|CIF Number|STATEMENT OF ACCOUNT|Page no\.|Statement Summary|Please do not share your ATM/i.test(s)) {
    return true;
  }
  if (!/\b(?:UPI\/|NEFT\*|IMPS\b)/i.test(s) && !parseAmountColumns(s)) {
    return true;
  }
  return false;
}

function inferTxnDirectionFromType(txnType) {
  const t = String(txnType || '').toUpperCase();
  if (t.includes('DEP') || t.includes('CEMTEX')) return 'credit';
  if (t.includes('WDL')) return 'debit';
  return null;
}

function parseSbiTransactionBlock(block, header = {}) {
  const normalized = String(block || '').replace(/\s+/g, ' ').trim();
  if (!normalized || isNoiseBlock(normalized)) return null;

  const headerMatch = normalized.match(
    /^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+((?:WDL TFR|DEP TFR|CEMTEX DEP|ATM WDL|POS|CHQ|TRF)[A-Z\s]*?)(?=\s*(?:UPI\/|NEFT\*|IMPS\b))/i,
  );
  // If that didn't match (no UPI/NEFT/IMPS), fall back to original
  const headerMatchFallback = !headerMatch ? normalized.match(
    /^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+((?:WDL TFR|DEP TFR|CEMTEX DEP|ATM WDL|POS|CHQ|TRF)[A-Z\s]*)/i,
  ) : null;
  const actualMatch = headerMatch || headerMatchFallback;
  if (!actualMatch) return null;

  const postDate = parseDateLoose(actualMatch[1]);
  const valueDate = parseDateLoose(actualMatch[2]);
  const txnType = actualMatch[3].trim().toUpperCase();

  const amounts = parseAmountColumns(normalized);
  if (!amounts || amounts.amount == null || amounts.amount <= 0) return null;

  const { internalBankRef, terminal } = extractInternalBankRef(normalized);
  const branchLocation = extractBranchLocation(normalized);

  let narrationStart = normalized;
  // Try to remove dates + txn type, stopping at UPI/NEFT/IMPS
  const tempMatch = narrationStart.match(
    /^\d{2}\/\d{2}\/\d{4}\s+\d{2}\/\d{2}\/\d{4}\s+(.*?)(?=\s*(?:UPI\/|NEFT\*|IMPS\b))/i,
  );
  if (tempMatch) {
    narrationStart = narrationStart.replace(tempMatch[0], '');
  } else {
    // Fallback to original replacement if no UPI/NEFT/IMPS
    narrationStart = narrationStart.replace(/^\d{2}\/\d{2}\/\d{4}\s+\d{2}\/\d{2}\/\d{4}\s+[A-Z\s]+/i, '');
  }
  const narrationBody = repairBrokenUpiNarration(
    narrationStart
      .replace(/\b\d{13}\s+AT\s+\d{4,5}\b[\s\S]*?(?=-\s*[0-9]|$)/i, '')
      .replace(/-\s*(?:-\s*)?[0-9]+(?:,[0-9]{3})*\.[0-9]{2}[\s\S]*$/, '')
      .trim(),
  );

  const fallbackDirection =
    amounts.txnDirection || inferTxnDirectionFromType(txnType);

  const upi = parseUpiNarration(narrationBody, fallbackDirection);
  const neft = !upi ? parseNeftNarration(narrationBody) : null;
  const imps = !upi && !neft ? parseImpsNarration(narrationBody) : null;
  const payment = upi || neft || imps;

  const refs = extractOrderRefs(normalized);
  const narration = narrationBody.slice(0, 2000);

  if (!payment?.utr && !refs.length && !/\bUPI\/|NEFT\*|IMPS\b/i.test(narrationBody)) {
    return null;
  }

  return {
    postDate,
    valueDate,
    txnDate: postDate,
    txnType,
    paymentMethod: payment?.paymentMethod || null,
    paymentRail: payment?.paymentRail || null,
    txnDirection: payment?.txnDirection || amounts.txnDirection,
    utr: payment?.utr || null,
    internalBankRef,
    merchantReference: refs[0] || null,
    transactionReference: refs[0] || payment?.utr || null,
    ifsc: payment?.ifsc || extractIfsc(narrationBody),
    terminal,
    branchLocation,
    payerName: payment?.payerName || null,
    payeeName: payment?.payeeName || null,
    payerBankCode: payment?.payerBankCode || null,
    payerUpi: payment?.payerUpi || null,
    receiverBankCode: header.receiverBankCode || null,
    receiverIfsc: header.receiverIfsc || null,
    debitAmount: amounts.debitAmount,
    creditAmount: amounts.creditAmount,
    amount: amounts.amount,
    runningBalance: amounts.runningBalance,
    paymentNote: payment?.paymentNote || null,
    narration,
    rawLine: normalized.slice(0, 2000),
    statusRaw: 'success',
  };
}

function parseStatementHeader(rawText) {
  const text = String(rawText || '');
  const bank = detectStatementBank(text);
  const header = {
    bankName: null,
    branchName: null,
    branchCode: null,
    receiverIfsc: null,
    receiverBankCode: null,
    accountNumber: null,
    accountHolderName: null,
    statementFrom: null,
    statementTo: null,
    openingBalance: null,
    closingBalance: null,
    totalDebits: null,
    totalCredits: null,
    debitCount: null,
    creditCount: null,
  };

  if (bank === 'canara' || /Canara Bank/i.test(text)) {
    header.bankName = 'Canara Bank';
  } else if (/State Bank of India/i.test(text)) {
    header.bankName = 'State Bank of India';
  }

  const canaraIfsc = text.match(/\b(CNRB\d{7})\b/i);
  if (canaraIfsc) {
    header.receiverIfsc = canaraIfsc[1].toUpperCase();
    header.receiverBankCode = 'CNRB';
  }

  const ifscMatch = text.match(/\b(SBIN\d{7})\b/i);
  if (ifscMatch && !header.receiverIfsc) {
    header.receiverIfsc = ifscMatch[1].toUpperCase();
    header.receiverBankCode = 'SBIN';
  }

  const branchNameMatch =
    text.match(/Branch Name\s*:\s*([A-Z0-9\s]+?)(?:\s+Balance|\s*$)/im) ||
    text.match(/Branch Name\s+([A-Z0-9 ,]+?)(?:\n|MICR|IFSC)/i);
  if (branchNameMatch) header.branchName = branchNameMatch[1].trim();

  const branchCodeMatch = text.match(/Branch Code[\s\S]{0,40}?:\s*(\d{4,5})/i);
  if (branchCodeMatch) header.branchCode = branchCodeMatch[1];

  const acctMatch =
    text.match(/Account Number[\s\S]{0,80}?(\d{10,18})/i) ||
    text.match(/Account Number\s+(\d{10,18})/i);
  if (acctMatch) header.accountNumber = acctMatch[1];

  const welcomeMatch = text.match(/Welcome:\s*\n?\s*(Mr\.|Mrs\.|Ms\.|Dr\.)?\s*([A-Za-z .]+?)(?:\n|C\/O)/i);
  if (welcomeMatch) {
    header.accountHolderName = `${welcomeMatch[1] || ''} ${welcomeMatch[2]}`.trim();
  }

  const canaraHolder = text.match(
    /Account Holders? Name\s+([A-Z0-9 .,&'-]+?)(?:\n|Customer Id)/i,
  );
  if (canaraHolder) header.accountHolderName = canaraHolder[1].trim();

  const periodMatch = text.match(/Statement From\s*:\s*(\d{2}-\d{2}-\d{4})\s+to\s+(\d{2}-\d{2}-\d{4})/i);
  if (periodMatch) {
    header.statementFrom = parseDateLoose(periodMatch[1].replace(/-/g, '/'));
    header.statementTo = parseDateLoose(periodMatch[2].replace(/-/g, '/'));
  }

  const canaraPeriod = text.match(
    /Searched By From\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s+To\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i,
  );
  if (canaraPeriod) {
    header.statementFrom = parseDateLoose(canaraPeriod[1]);
    header.statementTo = parseDateLoose(canaraPeriod[2]);
  }

  const canaraOpen = text.match(/Opening Balance\s+Rs\.?\s*([\d,]+\.\d{2})/i);
  if (canaraOpen) header.openingBalance = parseMoneyToken(canaraOpen[1]);
  const canaraClose = text.match(/Closing Balance\s+Rs\.?\s*([\d,]+\.\d{2})/i);
  if (canaraClose) header.closingBalance = parseMoneyToken(canaraClose[1]);

  const summaryMatch = text.match(
    /Brought Forward[\s\S]*?Closing Balance[\s\S]*?([0-9,]+\.\d{2})\s*CR?\s+([0-9,]+\.\d{2})\s+([0-9,]+\.\d{2})\s+([0-9,]+\.\d{2})\s*CR?\s+(\d+)\s+(\d+)/i,
  );
  if (summaryMatch) {
    header.openingBalance = roundMoney(summaryMatch[1].replace(/,/g, ''));
    header.totalCredits = roundMoney(summaryMatch[2].replace(/,/g, ''));
    header.totalDebits = roundMoney(summaryMatch[3].replace(/,/g, ''));
    header.closingBalance = roundMoney(summaryMatch[4].replace(/,/g, ''));
    header.debitCount = parseInt(summaryMatch[5], 10);
    header.creditCount = parseInt(summaryMatch[6], 10);
  }

  return header;
}

function splitTransactionBlocks(rawText) {
  const text = String(rawText || '');
  return text
    .split(/\n(?=\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\s+\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\s+(?:WDL TFR|DEP TFR|CEMTEX DEP|ATM WDL|POS|CHQ|TRF))/i)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 25);
}

function splitCanaraTransactionBlocks(rawText) {
  const text = String(rawText || '');
  return text
    .split(/\n(?=\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2}\b)/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 40 && /\bUPI\//i.test(s));
}

function parseCanaraValueDate(text) {
  const m = String(text || '').match(
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i,
  );
  if (!m) return null;
  return parseDateLoose(`${m[1]} ${m[2]} ${m[3]}`);
}

function parseCanaraTransactionBlock(block, header = {}) {
  let normalized = repairBrokenUpiNarration(
    String(block || '').replace(/\s+/g, ' ').trim(),
  );
  // Page footers / disclaimers often glue onto the last txn of a page
  normalized = normalized
    .split(/\bDisclaimer\b/i)[0]
    .split(/\bEND OF STATEMENT\b/i)[0]
    .replace(/\bPage\s+\d+\s+of\s+\d+\b[\s\S]*$/i, '')
    .replace(/--\s*\d+\s+of\s+\d+\s*--[\s\S]*$/i, '')
    .trim();
  if (!normalized || !/\bUPI\//i.test(normalized)) {
    return null;
  }

  const headerMatch = normalized.match(
    /^(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2}:\d{2})\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s+(\d{10,22})\s+(.*)$/i,
  );
  if (!headerMatch) return null;

  const postDate = parseDateLoose(
    `${headerMatch[1].replace(/-/g, '/')} ${headerMatch[2]}`,
  );
  const valueDate = parseDateLoose(headerMatch[3]) || parseCanaraValueDate(headerMatch[3]);
  const chequeNo = headerMatch[4];
  const rest = headerMatch[5];

  const amounts = parseCanaraTrailingAmounts(rest);
  if (!amounts || amounts.amount == null || amounts.amount <= 0) return null;

  // Strip trailing branch/amount columns from narration body
  const narrationBody = repairBrokenUpiNarration(
    rest
      .replace(/\b\d{1,5}\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s*$/, '')
      .replace(/\b\d{1,5}\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s*$/, '')
      .trim(),
  );

  const upi = parseUpiNarration(narrationBody, amounts.txnDirection);
  const neft = !upi ? parseNeftNarration(narrationBody) : null;
  const imps = !upi && !neft ? parseImpsNarration(narrationBody) : null;
  const payment = upi || neft || imps;

  const refs = extractOrderRefs(normalized);
  const noteRefs = extractOrderRefs(payment?.paymentNote || '');
  const merchantReference = refs[0] || noteRefs[0] || null;
  const utr = payment?.utr || chequeNo || null;

  if (!utr && !merchantReference) return null;

  return {
    postDate,
    valueDate,
    txnDate: postDate || valueDate,
    txnType: amounts.txnDirection === 'credit' ? 'UPI CR' : 'UPI DR',
    paymentMethod: payment?.paymentMethod || 'UPI',
    paymentRail: payment?.paymentRail || null,
    txnDirection: payment?.txnDirection || amounts.txnDirection,
    utr,
    internalBankRef: chequeNo !== utr ? chequeNo : null,
    merchantReference,
    transactionReference: merchantReference || utr,
    ifsc: payment?.ifsc || extractIfsc(narrationBody) || header.receiverIfsc || null,
    terminal: amounts.branchCode || null,
    branchLocation: header.branchName || null,
    payerName: payment?.payerName || null,
    payeeName: payment?.payeeName || null,
    payerBankCode: payment?.payerBankCode || null,
    payerUpi: payment?.payerUpi || null,
    receiverBankCode: header.receiverBankCode || 'CNRB',
    receiverIfsc: header.receiverIfsc || null,
    debitAmount: amounts.debitAmount,
    creditAmount: amounts.creditAmount,
    amount: amounts.amount,
    runningBalance: amounts.runningBalance,
    paymentNote: payment?.paymentNote || merchantReference || null,
    narration: narrationBody.slice(0, 2000),
    rawLine: normalized.slice(0, 2000),
    statusRaw: 'success',
  };
}

function parseStatementText(rawText) {
  const header = parseStatementHeader(rawText);
  const bank = detectStatementBank(rawText);
  const rows = [];

  if (bank === 'canara') {
    for (const block of splitCanaraTransactionBlocks(rawText)) {
      const parsed = parseCanaraTransactionBlock(block, header);
      if (!parsed) continue;
      if (!parsed.utr && !parsed.merchantReference) continue;
      rows.push(parsed);
    }
  } else {
    for (const block of splitTransactionBlocks(rawText)) {
      const parsed = parseSbiTransactionBlock(block, header);
      if (!parsed) continue;
      if (!parsed.utr && !parsed.merchantReference) continue;
      rows.push(parsed);
    }
  }

  if (!rows.length) {
    const segments = String(rawText || '')
      .split(/(?=\bUPI\/(?:CR|DR|DRC)\/)/gi)
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter((s) => s.length > 12);
    for (const segment of segments) {
      const parsed = parseBankNarrationLine(segment, header);
      if (!parsed) continue;
      if (!parsed.utr && !parsed.merchantReference) continue;
      rows.push(parsed);
    }
  }

  return { header, rows: dedupeRows(rows) };
}

function parseBankNarrationLine(line, header = {}) {
  const raw = String(line || '').trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, ' ');

  const canaraBlock = parseCanaraTransactionBlock(normalized, header);
  if (canaraBlock) return canaraBlock;

  const sbiBlock = parseSbiTransactionBlock(normalized, header);
  if (sbiBlock) return sbiBlock;

  if (!/\b(?:UPI\/|NEFT\*|IMPS\b)/i.test(normalized)) return null;

  const amounts = parseAmountColumns(normalized) || parseCanaraTrailingAmounts(normalized);
  const upi = parseUpiNarration(normalized, amounts?.txnDirection);
  const neft = !upi ? parseNeftNarration(normalized) : null;
  const imps = !upi && !neft ? parseImpsNarration(normalized) : null;
  const payment = upi || neft || imps;
  if (!payment) return null;

  const refs = extractOrderRefs(normalized);
  const amount =
    amounts?.amount ??
    parseMoneyToken(
      normalized.match(/\b([\d,]+\.\d{2})\b/)?.[1],
    );

  if (amount != null && amount <= 0) return null;

  const { internalBankRef, terminal } = extractInternalBankRef(normalized);

  return {
    postDate: parseDateLoose(normalized.slice(0, 12)),
    valueDate: parseDateLoose(normalized.slice(0, 12)),
    txnDate: parseDateLoose(normalized.slice(0, 12)),
    txnType: null,
    paymentMethod: payment.paymentMethod,
    paymentRail: payment.paymentRail,
    txnDirection: payment.txnDirection || amounts?.txnDirection,
    utr: payment.utr,
    internalBankRef,
    merchantReference: refs[0] || null,
    transactionReference: refs[0] || payment.utr || null,
    ifsc: payment.ifsc || extractIfsc(normalized),
    terminal: terminal || amounts?.branchCode || null,
    branchLocation: extractBranchLocation(normalized),
    payerName: payment.payerName,
    payeeName: payment.payeeName,
    payerBankCode: payment.payerBankCode,
    payerUpi: payment.payerUpi,
    receiverBankCode: header.receiverBankCode || null,
    receiverIfsc: header.receiverIfsc || null,
    debitAmount: amounts?.debitAmount ?? (payment.txnDirection === 'debit' ? amount : null),
    creditAmount: amounts?.creditAmount ?? (payment.txnDirection === 'credit' ? amount : null),
    amount,
    runningBalance: amounts?.runningBalance ?? null,
    paymentNote: payment.paymentNote,
    narration: normalized.slice(0, 2000),
    rawLine: normalized.slice(0, 2000),
    statusRaw: 'success',
  };
}

function parseTabularRows(objects, header = {}) {
  const rows = [];
  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;
    const map = {};
    for (const [k, v] of Object.entries(obj)) {
      map[String(k).trim().toLowerCase().replace(/\s+/g, '_')] = v;
    }

    const details = String(
      map.details || map.transaction_details || map.description || map.narration || '',
    ).trim();

    const debitRaw = map.debit ?? map.debit_amount;
    const creditRaw = map.credit ?? map.credit_amount;
    let debitAmount = debitRaw != null && debitRaw !== '' ? roundMoney(String(debitRaw).replace(/,/g, '').replace(/[₹rs\.]/gi, '')) : null;
    let creditAmount = creditRaw != null && creditRaw !== '' ? roundMoney(String(creditRaw).replace(/,/g, '').replace(/[₹rs\.]/gi, '')) : null;

    let amountRaw = map.amount ?? map.txn_amount ?? map.transaction_amount;
    if (amountRaw != null && amountRaw !== '') {
      const parsed = roundMoney(String(amountRaw).replace(/,/g, '').replace(/[₹rs\.]/gi, ''));
      if (debitAmount == null && creditAmount == null) {
        if (map.type && /debit|dr/i.test(String(map.type))) debitAmount = parsed;
        else creditAmount = parsed;
      }
    }

    const amount = creditAmount ?? debitAmount;
    if (amount == null || amount <= 0) continue;

    const postDate = parseDateLoose(map.post_date ?? map.date ?? map.txn_date);
    const valueDate = parseDateLoose(map.value_date ?? map.post_date ?? map.date);

    const parsedLine = parseBankNarrationLine(details || JSON.stringify(map), header);
    const utr =
      normalizeRef(map.utr ?? map.utr_number ?? map.upi_ref ?? map.ref_no) ||
      parsedLine?.utr;
    const refs = extractOrderRefs(details);

    rows.push({
      postDate,
      valueDate,
      txnDate: postDate || valueDate,
      txnType: map.txn_type ?? map.type ?? parsedLine?.txnType ?? null,
      paymentMethod: parsedLine?.paymentMethod ?? (details.includes('UPI') ? 'UPI' : null),
      paymentRail: parsedLine?.paymentRail ?? null,
      txnDirection:
        creditAmount != null ? 'credit' : debitAmount != null ? 'debit' : parsedLine?.txnDirection,
      utr,
      internalBankRef: parsedLine?.internalBankRef ?? null,
      merchantReference:
        normalizeRef(refs[0] ?? map.merchant_reference ?? map.order_id) || null,
      transactionReference:
        normalizeRef(refs[0] ?? map.transaction_reference ?? utr) || null,
      ifsc: parsedLine?.ifsc ?? extractIfsc(details),
      terminal: parsedLine?.terminal ?? null,
      branchLocation: parsedLine?.branchLocation ?? null,
      payerName: parsedLine?.payerName ?? map.payer_name ?? null,
      payeeName: parsedLine?.payeeName ?? null,
      payerBankCode: parsedLine?.payerBankCode ?? null,
      payerUpi: parsedLine?.payerUpi ?? map.payer_upi ?? map.upi_id ?? map.vpa ?? null,
      receiverBankCode: header.receiverBankCode ?? null,
      receiverIfsc: header.receiverIfsc ?? null,
      debitAmount,
      creditAmount,
      amount,
      runningBalance: map.balance
        ? roundMoney(String(map.balance).replace(/,/g, ''))
        : parsedLine?.runningBalance,
      paymentNote: parsedLine?.paymentNote ?? map.remarks ?? null,
      narration: details.slice(0, 2000),
      rawLine: details.slice(0, 2000),
      statusRaw: String(map.status ?? 'success').toLowerCase(),
    });
  }
  return dedupeRows(rows);
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const key = `${r.utr || ''}|${r.txnDirection || ''}|${r.amount}|${
      r.postDate ? new Date(r.postDate).toISOString().slice(0, 10) : ''
    }|${(r.rawLine || '').slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** @deprecated use parseAmountColumns — kept for tests */
function extractAmount(text) {
  return parseAmountColumns(text)?.amount ?? null;
}

/** @deprecated */
function extractUtr(text) {
  return (
    parseUpiNarration(text)?.utr ||
    parseNeftNarration(text)?.utr ||
    null
  );
}

module.exports = {
  parseStatementText,
  parseStatementHeader,
  parseTabularRows,
  parseBankNarrationLine,
  parseSbiTransactionBlock,
  parseCanaraTransactionBlock,
  parseAmountColumns,
  parseCanaraTrailingAmounts,
  detectStatementBank,
  extractOrderRefs,
  extractUtr,
  extractAmount,
  normalizeRef,
  roundMoney,
};
