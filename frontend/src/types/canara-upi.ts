export type CanaraUpiStatus = {
  enabled: boolean;
  configured: boolean;
  ready: boolean;
  missing?: string[];
  environment?: string | null;
  merchantName?: string | null;
  upiId?: string | null;
  credentialExpiresAt?: string | null;
  rotationDueSoon?: boolean;
};

export type CanaraUpiOrder = {
  paymentId: number;
  feeRecordId: number;
  amount: number;
  currency: string;
  status: string;
  receiptNumber: string;
  extTransactionId: string;
  qrString: string;
  qrDataUrl: string;
  upiUrl: string | null;
  merchantName: string | null;
  merchantUpiId: string | null;
  studentName: string;
  studentRollNumber: string;
  examName: string | null;
  credentialVersionId: number | null;
  instructions: string[];
};

export type CanaraUpiSyncResult = {
  paymentId: number;
  status: string;
  feeStatus: string;
  alreadyPaid?: boolean;
  synced?: boolean;
  pending?: boolean;
  bank?: Record<string, unknown>;
};

export type CanaraUpiCredentialVersionPublic = {
  id: number;
  isActive: boolean;
  enabled: boolean;
  environment: string;
  baseUrl: string | null;
  clientId: string | null;
  clientSecretMasked: string | null;
  aesSecretKeyHexMasked: string | null;
  privateKeyPemMasked: string | null;
  clientPublicCertPemMasked: string | null;
  bankPublicCertPemMasked: string | null;
  merchantMid: string | null;
  merchantSid: string | null;
  terminalId: string | null;
  upiId: string | null;
  merchantName: string | null;
  accountNumber: string | null;
  ifscCode: string | null;
  mcc: string | null;
  mobileNumber: string | null;
  bankName: string | null;
  callbackUrl: string | null;
  credentialExpiresAt: string | null;
  activatedAt: string | null;
  deactivatedAt: string | null;
  changeReason: string | null;
  changedFields: string[];
  changedByUserId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CanaraUpiSettingsResponse = {
  hasVersion: boolean;
  enabled: boolean;
  configured: boolean;
  ready: boolean;
  missing: string[];
  credentialExpiresAt: string | null;
  rotationDueSoon: boolean;
  version: CanaraUpiCredentialVersionPublic | null;
};
