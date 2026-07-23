'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { createExamPortalDataSource } = require('../src/database/data-source');
const { createServices } = require('../src/database/container');
const { MerchantStatement, MerchantStatementTxn } = require('../src/exam/schemas/merchant-statement.schema');

(async () => {
  const dataSource = createExamPortalDataSource();
  await dataSource.initialize();
  try {
    const services = createServices(dataSource, null);
    const statementRepo = dataSource.getRepository(MerchantStatement);
    const txnRepo = dataSource.getRepository(MerchantStatementTxn);

    const statements = await statementRepo.find({ order: { id: 'ASC' } });
    const beforeTxns = await txnRepo.find({ order: { id: 'ASC' } });
    const beforeCounts = beforeTxns.reduce((acc, txn) => {
      acc[txn.matchStatus] = (acc[txn.matchStatus] || 0) + 1;
      return acc;
    }, {});

    const beforePending = await services.selfOnline.listPending();
    const beforeAwaiting = beforePending.filter((p) => p.status === 'awaiting_verification').length;

    let autoVerified = 0;
    let suggested = 0;
    for (const statement of statements) {
      const summary = await services.selfOnline.runAutoMatchForStatement(statement.id);
      autoVerified += summary.autoVerified || 0;
      suggested += summary.suggested || 0;
    }

    const afterTxns = await txnRepo.find({ order: { id: 'ASC' } });
    const afterCounts = afterTxns.reduce((acc, txn) => {
      acc[txn.matchStatus] = (acc[txn.matchStatus] || 0) + 1;
      return acc;
    }, {});

    const afterPending = await services.selfOnline.listPending();
    const afterAwaiting = afterPending.filter((p) => p.status === 'awaiting_verification').length;

    const matchedChanged = afterTxns.filter((txn) => txn.matchStatus === 'matched').length;
    const suggestedChanged = afterTxns.filter((txn) => txn.matchStatus === 'suggested').length;

    console.log(JSON.stringify({
      statementsFound: statements.length,
      before: {
        matchStatuses: beforeCounts,
        awaitingPayments: beforeAwaiting,
      },
      after: {
        matchStatuses: afterCounts,
        awaitingPayments: afterAwaiting,
      },
      summary: {
        autoVerified,
        suggested,
        matchedTxns: matchedChanged,
        suggestedTxns: suggestedChanged,
      },
      matchedTxns: afterTxns.filter((txn) => txn.matchStatus === 'matched').map((txn) => ({ id: txn.id, utr: txn.utr, amount: txn.amount, matchedPaymentId: txn.matchedPaymentId })),
    }, null, 2));
  } finally {
    await dataSource.destroy();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
