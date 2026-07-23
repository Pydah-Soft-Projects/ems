export type SelfOnlineStatus = {
  enabled: boolean;
  configured: boolean;
  ready: boolean;
  upiId: string | null;
  merchantName: string;
  paymentNote: string;
  expiryHours: number;
};

export type SelfOnlineOrder = {
  paymentId: number;
  feeRecordId: number;
  orderRef: string;
  amount: number;
  currency: string;
  status: string;
  receiptNumber: string;
  temporary: boolean;
  merchantUpiId: string;
  merchantName: string;
  paymentNote: string;
  upiUrl: string;
  qrDataUrl: string;
  expiresInHours: number;
  studentName: string;
  studentRollNumber: string;
  examName: string | null;
  instructions: string[];
};

export type SelfOnlineClaimResult = {
  payment: import('@/types/fee').Payment;
  feeRecord: import('@/types/fee').ExamFeeRecord;
  acknowledgement: {
    type: string;
    title: string;
    status: string;
    orderRef: string;
    amount: number;
    receiptNumber: string;
    message: string;
  };
};

export type SelfOnlinePendingRow = {
  id: number;
  orderRef: string | null;
  amount: number;
  status: string;
  receiptNumber: string;
  studentUtr: string | null;
  studentName?: string;
  studentRollNumber?: string;
  examName?: string;
  feeRecordId: number;
  createdAt: string;
  claimedAt: string | null;
};

export type SelfOnlineSuggestion = {
  paymentId: number;
  orderRef: string | null;
  paymentAmount: number;
  studentName?: string;
  studentRollNumber?: string;
  studentUtr: string | null;
  merchantTxnId: number;
  utr: string | null;
  merchantReference: string | null;
  txnAmount: number;
  txnDate: string | null;
  confidence: string;
  reason: string;
  autoEligible: boolean;
};

export type SelfOnlineStatementTxn = {
  id: number;
  statementId: number;
  fileName?: string;
  sourceKind?: string;
  postDate: string | null;
  valueDate: string | null;
  txnType: string | null;
  paymentMethod: string | null;
  paymentRail: string | null;
  txnDirection: string | null;
  utr: string | null;
  internalBankRef: string | null;
  merchantReference: string | null;
  transactionReference: string | null;
  ifsc: string | null;
  terminal: string | null;
  branchLocation: string | null;
  payerName: string | null;
  payeeName: string | null;
  payerBankCode: string | null;
  payerUpi: string | null;
  receiverBankCode: string | null;
  receiverIfsc: string | null;
  debitAmount: number | null;
  creditAmount: number | null;
  amount: number;
  runningBalance: number | null;
  paymentNote: string | null;
  narration: string | null;
  txnDate: string | null;
  matchStatus: string;
  matchedPaymentId: number | null;
  matchConfidence: string | null;
  matchReason: string | null;
  rawLine: string | null;
};
