import jsPDF from 'jspdf';

type Column = { key: string; label: string; width: number };

export type PaymentReportSummaryRow = {
  particular: string;
  count: string;
  amount: string;
};

export type PaymentReportExamSummaryRow = {
  exam: string;
  batchBreakdown?: string;
  count: string;
  amount: string;
  lateFee: string;
};

export type PaymentReportSection = {
  sectionTitle?: string;
  branch?: string;
  columns: Column[];
  rows: Array<Record<string, string>>;
  footer: string;
};

export type PaymentReportBranchSection = PaymentReportSection;

export type PaymentReportPdfInput = {
  collegeName: string;
  documentTitle: string;
  periodLabel: string;
  generatedAt: string;
  filters: string[];
  transactionSummaryTitle: string;
  transactionSummary: PaymentReportSummaryRow[];
  examSummaryTitle?: string;
  examSummaryColumns?: Column[];
  examSummary?: PaymentReportExamSummaryRow[] | null;
  detailedSectionTitle?: string;
  sections?: PaymentReportSection[];
  branchSections?: PaymentReportSection[];
  grandTotal: string;
  fileName: string;
};

export function downloadPaymentReportPdf(input: PaymentReportPdfInput) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const footerReserve = 52;
  const xStart = margin;
  const xEnd = pageWidth - margin;
  const contentWidth = xEnd - xStart;
  const lineHeight = 13;
  let y = margin;

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - footerReserve) {
      addPage();
    }
  };

  const hLine = (weight: number, yPos = y) => {
    doc.setLineWidth(weight);
    doc.line(xStart, yPos, xEnd, yPos);
  };

  const drawFooter = (pageNumber: number, pageCount: number) => {
    hLine(0.5, pageHeight - 36);
    doc.setFont('times', 'normal');
    doc.setFontSize(8);
    doc.text(input.documentTitle, xStart, pageHeight - 22);
    doc.text(input.generatedAt, pageWidth / 2, pageHeight - 22, { align: 'center' });
    doc.text(`Page ${pageNumber} of ${pageCount}`, xEnd, pageHeight - 22, { align: 'right' });
  };

  const drawRunningHeader = () => {
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text(input.collegeName.toUpperCase(), xStart, y);
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    doc.text(input.periodLabel, xEnd, y, { align: 'right' });
    y += 10;
    hLine(1);
    y += 18;
  };

  function addPage() {
    doc.addPage();
    y = margin;
    drawRunningHeader();
  }

  const drawCollegeHeader = () => {
    doc.setFont('times', 'bold');
    doc.setFontSize(16);
    doc.text(input.collegeName.toUpperCase(), pageWidth / 2, y + 6, { align: 'center' });
    y += 24;
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    doc.text('Examination Cell', pageWidth / 2, y, { align: 'center' });
    y += 20;
    doc.setFont('times', 'bold');
    doc.setFontSize(12);
    doc.text(input.documentTitle.toUpperCase(), pageWidth / 2, y, { align: 'center' });
    y += 18;
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.text(input.periodLabel, pageWidth / 2, y, { align: 'center' });
    y += 14;
    hLine(1.4);
    y += 4;
    hLine(0.4);
    y += 20;

    doc.setFontSize(9);
    doc.text(`Generated: ${input.generatedAt}`, xStart, y);
    y += 14;
    if (input.filters.length) {
      const filterLine = input.filters.join('   |   ');
      const wrapped = doc.splitTextToSize(filterLine, contentWidth);
      wrapped.forEach((line: string) => {
        doc.text(line, xStart, y);
        y += 14;
      });
    }
    y += 16;
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(40);
    y += 6;
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.text(title.toUpperCase(), xStart, y);
    y += 8;
    hLine(0.7);
    y += 14;
  };

  const drawSimpleTable = (
    columns: Column[],
    rows: Array<Record<string, string>>,
    opts?: { emphasizeLast?: boolean; footer?: string },
  ) => {
    const widthScale = contentWidth / columns.reduce((sum, column) => sum + column.width, 0);
    const cols = columns.map((column) => ({ ...column, width: column.width * widthScale }));

    const renderHeader = () => {
      const headerTop = y;
      const headerHeight = 24;
      ensureSpace(headerHeight + 10);
      hLine(0.8, headerTop);
      let x = xStart;
      doc.setFont('times', 'bold');
      doc.setFontSize(8);
      cols.forEach((column) => {
        doc.rect(x, headerTop, column.width, headerHeight, 'S');
        doc.text(column.label, x + column.width / 2, headerTop + 15, { align: 'center' });
        x += column.width;
      });
      y = headerTop + headerHeight;
      hLine(0.8, y);
    };

    renderHeader();
    doc.setFont('times', 'normal');
    doc.setFontSize(8);

    rows.forEach((row, rowIndex) => {
      const isLast = Boolean(opts?.emphasizeLast && rowIndex === rows.length - 1);
      const wrapped = cols.map((column) =>
        doc.splitTextToSize(String(row[column.key] ?? ''), column.width - 12),
      );
      const maxLines = Math.max(1, ...wrapped.map((lines) => lines.length));
      const rowHeight = maxLines * lineHeight + 12;
      if (y + rowHeight > pageHeight - footerReserve) {
        addPage();
        renderHeader();
      }
      const rowTop = y;
      if (isLast) {
        hLine(0.8, rowTop);
        doc.setFont('times', 'bold');
      } else {
        doc.setFont('times', 'normal');
      }
      doc.setFontSize(8);
      let x = xStart;
      cols.forEach((column, columnIndex) => {
        doc.setLineWidth(0.4);
        doc.rect(x, rowTop, column.width, rowHeight, 'S');
        wrapped[columnIndex].forEach((line: string, lineIndex: number) => {
          const align = columnIndex === 0 ? 'left' : 'center';
          const textX = align === 'left' ? x + 8 : x + column.width / 2;
          doc.text(line, textX, rowTop + 15 + lineIndex * lineHeight, { align });
        });
        x += column.width;
      });
      y = rowTop + rowHeight;
    });

    if (opts?.footer) {
      const footerHeight = 22;
      if (y + footerHeight > pageHeight - footerReserve) {
        addPage();
        renderHeader();
      }
      hLine(0.8, y);
      doc.setLineWidth(0.4);
      doc.rect(xStart, y, contentWidth, footerHeight, 'S');
      doc.setFont('times', 'bold');
      doc.setFontSize(8);
      doc.text(opts.footer, xEnd - 10, y + 14, { align: 'right' });
      y += footerHeight;
      hLine(0.8, y);
    }
    y += 22;
  };

  drawCollegeHeader();

  drawSectionTitle(input.transactionSummaryTitle);
  drawSimpleTable(
    [
      { key: 'particular', label: 'Particulars', width: 280 },
      { key: 'count', label: 'Count', width: 80 },
      { key: 'amount', label: 'Amount (Rs.)', width: 140 },
    ],
    input.transactionSummary.map((row) => ({
      particular: row.particular,
      count: row.count,
      amount: row.amount,
    })),
    { emphasizeLast: true },
  );

  if (input.examSummary && input.examSummary.length) {
    drawSectionTitle(input.examSummaryTitle || 'Exam-wise summary');
    const summaryColumns = input.examSummaryColumns || [
      { key: 'exam', label: 'Examination', width: 200 },
      { key: 'batchBreakdown', label: 'Batch', width: 100 },
      { key: 'count', label: 'Count', width: 45 },
      { key: 'amount', label: 'Amount (Rs.)', width: 75 },
      { key: 'lateFee', label: 'Late fee (Rs.)', width: 75 },
    ];
    drawSimpleTable(
      summaryColumns,
      input.examSummary.map((row) => ({
        exam: row.exam,
        batchBreakdown: row.batchBreakdown || '-',
        count: row.count,
        amount: row.amount,
        lateFee: row.lateFee,
      })),
      { emphasizeLast: true },
    );
  }

  const detailedTitle = input.detailedSectionTitle || 'Detailed statement - batch wise';
  drawSectionTitle(detailedTitle);

  const sections = input.sections || input.branchSections || [];

  if (!sections.length) {
    doc.setFont('times', 'italic');
    doc.setFontSize(10);
    doc.text('No records for the selected filters.', xStart, y);
    y += 20;
  }

  sections.forEach((section) => {
    ensureSpace(72);
    y += 8;
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    const titleText =
      section.sectionTitle ||
      (section.branch ? `Branch: ${section.branch}` : 'Batch: Unassigned');
    doc.text(titleText, xStart, y);
    y += 8;
    hLine(0.6);
    y += 10;
    drawSimpleTable(section.columns, section.rows, { footer: section.footer });
  });

  ensureSpace(36);
  y += 6;
  hLine(0.8);
  y += 16;
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.text(input.grandTotal, xEnd, y, { align: 'right' });
  y += 8;
  hLine(1.2);

  const pageCount = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    drawFooter(pageNumber, pageCount);
  }

  doc.setProperties({
    title: `${input.documentTitle} - ${input.periodLabel}`,
    author: input.collegeName,
  });
  doc.save(input.fileName);
}
