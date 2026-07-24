'use strict';

require('dotenv').config();
const { createExamPortalDataSource } = require('../src/database/data-source');

// Manually define functions we need to test
function roundMoney(n) {
  if (n == null || n === '') return null;
  const v = Math.round(Number(n) * 100) / 100;
  return Number.isFinite(v) ? v : null;
}

function normalizeRef(value) {
  if (value == null) return null;
  const s = String(value).trim().toUpperCase();
  return s || null;
}

function scoreMatch(pay, txn) {
  console.log('    scoreMatch: Checking txn id', txn.id, '- amount:', txn.amount);
  const amountOk =
    roundMoney(pay.amount) === roundMoney(txn.amount);
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
      return {
        confidence: 'high', reason: 'order_ref_match', autoEligible: true, matchingField: matchingRef.field };
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
      return { confidence: 'high', reason: 'utr_match', autoEligible: true, matchingField: matchingUtrRef.field };
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
    console.log('=== Initializing database ===');
    const dataSource = await createExamPortalDataSource();
    await dataSource.initialize();
    console.log('✓ Database connected');

    const paymentRepo = dataSource.getRepository('Payment');
    const stmtTxnRepo = dataSource.getRepository('MerchantStatementTxn');

    // 1. Get payment with transactionReference = 'E018'
    console.log('\n--- Fetching payment with orderRef = E018 ---');
    const payments = await paymentRepo.find({
      where: { transactionReference: 'E018' },
      take: 1
    });
    if (!payments.length) {
      console.log('❌ No payment found with orderRef E018');
      return;
    }
    const payment = payments[0];
    console.log('✓ Found payment:', { id: payment.id, amountPaid: payment.amountPaid, status: payment.status, gatewayResponse: payment.gatewayResponse });

    // Parse studentUtr from gatewayResponse
    let studentUtr = null;
    try {
      const gw = payment.gatewayResponse ? JSON.parse(payment.gatewayResponse) : {};
      studentUtr = gw.studentUtr || null;
    } catch (e) {
      console.warn('⚠️ Could not parse gatewayResponse:', payment.gatewayResponse);
    }
    const payView = {
      id: payment.id,
      orderRef: payment.transactionReference,
      amount: roundMoney(payment.amountPaid),
      studentUtr,
      createdAt: payment.paidAt
    };
    console.log('Pay view for testing:', payView);

    // 2. Get all unmatched statement transactions (take last 20)
    console.log('\n--- Fetching unmatched statement txns ---');
    const unmatched = await stmtTxnRepo.find({
      where: { matchStatus: 'unmatched' },
      order: { id: 'DESC' },
      take: 20
    });
    console.log(`✓ Found ${unmatched.length} unmatched txns`);

    // 3. Check each txn against our payment!
    console.log('\n--- Checking each unmatched txn ---');
    for (const txn of unmatched) {
      console.log('\n--- Checking txn id', txn.id, '---');
      console.log('Txn details:', {
        amount: txn.amount,
        utr: txn.utr,
        merchantReference: txn.merchantReference,
        transactionReference: txn.transactionReference,
        internalBankRef: txn.internalBankRef,
        narration: txn.narration,
        rawLine: txn.rawLine,
        paymentNote: txn.paymentNote,
        txnDate: txn.txnDate
      });
      const score = scoreMatch(payView, txn);
      console.log('Score result:', score);
    }

  } catch (err) {
    console.error('❌ Error in manual debug script:', err);
    console.error(err.stack);
  } finally {
    console.log('\n=== Script finished, exiting ===');
    process.exit(0);
  }
}

main();
