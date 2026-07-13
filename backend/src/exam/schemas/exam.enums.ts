export enum ExamType {
  REGULAR = 'regular',
  SUPPLY = 'supply',
  IMPROVEMENT = 'improvement',
  SPECIAL_SUPPLY = 'special_supply',
}

export enum ExamStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PUBLISHED = 'published',
}

export enum FeeStatus {
  PENDING = 'pending',
  PAID = 'paid',
}

export enum PaymentMode {
  ONLINE = 'online',
  OFFLINE = 'offline',
}

export enum PaymentMethod {
  UPI = 'upi',
  DEBIT_CARD = 'debit_card',
  CREDIT_CARD = 'credit_card',
  NET_BANKING = 'net_banking',
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
}

export enum PaymentStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
}
