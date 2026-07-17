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
      });
      row = await this.settingsRepo.save(row);
    }
    return row;
  }

  async getPaymentSettingsPublic() {
    const row = await this.getOrCreateRow();
    const envKey = config.razorpay?.keyId?.trim() || '';
    const envSecret = config.razorpay?.keySecret?.trim() || '';
    const keyId = row.razorpayKeyId?.trim() || envKey || null;
    const hasSecret = Boolean(row.razorpayKeySecret?.trim() || envSecret);
    return {
      enabled: row.enabled,
      configured: Boolean(keyId && hasSecret),
      razorpayKeyId: keyId,
      razorpayKeySecretMasked: maskSecret(
        row.razorpayKeySecret?.trim() || envSecret || null,
      ),
      hasKeySecret: hasSecret,
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
}

module.exports = { SettingsService };
