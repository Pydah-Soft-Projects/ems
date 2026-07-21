import { Payment } from '@/types/fee';

function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function moneyPlain(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export type PrintReceiptOptions = {
  collegeName?: string;
  collegePlace?: string;
  signatoryName?: string;
  /** Full public URL encoded into the QR (receipt verification page) */
  verificationUrl?: string;
};

function buildReceiptBlock(
  payment: Payment,
  copyLabel: string,
  options: PrintReceiptOptions,
): string {
  const fr = payment.feeRecord;
  const exam = fr?.exam;
  const paidAt = new Date(payment.paidAt);
  const dateStr = paidAt.toLocaleDateString('en-IN');
  const timeStr = paidAt.toLocaleString('en-IN');

  const collegeName =
    options.collegeName ||
    exam?.college ||
    'Examination Management System';
  const collegePlace = options.collegePlace || '';
  const signer =
    options.signatoryName || payment.collectedBy || 'Authorized';

  const examTitle = exam?.name ?? 'Examination fee';
  const examDetail = exam
    ? `Y${exam.yearOfStudy} / Sem ${exam.semester}${
        fr?.feeBreakdown?.length
          ? ` · ${fr.feeBreakdown.map((b) => b.subjectCode).join(', ')}`
          : ''
      }`
    : 'Exam fee payment';
  const amount = Number(payment.amountPaid);
  const verifyPageUrl =
    options.verificationUrl ||
    `${
      typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:3000'
    }/verify/receipt/${encodeURIComponent(payment.receiptNumber)}${
      payment.verificationToken
        ? `?v=${encodeURIComponent(payment.verificationToken)}`
        : ''
    }`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(verifyPageUrl)}`;

  return `
  <section class="receipt">
    <div class="frame">
      <div class="header">
        <div class="brand">
          <img class="logo" src="/logo.png" alt="EMS" width="36" height="36" />
          <div class="brand-text"><b>EMS PORTAL</b>Examinations</div>
        </div>
        <div class="college">
          <h1>${esc(collegeName)}</h1>
          ${collegePlace ? `<p>${esc(collegePlace)}</p>` : ''}
        </div>
        <div class="doc-type">
          <b>Fee Receipt</b>
          <span>${esc(copyLabel)}</span>
        </div>
      </div>

      <div class="meta">
        <div class="meta-col">
          <span class="lbl">Receipt No.</span>
          <span class="val">${esc(payment.receiptNumber)}</span>
          <span class="lbl">Date</span>
          <span class="val">${esc(dateStr)}</span>
        </div>
        <div class="meta-col">
          <span class="lbl">Student Name</span>
          <span class="val">${esc(fr?.studentName ?? '—')}</span>
          <span class="lbl">PIN / Roll No.</span>
          <span class="val">${esc(fr?.studentRollNumber ?? '—')}</span>
        </div>
        <div class="meta-col">
          <span class="lbl">Course / Branch</span>
          <span class="val">${esc(exam ? `${exam.course} — ${exam.branch}` : '—')}</span>
          <span class="lbl">Batch / Year</span>
          <span class="val">${esc(
            exam ? `${exam.batch} · Y${exam.yearOfStudy}/S${exam.semester}` : '—',
          )}</span>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th class="sno">S.No</th>
            <th>Particulars / Fee Description</th>
            <th class="amt">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="sno">1</td>
            <td>
              <div>${esc(examTitle)}</div>
              <div class="sub">${esc(examDetail)}</div>
            </td>
            <td class="amt">${esc(moneyPlain(amount))}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="text-align:right">TOTAL AMOUNT PAID</td>
            <td class="amt">₹${esc(moneyPlain(amount))}</td>
          </tr>
        </tfoot>
      </table>
      <div class="due">Total outstanding due ₹0</div>

      <div class="bottom">
        <div class="qr">
          <img src="${esc(qrUrl)}" alt="Verify receipt QR" width="56" height="56" />
          <p>Scan to verify</p>
        </div>
        <div class="mid">
          <div><b>Payment Mode</b> ${esc(String(payment.paymentMethod).replace(/_/g, ' '))}</div>
          <div><b>Generated On</b> ${esc(timeStr)}</div>
          <div><b>Verified</b> Officially verified</div>
          ${
            payment.collectedBy
              ? `<div><b>Collected by</b> ${esc(payment.collectedBy)}</div>`
              : ''
          }
        </div>
        <div class="sign">
          <div class="sign-line"></div>
          <div class="name">${esc(signer)}</div>
          <div class="role">Authorized Signatory</div>
        </div>
      </div>

      <div class="note">Note: Please preserve this receipt for future reference.</div>
      <div class="foot">
        <span>Examination fee receipt</span>
        <span>POWERED BY EMS</span>
      </div>
    </div>
  </section>`;
}

function buildPrintDocument(payment: Payment, options: PrintReceiptOptions) {
  const student = buildReceiptBlock(payment, 'Student copy', options);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Fee Receipt — ${esc(payment.receiptNumber)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
  @page {
    size: A4 portrait;
    margin: 0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 210mm;
    height: 297mm;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #0d1b3d;
    font-family: 'Poppins', Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .sheet {
    width: 210mm;
    height: 297mm;
    display: flex;
    flex-direction: column;
    padding: 0;
  }
  /* Top half only — same A5 landscape sizing/position as before */
  .receipt {
    width: 210mm;
    height: 148.5mm;
    padding: 6mm 7mm 5mm;
    overflow: hidden;
    flex-shrink: 0;
    position: relative;
  }
  .frame {
    width: 100%;
    height: 100%;
    border: 1.5px solid #0d1b3d;
    padding: 3mm 4mm;
    display: flex;
    flex-direction: column;
  }
  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 3mm;
    padding-bottom: 1.8mm;
    border-bottom: 1.5px solid #0d1b3d;
  }
  .brand { display: flex; align-items: center; gap: 1.8mm; min-width: 28mm; }
  .logo {
    width: 8mm; height: 8mm;
    object-fit: contain;
    display: block;
  }
  .brand-text { font-size: 6pt; color: #64748b; line-height: 1.2; }
  .brand-text b { display: block; color: #0d1b3d; font-size: 7pt; }
  .college { flex: 1; text-align: center; }
  .college h1 {
    font-size: 11pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.02em; line-height: 1.15;
  }
  .college p { font-size: 6.5pt; color: #64748b; text-transform: uppercase; margin-top: 0.4mm; }
  .doc-type { text-align: right; min-width: 28mm; }
  .doc-type b { display: block; font-size: 10pt; text-transform: uppercase; }
  .doc-type span { font-size: 7pt; color: #64748b; font-weight: 700; }

  .meta {
    margin-top: 1.8mm;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    border: 1px dashed #94a3b8;
    border-radius: 1.2mm;
    padding: 1.6mm 0;
  }
  .meta-col { padding: 0 2.5mm; }
  .meta-col + .meta-col { border-left: 1px dashed #cbd5e1; }
  .meta-col .lbl { display: block; font-size: 6pt; color: #64748b; }
  .meta-col .val {
    display: block; font-size: 7.5pt; font-weight: 700; margin: 0.3mm 0 1mm;
    word-break: break-word;
  }
  .meta-col .val:last-child { margin-bottom: 0; }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1.8mm;
    font-size: 7.5pt;
  }
  th, td { border: 1px solid #0d1b3d; padding: 1.1mm 2mm; vertical-align: top; }
  th { background: #f1f5f9; text-align: left; font-size: 7pt; }
  .sno { width: 11mm; text-align: center; }
  .amt { width: 26mm; text-align: right; white-space: nowrap; }
  .sub { font-size: 6pt; color: #64748b; margin-top: 0.4mm; }
  tfoot td { font-weight: 700; background: #f8fafc; }
  .due { margin-top: 0.8mm; text-align: right; font-size: 6.5pt; color: #64748b; }

  .bottom {
    margin-top: auto;
    padding-top: 1.5mm;
    border-top: 1px solid #cbd5e1;
    display: grid;
    grid-template-columns: 22mm 1fr 34mm;
    gap: 2.5mm;
    align-items: end;
  }
  .qr {
    border: 1px solid #cbd5e1;
    border-radius: 1mm;
    padding: 0.8mm;
    text-align: center;
  }
  .qr img { width: 14mm; height: 14mm; display: block; margin: 0 auto; }
  .qr p { margin-top: 0.6mm; font-size: 5pt; font-weight: 700; text-transform: uppercase; }
  .mid {
    border-left: 1px dashed #cbd5e1;
    border-right: 1px dashed #cbd5e1;
    padding: 0 2.5mm;
    font-size: 6.5pt;
    line-height: 1.4;
  }
  .sign { text-align: center; }
  .sign-line {
    border-bottom: 1px solid #0d1b3d;
    height: 6.5mm;
    margin-bottom: 0.8mm;
  }
  .sign .name {
    font-size: 6.5pt; font-weight: 700; text-transform: uppercase; line-height: 1.15;
  }
  .sign .role { font-size: 5.5pt; color: #64748b; }

  .note {
    margin-top: 1.2mm;
    text-align: center;
    font-size: 6pt;
    font-style: italic;
    color: #64748b;
  }
  .foot {
    margin-top: 0.8mm;
    padding-top: 0.8mm;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    font-size: 5pt;
    color: #94a3b8;
  }

  @media print {
    html, body, .sheet {
      width: 210mm !important;
      height: 297mm !important;
    }
  }
</style>
</head>
<body>
  <div class="sheet">
    ${student}
  </div>
</body>
</html>`;
}

/**
 * Print Student copy on the top half of an A4 page (A5 landscape size/position).
 * Uses a hidden iframe (no blank popup window).
 */
export function printA5Receipt(
  payment: Payment,
  options: PrintReceiptOptions = {},
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const html = buildPrintDocument(payment, options);
  const iframeId = 'ems-a5-receipt-print-frame';

  let iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
  if (iframe) {
    iframe.remove();
  }

  iframe = document.createElement('iframe');
  iframe.id = iframeId;
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument || win?.document;
  if (!win || !doc) {
    alert('Unable to prepare print document. Please try again.');
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    setTimeout(() => {
      const el = document.getElementById(iframeId);
      if (el) el.remove();
    }, 1000);
  };

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      win.focus();
      win.print();
    } catch {
      alert('Print dialog could not be opened. Please try again.');
    } finally {
      cleanup();
    }
  };

  // Wait for images (QR) then print
  const imgs = Array.from(doc.images);
  if (imgs.length === 0) {
    setTimeout(triggerPrint, 250);
    return;
  }

  let left = imgs.length;
  const done = () => {
    left -= 1;
    if (left <= 0) setTimeout(triggerPrint, 200);
  };
  imgs.forEach((img) => {
    if (img.complete) done();
    else {
      img.onload = done;
      img.onerror = done;
    }
  });
  // Safety timeout if images hang
  setTimeout(triggerPrint, 2000);
}
