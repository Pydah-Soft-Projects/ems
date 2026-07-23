'use strict';

/**
 * Migration: Add full parsed-statement columns to merchant_statements
 * and merchant_statement_txns.
 * Run: node scripts/migrate-merchant-statement-txn-columns.js
 */

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('node:path');
const { buildMysqlSslOptions } = require('../src/config/mysql-ssl');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function addMissingColumns(connection, dbName, tableName, columns) {
  const [existing] = await connection.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME = ? AND TABLE_SCHEMA = ?`,
    [tableName, dbName],
  );
  const existingColumns = existing.map((col) => col.COLUMN_NAME);
  let added = 0;
  for (const col of columns) {
    if (!existingColumns.includes(col.name)) {
      console.log(`  + ${tableName}.${col.name}`);
      await connection.query(
        `ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.definition}`,
      );
      added += 1;
    }
  }
  return added;
}

async function main() {
  const host =
    process.env.EXAM_PORTAL_DB_HOST ||
    'student-database.cfu0qmo26gh3.ap-south-1.rds.amazonaws.com';
  const port = parseInt(process.env.EXAM_PORTAL_DB_PORT || '3306', 10);
  const user = process.env.EXAM_PORTAL_DB_USER || 'admin';
  const password = process.env.EXAM_PORTAL_DB_PASSWORD || '';
  const dbName = process.env.EXAM_PORTAL_DB_NAME || 'examination_portal';
  const ssl = (process.env.EXAM_PORTAL_DB_SSL || 'true') === 'true';

  console.log('\n=== Merchant Statement Columns Migration ===\n');

  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database: dbName,
    ssl: buildMysqlSslOptions(ssl),
  });

  try {
    const statementCols = [
      { name: 'bankName', definition: 'VARCHAR(100) NULL' },
      { name: 'branchName', definition: 'VARCHAR(150) NULL' },
      { name: 'branchCode', definition: 'VARCHAR(20) NULL' },
      { name: 'receiverIfsc', definition: 'VARCHAR(20) NULL' },
      { name: 'accountNumber', definition: 'VARCHAR(30) NULL' },
      { name: 'accountHolderName', definition: 'VARCHAR(150) NULL' },
      { name: 'statementFrom', definition: 'DATETIME NULL' },
      { name: 'statementTo', definition: 'DATETIME NULL' },
      { name: 'openingBalance', definition: 'DECIMAL(14,2) NULL' },
      { name: 'closingBalance', definition: 'DECIMAL(14,2) NULL' },
      { name: 'totalDebits', definition: 'DECIMAL(14,2) NULL' },
      { name: 'totalCredits', definition: 'DECIMAL(14,2) NULL' },
      { name: 'debitCount', definition: 'INT NULL' },
      { name: 'creditCount', definition: 'INT NULL' },
    ];

    const txnCols = [
      { name: 'postDate', definition: 'DATETIME NULL' },
      { name: 'valueDate', definition: 'DATETIME NULL' },
      { name: 'txnType', definition: 'VARCHAR(30) NULL' },
      { name: 'paymentMethod', definition: 'VARCHAR(20) NULL' },
      { name: 'paymentRail', definition: 'VARCHAR(20) NULL' },
      { name: 'txnDirection', definition: 'VARCHAR(10) NULL' },
      { name: 'internalBankRef', definition: 'VARCHAR(30) NULL' },
      { name: 'ifsc', definition: 'VARCHAR(20) NULL' },
      { name: 'terminal', definition: 'VARCHAR(20) NULL' },
      { name: 'branchLocation', definition: 'VARCHAR(150) NULL' },
      { name: 'payeeName', definition: 'VARCHAR(150) NULL' },
      { name: 'payerBankCode', definition: 'VARCHAR(20) NULL' },
      { name: 'receiverBankCode', definition: 'VARCHAR(20) NULL' },
      { name: 'receiverIfsc', definition: 'VARCHAR(20) NULL' },
      { name: 'debitAmount', definition: 'DECIMAL(10,2) NULL' },
      { name: 'creditAmount', definition: 'DECIMAL(10,2) NULL' },
      { name: 'runningBalance', definition: 'DECIMAL(14,2) NULL' },
      { name: 'paymentNote', definition: 'VARCHAR(255) NULL' },
      { name: 'narration', definition: 'TEXT NULL' },
    ];

    console.log('merchant_statements:');
    const sAdded = await addMissingColumns(
      connection,
      dbName,
      'merchant_statements',
      statementCols,
    );
    console.log(`merchant_statement_txns:`);
    const tAdded = await addMissingColumns(
      connection,
      dbName,
      'merchant_statement_txns',
      txnCols,
    );

    console.log(`\nDone. Added ${sAdded + tAdded} column(s).\n`);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
