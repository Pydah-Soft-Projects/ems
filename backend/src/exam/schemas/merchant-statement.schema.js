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
  ],
  columns: {
    id: { type: 'int', primary: true, generated: true },
    statementId: { type: 'int' },
    utr: { type: 'varchar', length: 100, nullable: true },
    merchantReference: { type: 'varchar', length: 100, nullable: true },
    transactionReference: { type: 'varchar', length: 100, nullable: true },
    amount: { type: 'decimal', precision: 10, scale: 2 },
    txnDate: { type: 'datetime', nullable: true },
    payerName: { type: 'varchar', length: 150, nullable: true },
    payerUpi: { type: 'varchar', length: 150, nullable: true },
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
