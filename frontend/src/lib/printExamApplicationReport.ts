import jsPDF from 'jspdf';
import type { ExamApplicationReportResponse } from './api';

export type ExamApplicationReportPdfInput = {
  collegeName?: string;
  reportTitle?: string;
  examName?: string;
  courseFilter?: string;
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
    `Course: ${input.courseFilter || 'All Courses'}`,
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
      { key: 'sno', label: 'S.No', w: 25, align: 'center' },
      { key: 'pin', label: 'Roll Number / PIN', w: 80, align: 'left' },
      { key: 'name', label: 'Student Name', w: 115, align: 'left' },
      { key: 'course', label: 'Course', w: 45, align: 'left' },
      { key: 'batch', label: 'Batch', w: 45, align: 'left' },
      { key: 'branch', label: 'Branch', w: 55, align: 'left' },
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
        course: item.course,
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

function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoneyPlain(amount: number | string | null | undefined) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatDatePlain(d: string | null | undefined) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return String(d);
  }
}

export function buildExamApplicationReportHtml(input: ExamApplicationReportPdfInput): string {
  const collegeName = input.collegeName || 'PYDAH COLLEGE OF ENGINEERING';
  const reportTitle = input.reportTitle || 'EXAM APPLICATION & FEE STATUS REPORT';
  const examName = input.examName || 'All Examinations';
  const generatedAt = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const { summary, breakdown, items } = input.reportData;

  const breakdownRows = (breakdown || []).map((row) => `
    <tr>
      ${!input.examName || input.examName === 'All Examinations' ? `<td>${esc(row.examName || 'N/A')}</td>` : ''}
      <td>${esc(row.course)}</td>
      <td><strong>${esc(row.batch)}</strong></td>
      <td>${esc(row.branch)}</td>
      <td class="text-center font-bold">${row.totalEligible}</td>
      <td class="text-center font-bold" style="color: #4338ca;">${row.totalApplied}</td>
      <td class="text-center font-bold" style="color: #0284c7;">${Math.max(0, row.totalEligible - row.totalApplied)}</td>
      <td class="text-center font-bold" style="color: #15803d;">${row.paidCount}</td>
      <td class="text-center font-bold" style="color: #b91c1c;">${row.notPaidCount}</td>
      <td class="text-center font-bold" style="color: #b45309;">${row.paidWithLateFeeCount}</td>
      <td class="text-right font-bold">${formatMoneyPlain(row.totalAmountCollected)}</td>
    </tr>
  `).join('');

  const studentRows = (items || []).map((item, idx) => {
    let statusBadge = '';
    if (item.status === 'not_applied') {
      statusBadge = '<span class="badge badge-notapplied">NOT APPLIED</span>';
    } else if (item.isPaid) {
      if (item.isPaidLateFee) {
        statusBadge = '<span class="badge badge-late">PAID (LATE)</span>';
      } else {
        statusBadge = '<span class="badge badge-paid">PAID</span>';
      }
    } else {
      statusBadge = '<span class="badge badge-unpaid">UNPAID</span>';
    }

    return `
      <tr>
        <td class="text-center">${idx + 1}</td>
        <td class="font-mono font-bold">${esc(item.studentRollNumber)}</td>
        <td><strong>${esc(item.studentName)}</strong></td>
        <td>${esc(item.course)}</td>
        <td>${esc(item.batch)}</td>
        <td>${esc(item.branch)}</td>
        <td class="text-right">${formatMoneyPlain(item.baseFee)}</td>
        <td class="text-right font-medium" style="color: #b45309;">${item.lateFee > 0 ? formatMoneyPlain(item.lateFee) : '—'}</td>
        <td class="text-right font-bold">${formatMoneyPlain(item.totalAmount)}</td>
        <td class="text-center">${statusBadge}</td>
        <td class="text-center text-muted">${formatDatePlain(item.paidAt || item.submittedAt)}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${esc(reportTitle)} - ${esc(examName)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 10px;
      color: #1e293b;
      line-height: 1.35;
      background: #fff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .header {
      text-align: center;
      margin-bottom: 10px;
      border-bottom: 2px solid #0284c7;
      padding-bottom: 6px;
    }
    .header h1 {
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .header h2 {
      font-size: 10.5px;
      font-weight: 700;
      color: #334155;
      letter-spacing: 1px;
      margin-bottom: 2px;
    }
    .header h3 {
      font-size: 12px;
      font-weight: 700;
      color: #0284c7;
    }
    .meta-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 6px 10px;
      margin-bottom: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 9.5px;
      color: #475569;
    }
    .meta-item strong {
      color: #0f172a;
    }
    .section-title {
      font-size: 10.5px;
      font-weight: 700;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 10px;
      margin-bottom: 6px;
      border-left: 3px solid #0284c7;
      padding-left: 6px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 6px;
      margin-bottom: 12px;
    }
    .metric-card {
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 5px 6px;
      background: #f8fafc;
    }
    .metric-card .label {
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #64748b;
    }
    .metric-card .value {
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 2px;
    }
    .metric-card .sub {
      font-size: 7.5px;
      color: #94a3b8;
      margin-top: 1px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
      margin-bottom: 12px;
    }
    thead {
      display: table-header-group;
    }
    tr {
      page-break-inside: avoid;
    }
    th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      padding: 5px 6px;
      border: 1px solid #cbd5e1;
      text-align: left;
    }
    td {
      padding: 4px 6px;
      border: 1px solid #e2e8f0;
      color: #334155;
    }
    tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    .badge {
      display: inline-block;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 7.5px;
      font-weight: 700;
      text-align: center;
    }
    .badge-paid {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #86efac;
    }
    .badge-late {
      background: #fef3c7;
      color: #b45309;
      border: 1px solid #fde047;
    }
    .badge-unpaid {
      background: #ffe4e6;
      color: #be123c;
      border: 1px solid #fca5a5;
    }
    .badge-notapplied {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #cbd5e1;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-bold { font-weight: 700; }
    .font-medium { font-weight: 500; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .text-muted { color: #64748b; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${esc(collegeName.toUpperCase())}</h1>
    <h2>EXAMINATION CELL</h2>
    <h3>${esc(reportTitle)}</h3>
  </div>

  <div class="meta-box">
    <div class="meta-item"><strong>Examination:</strong> ${esc(examName)}</div>
    <div class="meta-item"><strong>Course:</strong> ${esc(input.courseFilter || 'All Courses')}</div>
    <div class="meta-item"><strong>Batch:</strong> ${esc(input.batchFilter || 'All Batches')}</div>
    <div class="meta-item"><strong>Branch:</strong> ${esc(input.branchFilter || 'All Branches')}</div>
    <div class="meta-item"><strong>Status:</strong> ${esc(input.statusFilter || 'All Statuses')}</div>
    <div class="meta-item" style="margin-left: auto;"><strong>Date:</strong> ${esc(generatedAt)}</div>
  </div>

  <div class="section-title">1. Executive Summary Metrics</div>
  <div class="metrics-grid">
    <div class="metric-card">
      <div class="label">Total Eligible</div>
      <div class="value" style="color: #0369a1;">${summary.totalEligible}</div>
      <div class="sub">In Academic Scope</div>
    </div>
    <div class="metric-card">
      <div class="label">Total Applied</div>
      <div class="value" style="color: #4338ca;">${summary.totalApplied}</div>
      <div class="sub">Applications Received</div>
    </div>
    <div class="metric-card">
      <div class="label">Paid Students</div>
      <div class="value" style="color: #15803d;">${summary.paidCount}</div>
      <div class="sub">Payment Complete</div>
    </div>
    <div class="metric-card">
      <div class="label">Not Paid</div>
      <div class="value" style="color: #be123c;">${summary.notPaidCount}</div>
      <div class="sub">Applied & Pending</div>
    </div>
    <div class="metric-card">
      <div class="label">Paid w/ Late Fee</div>
      <div class="value" style="color: #b45309;">${summary.paidWithLateFeeCount}</div>
      <div class="sub">Late Fee: ${formatMoneyPlain(summary.totalLateFeeCollected)}</div>
    </div>
    <div class="metric-card">
      <div class="label">Total Revenue</div>
      <div class="value" style="color: #0284c7;">${formatMoneyPlain(summary.totalAmountCollected)}</div>
      <div class="sub">Fee Collected</div>
    </div>
  </div>

  <div class="section-title">2. Batch & Branch Breakdown (${(breakdown || []).length})</div>
  <table>
    <thead>
      <tr>
        ${!input.examName || input.examName === 'All Examinations' ? '<th>Exam Name</th>' : ''}
        <th>Course</th>
        <th>Batch</th>
        <th>Branch</th>
        <th class="text-center">Eligible</th>
        <th class="text-center">Applied</th>
        <th class="text-center">Not Applied</th>
        <th class="text-center">Paid</th>
        <th class="text-center">Not Paid</th>
        <th class="text-center">Late Fee</th>
        <th class="text-right">Total Amount</th>
      </tr>
    </thead>
    <tbody>
      ${breakdownRows || '<tr><td colspan="11" class="text-center">No application breakdown records found.</td></tr>'}
    </tbody>
  </table>

  <div class="section-title">3. Student Application & Payment Details (${(items || []).length})</div>
  <table>
    <thead>
      <tr>
        <th class="text-center" style="width: 28px;">#</th>
        <th>Roll Number / PIN</th>
        <th>Student Name</th>
        <th>Course</th>
        <th>Batch</th>
        <th>Branch</th>
        <th class="text-right">Base Fee</th>
        <th class="text-right">Late Fee</th>
        <th class="text-right">Total Fee</th>
        <th class="text-center">Status</th>
        <th class="text-center">Date</th>
      </tr>
    </thead>
    <tbody>
      ${studentRows || '<tr><td colspan="11" class="text-center">No individual student application records found.</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;
}

/**
 * Triggers the browser's native print pop-up dialog directly.
 */
export function printExamApplicationReport(input: ExamApplicationReportPdfInput) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const html = buildExamApplicationReportHtml(input);
  const iframeId = 'ems-exam-report-print-frame';

  const existing = document.getElementById(iframeId);
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = iframeId;
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument || win?.document;
  if (!win || !doc) {
    const popup = window.open('', '_blank', 'width=950,height=750');
    if (popup) {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      setTimeout(() => {
        popup.focus();
        popup.print();
      }, 300);
    }
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    setTimeout(() => {
      const el = document.getElementById(iframeId);
      if (el) el.remove();
    }, 2000);
  };

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      win.focus();
      win.print();
    } catch {
      const popup = window.open('', '_blank', 'width=950,height=750');
      if (popup) {
        popup.document.open();
        popup.document.write(html);
        popup.document.close();
        setTimeout(() => {
          popup.focus();
          popup.print();
        }, 300);
      }
    } finally {
      cleanup();
    }
  };

  setTimeout(triggerPrint, 250);
}

export const printExamApplicationReportPdf = printExamApplicationReport;
