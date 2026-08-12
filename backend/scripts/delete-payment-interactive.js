'use strict';

const readline = require('node:readline');
const { createExamPortalDataSource } = require('../src/database/data-source');
const { PaymentStatus } = require('../src/exam/schemas/exam.enums');

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

async function main() {
  const dataSource = createExamPortalDataSource();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    await dataSource.initialize();
    const paymentRepo = dataSource.getRepository('Payment');
    const feeRepo = dataSource.getRepository('ExamFeeRecord');

    const payments = await paymentRepo
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.feeRecord', 'feeRecord')
      .leftJoinAndSelect('feeRecord.exam', 'exam')
      .orderBy('payment.paidAt', 'DESC')
      .addOrderBy('payment.id', 'DESC')
      .getMany();

    if (!payments.length) {
      console.log('No payment transactions found.');
      return;
    }

    console.table(payments.map((payment, index) => ({
      select: index + 1,
      id: payment.id,
      receipt: payment.receiptNumber,
      student: payment.feeRecord?.studentName || '-',
      pin: payment.feeRecord?.studentRollNumber || '-',
      exam: payment.feeRecord?.exam?.name || '-',
      amount: payment.amountPaid,
      method: payment.paymentMethod,
      status: payment.status,
      paidAtIST: formatDate(payment.paidAt),
    })));

    const selectedText = String(await ask(rl, '\nEnter the selection number to delete, or q to quit: ')).trim();
    if (selectedText.toLowerCase() === 'q') return;

    const selection = Number(selectedText);
    if (!Number.isInteger(selection) || selection < 1 || selection > payments.length) {
      throw new Error('Invalid selection.');
    }

    const payment = payments[selection - 1];
    console.log(`\nSelected payment #${payment.id}: ${payment.receiptNumber} / ${payment.feeRecord?.studentName || '-'} / ${payment.amountPaid}`);
    const confirmation = String(await ask(rl, 'Type DELETE to permanently delete this transaction: ')).trim();
    if (confirmation !== 'DELETE') {
      console.log('Deletion cancelled.');
      return;
    }

    await dataSource.transaction(async (manager) => {
      const managerPaymentRepo = manager.getRepository('Payment');
      const managerFeeRepo = manager.getRepository('ExamFeeRecord');
      await managerPaymentRepo.delete(payment.id);

      if (payment.feeRecordId) {
        const remainingPaid = await managerPaymentRepo.count({
          where: {
            feeRecordId: payment.feeRecordId,
            status: PaymentStatus.SUCCESS,
          },
        });
        if (remainingPaid === 0) {
          await managerFeeRepo.update(payment.feeRecordId, { status: 'pending' });
        }
      }
    });

    console.log(`Deleted payment transaction ${payment.id}.`);
    console.log('The fee record was set to pending when no other successful payment remained.');
  } finally {
    rl.close();
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(`Deletion failed: ${error.message}`);
  process.exitCode = 1;
});
