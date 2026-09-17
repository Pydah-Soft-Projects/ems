import jsPDF from 'jspdf';
import type { ExamApplicationReportResponse } from './api';

export type ExamApplicationReportPdfInput = {
  collegeName?: string;
  reportTitle?: string;
  examName?: string;
  batchFilter?: string;
  branchFilter?: string;
  statusFilter?: string;
  reportData: ExamApplicationReportResponse;
};

export function downloadExamApplicationReportPdf(input: ExamApplicationReportPdfInput) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const footerReserve = 40;
  const xStart = margin;
  const xEnd = pageWidth - margin;
  const contentWidth = xEnd - xStart;
  const lineHeight = 12;
  let y = margin;

  const collegeName = input.collegeName || 'PYDAH COLLEGE OF ENGINEERING';
  const reportTitle = input.reportTitle || 'EXAM APPLICATION & FEE STATUS REPORT';
  const examName = input.examName || 'All Examinations';
  const generatedAt = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - footerReserve) {
      addPage();
    }
  };

  const hLine = (weight = 0.5, yPos = y, color = [200, 200, 200]) => {
    doc.setLineWidth(weight);
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.line(xStart, yPos, xEnd, yPos);
  };

  const drawFooter = (pageNumber: number, pageCount: number) => {
    hLine(0.5, pageHeight - 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(reportTitle, xStart, pageHeight - 16);
    doc.text(`Generated: ${generatedAt}`, pageWidth / 2, pageHeight - 16, { align: 'center' });
    doc.text(`Page ${pageNumber} of ${pageCount}`, xEnd, pageHeight - 16, { align: 'right' });
  };

  const drawRunningHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text(collegeName.toUpperCase(), xStart, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(examName, xEnd, y, { align: 'right' });
    y += 8;
    hLine(0.8, y, [51, 65, 85]);
    y += 14;
  };

  function addPage() {
    doc.addPage();
    y = margin;
    drawRunningHeader();
  }

  // Draw Document Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(collegeName.toUpperCase(), pageWidth / 2, y + 4, { align: 'center' });
  y += 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text('EXAMINATION CELL', pageWidth / 2, y, { align: 'center' });
  y += 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(14, 116, 144);
  doc.text(reportTitle, pageWidth / 2, y, { align: 'center' });
  y += 14;

  hLine(1.2, y, [14, 116, 144]);
  y += 12;

  // Metadata Box
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);

  const filtersText = [
    `Examination: ${examName}`,
    `Batch: ${input.batchFilter || 'All Batches'}`,
    `Branch: ${input.branchFilter || 'All Branches'}`,
    `Status Filter: ${input.statusFilter || 'All Statuses'}`,
  ].join('   |   ');

  const wrappedFilters = doc.splitTextToSize(filtersText, contentWidth);
  wrappedFilters.forEach((line: string) => {
    doc.text(line, xStart, y);
    y += 12;
  });
  doc.text(`Report Date: ${generatedAt}`, xStart, y);
  y += 14;

  hLine(0.5, y, [226, 232, 240]);
  y += 14;

  // Summary Metrics Section
  ensureSpace(90);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('1. EXECUTIVE SUMMARY METRICS', xStart, y);
  y += 8;
  hLine(0.8, y, [15, 23, 42]);
  y += 10;

  const { summary } = input.reportData;
  const summaryCols = [
    { label: 'Total Applied', value: String(summary.totalApplied) },
    { label: 'Paid Students', value: String(summary.paidCount) },
    { label: 'Unpaid / Pending', value: String(summary.notPaidCount) },
    { label: 'Paid w/ Late Fee', value: `${summary.paidWithLateFeeCount} (₹${summary.totalLateFeeCollected.toLocaleString('en-IN')})` },
    { label: 'Total Revenue', value: `₹${summary.totalAmountCollected.toLocaleString('en-IN')}` },
  ];

  const colW = contentWidth / summaryCols.length;
  doc.setFillColor(248, 250, 252);
  doc.rect(xStart, y, contentWidth, 36, 'F');
  doc.rect(xStart, y, contentWidth, 36, 'S');

  summaryCols.forEach((sc, idx) => {
    const cx = xStart + idx * colW + colW / 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(sc.label.toUpperCase(), cx, y + 12, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(sc.value, cx, y + 26, { align: 'center' });
  });

  y += 48;

  // Batch & Branch Breakdown Table
  const breakdown = input.reportData.breakdown;
  if (breakdown.length > 0) {
    ensureSpace(80);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('2. BATCH & BRANCH WISE BREAKDOWN', xStart, y);
    y += 8;
    hLine(0.8, y, [15, 23, 42]);
    y += 10;

    const bdCols = [
      { key: 'batch', label: 'Batch', w: 60, align: 'left' },
      { key: 'branch', label: 'Branch', w: 100, align: 'left' },
      { key: 'course', label: 'Course', w: 70, align: 'left' },
      { key: 'totalApplied', label: 'Applied', w: 50, align: 'center' },
      { key: 'paidCount', label: 'Paid', w: 50, align: 'center' },
      { key: 'notPaidCount', label: 'Unpaid', w: 50, align: 'center' },
      { key: 'paidWithLateFeeCount', label: 'Late Fee', w: 50, align: 'center' },
      { key: 'totalAmountCollected', label: 'Amount (₹)', w: 90, align: 'right' },
    ];

    const totalWidth = bdCols.reduce((s, c) => s + c.w, 0);
    const scale = contentWidth / totalWidth;
    const cols = bdCols.map((c) => ({ ...c, w: c.w * scale }));

    // Header
    const rowH = 18;
    doc.setFillColor(241, 245, 249);
    doc.rect(xStart, y, contentWidth, rowH, 'F');
    doc.rect(xStart, y, contentWidth, rowH, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);

    let currX = xStart;
    cols.forEach((c) => {
      const tx = c.align === 'left' ? currX + 6 : c.align === 'right' ? currX + c.w - 6 : currX + c.w / 2;
      doc.text(c.label, tx, y + 12, { align: c.align as 'left' | 'center' | 'right' });
      currX += c.w;
    });
    y += rowH;

    // Body
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    breakdown.forEach((row, rIdx) => {
      ensureSpace(rowH);
      if (rIdx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(xStart, y, contentWidth, rowH, 'F');
      }
      doc.rect(xStart, y, contentWidth, rowH, 'S');
      doc.setTextColor(51, 65, 85);

      let cx = xStart;
      cols.forEach((c) => {
        let val = String(row[c.key as keyof typeof row] ?? '');
        if (c.key === 'totalAmountCollected') {
          val = Number(val || 0).toLocaleString('en-IN');
        }
        const tx = c.align === 'left' ? cx + 6 : c.align === 'right' ? cx + c.w - 6 : cx + c.w / 2;
        doc.text(val, tx, y + 12, { align: c.align as 'left' | 'center' | 'right' });
        cx += c.w;
      });
      y += rowH;
    });

    y += 18;
  }

  // Detailed Applied Students List Table
  const items = input.reportData.items;
  ensureSpace(80);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`3. INDIVIDUAL STUDENT APPLICATION DETAILS (${items.length})`, xStart, y);
  y += 8;
  hLine(0.8, y, [15, 23, 42]);
  y += 10;

  if (items.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('No student application records found matching selected criteria.', xStart, y);
    y += 20;
  } else {
    const stCols = [
      { key: 'sno', label: 'S.No', w: 30, align: 'center' },
      { key: 'pin', label: 'Roll Number / PIN', w: 85, align: 'left' },
      { key: 'name', label: 'Student Name', w: 125, align: 'left' },
      { key: 'batch', label: 'Batch', w: 45, align: 'left' },
      { key: 'branch', label: 'Branch', w: 60, align: 'left' },
      { key: 'amount', label: 'Total (₹)', w: 55, align: 'right' },
      { key: 'status', label: 'Status', w: 65, align: 'center' },
      { key: 'date', label: 'Date', w: 55, align: 'center' },
    ];

    const totalW = stCols.reduce((s, c) => s + c.w, 0);
    const scale = contentWidth / totalW;
    const cols = stCols.map((c) => ({ ...c, w: c.w * scale }));

    const drawHeader = () => {
      const rowH = 18;
      ensureSpace(rowH + 10);
      doc.setFillColor(241, 245, 249);
      doc.rect(xStart, y, contentWidth, rowH, 'F');
      doc.rect(xStart, y, contentWidth, rowH, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);

      let cx = xStart;
      cols.forEach((c) => {
        const tx = c.align === 'left' ? cx + 5 : c.align === 'right' ? cx + c.w - 5 : cx + c.w / 2;
        doc.text(c.label, tx, y + 12, { align: c.align as 'left' | 'center' | 'right' });
        cx += c.w;
      });
      y += rowH;
    };

    drawHeader();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);

    items.forEach((item, idx) => {
      const rowH = 16;
      if (y + rowH > pageHeight - footerReserve) {
        addPage();
        drawHeader();
      }

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(xStart, y, contentWidth, rowH, 'F');
      }
      doc.rect(xStart, y, contentWidth, rowH, 'S');

      const statusStr = item.isPaid
        ? item.isPaidLateFee
          ? 'PAID (LATE)'
          : 'PAID'
        : 'UNPAID';

      if (item.isPaidLateFee) {
        doc.setTextColor(180, 83, 9);
      } else if (item.isPaid) {
        doc.setTextColor(15, 118, 110);
      } else {
        doc.setTextColor(190, 18, 60);
      }

      const dateStr = item.paidAt
        ? new Date(item.paidAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' })
        : item.submittedAt
        ? new Date(item.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' })
        : '—';

      const rowData = {
        sno: String(idx + 1),
        pin: item.studentRollNumber,
        name: item.studentName.length > 24 ? item.studentName.substring(0, 22) + '…' : item.studentName,
        batch: item.batch,
        branch: item.branch,
        amount: Number(item.totalAmount || 0).toLocaleString('en-IN'),
        status: statusStr,
        date: dateStr,
      };

      let cx = xStart;
      cols.forEach((c) => {
        const val = rowData[c.key as keyof typeof rowData];
        const tx = c.align === 'left' ? cx + 5 : c.align === 'right' ? cx + c.w - 5 : cx + c.w / 2;

        if (c.key === 'status') {
          doc.setFont('helvetica', 'bold');
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(51, 65, 85);
        }

        doc.text(val, tx, y + 11, { align: c.align as 'left' | 'center' | 'right' });
        cx += c.w;
      });
      y += rowH;
    });
  }

  // Stamp Page Footers
  const pageCount = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    drawFooter(pageNumber, pageCount);
  }

  doc.setProperties({
    title: `${reportTitle} - ${examName}`,
    author: collegeName,
  });

  doc.save(`exam_application_report_${Date.now()}.pdf`);
}
