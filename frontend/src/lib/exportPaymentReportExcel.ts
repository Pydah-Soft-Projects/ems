import * as XLSX from 'xlsx';

export type PaymentReportSummaryRow = {
  particular: string;
  count: string | number;
  amount: string | number;
};

export type PaymentReportExamSummaryRow = {
  exam: string;
  batchBreakdown?: string;
  count: string | number;
  amount: string | number;
  lateFee: string | number;
};

export type Column = { key: string; label: string; width?: number };

export type PaymentReportSection = {
  sectionTitle?: string;
  examName?: string;
  batch?: string;
  branch?: string;
  columns: Column[];
  rows: Array<Record<string, any>>;
  footer?: string;
  footerData?: {
    countLabel?: string;
    totalActual?: number;
    totalLate?: number;
    totalAmount?: number;
  };
};

export type PaymentReportExcelInput = {
  collegeName: string;
  documentTitle: string;
  periodLabel: string;
  generatedAt: string;
  filters: string[];
  transactionSummaryTitle: string;
  transactionSummary: PaymentReportSummaryRow[];
  examSummary?: PaymentReportExamSummaryRow[] | null;
  detailedSectionTitle?: string;
  sections?: PaymentReportSection[];
  grandTotal?: string;
  fileName: string;
};

function parseMoneyNum(val: any): number {
  if (typeof val === 'number') return val;
  if (!val || val === '-') return 0;
  const str = String(val).replace(/[^0-9.-]/g, '');
  const num = Number(str);
  return Number.isNaN(num) ? 0 : num;
}

function getCleanSheetName(rawName: string, index: number, existingNames: Set<string>): string {
  let clean = rawName
    .replace(/[:\/?*\[\]\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) clean = `Exam ${index + 1}`;
  if (clean.length > 28) clean = clean.substring(0, 28).trim();

  let finalName = clean;
  let counter = 1;
  while (existingNames.has(finalName.toLowerCase())) {
    const suffix = `_${counter}`;
    const maxBaseLen = 28 - suffix.length;
    finalName = `${clean.substring(0, maxBaseLen)}${suffix}`;
    counter += 1;
  }
  existingNames.add(finalName.toLowerCase());
  return finalName;
}

export function downloadPaymentReportExcel(input: PaymentReportExcelInput) {
  const wb = XLSX.utils.book_new();
  const existingSheetNames = new Set<string>();

  // ==========================================
  // TAB 1: OVERALL SUMMARY SHEET
  // ==========================================
  const summaryAoa: (string | number | null)[][] = [];
  const summaryMerges: XLSX.Range[] = [];
  let sumRowIdx = 0;

  const addSummaryBanner = (text: string) => {
    summaryAoa.push([text]);
    summaryMerges.push({
      s: { r: sumRowIdx, c: 0 },
      e: { r: sumRowIdx, c: 4 },
    });
    sumRowIdx += 1;
  };

  addSummaryBanner(input.collegeName.toUpperCase());
  addSummaryBanner('EXAMINATION CELL');
  addSummaryBanner(`${input.documentTitle.toUpperCase()} - OVERALL SUMMARY`);
  addSummaryBanner(input.periodLabel);
  addSummaryBanner(`Generated: ${input.generatedAt}`);

  summaryAoa.push([]);
  sumRowIdx += 1;

  // Transaction / Due Summary Table
  addSummaryBanner(input.transactionSummaryTitle.toUpperCase());
  summaryAoa.push(['Particulars', 'Count', 'Amount (Rs.)']);
  sumRowIdx += 1;

  for (const row of input.transactionSummary) {
    const count = typeof row.count === 'number' ? row.count : Number(row.count) || row.count;
    const amount = parseMoneyNum(row.amount);
    summaryAoa.push([row.particular, count, amount]);
    sumRowIdx += 1;
  }

  summaryAoa.push([]);
  sumRowIdx += 1;

  // Exam-wise Summary Table
  if (input.examSummary?.length) {
    addSummaryBanner('EXAM-WISE SUMMARY');
    summaryAoa.push(['Examination', 'Batch Breakdown', 'Count', 'Amount (Rs.)', 'Late Fee (Rs.)']);
    sumRowIdx += 1;

    for (const row of input.examSummary) {
      const count = typeof row.count === 'number' ? row.count : Number(row.count) || row.count;
      const amount = parseMoneyNum(row.amount);
      const lateFee = parseMoneyNum(row.lateFee);
      summaryAoa.push([row.exam, row.batchBreakdown || '-', count, amount, lateFee]);
      sumRowIdx += 1;
    }
  }

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
  wsSummary['!merges'] = summaryMerges;
  wsSummary['!cols'] = [
    { wch: 36 }, // Col A: Particulars / Examination
    { wch: 22 }, // Col B: Batch Breakdown
    { wch: 14 }, // Col C: Count
    { wch: 18 }, // Col D: Amount (Rs.)
    { wch: 18 }, // Col E: Late Fee (Rs.)
  ];

  const summarySheetName = getCleanSheetName('Summary', 0, existingSheetNames);
  XLSX.utils.book_append_sheet(wb, wsSummary, summarySheetName);

  // ==========================================
  // SEPARATE INDIVIDUAL EXAM WORKSHEET TABS
  // ==========================================
  const sections = input.sections || [];

  // Group sections by Exam Name
  const examMap = new Map<string, PaymentReportSection[]>();
  for (const sec of sections) {
    let examName = sec.examName;
    if (!examName && sec.sectionTitle) {
      const match = sec.sectionTitle.match(/Exam:\s*(.+)$/i);
      if (match) examName = match[1].trim();
    }
    if (!examName) examName = 'General Report';

    const list = examMap.get(examName) || [];
    list.push(sec);
    examMap.set(examName, list);
  }

  let examIndex = 0;
  for (const [examName, examSections] of examMap.entries()) {
    examIndex += 1;
    const detailAoa: (string | number | null)[][] = [];
    const detailMerges: XLSX.Range[] = [];
    let detRowIdx = 0;

    const sampleCols = examSections[0]?.columns || [];
    const numDetailCols = Math.max(8, sampleCols.length);

    const addDetailBanner = (text: string) => {
      detailAoa.push([text]);
      detailMerges.push({
        s: { r: detRowIdx, c: 0 },
        e: { r: detRowIdx, c: numDetailCols - 1 },
      });
      detRowIdx += 1;
    };

    // Exam Sheet Header Banner
    addDetailBanner(input.collegeName.toUpperCase());
    addDetailBanner('EXAMINATION CELL');
    addDetailBanner(`${input.documentTitle.toUpperCase()} - ${examName.toUpperCase()}`);
    addDetailBanner(input.periodLabel);
    addDetailBanner(`Generated: ${input.generatedAt}`);

    detailAoa.push([]);
    detRowIdx += 1;

    let totalExamCount = 0;
    let totalExamActual = 0;
    let totalExamLate = 0;
    let totalExamAmount = 0;

    for (const section of examSections) {
      const batchLabel = section.batch ? `BATCH: ${section.batch}` : section.sectionTitle || 'RECORDS';
      addDetailBanner(`>>>  ${batchLabel.toUpperCase()}  <<<`);

      // Table Header Row
      const colHeaders = section.columns.map((c) => c.label);
      detailAoa.push(colHeaders);
      detRowIdx += 1;

      // Table Data Rows
      for (const r of section.rows) {
        const rowVals = section.columns.map((c) => {
          const val = r[c.key];
          if (val == null || val === '') return '-';
          if (c.key === 'sno') return Number(val) || val;
          if (c.key === 'amount' || c.key === 'lateFee' || c.key === 'applied') {
            return parseMoneyNum(val);
          }
          return val;
        });
        detailAoa.push(rowVals);
        detRowIdx += 1;
      }

      // Batch Subtotal Row
      if (section.footerData) {
        const footerRow: (string | number | null)[] = new Array(section.columns.length).fill(null);
        footerRow[0] = 'Subtotal:';
        if (section.footerData.countLabel) {
          footerRow[1] = section.footerData.countLabel;
        }

        section.columns.forEach((col, idx) => {
          if (col.key === 'amount' && section.footerData?.totalActual != null) {
            footerRow[idx] = section.footerData.totalActual;
            totalExamActual += section.footerData.totalActual;
          }
          if (col.key === 'lateFee' && section.footerData?.totalLate != null) {
            footerRow[idx] = section.footerData.totalLate;
            totalExamLate += section.footerData.totalLate;
          }
          if (col.key === 'totalAmount' && section.footerData?.totalAmount != null) {
            footerRow[idx] = section.footerData.totalAmount;
            totalExamAmount += section.footerData.totalAmount;
          }
        });
        totalExamCount += section.rows.length;
        detailAoa.push(footerRow);
        detRowIdx += 1;
      } else if (section.footer) {
        addDetailBanner(section.footer);
      }

      detailAoa.push([]);
      detRowIdx += 1;
    }

    // Exam Total Summary Row
    const examSummaryRow: (string | number | null)[] = new Array(numDetailCols).fill(null);
    examSummaryRow[0] = `EXAM TOTAL (${examName}):`;
    examSummaryRow[1] = `${totalExamCount} total students`;

    sampleCols.forEach((col, idx) => {
      if (col.key === 'amount') examSummaryRow[idx] = totalExamActual;
      if (col.key === 'lateFee') examSummaryRow[idx] = totalExamLate;
      if (col.key === 'totalAmount') examSummaryRow[idx] = totalExamAmount;
    });

    detailAoa.push(examSummaryRow);
    detRowIdx += 1;

    const wsExam = XLSX.utils.aoa_to_sheet(detailAoa);
    wsExam['!merges'] = detailMerges;

    // Calculate column widths for this specific Exam sheet ignoring banner rows
    const mergedDetailIndices = new Set(detailMerges.map((m) => m.s.r));
    const maxDetailCols = detailAoa.reduce((max, row) => Math.max(max, row.length), 0);
    const detailColWidths: { wch: number }[] = [];

    for (let c = 0; c < maxDetailCols; c += 1) {
      let maxLen = 10;
      for (let r = 0; r < detailAoa.length; r += 1) {
        if (mergedDetailIndices.has(r)) continue;
        const row = detailAoa[r];
        const val = row[c];
        if (val != null) {
          const str = String(val);
          maxLen = Math.max(maxLen, str.length);
        }
      }
      detailColWidths.push({ wch: Math.min(Math.max(maxLen + 4, 10), 50) });
    }

    wsExam['!cols'] = detailColWidths;

    const sheetTabName = getCleanSheetName(examName, examIndex, existingSheetNames);
    XLSX.utils.book_append_sheet(wb, wsExam, sheetTabName);
  }

  const excelFileName = input.fileName.endsWith('.xlsx')
    ? input.fileName
    : input.fileName.replace(/\.pdf$/i, '.xlsx');

  XLSX.writeFile(wb, excelFileName);
}
