const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  parseStatementText,
  parseBankNarrationLine,
  parseAmountColumns,
} = require('../src/exam/self-online-statement-parse');

test('ignores balance and interest style lines that are not payment transactions', () => {
  const { rows, header } = parseStatementText(
    [
      'Closing balance as on 31-07-2025 81,210.52',
      'Interest 0.36',
      'Opening balance 80,000.00',
    ].join('\n'),
  );

  assert.deepEqual(rows, []);
  assert.equal(header.bankName, null);
});

test('parses debit and credit amount columns separately', () => {
  const debit = parseAmountColumns(
    '01/07/2026 01/07/2026 WDL TFR UPI/DR/988249472519/KOVIRI R/YESB/Q540001844/Paym 0097692162094 AT 08028 SRIRAMNAGAR (KAKINADA ) - 20.00 - 68.88',
  );
  assert.equal(debit.txnDirection, 'debit');
  assert.equal(debit.debitAmount, 20);
  assert.equal(debit.creditAmount, null);
  assert.equal(debit.amount, 20);
  assert.equal(debit.runningBalance, 68.88);

  const credit = parseAmountColumns(
    '22/07/2026 22/07/2026 DEP TFR UPI/CR/696846634477/Gollavil/SBIN/9121296733/Exam 0097734162099 AT 08028 SRIRAMNAGAR (KAKINADA ) - - 1.00 1.36',
  );
  assert.equal(credit.txnDirection, 'credit');
  assert.equal(credit.creditAmount, 1);
  assert.equal(credit.debitAmount, null);
  assert.equal(credit.amount, 1);
  assert.equal(credit.runningBalance, 1.36);
});

test('parses UPI narration lines with a usable identifier', () => {
  const row = parseBankNarrationLine(
    '22/07/2026 22/07/2026 DEP TFR UPI/CR/696846634477/John Doe/SBIN/9121296733/SO2026000026 - - 100.00 200.00',
  );

  assert.ok(row);
  assert.equal(row.utr, '696846634477');
  assert.equal(row.merchantReference, 'SO2026000026');
  assert.equal(row.amount, 100);
  assert.equal(row.txnDirection, 'credit');
  assert.equal(row.paymentMethod, 'UPI');
  assert.equal(row.paymentRail, 'UPI/CR');
});

test('parses multi-line SBI UPI credit blocks from bank statements', () => {
  const { rows } = parseStatementText(
    [
      '22/07/2026 22/07/2026 DEP TFR',
      'UPI/CR/696846634477/Gollavil/SBIN',
      '9121296733/Exam',
      '0097734162099 AT 08028',
      'SRIRAMNAGAR (KAKINADA )',
      '- - 1.00 1.36',
      '22/07/2026 22/07/2026 DEP TFR',
      'UPI/CR/610785804122/PENKE TEJA/BARB/7995207344/Pa',
      '0097734162099 AT 08028',
      'SRIRAMNAGAR (KAKINADA )',
      '- - 1.00 2.36',
    ].join('\n'),
  );

  assert.equal(rows.length, 2);
  assert.equal(rows[0].utr, '696846634477');
  assert.equal(rows[0].payerName, 'Gollavil');
  assert.equal(rows[0].creditAmount, 1);
  assert.equal(rows[0].paymentNote, 'Exam');
  assert.equal(rows[1].utr, '610785804122');
  assert.equal(rows[1].payerName, 'PENKE TEJA');
  assert.equal(rows[1].payerBankCode, 'BARB');
});

test('parses NEFT-style narration blocks with IFSC, UTR, and branch location', () => {
  const { rows } = parseStatementText(
    [
      '07/07/2026 07/07/2026 DEP TFR',
      'NEFT*HDFC0000001*HDFCH01111034329*PYDAHSOFT PRIVA',
      '0099509044300 AT 08028',
      'SRIRAMNAGAR (KAKINADA ) -- 14,291.00 14,309.88',
    ].join('\n'),
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].utr, 'HDFCH01111034329');
  assert.equal(rows[0].ifsc, 'HDFC0000001');
  assert.equal(rows[0].terminal, '08028');
  assert.equal(rows[0].paymentMethod, 'NEFT');
  assert.equal(rows[0].creditAmount, 14291);
  assert.equal(rows[0].payerName, 'PYDAHSOFT PRIVA');
});

test('extracts statement header from SBI PDF-style text', () => {
  const { header, rows } = parseStatementText(
    [
      'State Bank of India',
      'Branch Name : SRIRAMNAGAR',
      'Account Number',
      '41762846586',
      'SBIN0008028',
      'Statement From : 01-07-2026 to 22-07-2026',
      '22/07/2026 22/07/2026 DEP TFR UPI/CR/696846634477/Gollavil/SBIN/9121296733/Exam 0097734162099 AT 08028 SRIRAMNAGAR (KAKINADA ) - - 1.00 1.36',
      'Statement Summary : 01-07-2026 To 22-07-2026',
      'Brought Forward Dr Count Cr Count Total Debits Total Credits Closing Balance',
      '88.88CR 81,210.52 81,125.00 3.36CR 63 21',
    ].join('\n'),
  );

  assert.equal(header.bankName, 'State Bank of India');
  assert.equal(header.receiverIfsc, 'SBIN0008028');
  assert.equal(header.branchName, 'SRIRAMNAGAR');
  assert.equal(header.accountNumber, '41762846586');
  assert.equal(header.debitCount, 63);
  assert.equal(header.creditCount, 21);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].receiverIfsc, 'SBIN0008028');
});

test('parses the sample SBI account statement PDF when available locally', async () => {
  const pdfPath = path.join(
    process.env.USERPROFILE || '',
    'Downloads',
    'AccountStatement_22072026_133927-1.pdf',
  );
  if (!fs.existsSync(pdfPath)) {
    console.log('Skipping PDF integration test — sample file not found');
    return;
  }

  const { PDFParse } = require('pdf-parse');
  const buf = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buf });
  const parsed = await parser.getText();
  const text =
    typeof parsed === 'string' ? parsed : String(parsed?.text || parsed || '');
  await parser.destroy?.().catch?.(() => undefined);

  const { header, rows } = parseStatementText(text);
  assert.equal(header.bankName, 'State Bank of India');
  assert.equal(header.receiverIfsc, 'SBIN0008028');
  assert.ok(rows.length >= 80, `expected ~84 rows, got ${rows.length}`);

  const examCredit = rows.find((r) => r.utr === '696846634477');
  assert.ok(examCredit);
  assert.equal(examCredit.txnDirection, 'credit');
  assert.equal(examCredit.creditAmount, 1);
  assert.equal(examCredit.payerName, 'Gollavil');
  assert.equal(examCredit.paymentNote, 'Exam');

  const firstDebit = rows.find((r) => r.utr === '988249472519');
  assert.ok(firstDebit);
  assert.equal(firstDebit.txnDirection, 'debit');
  assert.equal(firstDebit.debitAmount, 20);
  assert.equal(firstDebit.amount, 20);
});

test('parses Canara UPI credit blocks with EMS payment note E0131802', () => {
  const sample = [
    'Current & Saving Account Statement',
    'PYDAH COLLEGE OF ENGINEERING',
    'IFSC Code CNRB0013258',
    'Account Holders Name PYDAH COLLEGE OF ENGINEERING',
    'Branch Name VAKALAPUDI, KAKINADA',
    'Account Number 120000042715',
    'Opening Balance Rs. 25,000.00',
    'Closing Balance Rs. 2,70,510.00',
    'Searched By From 23 Jul 2026 To 23 Jul 2026',
    'Txn Date Value Date Cheque No. Description Branch Code Debit Credit Balance',
    '23-07-2026 16:30:50 23 Jul 2026 411906747873 UPI/CR/411906747873/Boyidi Su/',
    'SBIN/**94963@ybl/Payment //',
    'YBL1384f2768cc0408b882a2db0e4a3116c/23/07/2026',
    '16:30:50',
    '33 10,400.00 2,70,500.00',
    '23-07-2026 16:31:15 23 Jul 2026 496261161212 UPI/CR/496261161212/Buraga R/',
    'SBIN/**62357@axl/E0131802//',
    'AXL267f5898a1be47f9bbe242d15a02e6c4/23/07/2026',
    '16:31:15',
    '33 10.00 2,70,510.00',
    'Disclaimer: Unless the constituent brings to the notice',
  ].join('\n');

  const { header, rows } = parseStatementText(sample);
  assert.equal(header.bankName, 'Canara Bank');
  assert.equal(header.receiverIfsc, 'CNRB0013258');
  assert.equal(header.accountNumber, '120000042715');
  assert.equal(header.openingBalance, 25000);
  assert.equal(header.closingBalance, 270510);
  assert.equal(rows.length, 2);

  assert.equal(rows[0].utr, '411906747873');
  assert.equal(rows[0].amount, 10400);
  assert.equal(rows[0].creditAmount, 10400);

  const hit = rows[1];
  assert.equal(hit.utr, '496261161212');
  assert.equal(hit.amount, 10);
  assert.equal(hit.creditAmount, 10);
  assert.equal(hit.paymentNote, 'E0131802');
  assert.equal(hit.merchantReference, 'E0131802');
  assert.equal(hit.payerName, 'Buraga R');
  assert.equal(hit.payerBankCode, 'SBIN');
  assert.equal(hit.txnDirection, 'credit');
  assert.equal(hit.receiverBankCode, 'CNRB');
});

test('parses the sample Canara account statement PDF when available locally', async () => {
  const pdfPath = 'e:/downloads/1784804801378.pdf';
  if (!fs.existsSync(pdfPath)) {
    console.log('Skipping Canara PDF integration test — sample file not found');
    return;
  }

  const { PDFParse } = require('pdf-parse');
  const buf = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buf });
  const parsed = await parser.getText();
  const text =
    typeof parsed === 'string' ? parsed : String(parsed?.text || parsed || '');
  await parser.destroy?.().catch?.(() => undefined);

  const { header, rows } = parseStatementText(text);
  assert.equal(header.bankName, 'Canara Bank');
  assert.equal(header.receiverIfsc, 'CNRB0013258');
  assert.ok(rows.length >= 29, `expected ~29 rows, got ${rows.length}`);

  const hit = rows.find((r) => r.paymentNote === 'E0131802');
  assert.ok(hit);
  assert.equal(hit.utr, '496261161212');
  assert.equal(hit.amount, 10);
  assert.equal(hit.merchantReference, 'E0131802');
});
