const test = require('node:test');
const assert = require('node:assert/strict');
const { parseStatementText, parseBankNarrationLine } = require('../src/exam/self-online-statement-parse');

test('ignores balance and interest style lines that are not payment transactions', () => {
  const rows = parseStatementText([
    'Closing balance as on 31-07-2025 81,210.52',
    'Interest 0.36',
    'Opening balance 80,000.00',
  ].join('\n'));

  assert.deepEqual(rows, []);
});

test('parses UPI narration lines with a usable identifier', () => {
  const row = parseBankNarrationLine('UPI/CR/696846634477/John Doe/Ref SO2026000026 ₹100.00');

  assert.ok(row);
  assert.equal(row.utr, '696846634477');
  assert.equal(row.merchantReference, 'SO2026000026');
  assert.equal(row.amount, 100);
});

test('extracts order references that are concatenated with surrounding text', () => {
  const row = parseBankNarrationLine('OrderStudentAmountStatusUTRSO2026000029KakinadaPVRTCampus112234₹1pending—');

  assert.ok(row);
  assert.equal(row.merchantReference, 'SO2026000029');
  assert.equal(row.amount, 1);
});

test('parses multi-line UPI narration blocks from bank statements', () => {
  const rows = parseStatementText([
    'DEP TFR',
    'UPI/CR/696846634477/Gollavil/SB',
    'IN/9121296733/Exam',
    '0097734162099 AT 08028',
    'SRIRAMNAGAR (KAKINADA )',
    '22/07/2026',
    '22/07/2026',
    'DEP TFR',
    'UPI/CR/610785804122/PENKE TEJA/BARB/7995207344/SO',
    '0097734162099 AT 08028',
    'SRIRAMNAGAR (KAKINADA )',
    '22/07/2026',
    '22/07/2026',
  ].join('\n'));

  assert.equal(rows.length, 2);
  assert.equal(rows[0].utr, '696846634477');
  assert.equal(rows[0].payerName, 'Gollavil');
  assert.equal(rows[1].utr, '610785804122');
  assert.equal(rows[1].payerName, 'PENKE TEJA');
});

test('parses NEFT-style narration blocks with IFSC, UTR, and location', () => {
  const rows = parseStatementText([
    '07/07/2026 07/07/2026',
    'DEP TFR',
    'NEFT*HDFC0000001*HDFCH01111034329*PYDAHSOFT PRIVA',
    '0099509044300 AT 08028',
    'SRIRAMNAGAR (KAKINADA )-- 14,291.00 14,309.80',
  ].join('\n'));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].utr, 'HDFCH01111034329');
  assert.equal(rows[0].ifsc, 'HDFC0000001');
  assert.equal(rows[0].terminal, '08028');
  assert.equal(rows[0].location, 'SRIRAMNAGAR (KAKINADA)');
});
