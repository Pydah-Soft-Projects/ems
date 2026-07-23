'use strict';

const { EntitySchema } = require('typeorm');

/**
 * Merchant statement upload for Self Online reconciliation.
 * PDF is the primary audit source; CSV/Excel are secondary.
 */
const MerchantStatement = new EntitySchema({
  name: 'MerchantStatement',
  tableName: 'merchant_statements',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    fileName: { type: 'varchar', length: 255 },
    fileFormat: { type: 'varchar', length: 20 },
    /** pdf | csv | xlsx — pdf preferred for integrity */
    sourceKind: { type: 'varchar', length: 20, default: 'pdf' },
    uploadedBy: { type: 'varchar', length: 150, nullable: true },
    uploadedByUsername: { type: 'varchar', length: 150, nullable: true },
    rawTextExcerpt: { type: 'text', nullable: true },
    rowCount: { type: 'int', default: 0 },
    notes: { type: 'text', nullable: true },
    bankName: { type: 'varchar', length: 100, nullable: true },
    branchName: { type: 'varchar', length: 150, nullable: true },
    branchCode: { type: 'varchar', length: 20, nullable: true },
    receiverIfsc: { type: 'varchar', length: 20, nullable: true },
    accountNumber: { type: 'varchar', length: 30, nullable: true },
    accountHolderName: { type: 'varchar', length: 150, nullable: true },
    statementFrom: { type: 'datetime', nullable: true },
    statementTo: { type: 'datetime', nullable: true },
    openingBalance: { type: 'decimal', precision: 14, scale: 2, nullable: true },
    closingBalance: { type: 'decimal', precision: 14, scale: 2, nullable: true },
    totalDebits: { type: 'decimal', precision: 14, scale: 2, nullable: true },
    totalCredits: { type: 'decimal', precision: 14, scale: 2, nullable: true },
    debitCount: { type: 'int', nullable: true },
    creditCount: { type: 'int', nullable: true },
    createdAt: { type: 'datetime', createDate: true },
  },
  relations: {
    transactions: {
      type: 'one-to-many',
      target: 'MerchantStatementTxn',
      inverseSide: 'statement',
    },
  },
});

const MerchantStatementTxn = new EntitySchema({
  name: 'MerchantStatementTxn',
  tableName: 'merchant_statement_txns',
  indices: [
    { name: 'IDX_mst_utr', columns: ['utr'] },
    { name: 'IDX_mst_merchant_ref', columns: ['merchantReference'] },
    { name: 'IDX_mst_status', columns: ['matchStatus'] },
    { name: 'IDX_mst_direction', columns: ['txnDirection'] },
  ],
  columns: {
    id: { type: 'int', primary: true, generated: true },
    statementId: { type: 'int' },
    postDate: { type: 'datetime', nullable: true },
    valueDate: { type: 'datetime', nullable: true },
    txnType: { type: 'varchar', length: 30, nullable: true },
    paymentMethod: { type: 'varchar', length: 20, nullable: true },
    paymentRail: { type: 'varchar', length: 20, nullable: true },
    txnDirection: { type: 'varchar', length: 10, nullable: true },
    utr: { type: 'varchar', length: 100, nullable: true },
    internalBankRef: { type: 'varchar', length: 30, nullable: true },
    merchantReference: { type: 'varchar', length: 100, nullable: true },
    transactionReference: { type: 'varchar', length: 100, nullable: true },
    ifsc: { type: 'varchar', length: 20, nullable: true },
    terminal: { type: 'varchar', length: 20, nullable: true },
    branchLocation: { type: 'varchar', length: 150, nullable: true },
    payerName: { type: 'varchar', length: 150, nullable: true },
    payeeName: { type: 'varchar', length: 150, nullable: true },
    payerBankCode: { type: 'varchar', length: 20, nullable: true },
    payerUpi: { type: 'varchar', length: 150, nullable: true },
    receiverBankCode: { type: 'varchar', length: 20, nullable: true },
    receiverIfsc: { type: 'varchar', length: 20, nullable: true },
    debitAmount: { type: 'decimal', precision: 10, scale: 2, nullable: true },
    creditAmount: { type: 'decimal', precision: 10, scale: 2, nullable: true },
    amount: { type: 'decimal', precision: 10, scale: 2 },
    runningBalance: { type: 'decimal', precision: 14, scale: 2, nullable: true },
    paymentNote: { type: 'varchar', length: 255, nullable: true },
    narration: { type: 'text', nullable: true },
    txnDate: { type: 'datetime', nullable: true },
    statusRaw: { type: 'varchar', length: 50, nullable: true },
    rawLine: { type: 'text', nullable: true },
    /** unmatched | suggested | matched | ignored */
    matchStatus: { type: 'varchar', length: 20, default: 'unmatched' },
    matchedPaymentId: { type: 'int', nullable: true },
    matchConfidence: { type: 'varchar', length: 20, nullable: true },
    matchReason: { type: 'varchar', length: 255, nullable: true },
    createdAt: { type: 'datetime', createDate: true },
  },
  relations: {
    statement: {
      type: 'many-to-one',
      target: 'MerchantStatement',
      joinColumn: { name: 'statementId' },
      inverseSide: 'transactions',
      onDelete: 'CASCADE',
    },
  },
});

module.exports = { MerchantStatement, MerchantStatementTxn };
