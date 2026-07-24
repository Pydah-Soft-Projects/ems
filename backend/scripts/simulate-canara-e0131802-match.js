'use strict';

/**
 * Simulate Canara Self Online reconcile for payment note E0131802:
 * 1) Parse Canara PDF
 * 2) Create awaiting_verification Self Online payment (orderRef E0131802, ₹10)
 * 3) Upload statement rows
 * 4) scoreMatch only (matching logic unchanged) — does NOT auto-verify / mark fee paid
 *
 * Usage: node scripts/simulate-canara-e0131802-match.js [path-to-pdf]
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { createExamPortalDataSource } = require('../src/database/data-source');
const { createServices } = require('../src/database/container');
const {
  ExamFeeRecord,
  Payment,
} = require('../src/exam/schemas/fee.schema');
const {
  PaymentMode,
  PaymentMethod,
  PaymentStatus,
  FeeStatus,
} = require('../src/exam/schemas/exam.enums');
const {
  parseStatementText,
  normalizeRef,
  roundMoney,
} = require('../src/exam/self-online-statement-parse');

const ORDER_REF = 'E0131802';
const AMOUNT = 10;
const DEFAULT_PDF = 'e:/downloads/1784804801378.pdf';

async function extractPdfText(pdfPath) {
  const { PDFParse } = require('pdf-parse');
  const buf = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buf });
  try {
    const parsed = await parser.getText();
    return {
      buffer: buf,
      text:
        typeof parsed === 'string'
          ? parsed
          : String(parsed?.text || parsed || ''),
    };
  } finally {
    await parser.destroy?.().catch?.(() => undefined);
  }
}

async function main() {
  const pdfPath = process.argv[2] || DEFAULT_PDF;
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`);
  }

  console.log('=== 1) Parse Canara PDF ===');
  const { buffer, text } = await extractPdfText(pdfPath);
  const { header, rows } = parseStatementText(text);
  console.log({
    bankName: header.bankName,
    ifsc: header.receiverIfsc,
    accountNumber: header.accountNumber,
    rowCount: rows.length,
  });

  const hit = rows.find(
    (r) =>
      normalizeRef(r.paymentNote) === ORDER_REF ||
      normalizeRef(r.merchantReference) === ORDER_REF,
  );
  if (!hit) {
    throw new Error(`Parsed rows do not contain payment note ${ORDER_REF}`);
  }
  console.log('Parsed target row:', {
    utr: hit.utr,
    amount: hit.amount,
    paymentNote: hit.paymentNote,
    merchantReference: hit.merchantReference,
    payerName: hit.payerName,
  });

  const dataSource = createExamPortalDataSource();
  await dataSource.initialize();
  try {
    const services = createServices(dataSource, null);
    const feeRepo = dataSource.getRepository(ExamFeeRecord);
    const paymentRepo = dataSource.getRepository(Payment);
    const txnRepo = dataSource.getRepository('MerchantStatementTxn');

    console.log('\n=== 2) Upload Canara statement (parse → store rows) ===');
    // Upload before creating the sim payment so upload's built-in auto-match
    // does not verify this payment; we only scoreMatch below.
    const upload = await services.selfOnline.uploadStatement({
      buffer,
      fileName: path.basename(pdfPath),
      mimeType: 'application/pdf',
      uploadedBy: 'simulate-script',
      uploadedByUsername: 'simulate-canara-e0131802',
      notes: `simulation upload for ${ORDER_REF}`,
    });
    const statementId = upload.statement.id;
    console.log({
      statementId,
      parsedCount: upload.parsedCount,
      matchSummary: upload.matchSummary,
    });

    const txns = await txnRepo.find({ where: { statementId } });
    const matchedTxn = txns.find(
      (t) =>
        normalizeRef(t.paymentNote) === ORDER_REF ||
        normalizeRef(t.merchantReference) === ORDER_REF,
    );
    if (!matchedTxn) {
      throw new Error(
        `Statement ${statementId} has no stored txn with note ${ORDER_REF}`,
      );
    }
    console.log('Stored target txn:', {
      id: matchedTxn.id,
      utr: matchedTxn.utr,
      amount: Number(matchedTxn.amount),
      paymentNote: matchedTxn.paymentNote,
      merchantReference: matchedTxn.merchantReference,
      matchStatus: matchedTxn.matchStatus,
    });

    console.log('\n=== 3) Create awaiting_verification payment ===');
    const fee = await feeRepo.findOne({
      where: { status: FeeStatus.PENDING },
      order: { id: 'DESC' },
    });
    if (!fee) {
      throw new Error(
        'No pending exam_fee_records found — cannot attach a simulation payment',
      );
    }

    const receiptNumber = `TMP-SO-SIM-${ORDER_REF}-${Date.now()}`;
    const payment = await paymentRepo.save(
      paymentRepo.create({
        feeRecordId: fee.id,
        amountPaid: AMOUNT,
        paymentMode: PaymentMode.SELF_ONLINE,
        paymentMethod: PaymentMethod.UPI,
        status: PaymentStatus.AWAITING_VERIFICATION,
        receiptNumber,
        transactionReference: ORDER_REF,
        remarks: `simulate canara match ${ORDER_REF}`,
        gatewayResponse: JSON.stringify({
          provider: 'self_online',
          orderRef: ORDER_REF,
          simulated: true,
          claimedAt: new Date().toISOString(),
          audit: [
            {
              at: new Date().toISOString(),
              event: 'simulate_created_awaiting_verification',
              orderRef: ORDER_REF,
            },
          ],
        }),
      }),
    );
    console.log({
      paymentId: payment.id,
      feeRecordId: fee.id,
      status: payment.status,
      orderRef: payment.transactionReference,
      amountPaid: Number(payment.amountPaid),
      receiptNumber: payment.receiptNumber,
    });

    console.log(
      '\n=== 4) scoreMatch (matching logic unchanged; no verify) ===',
    );
    const payView = {
      id: payment.id,
      amount: roundMoney(payment.amountPaid),
      orderRef: payment.transactionReference,
      studentUtr: null,
      createdAt: payment.paidAt || new Date(),
    };
    const score = services.selfOnline.scoreMatch(payView, matchedTxn);
    console.log('scoreMatch result:', score);

    const amountOk =
      roundMoney(payment.amountPaid) === roundMoney(matchedTxn.amount);
    const noteOk =
      normalizeRef(matchedTxn.paymentNote) === ORDER_REF ||
      normalizeRef(matchedTxn.merchantReference) === ORDER_REF;

    console.log('\n=== Summary ===');
    console.log(
      JSON.stringify(
        {
          pdf: pdfPath,
          parsedRows: rows.length,
          paymentId: payment.id,
          statementId,
          statementTxnId: matchedTxn.id,
          orderRef: ORDER_REF,
          amountOk,
          noteOk,
          score,
          wouldAutoVerify: Boolean(score.autoEligible),
          note: 'Payment left as awaiting_verification — verify manually in UI if desired',
        },
        null,
        2,
      ),
    );

    if (!score.autoEligible || score.reason !== 'order_ref_match') {
      process.exitCode = 2;
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
