'use strict';

/**
 * Fee Management Mongo models (separate connection from HRMS).
 * Schemas mirror the Fee Management portal; strict:false where
 * existing documents may carry extra fields we do not use.
 */

function registerFeeManagementModels(connection) {
  const Schema = connection.base.Schema;

  const ensureModel = (name, schemaFactory, collection) => {
    if (connection.models[name]) return connection.models[name];
    const schema = schemaFactory();
    return collection
      ? connection.model(name, schema, collection)
      : connection.model(name, schema);
  };

  const FeeHead = ensureModel(
    'FeeHead',
    () =>
      new Schema(
        {
          name: { type: String, required: true, unique: true, trim: true },
          code: { type: String, unique: true, trim: true, sparse: true },
          description: { type: String },
          type: {
            type: String,
            enum: ['GLOBAL', 'REGULATION_SPECIFIC'],
            default: 'GLOBAL',
          },
          defaultAmount: { type: Number, default: 0 },
          regulationAmounts: [
            {
              regulationId: { type: String },
              regulationCode: { type: String },
              amount: { type: Number, required: true },
              effectiveUntil: { type: Date },
              amountAfterEnd: { type: Number },
            },
          ],
          isMandatory: { type: Boolean, default: false },
          isActive: { type: Boolean, default: true },
        },
        { timestamps: true, strict: false },
      ),
  );

  const FeeGroup = ensureModel(
    'FeeGroup',
    () =>
      new Schema(
        {
          name: { type: String },
          code: { type: String, trim: true },
          feeHeads: [{ type: Schema.Types.ObjectId, ref: 'FeeHead' }],
        },
        { timestamps: true, strict: false },
      ),
  );

  const ReceiptSequence = ensureModel('ReceiptSequence', () => {
    const receiptSequenceSchema = new Schema(
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
    return receiptSequenceSchema;
  });

  const PaymentConfig = ensureModel(
    'PaymentConfig',
    () =>
      new Schema(
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
      ),
  );

  const Transaction = ensureModel(
    'Transaction',
    () =>
      new Schema(
        {
          studentId: { type: String, required: true },
          studentName: { type: String },
          feeHead: {
            type: Schema.Types.ObjectId,
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
            type: Schema.Types.ObjectId,
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
          emsPaymentId: { type: Number },
          emsFeeRecordId: { type: Number },
          emsLineType: { type: String },
          source: { type: String },
        },
        { timestamps: true, strict: false },
      ),
  );

  const Settings = ensureModel(
    'FeeMgmtSettings',
    () => new Schema({}, { timestamps: true, strict: false }),
    'settings',
  );

  const StudentFee = ensureModel(
    'StudentFee',
    () =>
      new Schema(
        {
          studentId: { type: String, required: true },
          studentName: { type: String },
          feeHead: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'FeeHead',
          },
          structureId: {
            type: Schema.Types.ObjectId,
            ref: 'FeeStructure',
          },
          college: { type: String, required: true },
          course: { type: String, required: true },
          branch: { type: String, required: true },
          academicYear: { type: String, required: true },
          studentYear: { type: Number, required: true },
          semester: { type: Number },
          termNumber: { type: Number },
          amount: { type: Number, required: true },
          isActive: { type: Boolean, default: true },
          remarks: { type: String },
          isScholarshipApplicable: { type: Boolean, default: false },
          isTermsDivided: { type: Boolean, default: true },
          stud_type: { type: String },
        },
        { timestamps: true, strict: false },
      ),
  );

  const FeeStructure = ensureModel(
    'FeeStructure',
    () =>
      new Schema(
        {
          college: { type: String },
          course: { type: String },
          branch: { type: String },
          batch: { type: String },
          category: { type: String },
          academicYear: { type: String },
          studentYear: { type: Number },
          semester: { type: Number },
        },
        { timestamps: true, strict: false },
      ),
  );

  const OverallConcessionRequest = ensureModel(
    'OverallConcessionRequest',
    () => {
      const concessionEntrySchema = new Schema(
        {
          feeHeadId: { type: String, required: true },
          feeHeadCode: { type: String, default: '' },
          studentYear: { type: Number, required: true },
          semester: { type: Number, default: null },
          amount: { type: Number, required: true },
          concessionType: {
            type: String,
            enum: ['CONCESSION', 'REVISED'],
            default: 'CONCESSION',
          },
        },
        { _id: false },
      );
      return new Schema(
        {
          admissionNumber: { type: String, required: true },
          studentName: { type: String, required: true },
          pinNo: { type: String, default: '-' },
          college: { type: String, required: true },
          course: { type: String, required: true },
          branch: { type: String, required: true },
          batch: { type: String, required: true },
          category: { type: String, default: 'Regular' },
          concessions: [concessionEntrySchema],
          status: {
            type: String,
            enum: ['PENDING', 'APPROVED', 'REJECTED'],
            default: 'PENDING',
          },
          requestedBy: { type: String, required: true },
          requestedByName: { type: String, default: '' },
          approvedBy: { type: String, default: '' },
          approvedByName: { type: String, default: '' },
          concessionGivenBy: { type: String, default: '' },
          rejectionReason: { type: String, default: '' },
        },
        { timestamps: true, strict: false },
      );
    },
  );

  const ConcessionRequest = ensureModel(
    'ConcessionRequest',
    () =>
      new Schema(
        {
          studentId: { type: String, required: true },
          studentName: { type: String },
          studentPin: { type: String },
          voucherId: { type: String },
          feeHead: {
            type: Schema.Types.ObjectId,
            ref: 'FeeHead',
            required: true,
          },
          amount: { type: Number, required: true },
          reason: { type: String, required: true },
          imageUrl: { type: String },
          studentYear: { type: String, required: true },
          semester: { type: String },
          college: { type: String },
          course: { type: String },
          branch: { type: String },
          batch: { type: String },
          type: {
            type: String,
            enum: ['Single', 'Bulk'],
            default: 'Single',
          },
          status: {
            type: String,
            enum: ['PENDING', 'APPROVED', 'REJECTED'],
            default: 'PENDING',
          },
          requestedBy: { type: String, required: true },
          approvedBy: { type: String },
          rejectionReason: { type: String },
          concessionGivenBy: { type: String },
        },
        { timestamps: true, strict: false },
      ),
  );

  return {
    FeeHead,
    FeeGroup,
    Transaction,
    ReceiptSequence,
    PaymentConfig,
    Settings,
    StudentFee,
    FeeStructure,
    OverallConcessionRequest,
    ConcessionRequest,
  };
}

module.exports = { registerFeeManagementModels };
