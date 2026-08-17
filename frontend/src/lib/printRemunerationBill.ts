import {
  RemunerationBill,
  RemunerationBillType,
} from '@/types/remuneration';

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

function formatDate(value: string | null | undefined) {
  if (!value) return '';
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    const dt = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
    return dt.toLocaleDateString('en-IN');
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
  });
}

const FORM_TITLES: Record<RemunerationBillType, string> = {
  qp_setting: 'Remuneration Bill for Examination Work (QP Setting)',
  lab_project: 'Remuneration Bill for Examination Work (Externals for Lab/Project)',
  evaluation: 'Remuneration Bill for Examination Work (Evaluation)',
  observer: 'Remuneration Bill for Examination Work (Observer)',
  examiner: 'Remuneration Bill for Examination Work (Examiner)',
};

const NAME_LABELS: Record<RemunerationBillType, string> = {
  qp_setting: 'Name of the Question Paper Setter / Examiner',
  lab_project: 'Name of the Lab Examiner',
  evaluation: 'Name of the Evaluator / Examiner',
  observer: 'Name of the Observer',
  examiner: 'Name of the Examiner',
};

const QTY_HEADERS: Record<RemunerationBillType, string> = {
  qp_setting: 'No. of Scripts Valued / QP Sets',
  lab_project: 'No. of Scripts Valued / QPs',
  evaluation: 'No. of Scripts Valued',
  observer: 'No. of Sessions / Days',
  examiner: 'No. of Scripts / Sessions',
};

export type PrintRemunerationOptions = {
  collegeName?: string;
  collegeSubtitle?: string;
  collegeAddress?: string;
  collegeEmail?: string;
  collegeWebsite?: string;
};

function fieldRow(label: string, value: string | null | undefined) {
  return `
    <div class="field">
      <span class="f-label">${esc(label)}</span>
      <span class="f-sep">:</span>
      <span class="f-value">${esc(value || '')}</span>
    </div>`;
}

function buildDocument(
  bill: RemunerationBill,
  options: PrintRemunerationOptions,
) {
  const collegeName =
    options.collegeName || bill.exam?.college || 'Examination Management System';

  const title = FORM_TITLES[bill.billType];
  const nameLabel = NAME_LABELS[bill.billType];
  const qtyHeader = QTY_HEADERS[bill.billType];

  const contact = [bill.contactNumber, bill.email].filter(Boolean).join(' , ');

  const examLine = [
    bill.regulationCode,
    bill.course,
    bill.yearOfStudy != null ? `Year ${bill.yearOfStudy}` : null,
    bill.semester != null ? `Sem ${bill.semester}` : null,
    bill.examName,
  ]
    .filter(Boolean)
    .join(' - ');

  const subjectsLine = (bill.subjects || [])
    .map((s) => (s.code ? `${s.name} (${s.code})` : s.name))
    .join(', ');

  const lines = bill.lineItems || [];
  const rows = lines
    .map((row, i) => {
      const qty = Number(row.quantity) || 0;
      const unit = Number(row.unitPrice) || 0;
      const amount = row.amount ?? qty * unit;
      const qtyDisplay = unit ? `${moneyPlain(qty)} × ${moneyPlain(unit)}` : moneyPlain(qty);
      return `
        <tr>
          <td class="c">${i + 1}</td>
          <td>${esc(row.remunerationFor)}</td>
          <td class="c">${esc(qtyDisplay)}</td>
          <td class="r">${esc(moneyPlain(amount))}</td>
        </tr>`;
    })
    .join('');

  const isLab =
    bill.billType === 'lab_project' ||
    bill.billType === 'observer' ||
    bill.billType === 'examiner';

  const durationBlock =
    isLab && (bill.durationFrom || bill.durationTo || bill.numberOfDays != null)
      ? `
    <div class="field">
      <span class="f-label">Duration</span>
      <span class="f-sep">:</span>
      <span class="f-value">From ${esc(formatDate(bill.durationFrom))} to ${esc(
        formatDate(bill.durationTo),
      )}${bill.numberOfDays != null ? ` &nbsp;·&nbsp; No. of Days: ${esc(bill.numberOfDays)}` : ''}</span>
    </div>`
      : '';

  const academicYearRow = bill.academicYear
    ? fieldRow('Academic Year', bill.academicYear)
    : '';

  const passed = bill.status === 'passed' || bill.status === 'paid';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(bill.billNumber)} — Remuneration Bill</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 210mm;
    min-height: 297mm;
    background: #fff;
    color: #111827;
    font-family: 'Times New Roman', Georgia, serif;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .sheet {
    width: 210mm;
    min-height: 297mm;
    padding: 12mm 14mm 10mm;
    display: flex;
    flex-direction: column;
  }
  .head {
    display: grid;
    grid-template-columns: 20mm 1fr 20mm;
    align-items: center;
    gap: 3mm;
    border-bottom: 2px solid #111827;
    padding-bottom: 2.5mm;
  }
  .head .logo { width: 18mm; height: 18mm; object-fit: contain; }
  .head .mid { text-align: center; }
  .head h1 {
    font-size: 15pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .head .sub { font-size: 8pt; margin-top: 0.6mm; }
  .head .addr { font-size: 8pt; margin-top: 0.6mm; }
  .head .links {
    display: flex; justify-content: space-between;
    font-size: 8pt; margin-top: 1mm; padding: 0 2mm;
  }
  .bill-meta {
    display: flex; justify-content: space-between;
    font-size: 9pt; margin-top: 2.5mm;
  }
  .title {
    text-align: center;
    font-size: 11.5pt;
    font-weight: 700;
    text-decoration: underline;
    margin: 4mm 0 5mm;
  }
  .field {
    display: flex;
    align-items: baseline;
    font-size: 10pt;
    margin-bottom: 2.8mm;
    line-height: 1.35;
  }
  .f-label { min-width: 62mm; flex-shrink: 0; }
  .f-sep { padding: 0 2mm 0 1mm; }
  .f-value {
    flex: 1;
    font-weight: 700;
    border-bottom: 1px dotted #6b7280;
    min-height: 4.5mm;
    word-break: break-word;
  }
  .section-h {
    font-size: 10pt; font-weight: 700; margin: 2mm 0 2.5mm;
    text-decoration: underline;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 3mm;
    font-size: 10pt;
  }
  th, td { border: 1.2px solid #111827; padding: 2mm 2.5mm; }
  th { font-weight: 700; text-align: center; background: #fff; }
  td.c { text-align: center; }
  td.r { text-align: right; }
  tfoot td { font-weight: 700; }
  .certify {
    font-size: 10pt;
    margin-top: 5mm;
  }
  .sign-row {
    display: flex; justify-content: space-between; align-items: flex-end;
    margin-top: 10mm; font-size: 10pt;
  }
  .sign-block { text-align: center; }
  .sign-block .line { border-top: 1px solid #111827; min-width: 42mm; padding-top: 1mm; }
  .office {
    margin-top: 6mm;
    border-top: 1.2px dashed #6b7280;
    padding-top: 3mm;
    font-size: 10pt;
  }
  .office .fu { text-align: center; font-size: 8.5pt; margin-bottom: 2mm; }
  .office .passed {
    display: flex; align-items: baseline; gap: 2mm; margin-bottom: 2mm;
  }
  .office .passed .v {
    flex: 1; font-weight: 700; border-bottom: 1px dotted #6b7280; min-height: 4.5mm;
  }
  .office-signs {
    display: flex; justify-content: space-between; align-items: flex-end;
    margin-top: 14mm; font-size: 8.5pt; text-align: center; gap: 4mm;
  }
  .office-signs > div { flex: 1; }
  .office-signs .line { border-top: 1px solid #111827; padding-top: 1mm; }
  @media print {
    html, body, .sheet { width: 210mm !important; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <img class="logo" src="/logo.png" alt="Logo" />
      <div class="mid">
        <h1>${esc(collegeName)}</h1>
        ${options.collegeSubtitle ? `<p class="sub">${esc(options.collegeSubtitle)}</p>` : ''}
        ${options.collegeAddress ? `<p class="addr">${esc(options.collegeAddress)}</p>` : ''}
      </div>
      <div></div>
    </div>
    ${
      options.collegeEmail || options.collegeWebsite
        ? `<div class="head links" style="border:none;padding:0;display:flex;">
            <span>${options.collegeEmail ? `Email id: ${esc(options.collegeEmail)}` : ''}</span>
            <span>${options.collegeWebsite ? `Website: ${esc(options.collegeWebsite)}` : ''}</span>
          </div>`
        : ''
    }

    <div class="bill-meta">
      <span>Bill No: <b>${esc(bill.billNumber)}</b></span>
      <span>Date: <b>${esc(formatDate(bill.billDate) || formatDate(bill.createdAt))}</b></span>
    </div>

    <p class="title">${esc(title)}</p>

    ${fieldRow(nameLabel, bill.professionalName)}
    ${fieldRow('Designation', bill.designation)}
    ${fieldRow('Name and Address of the Organization', bill.organization)}
    ${fieldRow('Contact Number and Email Id', contact)}
    ${academicYearRow}
    ${fieldRow('Regulation, Name, Year and Semester of the Examination', examLine)}
    ${fieldRow('Name of the Branch', bill.branch)}

    <p class="section-h">Bank Account Details:</p>
    ${fieldRow('Name of the Bank', bill.bankName)}
    ${fieldRow('Name of the Account Holder (As per the Bank)', bill.accountHolderName)}
    ${fieldRow('Account Number', bill.accountNumber)}
    ${fieldRow('IFSC Code', bill.ifscCode)}
    ${fieldRow('Name and Address of the Bank', bill.bankAddress)}

    ${fieldRow('Subject & Full Title of the Paper', subjectsLine)}
    ${durationBlock}

    <table>
      <thead>
        <tr>
          <th style="width:12mm">Sl. No</th>
          <th>Remuneration for</th>
          <th style="width:42mm">${esc(qtyHeader)}</th>
          <th style="width:30mm">Amount (Rs)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" class="r">Grand Total</td>
          <td class="c">${esc(moneyPlain(bill.grandTotalQuantity))}</td>
          <td class="r">${esc(moneyPlain(bill.grandTotalAmount))}</td>
        </tr>
      </tfoot>
    </table>

    <p class="certify">
      I certify that the work assigned is completed and this bill is not claimed
      earlier from any source.
    </p>

    <div class="sign-row">
      <span>Date: ${esc(formatDate(bill.billDate) || '')}</span>
      <div class="sign-block">
        <div class="line">Signature of Recipient</div>
      </div>
    </div>

    <div class="office">
      <p class="fu">(For Office use only)</p>
      <div class="passed">
        <span>This bill is passed for Rs.</span>
        <span class="v">${
          passed
            ? `${esc(moneyPlain(bill.grandTotalAmount))} /- &nbsp; (${esc(bill.amountInWords || '')})`
            : ''
        }</span>
      </div>
      <div class="passed">
        <span>Date:</span>
        <span class="v" style="max-width:50mm"></span>
      </div>
      <div class="office-signs">
        <div><div class="line">Office Asst.</div></div>
        <div><div class="line">Addl. Controller of Examinations (UG)</div></div>
        <div><div class="line">Controller of Examinations</div></div>
        <div><div class="line">Chief Superintendent / Principal</div></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/** Print the remuneration bill in the physical form layout via hidden iframe. */
export function printRemunerationBill(
  bill: RemunerationBill,
  options: PrintRemunerationOptions = {},
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const html = buildDocument(bill, options);
  const iframeId = 'ems-remuneration-print-frame';

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
  setTimeout(triggerPrint, 2000);
}
