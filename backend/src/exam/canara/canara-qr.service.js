'use strict';

const crypto = require('node:crypto');
const QRCode = require('qrcode');
const {
  FeeStatus,
  PaymentMode,
  PaymentMethod,
  PaymentStatus,
} = require('../schemas/exam.enums');
const { AppError } = require('../../common/errors');
const { operationLogger } = require('../../common/logger');
const { CanaraApiClient } = require('./canara-client');
const { extractEncryptData } = require('./canara-crypto');

const log = operationLogger('canara-qr');

const OPEN_STATUSES = [
  PaymentStatus.PENDING,
  PaymentStatus.PROCESSING,
];

function roundMoney(amount) {
  return Math.round(Number(amount) * 100) / 100;
}

function formatRequestTime(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function isSuccessStatus(status) {
  const s = String(status || '')
    .trim()
    .toUpperCase();
  return s === 'SUCCESS' || s === 'SUCCESSFUL' || s === 'PAID' || s === '0';
}

class CanaraQrService {
  constructor(paymentRepo, feeRecordRepo, canaraSettings, examService) {
    this.paymentRepo = paymentRepo;
    this.feeRecordRepo = feeRecordRepo;
    this.canaraSettings = canaraSettings;
    this.exam = examService;
    this.client = new CanaraApiClient(canaraSettings);
  }

  async assertFeeActor(feeRecord, actor) {
    if (actor?.role === 'student') {
      const pin = String(actor.pinNo ?? '').toLowerCase();
      if (feeRecord.studentRollNumber.toLowerCase() !== pin) {
        throw AppError.forbidden('This fee does not belong to your account');
      }
    }
  }

  isCanaraPayment(payment) {
    return payment.paymentMode === PaymentMode.CANARA_DYNAMIC_QR;
  }

  buildExtTransactionId(paymentId) {
    // Max 35 chars per bank doc. Unique + stable for this payment.
    const short = paymentId.toString(36).toUpperCase().padStart(4, '0');
    const stamp = Date.now().toString(36).toUpperCase();
    return `EMSQR${short}${stamp}`.slice(0, 35);
  }

  async findOpenCanara(feeRecordId) {
    const rows = await this.paymentRepo.find({
      where: { feeRecordId, paymentMode: PaymentMode.CANARA_DYNAMIC_QR },
      order: { id: 'DESC' },
    });
    return rows.find((p) => OPEN_STATUSES.includes(p.status)) || null;
  }

  async getStatus() {
    return this.canaraSettings.getStatus();
  }

  async startOauth({ state } = {}) {
    return this.client.buildAuthorizeUrl({ state });
  }

  async handleOauthCallback({
    code,
    state,
    scope,
    redirectUri,
    requestIp,
    userAgent,
    callbackReceivedAt,
  } = {}) {
    if (!code) throw AppError.badRequest('Missing authorization code');

    const cfg = await this.canaraSettings.getOauthConfig();
    const callbackRedirectUri = redirectUri || cfg.oauthRedirectUri;
    const audit = await this.canaraSettings.recordOauthCallbackAudit({
      code,
      state,
      scope,
      redirectUri: callbackRedirectUri,
      requestIp,
      userAgent,
      callbackReceivedAt: callbackReceivedAt || new Date(),
    });

    const tokens = await this.client.exchangeAuthorizationCode({
      code,
      redirectUri: callbackRedirectUri,
      state,
    });
    await this.canaraSettings.finalizeOauthCallbackAudit({
      auditId: audit?.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      status: 'success',
      stateVerified: true,
    });
    await this.canaraSettings.saveTokens({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: tokens.tokenType,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    });
    log.info(
      { event: 'canara.oauth.connected', state: state || null, scope: scope || null },
      'Canara OAuth tokens stored',
    );
    return {
      ok: true,
      message: 'Canara OAuth connected successfully',
      tokenExpiresAt: tokens.expiresAt,
      auditId: audit?.id || null,
    };
  }

  async createOrder(feeRecordId, opts = {}) {
    const cfg = await this.canaraSettings.getConfig();
    const feeRecord = await this.exam.getFeeRecord(feeRecordId);
    await this.assertFeeActor(feeRecord, opts.actor);

    if (feeRecord.status === FeeStatus.PAID) {
      throw AppError.badRequest('Fee already paid');
    }

    await this.exam.refreshLateFee(feeRecord);

    let existing = await this.findOpenCanara(feeRecordId);
    if (existing && OPEN_STATUSES.includes(existing.status)) {
      return this.toOrderResponse(existing, feeRecord, cfg);
    }

    // Fail other open online attempts so only one path is active
    const open = await this.paymentRepo.find({ where: { feeRecordId } });
    for (const p of open) {
      if (
        p.paymentMode !== PaymentMode.CANARA_DYNAMIC_QR &&
        (p.status === PaymentStatus.PENDING ||
          p.status === PaymentStatus.PROCESSING)
      ) {
        p.status = PaymentStatus.FAILED;
        const gw = this.exam.parseGateway(p.gatewayResponse) ?? {};
        p.gatewayResponse = JSON.stringify({
          ...gw,
          event: 'superseded_by_canara_dynamic_qr',
        });
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
        paymentMode: PaymentMode.CANARA_DYNAMIC_QR,
        paymentMethod: PaymentMethod.UPI,
        status: PaymentStatus.PENDING,
        receiptNumber: `TMP-CQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        transactionReference: null,
        collectedBy: opts.actor?.fullName || opts.actor?.username || null,
        collectorUsername:
          opts.actor?.role === 'student' ? null : opts.actor?.username || null,
        remarks: null,
        gatewayResponse: JSON.stringify({
          provider: 'canara_dynamic_qr',
          event: 'order_created',
          testMode: Boolean(cfg.testMode || cfg.mockMode),
          mockMode: Boolean(cfg.testMode || cfg.mockMode),
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

    const extTransactionId = this.buildExtTransactionId(payment.id);
    payment.transactionReference = extTransactionId;

    const remark = [
      feeRecord.exam?.name || 'Exam Fee',
      feeRecord.studentRollNumber,
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 80);

    const requestTime = formatRequestTime();
    let qrString;
    let bankResponse = null;

    const encryptData = {
      amount: amount.toFixed(2),
      extTransactionId,
      channel: 'api',
      remark,
      source: cfg.mid,
      terminalId: cfg.terminalId,
      type: 'D',
      param1: String(feeRecordId),
      Param2: feeRecord.studentRollNumber || '',
      param3: String(payment.id),
      sid: cfg.sid,
      upiId: cfg.upiId,
      requestTime,
      reciept: cfg.qrCallbackUrl || 'https://localhost/receipt',
      checksum: '',
    };
    const { decrypted } = await this.client.generateQr(encryptData);
    bankResponse = decrypted;
    qrString =
      decrypted?.qrString ||
      decrypted?.qr_string ||
      decrypted?.response?.qrString;
    if (!qrString) {
      throw AppError.badRequest(
        decrypted?.errorMsg ||
          decrypted?.respMessge ||
          'Canara QR generation did not return qrString',
      );
    }
    const st = String(decrypted?.status || '').toUpperCase();
    if (st && st !== 'SUCCESS' && String(decrypted?.respCode) !== '0') {
      throw AppError.badRequest(
        decrypted?.errorMsg ||
          decrypted?.respMessge ||
          `Canara QR generation failed (${st || decrypted?.respCode})`,
      );
    }

    const qrDataUrl = await QRCode.toDataURL(qrString, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
    });

    const gw = this.exam.parseGateway(payment.gatewayResponse) ?? {};
    payment.status = PaymentStatus.PROCESSING;
    payment.gatewayResponse = JSON.stringify({
      ...gw,
      provider: 'canara_dynamic_qr',
      event: 'qr_generated',
      extTransactionId,
      qrString,
      requestTime,
      mockMode: cfg.mockMode,
      bankResponse,
      audit: [
        ...(gw.audit || []),
        { event: 'qr_generated', at: new Date().toISOString() },
      ],
    });
    await this.paymentRepo.save(payment);

    log.info(
      {
        event: 'canara.order_created',
        paymentId: payment.id,
        feeRecordId,
        extTransactionId,
        mockMode: cfg.mockMode,
      },
      'Canara Dynamic QR order created',
    );

    return this.toOrderResponse(payment, feeRecord, cfg, {
      qrString,
      qrDataUrl,
    });
  }

  async toOrderResponse(payment, feeRecord, cfg, extra = {}) {
    const gw = this.exam.parseGateway(payment.gatewayResponse) ?? {};
    const extTransactionId =
      payment.transactionReference || gw.extTransactionId;
    const amount = roundMoney(payment.amountPaid);
    const qrString = extra.qrString || gw.qrString;
    const qrDataUrl =
      extra.qrDataUrl ||
      (qrString
        ? await QRCode.toDataURL(qrString, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 320,
          })
        : null);

    return {
      paymentId: payment.id,
      feeRecordId: payment.feeRecordId,
      extTransactionId,
      amount,
      currency: 'INR',
      status: payment.status,
      receiptNumber: payment.receiptNumber,
      temporary: payment.status !== PaymentStatus.SUCCESS,
      upiId: cfg.upiId,
      qrString,
      qrDataUrl,
      mockMode: Boolean(cfg.testMode || cfg.mockMode || gw.testMode || gw.mockMode),
      testMode: Boolean(cfg.testMode || cfg.mockMode || gw.testMode || gw.mockMode),
      studentName: feeRecord.studentName,
      studentRollNumber: feeRecord.studentRollNumber,
      examName: feeRecord.exam?.name || null,
      pollIntervalMs: 5000,
      instructions: [
        'Scan the QR with PhonePe, Google Pay, Paytm, or any UPI app',
        'Pay the exact amount shown',
        'Keep this screen open — payment confirms automatically when the bank notifies us',
        'If it stays pending, tap “Check status”',
        ...(cfg.testMode || cfg.mockMode
          ? [
              'TEST MODE: bank payment will be recorded but fee dues will NOT be marked paid',
            ]
          : []),
      ],
    };
  }

  /**
   * Bank QR callback — public endpoint. Idempotent SUCCESS handling.
   */
  async handleQrCallback(rawBody) {
    let payload = rawBody;
    if (Buffer.isBuffer(rawBody)) {
      payload = JSON.parse(rawBody.toString('utf8') || '{}');
    } else if (typeof rawBody === 'string') {
      payload = JSON.parse(rawBody || '{}');
    }

    const row = await this.canaraSettings.getOrCreateRow();
    const env = require('../../config').config.canara || {};
    const symmetricKey =
      row.symmetricKey?.trim() || env.symmetricKey?.trim() || '';

    let data =
      payload?.Request?.body?.encryptData ??
      payload?.Response?.body?.encryptData ??
      payload?.encryptData ??
      null;

    // Bank UAT sample is often a plaintext object inside encryptData
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      // ok
    } else if (typeof data === 'string' && data.trim().startsWith('{')) {
      data = JSON.parse(data);
    } else if (typeof data === 'string' && data.includes('.') && symmetricKey) {
      data = await extractEncryptData(payload, symmetricKey);
    } else if (!data) {
      data = payload;
    }

    if (!data || typeof data !== 'object') {
      throw AppError.badRequest('Invalid Canara QR callback payload');
    }

    const extTransactionId = String(
      data.extTransactionId || data.extTrasantionId || '',
    ).trim();
    if (!extTransactionId) {
      throw AppError.badRequest('Callback missing extTransactionId');
    }

    const payment = await this.paymentRepo.findOne({
      where: { transactionReference: extTransactionId },
    });
    if (!payment) {
      log.warn(
        { event: 'canara.callback.unknown_ext', extTransactionId },
        'Canara callback for unknown payment',
      );
      // Still 200 to bank so they stop retrying forever — but signal not found in body
      return { ok: false, code: '200_OK', message: 'unknown_extTransactionId' };
    }

    if (!this.isCanaraPayment(payment)) {
      throw AppError.badRequest('Payment is not a Canara Dynamic QR payment');
    }

    if (payment.status === PaymentStatus.SUCCESS) {
      return { ok: true, code: '200_OK', alreadyPaid: true, paymentId: payment.id };
    }

    const status = data.status || data.respMessge || '';
    const amount = data.amount != null ? roundMoney(data.amount) : null;

    if (amount != null && amount !== roundMoney(payment.amountPaid)) {
      log.warn(
        {
          event: 'canara.callback.amount_mismatch',
          paymentId: payment.id,
          expected: payment.amountPaid,
          got: amount,
        },
        'Canara callback amount mismatch',
      );
      const gw = this.exam.parseGateway(payment.gatewayResponse) ?? {};
      payment.gatewayResponse = JSON.stringify({
        ...gw,
        event: 'callback_amount_mismatch',
        callback: data,
      });
      payment.status = PaymentStatus.FAILED;
      await this.paymentRepo.save(payment);
      return { ok: false, code: '200_OK', message: 'amount_mismatch' };
    }

    if (isSuccessStatus(status)) {
      const result = await this.finalizeSuccess(payment, data, {
        source: 'callback',
      });
      return {
        ok: true,
        code: '200_OK',
        paymentId: payment.id,
        status: result.settled ? 'SUCCESS' : 'TEST_MODE_RECORDED',
        testMode: Boolean(result.testMode),
        settled: Boolean(result.settled),
      };
    }

    const gw = this.exam.parseGateway(payment.gatewayResponse) ?? {};
    payment.gatewayResponse = JSON.stringify({
      ...gw,
      event: 'callback_non_success',
      callback: data,
      audit: [
        ...(gw.audit || []),
        {
          event: 'callback_non_success',
          at: new Date().toISOString(),
          status,
        },
      ],
    });
    if (
      String(status).toUpperCase() === 'FAILED' ||
      String(data.errCode || '').trim()
    ) {
      payment.status = PaymentStatus.FAILED;
    }
    await this.paymentRepo.save(payment);

    return {
      ok: true,
      code: '200_OK',
      paymentId: payment.id,
      status: String(status || 'PENDING'),
    };
  }

  async finalizeSuccess(payment, bankData, { source }) {
    if (payment.status === PaymentStatus.SUCCESS) {
      return {
        payment: this.exam.withVerificationMeta(payment),
        feeRecord: await this.exam.getFeeRecord(payment.feeRecordId),
        alreadyPaid: true,
      };
    }

    const feeRecord = await this.exam.getFeeRecord(payment.feeRecordId);
    if (feeRecord.status === FeeStatus.PAID) {
      payment.status = PaymentStatus.SUCCESS;
      await this.paymentRepo.save(payment);
      return {
        payment: this.exam.withVerificationMeta(payment),
        feeRecord,
        alreadyPaid: true,
      };
    }

    const rrn = bankData.rrn || bankData.custRefNo || null;
    const txnId = bankData.txnId || bankData.upiTxnId || null;
    const canaraStatus = await this.canaraSettings.getStatus();
    const testMode = Boolean(canaraStatus.testMode || canaraStatus.mockMode);

    // TEST MODE: record bank success but do NOT mark fee paid / sync dues
    if (testMode) {
      const gw = this.exam.parseGateway(payment.gatewayResponse) ?? {};
      payment.gatewayResponse = JSON.stringify({
        ...gw,
        provider: 'canara_dynamic_qr',
        testMode: true,
        settled: false,
        event: 'test_mode_bank_success',
        rrn,
        txnId,
        customerVpa: bankData.customer_vpa || bankData.upiId || null,
        customerName: bankData.customerName || null,
        merchantVpa: bankData.merchant_vpa || null,
        bankData,
        verifiedAt: new Date().toISOString(),
        audit: [
          ...(gw.audit || []),
          {
            event: 'test_mode_bank_success',
            at: new Date().toISOString(),
            source,
            rrn,
            txnId,
            note: 'Fee dues NOT updated (test mode)',
          },
        ],
      });
      payment.remarks = payment.remarks
        ? `${payment.remarks}; TEST MODE bank OK${rrn ? ` RRN:${rrn}` : ''}`
        : `TEST MODE bank OK${rrn ? ` RRN:${rrn}` : ''}`;
      // Keep processing — fee stays pending
      payment.status = PaymentStatus.PROCESSING;
      await this.paymentRepo.save(payment);

      log.info(
        {
          event: 'canara.test_mode_success',
          paymentId: payment.id,
          source,
          rrn,
          txnId,
        },
        'Canara bank success recorded in TEST MODE — fee dues not updated',
      );

      return {
        payment: this.exam.withVerificationMeta(
          await this.exam.getPayment(payment.id),
        ),
        feeRecord: await this.exam.getFeeRecord(payment.feeRecordId),
        alreadyPaid: false,
        testMode: true,
        settled: false,
        bankReceived: true,
      };
    }

    payment.status = PaymentStatus.SUCCESS;
    payment.receiptNumber = this.exam.generateReceiptNumber();
    const gw = this.exam.parseGateway(payment.gatewayResponse) ?? {};
    payment.gatewayResponse = JSON.stringify({
      ...gw,
      provider: 'canara_dynamic_qr',
      temporary: false,
      testMode: false,
      settled: true,
      event: source === 'callback' ? 'callback_success' : 'status_success',
      rrn,
      txnId,
      customerVpa: bankData.customer_vpa || bankData.upiId || null,
      customerName: bankData.customerName || null,
      merchantVpa: bankData.merchant_vpa || null,
      bankData,
      verifiedAt: new Date().toISOString(),
      audit: [
        ...(gw.audit || []),
        {
          event: source === 'callback' ? 'callback_success' : 'status_success',
          at: new Date().toISOString(),
          rrn,
          txnId,
        },
      ],
    });
    if (rrn && !String(payment.remarks || '').includes(rrn)) {
      payment.remarks = payment.remarks
        ? `${payment.remarks}; RRN:${rrn}`
        : `RRN: ${rrn}`;
    }
    await this.paymentRepo.save(payment);

    feeRecord.status = FeeStatus.PAID;
    await this.feeRecordRepo.save(feeRecord);

    await this.exam.syncPaymentToFeeManagement(payment, feeRecord, {
      referenceNo: payment.transactionReference,
      gatewayPaymentId: txnId || rrn || payment.transactionReference,
    });

    log.info(
      {
        event: 'canara.payment_success',
        paymentId: payment.id,
        source,
        rrn,
        txnId,
      },
      'Canara Dynamic QR payment marked success',
    );

    return {
      payment: this.exam.withVerificationMeta(
        await this.exam.getPayment(payment.id),
      ),
      feeRecord: await this.exam.getFeeRecord(payment.feeRecordId),
      alreadyPaid: false,
      testMode: false,
      settled: true,
      bankReceived: true,
    };
  }

  /**
   * Poll bank status by extTransactionId.
   */
  async checkStatus(paymentId, opts = {}) {
    const payment = await this.exam.getPayment(paymentId);
    if (!this.isCanaraPayment(payment)) {
      throw AppError.badRequest('Not a Canara Dynamic QR payment');
    }
    const feeRecord = payment.feeRecord
      ? payment.feeRecord
      : await this.exam.getFeeRecord(payment.feeRecordId);
    await this.assertFeeActor(feeRecord, opts.actor);

    if (payment.status === PaymentStatus.SUCCESS) {
      return {
        status: payment.status,
        paid: true,
        settled: true,
        bankReceived: true,
        testMode: false,
        payment: this.exam.withVerificationMeta(payment),
        feeRecord,
      };
    }

    const gw = this.exam.parseGateway(payment.gatewayResponse) ?? {};
    if (gw.event === 'test_mode_bank_success') {
      return {
        status: payment.status,
        paid: false,
        settled: false,
        bankReceived: true,
        testMode: true,
        payment: this.exam.withVerificationMeta(payment),
        feeRecord,
      };
    }

    const cfg = await this.canaraSettings.getConfig();
    const extTransactionId =
      payment.transactionReference || gw.extTransactionId;

    const encryptData = {
      mid: cfg.mid,
      channel: 'api',
      sid: cfg.sid,
      terminalId: cfg.terminalId,
      extTransactionId,
      checksum: '',
    };

    const { decrypted } = await this.client.txnStatusByExtId(encryptData);
    const row =
      (Array.isArray(decrypted?.data) && decrypted.data[0]) || decrypted || {};
    const status = row.respMessge || row.status || decrypted?.status || '';

    if (isSuccessStatus(status) || String(row.respCode) === '0') {
      const result = await this.finalizeSuccess(
        payment,
        {
          ...row,
          status: 'SUCCESS',
          amount: row.amount || payment.amountPaid,
          extTransactionId,
          rrn: row.custRefNo || row.rrn,
          txnId: row.upiTxnId || row.txnId,
        },
        { source: 'status' },
      );
      return {
        status: result.settled
          ? PaymentStatus.SUCCESS
          : payment.status,
        paid: Boolean(result.settled),
        settled: Boolean(result.settled),
        bankReceived: true,
        testMode: Boolean(result.testMode),
        payment: result.payment,
        feeRecord: result.feeRecord,
      };
    }

    return {
      status: payment.status,
      paid: false,
      settled: false,
      bankReceived: false,
      testMode: Boolean(cfg.testMode || cfg.mockMode),
      bankStatus: status || null,
      payment: this.exam.withVerificationMeta(payment),
      feeRecord,
    };
  }

  /**
   * Dev/UAT helper: simulate bank callback (staff only). Still respects test mode settlement rules.
   */
  async simulateCallback(paymentId, opts = {}) {
    const payment = await this.exam.getPayment(paymentId);
    if (!this.isCanaraPayment(payment)) {
      throw AppError.badRequest('Not a Canara Dynamic QR payment');
    }
    const cfg = await this.canaraSettings.getStatus();
    if (!cfg.testMode && !cfg.mockMode && opts.force !== true) {
      throw AppError.badRequest(
        'simulateCallback is only allowed in Canara test mode (or force=true for staff UAT)',
      );
    }
    const ext =
      payment.transactionReference ||
      this.exam.parseGateway(payment.gatewayResponse)?.extTransactionId;
    return this.handleQrCallback({
      Request: {
        body: {
          encryptData: {
            extTransactionId: ext,
            checksum: '',
            status: 'SUCCESS',
            errCode: '',
            customer_vpa: 'student@test',
            merchant_vpa: cfg.upiId || 'merchant@cnrb',
            rrn: `SIM${Date.now().toString().slice(-10)}`,
            txnId: `SIMTXN${crypto.randomBytes(6).toString('hex')}`,
            amount: roundMoney(payment.amountPaid).toFixed(2),
            responseTime: new Date().toString(),
            customerName: payment.feeRecord?.studentName || 'Student',
            remark: 'Simulated Canara callback',
            channel: 'API',
          },
        },
      },
    });
  }
}

module.exports = { CanaraQrService };
