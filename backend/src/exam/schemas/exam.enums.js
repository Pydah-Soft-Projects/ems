'use strict';

const ExamType = {
  REGULAR: 'regular',
  SUPPLY: 'supply',
  IMPROVEMENT: 'improvement',
  SPECIAL_SUPPLY: 'special_supply',
};

const ExamStatus = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PUBLISHED: 'published',
};

const FeeStatus = {
  PENDING: 'pending',
  PAID: 'paid',
};

const PaymentMode = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  SELF_ONLINE: 'self_online',
  CANARA_UPI: 'canara_upi',
};

const PaymentMethod = {
  UPI: 'upi',
  DEBIT_CARD: 'debit_card',
  CREDIT_CARD: 'credit_card',
  NET_BANKING: 'net_banking',
  CASH: 'cash',
  BANK_TRANSFER: 'bank_transfer',
};

const PaymentStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  AWAITING_VERIFICATION: 'awaiting_verification',
  SUCCESS: 'success',
  FAILED: 'failed',
  VOIDED: 'voided',
  EXPIRED: 'expired',
};

const UPI_CONVENIENCE_FEE_RATE = 0.022;

module.exports = {
  ExamType,
  ExamStatus,
  FeeStatus,
  PaymentMode,
  PaymentMethod,
  PaymentStatus,
  UPI_CONVENIENCE_FEE_RATE,
};
