'use strict';

const { AppError } = require('../common/errors');
const { CanaraApiClient } = require('../exam/canara/canara-client');

class CanaraVpaService {
  constructor(vpaRepo, canaraSettings = null) {
    this.vpaRepo = vpaRepo;
    this.canaraSettings = canaraSettings;
    this.client = canaraSettings ? new CanaraApiClient(canaraSettings) : null;
  }

  async listVpas() {
    return this.vpaRepo.find({ order: { createdAt: 'DESC' } });
  }

  async getActiveVpa() {
    const active = await this.vpaRepo.findOne({ where: { isActive: true } });
    return active || null;
  }

  async getActiveConfig() {
    const active = await this.getActiveVpa();
    if (!active) {
      return null;
    }
    return {
      sid: active.sid || null,
      upiId: active.upiId || null,
      merchantName: active.merchantName || null,
      mobileNumber: active.mobileNumber || null,
    };
  }

  async createVpa(payload = {}) {
    const row = this.vpaRepo.create({
      sid: payload.sid,
      batchId: payload.batchId || null,
      mobileNumber: payload.mobileNumber || null,
      additionalNumber: payload.additionalNumber || null,
      usedFor: payload.usedFor || null,
      status: payload.status || 'PENDING',
      responseStatus: payload.responseStatus || null,
      responseCode: payload.responseCode || null,
      responseMessage: payload.responseMessage || null,
      merchantName: payload.merchantName || null,
      qrString: payload.qrString || null,
      suggestedVPA: payload.suggestedVPA || null,
      errorCode: payload.errorCode || null,
      errorDescription: payload.errorDescription || null,
      upiId: payload.upiId || null,
      isActive: false,
    });
    const saved = await this.vpaRepo.save(row);

    if (!this.client || !this.canaraSettings) {
      return saved;
    }

    try {
      const cfg = await this.canaraSettings.getConfig({ requireLive: false });
      const trimmedSid = String(payload.sid || '').trim();
      const trimmedMobile = String(payload.mobileNumber || '').trim();
      const trimmedName = String(payload.name || payload.merchantName || '').trim();
      const trimmedAdditionalNo = String(payload.additionalNumber || '').trim();
      const trimmedAccountNumber = String(cfg.accountNumber || payload.accountNumber || '2400201001060').trim();
      const trimmedMid = String(cfg.mid || payload.mid || '').trim();
      const trimmedIfsc = String(cfg.ifscCode || payload.ifscCode || 'CNRB0000000').trim();
      const trimmedMcc = String(cfg.mcc || payload.mcc || '5411').trim();
      const trimmedBankName = String(cfg.bankName || payload.bankName || 'Canara Bank').trim();
      const createPayload = {
        mid: trimmedMid || null,
        channel: String(cfg.channel || payload.channel || 'api').trim() || 'api',
        account_number: trimmedAccountNumber || '2400201001060',
        mobile_number: trimmedMobile || null,
        terminalId: '',
        name: trimmedName || null,
        bank_name: trimmedBankName || 'Canara Bank',
        mcc: trimmedMcc || '5411',
        ifsc_code: trimmedIfsc || 'CNRB0000000',
        sid: trimmedSid || null,
        additionalNo: trimmedAdditionalNo || '',
        checksum: '',
      };
      const createResult = await this.client.postPlainBody('/v1/upi/vpa-creation', createPayload);
      const createData = createResult?.decrypted || {};
      const batchId = createData?.response?.batch_id || createData?.batch_id || null;
      const isSuccess =
        createData?.status === 'SUCCESS' ||
        createData?.respCode === '0' ||
        createData?.response?.status === 'SUCCESS';
      const createPatch = {
        batchId,
        status: isSuccess ? 'SUCCESS' : 'PENDING',
        responseStatus: createData?.status || createData?.response?.status || null,
        responseCode: createData?.respCode || createData?.response?.respCode || null,
        responseMessage: createData?.respMessge || createData?.response?.message || createData?.response?.error_desc || null,
      };
      await this.vpaRepo.update({ id: saved.id }, createPatch);

      if (!batchId) {
        return this.vpaRepo.findOne({ where: { id: saved.id } });
      }

      const inquiryPayload = {
        channel: cfg.channel || payload.channel || 'api',
        mid: cfg.mid || payload.mid || null,
        sid: payload.sid,
        batch_id: batchId,
        checksum: '',
      };
      const inquiryResult = await this.client.postPlainBody('/v1/upi/vpa-creation-enq', inquiryPayload);
      const inquiryData = inquiryResult?.decrypted || {};
      const inquiryPatch = {
        upiId: inquiryData?.response?.upiId || inquiryData?.upiId || null,
        qrString: inquiryData?.response?.qr_string || inquiryData?.qr_string || null,
        merchantName: inquiryData?.response?.mercName || inquiryData?.mercName || null,
        mobileNumber: inquiryData?.response?.mobile_number || payload.mobileNumber || null,
        additionalNumber: inquiryData?.response?.additionalNo || payload.additionalNumber || null,
        suggestedVPA: inquiryData?.response?.suggestedVpa || inquiryData?.suggestedVpa || null,
        errorCode: inquiryData?.response?.error_code || inquiryData?.error_code || null,
        errorDescription: inquiryData?.response?.error_desc || inquiryData?.error_desc || null,
        status: String(inquiryData?.status || createPatch.status || 'PENDING').trim(),
        responseStatus: inquiryData?.status || null,
        responseCode: inquiryData?.respCode || null,
        responseMessage: inquiryData?.respMessge || inquiryData?.response?.error_desc || null,
        batchId,
        updatedAt: new Date(),
      };
      await this.vpaRepo.update({ id: saved.id }, inquiryPatch);
      return this.vpaRepo.findOne({ where: { id: saved.id } });
    } catch (err) {
      await this.vpaRepo.update({ id: saved.id }, {
        status: 'FAILED',
        responseMessage: err.message || 'VPA onboarding failed',
        updatedAt: new Date(),
      });
      return this.vpaRepo.findOne({ where: { id: saved.id } });
    }
  }

  async setActiveVpa(id) {
    const row = await this.vpaRepo.findOne({ where: { id } });
    if (!row) {
      throw AppError.badRequest('VPA/SID record not found');
    }

    if (!row.upiId) {
      throw AppError.badRequest('Cannot activate: this SID has no UPI/ VPA. Click Verify to query bank for onboarding status.');
    }

    const allRows = await this.vpaRepo.find();
    if (allRows?.length) {
      await Promise.all(allRows.map((item) => this.vpaRepo.update({ id: item.id }, { isActive: false })));
    }
    await this.vpaRepo.update({ id: row.id }, { isActive: true });
    const updated = await this.vpaRepo.findOne({ where: { id } });
    await this.applyActiveVpaToSettings();
    return updated;
  }

  async deleteVpa(id) {
    const row = await this.vpaRepo.findOne({ where: { id } });
    if (!row) {
      throw AppError.badRequest('VPA/SID record not found');
    }
    await this.vpaRepo.delete({ id: row.id });
    return { deleted: true, id: row.id };
  }

  async inquireVpa(id) {
    const row = await this.vpaRepo.findOne({ where: { id } });
    if (!row) {
      throw AppError.badRequest('VPA/SID record not found');
    }
    if (!this.client || !this.canaraSettings) {
      throw AppError.badRequest('Canara client not configured');
    }
    try {
      const cfg = await this.canaraSettings.getConfig({ requireLive: false });
      const inquiryPayload = {
        channel: cfg.channel || 'api',
        mid: cfg.mid || null,
        sid: row.sid || null,
        batch_id: row.batchId || null,
        checksum: '',
      };
      const inquiryResult = await this.client.postPlainBody('/v1/upi/vpa-creation-enq', inquiryPayload);
      const inquiryData = inquiryResult?.decrypted || {};
      const inquiryPatch = {
        upiId: inquiryData?.response?.upiId || inquiryData?.upiId || row.upiId || null,
        qrString: inquiryData?.response?.qr_string || inquiryData?.qr_string || row.qrString || null,
        merchantName: inquiryData?.response?.mercName || inquiryData?.mercName || row.merchantName || null,
        mobileNumber: inquiryData?.response?.mobile_number || row.mobileNumber || null,
        additionalNumber: inquiryData?.response?.additionalNo || row.additionalNumber || null,
        suggestedVPA: inquiryData?.response?.suggestedVpa || inquiryData?.suggestedVpa || row.suggestedVPA || null,
        errorCode: inquiryData?.response?.error_code || inquiryData?.error_code || row.errorCode || null,
        errorDescription: inquiryData?.response?.error_desc || inquiryData?.error_desc || row.errorDescription || null,
        status: String(inquiryData?.status || row.status || 'PENDING').trim(),
        responseStatus: inquiryData?.status || null,
        responseCode: inquiryData?.respCode || inquiryData?.response?.respCode || null,
        responseMessage: inquiryData?.respMessge || inquiryData?.response?.error_desc || row.responseMessage || null,
        batchId: inquiryData?.response?.batch_id || inquiryData?.batch_id || row.batchId || null,
        updatedAt: new Date(),
      };
      await this.vpaRepo.update({ id: row.id }, inquiryPatch);
      return this.vpaRepo.findOne({ where: { id } });
    } catch (err) {
      await this.vpaRepo.update({ id: row.id }, {
        status: 'FAILED',
        responseMessage: err.message || 'VPA inquiry failed',
        updatedAt: new Date(),
      });
      return this.vpaRepo.findOne({ where: { id } });
    }
  }

  async markInquiryResult(id, payload = {}) {
    const row = await this.vpaRepo.findOne({ where: { id } });
    if (!row) {
      throw AppError.badRequest('VPA/SID record not found');
    }
    const patch = {
      upiId: payload.upiId || row.upiId || null,
      qrString: payload.qrString || row.qrString || null,
      merchantName: payload.merchantName || row.merchantName || null,
      mobileNumber: payload.mobileNumber || row.mobileNumber || null,
      additionalNumber: payload.additionalNumber || row.additionalNumber || null,
      suggestedVPA: payload.suggestedVPA || row.suggestedVPA || null,
      errorCode: payload.errorCode || row.errorCode || null,
      errorDescription: payload.errorDescription || row.errorDescription || null,
      status: payload.status || row.status || 'PENDING',
      responseStatus: payload.responseStatus || row.responseStatus || null,
      responseCode: payload.responseCode || row.responseCode || null,
      responseMessage: payload.responseMessage || row.responseMessage || null,
      batchId: payload.batchId || row.batchId || null,
      updatedAt: new Date(),
    };
    await this.vpaRepo.update({ id: row.id }, patch);
    return this.vpaRepo.findOne({ where: { id } });
  }

  async applyActiveVpaToSettings() {
    const active = await this.getActiveVpa();
    if (!active?.sid || !active?.upiId) {
      return null;
    }
    if (!this.canaraSettings) return active;
    // Merchant-level SID/UPI no longer stored on settings. Keep active VPA only in canara_vpas.
    return active;
  }
}

module.exports = { CanaraVpaService };
