'use strict';

const QRCode = require('qrcode');
const {
  FeeStatus,
  PaymentMode,
  PaymentMethod,
  PaymentStatus,
} = require('./schemas/exam.enums');
const { AppError } = require('../common/errors');
const {
  parseStatementText,
  parseTabularRows,
  parseBankNarrationLine,
  normalizeRef,
  roundMoney,
  extractUtr,
} = require('./self-online-statement-parse');
const { operationLogger } = require('../common/logger');

const log = operationLogger('self-online');

const OPEN_STATUSES = [
  PaymentStatus.PENDING,
  PaymentStatus.AWAITING_VERIFICATION,
];

function strOrNull(value, maxLen) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!s) return null;
  return maxLen ? s.slice(0, maxLen) : s;
}

function moneyOrNull(value) {
  if (value == null || value === '') return null;
  const n = roundMoney(value);
  return Number.isFinite(n) ? n : null;
}

class SelfOnlineService {
  constructor(
    paymentRepo,
    feeRecordRepo,
    statementRepo,
    statementTxnRepo,
    settings,
    examService,
  ) {
    this.paymentRepo = paymentRepo;
    this.feeRecordRepo = feeRecordRepo;
    this.statementRepo = statementRepo;
    this.statementTxnRepo = statementTxnRepo;
    this.settings = settings;
    this.exam = examService;
  }

  async buildOrderRef(paymentId) {
    // Generate a 3-character unique ID using the payment's auto-increment ID
    // Payment ID is unique, so this will never have duplicates!
    // Convert to base36 (0-9, A-Z) for short ID, pad to 3 chars
    const shortId = paymentId.toString(36).toUpperCase().padStart(3, '0');
    return `E${shortId}`;
  }

  buildUpiDeepLink({ upiId, merchantName, amount, orderRef }) {
    // Only put order ref in tn (payment note) for maximum visibility
    const params = new URLSearchParams({
      pa: upiId,
      pn: merchantName,
      am: roundMoney(amount).toFixed(2),
      cu: 'INR',
      tn: orderRef,
      tr: orderRef,
    });
    return `upi://pay?${params.toString()}`;
  }

  async assertFeeActor(feeRecord, actor) {
    if (actor?.role === 'student') {
      const pin = String(actor.pinNo ?? '').toLowerCase();
      if (feeRecord.studentRollNumber.toLowerCase() !== pin) {
        throw AppError.forbidden('This fee does not belong to your account');
      }
    }
  }

  isSelfOnlinePayment(payment) {
    return payment.paymentMode === PaymentMode.SELF_ONLINE;
  }

  buildStatementFromHeader(header = {}) {
    return {
      bankName: strOrNull(header.bankName, 100),
      branchName: strOrNull(header.branchName, 150),
      branchCode: strOrNull(header.branchCode, 20),
      receiverIfsc: strOrNull(header.receiverIfsc, 20),
      accountNumber: strOrNull(header.accountNumber, 30),
      accountHolderName: strOrNull(header.accountHolderName, 150),
      statementFrom: header.statementFrom || null,
      statementTo: header.statementTo || null,
      openingBalance: moneyOrNull(header.openingBalance),
      closingBalance: moneyOrNull(header.closingBalance),
      totalDebits: moneyOrNull(header.totalDebits),
      totalCredits: moneyOrNull(header.totalCredits),
      debitCount: header.debitCount ?? null,
      creditCount: header.creditCount ?? null,
    };
  }

  buildTxnFromParsedRow(statementId, row) {
    return {
      statementId,
      postDate: row.postDate || row.txnDate || null,
      valueDate: row.valueDate || row.postDate || row.txnDate || null,
      txnDate: row.postDate || row.txnDate || null,
      txnType: strOrNull(row.txnType, 30),
      paymentMethod: strOrNull(row.paymentMethod, 20),
      paymentRail: strOrNull(row.paymentRail, 20),
      txnDirection: strOrNull(row.txnDirection, 10),
      utr: strOrNull(row.utr, 100),
      internalBankRef: strOrNull(row.internalBankRef, 30),
      merchantReference: strOrNull(row.merchantReference, 100),
      transactionReference: strOrNull(row.transactionReference, 100),
      ifsc: strOrNull(row.ifsc, 20),
      terminal: strOrNull(row.terminal, 20),
      branchLocation: strOrNull(row.branchLocation, 150),
      payerName: strOrNull(row.payerName, 150),
      payeeName: strOrNull(row.payeeName, 150),
      payerBankCode: strOrNull(row.payerBankCode, 20),
      payerUpi: strOrNull(row.payerUpi, 150),
      receiverBankCode: strOrNull(row.receiverBankCode, 20),
      receiverIfsc: strOrNull(row.receiverIfsc, 20),
      debitAmount: moneyOrNull(row.debitAmount),
      creditAmount: moneyOrNull(row.creditAmount),
      amount: moneyOrNull(row.amount),
      runningBalance: moneyOrNull(row.runningBalance),
      paymentNote: strOrNull(row.paymentNote, 255),
      narration: strOrNull(row.narration || row.rawLine, 4000),
      statusRaw: row.statusRaw || 'success',
      rawLine: strOrNull(row.rawLine, 2000),
      matchStatus: 'unmatched',
    };
  }

  toStatementTxnDto(t) {
    return {
      id: t.id,
      statementId: t.statementId,
      fileName: t.statement?.fileName,
      sourceKind: t.statement?.sourceKind,
      postDate: t.postDate,
      valueDate: t.valueDate,
      txnType: t.txnType,
      paymentMethod: t.paymentMethod,
      paymentRail: t.paymentRail,
      txnDirection: t.txnDirection,
      utr: t.utr,
      internalBankRef: t.internalBankRef,
      merchantReference: t.merchantReference,
      transactionReference: t.transactionReference,
      ifsc: t.ifsc,
      terminal: t.terminal,
      branchLocation: t.branchLocation,
      payerName: t.payerName,
      payeeName: t.payeeName,
      payerBankCode: t.payerBankCode,
      payerUpi: t.payerUpi,
      receiverBankCode: t.receiverBankCode,
      receiverIfsc: t.receiverIfsc,
      debitAmount: t.debitAmount != null ? roundMoney(t.debitAmount) : null,
      creditAmount: t.creditAmount != null ? roundMoney(t.creditAmount) : null,
      amount: roundMoney(t.amount),
      runningBalance:
        t.runningBalance != null ? roundMoney(t.runningBalance) : null,
      paymentNote: t.paymentNote,
      narration: t.narration,
      txnDate: t.txnDate,
      matchStatus: t.matchStatus,
      matchedPaymentId: t.matchedPaymentId,
      matchConfidence: t.matchConfidence,
      matchReason: t.matchReason,
      rawLine: t.rawLine,
    };
  }

  async findOpenSelfOnline(feeRecordId) {
    const rows = await this.paymentRepo.find({
      where: { feeRecordId, paymentMode: PaymentMode.SELF_ONLINE },
      order: { id: 'DESC' },
    });
    return rows.find((p) => OPEN_STATUSES.includes(p.status)) || null;
  }

  async expireIfNeeded(payment, cfg) {
    if (!payment || payment.status === PaymentStatus.SUCCESS) return payment;
    if (
      payment.status !== PaymentStatus.PENDING &&
      payment.status !== PaymentStatus.AWAITING_VERIFICATION
    ) {
      return payment;
    }
    const hours = cfg?.expiryHours || 48;
    const created = new Date(payment.paidAt || Date.now()).getTime();
    const maxMs = hours * 60 * 60 * 1000;
    if (Date.now() - created <= maxMs) return payment;
    if (payment.status === PaymentStatus.AWAITING_VERIFICATION) {
      // Claimed payments stay open longer for reconciliation; do not auto-expire claims.
      return payment;
    }
    payment.status = PaymentStatus.EXPIRED;
    const gw = this.exam.parseGateway(payment.gatewayResponse) ?? {};
    payment.gatewayResponse = JSON.stringify({
      ...gw,
      event: 'expired',
      expiredAt: new Date().toISOString(),
    });
    return this.paymentRepo.save(payment);
  }

  async createOrder(feeRecordId, opts = {}) {
    const cfg = await this.settings.getSelfOnlineConfig();
    const feeRecord = await this.exam.getFeeRecord(feeRecordId);
    await this.assertFeeActor(feeRecord, opts.actor);

    if (feeRecord.status === FeeStatus.PAID) {
      throw AppError.badRequest('Fee already paid');
    }

    await this.exam.refreshLateFee(feeRecord);

    let existing = await this.findOpenSelfOnline(feeRecordId);
    if (existing) {
      existing = await this.expireIfNeeded(existing, cfg);
      if (OPEN_STATUSES.includes(existing.status)) {
        return this.toOrderResponse(existing, feeRecord, cfg);
      }
    }

    // Fail other open non-self-online attempts so only one path is active
    const open = await this.paymentRepo.find({ where: { feeRecordId } });
    for (const p of open) {
      if (
        p.paymentMode !== PaymentMode.SELF_ONLINE &&
        (p.status === PaymentStatus.PENDING ||
          p.status === PaymentStatus.PROCESSING)
      ) {
        p.status = PaymentStatus.FAILED;
        const gw = this.exam.parseGateway(p.gatewayResponse) ?? {};
        p.gatewayResponse = JSON.stringify({ ...gw, event: 'superseded_by_self_online' });
        await this.paymentRepo.save(p);
      }
    }

    const amount = roundMoney(feeRecord.totalAmount);
    if (amount < 1) {
      throw AppError.badRequest('Amount must be at least ₹1.00');
    }

    const payment = await this.paymentRepo.save(
      this.paymentRepo.create({
        feeRecordId,
        amountPaid: amount,
        paymentMode: PaymentMode.SELF_ONLINE,
        paymentMethod: PaymentMethod.UPI,
        status: PaymentStatus.PENDING,
        receiptNumber: `TMP-SO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        transactionReference: null,
        collectedBy: opts.actor?.fullName || opts.actor?.username || null,
        collectorUsername:
          opts.actor?.role === 'student' ? null : opts.actor?.username || null,
        remarks: null,
        gatewayResponse: JSON.stringify({
          provider: 'self_online',
          event: 'order_created',
          temporary: true,
          audit: [
            {
              event: 'transaction_created',
              at: new Date().toISOString(),
              by: opts.actor?.username || opts.actor?.pinNo || 'student',
            },
          ],
        }),
      }),
    );

    const orderRef = await this.buildOrderRef(payment.id);
    payment.transactionReference = orderRef;
    const upiUrl = this.buildUpiDeepLink({
      upiId: cfg.upiId,
      merchantName: cfg.merchantName,
      amount,
      orderRef,
    });
    const qrDataUrl = await QRCode.toDataURL(upiUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
    });

    const gw = this.exam.parseGateway(payment.gatewayResponse) ?? {};
    payment.gatewayResponse = JSON.stringify({
      ...gw,
      orderRef,
      upiUrl,
      merchantUpiId: cfg.upiId,
      merchantName: cfg.merchantName,
      event: 'qr_generated',
      audit: [
        ...(gw.audit || []),
        { event: 'qr_generated', at: new Date().toISOString() },
      ],
    });
    await this.paymentRepo.save(payment);

    log.info(
      {
        event: 'self_online.order_created',
        paymentId: payment.id,
        feeRecordId,
        orderRef,
      },
      'Self Online order created (EMS only; Fee Mgmt deferred)',
    );

    // Attach qr for this response (not persisted as huge string forever — regenerable)
    return this.toOrderResponse(payment, feeRecord, cfg, { upiUrl, qrDataUrl });
  }

  async toOrderResponse(payment, feeRecord, cfg, extra = {}) {
    const gw = this.exam.parseGateway(payment.gatewayResponse) ?? {};
    const orderRef = payment.transactionReference || gw.orderRef;
    const amount = roundMoney(payment.amountPaid);
    const upiUrl =
      extra.upiUrl ||
      gw.upiUrl ||
      this.buildUpiDeepLink({
        upiId: cfg.upiId,
        merchantName: cfg.merchantName,
        amount,
        orderRef,
      });
    const qrDataUrl =
      extra.qrDataUrl ||
      (await QRCode.toDataURL(upiUrl, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 320,
      }));

    return {
      paymentId: payment.id,
      feeRecordId: payment.feeRecordId,
      orderRef,
      amount,
      currency: 'INR',
      status: payment.status,
      receiptNumber: payment.receiptNumber,
      temporary: payment.status !== PaymentStatus.SUCCESS,
      merchantUpiId: cfg.upiId,
      merchantName: cfg.merchantName,
      paymentNote: cfg.paymentNote,
      upiUrl,
      qrDataUrl,
      expiresInHours: cfg.expiryHours,
      studentName: feeRecord.studentName,
      studentRollNumber: feeRecord.studentRollNumber,
      examName: feeRecord.exam?.name || null,
      instructions: [
        'Scan the QR with PhonePe, Google Pay, Paytm, or any UPI app',
        'Pay the exact amount shown',
        `Payment note starts with ${orderRef} — do not edit it`,
        'After paying, tap “I have paid” (UTR optional but speeds verification)',
        'Official receipt is issued only after Accounts verifies the merchant statement',
      ],
    };
  }

  async claimPaid(paymentId, dto = {}, opts = {}) {
    const payment = await this.exam.getPayment(paymentId);
    if (!this.isSelfOnlinePayment(payment)) {
      throw AppError.badRequest('Not a Self Online payment');
    }
    const feeRecord = payment.feeRecord
      ? payment.feeRecord
      : await this.exam.getFeeRecord(payment.feeRecordId);
    await this.assertFeeActor(feeRecord, opts.actor);

    if (feeRecord.status === FeeStatus.PAID) {
      throw AppError.badRequest('Fee already paid');
    }
    if (payment.status === PaymentStatus.SUCCESS) {
      throw AppError.badRequest('Payment already verified');
    }
    if (payment.status === PaymentStatus.EXPIRED) {
      throw AppError.badRequest('This payment QR has expired. Create a new one.');
    }
    if (
      payment.status !== PaymentStatus.PENDING &&
      payment.status !== PaymentStatus.AWAITING_VERIFICATION
    ) {
      throw AppError.badRequest(`Cannot claim payment in status ${payment.status}`);
    }

    const utr = dto.utr ? String(dto.utr).trim().toUpperCase() : null;
    payment.status = PaymentStatus.AWAITING_VERIFICATION;
    if (utr) {
      // Keep order ref on transactionReference; store UTR in gateway + remarks
      payment.remarks = payment.remarks
        ? `${payment.remarks}; UTR:${utr}`
        : `Student UTR: ${utr}`;
    }
    const gw = this.exam.parseGateway(payment.gatewayResponse) ?? {};
    payment.gatewayResponse = JSON.stringify({
      ...gw,
      event: 'student_claimed_paid',
      studentUtr: utr || gw.studentUtr || null,
      claimedAt: new Date().toISOString(),
      temporary: true,
      audit: [
        ...(gw.audit || []),
        {
          event: 'student_marked_paid',
          at: new Date().toISOString(),
          utr: utr || null,
        },
      ],
    });
    await this.paymentRepo.save(payment);

    // Attempt auto-match against existing unmatched statement rows
    await this.tryAutoMatchPayment(payment.id);

    const refreshed = await this.exam.getPayment(payment.id);
    return {
      payment: this.exam.withVerificationMeta(refreshed),
      feeRecord: await this.exam.getFeeRecord(payment.feeRecordId),
      acknowledgement: {
        type: 'temporary',
        title: 'Your payment is under verification',
        status: 'awaiting_verification',
        orderRef: refreshed.transactionReference,
        amount: roundMoney(refreshed.amountPaid),
        receiptNumber: refreshed.receiptNumber,
        message:
          "Don't panic! We will update the payment status in a few hours. You can check it on your dashboard. Thank you!",
      },
    };
  }

  async listPending(opts = {}) {
    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.feeRecord', 'fr')
      .leftJoinAndSelect('fr.exam', 'exam')
      .where('p.paymentMode = :mode', { mode: PaymentMode.SELF_ONLINE })
      .andWhere('p.status IN (:...statuses)', {
        statuses: [
          PaymentStatus.PENDING,
          PaymentStatus.AWAITING_VERIFICATION,
        ],
      })
      .orderBy('p.paidAt', 'DESC')
      .take(opts.limit || 200);

    const rows = await qb.getMany();
    return rows.map((p) => {
      const gw = this.exam.parseGateway(p.gatewayResponse) ?? {};
      return {
        id: p.id,
        orderRef: p.transactionReference,
        amount: roundMoney(p.amountPaid),
        status: p.status,
        receiptNumber: p.receiptNumber,
        studentUtr: gw.studentUtr || null,
        studentName: p.feeRecord?.studentName,
        studentRollNumber: p.feeRecord?.studentRollNumber,
        examName: p.feeRecord?.exam?.name,
        feeRecordId: p.feeRecordId,
        createdAt: p.paidAt,
        claimedAt: gw.claimedAt || null,
      };
    });
  }

  async uploadStatement({
    buffer,
    fileName,
    mimeType,
    uploadedBy,
    uploadedByUsername,
    notes,
  }) {
    const name = String(fileName || 'statement').toLowerCase();
    let sourceKind = 'pdf';
    let fileFormat = 'pdf';
    let rows = [];
    let statementHeader = {};
    let excerpt = '';

    if (name.endsWith('.pdf') || mimeType === 'application/pdf') {
      sourceKind = 'pdf';
      fileFormat = 'pdf';
      let PDFParse;
      try {
        ({ PDFParse } = require('pdf-parse'));
      } catch {
        throw AppError.badRequest(
          'PDF parsing is unavailable. Install pdf-parse on the server.',
        );
      }
      const parser = new PDFParse({ data: buffer });
      try {
        const parsed = await parser.getText();
        const text =
          typeof parsed === 'string'
            ? parsed
            : String(parsed?.text || parsed || '');
        excerpt = text.slice(0, 8000);
        const result = parseStatementText(text);
        statementHeader = result.header || {};
        rows = result.rows || [];
      } finally {
        await parser.destroy?.().catch?.(() => undefined);
      }
    } else if (name.endsWith('.csv') || mimeType === 'text/csv') {
      sourceKind = 'csv';
      fileFormat = 'csv';
      const text = buffer.toString('utf8');
      excerpt = text.slice(0, 4000);
      rows = parseTabularRows(this.csvToObjects(text), statementHeader);
    } else if (
      name.endsWith('.xlsx') ||
      name.endsWith('.xls') ||
      mimeType?.includes('spreadsheet') ||
      mimeType?.includes('excel')
    ) {
      sourceKind = 'xlsx';
      fileFormat = name.endsWith('.xls') ? 'xls' : 'xlsx';
      let XLSX;
      try {
        XLSX = require('xlsx');
      } catch {
        throw AppError.badRequest(
          'Excel parsing is unavailable. Install xlsx on the server.',
        );
      }
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const objects = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      excerpt = JSON.stringify(objects.slice(0, 3)).slice(0, 4000);
      rows = parseTabularRows(objects, statementHeader);
    } else {
      throw AppError.badRequest(
        'Unsupported file. Upload a merchant statement PDF (preferred), or CSV/Excel.',
      );
    }

    if (!rows.length) {
      throw AppError.badRequest(
        'No payment rows could be parsed from the statement. Check the file format.',
      );
    }

    const statement = await this.statementRepo.save(
      this.statementRepo.create({
        fileName: fileName || `statement.${fileFormat}`,
        fileFormat,
        sourceKind,
        uploadedBy: uploadedBy || null,
        uploadedByUsername: uploadedByUsername || null,
        rawTextExcerpt: excerpt,
        rowCount: rows.length,
        notes:
          notes ||
          (sourceKind === 'pdf'
            ? null
            : 'Secondary editable format — prefer PDF for audit integrity'),
        ...this.buildStatementFromHeader(statementHeader),
      }),
    );

    const savedTxns = [];
    for (const r of rows) {
      if (/fail|refund|revers|reject/i.test(String(r.statusRaw || ''))) {
        continue;
      }
      const txn = await this.statementTxnRepo.save(
        this.statementTxnRepo.create(
          this.buildTxnFromParsedRow(statement.id, r),
        ),
      );
      savedTxns.push(txn);
    }

    statement.rowCount = savedTxns.length;
    await this.statementRepo.save(statement);

    const matchSummary = await this.runAutoMatchForStatement(statement.id);

    log.info(
      {
        event: 'self_online.statement_uploaded',
        statementId: statement.id,
        sourceKind,
        rows: savedTxns.length,
        autoVerified: matchSummary.autoVerified,
      },
      'Merchant statement uploaded',
    );

    return {
      statement: {
        id: statement.id,
        fileName: statement.fileName,
        sourceKind: statement.sourceKind,
        rowCount: statement.rowCount,
        createdAt: statement.createdAt,
        notes: statement.notes,
      },
      parsedCount: savedTxns.length,
      matchSummary,
      warning:
        sourceKind !== 'pdf'
          ? 'CSV/Excel files are editable. Prefer merchant PDF statements for verification integrity.'
          : null,
    };
  }

  csvToObjects(text) {
    const lines = String(text)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return [];
    const headers = this.splitCsvLine(lines[0]).map((h) =>
      h.replace(/^"|"$/g, '').trim(),
    );
    const objects = [];
    for (let i = 1; i < lines.length; i += 1) {
      const cols = this.splitCsvLine(lines[i]);
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = (cols[idx] || '').replace(/^"|"$/g, '').trim();
      });
      objects.push(obj);
    }
    return objects;
  }

  splitCsvLine(line) {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === ',' && !inQ) {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  async listStatements() {
    const rows = await this.statementRepo.find({
      order: { id: 'DESC' },
      take: 50,
    });
    return rows.map((s) => ({
      id: s.id,
      fileName: s.fileName,
      sourceKind: s.sourceKind,
      fileFormat: s.fileFormat,
      rowCount: s.rowCount,
      uploadedBy: s.uploadedBy,
      notes: s.notes,
      createdAt: s.createdAt,
    }));
  }

  async listStatementTxns(filters = {}) {
    const qb = this.statementTxnRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.statement', 's')
      .orderBy('t.id', 'DESC')
      .take(filters.limit || 300);
    if (filters.statementId) {
      qb.andWhere('t.statementId = :sid', { sid: filters.statementId });
    }
    if (filters.matchStatus) {
      qb.andWhere('t.matchStatus = :ms', { ms: filters.matchStatus });
    }
    const rows = await qb.getMany();
    return rows.map((t) => this.toStatementTxnDto(t));
  }

  async listSuggestedMatches() {
    const pending = await this.listPending();
    const awaiting = pending.filter(
      (p) => p.status === PaymentStatus.AWAITING_VERIFICATION,
    );
    const unmatched = await this.statementTxnRepo.find({
      where: { matchStatus: 'unmatched' },
      take: 500,
      order: { id: 'DESC' },
    });

    const suggestions = [];
    for (const pay of awaiting) {
      for (const txn of unmatched) {
        const score = this.scoreMatch(pay, txn);
        if (score.confidence === 'none') continue;
        suggestions.push({
          paymentId: pay.id,
          orderRef: pay.orderRef,
          paymentAmount: pay.amount,
          studentName: pay.studentName,
          studentRollNumber: pay.studentRollNumber,
          studentUtr: pay.studentUtr,
          merchantTxnId: txn.id,
          utr: txn.utr,
          merchantReference: txn.merchantReference,
          txnAmount: roundMoney(txn.amount),
          txnDate: txn.txnDate,
          confidence: score.confidence,
          reason: score.reason,
          autoEligible: score.autoEligible,
        });
      }
    }
    suggestions.sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return (rank[a.confidence] ?? 9) - (rank[b.confidence] ?? 9);
    });
    return suggestions.slice(0, 200);
  }

  scoreMatch(pay, txn) {
    const amountOk =
      roundMoney(pay.amount) === roundMoney(txn.amount);
    if (!amountOk) {
      return { confidence: 'none', reason: 'amount_mismatch', autoEligible: false };
    }

    const orderRef = normalizeRef(pay.orderRef);
    const refs = [
      normalizeRef(txn.merchantReference),
      normalizeRef(txn.transactionReference),
      normalizeRef(txn.rawLine),
      normalizeRef(txn.narration),
      normalizeRef(txn.paymentNote), // Also check payment note
    ].filter(Boolean);

    if (orderRef && refs.some((r) => r.includes(orderRef))) {
      return {
        confidence: 'high',
        reason: 'order_ref_match',
        autoEligible: true,
      };
    }

    const studentUtr = normalizeRef(pay.studentUtr);
    const txnUtr = normalizeRef(txn.utr);
    if (studentUtr && txnUtr && studentUtr === txnUtr) {
      return {
        confidence: 'high',
        reason: 'utr_match',
        autoEligible: true,
      };
    }

    // Amount + date window → suggest only
    if (txn.txnDate && pay.createdAt) {
      const a = new Date(txn.txnDate).getTime();
      const b = new Date(pay.createdAt).getTime();
      const day = 24 * 60 * 60 * 1000;
      if (Math.abs(a - b) <= day) {
        return {
          confidence: 'medium',
          reason: 'amount_and_date',
          autoEligible: false,
        };
      }
    }

    return {
      confidence: 'low',
      reason: 'amount_only',
      autoEligible: false,
    };
  }

  async runAutoMatchForStatement(statementId) {
    const txns = await this.statementTxnRepo.find({
      where: { statementId, matchStatus: 'unmatched' },
    });
    let autoVerified = 0;
    let suggested = 0;
    for (const txn of txns) {
      const result = await this.tryAutoMatchTxn(txn);
      if (result === 'verified') autoVerified += 1;
      else if (result === 'suggested') suggested += 1;
    }
    return { autoVerified, suggested };
  }

  async tryAutoMatchPayment(paymentId) {
    const payment = await this.exam.getPayment(paymentId);
    if (payment.status !== PaymentStatus.AWAITING_VERIFICATION) return null;
    const unmatched = await this.statementTxnRepo.find({
      where: { matchStatus: 'unmatched' },
      take: 500,
    });
    const payView = {
      id: payment.id,
      orderRef: payment.transactionReference,
      amount: roundMoney(payment.amountPaid),
      studentUtr: this.exam.parseGateway(payment.gatewayResponse)?.studentUtr,
      createdAt: payment.paidAt,
    };
    let bestSuggestion = null;
    const suggestionRank = { medium: 2, low: 1 };
    for (const txn of unmatched) {
      const score = this.scoreMatch(payView, txn);
      if (score.autoEligible) {
        await this.verifyMatch({
          paymentId: payment.id,
          merchantTxnId: txn.id,
          actor: { username: 'system', fullName: 'Auto-match' },
          auto: true,
        });
        return 'verified';
      }
      if (score.confidence === 'medium' || score.confidence === 'low') {
        const currentRank = suggestionRank[score.confidence] || 0;
        const bestRank = bestSuggestion
          ? suggestionRank[bestSuggestion.score.confidence] || 0
          : 0;
        if (!bestSuggestion || currentRank > bestRank) {
          bestSuggestion = { txn, score };
        }
      }
    }
    if (bestSuggestion) {
      const { txn, score } = bestSuggestion;
      txn.matchStatus = 'suggested';
      txn.matchConfidence = score.confidence;
      txn.matchReason = score.reason;
      txn.matchedPaymentId = payment.id;
      await this.statementTxnRepo.save(txn);
      return 'suggested';
    }
    return null;
  }

  async tryAutoMatchTxn(txn) {
    const pending = await this.paymentRepo.find({
      where: {
        paymentMode: PaymentMode.SELF_ONLINE,
        status: PaymentStatus.AWAITING_VERIFICATION,
      },
      take: 500,
    });
    for (const payment of pending) {
      const gw = this.exam.parseGateway(payment.gatewayResponse) ?? {};
      const payView = {
        id: payment.id,
        orderRef: payment.transactionReference,
        amount: roundMoney(payment.amountPaid),
        studentUtr: gw.studentUtr,
        createdAt: payment.paidAt,
      };
      const score = this.scoreMatch(payView, txn);
      if (score.autoEligible) {
        // Ensure UTR not already used
        if (txn.utr) {
          const used = await this.statementTxnRepo.findOne({
            where: { utr: txn.utr, matchStatus: 'matched' },
          });
          if (used && used.id !== txn.id) continue;
        }
        await this.verifyMatch({
          paymentId: payment.id,
          merchantTxnId: txn.id,
          actor: { username: 'system', fullName: 'Auto-match' },
          auto: true,
        });
        return 'verified';
      }
      if (score.confidence === 'medium') {
        if (
          !txn.matchedPaymentId ||
          txn.matchStatus !== 'suggested' ||
          txn.matchConfidence !== 'medium'
        ) {
          txn.matchStatus = 'suggested';
          txn.matchConfidence = score.confidence;
          txn.matchReason = score.reason;
          txn.matchedPaymentId = payment.id;
          await this.statementTxnRepo.save(txn);
        }
      }
    }
    return txn.matchStatus === 'suggested' ? 'suggested' : null;
  }

  async verifyMatch({ paymentId, merchantTxnId, actor, auto = false }) {
    const payment = await this.exam.getPayment(paymentId);
    if (!this.isSelfOnlinePayment(payment)) {
      throw AppError.badRequest('Not a Self Online payment');
    }
    if (payment.status === PaymentStatus.SUCCESS) {
      return {
        payment: this.exam.withVerificationMeta(payment),
        feeRecord: await this.exam.getFeeRecord(payment.feeRecordId),
        alreadyVerified: true,
      };
    }
    if (payment.status !== PaymentStatus.AWAITING_VERIFICATION) {
      throw AppError.badRequest(
        'Student must claim “I have paid” before verification (or payment is not awaiting verification)',
      );
    }

    const txn = await this.statementTxnRepo.findOne({
      where: { id: merchantTxnId },
    });
    if (!txn) throw AppError.notFound('Merchant statement transaction not found');
    if (txn.matchStatus === 'matched' && txn.matchedPaymentId !== payment.id) {
      throw AppError.badRequest('This merchant transaction is already matched');
    }

    if (roundMoney(txn.amount) !== roundMoney(payment.amountPaid)) {
      throw AppError.badRequest('Amount mismatch between payment and statement row');
    }

    if (txn.utr) {
      const dup = await this.statementTxnRepo
        .createQueryBuilder('t')
        .where('t.utr = :utr', { utr: txn.utr })
        .andWhere('t.matchStatus = :ms', { ms: 'matched' })
        .andWhere('t.id != :id', { id: txn.id })
        .getOne();
      if (dup) {
        throw AppError.badRequest('This UTR is already linked to another payment');
      }
    }

    const feeRecord = await this.exam.getFeeRecord(payment.feeRecordId);
    if (feeRecord.status === FeeStatus.PAID) {
      throw AppError.badRequest('Fee already paid');
    }

    // Clear other suggestions pointing at this payment
    const suggested = await this.statementTxnRepo.find({
      where: { matchedPaymentId: payment.id, matchStatus: 'suggested' },
    });
    for (const s of suggested) {
      if (s.id === txn.id) continue;
      s.matchStatus = 'unmatched';
      s.matchedPaymentId = null;
      s.matchConfidence = null;
      s.matchReason = null;
      await this.statementTxnRepo.save(s);
    }

    payment.status = PaymentStatus.SUCCESS;
    payment.receiptNumber = this.exam.generateReceiptNumber();
    const gw = this.exam.parseGateway(payment.gatewayResponse) ?? {};
    payment.gatewayResponse = JSON.stringify({
      ...gw,
      provider: 'self_online',
      temporary: false,
      event: auto ? 'auto_verified' : 'admin_verified',
      utr: txn.utr,
      merchantTxnId: txn.id,
      statementId: txn.statementId,
      verifiedBy: actor?.fullName || actor?.username || 'admin',
      verifiedByUsername: actor?.username || null,
      verifiedAt: new Date().toISOString(),
      audit: [
        ...(gw.audit || []),
        {
          event: auto ? 'auto_verified' : 'admin_verified',
          at: new Date().toISOString(),
          by: actor?.username || 'admin',
          merchantTxnId: txn.id,
          utr: txn.utr,
        },
      ],
    });
    if (txn.utr && !String(payment.remarks || '').includes(txn.utr)) {
      payment.remarks = payment.remarks
        ? `${payment.remarks}; Verified UTR:${txn.utr}`
        : `Verified UTR: ${txn.utr}`;
    }
    await this.paymentRepo.save(payment);

    feeRecord.status = FeeStatus.PAID;
    await this.feeRecordRepo.save(feeRecord);

    txn.matchStatus = 'matched';
    txn.matchedPaymentId = payment.id;
    txn.matchConfidence = 'high';
    txn.matchReason = auto ? 'auto_verified' : 'admin_verified';
    await this.statementTxnRepo.save(txn);

    // Fee Management transaction is created ONLY after confirmation
    await this.exam.syncPaymentToFeeManagement(payment, feeRecord, {
      referenceNo: payment.transactionReference,
      gatewayPaymentId: txn.utr || payment.transactionReference,
    });

    log.info(
      {
        event: 'self_online.verified',
        paymentId: payment.id,
        merchantTxnId: txn.id,
        auto,
      },
      'Self Online payment verified; Fee Management sync triggered',
    );

    return {
      payment: this.exam.withVerificationMeta(await this.exam.getPayment(payment.id)),
      feeRecord: await this.exam.getFeeRecord(payment.feeRecordId),
      alreadyVerified: false,
    };
  }

  /**
   * When bank statement does not contain EMS order id (common — UPI apps
   * truncate `tn` / drop `tr`), admin pastes UTR or full bank narration and
   * links it to a specific awaiting payment.
   */
  async manualVerifyByUtr({ paymentId, utr, bankLine, actor }) {
    let parsedUtr = utr ? String(utr).trim().toUpperCase() : null;
    let amount = null;
    let rawLine = bankLine ? String(bankLine).trim() : null;
    let orderRefFromLine = null;

    if (rawLine) {
      const parsed = parseBankNarrationLine(rawLine);
      if (parsed) {
        parsedUtr = parsedUtr || parsed.utr;
        amount = parsed.amount;
        orderRefFromLine = parsed.merchantReference;
        rawLine = parsed.rawLine;
      } else {
        parsedUtr = parsedUtr || extractUtr(rawLine);
      }
    }

    if (!parsedUtr) {
      throw AppError.badRequest(
        'UTR is required. Paste the bank UTR (e.g. from UPI/CR/6968…) or the full narration line.',
      );
    }

    const payment = await this.exam.getPayment(paymentId);
    if (!this.isSelfOnlinePayment(payment)) {
      throw AppError.badRequest('Not a Self Online payment');
    }
    if (payment.status === PaymentStatus.SUCCESS) {
      return {
        payment: this.exam.withVerificationMeta(payment),
        feeRecord: await this.exam.getFeeRecord(payment.feeRecordId),
        alreadyVerified: true,
      };
    }
    if (payment.status !== PaymentStatus.AWAITING_VERIFICATION) {
      throw AppError.badRequest(
        'Payment must be awaiting verification (student/staff must tap “I have paid” first).',
      );
    }

    if (amount != null && roundMoney(amount) !== roundMoney(payment.amountPaid)) {
      throw AppError.badRequest(
        `Amount mismatch: payment is ₹${roundMoney(payment.amountPaid)} but bank line shows ₹${roundMoney(amount)}`,
      );
    }

    if (
      orderRefFromLine &&
      payment.transactionReference &&
      normalizeRef(orderRefFromLine) !== normalizeRef(payment.transactionReference)
    ) {
      throw AppError.badRequest(
        `Bank line order ref ${orderRefFromLine} does not match payment ${payment.transactionReference}`,
      );
    }

    // Reuse unmatched row with same UTR, else create a manual statement row
    let txn = await this.statementTxnRepo.findOne({
      where: { utr: parsedUtr },
      order: { id: 'DESC' },
    });
    if (txn && txn.matchStatus === 'matched' && txn.matchedPaymentId !== payment.id) {
      throw AppError.badRequest('This UTR is already linked to another payment');
    }

    if (!txn || txn.matchStatus === 'matched') {
      const statement = await this.statementRepo.save(
        this.statementRepo.create({
          fileName: 'manual-utr-link.txt',
          fileFormat: 'txt',
          sourceKind: 'manual',
          uploadedBy: actor?.fullName || actor?.username || 'admin',
          uploadedByUsername: actor?.username || null,
          rawTextExcerpt: rawLine || `UTR:${parsedUtr}`,
          rowCount: 1,
          notes:
            'Manual UTR link — bank statement did not include EMS order id (UPI note truncation)',
        }),
      );
      txn = await this.statementTxnRepo.save(
        this.statementTxnRepo.create({
          ...this.buildTxnFromParsedRow(statement.id, {
            ...(parsed || {}),
            utr: parsedUtr,
            merchantReference:
              parsed?.merchantReference || payment.transactionReference,
            transactionReference:
              parsed?.transactionReference || payment.transactionReference,
            amount: parsed?.amount ?? payment.amountPaid,
            txnDate: parsed?.postDate || parsed?.txnDate || new Date(),
            rawLine: rawLine || `UTR:${parsedUtr}`,
            narration: parsed?.narration || rawLine || `UTR:${parsedUtr}`,
          }),
        }),
      );
    } else {
      // Ensure amount aligns
      if (roundMoney(txn.amount) !== roundMoney(payment.amountPaid)) {
        throw AppError.badRequest(
          `Statement row amount ₹${roundMoney(txn.amount)} does not match payment ₹${roundMoney(payment.amountPaid)}`,
        );
      }
    }

    return this.verifyMatch({
      paymentId: payment.id,
      merchantTxnId: txn.id,
      actor,
      auto: false,
    });
  }

  async rejectSuggestion(merchantTxnId) {
    const txn = await this.statementTxnRepo.findOne({
      where: { id: merchantTxnId },
    });
    if (!txn) throw AppError.notFound('Merchant statement transaction not found');
    if (txn.matchStatus === 'matched') {
      throw AppError.badRequest('Cannot reject an already matched transaction');
    }
    txn.matchStatus = 'ignored';
    txn.matchedPaymentId = null;
    txn.matchConfidence = null;
    txn.matchReason = 'admin_rejected';
    await this.statementTxnRepo.save(txn);
    return { ok: true };
  }

  async runAutoMatchAll() {
    // Get all awaiting-verification payments
    const pending = await this.listPending();
    const awaiting = pending.filter((p) => p.status === PaymentStatus.AWAITING_VERIFICATION);
    let verifiedCount = 0;
    
    for (const payment of awaiting) {
      const result = await this.tryAutoMatchPayment(payment.id);
      if (result === 'verified') {
        verifiedCount++;
      }
    }

    return {
      awaitingCount: awaiting.length,
      verifiedCount,
    };
  }
}

module.exports = { SelfOnlineService };
