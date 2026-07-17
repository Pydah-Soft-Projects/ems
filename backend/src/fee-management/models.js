'use strict';

/**
 * Fee Management Mongo models (separate connection from HRMS).
 * Schemas mirror the Fee Management portal; strict:false where
 * existing documents may carry extra fields we do not use.
 */

function registerFeeManagementModels(connection) {
  if (connection.models.FeeHead) {
    return {
      FeeHead: connection.models.FeeHead,
      FeeGroup: connection.models.FeeGroup,
      Transaction: connection.models.Transaction,
      ReceiptSequence: connection.models.ReceiptSequence,
      PaymentConfig: connection.models.PaymentConfig,
    };
  }

  const feeHeadSchema = new connection.base.Schema(
    {
      name: { type: String, required: true, unique: true, trim: true },
      code: { type: String, unique: true, trim: true, sparse: true },
      description: { type: String },
    },
    { timestamps: true },
  );

  const feeGroupSchema = new connection.base.Schema(
    {
      name: { type: String },
      code: { type: String, trim: true },
      feeHeads: [{ type: connection.base.Schema.Types.ObjectId, ref: 'FeeHead' }],
    },
    { timestamps: true, strict: false },
  );

  const receiptSequenceSchema = new connection.base.Schema(
    {
      collegeCode: { type: String, required: true },
      courseCode: { type: String, required: true },
      groupCode: { type: String, required: true },
      financialYear: { type: String, required: true },
      nextNumber: { type: Number, default: 0 },
    },
    { timestamps: true },
  );
  receiptSequenceSchema.index(
    { collegeCode: 1, courseCode: 1, groupCode: 1, financialYear: 1 },
    { unique: true },
  );

  const paymentConfigSchema = new connection.base.Schema(
    {
      collegeCode: { type: String },
      courseCode: { type: String },
      college: { type: String },
      course: { type: String },
      enableCustom: { type: Boolean, default: false },
      enableCustomReceipt: { type: Boolean },
      padding: { type: Number, default: 6 },
      receiptPadding: { type: Number },
      separator: { type: String, default: '-' },
      receiptSeparator: { type: String },
    },
    { timestamps: true, strict: false },
  );

  const transactionSchema = new connection.base.Schema(
    {
      studentId: { type: String, required: true },
      studentName: { type: String },
      feeHead: {
        type: connection.base.Schema.Types.ObjectId,
        ref: 'FeeHead',
      },
      amount: { type: Number, required: true },
      paymentDate: { type: Date, default: Date.now },
      transactionType: {
        type: String,
        enum: ['DEBIT', 'CREDIT'],
        default: 'DEBIT',
      },
      paymentMode: {
        type: String,
        enum: [
          'Cash',
          'UPI',
          'Cheque',
          'DD',
          'Card',
          'Net Banking',
          'Adjustment',
          'Waiver',
          'Refund',
          'Credit',
          'RTF',
        ],
        default: 'Cash',
      },
      bankName: { type: String },
      instrumentDate: { type: Date },
      referenceNo: { type: String },
      referenceDate: { type: Date },
      gatewayPaymentId: { type: String, unique: true, sparse: true },
      remarks: { type: String },
      semester: { type: String },
      studentYear: { type: String },
      receiptNumber: { type: String },
      collectedBy: { type: String },
      collectedByName: { type: String },
      paymentConfigId: {
        type: connection.base.Schema.Types.ObjectId,
        ref: 'PaymentConfig',
      },
      depositedToAccount: { type: String },
      status: {
        type: String,
        enum: ['active', 'cancelled'],
        default: 'active',
      },
      cancelledBy: { type: String },
      cancelledByName: { type: String },
      cancelledAt: { type: Date },
      cancellationReason: { type: String },
      // EMS cross-reference (extra fields; Fee Mgmt ignores unknown if strict)
      emsPaymentId: { type: Number },
      emsFeeRecordId: { type: Number },
      source: { type: String },
    },
    { timestamps: true, strict: false },
  );

  return {
    FeeHead: connection.model('FeeHead', feeHeadSchema),
    FeeGroup: connection.model('FeeGroup', feeGroupSchema),
    Transaction: connection.model('Transaction', transactionSchema),
    ReceiptSequence: connection.model('ReceiptSequence', receiptSequenceSchema),
    PaymentConfig: connection.model('PaymentConfig', paymentConfigSchema),
  };
}

module.exports = { registerFeeManagementModels };
