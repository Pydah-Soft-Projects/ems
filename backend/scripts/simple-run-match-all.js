'use strict';

require('dotenv').config();
const { createExamPortalDataSource } = require('../src/database/data-source');
const { PaymentStatus } = require('../src/exam/schemas/exam.enums');
const { roundMoney, normalizeRef } = require('../src/exam/self-online-statement-parse');

// Copy of scoreMatch
function scoreMatch(pay, txn) {
  console.log('    scoreMatch: Checking txn id', txn.id, '- amount:', txn.amount);
  const amountOk = roundMoney(pay.amount) === roundMoney(txn.amount);
  if (!amountOk) {
    console.log('    scoreMatch: ❌ amount mismatch (payment amount:', pay.amount, 'txn amount:', txn.amount, ')');
    return { confidence: 'none', reason: 'amount_mismatch', autoEligible: false };
  }
  console.log('    scoreMatch: ✓ amount matches');

  const orderRef = normalizeRef(pay.orderRef);
  const refs = [
    { field: 'merchantReference', value: normalizeRef(txn.merchantReference) },
    { field: 'transactionReference', value: normalizeRef(txn.transactionReference) },
    { field: 'rawLine', value: normalizeRef(txn.rawLine) },
    { field: 'narration', value: normalizeRef(txn.narration) },
    { field: 'paymentNote', value: normalizeRef(txn.paymentNote) },
  ].filter(r => r.value);

  if (orderRef) {
    console.log('    scoreMatch: Checking for orderRef', orderRef, 'in fields:', refs.map(r => r.field));
    const matchingRef = refs.find(r => r.value.includes(orderRef));
    if (matchingRef) {
      console.log('    scoreMatch: ✓ orderRef match! Found in', matchingRef.field);
      return { confidence: 'high', reason: 'order_ref_match', autoEligible: true };
    }
    console.log('    scoreMatch: No orderRef match');
  }

  const studentUtr = normalizeRef(pay.studentUtr);
  if (studentUtr) {
    console.log('    scoreMatch: Checking for studentUtr', studentUtr, 'in fields');
    const utrRefs = [
      { field: 'utr', value: normalizeRef(txn.utr) },
      { field: 'transactionReference', value: normalizeRef(txn.transactionReference) },
      { field: 'internalBankRef', value: normalizeRef(txn.internalBankRef) },
      { field: 'rawLine', value: normalizeRef(txn.rawLine) },
      { field: 'narration', value: normalizeRef(txn.narration) },
      { field: 'paymentNote', value: normalizeRef(txn.paymentNote) },
    ].filter(r => r.value);
    const matchingUtrRef = utrRefs.find(r => r.value.includes(studentUtr));
    if (matchingUtrRef) {
      console.log('    scoreMatch: ✓ studentUtr match! Found in', matchingUtrRef.field);
      return { confidence: 'high', reason: 'utr_match', autoEligible: true };
    }
    console.log('    scoreMatch: No studentUtr match');
  }

  if (txn.txnDate && pay.createdAt) {
    const a = new Date(txn.txnDate).getTime();
    const b = new Date(pay.createdAt).getTime();
    const day = 24 * 60 * 60 * 1000;
    if (Math.abs(a - b) <= day) {
      console.log('    scoreMatch: ~ amount + date match (medium confidence)');
      return { confidence: 'medium', reason: 'amount_and_date', autoEligible: false };
    }
  }

  console.log('    scoreMatch: Only amount match (low confidence)');
  return { confidence: 'low', reason: 'amount_only', autoEligible: false };
}

async function main() {
  try {
    const dataSource = await createExamPortalDataSource();
    await dataSource.initialize();

    const paymentRepo = dataSource.getRepository('Payment');
    const stmtTxnRepo = dataSource.getRepository('MerchantStatementTxn');
    const feeRecordRepo = dataSource.getRepository('FeeRecord');

    // 1. Get all awaiting_verification payments
    console.log('=== Step 1: Fetching awaiting_verification payments ===');
    const awaitingPayments = await paymentRepo.find({
      where: { paymentMode: 'self_online', status: PaymentStatus.AWAITING_VERIFICATION },
      take: 10
    });
    console.log(`Found ${awaitingPayments.length} payments`);

    // 2. Get all unmatched txns
    console.log('\n=== Step 2: Fetching unmatched statement txns ===');
    const unmatchedTxns = await stmtTxnRepo.find({
      where: { matchStatus: 'unmatched' },
      take: 1000
    });
    console.log(`Found ${unmatchedTxns.length} unmatched txns`);

    // 3. Process only payment 44
    const payment = awaitingPayments.find(p => p.id === 44);
    if (payment) {
      console.log(`\n=== Processing payment ${payment.id} (orderRef ${payment.transactionReference}) ===`);
      let studentUtr = null;
      try {
        const gw = payment.gatewayResponse ? JSON.parse(payment.gatewayResponse) : {};
        studentUtr = gw.studentUtr || null;
      } catch {
        // ignore
      }
      const payView = {
        id: payment.id,
        orderRef: payment.transactionReference,
        amount: roundMoney(payment.amountPaid),
        studentUtr,
        createdAt: payment.paidAt
      };
      console.log('payView:', payView);

      // Check only txn 854
      const txn854 = unmatchedTxns.find(t => t.id === 854);
      if (txn854) {
        console.log('\n--- Checking txn id 854 ---');
        const score = scoreMatch(payView, txn854);
        console.log('score:', score);
        if (score.autoEligible) {
          console.log('✅✅✅ Txn 854 is auto-eligible! It should be matched!');
        }
      } else {
        console.log('❌ Txn 854 not found in unmatched txns!');
      }
    } else {
      console.log('❌ Payment 44 not found!');
    }

  } catch (err) {
    console.error('❌ Error:', err);
    console.error(err.stack);
  } finally {
    process.exit(0);
  }
}

main();
