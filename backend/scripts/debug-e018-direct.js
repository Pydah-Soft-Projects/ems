'use strict';

require('dotenv').config();
const { createExamPortalDataSource } = require('../src/database/data-source');
const { SelfOnlineService } = require('../src/exam/self-online.service');
const { ExamService } = require('../src/exam/exam.service');
const config = require('../src/config/configuration');
const { PaymentMode, PaymentStatus } = require('../src/exam/schemas/exam.enums');

async function main() {
  try {
    console.log('=== Initializing database ===');
    const dataSource = await createExamPortalDataSource();
    await dataSource.initialize();
    console.log('✓ Database connected');

    // Initialize necessary services
    const examService = new ExamService(config, dataSource);
    const selfOnlineService = new SelfOnlineService(config, examService, dataSource);

    // First let's just get all payments and statement txns to see current state
    console.log('\n--- Current payments with orderRef E018 ---');
    const paymentRepo = dataSource.getRepository('Payment');
    const paymentsWithE018 = await paymentRepo.find({
      where: { transactionReference: 'E018' },
    });
    console.log(paymentsWithE018);

    console.log('\n--- Current unmatched statement transactions ---');
    const stmtTxnRepo = dataSource.getRepository('MerchantStatementTxn');
    const unmatchedTxns = await stmtTxnRepo.find({
      where: { matchStatus: 'unmatched' },
      order: { id: 'DESC' },
      take: 5
    });
    console.log(unmatchedTxns.map(t => ({ id: t.id, amount: t.amount, narration: t.narration, rawLine: t.rawLine })));

    console.log('\n=== Starting runAutoMatchAll ===');
    const result = await selfOnlineService.runAutoMatchAll();
    console.log('\n=== runAutoMatchAll complete! Result ===');
    console.log(result);

  } catch (err) {
    console.error('❌ Error in debug script:', err);
    console.error(err.stack);
  } finally {
    console.log('\n=== Script finished, exiting ===');
    process.exit(0);
  }
}

main();
