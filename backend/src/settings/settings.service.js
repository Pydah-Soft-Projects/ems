'use strict';

const { config } = require('../config');
const { AppError } = require('../common/errors');

function maskSecret(value) {
  if (!value) return null;
  if (value.length <= 4) return '••••';
  return `••••${value.slice(-4)}`;
}

class SettingsService {
  constructor(settingsRepo) {
    this.settingsRepo = settingsRepo;
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
      });
      row = await this.settingsRepo.save(row);
    }
    return row;
  }

  selfOnlinePublicFromRow(row) {
    const upiId = row.selfOnlineUpiId?.trim() || '';
    const merchantName =
      row.selfOnlineMerchantName?.trim() || 'College Examination Fees';
    const note = row.selfOnlinePaymentNote?.trim() || 'Exam Fee';
    const expiryHours = Number(row.selfOnlineExpiryHours) || 48;
    const enabled = Boolean(row.selfOnlineEnabled);
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
      updatedAt: row.updatedAt,
    };
  }

  async updatePaymentSettings(dto) {
    const row = await this.getOrCreateRow();
    if (typeof dto.enabled === 'boolean') {
      row.enabled = dto.enabled;
    }
    if (typeof dto.razorpayKeyId === 'string') {
      const v = dto.razorpayKeyId.trim();
      if (v) row.razorpayKeyId = v;
    }
    if (typeof dto.razorpayKeySecret === 'string') {
      const v = dto.razorpayKeySecret.trim();
      if (v && !v.startsWith('••••')) row.razorpayKeySecret = v;
    }
    if (typeof dto.razorpayWebhookSecret === 'string') {
      const v = dto.razorpayWebhookSecret.trim();
      if (v && !v.startsWith('••••')) row.razorpayWebhookSecret = v;
    }
    if (typeof dto.selfOnlineEnabled === 'boolean') {
      row.selfOnlineEnabled = dto.selfOnlineEnabled;
    }
    if (typeof dto.selfOnlineUpiId === 'string') {
      row.selfOnlineUpiId = dto.selfOnlineUpiId.trim() || null;
    }
    if (typeof dto.selfOnlineMerchantName === 'string') {
      row.selfOnlineMerchantName = dto.selfOnlineMerchantName.trim() || null;
    }
    if (typeof dto.selfOnlinePaymentNote === 'string') {
      row.selfOnlinePaymentNote = dto.selfOnlinePaymentNote.trim() || 'Exam Fee';
    }
    if (dto.selfOnlineExpiryHours != null) {
      const h = parseInt(String(dto.selfOnlineExpiryHours), 10);
      if (!Number.isFinite(h) || h < 1 || h > 720) {
        throw AppError.badRequest('selfOnlineExpiryHours must be between 1 and 720');
      }
      row.selfOnlineExpiryHours = h;
    }
    await this.settingsRepo.save(row);
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

  async getRazorpayStatus() {
    const pub = await this.getPaymentSettingsPublic();
    return {
      enabled: pub.enabled,
      configured: pub.configured,
      ready: pub.enabled && pub.configured,
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
