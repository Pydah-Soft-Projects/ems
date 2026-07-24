'use strict';

require('dotenv').config();
const { createExamPortalDataSource } = require('../src/database/data-source');
const config = require('../src/config/configuration');
const { ExamService } = require('../src/exam/exam.service');
const { SelfOnlineService } = require('../src/exam/self-online.service');

async function main() {
  try {
    console.log('=== Initializing database ===');
    const dataSource = createExamPortalDataSource();
    await dataSource.initialize();
    console.log('✓ Database connected');

    const examService = new ExamService(config, dataSource);
    const selfOnlineService = new SelfOnlineService(config, examService, dataSource);

    console.log('\n=== Calling tryAutoMatchPayment for payment 44 ===');
    const result = await selfOnlineService.tryAutoMatchPayment(44);
    console.log('\n=== tryAutoMatchPayment result ===');
    console.log(result);

    // After matching, check if it worked!
    const paymentRepo = dataSource.getRepository('Payment');
    const updatedPayment = await paymentRepo.findOne({ where: { id: 44 } });
    console.log('\n=== Payment status after tryAutoMatchPayment ===');
    console.log('status:', updatedPayment.status, 'receiptNumber:', updatedPayment.receiptNumber);

  } catch (err) {
    console.error('❌ Error in script:', err);
    console.error(err.stack);
  } finally {
    console.log('\n=== Script finished, exiting ===');
    process.exit(0);
  }
}

main();
