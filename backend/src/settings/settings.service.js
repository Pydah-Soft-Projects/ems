'use strict';

const { config } = require('../config');
const { AppError } = require('../common/errors');

function maskSecret(value) {
  if (!value) return null;
  if (value.length <= 4) return '••••';
  return `••••${value.slice(-4)}`;
}

class SettingsService {
  /**
   * @param {import('typeorm').Repository} settingsRepo
   * @param {import('./canara-settings.service').CanaraSettingsService | null} canaraSettings
   */
  constructor(settingsRepo, canaraSettings = null) {
    this.settingsRepo = settingsRepo;
    this.canaraSettings = canaraSettings;
  }

  setCanaraSettings(canaraSettings) {
    this.canaraSettings = canaraSettings;
  }

  async getOrCreateRow() {
    const existing = await this.settingsRepo.find({
      order: { id: 'ASC' },
      take: 1,
    });
    let row = existing[0];
    if (!row) {
      row = this.settingsRepo.create({
        enabled: false,
        razorpayKeyId: null,
        razorpayKeySecret: null,
        razorpayWebhookSecret: null,
        selfOnlineEnabled: false,
        selfOnlineUpiId: null,
        selfOnlineMerchantName: null,
        selfOnlinePaymentNote: 'Exam Fee',
        selfOnlineExpiryHours: 48,
        restrictExamApplyOnFeeDues: true,
      });
      row = await this.settingsRepo.save(row);
    }
    return row;
  }

  selfOnlinePublicFromRow(row) {
    const env = config.selfOnline || {};
    const dbUpi = row.selfOnlineUpiId?.trim() || '';
    const envUpi = env.upiId?.trim() || '';
    const upiId = dbUpi || envUpi;
    const merchantName =
      row.selfOnlineMerchantName?.trim() ||
      env.merchantName?.trim() ||
      'College Examination Fees';
    const note =
      row.selfOnlinePaymentNote?.trim() ||
      env.paymentNote?.trim() ||
      'Exam Fee';
    const expiryHours =
      Number(row.selfOnlineExpiryHours) ||
      Number(env.expiryHours) ||
      48;
    const enabled = dbUpi
      ? Boolean(row.selfOnlineEnabled)
      : Boolean(row.selfOnlineEnabled) || Boolean(env.enabled);
    const configured = Boolean(upiId);
    return {
      enabled,
      configured,
      ready: enabled && configured,
      upiId: configured ? upiId : null,
      merchantName,
      paymentNote: note,
      expiryHours,
    };
  }

  async getPaymentSettingsPublic() {
    const row = await this.getOrCreateRow();
    const envKey = config.razorpay?.keyId?.trim() || '';
    const envSecret = config.razorpay?.keySecret?.trim() || '';
    const keyId = row.razorpayKeyId?.trim() || envKey || null;
    const hasSecret = Boolean(row.razorpayKeySecret?.trim() || envSecret);
    const selfOnline = this.selfOnlinePublicFromRow(row);
    return {
      enabled: row.enabled,
      configured: Boolean(keyId && hasSecret),
      razorpayKeyId: keyId,
      razorpayKeySecretMasked: maskSecret(
        row.razorpayKeySecret?.trim() || envSecret || null,
      ),
      hasKeySecret: hasSecret,
      selfOnlineEnabled: selfOnline.enabled,
      selfOnlineConfigured: selfOnline.configured,
      selfOnlineReady: selfOnline.ready,
      selfOnlineUpiId: selfOnline.upiId,
      selfOnlineMerchantName: selfOnline.merchantName,
      selfOnlinePaymentNote: selfOnline.paymentNote,
      selfOnlineExpiryHours: selfOnline.expiryHours,
      restrictExamApplyOnFeeDues:
        row.restrictExamApplyOnFeeDues !== false &&
        row.restrictExamApplyOnFeeDues !== 0,
      updatedAt: row.updatedAt,
    };
  }

  async isExamDueRestrictionEnabled() {
    const row = await this.getOrCreateRow();
    return (
      row.restrictExamApplyOnFeeDues !== false &&
      row.restrictExamApplyOnFeeDues !== 0
    );
  }

  async updatePaymentSettings(dto) {
    const row = await this.getOrCreateRow();
    const patch = {};

    if (typeof dto.enabled === 'boolean') {
      patch.enabled = dto.enabled;
    }
    if (typeof dto.razorpayKeyId === 'string') {
      const v = dto.razorpayKeyId.trim();
      if (v) patch.razorpayKeyId = v;
    }
    if (typeof dto.razorpayKeySecret === 'string') {
      const v = dto.razorpayKeySecret.trim();
      if (v && !v.startsWith('••••')) patch.razorpayKeySecret = v;
    }
    if (typeof dto.razorpayWebhookSecret === 'string') {
      const v = dto.razorpayWebhookSecret.trim();
      if (v && !v.startsWith('••••')) patch.razorpayWebhookSecret = v;
    }
    if (typeof dto.selfOnlineEnabled === 'boolean') {
      patch.selfOnlineEnabled = dto.selfOnlineEnabled;
    }
    if (typeof dto.selfOnlineUpiId === 'string') {
      patch.selfOnlineUpiId = dto.selfOnlineUpiId.trim() || null;
    }
    if (typeof dto.selfOnlineMerchantName === 'string') {
      patch.selfOnlineMerchantName =
        dto.selfOnlineMerchantName.trim() || null;
    }
    if (typeof dto.selfOnlinePaymentNote === 'string') {
      patch.selfOnlinePaymentNote =
        dto.selfOnlinePaymentNote.trim() || 'Exam Fee';
    }
    if (dto.selfOnlineExpiryHours != null) {
      const h = parseInt(String(dto.selfOnlineExpiryHours), 10);
      if (!Number.isFinite(h) || h < 1 || h > 720) {
        throw AppError.badRequest(
          'selfOnlineExpiryHours must be between 1 and 720',
        );
      }
      patch.selfOnlineExpiryHours = h;
    }
    if (typeof dto.restrictExamApplyOnFeeDues === 'boolean') {
      patch.restrictExamApplyOnFeeDues = dto.restrictExamApplyOnFeeDues;
    }

    if (Object.keys(patch).length > 0) {
      await this.settingsRepo.update({ id: row.id }, patch);
    }
    return this.getPaymentSettingsPublic();
  }

  async getWebhookSecret() {
    const row = await this.getOrCreateRow();
    return (
      row.razorpayWebhookSecret?.trim() ||
      config.razorpay?.webhookSecret?.trim() ||
      null
    );
  }

  async getRazorpayConfig() {
    const row = await this.getOrCreateRow();
    const keyId =
      row.razorpayKeyId?.trim() || config.razorpay?.keyId?.trim() || '';
    const keySecret =
      row.razorpayKeySecret?.trim() ||
      config.razorpay?.keySecret?.trim() ||
      '';
    const webhookSecret =
      row.razorpayWebhookSecret?.trim() ||
      config.razorpay?.webhookSecret?.trim() ||
      null;

    if (!row.enabled) {
      throw AppError.badRequest(
        'Online payments are disabled. Enable Razorpay in Settings.',
      );
    }
    if (!keyId || !keySecret) {
      throw AppError.badRequest(
        'Razorpay credentials are not configured. Add Key ID and Secret in Settings.',
      );
    }

    return {
      enabled: true,
      keyId,
      keySecret,
      webhookSecret,
    };
  }

  getRazorpayStatusFromRow(row) {
    const envKey = config.razorpay?.keyId?.trim() || '';
    const envSecret = config.razorpay?.keySecret?.trim() || '';
    const keyId = row.razorpayKeyId?.trim() || envKey || null;
    const hasSecret = Boolean(row.razorpayKeySecret?.trim() || envSecret);
    const enabled = Boolean(row.enabled);
    const configured = Boolean(keyId && hasSecret);
    return {
      enabled,
      configured,
      ready: enabled && configured,
    };
  }

  async getRazorpayStatus() {
    const row = await this.getOrCreateRow();
    return this.getRazorpayStatusFromRow(row);
  }

  /**
   * Lightweight readiness for fee desk / student pay UI.
   * Canara comes from separate table via CanaraSettingsService.
   */
  async getPaymentMethodsStatus() {
    const row = await this.getOrCreateRow();
    const razorpay = this.getRazorpayStatusFromRow(row);
    const selfOnline = this.selfOnlinePublicFromRow(row);
    let canara = {
      enabled: false,
      mockMode: false,
      configured: false,
      ready: false,
      oauthReady: false,
      upiId: null,
      qrCallbackUrl: '',
    };
    if (this.canaraSettings) {
      canara = await this.canaraSettings.getReadyStatus();
    }
    return {
      razorpay: {
        enabled: razorpay.enabled,
        configured: razorpay.configured,
        ready: razorpay.ready,
      },
      selfOnline: {
        enabled: selfOnline.enabled,
        configured: selfOnline.configured,
        ready: selfOnline.ready,
        upiId: selfOnline.upiId,
        merchantName: selfOnline.merchantName,
      },
      canara,
    };
  }

  async getSelfOnlineStatus() {
    const row = await this.getOrCreateRow();
    return this.selfOnlinePublicFromRow(row);
  }

  async getSelfOnlineConfig() {
    const status = await this.getSelfOnlineStatus();
    if (!status.enabled) {
      throw AppError.badRequest(
        'Self Online payments are disabled. Enable them in Settings.',
      );
    }
    if (!status.upiId) {
      throw AppError.badRequest(
        'Self Online UPI ID is not configured. Add Merchant UPI ID in Settings.',
      );
    }
    return status;
  }
}

module.exports = { SettingsService };
