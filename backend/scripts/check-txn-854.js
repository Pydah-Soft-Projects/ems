'use strict';

require('dotenv').config();
const { createExamPortalDataSource } = require('../src/database/data-source');

async function main() {
  const dataSource = await createExamPortalDataSource();
  await dataSource.initialize();

  const stmtTxnRepo = dataSource.getRepository('MerchantStatementTxn');
  const txn = await stmtTxnRepo.findOne({ where: { id: 854 }});
  console.log('Txn 854:', txn ? { id: txn.id, matchStatus: txn.matchStatus, merchantReference: txn.merchantReference} : 'not found');

  process.exit(0);
}
main();
