'use strict';

const QRCode = require('qrcode');
const {
  FeeStatus,
  PaymentMode,
  PaymentMethod,
  PaymentStatus,
} = require('./schemas/exam.enums');
const { AppError } = require('../common/errors');
const { CanaraUpiClient } = require('./canara-upi-client');
const { operationLogger } = require('../common/logger');

const log = operationLogger('canara-upi');

const OPEN_STATUSES = [PaymentStatus.PENDING, PaymentStatus.PROCESSING];
const PROVIDER = 'canara_upi';

function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function buildExtTransactionId(paymentId) {
  // ≤35 chars, unique per payment attempt
  const idPart = Number(paymentId).toString(36).toUpperCase().padStart(4, '0');
  const timePart = Date.now().toString(36).toUpperCase().slice(-6);
  return `EMS${idPart}${timePart}`.slice(0, 35);
}

class CanaraUpiService {
  constructor(paymentRepo, feeRecordRepo, canaraSettings, examService) {
    this.paymentRepo = paymentRepo;
    this.feeRecordRepo = feeRecordRepo;
    this.canaraSettings = canaraSettings;
    this.exam = examService;
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
    if (payment.paymentMode === PaymentMode.CANARA_UPI) return true;
    const gw = this.exam.parseGateway(payment.gatewayResponse);
    return gw?.provider === PROVIDER;
  }

  async getPublicStatus() {
    const pub = await this.canaraSettings.getPublicActive();
    return {
      enabled: pub.enabled,
      configured: pub.configured,
      ready: pub.ready,
      missing: pub.missing,
      environment: pub.version?.environment || null,
      merchantName: pub.version?.merchantName || null,
      upiId: pub.version?.upiId || null,
      credentialExpiresAt: pub.credentialExpiresAt || null,
      rotationDueSoon: pub.rotationDueSoon || false,
    };
  }

  async requireReadyCredentials() {
    const row = await this.canaraSettings.getActiveCredentials();
    const readiness = this.canaraSettings.readinessFromRow(row);
    if (!readiness.ready) {
      throw AppError.badRequest(
        readiness.enabled
          ? `Canara UPI is not fully configured (missing: ${(readiness.missing || []).join(', ') || 'fields'})`
          : 'Canara UPI payments are disabled',
      );
    }
    return row;
  }

  async findOpenCanara(feeRecordId) {
    const rows = await this.paymentRepo.find({
      where: { feeRecordId, paymentMode: PaymentMode.CANARA_UPI },
      order: { id: 'DESC' },
    });
    return rows.find((p) => OPEN_STATUSES.includes(p.status)) || null;
  }

  async supersedeOtherOpen(feeRecordId) {
    const open = await this.paymentRepo.find({ where: { feeRecordId } });
    for (const p of open) {
      if (
        p.paymentMode !== PaymentMode.CANARA_UPI &&
        (p.status === PaymentStatus.PENDING ||
          p.status === PaymentStatus.PROCESSING)
      ) {
        p.status = PaymentStatus.FAILED;
        const gw = this.exam.parseGateway(p.gatewayResponse) ?? {};
        p.gatewayResponse = JSON.stringify({
          ...gw,
          event: 'superseded_by_canara_upi',
        });
        await this.paymentRepo.save(p);
      }
    }
  }

  async toOrderResponse(payment, feeRecord, creds, extra = {}) {
    const gw = this.exam.parseGateway(payment.gatewayResponse) ?? {};
    const qrString = extra.qrString || gw.qrString;
    if (!qrString) {
      throw AppError.badRequest('Canara QR string missing on payment');
    }
    const qrDataUrl =
      extra.qrDataUrl ||
      (await QRCode.toDataURL(qrString, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 320,
      }));

    return {
      paymentId: payment.id,
      feeRecordId: payment.feeRecordId,
      amount: roundMoney(payment.amountPaid),
      currency: 'INR',
      status: payment.status,
      receiptNumber: payment.receiptNumber,
      extTransactionId: payment.transactionReference || gw.extTransactionId,
      qrString,
      qrDataUrl,
      upiUrl: qrString.startsWith('upi://') ? qrString : null,
      merchantName: creds.merchantName || gw.merchantName || null,
      merchantUpiId: creds.upiId || gw.upiId || null,
      studentName: feeRecord.studentName,
      studentRollNumber: feeRecord.studentRollNumber,
      examName: feeRecord.exam?.name || null,
      credentialVersionId: gw.credentialVersionId || creds.id || null,
      instructions: [
        'Scan the QR with any UPI app (PhonePe, GPay, Paytm, bank apps).',
        'Pay the exact amount shown.',
        'This page updates automatically when Canara Bank confirms the payment.',
        'Do not close until you see Payment successful — or wait for SMS/UPI confirmation then tap Refresh status.',
      ],
    };
  }

  async createOrder(feeRecordId, opts = {}) {
    const creds = await this.requireReadyCredentials();
    const feeRecord = await this.exam.getFeeRecord(feeRecordId);
    await this.assertFeeActor(feeRecord, opts.actor);

    if (feeRecord.status === FeeStatus.PAID) {
      throw AppError.badRequest('Fee already paid');
    }

    await this.exam.refreshLateFee(feeRecord);

    const existing = await this.findOpenCanara(feeRecordId);
    if (existing) {
      const gw = this.exam.parseGateway(existing.gatewayResponse) ?? {};
      if (gw.qrString) {
        return this.toOrderResponse(existing, feeRecord, creds);
      }
    }

    await this.supersedeOtherOpen(feeRecordId);

    const amount = roundMoney(feeRecord.totalAmount);
    if (amount < 1) {
      throw AppError.badRequest('Amount must be at least ₹1.00');
    }

    const payment = await this.paymentRepo.save(
      this.paymentRepo.create({
        feeRecordId,
        amountPaid: amount,
        paymentMode: PaymentMode.CANARA_UPI,
        paymentMethod: PaymentMethod.UPI,
        status: PaymentStatus.PENDING,
        receiptNumber: this.exam.generateReceiptNumber(),
        transactionReference: null,
        collectedBy: opts.actor?.fullName || opts.actor?.username || null,
        collectorUsername:
          opts.actor?.role === 'student' ? null : opts.actor?.username || null,
        remarks: null,
        gatewayResponse: JSON.stringify({
          provider: PROVIDER,
          event: 'order_creating',
          credentialVersionId: creds.id,
          merchantMid: creds.merchantMid,
          merchantSid: creds.merchantSid,
          terminalId: creds.terminalId,
          upiId: creds.upiId,
          merchantName: creds.merchantName,
          audit: [
            {
              event: 'transaction_created',
              at: new Date().toISOString(),
              by: opts.actor?.username || opts.actor?.pinNo || 'system',
            },
          ],
        }),
      }),
    );

    const extTransactionId = buildExtTransactionId(payment.id);
    payment.transactionReference = extTransactionId;
    payment.status = PaymentStatus.PROCESSING;
    await this.paymentRepo.save(payment);

    const client = new CanaraUpiClient(creds);
    let qrResult;
    try {
      qrResult = await client.generateDynamicQr({
        amount,
        extTransactionId,
        remark: `Exam Fee ${feeRecord.exam?.name || feeRecordId}`.slice(0, 80),
        receiptUrl: creds.callbackUrl || undefined,
      });
    } catch (err) {
      const gw = this.exam.parseGateway(payment.gatewayResponse) ?? {};
      payment.status = PaymentStatus.FAILED;
      payment.gatewayResponse = JSON.stringify({
        ...gw,
        event: 'qr_generation_failed',
        error: err.message || 'QR generation failed',
        audit: [
          ...(gw.audit || []),
          {
            event: 'qr_generation_failed',
            at: new Date().toISOString(),
            error: err.message,
          },
        ],
      });
      await this.paymentRepo.save(payment);
      throw err;
    }

    const gw = this.exam.parseGateway(payment.gatewayResponse) ?? {};
    const qrDataUrl = await QRCode.toDataURL(qrResult.qrString, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
    });

    payment.gatewayResponse = JSON.stringify({
      ...gw,
      provider: PROVIDER,
      event: 'qr_generated',
      extTransactionId,
      qrString: qrResult.qrString,
      upiId: qrResult.upiId,
      bankRaw: {
        status: qrResult.raw?.status,
        respCode: qrResult.raw?.respCode,
      },
      audit: [
        ...(gw.audit || []),
        { event: 'qr_generated', at: new Date().toISOString() },
      ],
    });
    await this.paymentRepo.save(payment);

    log.info(
      {
        event: 'canara_upi.order_created',
        paymentId: payment.id,
        feeRecordId,
        extTransactionId,
      },
      'Canara dynamic QR order created',
    );

    return this.toOrderResponse(payment, feeRecord, creds, {
      qrString: qrResult.qrString,
      qrDataUrl,
    });
  }

  async findPaymentByExtTransactionId(extTransactionId, paymentId) {
    if (paymentId) {
      const byId = await this.paymentRepo.findOne({
        where: { id: paymentId },
        relations: ['feeRecord', 'feeRecord.exam'],
      });
      if (byId && this.isCanaraPayment(byId)) {
        const gw = this.exam.parseGateway(byId.gatewayResponse);
        if (
          !extTransactionId ||
          !gw?.extTransactionId ||
          gw.extTransactionId === extTransactionId ||
          byId.transactionReference === extTransactionId
        ) {
          return byId;
        }
      }
    }

    if (extTransactionId) {
      const byRef = await this.paymentRepo.findOne({
        where: {
          transactionReference: String(extTransactionId),
          paymentMode: PaymentMode.CANARA_UPI,
        },
        relations: ['feeRecord', 'feeRecord.exam'],
      });
      if (byRef) return byRef;

      const recent = await this.paymentRepo.find({
        where: { paymentMode: PaymentMode.CANARA_UPI },
        relations: ['feeRecord', 'feeRecord.exam'],
        order: { id: 'DESC' },
        take: 300,
      });
      const match = recent.find((p) => {
        const gw = this.exam.parseGateway(p.gatewayResponse);
        return gw?.extTransactionId === String(extTransactionId);
      });
      if (match) return match;
    }

    throw AppError.notFound('Canara payment not found for this transaction');
  }

  async markSuccess(payment, meta = {}) {
    if (payment.status === PaymentStatus.SUCCESS) {
      return {
        payment: this.exam.withVerificationMeta(payment),
        feeRecord: await this.exam.getFeeRecord(payment.feeRecordId),
        alreadyPaid: true,
      };
    }

    const fee = await this.exam.getFeeRecord(payment.feeRecordId);
    const gw = this.exam.parseGateway(payment.gatewayResponse) ?? {
      provider: PROVIDER,
    };

    payment.status = PaymentStatus.SUCCESS;
    payment.paymentMethod = PaymentMethod.UPI;
    if (meta.rrn || meta.txnId || meta.upiTxnId) {
      // Keep ext id on transactionReference; bank refs in gateway
    }
    payment.gatewayResponse = JSON.stringify({
      ...gw,
      provider: PROVIDER,
      event: meta.event || 'captured',
      rrn: meta.rrn || gw.rrn || null,
      txnId: meta.txnId || meta.upiTxnId || gw.txnId || null,
      upiTxnId: meta.upiTxnId || meta.txnId || gw.upiTxnId || null,
      customerVpa: meta.customerVpa || gw.customerVpa || null,
      customerName: meta.customerName || gw.customerName || null,
      amountConfirmed: meta.amount != null ? roundMoney(meta.amount) : gw.amountConfirmed,
      bankStatus: meta.status || 'SUCCESS',
      callbackAt: meta.fromCallback ? new Date().toISOString() : gw.callbackAt,
      syncedAt: meta.fromSync ? new Date().toISOString() : gw.syncedAt,
      audit: [
        ...(gw.audit || []),
        {
          event: meta.event || 'captured',
          at: new Date().toISOString(),
          rrn: meta.rrn || null,
        },
      ],
    });
    await this.paymentRepo.save(payment);

    if (fee.status !== FeeStatus.PAID) {
      await this.feeRecordRepo.update(payment.feeRecordId, {
        status: FeeStatus.PAID,
      });
    }

    const feeRecord = payment.feeRecord?.exam
      ? payment.feeRecord
      : await this.exam.getFeeRecord(payment.feeRecordId);
    const refreshed = await this.exam.getPayment(payment.id);

    await this.exam.syncPaymentToFeeManagement(refreshed, feeRecord, {
      gatewayPaymentId: meta.rrn || meta.txnId || meta.upiTxnId || payment.transactionReference,
      referenceNo: payment.transactionReference,
      bankName: 'Canara Bank',
    });

    log.info(
      {
        event: 'canara_upi.paid',
        paymentId: payment.id,
        feeRecordId: payment.feeRecordId,
        rrn: meta.rrn,
        source: meta.event,
      },
      'Canara UPI payment marked success',
    );

    return {
      payment: this.exam.withVerificationMeta(refreshed),
      feeRecord: await this.exam.getFeeRecord(payment.feeRecordId),
      alreadyPaid: fee.status === FeeStatus.PAID,
    };
  }

  extractSuccessFromStatusData(data) {
    if (!data) return null;
    const rows = Array.isArray(data.data) ? data.data : [data];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const code = String(row.respCode ?? row.respcode ?? data.respCode ?? '');
      const msg = String(
        row.respMessge || row.respMessage || row.status || data.status || '',
      ).toUpperCase();
      const ok = code === '0' || msg.includes('SUCCESS');
      if (!ok) continue;
      return {
        status: 'SUCCESS',
        amount: row.amount,
        rrn: row.custRefNo || row.rrn || null,
        upiTxnId: row.upiTxnId || row.txnId || null,
        customerVpa: row.upiId || row.customer_vpa || null,
        customerName: row.customerName || null,
        txnTime: row.txnTime || null,
      };
    }
    const topCode = String(data.respCode ?? data.respcode ?? '');
    const topStatus = String(data.status || '').toUpperCase();
    if (topCode === '0' && topStatus.includes('SUCCESS') && data.rrn) {
      return {
        status: 'SUCCESS',
        amount: data.amount,
        rrn: data.rrn,
        upiTxnId: data.txnId || data.upiTxnId,
        customerVpa: data.customer_vpa || data.upiId,
        customerName: data.customerName,
      };
    }
    return null;
  }

  async syncPaymentStatus(paymentId, opts = {}) {
    const payment = await this.exam.getPayment(paymentId);
    if (!this.isCanaraPayment(payment)) {
      throw AppError.badRequest('Not a Canara UPI payment');
    }
    await this.assertFeeActor(
      payment.feeRecord || (await this.exam.getFeeRecord(payment.feeRecordId)),
      opts.actor,
    );

    if (payment.status === PaymentStatus.SUCCESS) {
      return {
        paymentId: payment.id,
        status: payment.status,
        feeStatus: (
          await this.exam.getFeeRecord(payment.feeRecordId)
        ).status,
        alreadyPaid: true,
        synced: false,
      };
    }

    if (
      payment.status !== PaymentStatus.PROCESSING &&
      payment.status !== PaymentStatus.PENDING
    ) {
      return {
        paymentId: payment.id,
        status: payment.status,
        feeStatus: (
          await this.exam.getFeeRecord(payment.feeRecordId)
        ).status,
        synced: false,
      };
    }

    const creds = await this.requireReadyCredentials();
    const gw = this.exam.parseGateway(payment.gatewayResponse) ?? {};
    const extId = payment.transactionReference || gw.extTransactionId;
    if (!extId) {
      throw AppError.badRequest('Payment has no extTransactionId');
    }

    const client = new CanaraUpiClient(creds);
    const result = await client.getTxnStatusByExtId(extId);
    const success = this.extractSuccessFromStatusData(result.data);

    if (success) {
      await this.markSuccess(payment, {
        ...success,
        event: 'status_sync',
        fromSync: true,
      });
      const fee = await this.exam.getFeeRecord(payment.feeRecordId);
      return {
        paymentId: payment.id,
        status: PaymentStatus.SUCCESS,
        feeStatus: fee.status,
        synced: true,
        bank: success,
      };
    }

    // Persist last poll snapshot
    payment.gatewayResponse = JSON.stringify({
      ...gw,
      lastStatusPollAt: new Date().toISOString(),
      lastStatusRaw: {
        status: result.data?.status,
        respCode: result.data?.respCode,
      },
      audit: [
        ...(gw.audit || []),
        { event: 'status_polled', at: new Date().toISOString() },
      ],
    });
    await this.paymentRepo.save(payment);

    return {
      paymentId: payment.id,
      status: payment.status,
      feeStatus: (await this.exam.getFeeRecord(payment.feeRecordId)).status,
      synced: true,
      pending: true,
    };
  }

  /**
   * Bank QR Call-Back. Must respond 200_OK per bank docs.
   */
  async handleCallback(body, signatureHeader) {
    let creds;
    try {
      creds = await this.canaraSettings.getActiveCredentials();
      if (!creds) {
        return { response: '200_OK', ok: false, reason: 'no_credentials' };
      }
    } catch {
      return { response: '200_OK', ok: false, reason: 'no_credentials' };
    }

    const client = new CanaraUpiClient(creds);
    let payload;
    try {
      payload = client.parseCallbackPayload(body, signatureHeader);
    } catch (err) {
      log.warn(
        { event: 'canara_upi.callback_parse_failed', err: err.message },
        'Canara callback parse/verify failed',
      );
      // Still ack to avoid endless retries if signature optional; reject only on auth errors
      if (err.statusCode === 403) {
        throw err;
      }
      return { response: '200_OK', ok: false, reason: 'parse_failed' };
    }

    const extTransactionId = String(
      payload?.extTransactionId ||
        payload?.extTrasantionId ||
        payload?.extTransactionID ||
        '',
    );
    const status = String(payload?.status || '').toUpperCase();
    const amount = payload?.amount;
    const rrn = payload?.rrn || null;
    const txnId = payload?.txnId || payload?.upiTxnId || null;

    if (!extTransactionId) {
      return { response: '200_OK', ok: true, ignored: true, reason: 'no_ext_id' };
    }

    let payment;
    try {
      payment = await this.findPaymentByExtTransactionId(extTransactionId);
    } catch {
      log.warn(
        {
          event: 'canara_upi.callback_unknown_ext',
          extTransactionId,
        },
        'Canara callback for unknown payment',
      );
      return {
        response: '200_OK',
        ok: true,
        ignored: true,
        reason: 'payment_not_found',
      };
    }

    if (payment.status === PaymentStatus.SUCCESS) {
      return {
        response: '200_OK',
        ok: true,
        alreadyPaid: true,
        paymentId: payment.id,
      };
    }

    if (status.includes('SUCCESS') || status === 'SUCCESS') {
      // Optional amount check
      if (
        amount != null &&
        roundMoney(amount) !== roundMoney(payment.amountPaid)
      ) {
        log.warn(
          {
            event: 'canara_upi.callback_amount_mismatch',
            paymentId: payment.id,
            expected: payment.amountPaid,
            got: amount,
          },
          'Canara callback amount mismatch',
        );
      }

      await this.markSuccess(payment, {
        event: 'qr_callback',
        fromCallback: true,
        status,
        amount,
        rrn,
        txnId,
        customerVpa: payload?.customer_vpa || payload?.customerVpa,
        customerName: payload?.customerName,
      });
      return {
        response: '200_OK',
        ok: true,
        paid: true,
        paymentId: payment.id,
      };
    }

    // Non-success callback — record failure if definitive
    if (
      status.includes('FAIL') ||
      status.includes('REJECT') ||
      status.includes('CANCEL')
    ) {
      const gw = this.exam.parseGateway(payment.gatewayResponse) ?? {};
      payment.status = PaymentStatus.FAILED;
      payment.gatewayResponse = JSON.stringify({
        ...gw,
        event: 'qr_callback_failed',
        bankStatus: status,
        errCode: payload?.errCode || null,
        rrn,
        txnId,
        audit: [
          ...(gw.audit || []),
          {
            event: 'qr_callback_failed',
            at: new Date().toISOString(),
            status,
          },
        ],
      });
      await this.paymentRepo.save(payment);
      return {
        response: '200_OK',
        ok: true,
        failed: true,
        paymentId: payment.id,
      };
    }

    return {
      response: '200_OK',
      ok: true,
      ignored: true,
      status,
      paymentId: payment.id,
    };
  }
}

module.exports = {
  CanaraUpiService,
  PROVIDER,
  buildExtTransactionId,
};
